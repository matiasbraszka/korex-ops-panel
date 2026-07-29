// supabase/functions/transcribir-recursos/index.ts
// Transcribe los VIDEOS de funnel_resources (Bunny) que NO tienen transcript.
// Cierra el hueco del circuito: transcribir-batch solo cubre los videos que vinieron
// del Drive (client_drive_nodes); los subidos DIRECTO al panel (testimonios, VSL
// editada, anuncios editados) no los transcribía nadie. Corre por cron cada 20 min.
//
// Cómo: baja el 240p liviano de Bunny (play_240p.mp4, <=24MB) → Whisper (Groq si hay
// GROQ_BATCH_KEY, si no OpenAI) → guarda funnel_resources.transcript. Estados en
// transcript_status: ok | processing | pendiente_240p (aún codificando en Bunny) |
// too_big | sin_audio | error. Costo a api_usage.
// Auth: x-cron-secret (motor_config.cron_secret) o Bearer service_role.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GROQ_KEY = Deno.env.get("GROQ_BATCH_KEY") ?? "";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const BUNNY_HOST = Deno.env.get("BUNNY_HOSTNAME") ?? "";

const BATCH_MAX = 4;
const HARD_MAX_BYTES = 24 * 1024 * 1024;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const REST = `${SUPABASE_URL}/rest/v1/`;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json", ...extra });
async function rGet(path: string): Promise<Record<string, unknown>[]> {
  const r = await fetch(REST + path, { headers: hdr() });
  if (!r.ok) throw new Error(`REST GET ${r.status}: ${(await r.text()).slice(0, 120)}`);
  return r.json();
}
async function rPatch(path: string, body: unknown): Promise<void> {
  const r = await fetch(REST + path, { method: "PATCH", headers: hdr({ Prefer: "return=minimal" }), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`REST PATCH ${r.status}: ${(await r.text()).slice(0, 120)}`);
}
async function rInsert(table: string, row: unknown): Promise<void> {
  const r = await fetch(REST + table, { method: "POST", headers: hdr({ Prefer: "return=minimal" }), body: JSON.stringify(row) });
  if (!r.ok) throw new Error(`REST INSERT ${r.status}: ${(await r.text()).slice(0, 160)}`);
}

function resolveProvider(force?: string) {
  if (force === "openai" && OPENAI_KEY) return { url: "https://api.openai.com/v1/audio/transcriptions", key: OPENAI_KEY, model: "whisper-1", usdHr: 0.36, name: "openai" };
  if (GROQ_KEY) return { url: "https://api.groq.com/openai/v1/audio/transcriptions", key: GROQ_KEY, model: "whisper-large-v3", usdHr: 0.111, name: "groq" };
  if (OPENAI_KEY) return { url: "https://api.openai.com/v1/audio/transcriptions", key: OPENAI_KEY, model: "whisper-1", usdHr: 0.36, name: "openai" };
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Auth: secreto del motor (cron) o service role (manual).
    const bearer = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
    const cronSecret = (req.headers.get("x-cron-secret") || "").trim();
    let authOk = SERVICE_ROLE && bearer === SERVICE_ROLE;
    if (!authOk && cronSecret) {
      const row = (await rGet(`motor_config?key=eq.cron_secret&select=value`))[0];
      authOk = !!row && String((row.value as string) ?? "") === cronSecret;
    }
    if (!authOk) return json({ ok: false, error: "no autorizado" }, 401);
    if (!BUNNY_HOST) return json({ ok: false, error: "falta BUNNY_HOSTNAME" }, 500);

    const body = await req.json().catch(() => ({}));
    const prov = resolveProvider(body.provider);
    if (!prov) return json({ ok: false, error: "no_transcription_key" }, 500);
    const LIMIT = Math.max(1, Math.min(8, Number(body.limit) || BATCH_MAX));

    // Respetar la pausa global (misma llave que transcribir-batch: OpenAI sin saldo).
    // deno-lint-ignore no-explicit-any
    const st: any = (await rGet(`app_settings?key=eq.transcribe_batch_state&select=value`))[0]?.value || {};
    if (st.paused) return json({ ok: true, paused: true, reason: st.reason || "paused" });

    // Pendientes: video de Bunny sin estado (la migración marcó 'ok' a los que ya
    // tenían transcript). Los 'pendiente_240p' se reintentan (Bunny pudo terminar
    // de codificar).
    const pend = await rGet(
      `funnel_resources?kind=eq.video&provider=eq.bunny&bunny_id=not.is.null` +
      `&or=(transcript_status.is.null,transcript_status.eq.pendiente_240p)` +
      `&select=id,title,bunny_id,size_bytes,created_at&order=created_at.desc&limit=${LIMIT}`,
    );
    if (!pend.length) return json({ ok: true, done: 0, msg: "sin pendientes" });
    const ids = pend.map((x) => `"${String(x.id)}"`).join(",");
    await rPatch(`funnel_resources?id=in.(${ids})`, { transcript_status: "processing" });

    let ok = 0, err = 0, wait240 = 0, noaudio = 0, big = 0, secs = 0;
    const errores: string[] = [];
    for (const row of pend) {
      const fr = row as { id: string; title: string; bunny_id: string; created_at: string };
      try {
        const url = `https://${BUNNY_HOST}/${fr.bunny_id}/play_240p.mp4`;
        const dl = await fetch(url);
        if (dl.status === 404 || dl.status === 403) {
          // Bunny aún no codificó el 240p (video recién subido) → reintentar en la
          // próxima corrida. Si el video tiene >7 días y sigue sin 240p, es terminal.
          const dias = (Date.now() - new Date(fr.created_at).getTime()) / 86400000;
          await rPatch(`funnel_resources?id=eq.${fr.id}`, { transcript_status: dias > 7 ? "sin_240p" : "pendiente_240p" });
          wait240++;
          continue;
        }
        if (!dl.ok) throw new Error("bunny240 " + dl.status);
        const buf = new Uint8Array(await dl.arrayBuffer());
        if (buf.length > HARD_MAX_BYTES) { await rPatch(`funnel_resources?id=eq.${fr.id}`, { transcript_status: "too_big" }); big++; continue; }

        const fd = new FormData();
        fd.append("file", new Blob([buf], { type: "video/mp4" }), "clip.mp4");
        fd.append("model", prov.model);
        fd.append("language", "es");
        fd.append("response_format", "verbose_json");
        fd.append("temperature", "0");
        const gr = await fetch(prov.url, { method: "POST", headers: { Authorization: `Bearer ${prov.key}` }, body: fd, signal: AbortSignal.timeout(120000) });
        if (!gr.ok) {
          const detail = (await gr.text().catch(() => "")).slice(0, 200);
          if (gr.status === 429) { await rPatch(`funnel_resources?id=eq.${fr.id}`, { transcript_status: null }); err++; errores.push(`${fr.title}: 429`); await sleep(1500); continue; }
          if (/no audio track|could not|unsupported/i.test(detail)) { await rPatch(`funnel_resources?id=eq.${fr.id}`, { transcript_status: "sin_audio" }); noaudio++; continue; }
          throw new Error(`whisper ${gr.status} ${detail}`);
        }
        const out = await gr.json();
        const text = String(out?.text || "").trim();
        secs += Number(out?.duration || 0);
        await rPatch(`funnel_resources?id=eq.${fr.id}`, { transcript: text, transcript_lang: "es", transcript_status: "ok", transcript_at: new Date().toISOString() });
        ok++;
        await sleep(400);
      } catch (e) {
        err++; errores.push(`${fr.title}: ${String((e as Error)?.message || e)}`);
        await rPatch(`funnel_resources?id=eq.${fr.id}`, { transcript_status: "error" }).catch(() => {});
      }
    }

    if (secs > 0) {
      await rInsert("api_usage", {
        fn: "transcribir-recursos", model: prov.model, status: "ok",
        cost_usd: Number((secs / 3600 * prov.usdHr).toFixed(4)),
        meta: { videos: ok, seconds: Math.round(secs), provider: prov.name },
      }).catch(() => {});
    }
    return json({ ok: true, done: ok, pendiente_240p: wait240, too_big: big, sin_audio: noaudio, err, seconds: Math.round(secs), errores: errores.slice(0, 5) });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
