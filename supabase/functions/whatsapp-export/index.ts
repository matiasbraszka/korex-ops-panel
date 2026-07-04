// supabase/functions/whatsapp-export/index.ts
// Exporta una conversacion de WhatsApp a texto plano (.txt), estilo la
// exportacion nativa de WhatsApp: [dd/mm/aaaa, HH:MM] Autor: mensaje.
// Trae TODOS los mensajes (no solo los cargados en la bandeja).
//
// Auth: verify_jwt=true + permiso soporte:read (mismo patron que whatsapp-media).
// Body: { conversation_id }
// Responde: { ok, filename, text }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const TZ = "America/Argentina/Buenos_Aires";
const PAGE = 1000;

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

// Etiqueta para mensajes no-texto (subconjunto de apps/soporte/src/lib/format.js).
const TYPE_LABELS: Record<string, string> = {
  imageMessage: "📷 Imagen",
  videoMessage: "🎬 Video",
  ptvMessage: "🎥 Video corto",
  audioMessage: "🎙 Audio",
  documentMessage: "📄 Documento",
  documentWithCaptionMessage: "📄 Documento",
  stickerMessage: "✨ Sticker",
  locationMessage: "📍 Ubicación",
  liveLocationMessage: "📍 Ubicación en vivo",
  contactMessage: "👤 Contacto",
  contactsArrayMessage: "👤 Contactos",
  reactionMessage: "👍 Reacción",
  pollCreationMessage: "📊 Encuesta",
  pollCreationMessageV3: "📊 Encuesta",
  eventMessage: "📅 Evento",
  viewOnceMessage: "🔒 Foto/video de ver una vez",
  viewOnceMessageV2: "🔒 Foto/video de ver una vez",
  secretEncryptedMessage: "🔒 Contenido protegido",
  groupInviteMessage: "👥 Invitación a grupo",
};

function fmtStamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("es-AR", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric",
  });
  const time = d.toLocaleTimeString("es-AR", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit",
  });
  return `${date}, ${time}`;
}

function sanitize(name: string): string {
  return (name || "chat").replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 60) || "chat";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  if (!(await authorizeSoporteRead(req))) return jsonResp(403, { error: "forbidden" });

  let body: { conversation_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResp(400, { error: "bad_json" });
  }
  const convId = String(body.conversation_id || "");
  if (!convId) return jsonResp(400, { error: "missing_fields" });

  // Conversacion + nombre a mostrar (contacto vinculado > perfil > telefono).
  const { data: conv } = await admin
    .from("wa_conversations")
    .select("id, wa_jid, wa_phone, is_group, wa_profile_name, contact:contacts(full_name)")
    .eq("id", convId)
    .maybeSingle();
  if (!conv) return jsonResp(404, { error: "conversation_not_found" });

  const contactName = (conv.contact as { full_name?: string } | null)?.full_name;
  const chatName = contactName || conv.wa_profile_name ||
    (conv.wa_phone ? `+${conv.wa_phone}` : conv.wa_jid);
  const isGroup = conv.is_group === true;

  // Traer TODOS los mensajes en paginas de 1000, ascendente por created_at.
  const lines: string[] = [];
  let from = 0;
  while (true) {
    const { data: msgs, error } = await admin
      .from("wa_messages")
      .select("direction, sender_jid, msg_type, body, wa_timestamp, created_at, payload")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("whatsapp-export: error leyendo mensajes", error);
      return jsonResp(500, { error: "read_error" });
    }
    const batch = msgs || [];
    for (const m of batch) {
      const payload = (m.payload as Record<string, any>) || {};
      const author = m.direction === "out"
        ? "Vos"
        : (isGroup
            ? (payload.pushName || String(m.sender_jid || "").split("@")[0] || chatName)
            : chatName);
      let content = (m.body || "").trim();
      if (!content) {
        const label = TYPE_LABELS[m.msg_type as string] || "📎 Adjunto";
        // Documento: agregar el nombre del archivo si lo tenemos.
        const docName = payload?.message?.documentMessage?.fileName;
        content = m.msg_type === "documentMessage" && docName ? `${label}: ${docName}` : label;
      }
      const stamp = fmtStamp(m.wa_timestamp || m.created_at);
      // Mensajes multilinea: se mantienen tal cual bajo la misma marca.
      lines.push(`[${stamp}] ${author}: ${content}`);
    }
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  const header =
    `Chat de WhatsApp con ${chatName}\n` +
    `Exportado el ${fmtStamp(new Date().toISOString())} (hora de Argentina)\n` +
    `${lines.length} mensajes\n` +
    `${"-".repeat(40)}\n\n`;
  const text = header + lines.join("\n") + "\n";

  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // yyyy-mm-dd
  const filename = `WhatsApp - ${sanitize(String(chatName))} - ${today}.txt`;

  return jsonResp(200, { ok: true, filename, text });
});
