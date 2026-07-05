// supabase/functions/whatsapp-media/index.ts
// Devuelve una URL firmada para ver/descargar el archivo de un mensaje de
// WhatsApp (imagen, audio, video, documento, sticker).
//
// Primera vez: pide el archivo desencriptado a Evolution
// (/chat/getBase64FromMediaMessage), lo sube al bucket privado wa-media y
// guarda media_path/mime/filename en wa_messages. Siguientes veces: solo
// genera la signed URL (1h) desde Storage — rapido y sin depender del puente.
//
// Auth: verify_jwt=true + permiso soporte:read.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const BUCKET = "wa-media";
const MAX_BYTES = 25 * 1024 * 1024; // 25MB: tope defensivo

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function authorizeSoporteRead(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return false;
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const roleNames = (roles || []).map((r: { role: string }) => r.role);
  if (roleNames.includes("admin")) return true;
  if (roleNames.length === 0) return false;
  const { data: perms } = await admin
    .from("role_permissions").select("role")
    .in("role", roleNames).eq("module", "soporte").eq("can_read", true).limit(1);
  return (perms || []).length > 0;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav",
  "video/mp4": "mp4", "video/3gpp": "3gp", "video/quicktime": "mov",
  "application/pdf": "pdf",
};

function extFor(mime: string, fileName?: string): string {
  const fromName = (fileName || "").split(".").pop();
  if (fromName && fromName.length <= 5 && fromName !== fileName) return fromName.toLowerCase();
  return EXT_BY_MIME[(mime || "").split(";")[0]] || "bin";
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  if (!(await authorizeSoporteRead(req))) return jsonResp(403, { error: "forbidden" });

  let body: { message_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResp(400, { error: "bad_json" });
  }
  const msgId = String(body.message_id || "");
  if (!msgId) return jsonResp(400, { error: "missing_fields" });

  const { data: msg } = await admin
    .from("wa_messages")
    .select("id, conversation_id, wa_message_id, msg_type, payload, media_path, media_mime, media_filename")
    .eq("id", msgId)
    .maybeSingle();
  if (!msg) return jsonResp(404, { error: "message_not_found" });

  // ── Ya cacheado en Storage: solo firmar ──
  if (msg.media_path) {
    const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrl(msg.media_path, 3600);
    if (!error && signed?.signedUrl) {
      return jsonResp(200, { ok: true, url: signed.signedUrl, mime: msg.media_mime, filename: msg.media_filename });
    }
    // Si el objeto se perdio, seguimos al fetch desde Evolution.
  }

  // ── Pedir a Evolution el archivo desencriptado ──
  const { data: s } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const cfg = (s?.value as Record<string, string> | null) ?? {};
  const serverUrl = (cfg.server_url || "").replace(/\/$/, "");
  const apiKey = cfg.evolution_api_key || "";
  const instance = cfg.instance_name || "korex-soporte";
  if (!serverUrl || !apiKey) return jsonResp(502, { error: "evolution_not_configured" });

  // Descarga con DOS intentos para maximizar exito:
  //  1) por id (el metodo simple; funciona para media reciente que Evolution
  //     todavia tiene en su store interno);
  //  2) fallback con el nodo Baileys COMPLETO guardado (key + message con
  //     mediaKey/directPath) por si el store de Evolution ya expiro el mensaje.
  // Si ambos fallan, la media ya no es recuperable (WhatsApp la expiro).
  const stored = (msg.payload as Record<string, any>) ?? {};
  async function fetchFromEvolution(payload: Record<string, any>): Promise<Record<string, any> | null> {
    try {
      const r = await fetch(`${serverUrl}/chat/getBase64FromMediaMessage/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ message: payload, convertToMp4: false }),
        signal: AbortSignal.timeout(40000),
      });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.base64) return j;
      console.error("whatsapp-media: Evolution sin base64", r.status, j?.message || null);
      return null;
    } catch (e) {
      console.error("whatsapp-media: Evolution inalcanzable", e);
      return null;
    }
  }

  let media = await fetchFromEvolution({ key: { id: msg.wa_message_id } });
  if (!media && stored.message) {
    media = await fetchFromEvolution({ key: stored.key ?? { id: msg.wa_message_id }, message: stored.message });
  }
  if (!media?.base64) {
    return jsonResp(502, { error: "media_unavailable" });
  }

  const mime = String(media.mimetype || "application/octet-stream").split(";")[0];
  // Nombre amable: el del documento si existe (payload), sino el de Evolution.
  const payloadDoc = (msg.payload as Record<string, any>)?.message?.documentMessage;
  const filename = String(payloadDoc?.fileName || media.fileName || `${msg.wa_message_id}.${extFor(mime)}`);

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(String(media.base64));
  } catch {
    return jsonResp(502, { error: "bad_media" });
  }
  if (bytes.length > MAX_BYTES) return jsonResp(413, { error: "too_big" });

  const path = `${msg.conversation_id}/${msg.wa_message_id}.${extFor(mime, filename)}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (upErr) {
    console.error("whatsapp-media: error subiendo a storage", upErr);
    return jsonResp(500, { error: "storage_error" });
  }

  await admin.from("wa_messages")
    .update({ media_path: path, media_mime: mime, media_filename: filename })
    .eq("id", msg.id);

  const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (signErr || !signed?.signedUrl) return jsonResp(500, { error: "sign_error" });

  return jsonResp(200, { ok: true, url: signed.signedUrl, mime, filename });
});
