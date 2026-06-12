// supabase/functions/whatsapp-webhook/index.ts
// Receptor de eventos del puente Evolution API (WhatsApp no oficial).
//
// Evolution corre en Railway, mantiene la sesion de WhatsApp (vinculada por
// QR al telefono de Matias) y reenvia cada evento aca via webhook global.
// Esta funcion guarda los mensajes en wa_conversations / wa_messages.
//
// Eventos procesados:
//   - messages.upsert: mensajes entrantes Y salientes (key.fromMe=true son
//     los que Matias manda desde el telefono — se guardan igual para que la
//     bandeja muestre la conversacion completa).
//   - El resto (connection.update, messages.update, etc.) solo se loguea.
//
// Idempotencia: wa_messages.wa_message_id es UNIQUE; los reintentos del
// webhook se descartan con upsert ignoreDuplicates.
//
// verify_jwt: false — auth por secreto compartido (?secret= en la URL o
// header x-webhook-secret) contra WA_WEBHOOK_SECRET (function secret) con
// fallback a app_settings.soporte_config.webhook_secret.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

// Algunos mensajes vienen ENVUELTOS (ver-una-vez, efimeros, documento con
// texto): el contenido real esta un nivel adentro. Desenvolver para detectar
// el tipo/texto verdadero.
function unwrapMessage(message: Record<string, any> | null | undefined): Record<string, any> {
  let m = message ?? {};
  for (let i = 0; i < 3; i++) {
    const inner = m.viewOnceMessage?.message || m.viewOnceMessageV2?.message ||
      m.ephemeralMessage?.message || m.documentWithCaptionMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
}

const CONTENT_KEYS = [
  "conversation", "extendedTextMessage", "imageMessage", "videoMessage", "ptvMessage",
  "audioMessage", "documentMessage", "stickerMessage", "locationMessage", "liveLocationMessage",
  "contactMessage", "contactsArrayMessage", "reactionMessage", "pollCreationMessage",
  "pollCreationMessageV3", "eventMessage", "groupInviteMessage",
];

// Tipo real del contenido (tras desenvolver). Cae al messageType reportado.
function resolveMsgType(unwrapped: Record<string, any>, reported: string): string | null {
  for (const k of CONTENT_KEYS) {
    if (unwrapped[k]) return k === "conversation" || k === "extendedTextMessage" ? "conversation" : k;
  }
  return reported || Object.keys(unwrapped)[0] || null;
}

// Texto plano del mensaje segun su tipo (Baileys anida el contenido).
function extractBody(message: Record<string, unknown> | null | undefined): string {
  if (!message) return "";
  const m = message as Record<string, any>;
  return str(
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.reactionMessage?.text ||
    ""
  );
}

// Referencia de media para descarga diferida (la bandeja la resolvera despues).
function extractMediaId(message: Record<string, unknown> | null | undefined): string | null {
  if (!message) return null;
  const m = message as Record<string, any>;
  const media = m.imageMessage || m.videoMessage || m.audioMessage || m.documentMessage || m.stickerMessage;
  return media?.mediaKey ? str(media.url || media.directPath || "media") : null;
}

interface WaEvent {
  event: string;
  instance: string;
  data: Record<string, unknown> | Record<string, unknown>[];
}

// Datos reales de un grupo via Evolution API (best-effort). El pushName de
// los mensajes es el AUTOR, no el grupo: sin esto los grupos quedarian con
// el nombre del ultimo que hablo. Tambien trae los participantes para el
// "quien es quien" del panel.
interface GroupInfo {
  subject: string | null;
  participants: { jid: string; phone: string; admin: boolean }[] | null;
}

async function fetchGroupInfo(jid: string): Promise<GroupInfo | null> {
  try {
    const { data: s } = await supabase
      .from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
    const cfg = (s?.value as Record<string, string> | null) ?? {};
    const serverUrl = (cfg.server_url || "").replace(/\/$/, "");
    const apiKey = cfg.evolution_api_key || "";
    const instance = cfg.instance_name || "korex-soporte";
    if (!serverUrl || !apiKey) return null;
    const r = await fetch(
      `${serverUrl}/group/findGroupInfos/${instance}?groupJid=${encodeURIComponent(jid)}`,
      { headers: { apikey: apiKey }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return null;
    const info = await r.json().catch(() => null);
    if (!info) return null;
    const participants = Array.isArray(info.participants)
      ? info.participants.map((p: Record<string, unknown>) => {
          const pjid = str(p.id);
          return {
            jid: pjid,
            phone: pjid.split("@")[0].split(":")[0],
            admin: Boolean(p.admin),
          };
        }).filter((p: { jid: string }) => p.jid)
      : null;
    return { subject: str(info.subject) || null, participants };
  } catch {
    return null;
  }
}

// Procesa un item de messages.upsert: upsert de conversacion + insert de mensaje.
async function processMessage(item: Record<string, any>): Promise<string | null> {
  const key = item.key ?? {};
  const jid = str(key.remoteJid);
  const waMessageId = str(key.id);
  if (!jid || !waMessageId) return null;
  // Estados/broadcasts de WhatsApp no son chats: ignorar.
  if (jid === "status@broadcast" || jid.endsWith("@broadcast")) return null;

  const fromMe = key.fromMe === true;
  const isGroup = jid.endsWith("@g.us");
  const waPhone = isGroup ? null : jid.split("@")[0].split(":")[0];
  const pushName = str(item.pushName);
  const unwrapped = unwrapMessage(item.message);
  const body = extractBody(unwrapped);
  const msgType = resolveMsgType(unwrapped, str(item.messageType));
  const tsRaw = Number(item.messageTimestamp ?? 0);
  const waTimestamp = tsRaw > 0 ? new Date(tsRaw * 1000).toISOString() : new Date().toISOString();

  // ── 1. Conversacion: buscar por JID, crear vacia si no existe ──
  // Los datos derivados del mensaje (preview, unread, last_message_at) se
  // actualizan recien en el paso 3, SOLO si el mensaje resulto nuevo: asi un
  // webhook reintentado no infla el contador de no leidos.
  const { data: existing } = await supabase
    .from("wa_conversations")
    .select("id, contact_id, unread_count, wa_profile_name, participants")
    .eq("wa_jid", jid)
    .maybeSingle();

  let conversationId = existing?.id as string | undefined;

  if (!conversationId) {
    const { data: created, error } = await supabase
      .from("wa_conversations")
      .insert({ wa_jid: jid, wa_phone: waPhone, is_group: isGroup })
      .select("id")
      .single();
    if (error) {
      // Carrera entre webhooks concurrentes: otro request la creo primero.
      const { data: again } = await supabase
        .from("wa_conversations").select("id").eq("wa_jid", jid).maybeSingle();
      conversationId = again?.id;
    } else {
      conversationId = created.id;
    }
  }
  if (!conversationId) return null;

  // ── 2. Mensaje (idempotente por wa_message_id) ──
  // Con ignoreDuplicates, .select() devuelve [] cuando el mensaje ya existia.
  const { data: inserted, error: msgError } = await supabase.from("wa_messages").upsert(
    {
      conversation_id: conversationId,
      wa_message_id: waMessageId,
      direction: fromMe ? "out" : "in",
      sender_jid: str(key.participant) || (fromMe ? null : jid),
      msg_type: msgType,
      body: body || null,
      media_id: extractMediaId(unwrapped),
      status: fromMe ? "sent" : "received",
      payload: item,
      wa_timestamp: waTimestamp,
    },
    { onConflict: "wa_message_id", ignoreDuplicates: true },
  ).select("id");
  if (msgError) {
    console.error("whatsapp-webhook: error insert wa_messages", msgError);
    return null;
  }
  const isNew = (inserted?.length ?? 0) > 0;
  if (!isNew) return null; // reintento del webhook: nada mas que hacer

  // ── 3. Actualizar la conversacion (solo para mensajes nuevos) ──
  // Vinculo best-effort con contacts por los ultimos digitos del telefono.
  let contactId = existing?.contact_id ?? null;
  if (!contactId && waPhone && waPhone.length >= 8) {
    const tail = waPhone.slice(-8);
    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .ilike("phone", `%${tail}%`)
      .limit(1)
      .maybeSingle();
    contactId = contact?.id ?? null;
  }

  // Preview: en grupos se antepone el autor para saber quien hablo.
  const rawPreview = body || (msgType ? `[${msgType}]` : '');
  const author = fromMe ? 'Vos' : (pushName || (str(key.participant).split('@')[0] || ''));
  const preview = rawPreview
    ? (isGroup && author ? `${author}: ${rawPreview}` : rawPreview).slice(0, 120)
    : null;

  const convPatch: Record<string, unknown> = {
    wa_phone: waPhone,
    is_group: isGroup,
    contact_id: contactId,
    last_message_at: waTimestamp,
    last_message_preview: preview,
    last_message_direction: fromMe ? "out" : "in",
  };
  if (isGroup) {
    // El nombre del chat de un grupo es su subject (NO el pushName del autor).
    // Participantes: se traen una vez y quedan cacheados en la conversacion.
    const needName = !existing?.wa_profile_name;
    const needParticipants = !existing?.participants;
    if (needName || needParticipants) {
      const info = await fetchGroupInfo(jid);
      if (info?.subject && needName) convPatch.wa_profile_name = info.subject;
      if (info?.participants && needParticipants) convPatch.participants = info.participants;
    }
  } else if (!fromMe && pushName) {
    // 1-a-1: pushName del remitente = nombre del contacto.
    convPatch.wa_profile_name = pushName;
  }
  if (!fromMe) {
    convPatch.unread_count = (Number(existing?.unread_count) || 0) + 1;
    // Un chat archivado vuelve a la bandeja cuando el contacto escribe.
    convPatch.archived = false;
  }

  await supabase.from("wa_conversations").update(convPatch).eq("id", conversationId);
  return waMessageId;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  // Auth: function secret primero; fallback a app_settings.soporte_config.
  let expected = Deno.env.get("WA_WEBHOOK_SECRET") || "";
  if (!expected) {
    const { data: s } = await supabase
      .from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
    expected = str((s?.value as Record<string, unknown> | null)?.webhook_secret);
  }
  const url = new URL(req.url);
  const got = url.searchParams.get("secret") || req.headers.get("x-webhook-secret") || "";
  if (!expected || got !== expected) return jsonResp(401, { error: "unauthorized" });

  let payload: WaEvent;
  try {
    payload = await req.json();
  } catch {
    // 200 para que Evolution no acumule reintentos de un payload roto.
    return jsonResp(200, { ok: false, error: "not_json" });
  }

  const event = str(payload.event).toLowerCase();

  // send.message = mensajes enviados via API (mismo shape que messages.upsert).
  // Redundante con el insert directo de whatsapp-send, pero la idempotencia
  // por wa_message_id hace que de cualquier forma quede UNA sola fila.
  if (event === "messages.upsert" || event === "send.message") {
    const items = Array.isArray(payload.data) ? payload.data : [payload.data];
    const processed: string[] = [];
    for (const item of items) {
      try {
        const id = await processMessage(item as Record<string, any>);
        if (id) processed.push(id);
      } catch (e) {
        console.error("whatsapp-webhook: error procesando mensaje", e);
      }
    }
    return jsonResp(200, { ok: true, processed: processed.length });
  }

  // Otros eventos: solo log por ahora (connection.update, messages.update, ...).
  console.log("whatsapp-webhook: evento ignorado", event);
  return jsonResp(200, { ok: true, ignored: event });
});
