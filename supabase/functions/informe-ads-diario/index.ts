// supabase/functions/informe-ads-diario/index.ts
// Informe diario de Meta Ads a Slack, leyendo el TOKEN PROPIO (meta_ad_insights),
// NO el conector MCP. Reemplaza al agente de la nube que solo alcanzaba 2 de 19 cuentas.
//
// De dónde sale cada cosa:
//   - Gasto de ayer  -> meta_ad_insights (time_window='yesterday'), que llena meta-ads-sync
//                       con el cron `meta-ads-sync-ayer` a las 10:50 UTC (07:50 BUE).
//   - Moneda         -> clients.meta_ads[].currency (meta_ad_insights no guarda moneda).
//   - Cuentas fallidas -> api_usage.meta.errors de la ultima corrida.
//
// Cuentas: se convierte todo a USD con el tipo de cambio de la config y se suma el
// impuesto. Una moneda sin tipo de cambio configurado NO se inventa: se reporta aparte.
// Una cuenta que Meta rechazo tampoco se da por $0: va en su propia seccion.
//
// Modos (query params):
//   ?dry=true  -> devuelve el mensaje en la respuesta, sin postear a Slack.
//   (default)  -> postea a Slack.
//
// Auth: x-cron-secret (igual que meta-ads-sync), exigido también en dry porque el
// informe expone el gasto de todos los clientes y la función es pública.
//
// Config editable en app_settings.informe_ads_config:
//   { "enabled": true, "slack_channel": "#informe-diario-adds",
//     "tax_pct": 7.625, "tax_applies_to": "all" | "USD",
//     "fx": { "USD": 1, "EUR": 1.08 }, "cron_secret": "..." }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function str(v: unknown) { return v === null || v === undefined ? "" : String(v).trim(); }
function num(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
const TZ = "America/Argentina/Buenos_Aires";

// Fecha de BUE en YYYY-MM-DD, con desplazamiento opcional en días.
function bueDate(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86400000);
  return now.toLocaleDateString("en-CA", { timeZone: TZ });
}
// "Dom 26-Jul-2026"
function bueLabel(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const p = new Intl.DateTimeFormat("es-AR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    .formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {} as Record<string, string>);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/\.$/, "");
  return `${cap(p.weekday || "")} ${p.day}-${cap(p.month || "")}-${p.year}`;
}
function money(n: number): string {
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// El título sale de la FOTO, no del reloj: si la sincronización no corrió hoy, el
// encabezado tiene que decir el día que realmente se está informando, no "ayer".
function isoPrevDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function isoLabel(iso: string): string {
  const p = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    .formatToParts(new Date(`${iso}T12:00:00Z`)).reduce((a, x) => (a[x.type] = x.value, a), {} as Record<string, string>);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/\.$/, "");
  return `${cap(p.weekday || "")} ${p.day}-${cap(p.month || "")}-${p.year}`;
}

async function postSlack(token: string, channel: string, text: string, blocks?: unknown[]) {
  const r = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel, text, blocks, unfurl_links: false }),
    signal: AbortSignal.timeout(15000),
  });
  const b = await r.json().catch(() => ({}));
  if (!b?.ok) throw new Error("slack: " + JSON.stringify(b));
}

const intMil = (n: number) => Math.round(n).toLocaleString("es-AR");
const pctTxt = (n: number) => String(n.toFixed(1)).replace(".", ",") + "%";

interface Row { name: string; usd: number; leads: number; impressions: number; clicks: number; visitas: number; }

// Un bloque por cliente, con todas las métricas etiquetadas (se lee en el celular sin
// depender del alineado monoespaciado). Números derivados de los totales del cliente:
//   CTR = clicks/impresiones · CPM = gasto/impresiones·1000
//   % carga = visitas/clicks (de los que clickearon, cuántos cargaron la landing)
//   % registro = leads/visitas (de los que cargaron, cuántos se registraron)
// Visitas/carga/registro caen a "—" hasta que la sincronización empiece a traer visitas.
function bloqueCliente(r: Row): string {
  const ctr = r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0;
  const cpm = r.impressions > 0 ? (r.usd / r.impressions) * 1000 : 0;
  const carga = r.clicks > 0 && r.visitas > 0 ? (r.visitas / r.clicks) * 100 : null;
  const registro = r.visitas > 0 ? (r.leads / r.visitas) * 100 : null;
  const vis = r.visitas > 0 ? intMil(r.visitas) : "—";
  const leadsTxt = r.leads > 0 ? intMil(r.leads) : "—";
  const cplTxt = r.leads > 0 ? money(r.usd / r.leads) : "—";
  const l2 = `Clicks ${intMil(r.clicks)} · Visitas ${vis} · Leads ${leadsTxt} · CPL ${cplTxt}`;
  const l3 = `CTR ${pctTxt(ctr)} · CPM ${money(cpm)} · % carga ${carga === null ? "—" : pctTxt(carga)} · % registro ${registro === null ? "—" : pctTxt(registro)}`;
  return `*${r.name}* — *${money(r.usd)}*\n${l2}\n${l3}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "true";

  const { data: cfgRow } = await supabase.from("app_settings").select("value").eq("key", "informe_ads_config").maybeSingle();
  const cfg = (cfgRow?.value as Record<string, unknown>) ?? {};
  const enabled = cfg.enabled !== false;
  const channel = str(cfg.slack_channel) || "#informe-diario-adds";
  const taxPct = cfg.tax_pct === undefined ? 7.625 : num(cfg.tax_pct);
  const taxAppliesTo = str(cfg.tax_applies_to) || "all";
  const fx = (cfg.fx as Record<string, number>) ?? { USD: 1, EUR: 1.08 };
  const cronSecret = str(cfg.cron_secret);

  // El secreto se exige SIEMPRE, también en dry: el informe expone el gasto de todos
  // los clientes y la función es pública (verify_jwt=false, la llama el cron).
  const got = req.headers.get("x-cron-secret") || "";
  if (!cronSecret || got !== cronSecret) return j({ ok: false, error: "unauthorized" }, 401);
  if (!enabled && !dry) return j({ ok: true, skipped: "deshabilitado" });

  // Cuentas que Korex NO corre y no deben contar (ej. la 2ª de Mónica). Fuente ÚNICA y
  // robusta: meta_ads_sync_config.exclude_accounts. Un flag dentro de clients.meta_ads lo
  // pisaba el sync / el editor de clientes; esta lista solo la toca este feature.
  const { data: syncCfgRow } = await supabase.from("app_settings").select("value").eq("key", "meta_ads_sync_config").maybeSingle();
  const excludeAccounts = new Set(
    (((syncCfgRow?.value as Record<string, unknown>)?.exclude_accounts as unknown[]) ?? []).map((x) => str(x).replace(/^act_/, "")),
  );

  // Universo del informe: clientes activos CON al menos una cuenta de anuncios real.
  // Los que no tienen ninguna (o solo cuentas 'interna') no hacen publicidad y no se
  // nombran: listarlos era ruido — el mensaje viejo arrastraba hasta "Prueba Onboarding".
  const { data: clients } = await supabase.from("clients").select("id, name, meta_ads, status").eq("status", "active");
  const curByAcc = new Map<string, string>();
  const nameById = new Map<string, string>();
  const conCuenta: { id: string; name: string }[] = [];
  for (const c of clients ?? []) {
    const accs = Array.isArray(c.meta_ads) ? c.meta_ads : [];
    // Solo se trackean las cuentas CURADAS en el DEL (sección de enlaces): las que tienen
    // use_token=true. Matías 2026-07-30: "no tomes todas las cuentas de Meta, solo las del
    // DEL de cada cliente". Un cliente sin ninguna cuenta marcada no aparece (hay que
    // cargarla en su DEL). Igual se descartan interna / managed_by='cliente' / ignore / excluidas.
    const real = accs.filter((a: Record<string, unknown>) =>
      a.use_token === true &&
      str(a.status) !== "interna" && str(a.managed_by) !== "cliente" && a.ignore !== true &&
      !excludeAccounts.has(str(a.account_id).replace(/^act_/, "")));
    if (!real.length) continue;
    nameById.set(String(c.id), str(c.name));
    conCuenta.push({ id: String(c.id), name: str(c.name) });
    for (const a of real) {
      const id = str((a as Record<string, unknown>).account_id).replace(/^act_/, "");
      if (id) curByAcc.set(id, str((a as Record<string, unknown>).currency) || "USD");
    }
  }

  // Última foto disponible de "ayer".
  const { data: lastSnap } = await supabase
    .from("meta_ad_insights").select("snapshot_date")
    .eq("time_window", "yesterday").order("snapshot_date", { ascending: false }).limit(1).maybeSingle();
  const snap = str(lastSnap?.snapshot_date);
  const hoy = bueDate(0);

  const { data: rows } = snap
    ? await supabase.from("meta_ad_insights")
        .select("client_id, ad_account_id, spend, leads, impressions, clicks, landing_page_views")
        .eq("time_window", "yesterday").eq("snapshot_date", snap)
    : { data: [] as Record<string, unknown>[] };

  // Agregado por cliente, convertido a USD.
  const conGasto = new Map<string, Row>();
  const sinTipoCambio = new Map<string, Set<string>>(); // moneda -> clientes
  for (const r of rows ?? []) {
    const cid = str(r.client_id);
    const nombre = nameById.get(cid);
    if (!nombre) continue; // cliente inactivo, borrado o sin cuenta real
    const spend = num(r.spend);
    if (spend <= 0) continue;
    // Filas de cuentas excluidas (interna / managed_by='cliente') que hayan quedado
    // en snapshots viejos: no se suman.
    if (!curByAcc.has(str(r.ad_account_id))) continue;
    const cur = curByAcc.get(str(r.ad_account_id)) || "USD";
    const rate = fx[cur];
    if (!Number.isFinite(rate)) {
      const set = sinTipoCambio.get(cur) ?? new Set<string>();
      set.add(nombre); sinTipoCambio.set(cur, set);
      continue;
    }
    const prev = conGasto.get(cid) ?? { name: nombre, usd: 0, leads: 0, impressions: 0, clicks: 0, visitas: 0 };
    prev.usd += spend * rate * (taxAppliesTo === "all" || cur === "USD" ? 1 + taxPct / 100 : 1);
    prev.leads += num(r.leads);
    prev.impressions += num(r.impressions);
    prev.clicks += num(r.clicks);
    prev.visitas += num(r.landing_page_views);
    conGasto.set(cid, prev);
  }

  // Cuentas que Meta NO nos dejo leer en la ultima corrida (permisos, cuenta caida).
  // Sin esto caerian en "sin gasto", que es mentira: nunca supimos cuanto gastaron.
  const { data: lastRun } = await supabase
    .from("api_usage").select("meta")
    .eq("fn", "meta-ads-sync").order("created_at", { ascending: false }).limit(20);
  const runErrs = (lastRun ?? []).find((r) => (r.meta as Record<string, unknown>)?.window === "yesterday");
  const noMedible = new Set<string>(
    (((runErrs?.meta as Record<string, unknown>)?.errors as { client?: string }[]) ?? [])
      .map((e) => str(e?.client)).filter(Boolean),
  );

  // Clientes con cuenta cargada que no gastaron nada ayer (y que sí pudimos consultar).
  const sinGasto = conCuenta
    .filter((c) => !conGasto.has(c.id) && !noMedible.has(c.name))
    .map((c) => c.name);

  const lista = [...conGasto.values()].sort((a, b) => b.usd - a.usd);
  const total = lista.reduce((s, r) => s + r.usd, 0);
  const totalLeads = lista.reduce((s, r) => s + r.leads, 0);
  const totalVisitas = lista.reduce((s, r) => s + r.visitas, 0);

  // ── Mensaje visual (Block Kit): encabezado + tabla monoespaciada + pies compactos.
  const fechaLabel = snap ? isoLabel(isoPrevDay(snap)) : bueLabel(-1);
  const sub = `USD +${String(taxPct).replace(".", ",")}% impuesto · ${Object.entries(fx).filter(([k]) => k !== "USD").map(([k, v]) => `${k}→USD ${String(v).replace(".", ",")}`).join(" · ")} · monto final único por cliente`;

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: `📊 Meta Ads — ${fechaLabel}`, emoji: true } },
    { type: "context", elements: [{ type: "mrkdwn", text: sub }] },
  ];
  const partes: string[] = [`:bar_chart: *Informe Meta Ads — ${fechaLabel}*`, sub, ""]; // fallback texto plano (notificaciones)

  if (!snap) {
    const aviso = ":warning: *No hay datos de ayer todavía.* La sincronización por token (`meta-ads-sync-ayer`, 07:50 BUE) no dejó ninguna fila.";
    blocks.push({ type: "section", text: { type: "mrkdwn", text: aviso } });
    partes.push(aviso);
  } else {
    if (snap !== hoy) {
      const aviso = `:warning: Datos del ${snap}, no de hoy — la sincronización no corrió esta mañana.`;
      blocks.push({ type: "section", text: { type: "mrkdwn", text: aviso } });
      partes.push(aviso);
    }
    if (!lista.length) {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: "Ningún cliente gastó ayer." } });
      partes.push("Ningún cliente gastó ayer.");
    } else {
      const cpl = totalLeads > 0 ? total / totalLeads : 0;
      const resumen = `*Total: ${money(total)}*`
        + (totalLeads > 0 ? `  ·  ${intMil(totalLeads)} leads  ·  CPL ${money(cpl)}` : "  ·  sin leads")
        + (totalVisitas > 0 ? `  ·  ${intMil(totalVisitas)} visitas` : "");
      blocks.push({ type: "section", text: { type: "mrkdwn", text: resumen } });
      partes.push(resumen, "");
      // Un section por cliente (evita el límite de 3000 chars de un solo bloque de Slack).
      for (const r of lista) {
        const bloque = bloqueCliente(r);
        blocks.push({ type: "section", text: { type: "mrkdwn", text: bloque } });
        partes.push(bloque, "");
      }
      // Primer día tras el deploy: la sync todavía no trajo visitas. Se avisa una vez.
      if (totalVisitas === 0) {
        const nota = "_Las Visitas (y % carga / % registro) se empiezan a medir desde la próxima sincronización de la mañana._";
        blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: nota }] });
        partes.push(nota);
      }
    }
  }

  const pies: string[] = [];
  if (sinGasto.length) pies.push(`:black_circle: *Sin gasto ayer:* ${sinGasto.sort().join(" · ")}`);
  if (noMedible.size) pies.push(`:red_circle: *No se pudo medir* (Meta rechazó la consulta): ${[...noMedible].sort().join(" · ")}`);
  for (const [cur, set] of sinTipoCambio) {
    pies.push(`:warning: *En ${cur}, sin tipo de cambio configurado* (fuera del total): ${[...set].sort().join(" · ")}`);
  }
  if (pies.length) {
    blocks.push({ type: "divider" });
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: pies.join("\n") }] });
    partes.push("", ...pies);
  }

  const text = partes.join("\n");
  if (dry) return j({ channel, text, blocks, clientes_con_gasto: lista.length, total_usd: Number(total.toFixed(2)), snapshot: snap });

  const { data: vf } = await supabase.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  const botToken = str((vf?.value as Record<string, unknown>)?.slack_bot_token);
  if (!botToken) return j({ ok: false, error: "sin slack_bot_token" }, 500);

  try { await postSlack(botToken, channel, text, blocks); }
  catch (e) { console.error("informe-ads-diario:", e); return j({ ok: false, error: String(e) }, 502); }

  return j({ ok: true, sent: true, clientes_con_gasto: lista.length, total_usd: Number(total.toFixed(2)) });
});
