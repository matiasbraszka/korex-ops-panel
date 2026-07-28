// supabase/functions/winners-promote/index.ts
// FLYWHEEL DE GANADORES (semi-automático, "Matías aprueba con 1 click").
// Detecta anuncios ganadores probados en meta_ad_insights y los propone como CANDIDATOS a la
// biblioteca por nicho (marketing_ad_library, status='candidate'). El agente SOLO lee status='approved',
// así que un candidato nunca contamina el prompt hasta que Matías lo apruebe desde el panel.
//
// Umbrales (app_settings.winners_promote_config): min_spend, min_score, min_leads, transcribe.
// Dedupe por ad_id (mejor snapshot) y por source_ad_id (no re-proponer lo ya candidato/aprobado/rechazado).
// Transcript: si el ganador ya lo tiene, se usa; si no y transcribe=true + hay Whisper key, se dispara
// meta-ad-transcribe (a lo sumo N por corrida). Sin key, el candidato entra igual con métricas (degrada elegante).
//
// Auth: usuario logueado O x-cron-secret (reusa meta_ads_sync_config.cron_secret). Auto-contenida (deploy por MCP).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
const round = (v: unknown, d = 2) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null; };

const MAX_TRANSCRIBE_PER_RUN = 5; // tope de video-transcripciones por corrida (control de costo/tiempo)

async function authedUser(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !ANON_KEY || token === ANON_KEY) return false;
  try {
    const uc = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data } = await uc.auth.getUser();
    return !!data?.user;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // ── Auth: cron-secret (reusa el de meta_ads_sync) o usuario logueado ──
  const { data: syncCfgRow } = await supabase.from("app_settings").select("value").eq("key", "meta_ads_sync_config").maybeSingle();
  const cronSecret = str((syncCfgRow?.value as Record<string, unknown>)?.cron_secret);
  const gotSecret = req.headers.get("x-cron-secret") || "";
  const authed = (cronSecret && gotSecret === cronSecret) || (await authedUser(req));
  if (!authed) return j({ ok: false, error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const onlyClient = str(body.client_id);   // opcional: scope a un cliente (para probar)
  const dryRun = body.dry_run === true;      // opcional: no inserta, solo reporta qué haría

  // ── Config de umbrales ──
  const { data: cfgRow } = await supabase.from("app_settings").select("value").eq("key", "winners_promote_config").maybeSingle();
  const cfg = (cfgRow?.value as Record<string, unknown>) ?? {};
  const minSpend = num(cfg.min_spend) || 25;
  const minScore = cfg.min_score === undefined ? 0.7 : num(cfg.min_score);
  const minLeads = cfg.min_leads === undefined ? 5 : num(cfg.min_leads);
  const wantTranscribe = cfg.transcribe !== false;

  // ── Ganadores que superan el umbral ──
  let q = supabase.from("meta_ad_insights")
    .select("ad_id,ad_name,campaign_name,client_id,spend,cpl,ctr,hook_rate,hold_rate,score,leads,transcript,snapshot_date")
    .eq("is_winner", true)
    .gte("spend", minSpend)
    .gte("score", minScore)
    .gte("leads", minLeads)
    .order("score", { ascending: false })
    .order("snapshot_date", { ascending: false });
  if (onlyClient) q = q.eq("client_id", onlyClient);
  const { data: rows, error: rowsErr } = await q;
  if (rowsErr) return j({ ok: false, error: "query_failed", detail: rowsErr.message }, 500);

  // Dedupe por ad_id → nos quedamos con el mejor snapshot (ya viene ordenado por score/fecha desc).
  const byAd = new Map<string, Record<string, unknown>>();
  for (const r of (rows || [])) { const id = str(r.ad_id); if (id && !byAd.has(id)) byAd.set(id, r); }
  const candidates = [...byAd.values()];

  // Excluir los ad_id que YA están en la biblioteca (candidato/aprobado/rechazado).
  const adIds = candidates.map((c) => str(c.ad_id)).filter(Boolean);
  const already = new Set<string>();
  if (adIds.length) {
    const { data: existing } = await supabase.from("marketing_ad_library").select("source_ad_id").in("source_ad_id", adIds);
    for (const e of (existing || [])) already.add(str(e.source_ad_id));
  }
  const fresh = candidates.filter((c) => !already.has(str(c.ad_id)));

  // Nicho por cliente (para categorizar).
  const clientIds = [...new Set(fresh.map((c) => str(c.client_id)).filter(Boolean))];
  const nicheByClient = new Map<string, { niche: string; name: string }>();
  if (clientIds.length) {
    const { data: cl } = await supabase.from("clients").select("id,name,niche").in("id", clientIds);
    for (const c of (cl || [])) nicheByClient.set(str(c.id), { niche: str(c.niche), name: str(c.name) });
  }

  if (dryRun) {
    return j({ ok: true, dry_run: true, thresholds: { minSpend, minScore, minLeads }, would_promote: fresh.length,
      candidates: fresh.map((c) => ({ ad_id: str(c.ad_id), ad_name: str(c.ad_name), client: nicheByClient.get(str(c.client_id))?.name, niche: nicheByClient.get(str(c.client_id))?.niche, score: c.score, spend: c.spend, leads: c.leads })) });
  }

  // ── Transcribir los que no tengan transcript (best-effort, con tope por corrida) ──
  let transcribed = 0;
  if (wantTranscribe && cronSecret) {
    for (const c of fresh) {
      if (transcribed >= MAX_TRANSCRIBE_PER_RUN) break;
      if (c.transcript) continue;
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-ad-transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret, "Authorization": `Bearer ${ANON_KEY}` },
          body: JSON.stringify({ ad_id: str(c.ad_id) }),
        });
        const jb = await res.json().catch(() => ({}));
        if (jb?.ok && jb?.transcript) { c.transcript = jb.transcript; transcribed++; }
        else if (jb?.ok) { transcribed++; } // transcribió pero no devolvió el texto; lo re-leemos abajo
      } catch { /* si falla, el candidato entra sin transcript */ }
    }
    // Re-leer transcripts recién escritos (meta-ad-transcribe los guarda en meta_ad_insights).
    const need = fresh.filter((c) => !c.transcript).map((c) => str(c.ad_id));
    if (need.length) {
      const { data: tRows } = await supabase.from("meta_ad_insights").select("ad_id,transcript").in("ad_id", need).not("transcript", "is", null);
      const tByAd = new Map<string, unknown>();
      for (const t of (tRows || [])) if (!tByAd.has(str(t.ad_id))) tByAd.set(str(t.ad_id), t.transcript);
      for (const c of fresh) if (!c.transcript && tByAd.has(str(c.ad_id))) c.transcript = tByAd.get(str(c.ad_id));
    }
  }

  // ── Insertar candidatos ──
  let inserted = 0;
  for (const c of fresh) {
    const adId = str(c.ad_id);
    const info = nicheByClient.get(str(c.client_id)) || { niche: "", name: "" };
    const niche = info.niche || "sin nicho";
    const metrics = {
      hook_rate: round(c.hook_rate, 1), hold_rate: round(c.hold_rate, 1), cpl: round(c.cpl, 2),
      ctr: round(c.ctr, 2), score: round(c.score, 3), spend: round(c.spend, 2), leads: num(c.leads),
    };
    const transcriptTxt = c.transcript ? (typeof c.transcript === "string" ? c.transcript : JSON.stringify(c.transcript)) : "";
    const metricsLine = `[Ganador real de ${info.name || "cliente"} · nicho ${niche} · hook ${metrics.hook_rate} · hold ${metrics.hold_rate} · CPL ${metrics.cpl} · CTR ${metrics.ctr} · score ${metrics.score} · gasto ${metrics.spend} · ${metrics.leads} leads]`;
    const content = transcriptTxt
      ? `${metricsLine}\n\n${transcriptTxt}`
      : `${metricsLine}\n\n(Sin transcript todavía — es un anuncio ganador por métricas; transcribí el video para ver el copy exacto.)`;

    const row = {
      id: `mal_win_${adId}`,
      part: "example",
      status: "candidate",
      niche,
      niche_tags: [niche].filter(Boolean),
      avatar: null as string | null,
      title: `Ganador — ${str(c.ad_name) || adId}`,
      content,
      char_count: content.length,
      metrics,
      source_ad_id: adId,
      client_id: str(c.client_id) || null,
    };
    const { error: insErr } = await supabase.from("marketing_ad_library").insert(row);
    if (!insErr) inserted++;
    else if (!/duplicate|unique/i.test(insErr.message)) {
      await supabase.from("api_usage").insert({ fn: "winners-promote", model: "-", status: "error", client_id: str(c.client_id), error: insErr.message, meta: { ad_id: adId } });
    }
  }

  await supabase.from("api_usage").insert({ fn: "winners-promote", model: "-", status: "ok", meta: { scanned: candidates.length, fresh: fresh.length, inserted, transcribed } });
  return j({ ok: true, scanned: candidates.length, fresh: fresh.length, inserted, transcribed });
});
