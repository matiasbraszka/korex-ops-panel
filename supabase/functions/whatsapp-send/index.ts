// supabase/functions/whatsapp-send/index.ts
// Envia mensajes de WhatsApp desde el panel via Evolution API (Railway).
// Soporta texto y adjuntos (imagen, video, audio/nota de voz, documento).
//
// Auth: verify_jwt=true + permiso soporte:write (user_roles/role_permissions).
// Body: { conversation_id, text? , media?: { base64, mimetype, filename, kind } }
//   kind: 'image' | 'video' | 'audio' | 'document'
//
// Los adjuntos se suben tambien al bucket wa-media al enviarlos (ya tenemos
// los bytes) asi la bandeja los muestra al instante sin pedirselos a Evolution.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const BUCKET = "wa-media";
const MAX_MEDIA_BYTES = 12 * 1024 * 1024; // 12MB: margen bajo el limite del request

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

async function authorizeSoporteWrite(req: Request): Promise<{ userId: string; memberId: string | null } | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const roleNames = (roles || []).map((r: { role: string }) => r.role);
  let allowed = roleNames.includes("admin");
  if (!allowed && roleNames.length > 0) {
    const { data: perms } = await admin
      .from("role_permissions").select("role")
      .in("role", roleNames).eq("module", "soporte").eq("can_write", true).limit(1);
    allowed = (perms || []).length > 0;
  }
  if (!allowed) return null;
  const { data: member } = await admin
    .from("team_members").select("id").eq("user_id", user.id).maybeSingle();
  return { userId: user.id, memberId: member?.id ?? null };
}

interface SoporteConfig {
  server_url?: string;
  evolution_api_key?: string;
  instance_name?: string;
}

async function getConfig(): Promise<SoporteConfig> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  return (data?.value as SoporteConfig) ?? {};
}

const MSG_TYPE_BY_KIND: Record<string, string> = {
  image: "imageMessage", video: "videoMessage", audio: "audioMessage", document: "documentMessage",
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function extFromName(name: string, fallback: string): string {
  const e = (name || "").split(".").pop();
  return e && e.length <= 5 && e !== name ? e.toLowerCase() : fallback;
}

// Persiste el mensaje enviado + actualiza el preview de la conversacion.
async function persistOutgoing(args: {
  conversationId: string;
  evoData: Record<string, any>;
  msgType: string;
  body: string | null;
  memberId: string | null;
  media?: { path: string; mime: string; filename: string } | null;
  previewText: string;
}): Promise<Record<string, unknown>> {
  const { conversationId, evoData, msgType, body, memberId, media, previewText } = args;
  const tsRaw = Number(evoData.messageTimestamp ?? 0);
  const waTimestamp = tsRaw > 0 ? new Date(tsRaw * 1000).toISOString() : new Date().toISOString();
  const row: Record<string, unknown> = {
    conversation_id: conversationId,
    wa_message_id: String(evoData.key.id),
    direction: "out",
    msg_type: msgType,
    body,
    status: "sent",
    sent_by: memberId,
    payload: evoData,
    wa_timestamp: waTimestamp,
  };
  if (media) {
    row.media_path = media.path;
    row.media_mime = media.mime;
    row.media_filename = media.filename;
  }
  const { data: inserted } = await admin
    .from("wa_messages")
    .upsert(row, { onConflict: "wa_message_id", ignoreDuplicates: true })
    .select("*");
  let message = inserted?.[0];
  if (!message) {
    // El eco del webhook llego primero: completar su fila con la media local.
    if (media) {
      await admin.from("wa_messages")
        .update({ media_path: media.path, media_mime: media.mime, media_filename: media.filename })
        .eq("wa_message_id", row.wa_message_id as string);
    }
    const { data: existing } = await admin
      .from("wa_messages").select("*").eq("wa_message_id", row.wa_message_id as string).maybeSingle();
    message = existing ?? row;
  }
  await admin.from("wa_conversations").update({
    last_message_at: waTimestamp,
    last_message_preview: previewText.slice(0, 120),
  }).eq("id", conversationId);
  return message as Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  const auth = await authorizeSoporteWrite(req);
  if (!auth) return jsonResp(403, { error: "forbidden" });

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return jsonResp(400, { error: "bad_json" });
  }
  const convId = String(body.conversation_id || "");
  const text = String(body.text || "").trim();
  const media = body.media as { base64?: string; mimetype?: string; filename?: string; kind?: string } | undefined;
  if (!convId || (!text && !media?.base64)) return jsonResp(400, { error: "missing_fields" });
  if (text.length > 4096) return jsonResp(400, { error: "too_long" });

  const { data: conv } = await admin
    .from("wa_conversations").select("id, wa_jid").eq("id", convId).maybeSingle();
  if (!conv) return jsonResp(404, { error: "conversation_not_found" });

  const cfg = await getConfig();
  const serverUrl = (cfg.server_url || "").replace(/\/$/, "");
  const apiKey = cfg.evolution_api_key || "";
  const instance = cfg.instance_name || "korex-soporte";
  if (!serverUrl || !apiKey) return jsonResp(502, { error: "evolution_not_configured" });

  const evoHeaders = { "Content-Type": "application/json", apikey: apiKey };

  // ── Adjunto ──
  if (media?.base64) {
    const kind = String(media.kind || "");
    const msgType = MSG_TYPE_BY_KIND[kind];
    if (!msgType) return jsonResp(400, { error: "bad_kind" });

    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(media.base64);
    } catch {
      return jsonResp(400, { error: "bad_media" });
    }
    if (bytes.length > MAX_MEDIA_BYTES) return jsonResp(413, { error: "too_big" });

    const mimetype = String(media.mimetype || "application/octet-stream");
    const filename = String(media.filename || `archivo.${extFromName("", "bin")}`);

    let evoRes: Response;
    try {
      if (kind === "audio") {
        // Audio se manda como nota de voz.
        evoRes = await fetch(`${serverUrl}/message/sendWhatsAppAudio/${instance}`, {
          method: "POST",
          headers: evoHeaders,
          body: JSON.stringify({ number: conv.wa_jid, audio: media.base64 }),
          signal: AbortSignal.timeout(60000),
        });
      } else {
        evoRes = await fetch(`${serverUrl}/message/sendMedia/${instance}`, {
          method: "POST",
          headers: evoHeaders,
          body: JSON.stringify({
            number: conv.wa_jid,
            mediatype: kind,
            mimetype,
            media: media.base64,
            fileName: filename,
            caption: text || undefined,
          }),
          signal: AbortSignal.timeout(60000),
        });
      }
    } catch (e) {
      console.error("whatsapp-send: Evolution inalcanzable (media)", e);
      return jsonResp(502, { error: "evolution_unreachable" });
    }
    const evoData = await evoRes.json().catch(() => null);
    if (!evoRes.ok || !evoData?.key?.id) {
      console.error("whatsapp-send: Evolution error (media)", evoRes.status, evoData);
      return jsonResp(502, { error: "evolution_error" });
    }

    // Cachear en Storage con los bytes que ya tenemos.
    const ext = extFromName(filename, (mimetype.split("/")[1] || "bin").slice(0, 5));
    const path = `${conv.id}/${String(evoData.key.id)}.${ext}`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: mimetype,
      upsert: true,
    });
    const mediaInfo = upErr ? null : { path, mime: mimetype, filename };
    if (upErr) console.error("whatsapp-send: no se pudo cachear media", upErr);

    const labels: Record<string, string> = { image: "📷 Imagen", video: "🎬 Video", audio: "🎙 Audio", document: `📄 ${filename}` };
    const message = await persistOutgoing({
      conversationId: conv.id,
      evoData,
      msgType,
      body: text || null,
      memberId: auth.memberId,
      media: mediaInfo,
      previewText: text || labels[kind] || "📎 Adjunto",
    });
    return jsonResp(200, { ok: true, message });
  }

  // ── Texto ──
  let evoRes: Response;
  try {
    evoRes = await fetch(`${serverUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: evoHeaders,
      body: JSON.stringify({ number: conv.wa_jid, text }),
      signal: AbortSignal.timeout(25000),
    });
  } catch (e) {
    console.error("whatsapp-send: Evolution inalcanzable", e);
    return jsonResp(502, { error: "evolution_unreachable" });
  }
  const evoData = await evoRes.json().catch(() => null);
  if (!evoRes.ok || !evoData?.key?.id) {
    console.error("whatsapp-send: Evolution respondio error", evoRes.status, evoData);
    return jsonResp(502, { error: "evolution_error" });
  }

  const message = await persistOutgoing({
    conversationId: conv.id,
    evoData,
    msgType: "conversation",
    body: text,
    memberId: auth.memberId,
    previewText: text,
  });
  return jsonResp(200, { ok: true, message });
});
