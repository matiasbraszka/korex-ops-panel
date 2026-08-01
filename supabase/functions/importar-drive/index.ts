// supabase/functions/importar-drive/index.ts
// Importador ÚNICO (one-shot) de una carpeta PÚBLICA de Drive → recursos de la plataforma.
// Lo dispara el botón "Importar de Drive" del editor del DEL. NO conecta el DEL a Drive:
// lista la carpeta una vez, baja los archivos y crea las filas en funnel_resources.
//
// Reusa TODO el motor que ya existe:
//   - Enumeración + token de Drive: Apps Script (get_drive_token / list_folder_tree), como
//     ingest-testimonios-korex y migrar-videos (la cuenta de Google de Korex accede a la
//     carpeta pública/compartida; no hace falta API key nueva).
//   - Videos → Bunny Stream (fetch server-side, igual que migrar-videos) con el CANDADO de
//     gasto app_settings.bunny_guard.
//   - Imágenes/otros → Supabase Storage 'funnel-recursos' (igual que ingest-testimonios).
//   - Transcripción de videos: la hace sola transcribir-recursos (cron cada 20 min).
//   - Título/avatar/grabado-editado: los afina organizar-videos (mismo flujo que los migrados).
//
// Body (POST JSON): { folderUrl, clientId, strategyId?, bucketKey }
//   - strategyId presente  → recurso de ESE funnel.  strategyId null → carpeta GENERAL del cliente.
// Auth: JWT del usuario del panel (se verifica que sea un usuario logueado).
// Secrets: SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY, BUNNY_API_KEY, BUNNY_LIBRARY_ID, BUNNY_HOSTNAME.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const BUNNY_KEY = Deno.env.get("BUNNY_API_KEY") ?? "";
const BUNNY_LIB = Deno.env.get("BUNNY_LIBRARY_ID") ?? "";
const BUNNY_HOST = Deno.env.get("BUNNY_HOSTNAME") ?? "";
const BUCKET = "funnel-recursos";
const V = "https://video.bunnycdn.com/library";
const MAX_FILES = 60; // tope por llamada (para no exceder el tiempo de la función)

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Max-Age": "0" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Nombre de archivo seguro para Storage; título = nombre sin extensión.
const safe = (s: string) => String(s || "archivo").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
const titleOf = (s: string) => String(s || "Archivo").replace(/\.[^.]+$/, "");

// Extrae el ID de carpeta de cualquier link de Drive (mismo parser que drive-sync).
function driveId(url: string): string {
  const s = String(url || "").trim();
  let m = s.match(/\/folders\/([A-Za-z0-9_-]+)/); if (m) return m[1];
  m = s.match(/\/d\/([A-Za-z0-9_-]+)/); if (m) return m[1];
  m = s.match(/[?&]id=([A-Za-z0-9_-]+)/); if (m) return m[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s;
  return "";
}

// deno-lint-ignore no-explicit-any
async function appScript(url: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error("appscript http " + res.status);
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // 1) Verificar que llame un usuario logueado del panel (o el service_role, para
    //    llamadas internas/diagnóstico, igual que migrar-videos).
    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    let userId: string | null = null;
    let esServiceRole = bearer && SERVICE_ROLE && bearer === SERVICE_ROLE;
    if (!esServiceRole && bearer) { // fallback: rol del propio JWT
      try { esServiceRole = JSON.parse(atob(bearer.split(".")[1] || "")).role === "service_role"; } catch { /* no es jwt */ }
    }
    if (esServiceRole) {
      console.log("IMPDRIVE: llamada interna (service_role)");
    } else {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) { console.error("IMPDRIVE: sin usuario (401)"); return json({ ok: false, error: "no autorizado" }, 401); }
      userId = user.id;
      console.log("IMPDRIVE: user ok", user.id);
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const clientId = String(body.clientId || "");
    const strategyId = body.strategyId ? String(body.strategyId) : null;
    const bucketKey = String(body.bucketKey || "sin_clasif");
    const folderId = driveId(String(body.folderUrl || ""));
    if (!clientId) return json({ ok: false, error: "falta el cliente" });
    if (!folderId) return json({ ok: false, error: "El link de Drive no es válido. Pegá el link de una CARPETA de Drive." });

    // 2) Token + árbol de la carpeta (Apps Script).
    const { data: cfg } = await sb.from("app_settings").select("value").eq("key", "venta_form_config").single();
    // deno-lint-ignore no-explicit-any
    const v: any = cfg?.value || {};
    if (!v.appscript_url) return json({ ok: false, error: "falta configurar el Apps Script (venta_form_config)" });
    const tok = await appScript(v.appscript_url, { secret: v.appscript_secret, action: "get_drive_token" });
    const TOKEN = tok?.token;
    if (!TOKEN) return json({ ok: false, error: "no se pudo obtener el acceso a Drive" });

    const tree = await appScript(v.appscript_url, { secret: v.appscript_secret, action: "list_folder_tree", folderId });
    // deno-lint-ignore no-explicit-any
    const nodes = (tree?.nodes || []) as any[];
    // Archivos reales: excluye carpetas y nativos de Google (Docs/Sheets/Slides no se bajan con alt=media).
    const files = nodes.filter((n) => n.mimeType && !String(n.mimeType).startsWith("application/vnd.google-apps"));
    const total = files.length;
    const lote = files.slice(0, MAX_FILES);
    console.log("IMPDRIVE: folder", folderId, "archivos", total, "bucket", bucketKey);

    // 3) Candado de gasto de Bunny (solo importa si hay videos). Comparte el tope con migrar-videos.
    const videos = lote.filter((n) => String(n.mimeType || "").startsWith("video/"));
    let bunnyBlock = ""; let videosLeft = Number.POSITIVE_INFINITY; let PER_VIDEO = 0.005;
    if (videos.length) {
      const { data: gRows } = await sb.from("app_settings").select("value").eq("key", "bunny_guard").maybeSingle();
      // deno-lint-ignore no-explicit-any
      const guard: any = gRows?.value || {};
      PER_VIDEO = Number(guard.per_video_usd ?? 0.005);
      if (guard.enabled === false) {
        bunnyBlock = "frozen";
      } else {
        const CAP = Number(guard.daily_cap_usd ?? 10);
        const dayStart = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
        const windowStart = (guard.budget_reset_at && String(guard.budget_reset_at) > dayStart) ? String(guard.budget_reset_at) : dayStart;
        // Suma por MODELO (cuenta migrar-videos + importar-drive → tope compartido, más conservador).
        const { data: winRows } = await sb.from("api_usage").select("cost_usd").eq("model", "bunny-migracion").eq("status", "ok").gte("created_at", windowStart);
        const spent = (winRows || []).reduce((a, r) => a + Number((r as { cost_usd?: number }).cost_usd || 0), 0);
        videosLeft = Math.floor((CAP - spent) / PER_VIDEO);
        if (videosLeft < 1) bunnyBlock = "daily_cap";
      }
    }

    const H = { AccessKey: BUNNY_KEY, "Content-Type": "application/json", accept: "application/json" };
    let importados = 0, dup = 0, err = 0, vids = 0, imgs = 0, otros = 0, videosSaltados = 0;
    const errores: string[] = [];

    for (const n of lote) {
      const mime = String(n.mimeType || "");
      const isVideo = mime.startsWith("video/");
      const isImage = mime.startsWith("image/");
      const title = titleOf(n.name);
      try {
        // Dedup: ya existe un recurso con ese título en la misma carpeta destino.
        let q = sb.from("funnel_resources").select("id").eq("client_id", clientId).eq("bucket_key", bucketKey).eq("title", title).limit(1);
        q = strategyId ? q.eq("strategy_id", strategyId) : q.is("strategy_id", null);
        const { data: exists } = await q;
        if (exists && exists.length) { dup++; continue; }

        if (isVideo) {
          if (bunnyBlock || videosLeft < 1) { videosSaltados++; continue; }
          const cr = await fetch(`${V}/${BUNNY_LIB}/videos`, { method: "POST", headers: H, body: JSON.stringify({ title: n.name || "video" }) });
          if (!cr.ok) throw new Error("Bunny rechazó el alta (" + cr.status + "): " + (await cr.text()).slice(0, 140));
          const guid = String((await cr.json())?.guid || "");
          if (!guid) throw new Error("Bunny no devolvió id de video");
          const driveUrl = `https://www.googleapis.com/drive/v3/files/${n.id}?alt=media&supportsAllDrives=true`;
          const fe = await fetch(`${V}/${BUNNY_LIB}/videos/${guid}/fetch`, { method: "POST", headers: H, body: JSON.stringify({ url: driveUrl, headers: { Authorization: "Bearer " + TOKEN } }) });
          const feBody = await fe.json().catch(() => ({}));
          if (!feBody?.success && !fe.ok) throw new Error("Bunny no pudo traer el video (" + fe.status + "): " + JSON.stringify(feBody).slice(0, 140));
          await sb.from("funnel_resources").insert({
            strategy_id: strategyId, client_id: clientId, avatar_id: null, bucket_key: bucketKey,
            title, provider: "bunny", kind: "video", bunny_id: guid,
            public_url: `https://iframe.mediadelivery.net/embed/${BUNNY_LIB}/${guid}`,
            storage_path: BUNNY_HOST ? `https://${BUNNY_HOST}/${guid}/thumbnail.jpg` : null,
            mime_type: mime || "video/mp4", size_bytes: n.size || null, created_by: userId,
          });
          vids++; importados++; videosLeft--;
          await sleep(1200); // Bunny bloquea en ráfaga
        } else {
          // Imagen u otro archivo → se baja y se sube a Storage.
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${n.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: "Bearer " + TOKEN } });
          if (!res.ok) throw new Error("drive " + res.status);
          const buf = new Uint8Array(await res.arrayBuffer());
          const path = `cliente/${clientId}/${bucketKey}/${Date.now()}_${safe(n.name)}`;
          const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: mime || "application/octet-stream", upsert: false });
          if (up.error) throw new Error("storage " + up.error.message);
          const pub = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          await sb.from("funnel_resources").insert({
            strategy_id: strategyId, client_id: clientId, avatar_id: null, bucket_key: bucketKey,
            title, provider: "supabase", storage_path: path, public_url: pub,
            mime_type: mime || "application/octet-stream", kind: isImage ? "image" : "other",
            size_bytes: buf.byteLength, created_by: userId,
          });
          if (isImage) imgs++; else otros++;
          importados++;
        }
      } catch (e) { err++; const em = `${n.name}: ${String((e as Error)?.message || e)}`; errores.push(em); console.error("IMPDRIVE file:", em); }
    }
    console.log("IMPDRIVE: fin", { importados, vids, imgs, otros, dup, err });

    // Registrar el gasto estimado de Bunny (alimenta el candado + el panel "Gasto de API").
    if (vids > 0) {
      try {
        await sb.from("api_usage").insert({
          fn: "importar-drive", model: "bunny-migracion", status: "ok",
          cost_usd: Number((vids * PER_VIDEO).toFixed(4)), client_id: clientId,
          meta: { videos: vids, per_video_usd: PER_VIDEO, nota: "importador de Drive del DEL" },
        });
      } catch (_e) { /* el registro de gasto no debe romper la importación */ }
    }

    return json({
      ok: true, total, procesados: lote.length, restantes: Math.max(0, total - lote.length),
      importados, duplicados: dup, videos: vids, imagenes: imgs, otros,
      videos_saltados_por_tope: videosSaltados, bunny: bunnyBlock || null,
      errores: errores.slice(0, 5),
    });
  } catch (e) {
    console.error("IMPDRIVE fatal:", String((e as Error)?.message || e));
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
