// supabase/functions/ingest-testimonios-korex/index.ts
// Ingesta ÚNICA (one-off): baja las CAPTURAS (imágenes) de la carpeta compartida "Resultados socios"
// del Drive → Supabase Storage, en la carpeta de nivel CLIENTE "Testimonios Korex" (bucket_key
// 'testimonios_korex', scope cliente: strategy_id/avatar_id NULL → aplica a todos los funnels).
//
// Recibe un mapeo { folders: [{folderId, clientId}] }. Por cada carpeta lista su árbol (Apps Script),
// junta TODAS las imágenes (recursivo, subcarpetas incluidas), las baja con el token de Drive y las
// sube a storage. Idempotente: si ya existe una fila con el mismo (client_id, bucket, título), la saltea.
// Videos/audios NO (el pedido es "las capturas"). Auth: Bearer service_role.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "funnel-recursos";
const CAT = "testimonios_korex";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const safe = (s: string) => String(s || "archivo").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
const titleOf = (s: string) => String(s || "Captura").replace(/\.[^.]+$/, "");

// deno-lint-ignore no-explicit-any
async function appScript(url: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error("appscript http " + res.status);
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const auth = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
    const gotSecret = req.headers.get("x-cron-secret") || "";
    const { data: sp } = await sb.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
    // deno-lint-ignore no-explicit-any
    const cronSecret = String((sp?.value as any)?.cron_secret || "");
    if (!((cronSecret && gotSecret === cronSecret) || (SERVICE_ROLE && auth === SERVICE_ROLE))) return json({ ok: false, error: "no autorizado" }, 401);

    const body = await req.json().catch(() => ({}));
    const folders = Array.isArray(body?.folders) ? body.folders as { folderId: string; clientId: string }[] : [];
    if (!folders.length) return json({ ok: false, error: "sin folders" }, 400);

    const { data: cfg } = await sb.from("app_settings").select("value").eq("key", "venta_form_config").single();
    // deno-lint-ignore no-explicit-any
    const v: any = cfg?.value || {};
    const tok = await appScript(v.appscript_url, { secret: v.appscript_secret, action: "get_drive_token" });
    const TOKEN = tok.token;
    if (!TOKEN) return json({ ok: false, error: "sin token de Drive" }, 500);

    const results: Record<string, unknown>[] = [];
    for (const f of folders) {
      let ok = 0, skip = 0, err = 0, imgs = 0;
      try {
        const tree = await appScript(v.appscript_url, { secret: v.appscript_secret, action: "list_folder_tree", folderId: f.folderId });
        // deno-lint-ignore no-explicit-any
        const nodes = (tree?.nodes || []) as any[];
        const images = nodes.filter((n) => String(n.mimeType || "").startsWith("image/"));
        imgs = images.length;
        for (const n of images) {
          const title = titleOf(n.name);
          try {
            // Dedup: ya existe esta captura en la carpeta del cliente
            const { data: exists } = await sb.from("funnel_resources").select("id")
              .eq("client_id", f.clientId).eq("bucket_key", CAT).is("strategy_id", null).eq("title", title).limit(1);
            if (exists && exists.length) { skip++; continue; }

            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${n.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: "Bearer " + TOKEN } });
            if (!res.ok) throw new Error("drive " + res.status);
            const buf = new Uint8Array(await res.arrayBuffer());
            const mime = String(n.mimeType || "image/jpeg");
            const path = `cliente/${f.clientId}/${CAT}/${Date.now()}_${safe(n.name)}`;
            const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false });
            if (up.error) throw new Error("storage " + up.error.message);
            const pub = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
            const { error: iErr } = await sb.from("funnel_resources").insert({
              strategy_id: null, client_id: f.clientId, avatar_id: null, bucket_key: CAT,
              title, provider: "supabase", storage_path: path, public_url: pub,
              mime_type: mime, kind: "image", size_bytes: buf.byteLength,
            });
            if (iErr) throw new Error("insert " + iErr.message);
            ok++;
          } catch (_e) { err++; }
        }
      } catch (e) { results.push({ folderId: f.folderId, clientId: f.clientId, error: String((e as Error)?.message || e) }); continue; }
      results.push({ folderId: f.folderId, clientId: f.clientId, imagenes: imgs, subidas: ok, saltadas: skip, errores: err });
    }
    return json({ ok: true, results });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
