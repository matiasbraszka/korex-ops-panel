import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLARITY_URL =
  "https://www.clarity.ms/export-data/api/v1/project-live-insights";

const toInt = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function decodeSub(token: string): string | null {
  try {
    const part = token.split(".")[1];
    let b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const payload = JSON.parse(atob(b64));
    return payload?.sub ?? null;
  } catch { return null; }
}

function domainsFrom(popularPages: any[]): string[] {
  const set = new Set<string>();
  for (const p of popularPages ?? []) {
    try { set.add(new URL(p.url).hostname); } catch { /* ignore */ }
  }
  return [...set];
}

function parseInsights(arr: any[]) {
  const by: Record<string, any[]> = {};
  for (const m of arr ?? []) by[m.metricName] = m.information ?? [];
  const t = by["Traffic"]?.[0] ?? {};
  const sd = by["ScrollDepth"]?.[0] ?? {};
  const pct = (n: string) => toNum(by[n]?.[0]?.sessionsWithMetricPercentage);
  const sub = (n: string) => toInt(by[n]?.[0]?.subTotal);
  return {
    typed: {
      sessions: toInt(t.totalSessionCount),
      bot_sessions: toInt(t.totalBotSessionCount),
      distinct_users: toInt(t.distinctUserCount),
      pages_per_session: toNum(t.pagesPerSessionPercentage),
      avg_scroll_depth: toNum(sd.averageScrollDepth),
      dead_click_pct: pct("DeadClickCount"),
      rage_click_pct: pct("RageClickCount"),
      quick_back_pct: pct("QuickbackClick"),
      excessive_scroll_pct: pct("ExcessiveScroll"),
      script_errors: sub("ScriptErrorCount"),
      error_clicks: sub("ErrorClickCount"),
    },
    popular_pages: by["PopularPages"] ?? [],
    metrics: {
      page_titles: by["PageTitle"] ?? [],
      engagement: by["EngagementTime"]?.[0] ?? null,
      device: by["Device"] ?? [],
      os: by["OS"] ?? [],
      browser: by["Browser"] ?? [],
      country: by["Country"] ?? [],
      referrer: by["ReferrerUrl"] ?? [],
    },
  };
}

async function syncFunnel(admin: any, f: any, numOfDays: number, dateStr: string) {
  const token = f.api_token as string;
  let res: Response;
  try {
    res = await fetch(`${CLARITY_URL}?numOfDays=${numOfDays}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    return { funnel_id: f.id, label: f.label, ok: false, error: `fetch: ${String(e)}` };
  }
  const text = await res.text();
  if (!res.ok) {
    return { funnel_id: f.id, label: f.label, ok: false, status: res.status, error: text.slice(0, 300) };
  }
  let json: any;
  try { json = JSON.parse(text); } catch { return { funnel_id: f.id, label: f.label, ok: false, error: "bad json" }; }
  const p = parseInsights(json);
  const domains = domainsFrom(p.popular_pages);
  const now = new Date().toISOString();
  const row = {
    funnel_id: f.id,
    client_id: f.client_id,
    date: dateStr,
    ...p.typed,
    popular_pages: p.popular_pages,
    metrics: { ...p.metrics, window_days: numOfDays },
    raw: json,
    synced_at: now,
    updated_at: now,
  };
  const { error: upErr } = await admin.from("clarity_daily").upsert(row, { onConflict: "funnel_id,date" });
  if (upErr) return { funnel_id: f.id, label: f.label, ok: false, error: upErr.message };
  const summary = {
    status: "ok",
    date: dateStr,
    window_days: numOfDays,
    sessions: p.typed.sessions,
    bot_sessions: p.typed.bot_sessions,
    distinct_users: p.typed.distinct_users,
    avg_scroll_depth: p.typed.avg_scroll_depth,
    script_errors: p.typed.script_errors,
    dead_click_pct: p.typed.dead_click_pct,
    popular_pages: p.popular_pages,
    page_titles: p.metrics.page_titles,
  };
  await admin.from("clarity_funnels").update({
    sub: decodeSub(token),
    domains,
    last_synced_at: now,
    last_metrics: summary,
    updated_at: now,
  }).eq("id", f.id);
  return { funnel_id: f.id, label: f.label, client_id: f.client_id, ok: true, sessions: p.typed.sessions, domains };
}

Deno.serve(async (req: Request) => {
  const jsonHeaders = { "Content-Type": "application/json" };
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: secretRow } = await admin.from("app_settings").select("value").eq("key", "clarity_sync_secret").maybeSingle();
    const expected = secretRow?.value?.secret;
    const provided = req.headers.get("x-sync-secret");
    if (!expected || provided !== expected) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: jsonHeaders });
    }
    const url = new URL(req.url);
    let body: any = {};
    if (req.method === "POST") { try { body = await req.json(); } catch { body = {}; } }
    const funnelId = url.searchParams.get("funnel_id") ?? body.funnel_id ?? null;
    const numOfDays = Math.min(3, Math.max(1, parseInt(String(url.searchParams.get("numOfDays") ?? body.numOfDays ?? "1")) || 1));
    let dateStr = url.searchParams.get("date") ?? body.date ?? null;
    if (!dateStr) {
      const d = new Date();
      if (numOfDays === 1) d.setUTCDate(d.getUTCDate() - 1);
      dateStr = d.toISOString().slice(0, 10);
    }
    let fq = admin.from("clarity_funnels").select("id,client_id,label,active").eq("active", true);
    if (funnelId) fq = fq.eq("id", funnelId);
    const { data: funnels, error: fErr } = await fq;
    if (fErr) return new Response(JSON.stringify({ error: fErr.message }), { status: 500, headers: jsonHeaders });
    const ids = (funnels ?? []).map((f: any) => f.id);
    const { data: secrets } = await admin.from("clarity_funnel_secrets").select("funnel_id,api_token").in("funnel_id", ids.length ? ids : ["_none_"]);
    const tokenById: Record<string, string> = {};
    for (const s of secrets ?? []) tokenById[s.funnel_id] = s.api_token;
    const results = [];
    for (const f of funnels ?? []) {
      const token = tokenById[f.id];
      if (!token) { results.push({ funnel_id: f.id, label: f.label, ok: false, error: "no token" }); continue; }
      results.push(await syncFunnel(admin, { ...f, api_token: token }, numOfDays, dateStr));
    }
    return new Response(JSON.stringify({ ok: true, date: dateStr, numOfDays, count: results.length, results }), { headers: jsonHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), { status: 500, headers: jsonHeaders });
  }
});
