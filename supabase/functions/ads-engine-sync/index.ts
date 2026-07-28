// supabase/functions/ads-engine-sync/index.ts
// MOTOR de métricas de publicidad. Extrae de Meta Graph API v21 el gasto DIARIO por cuenta
// (fecha real del dato, no snapshot de corrida) y lo escribe en ads_spend_daily, con bitácora
// de cada corrida en ads_sync_runs. Corre EN SOMBRA junto a meta-ads-sync: no toca
// meta_ad_insights ni clients.meta_metrics.
// REGLA CRÍTICA: cuidar el token. UNA llamada por cuenta (time_increment=1 devuelve una fila
// por día); secuencial + sleep; lee headers de uso de Meta y aborta si está alto; backoff ante throttle.
// Por defecto trae los últimos 3 días CERRADOS (D-1..D-3 en hora Argentina): Meta reexpresa la
// atribución retroactivamente, así que reconsultar D-2/D-3 auto-repara los huecos.
// Si un día no vino en la respuesta (cuenta sin actividad) se escribe la fila igual con todo
// en 0: que "cero" sea un dato, no un hueco.
// Auth: usuario logueado (botón) O x-cron-secret (cron, motor_config.cron_secret).
// Token: fbcrm_settings.meta_user_token o META_ADS_TOKEN. Config: tabla motor_config.
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
const round2 = (v: number) => Math.round(v * 100) / 100;

const THROTTLE_CODES = new Set([4, 17, 32, 341, 613, 80000, 80003, 80004, 80014]);

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

function actionVal(arr: any[] | undefined, type: string): number {
  if (!Array.isArray(arr)) return 0;
  let total = 0;
  for (const a of arr) if (String(a?.action_type) === type) total += num(a?.value);
  return total;
}

// Leads SIN doble conteo: Meta reporta el mismo lead en varios buckets, así que NUNCA se suman.
// Con evento custom del cliente (clients.meta_metrics.conversionEvent) manda la conversión custom
// del pixel; si no, el MÁXIMO entre los action_types de lead configurados (default_lead_action_types
// de motor_config, o el override lead_action_types de la cuenta).
function pickLeads(actions: any[] | undefined, convEvent: string, leadTypes: string[]): number {
  const custom = actionVal(actions, "offsite_conversion.fb_pixel_custom");
  if (convEvent && custom > 0) return custom;
  const std = Math.max(0, ...leadTypes.map((t) => actionVal(actions, t)));
  return std > 0 ? std : custom;
}

// Los action_types de lead CRUDOS que vinieron en la fila, para auditar el conteo a mano.
function leadDetail(actions: any[] | undefined, leadTypes: string[]): Record<string, number> {
  const detail: Record<string, number> = {};
  if (!Array.isArray(actions)) return detail;
  const watch = new Set([...leadTypes, "offsite_conversion.fb_pixel_custom"]);
  for (const a of actions) {
    const t = String(a?.action_type || "");
    if (watch.has(t)) detail[t] = (detail[t] || 0) + num(a?.value);
  }
  return detail;
}

// Fecha de "hoy" en Argentina (YYYY-MM-DD). Los días cerrados se calculan desde acá,
// no desde UTC: a las 22hs de Argentina, UTC ya está en el día siguiente.
function todayBA(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}

// Últimos N días CERRADOS: [D-N, ..., D-2, D-1] en orden ascendente.
function closedDates(days: number): string[] {
  const base = new Date(`${todayBA()}T00:00:00Z`);
  const out: string[] = [];
  for (let i = days; i >= 1; i--) {
    const d = new Date(base.getTime() - i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // ---- Config del motor (tabla motor_config, key -> value jsonb) ----
  const { data: cfgRows } = await supabase.from("motor_config").select("key, value")
    .in("key", ["cron_secret", "fx_rates", "tax_factor", "throttle_ms", "usage_abort_pct", "default_lead_action_types"]);
  const cfg: Record<string, unknown> = {};
  for (const r of cfgRows || []) cfg[String(r.key)] = r.value;

  const cronSecret = String(cfg.cron_secret ?? "");
  const gotSecret = req.headers.get("x-cron-secret") || "";
  const authed = (cronSecret && gotSecret === cronSecret) || (await authedUser(req));
  if (!authed) return j({ ok: false, error: "unauthorized" }, 401);

  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* query */ }
  const dry = String(body.dry ?? url.searchParams.get("dry") ?? "") === "true" || body.dry === true;
  // days: cuántos días cerrados reconsultar (default 3, cap 14 para backfills).
  const days = Math.min(14, Math.max(1, num(body.days ?? url.searchParams.get("days")) || 3));

  const fxRates = (cfg.fx_rates as Record<string, number>) || {};
  const taxFactor = num(cfg.tax_factor) || 1.07625;
  const throttleMs = num(cfg.throttle_ms) || 1500;
  const abortAtPct = num(cfg.usage_abort_pct) || 90;
  const defaultLeadTypes = Array.isArray(cfg.default_lead_action_types)
    ? (cfg.default_lead_action_types as unknown[]).map(String)
    : ["lead", "offsite_conversion.fb_pixel_lead", "onsite_web_lead", "leadgen_grouped", "onsite_conversion.lead_grouped"];

  const token = await getToken();
  if (!token) return j({ ok: false, error: "missing_token", detail: "Falta el token de Meta (fbcrm_settings.meta_user_token o secreto META_ADS_TOKEN)." }, 400);

  // ---- Cuentas del motor: solo las que maneja Korex y están activas ----
  const { data: accounts, error: accErr } = await supabase.from("ads_accounts")
    .select("account_id, client_id, name, currency, lead_action_types")
    .eq("managed_by", "korex").eq("status", "activa");
  if (accErr) return j({ ok: false, error: "accounts_query_failed", detail: String(accErr.message || accErr) }, 500);
  if (!accounts?.length) return j({ ok: true, note: "No hay cuentas activas manejadas por Korex en ads_accounts.", accounts: 0 });

  // conversionEvent por cliente (mismo criterio que el sync viejo para leads custom).
  const clientIds = [...new Set(accounts.map((a) => a.client_id).filter(Boolean))];
  const convByClient = new Map<string, string>();
  if (clientIds.length) {
    const { data: cls } = await supabase.from("clients").select("id, meta_metrics").in("id", clientIds);
    for (const c of cls || []) convByClient.set(String(c.id), String((c.meta_metrics as Record<string, unknown> | null)?.conversionEvent || ""));
  }

  // ---- Fechas cerradas (hora Argentina) ----
  const dates = closedDates(days);
  const since = dates[0];
  const until = dates[dates.length - 1];
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  // ---- Bitácora: la corrida arranca registrándose. Sin bitácora no hay corrida. ----
  let runId: string | null = null;
  if (!dry) {
    const { data: run, error: runErr } = await supabase.from("ads_sync_runs")
      .insert({ status: "running" }).select().single();
    if (runErr || !run?.id) return j({ ok: false, error: "run_insert_failed", detail: String(runErr?.message || runErr || "sin id") }, 500);
    runId = run.id;
  }

  const errors: { account_id: string; client_id: string | null; error: string }[] = [];
  const samples: any[] = [];
  let calls = 0, maxUsage = 0, aborted = false;
  let accountsOk = 0, rowsWritten = 0;

  for (const acc of accounts) {
    if (aborted) break;
    const accId = String(acc.account_id || "").replace(/^act_/, "");
    const clientId = acc.client_id ? String(acc.client_id) : null;
    const currency = String(acc.currency || "USD").toUpperCase();
    const convEvent = clientId ? (convByClient.get(clientId) || "") : "";
    const leadTypes = Array.isArray(acc.lead_action_types) && acc.lead_action_types.length
      ? (acc.lead_action_types as unknown[]).map(String)
      : defaultLeadTypes;
    try {
      // UNA llamada por cuenta: time_increment=1 devuelve una fila por día con date_start.
      const { data: rows, usagePct } = await graphGet(
        `${GRAPH}/act_${accId}/insights?level=account&time_increment=1&time_range=${timeRange}&fields=spend,impressions,clicks,actions&limit=50&access_token=${token}`,
        throttleMs,
      );
      calls++;
      maxUsage = Math.max(maxUsage, usagePct);

      // Moneda sin tasa en fx_rates: no se inventa un tipo de cambio. Error por cuenta y no se escribe.
      const fxRate = num(fxRates[currency]);
      if (!(fxRate > 0)) {
        errors.push({ account_id: accId, client_id: clientId, error: `Sin tasa fx para ${currency} en motor_config.fx_rates` });
      } else {
        const byDate = new Map<string, any>();
        for (const r of rows) byDate.set(String(r.date_start || ""), r);
        const upsertRows = dates.map((date) => {
          const r = byDate.get(date) || {}; // día sin actividad -> fila en 0, no hueco
          const spendNative = num(r.spend);
          const spendUsd = round2(spendNative * fxRate);
          return {
            account_id: accId,
            date,
            client_id: clientId,
            spend_native: spendNative,
            currency,
            fx_rate: fxRate,
            spend_usd: spendUsd,
            tax_factor: taxFactor,
            spend_usd_taxed: round2(spendUsd * taxFactor),
            impressions: num(r.impressions),
            clicks: num(r.clicks),
            leads: pickLeads(r.actions, convEvent, leadTypes),
            lead_detail: leadDetail(r.actions, leadTypes),
            sync_run_id: runId,
            fetched_at: new Date().toISOString(),
          };
        });
        if (dry) {
          samples.push({ account_id: accId, name: acc.name, client_id: clientId, currency, fx_rate: fxRate, conv_event: convEvent || null, lead_types: leadTypes, rows: upsertRows.map(({ sync_run_id: _s, fetched_at: _f, ...rest }) => rest) });
          accountsOk++;
        } else {
          // Toda escritura se CHEQUEA: una corrida que no pudo guardar no puede terminar 200 muda.
          const { error: upErr } = await supabase.from("ads_spend_daily").upsert(upsertRows, { onConflict: "account_id,date" });
          if (upErr) {
            errors.push({ account_id: accId, client_id: clientId, error: `upsert ads_spend_daily: ${String(upErr.message || upErr).slice(0, 300)}` });
          } else {
            rowsWritten += upsertRows.length;
            accountsOk++;
          }
        }
      }

      if (usagePct >= abortAtPct) {
        aborted = true;
        errors.push({ account_id: accId, client_id: clientId, error: `Uso de Meta al ${usagePct}% — corte preventivo (límite ${abortAtPct}%).` });
        break;
      }
      await sleep(throttleMs);
    } catch (e) {
      errors.push({ account_id: accId, client_id: clientId, error: String((e as Error)?.message || e).slice(0, 300) });
    }
  }

  const accountsFailed = accounts.length - accountsOk;
  const status = aborted || accountsOk === 0 ? "failed" : (accountsFailed > 0 ? "partial" : "ok");

  // ---- Cierre de bitácora (también chequeado: un update mudo esconde corridas rotas) ----
  let runUpdateError: string | null = null;
  if (!dry && runId) {
    const { error: updErr } = await supabase.from("ads_sync_runs").update({
      finished_at: new Date().toISOString(),
      status,
      accounts_total: accounts.length,
      accounts_ok: accountsOk,
      accounts_failed: accountsFailed,
      calls,
      max_usage_pct: maxUsage,
      dates_fetched: dates,
      errors,
    }).eq("id", runId);
    if (updErr) runUpdateError = String(updErr.message || updErr).slice(0, 300);
  }

  return j({
    ok: status !== "failed" && !runUpdateError,
    run_id: runId,
    status,
    dry,
    accounts_ok: accountsOk,
    accounts_failed: accountsFailed,
    rows_written: rowsWritten,
    calls,
    max_usage_pct: maxUsage,
    dates,
    errors,
    run_update_error: runUpdateError,
    samples: dry ? samples : undefined,
  }, status === "failed" ? 500 : 200);
});
