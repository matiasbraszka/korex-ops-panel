// supabase/functions/meta-ads-sync/index.ts
// Extrae métricas de anuncios de Meta POR TOKEN (Graph API). Desde que el informe diario
// dejó de usar el conector MCP, esta es la ÚNICA fuente de datos de publicidad.
//   A) Rollup por cuenta -> clients.meta_metrics
//   B) Detalle por anuncio -> meta_ad_insights
// REGLA CRÍTICA: cuidar el token. ~2 llamadas por cuenta (insights + estado/país/baneos); secuencial + sleep;
// lee headers de uso de Meta y aborta si está alto; backoff ante throttle; cada corrida se loguea en api_usage.
// Las cuentas que Meta rechaza se guardan en api_usage.meta.errors para que el informe
// las liste como "no se pudo medir" en vez de mostrarlas como $0.
// Auth: usuario logueado (botón) O x-cron-secret (cron). Token: fbcrm_settings.meta_user_token o META_ADS_TOKEN.
// Auto-contenida (sin _shared) para deploy directo por MCP.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v21.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const THROTTLE_CODES = new Set([4, 17, 32, 341, 613, 80000, 80003, 80004, 80014]);

// Códigos ISO de país -> nombre en español (segmentación geográfica del anuncio).
const REGION_NAMES = new Intl.DisplayNames(["es"], { type: "region" });
function countryLabel(codes: string[]): string {
  if (!Array.isArray(codes) || !codes.length) return "";
  const names = codes.map((c) => { try { return REGION_NAMES.of(String(c)) || String(c); } catch { return String(c); } });
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

async function authedUser(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !ANON_KEY || token === ANON_KEY) return false;
  try {
    const uc = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data } = await uc.auth.getUser();
    return !!data?.user;
  } catch { return false; }
}

async function getToken(): Promise<string> {
  const { data } = await supabase.from("fbcrm_settings").select("value").eq("key", "meta_user_token").maybeSingle();
  const t = (data?.value as Record<string, unknown> | null)?.token;
  if (t) return String(t);
  return Deno.env.get("META_ADS_TOKEN") || "";
}

function usageFromHeaders(res: Response): number {
  let maxPct = 0;
  try {
    const acc = res.headers.get("x-ad-account-usage");
    if (acc) { const o = JSON.parse(acc); maxPct = Math.max(maxPct, num(o.acc_id_util_pct)); }
  } catch { /* ignore */ }
  for (const h of ["x-business-use-case-usage", "x-app-usage"]) {
    try {
      const raw = res.headers.get(h);
      if (!raw) continue;
      const o = JSON.parse(raw);
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") {
          const r = v as Record<string, unknown>;
          for (const k of ["call_count", "total_cputime", "total_time"]) if (k in r) maxPct = Math.max(maxPct, num(r[k]));
          Object.values(r).forEach(walk);
        }
      };
      walk(o);
    } catch { /* ignore */ }
  }
  return maxPct;
}

interface GraphResult { data: any[]; usagePct: number; }

async function graphGet(url: string, throttleMs: number): Promise<GraphResult> {
  const out: any[] = [];
  let next = url;
  let guard = 0;
  let usagePct = 0;
  while (next && guard < 10) {
    let res: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      res = await fetch(next);
      usagePct = Math.max(usagePct, usageFromHeaders(res));
      if (res.ok) break;
      let code = 0;
      try { const eb = await res.clone().json(); code = num(eb?.error?.code); } catch { /* ignore */ }
      const throttled = res.status === 429 || THROTTLE_CODES.has(code);
      if (!throttled) {
        let msg = `http ${res.status}`;
        try { const eb = await res.clone().json(); msg = eb?.error?.message || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (attempt < 3) await sleep(throttleMs * attempt + Math.floor(200 + throttleMs * 0.5));
    }
    if (!res || !res.ok) throw new Error("meta_throttled");
    const jbody = await res.json();
    if (jbody.error) throw new Error(jbody.error.message);
    out.push(...(jbody.data || []));
    next = jbody.paging?.next || "";
    guard++;
  }
  return { data: out, usagePct };
}

function actionVal(arr: any[] | undefined, types: string[]): number {
  if (!Array.isArray(arr)) return 0;
  let total = 0;
  for (const a of arr) if (types.includes(String(a?.action_type))) total += num(a?.value);
  return total;
}
// Leads SIN doble conteo: Meta reporta el mismo lead en varios buckets. NUNCA se suman. Con evento custom
// (ej. visita-thankyou) usa la conversión custom del pixel; si no, el 'lead' unificado (o el mayor bucket).
function pickLeads(actions: any[] | undefined, convEvent: string): number {
  const custom = actionVal(actions, ["offsite_conversion.fb_pixel_custom"]);
  if (convEvent && custom > 0) return custom;
  const buckets = [
    actionVal(actions, ["lead"]),
    actionVal(actions, ["offsite_conversion.fb_pixel_lead"]),
    actionVal(actions, ["onsite_web_lead"]),
    actionVal(actions, ["leadgen_grouped"]),
    actionVal(actions, ["onsite_conversion.lead_grouped"]),
  ];
  const std = Math.max(0, ...buckets);
  return std > 0 ? std : custom;
}
// Leads del FORMULARIO nativo de Meta (campañas de "clientes potenciales"): se completan
// dentro de la app, así que NUNCA generan visitas a una landing. Son los dos buckets de
// leadgen; se toma el mayor, nunca la suma (Meta reporta el mismo lead en los dos).
function pickLeadsForm(actions: any[] | undefined): number {
  return Math.max(
    actionVal(actions, ["onsite_conversion.lead_grouped"]),
    actionVal(actions, ["leadgen_grouped"]),
    actionVal(actions, ["leadgen.other"]),
  );
}
// Eventos custom del píxel. Meta los reporta con el NOMBRE pegado al action_type:
//   offsite_conversion.fb_pixel_custom.visita-pagina-vsl-madeleine
// y ADEMÁS publica un agregado `offsite_conversion.fb_pixel_custom` que SUMA todos los
// eventos custom de la cuenta. Usar el agregado sobrecontaba feo: la campaña de Madeleine
// daba 18 registros cuando el evento real eran ~12. NUNCA usar el agregado si hay eventos
// con nombre. (Algunas cuentas los publican como `offsite_conversion.custom.<id>`.)
const CUSTOM_PREFIXES = ["offsite_conversion.fb_pixel_custom.", "offsite_conversion.custom."];
function customEvents(actions: any[] | undefined): { event: string; value: number }[] {
  if (!Array.isArray(actions)) return [];
  const out: { event: string; value: number }[] = [];
  for (const a of actions) {
    const t = String(a?.action_type || "");
    const pref = CUSTOM_PREFIXES.find((p) => t.startsWith(p));
    if (!pref) continue;
    const v = num(a?.value);
    if (v > 0) out.push({ event: t.slice(pref.length), value: v });
  }
  return out.sort((x, y) => y.value - x.value);
}
// Registro en la PÁGINA WEB del cliente. Se detecta solo: se toma el evento custom del
// píxel al que apunta el anuncio. Si el cliente tiene uno cargado en el panel y aparece,
// gana ese; si no, el de mayor volumen — que es al que la campaña está optimizada.
// No depender del campo cargado a mano importa: Antonio lo tenía como "Leads (form)", que
// no es un evento del píxel, y corre campañas de los dos tipos con eventos distintos.
// Eventos que NO son un registro: los que miden la VISITA a la prelanding / pre-registro,
// o sea el paso ANTERIOR al alta. Matias 2026-08-01: "no uses visitas-prelanding".
// Ajustable sin tocar codigo en meta_ads_sync_config.web_event_exclude (coincidencia por
// substring, sin distinguir mayusculas).
const WEB_EVENT_EXCLUDE = ["prelanding", "pre-landing", "preregistro", "pre-registro"];
function esEventoDeVisita(nombre: string, extra: string[]): boolean {
  const n = nombre.toLowerCase();
  return [...WEB_EVENT_EXCLUDE, ...extra].some((p) => p && n.includes(p.toLowerCase()));
}
function pickWeb(conversions: any[] | undefined, actions: any[] | undefined, convEvent: string, excluir: string[] = []): { value: number; event: string } {
  // El nombre del evento SOLO viene en `conversions`. En `actions` Meta publica nada mas
  // el agregado `offsite_conversion.fb_pixel_custom`, que suma todos los eventos custom
  // de la cuenta — usarlo daba 18 donde el evento de registro eran 12.
  const todos = customEvents(conversions).length ? customEvents(conversions) : customEvents(actions);
  // El evento principal cargado en la ficha del cliente MANDA sobre la heurística: si está
  // en los datos, se usa aunque el nombre parezca de visita. Corina registra con
  // `completo-registro-travorium-preregistro`, que es un alta de verdad pese a decir
  // "preregistro" — sin esta precedencia el filtro de abajo se lo comía.
  const principal = convEvent ? todos.find((e) => e.event === convEvent) : undefined;
  if (principal) return { value: principal.value, event: principal.event };
  const evs = todos.filter((e) => !esEventoDeVisita(e.event, excluir));
  if (evs.length) return { value: evs[0].value, event: evs[0].event };
  // El anuncio TENÍA eventos custom pero eran todos de visita: son 0 registros, y no se
  // cae al bucket genérico — hacerlo volvería a contar la visita como si fuera un alta.
  if (todos.length) return { value: 0, event: "" };
  // Sin ningún evento custom: los buckets estándar de lead web del píxel.
  const std = Math.max(
    actionVal(actions, ["offsite_conversion.fb_pixel_lead"]),
    actionVal(actions, ["onsite_web_lead"]),
  );
  return { value: std, event: std > 0 ? "lead" : "" };
}
function videoVal(arr: any[] | undefined): number {
  if (!Array.isArray(arr) || !arr.length) return 0;
  const first = arr.find((a) => String(a?.action_type) === "video_view") || arr[0];
  return num(first?.value);
}
// Visitas a la página de destino (landing_page_view). Meta a veces lo reporta también como
// omni_landing_page_view según el placement: se toma el MAYOR, nunca la suma (evita doble conteo).
function pickLanding(actions: any[] | undefined): number {
  return Math.max(actionVal(actions, ["landing_page_view"]), actionVal(actions, ["omni_landing_page_view"]));
}

const INSIGHT_FIELDS = [
  "ad_id", "ad_name", "campaign_id", "campaign_name", "adset_id", "adset_name",
  "spend", "impressions", "reach", "frequency", "clicks", "inline_link_clicks", "ctr", "cpc", "cpm",
  "actions", "action_values", "cost_per_action_type", "conversions",
  "video_play_actions", "video_thruplay_watched_actions", "video_avg_time_watched_actions",
  "video_p25_watched_actions", "video_p50_watched_actions", "video_p75_watched_actions", "video_p100_watched_actions",
].join(",");

interface AdMetrics {
  ad_id: string; ad_name: string; campaign_name: string; adset_name: string;
  spend: number; impressions: number; reach: number; frequency: number; cpm: number;
  clicks: number; inline_link_clicks: number; ctr: number; cpl: number; leads: number; landing_page_views: number;
  leads_form: number; leads_web: number; campaign_type: string | null; web_event: string | null;
  engagement: number; engagement_rate: number;
  video_plays: number; thruplay: number; video_avg_time_watched: number;
  p25: number; p50: number; p75: number; p100: number;
  hook_rate: number; hold_rate: number; retention: Record<string, unknown>;
  effective_status?: string; issues?: string; permalink?: string; country?: string;
  raw_actions?: any[];
  raw_conversions?: any[];
}

function deriveAd(row: any, convEvent: string, includeRaw: boolean, excluir: string[] = []): AdMetrics {
  const impressions = num(row.impressions);
  const spend = num(row.spend);
  // Interacción social (sin clics ni video): reacciones + comentarios + compartidos + guardados.
  const interactions = actionVal(row.actions, ["post_reaction"]) + actionVal(row.actions, ["comment"]) + actionVal(row.actions, ["post"]) + actionVal(row.actions, ["onsite_conversion.post_save"]);
  const plays = videoVal(row.video_play_actions);
  const v3s = actionVal(row.actions, ["video_view"]);
  const thruplay = videoVal(row.video_thruplay_watched_actions);
  const p25 = videoVal(row.video_p25_watched_actions);
  const p50 = videoVal(row.video_p50_watched_actions);
  const p75 = videoVal(row.video_p75_watched_actions);
  const p100 = videoVal(row.video_p100_watched_actions);
  const landing_page_views = pickLanding(row.actions);
  // Desglose formulario de Meta vs página web. La clasificación sale de la EVIDENCIA del
  // anuncio, no de cómo esté configurada la campaña: un anuncio que trajo leads de leadgen
  // es formulario; uno que registró el evento de la landing es web. Sin ninguna de las dos
  // señales queda en null y despues hereda el tipo de su campaña.
  const leads_form = pickLeadsForm(row.actions);
  const web = pickWeb(row.conversions, row.actions, convEvent, excluir);
  const leads_web = web.value;
  const web_event = web.event || null;
  // El total es la SUMA de los dos: son cosas distintas, no dos vistas del mismo lead.
  // Si no se detectó ninguno, red de seguridad con el bucket `lead` unificado de Meta.
  const leads = (leads_form + leads_web) || pickLeads(row.actions, convEvent);
  const campaign_type = leads_form > 0
    ? "formulario"
    : (leads_web > 0 || landing_page_views > 0 ? "web" : null);
  const base = v3s || plays || 1;
  const pct = (v: number) => (base > 0 ? Math.round((v / base) * 100) : 0);
  const points = { p0: 100, p25: pct(p25), p50: pct(p50), p75: pct(p75), p100: pct(p100) };
  return {
    ad_id: String(row.ad_id || ""), ad_name: String(row.ad_name || ""),
    campaign_name: String(row.campaign_name || ""), adset_name: String(row.adset_name || ""),
    spend, impressions, reach: num(row.reach), frequency: num(row.frequency),
    cpm: num(row.cpm) || (impressions > 0 ? (spend / impressions) * 1000 : 0),
    clicks: num(row.clicks), inline_link_clicks: num(row.inline_link_clicks),
    ctr: num(row.ctr), leads, leads_form, leads_web, campaign_type, web_event, landing_page_views, cpl: leads > 0 ? spend / leads : 0,
    engagement: interactions, engagement_rate: impressions > 0 ? (interactions / impressions) * 100 : 0,
    video_plays: v3s, thruplay, video_avg_time_watched: videoVal(row.video_avg_time_watched_actions),
    p25, p50, p75, p100,
    hook_rate: impressions > 0 ? (v3s / impressions) * 100 : 0,
    hold_rate: impressions > 0 ? (thruplay / impressions) * 100 : 0,
    retention: { points, base, plays_3s: v3s, plays_raw: plays, thruplay, p25, p50, p75, p100, duration: 100 },
    raw_actions: includeRaw ? (row.actions || []) : undefined,
    raw_conversions: includeRaw ? (row.conversions || []) : undefined,
  };
}

function normalizer(vals: number[]) {
  const min = Math.min(...vals), max = Math.max(...vals);
  return (v: number) => (max > min ? (v - min) / (max - min) : 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const { data: cfgRow } = await supabase.from("app_settings").select("value").eq("key", "meta_ads_sync_config").maybeSingle();
  const cfg = (cfgRow?.value as Record<string, unknown>) ?? {};
  const cronSecret = String(cfg.cron_secret ?? "");
  const gotSecret = req.headers.get("x-cron-secret") || "";
  const authed = (cronSecret && gotSecret === cronSecret) || (await authedUser(req));
  if (!authed) return j({ ok: false, error: "unauthorized" }, 401);

  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* query */ }
  const clientId = String(body.client ?? url.searchParams.get("client") ?? "");
  const dry = String(body.dry ?? url.searchParams.get("dry") ?? "") === "true" || body.dry === true;
  const allAccounts = String(body.all_accounts ?? url.searchParams.get("all_accounts") ?? "") === "true" || body.all_accounts === true;
  const window = String(body.window ?? url.searchParams.get("window") ?? cfg.window ?? "last_7d");
  const throttleMs = num(cfg.throttle_ms) || 3000;
  const winnersTop = num(cfg.winners_top) || 2;
  const abortAtPct = num(cfg.abort_at_pct) || 90;
  const weights = (cfg.score_weights as Record<string, number>) || { hold: 0.35, hook: 0.25, cpl: 0.25, ctr: 0.15 };
  // Desde que el informe diario dejó de usar el conector MCP, el token es la ÚNICA fuente.
  // Limitarlo a las cuentas marcadas dejaba 12 de 27 sin consultar NUNCA, y el informe
  // las mostraba como $0 sin haberle preguntado a Meta. Por defecto entran todas.
  // Con only_flagged=true en meta_ads_sync_config se vuelve al criterio viejo.
  const onlyFlagged = cfg.only_flagged === true;
  // Cuentas que Korex NO corre (ej. la 2ª de Mónica): no se consultan ni se guardan.
  // Fuente robusta en la config (no un flag de meta_ads, que se pisa). Ver informe-ads-diario.
  const excludeAccounts = new Set(((cfg.exclude_accounts as unknown[]) ?? []).map((x) => String(x).replace(/^act_/, "")));
  // Patrones extra de eventos que no cuentan como registro (ver WEB_EVENT_EXCLUDE).
  const webEventExclude = ((cfg.web_event_exclude as unknown[]) ?? []).map((x) => String(x));

  const token = await getToken();
  if (!token) return j({ ok: false, error: "missing_token", detail: "Falta el token de Meta (fbcrm_settings.meta_user_token o secreto META_ADS_TOKEN)." }, 400);

  let cq = supabase.from("clients").select("id, name, meta_ads, meta_metrics");
  if (clientId) cq = cq.eq("id", clientId);
  const { data: clients } = await cq;
  const jobs: { clientId: string; clientName: string; accId: string; accName: string; currency: string; convEvent: string }[] = [];
  const seen = new Set<string>();
  for (const c of clients || []) {
    const accs = Array.isArray(c.meta_ads) ? c.meta_ads : [];
    const issues = Array.isArray(c.meta_metrics?.accountIssues) ? c.meta_metrics.accountIssues : [];
    const mcpPending = new Set(issues.filter((i: any) => i?.issueType === "mcp_pendiente").map((i: any) => String(i.accountId)));
    for (const a of accs) {
      const accId = String(a.account_id || "").replace(/^act_/, "");
      if (!accId) continue;
      if (a.status === "interna") continue;
      // Cuentas que maneja el CLIENTE por su parte (ej. la de formularios de Mónica):
      // no se consultan ni se suman en nada. Decisión de Matías 2026-07-28.
      if (a.managed_by === "cliente") continue;
      // Cuentas marcadas para ignorar (ej. una 2ª cuenta de Mónica que Korex no corre):
      // no se consultan ni se suman. Se marca con "ignore": true en clients.meta_ads.
      if (a.ignore === true) continue;
      if (excludeAccounts.has(accId)) continue;
      const eligible = !onlyFlagged || a.use_token === true || mcpPending.has(accId) || (clientId && allAccounts);
      if (!eligible) continue;
      // Una misma cuenta cargada dos veces en meta_ads gastaba 2 llamadas al pedo.
      const key = `${c.id}|${accId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push({ clientId: c.id, clientName: c.name, accId, accName: a.name || c.name, currency: a.currency || "USD", convEvent: String(c.meta_metrics?.conversionEvent || "") });
    }
  }
  if (!jobs.length) return j({ ok: true, note: "No hay cuentas elegibles por token (marcá use_token en la cuenta, o pasá client + all_accounts).", jobs: 0 });

  const snapshotDate = new Date().toISOString().slice(0, 10);
  const results: any[] = [];
  const writeErrors: { client_id: string; table: string; error: string }[] = [];
  let calls = 0, maxUsage = 0, aborted = false;

  const byClient = new Map<string, typeof jobs>();
  for (const jb of jobs) { const arr = byClient.get(jb.clientId) || []; arr.push(jb); byClient.set(jb.clientId, arr); }

  for (const [cid, accJobs] of byClient) {
    if (aborted) break;
    let accSpend = 0, accImpr = 0, accClicks = 0, accLeads = 0, accLanding = 0, adsActiveAny = false;
    const spendPorMoneda = new Map<string, number>(); // para saber qué moneda muestra el panel
    const clientAdRows: any[] = [];
    for (const jb of accJobs) {
      if (aborted) break;
      try {
        const { data: rows, usagePct } = await graphGet(
          `${GRAPH}/act_${jb.accId}/insights?level=ad&date_preset=${window}&fields=${INSIGHT_FIELDS}&limit=200&access_token=${token}`,
          throttleMs,
        );
        calls++;
        maxUsage = Math.max(maxUsage, usagePct);
        const ads = rows.map((r) => deriveAd(r, jb.convEvent, dry, webEventExclude));

        // Un anuncio sin leads ni visitas ese día no tiene evidencia para clasificarse
        // (recién arrancado, o con el píxel roto). Hereda el tipo de su campaña. Si la
        // campaña mezcla los dos tipos, o entera está sin evidencia, se deja sin clasificar
        // — el informe lo muestra aparte en vez de inventarle un tipo.
        const tipoPorCampana = new Map<string, string>();
        for (const a of ads) {
          if (!a.campaign_type) continue;
          const prev = tipoPorCampana.get(a.campaign_name);
          tipoPorCampana.set(a.campaign_name, !prev ? a.campaign_type : (prev === a.campaign_type ? prev : "mixta"));
        }
        for (const a of ads) {
          if (a.campaign_type) continue;
          const t = tipoPorCampana.get(a.campaign_name);
          if (t && t !== "mixta") a.campaign_type = t;
        }

        // 2ª (y única) llamada por cuenta: estado, baneos/rechazos, país y link del anuncio.
        try {
          const { data: metaRows, usagePct: up2 } = await graphGet(
            `${GRAPH}/act_${jb.accId}/ads?fields=id,effective_status,issues_info,adset{targeting{geo_locations}},creative{effective_object_story_id,instagram_permalink_url}&limit=500&access_token=${token}`,
            throttleMs,
          );
          calls++;
          maxUsage = Math.max(maxUsage, up2);
          const metaMap = new Map<string, { status: string; issues: string; permalink: string; country: string }>();
          for (const m of metaRows) {
            const iss = Array.isArray(m.issues_info) ? m.issues_info : [];
            const reason = iss.length ? String(iss[0].error_summary || iss[0].error_message || "").trim() : "";
            const cr = m.creative || {};
            let permalink = String(cr.instagram_permalink_url || "");
            if (!permalink && cr.effective_object_story_id) permalink = `https://www.facebook.com/${cr.effective_object_story_id}`;
            const geo = m.adset?.targeting?.geo_locations || {};
            const country = countryLabel(Array.isArray(geo.countries) ? geo.countries : []);
            metaMap.set(String(m.id), { status: String(m.effective_status || ""), issues: reason, permalink, country });
          }
          for (const a of ads) {
            const m = metaMap.get(a.ad_id);
            if (m) { a.effective_status = m.status; a.issues = m.issues; a.permalink = m.permalink; a.country = m.country; }
          }
        } catch (_) { /* si falla, seguimos sin estado/país/link */ }

        const nHold = normalizer(ads.map((a) => a.hold_rate));
        const nHook = normalizer(ads.map((a) => a.hook_rate));
        const nCtr = normalizer(ads.map((a) => a.ctr));
        const cplVals = ads.map((a) => (a.cpl > 0 ? a.cpl : Infinity)).filter((v) => v !== Infinity);
        const nCpl = normalizer(cplVals.length ? cplVals : [0]);
        for (const a of ads) {
          const cplScore = a.cpl > 0 ? 1 - nCpl(a.cpl) : 0;
          (a as any).score = Number((weights.hold * nHold(a.hold_rate) + weights.hook * nHook(a.hook_rate) + weights.cpl * cplScore + weights.ctr * nCtr(a.ctr)).toFixed(4));
        }
        const ranked = [...ads].filter((a) => a.spend >= (num(cfg.min_spend) || 1)).sort((x, y) => (y as any).score - (x as any).score);
        const winners = new Set(ranked.slice(0, winnersTop).map((a) => a.ad_id));
        for (const a of ads) (a as any).is_winner = winners.has(a.ad_id);
        for (const a of ads) {
          accSpend += a.spend; accImpr += a.impressions; accClicks += a.clicks; accLeads += a.leads; accLanding += a.landing_page_views;
          spendPorMoneda.set(jb.currency, (spendPorMoneda.get(jb.currency) ?? 0) + a.spend);
          if (a.spend > 0) adsActiveAny = true;
          clientAdRows.push({ ...a, ad_account_id: jb.accId });
        }
        results.push({ client: jb.clientName, accId: jb.accId, ads: ads.length, usagePct, winners: [...winners], sample: dry ? ads.map((a) => ({ ad_name: a.ad_name, status: a.effective_status, country: a.country, issues: a.issues, impressions: a.impressions, reach: a.reach, cpm: Number(a.cpm.toFixed(2)), eng: Number(a.engagement_rate.toFixed(2)), leads: a.leads, tipo: a.campaign_type, leads_form: a.leads_form, leads_web: a.leads_web, web_event: a.web_event, customs: (a.raw_conversions || []).map((x: any) => `${x.action_type}=${x.value}`), cpl: Number(a.cpl.toFixed(2)), ctr: Number(a.ctr.toFixed(2)), hook: Number(a.hook_rate.toFixed(1)), hold: Number(a.hold_rate.toFixed(1)), link: a.permalink, score: (a as any).score, win: (a as any).is_winner })) : undefined });
        if (usagePct >= abortAtPct) { aborted = true; results.push({ note: `Uso de Meta al ${usagePct}% — corte preventivo.` }); break; }
        await sleep(throttleMs);
      } catch (e) {
        results.push({ client: jb.clientName, accId: jb.accId, error: String((e as Error)?.message || e) });
      }
    }

    if (!dry && clientAdRows.length) {
      const insRows = clientAdRows.map((a) => ({
        client_id: cid, ad_account_id: a.ad_account_id, campaign_name: a.campaign_name, adset_name: a.adset_name,
        ad_id: a.ad_id, ad_name: a.ad_name, time_window: window, snapshot_date: snapshotDate,
        spend: a.spend, impressions: a.impressions, reach: a.reach, frequency: a.frequency, cpm: a.cpm,
        clicks: a.clicks, inline_link_clicks: a.inline_link_clicks, ctr: a.ctr, cpl: a.cpl, leads: a.leads, landing_page_views: a.landing_page_views,
        leads_form: a.leads_form, leads_web: a.leads_web, campaign_type: a.campaign_type, web_event: a.web_event,
        engagement: a.engagement, engagement_rate: a.engagement_rate,
        video_3s: a.video_plays, thruplay: a.thruplay, video_avg_time_watched: a.video_avg_time_watched,
        hook_rate: a.hook_rate, hold_rate: a.hold_rate, retention: a.retention,
        effective_status: a.effective_status || null, issues: a.issues || null, permalink: a.permalink || null, country: a.country || null,
        score: (a as any).score, is_winner: (a as any).is_winner, won_at: (a as any).is_winner ? new Date().toISOString() : null,
      }));
      // Toda escritura se CHEQUEA: una corrida que no pudo guardar no puede terminar 200
      // muda (pasó el 2026-07-28: 200 OK y cero filas escritas, invisible por días).
      const { error: insErr } = await supabase.from("meta_ad_insights").upsert(insRows, { onConflict: "ad_id,time_window,snapshot_date" });
      if (insErr) writeErrors.push({ client_id: cid, table: "meta_ad_insights", error: String(insErr.message || insErr).slice(0, 300) });

      const cpl = accLeads > 0 ? accSpend / accLeads : 0;
      const ctr = accImpr > 0 ? (accClicks / accImpr) * 100 : 0;
      // % carga = de los que clickearon, cuántos cargaron la landing. % registro = de los que cargaron, cuántos se registraron.
      const pctCarga = accClicks > 0 ? (accLanding / accClicks) * 100 : 0;
      const pctRegistro = accLanding > 0 ? (accLeads / accLanding) * 100 : 0;
      const { data: cur } = await supabase.from("clients").select("meta_metrics").eq("id", cid).maybeSingle();
      const prev = (cur?.meta_metrics as Record<string, unknown>) || {};
      // Cada ventana escribe SUS claves. Antes las dos corridas del cron (last_7d y
      // yesterday) pisaban las mismas claves *7d, y el panel mostraba 7 días o 1 día
      // según cuál corrió última. Además "yesterday" revive los campos *Yesterday
      // que el panel muestra y que nadie escribía desde la era del conector MCP.
      const esAyer = window === "yesterday";
      // La moneda que muestra el panel. El sync NUNCA la escribía: quedaba la que hubiera
      // dejado la rutina vieja de la nube y no la corregía nadie — Mónica figuraba en EUR
      // (la moneda de una cuenta ajena) teniendo una sola cuenta en USD. Con varias cuentas
      // gana la que más gastó; si nadie gastó, la primera cargada en la ficha.
      const topMoneda = [...spendPorMoneda.entries()].sort((a, b) => b[1] - a[1])[0];
      const moneda = (topMoneda && topMoneda[1] > 0 ? topMoneda[0] : accJobs[0]?.currency) || "USD";
      const nextMetrics = esAyer
        ? {
          ...prev, adsActive: adsActiveAny, source: "token", currency: moneda, lastUpdatedYesterday: new Date().toISOString(),
          spendYesterday: Number(accSpend.toFixed(2)), conversionsYesterday: accLeads,
          cplYesterday: Number(cpl.toFixed(2)), impressionsYesterday: accImpr, clicksYesterday: accClicks,
          landingPageViewsYesterday: accLanding, ctrYesterday: Number(ctr.toFixed(2)),
          pctCargaYesterday: Number(pctCarga.toFixed(1)), pctRegistroYesterday: Number(pctRegistro.toFixed(1)),
        }
        : {
          ...prev, adsActive: adsActiveAny, source: "token", currency: moneda, lastUpdated: new Date().toISOString(),
          totalSpend7d: Number(accSpend.toFixed(2)), totalConversions7d: accLeads, avgCpl7d: Number(cpl.toFixed(2)),
          impressions7d: accImpr, clicks7d: accClicks, ctr7d: Number(ctr.toFixed(2)),
        };
      const { error: updErr } = await supabase.from("clients").update({ meta_metrics: nextMetrics }).eq("id", cid);
      if (updErr) writeErrors.push({ client_id: cid, table: "clients.meta_metrics", error: String(updErr.message || updErr).slice(0, 300) });
    }
  }

  // Las cuentas que Meta rechazó se guardan aparte: el informe diario las lista como
  // "no se pudo medir" en vez de darlas por $0, que es lo que hacía el informe viejo.
  const errors = results.filter((r) => r.error).map((r) => ({ client: r.client, accId: r.accId, error: String(r.error).slice(0, 300) }));

  try {
    await supabase.from("api_usage").insert({
      fn: "meta-ads-sync", model: "graph-v21",
      status: writeErrors.length ? "write_error" : (aborted ? "blocked" : "ok"), cost_usd: 0,
      client_id: clientId || null,
      meta: { dry, window, jobs: jobs.length, calls, maxUsagePct: maxUsage, aborted, errors, writeErrors },
    });
  } catch { /* no romper */ }

  // Si la base rechazó escrituras, la corrida NO es un éxito: 500 + aviso a Slack
  // (mismo bot del informe), para que un fallo de guardado nunca más pase invisible.
  if (writeErrors.length) {
    try {
      const { data: vf } = await supabase.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
      const bot = String((vf?.value as Record<string, unknown> | null)?.slack_bot_token || "");
      if (bot) {
        await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${bot}` },
          body: JSON.stringify({
            channel: "#informe-diario-adds",
            text: `:rotating_light: meta-ads-sync (${window}): ${writeErrors.length} escritura(s) fallaron — los datos de esta corrida pueden estar incompletos.\n` +
              writeErrors.slice(0, 5).map((w) => `• ${w.table}: ${w.error}`).join("\n"),
          }),
        });
      }
    } catch { /* el aviso es best-effort */ }
    return j({ ok: false, error: "write_errors", dry, window, jobs: jobs.length, calls, maxUsagePct: maxUsage, aborted, errors, writeErrors, results }, 500);
  }

  return j({ ok: true, dry, window, jobs: jobs.length, calls, maxUsagePct: maxUsage, aborted, errors, results });
});
