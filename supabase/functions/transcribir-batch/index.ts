// supabase/functions/transcribir-batch/index.ts
// Transcribe un LOTE de VIDEOS (client_drive_nodes) con Whisper. Dos modos:
//   mode='small' (default): baja el ORIGINAL del Drive (videos <= max_mb) y lo manda a Whisper.
//   mode='big'            : para los videos grandes, baja la versión 240p LIVIANA de Bunny
//                           (URL firmada con el token del pull zone) → mucho menos peso.
// En ambos, si el archivo entra en 24MB va directo a Whisper (decodifica mov/mp4 por contenido).
// Los que ni en 240p entran en 24MB → 'too_big' (quedan para pasada con ffmpeg / importantes).
//
// Proveedor: Groq si está GROQ_BATCH_KEY (barato); si no, OpenAI. Guarda texto en
// client_drive_nodes.transcript y registra costo en api_usage. Sin imports (PostgREST directo).
// Body: { limit?, max_mb?, mode? }   Auth: Bearer <MIGRAR_TOKEN | service_role>.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MIGRAR_TOKEN = Deno.env.get("MIGRAR_TOKEN") ?? "";
const GROQ_KEY = Deno.env.get("GROQ_BATCH_KEY") ?? "";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL_OVERRIDE = Deno.env.get("TRANSCRIBE_MODEL") || "";
// Bunny: host del pull zone + clave de Token Authentication (para firmar las URLs del CDN).
const BUNNY_HOST = Deno.env.get("BUNNY_HOSTNAME") ?? "";
const BUNNY_TOKEN_KEY = Deno.env.get("bonny_token") ?? Deno.env.get("BUNNY_TOKEN_KEY") ?? "";

function resolveProvider(): { url: string; key: string; model: string; usdHr: number } | null {
  if (GROQ_KEY) return { url: "https://api.groq.com/openai/v1/audio/transcriptions", key: GROQ_KEY, model: MODEL_OVERRIDE || "whisper-large-v3", usdHr: 0.111 };
  if (OPENAI_KEY) return { url: "https://api.openai.com/v1/audio/transcriptions", key: OPENAI_KEY, model: MODEL_OVERRIDE || "whisper-1", usdHr: 0.36 };
  return null;
}
const BATCH_MAX = 6;
const HARD_MAX_BYTES = 24 * 1024 * 1024;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
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
const inList = (ids: string[]) => `in.(${ids.map((x) => `"${x}"`).join(",")})`;

// Marca la transcripción como PAUSADA (app_settings.transcribe_batch_state) y avisa por Slack
// cuando OpenAI se queda SIN SALDO. Reusa el bot de venta_form_config + canal de soporte_config.
async function pausarYAvisar(reason: string, detail: string): Promise<void> {
  try {
    await fetch(REST + "app_settings?on_conflict=key", {
      method: "POST",
      headers: hdr({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ key: "transcribe_batch_state", value: { paused: true, reason, at: new Date().toISOString(), detail: detail.slice(0, 180) } }),
    });
    // deno-lint-ignore no-explicit-any
    const cfg: any = (await rGet(`app_settings?key=eq.venta_form_config&select=value`))[0]?.value || {};
    const token = String(cfg.slack_bot_token || "");
    if (!token) return;
    // deno-lint-ignore no-explicit-any
    const sc: any = (await rGet(`app_settings?key=eq.soporte_config&select=value`))[0]?.value || {};
    const channel = String(sc.alertas_channel || "#alertas-general");
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, text: `🔴 *Transcripción de videos PAUSADA* — OpenAI sin saldo. Cargá crédito en OpenAI y avisá para reanudar.\n_${detail.slice(0, 150)}_` }),
    });
  } catch (_e) { /* nunca romper por la alerta */ }
}

// Firma una ruta del CDN de Bunny (Token Authentication): sha256(key + path + expires) base64url.
async function signBunny(path: string): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(BUNNY_TOKEN_KEY + path + expires));
  let bin = ""; for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  const token = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `https://${BUNNY_HOST}${path}?token=${token}&expires=${expires}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
    if (!((SERVICE_ROLE && auth === SERVICE_ROLE) || (MIGRAR_TOKEN && auth === MIGRAR_TOKEN))) return json({ ok: false, error: "no autorizado" }, 401);
    const prov = resolveProvider();
    if (!prov) return json({ ok: false, error: "no_transcription_key" }, 500);

    const body = await req.json().catch(() => ({}));

    // Modo puntual STATELESS: transcribe el PREFIJO del 240p de un video de Bunny (para VSLs
    // too_big). Permite forzar OpenAI (body.provider='openai') si Groq tocó su límite diario.
    // No toca la base; devuelve { ok, text }. Body: { transcribe_bunny, range_mb?, provider? }.
    if (body.transcribe_bunny) {
      const useOpenAI = body.provider === "openai" && OPENAI_KEY;
      const p = useOpenAI ? { url: "https://api.openai.com/v1/audio/transcriptions", key: OPENAI_KEY, model: "whisper-1" } : prov;
      const rangeMb = Math.max(1, Math.min(24, Number(body.range_mb) || 22));
      const url = `https://${BUNNY_HOST}/${body.transcribe_bunny}/play_240p.mp4`;
      const dl = await fetch(url, { headers: { Range: `bytes=0-${rangeMb * 1024 * 1024}` } });
      if (!dl.ok && dl.status !== 206) return json({ ok: false, error: `bunny ${dl.status}` });
      const buf = new Uint8Array(await dl.arrayBuffer());
      const fd = new FormData();
      fd.append("file", new Blob([buf], { type: "video/mp4" }), "clip.mp4");
      fd.append("model", p.model);
      fd.append("language", "es");
      fd.append("response_format", "text");
      const gr = await fetch(p.url, { method: "POST", headers: { Authorization: `Bearer ${p.key}` }, body: fd, signal: AbortSignal.timeout(120000) });
      const t = await gr.text();
      return json({ ok: gr.ok, status: gr.status, provider: useOpenAI ? "openai" : "groq", text: gr.ok ? t.trim() : t.slice(0, 200) });
    }

    // ── DEBUG: probar variantes de firma del CDN de Bunny contra un guid ──
    if (body.debug_guid) {
      const guid = String(body.debug_guid);
      const path = `/${guid}/play_240p.mp4`;
      const dir = `/${guid}/`;
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const enc = new TextEncoder();
      const b64url = (buf: ArrayBuffer) => { let s = ""; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
      const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const sha = (s: string) => crypto.subtle.digest("SHA-256", enc.encode(s));
      const variants: Record<string, string> = {};
      variants["A_file_b64"] = `https://${BUNNY_HOST}${path}?token=${b64url(await sha(BUNNY_TOKEN_KEY + path + exp))}&expires=${exp}`;
      variants["B_file_hex"] = `https://${BUNNY_HOST}${path}?token=${hex(await sha(BUNNY_TOKEN_KEY + path + exp))}&expires=${exp}`;
      variants["C_dir_b64_tokenpath"] = `https://${BUNNY_HOST}${path}?token=${b64url(await sha(BUNNY_TOKEN_KEY + dir + exp))}&expires=${exp}&token_path=${encodeURIComponent(dir)}`;
      variants["D_dir_hex_tokenpath"] = `https://${BUNNY_HOST}${path}?token=${hex(await sha(BUNNY_TOKEN_KEY + dir + exp))}&expires=${exp}&token_path=${encodeURIComponent(dir)}`;
      variants["E_guid_hex_stream"] = `https://${BUNNY_HOST}${path}?token=${hex(await sha(BUNNY_TOKEN_KEY + guid + exp))}&expires=${exp}`;
      const out: Record<string, number> = {};
      for (const [k, u] of Object.entries(variants)) {
        try { const r = await fetch(u, { method: "GET", headers: { Range: "bytes=0-1" } }); out[k] = r.status; } catch { out[k] = -1; }
      }
      return json({ ok: true, guid, results: out });
    }

    const LIMIT = Math.max(1, Math.min(BATCH_MAX, Number(body.limit) || BATCH_MAX));
    const MODE = body.mode === "big" ? "big" : "small";
    const capBytes = HARD_MAX_BYTES;
    // proveedor efectivo del lote: se puede forzar OpenAI (body.provider='openai') p.ej. cuando
    // Groq tocó su límite diario. Default = resolveProvider() (Groq si hay key, si no OpenAI).
    const bprov = (body.provider === "openai" && OPENAI_KEY)
      ? { url: "https://api.openai.com/v1/audio/transcriptions", key: OPENAI_KEY, model: "whisper-1", usdHr: 0.36 }
      : prov;
    // filtro opcional por cliente (para priorizar clientes puntuales)
    const CIDS: string[] = Array.isArray(body.client_ids) ? body.client_ids.map((c: unknown) => String(c)).filter(Boolean) : [];
    const cidFilter = CIDS.length ? `&client_id=in.(${CIDS.map((c) => `"${c}"`).join(",")})` : "";

    // ¿pausado por falta de saldo? (se limpia cuando Matías reanuda)
    // deno-lint-ignore no-explicit-any
    const st: any = (await rGet(`app_settings?key=eq.transcribe_batch_state&select=value`))[0]?.value || {};
    if (st.paused) return json({ ok: true, paused: true, reason: st.reason || "paused" });

    // Todo se transcribe desde el 240p de Bunny (siempre .mp4 → OpenAI lo acepta; los .mov del
    // Drive OpenAI los rechaza). El modo solo prioriza: 'small' = originales chicos primero.
    if (!BUNNY_HOST) return json({ ok: false, error: "falta BUNNY_HOSTNAME" }, 500);

    // reservar lote: chicos = size<=cap ; grandes = size>cap
    const sizeFilter = MODE === "small" ? `size_bytes=lte.${capBytes}` : `size_bytes=gt.${capBytes}`;
    const order = MODE === "small" ? "size_bytes.asc" : "size_bytes.asc";
    const ids0 = await rGet(`client_drive_nodes?node_type=eq.video&transcript_status=is.null&${sizeFilter}${cidFilter}&select=id&order=${order}&limit=${LIMIT}`);
    const ids = ids0.map((x) => String(x.id));
    if (!ids.length) return json({ ok: true, mode: MODE, done: 0, remaining: 0, msg: "no quedan pendientes en este modo" });
    await rPatch(`client_drive_nodes?id=${inList(ids)}`, { transcript_status: "processing" });
    const batch = await rGet(`client_drive_nodes?id=${inList(ids)}&select=id,name,size_bytes,client_id`);

    let ok = 0, big = 0, err = 0, noaudio = 0, secs = 0; const errores: string[] = [];
    for (const node of batch) {
      const nd = node as { id: string; name: string; size_bytes?: number; client_id: string };
      try {
        let buf: Uint8Array;
        {
          // buscar el guid de Bunny (match por client_id + título + tamaño exacto) → bajar 240p mp4
          const title = nd.name.replace(/\.[^.]+$/, "").toLowerCase();
          const frs = await rGet(`funnel_resources?client_id=eq.${nd.client_id}&provider=eq.bunny&kind=eq.video&select=bunny_id,title,size_bytes&limit=600`);
          const match = frs.find((f) => String(f.title).toLowerCase() === title && Number(f.size_bytes) === Number(nd.size_bytes))
            || frs.find((f) => String(f.title).toLowerCase() === title) || null;
          const guid = match?.bunny_id ? String(match.bunny_id) : "";
          if (!guid) { await rPatch(`client_drive_nodes?id=eq.${nd.id}`, { transcript_status: "sin_guid" }); big++; errores.push(`${nd.name}: sin guid en Bunny`); continue; }
          // "Block direct url file access" está OFF durante el batch → URL directa (sin firmar).
          const url = `https://${BUNNY_HOST}/${guid}/play_240p.mp4`;
          const dl = await fetch(url);
          if (!dl.ok) throw new Error("bunny240 " + dl.status);
          buf = new Uint8Array(await dl.arrayBuffer());
        }

        if (buf.length > HARD_MAX_BYTES) { await rPatch(`client_drive_nodes?id=eq.${nd.id}`, { transcript_status: "too_big" }); big++; continue; }

        const fd = new FormData();
        fd.append("file", new Blob([buf], { type: "video/mp4" }), "clip.mp4");
        fd.append("model", bprov.model);
        fd.append("language", "es");
        fd.append("response_format", "verbose_json");
        fd.append("temperature", "0");
        const gr = await fetch(bprov.url, { method: "POST", headers: { Authorization: `Bearer ${bprov.key}` }, body: fd, signal: AbortSignal.timeout(120000) });
        if (!gr.ok) {
          const detail = (await gr.text().catch(() => "")).slice(0, 200);
          // SIN SALDO (OpenAI): pausar TODO y avisar por Slack. No reintentar en loop.
          if (/insufficient_quota|exceeded your current quota|billing|check your plan/i.test(detail)) {
            await rPatch(`client_drive_nodes?id=eq.${nd.id}`, { transcript_status: null });
            await pausarYAvisar("openai_sin_saldo", detail);
            return json({ ok: true, paused: true, reason: "openai_sin_saldo", done: ok, detail });
          }
          if (gr.status === 429) { await rPatch(`client_drive_nodes?id=eq.${nd.id}`, { transcript_status: null }); err++; errores.push(`${nd.name}: 429`); await sleep(1500); continue; }
          if (/no audio track|could not|unsupported/i.test(detail)) { await rPatch(`client_drive_nodes?id=eq.${nd.id}`, { transcript_status: "sin_audio", transcript_at: new Date().toISOString() }); noaudio++; continue; }
          throw new Error(`whisper ${gr.status} ${detail}`);
        }
        const out = await gr.json();
        const text = String(out?.text || "").trim();
        const dur = Number(out?.duration || 0);
        secs += dur;
        await rPatch(`client_drive_nodes?id=eq.${nd.id}`, { transcript: text, transcript_status: "ok", transcript_at: new Date().toISOString(), transcript_sec: dur });
        ok++;
        await sleep(400);
      } catch (e) {
        err++; errores.push(`${nd.name}: ${String((e as Error)?.message || e)}`);
        await rPatch(`client_drive_nodes?id=eq.${nd.id}`, { transcript_status: "error" });
      }
    }

    if (secs > 0) {
      await rInsert("api_usage", {
        fn: "transcribir-batch", model: bprov.model, status: "ok",
        cost_usd: Number((secs / 3600 * bprov.usdHr).toFixed(4)),
        meta: { videos: ok, seconds: Math.round(secs), price_per_hour: bprov.usdHr, mode: MODE, provider: bprov.url.includes("groq") ? "groq" : "openai" },
      }).catch(() => {});
    }
    const rem = await rGet(`client_drive_nodes?node_type=eq.video&transcript_status=is.null&${sizeFilter}${cidFilter}&select=id`);
    return json({ ok: true, mode: MODE, done: ok, too_big: big, sin_audio: noaudio, err, seconds: Math.round(secs), remaining: rem.length, errores: errores.slice(0, 5) });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
