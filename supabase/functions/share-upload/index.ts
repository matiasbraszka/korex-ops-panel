// supabase/functions/share-upload/index.ts
// Subida de archivos por EXTERNOS a una carpeta compartida por link (share_links kind='folder').
// El externo no tiene cuenta: validamos el TOKEN del link (no la sesión) y escribimos con
// service role (funnel_resources y el bucket son admin-only por RLS). Imágenes van por base64;
// videos van a Bunny con subida directa TUS (misma firma que bunny-video), y después se
// registra la fila. Los uploads caen DIRECTO en la carpeta y quedan atribuidos al nombre.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BUNNY_API_KEY, BUNNY_LIBRARY_ID, BUNNY_HOSTNAME

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUNNY_KEY = Deno.env.get("BUNNY_API_KEY") ?? "";
const BUNNY_LIB = Deno.env.get("BUNNY_LIBRARY_ID") ?? "";
const BUNNY_HOST = Deno.env.get("BUNNY_HOSTNAME") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const BUCKET = "funnel-recursos";
const MAX_IMG_BYTES = 25 * 1024 * 1024; // 25 MB por imagen (los videos van por TUS, sin este límite)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const j = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const clean = (s: unknown, max = 200) => Array.from(String(s ?? "")).filter((c) => c.charCodeAt(0) >= 32).join("").trim().slice(0, max);
const safeName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function decodeBase64(input: string): { bytes: Uint8Array; mime: string } | null {
  try {
    let mime = "application/octet-stream", b64 = input;
    const m = input.match(/^data:([^;]+);base64,(.*)$/s);
    if (m) { mime = m[1]; b64 = m[2]; }
    const bin = atob(b64.replace(/\s/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime };
  } catch { return null; }
}
const extFromMime = (mime: string) => (({ "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic" } as Record<string, string>)[mime.toLowerCase()] || "bin");

// Base de columnas de scope según la carpeta del link (igual que FunnelResourceFolder).
// OJO: funnel_resources.version es NOT NULL con default → en scope cliente NO se manda
// (se deja el default); mandar null rompería el insert.
function scopeBase(l: Record<string, unknown>) {
  const clientScope = !l.strategy_id;
  return clientScope
    ? { strategy_id: null, client_id: l.client_id, avatar_id: null }
    : { strategy_id: l.strategy_id, client_id: l.client_id, avatar_id: l.avatar_id ?? null, version: l.version ?? 1 };
}
function pathBase(l: Record<string, unknown>) {
  return l.strategy_id ? `${l.strategy_id}/${l.avatar_id || "cliente"}` : `cliente/${l.client_id}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j(405, { ok: false, error: "method" });

  let body: Record<string, unknown> = {};
  try { body = await req.json() as Record<string, unknown>; } catch { /* */ }
  const token = clean(body.token, 40);
  const action = clean(body.action, 20) || "image";
  const nombre = clean(body.name, 80) || "Externo";
  if (!/^[A-Za-z0-9]{1,40}$/.test(token)) return j(400, { ok: false, error: "token" });

  // Validar el link (carpeta, no revocado).
  const { data: link } = await admin.from("share_links").select("*").eq("token", token).eq("revoked", false).eq("kind", "folder").maybeSingle();
  if (!link) return j(403, { ok: false, error: "link" });
  const base = scopeBase(link);
  const bucketKey = link.bucket_key as string;
  const by = `externo:${nombre}`;

  try {
    // ── Imagen (base64) → Storage + fila ──
    if (action === "image") {
      const titulo = clean(body.title, 160) || "Imagen";
      const decoded = decodeBase64(String(body.dataUrl ?? ""));
      if (!decoded) return j(400, { ok: false, error: "file" });
      if (!decoded.mime.startsWith("image/")) return j(400, { ok: false, error: "not_image" });
      if (decoded.bytes.byteLength > MAX_IMG_BYTES) return j(413, { ok: false, error: "too_large" });
      const path = `${pathBase(link)}/${bucketKey}/${Date.now()}_${safeName(titulo)}.${extFromMime(decoded.mime)}`;
      const up = await admin.storage.from(BUCKET).upload(path, decoded.bytes, { contentType: decoded.mime, upsert: false });
      if (up.error) return j(500, { ok: false, error: "upload", detail: up.error.message });
      const pub = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const { data: row, error } = await admin.from("funnel_resources").insert({
        ...base, bucket_key: bucketKey, title: titulo, provider: "supabase", storage_path: path, public_url: pub,
        mime_type: decoded.mime, kind: "image", size_bytes: decoded.bytes.byteLength, created_by: by,
      }).select("id,title,public_url,kind").single();
      if (error) return j(500, { ok: false, error: "insert", detail: error.message });
      return j(200, { ok: true, resource: row });
    }

    // ── Video: crear en Bunny y firmar el TUS (el navegador sube directo) ──
    if (action === "bunny-create") {
      if (!BUNNY_KEY || !BUNNY_LIB) return j(500, { ok: false, error: "bunny_not_configured" });
      const titulo = clean(body.title, 160) || "Video";
      const cr = await fetch(`https://video.bunnycdn.com/library/${BUNNY_LIB}/videos`, {
        method: "POST", headers: { AccessKey: BUNNY_KEY, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ title: titulo }),
      });
      if (!cr.ok) return j(502, { ok: false, error: "bunny_create_failed", detail: await cr.text() });
      const vid = await cr.json() as Record<string, unknown>;
      const guid = String(vid?.guid ?? "");
      if (!guid) return j(502, { ok: false, error: "bunny_no_guid" });
      const expiration = Math.floor(Date.now() / 1000) + 3600;
      const signature = await sha256hex(`${BUNNY_LIB}${BUNNY_KEY}${expiration}${guid}`);
      return j(200, {
        ok: true, videoId: guid, libraryId: Number(BUNNY_LIB), hostname: BUNNY_HOST,
        expiration, signature, tusEndpoint: "https://video.bunnycdn.com/tusupload",
        embedUrl: `https://iframe.mediadelivery.net/embed/${BUNNY_LIB}/${guid}`,
      });
    }

    // ── Video: registrar la fila tras el TUS OK ──
    if (action === "bunny-commit") {
      const titulo = clean(body.title, 160) || "Video";
      const videoId = clean(body.videoId, 64);
      const embedUrl = clean(body.embedUrl, 300);
      const thumbUrl = clean(body.thumbUrl, 300);
      if (!videoId) return j(400, { ok: false, error: "video_id" });
      const { data: row, error } = await admin.from("funnel_resources").insert({
        ...base, bucket_key: bucketKey, title: titulo, provider: "bunny", bunny_id: videoId,
        storage_path: thumbUrl || embedUrl || "", public_url: embedUrl || null, kind: "video", created_by: by,
      }).select("id,title,public_url,kind").single();
      if (error) return j(500, { ok: false, error: "insert", detail: error.message });
      return j(200, { ok: true, resource: row });
    }

    // ── Borrar un archivo que subió ESTE MISMO externo ──
    if (action === "delete") {
      const resourceId = clean(body.resourceId, 64);
      if (!resourceId) return j(400, { ok: false, error: "resource_id" });
      // Traer la fila y comprobar que es de ESTA carpeta y la subió ESTE externo (por su nombre).
      const { data: r } = await admin.from("funnel_resources")
        .select("id,provider,bunny_id,storage_path,created_by,client_id,bucket_key,strategy_id,avatar_id")
        .eq("id", resourceId).maybeSingle();
      if (!r) return j(404, { ok: false, error: "not_found" });
      const mismaCarpeta = r.client_id === link.client_id && r.bucket_key === link.bucket_key
        && (r.strategy_id ?? null) === (link.strategy_id ?? null) && (r.avatar_id ?? null) === (link.avatar_id ?? null);
      if (!mismaCarpeta) return j(403, { ok: false, error: "scope" });
      if (r.created_by !== by) return j(403, { ok: false, error: "not_yours" }); // solo lo propio
      // Borrar del proveedor + la fila.
      if (r.provider === "bunny" && r.bunny_id && BUNNY_KEY && BUNNY_LIB) {
        await fetch(`https://video.bunnycdn.com/library/${BUNNY_LIB}/videos/${r.bunny_id}`, { method: "DELETE", headers: { AccessKey: BUNNY_KEY, accept: "application/json" } }).catch(() => {});
      } else if (r.provider === "supabase" && r.storage_path) {
        await admin.storage.from(BUCKET).remove([r.storage_path]).catch(() => {});
      }
      const { error } = await admin.from("funnel_resources").delete().eq("id", resourceId);
      if (error) return j(500, { ok: false, error: "delete", detail: error.message });
      return j(200, { ok: true });
    }

    return j(400, { ok: false, error: "bad_action" });
  } catch (e) {
    return j(500, { ok: false, error: "server", detail: String((e as Error)?.message || e) });
  }
});
