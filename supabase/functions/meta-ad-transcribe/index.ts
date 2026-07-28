// supabase/functions/meta-ad-transcribe/index.ts
// Transcribe el VIDEO de UN anuncio de Meta y cruza el guion con la caída de retención (como VSL).
// A PEDIDO (botón), 100% sincrónico, UNA sola llamada a Whisper. NADA en segundo plano.
// Reglas anti-fuga: solo usuario logueado O cron_secret; UNA llamada; tope diario/mensual (api_config) antes;
// cada corrida se registra en api_usage. Meta (Graph) resuelve el video (gratis). Whisper (Groq/OpenAI) el audio.
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
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const MAX_BYTES = 25 * 1024 * 1024;
const WHISPER_USD_PER_MIN = 0.006;

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

function extractVideoId(creative: any): string {
  if (!creative) return "";
  if (creative.video_id) return String(creative.video_id);
  const oss = creative.object_story_spec || {};
  if (oss.video_data?.video_id) return String(oss.video_data.video_id);
  const afs = creative.asset_feed_spec || {};
  for (const v of (afs.videos || [])) if (v?.video_id) return String(v.video_id);
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const { data: cfgRow } = await supabase.from("app_settings").select("value").eq("key", "meta_ads_sync_config").maybeSingle();
  const cronSecret = str((cfgRow?.value as Record<string, unknown>)?.cron_secret);
  const gotSecret = req.headers.get("x-cron-secret") || "";
  const authed = (cronSecret && gotSecret === cronSecret) || (await authedUser(req));
  if (!authed) return j({ ok: false, error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const adId = str(body.ad_id);
  if (!adId) return j({ ok: false, error: "missing_ad_id" }, 400);

  const groqKey = Deno.env.get("GROQ_API_KEY") || "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
  const useGroq = !!groqKey;
  const whisperKey = groqKey || openaiKey;
  if (!whisperKey) return j({ ok: false, error: "missing_whisper_key", detail: "Falta GROQ_API_KEY u OPENAI_API_KEY en los secretos de Edge Functions." }, 500);

  const token = await getToken();
  if (!token) return j({ ok: false, error: "missing_token", detail: "Falta el token de Meta." }, 400);

  const { data: apiCfgRow } = await supabase.from("app_settings").select("value").eq("key", "api_config").maybeSingle();
  const apiCfg = (apiCfgRow?.value as Record<string, unknown>) ?? {};
  const dailyCap = num(apiCfg.daily_cap_usd) || 5;
  const monthlyCap = num(apiCfg.monthly_cap_usd) || 100;
  try {
    const { data: stats } = await supabase.rpc("api_usage_stats");
    const todayCost = num((stats as any)?.today?.cost);
    const monthCost = num((stats as any)?.month?.cost);
    if (todayCost >= dailyCap) {
      await supabase.from("api_usage").insert({ fn: "meta-ad-transcribe", model: "whisper", status: "blocked", error: "tope diario", meta: { ad_id: adId, todayCost, dailyCap } });
      return j({ ok: false, error: "daily_cap", detail: `Se alcanzó el tope de gasto diario (US$${dailyCap}).` }, 429);
    }
    if (monthCost >= monthlyCap) {
      await supabase.from("api_usage").insert({ fn: "meta-ad-transcribe", model: "whisper", status: "blocked", error: "tope mensual", meta: { ad_id: adId, monthCost, monthlyCap } });
      return j({ ok: false, error: "monthly_cap", detail: `Se alcanzó el tope de gasto mensual (US$${monthlyCap}).` }, 429);
    }
  } catch { /* seguimos: el archivo <25MB acota el costo */ }

  let videoId = "";
  let sourceUrl = "";
  let duration = 0;
  try {
    const r1 = await fetch(`${GRAPH}/${adId}?fields=creative{video_id,object_story_spec,asset_feed_spec}&access_token=${token}`);
    const jb1 = await r1.json();
    if (jb1.error) throw new Error(jb1.error.message);
    videoId = extractVideoId(jb1.creative);
    if (!videoId) return j({ ok: false, error: "no_video", detail: "Este anuncio no tiene video (o es imagen)." }, 200);
    const r2 = await fetch(`${GRAPH}/${videoId}?fields=source,length&access_token=${token}`);
    const jb2 = await r2.json();
    if (jb2.error) throw new Error(jb2.error.message);
    sourceUrl = str(jb2.source);
    duration = num(jb2.length);
    if (!sourceUrl) return j({ ok: false, error: "no_source", detail: "Meta no devolvió el archivo del video (permisos del token)." }, 200);
  } catch (e) {
    return j({ ok: false, error: "graph_error", detail: String((e as Error)?.message || e) }, 502);
  }

  let fileBuf: ArrayBuffer;
  try {
    const vr = await fetch(sourceUrl);
    if (!vr.ok) throw new Error("http " + vr.status);
    fileBuf = await vr.arrayBuffer();
    if (fileBuf.byteLength > MAX_BYTES) {
      return j({ ok: false, error: "too_big", detail: `El video pesa ${(fileBuf.byteLength / 1e6).toFixed(1)}MB (máx 25MB para transcribir directo).` }, 200);
    }
  } catch (e) {
    return j({ ok: false, error: "download_error", detail: String((e as Error)?.message || e) }, 502);
  }

  const endpoint = useGroq ? "https://api.groq.com/openai/v1/audio/transcriptions" : "https://api.openai.com/v1/audio/transcriptions";
  const model = useGroq ? "whisper-large-v3" : "whisper-1";
  const form = new FormData();
  form.append("file", new Blob([fileBuf], { type: "video/mp4" }), "ad.mp4");
  form.append("model", model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");

  let segments: { start: number; end: number; text: string }[] = [];
  try {
    const wr = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${whisperKey}` }, body: form, signal: AbortSignal.timeout(120000) });
    if (!wr.ok) {
      const t = await wr.text();
      await supabase.from("api_usage").insert({ fn: "meta-ad-transcribe", model, status: "error", error: "whisper " + wr.status, meta: { ad_id: adId, video_id: videoId, detail: t.slice(0, 300) } });
      return j({ ok: false, error: "whisper_error", detail: `Whisper respondió ${wr.status}.` }, 502);
    }
    const wj = await wr.json();
    segments = (wj.segments || []).map((s: any) => ({ start: Math.round(num(s.start)), end: Math.round(num(s.end)), text: str(s.text) })).filter((s: any) => s.text);
    if (!duration && wj.duration) duration = Math.round(num(wj.duration));
  } catch (e) {
    await supabase.from("api_usage").insert({ fn: "meta-ad-transcribe", model, status: "error", error: String((e as Error)?.message || e), meta: { ad_id: adId, video_id: videoId } });
    return j({ ok: false, error: "whisper_error", detail: String((e as Error)?.message || e) }, 502);
  }

  const { error: uErr } = await supabase.from("meta_ad_insights")
    .update({ transcript: segments, video_id: videoId, video_duration: duration || null })
    .eq("ad_id", adId);

  const cost = Number(((duration / 60) * WHISPER_USD_PER_MIN).toFixed(6));
  await supabase.from("api_usage").insert({
    fn: "meta-ad-transcribe", model, cost_usd: cost, status: uErr ? "error" : "ok",
    error: uErr ? String(uErr.message) : null,
    meta: { ad_id: adId, video_id: videoId, duration, segments: segments.length, provider: useGroq ? "groq" : "openai" },
  });
  if (uErr) return j({ ok: false, error: "write_error", detail: String(uErr.message), cost_usd: cost }, 500);

  return j({ ok: true, ad_id: adId, video_id: videoId, duration, segments: segments.length, cost_usd: cost });
});
