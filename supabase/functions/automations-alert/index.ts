// supabase/functions/automations-alert/index.ts
// Alerta diaria por Slack de automatizaciones con problemas. La llama pg_cron 1×/día.
//
// Lee automations_health() (la misma fuente del panel de Administración), junta las
// que están en ERROR (y opcionalmente en ALERTA), y manda UN solo mensaje a Slack con
// el motivo real de cada una. Si no hay nada roto, no manda nada (no hace ruido).
//
// Modos (query params):
//   ?dry=true    → arma el mensaje y lo DEVUELVE en la respuesta, sin postear a Slack (para probar).
//   ?force=true  → postea aunque ya se haya enviado hoy.
//   (default)    → postea solo si hay problemas y no se envió hoy.
//
// Config editable desde el panel en app_settings.automations_alert_config:
//   { "enabled": true, "slack_channel": "#alertas-general", "include_warn": true, "panel_url": "" }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function str(v: unknown) { return v === null || v === undefined ? "" : String(v).trim(); }

const RUNTIME_TAG: Record<string, string> = {
  local: "💻 tu compu", claude: "✨ Claude", supabase: "⚙️ Supabase", external: "🔌 servicio externo",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
  } catch { return "—"; }
}

// Motivo legible — espejo de la lógica del panel, pero con detalle útil para Slack.
function reasonFor(n: Record<string, unknown>): string {
  const health = str(n.health), source = str(n.source), runtime = str(n.runtime);
  const stale = n.data_stale === true, failed = Number(n.failed_7d) || 0;
  if (health === "error") {
    if (source === "cloud" && stale) {
      const base = `Sin datos nuevos desde el ${fmtDate(n.last_data as string)} — parece detenida.`;
      return runtime === "local" ? `${base} Corre en tu compu (¿se venció la sesión?).` : base;
    }
    if (source === "cron" && failed > 0) return `Falla al ejecutarse (${failed} fallos en los últimos 7 días).`;
    return "Está fallando.";
  }
  if (health === "warn") {
    if (stale) return `Corre, pero no está actualizando los datos (último: ${fmtDate(n.last_data as string)}).`;
    if (failed > 0) return `Tuvo ${failed} fallos esta semana.`;
    return "Necesita una revisión.";
  }
  return "";
}

async function postSlack(token: string, channel: string, text: string) {
  const r = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel, text, unfurl_links: false }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j?.ok) throw new Error("slack: " + JSON.stringify(j));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "true";
  const force = url.searchParams.get("force") === "true";

  // Config (con defaults).
  const { data: cfgRow } = await supabase.from("app_settings").select("value").eq("key", "automations_alert_config").maybeSingle();
  const cfg = ((cfgRow?.value as Record<string, unknown>) ?? {});
  const enabled = cfg.enabled !== false;
  const channel = str(cfg.slack_channel) || "#alertas-general";
  const includeWarn = cfg.include_warn !== false;
  const panelUrl = str(cfg.panel_url);

  if (!enabled && !dry && !force) return Response.json({ skipped: "deshabilitado" });

  // Estado de salud (misma fuente que el panel).
  const { data: items, error } = await supabase.rpc("automations_health");
  if (error) { console.error("automations-alert: rpc error", error); return new Response("err", { status: 500 }); }
  const list = (Array.isArray(items) ? items : []) as Record<string, unknown>[];

  const problems = list
    .filter((i) => str(i.health) === "error" || (includeWarn && str(i.health) === "warn"))
    .sort((a, b) => (str(a.health) === "error" ? 0 : 1) - (str(b.health) === "error" ? 0 : 1));

  if (problems.length === 0) {
    if (dry) return Response.json({ message: null, note: "Todo en orden — no se enviaría nada." });
    return Response.json({ ok: true, note: "Sin problemas, no se envía." });
  }

  // Anti-spam: 1 envío por día (salvo dry/force).
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }); // YYYY-MM-DD
  if (!dry && !force) {
    const { data: stRow } = await supabase.from("app_settings").select("value").eq("key", "automations_alert_state").maybeSingle();
    if (str((stRow?.value as Record<string, unknown>)?.last_sent_date) === today) {
      return Response.json({ ok: true, note: "Ya se envió hoy." });
    }
  }

  // Armado del mensaje (1 solo mensaje).
  const errs = problems.filter((p) => str(p.health) === "error");
  const warns = problems.filter((p) => str(p.health) === "warn");
  const head = `:rotating_light: *Automatizaciones con problemas* — ${fmtDate(new Date().toISOString())}`;
  const sub = `${errs.length} con error${warns.length ? ` · ${warns.length} con alerta` : ""}`;

  const lines = problems.map((p) => {
    const emoji = str(p.health) === "error" ? ":red_circle:" : ":large_yellow_circle:";
    const tag = RUNTIME_TAG[str(p.runtime)] || str(p.runtime);
    return `${emoji} *${str(p.name)}*  ·  ${str(p.category)}  ·  ${tag}\n        ↳ ${reasonFor(p)}`;
  });

  const foot = panelUrl
    ? `<${panelUrl.replace(/\/$/, "")}/admin/automatizaciones|Ver detalle en el panel →>`
    : "Revisalo en el panel: *Administración › Automatizaciones*";

  const text = [head, sub, "", ...lines, "", foot].join("\n");

  if (dry) return Response.json({ channel, text });

  // Token del bot (mismo bot que onboarding/mercury).
  const { data: vf } = await supabase.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  const botToken = str((vf?.value as Record<string, unknown>)?.slack_bot_token);
  if (!botToken) return new Response("sin slack_bot_token", { status: 500 });

  try {
    await postSlack(botToken, channel, text);
  } catch (e) {
    console.error("automations-alert:", e);
    return new Response("slack error", { status: 502 });
  }

  await supabase.from("app_settings").upsert({ key: "automations_alert_state", value: { last_sent_date: today } }, { onConflict: "key" });
  return Response.json({ sent: true, count: problems.length });
});
