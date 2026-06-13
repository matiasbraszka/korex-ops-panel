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

// Config del modulo con cache corto (se consulta por cada mensaje).
let cfgCache: { value: Record<string, string>; at: number } | null = null;
async function getCfg(): Promise<Record<string, string>> {
  if (cfgCache && Date.now() - cfgCache.at < 60_000) return cfgCache.value;
  const { data: s } = await supabase
    .from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  cfgCache = { value: (s?.value as Record<string, string>) ?? {}, at: Date.now() };
  return cfgCache.value;
}

// Alta del contacto en Google Contacts (via el Apps Script de Calendar) para
// que el WhatsApp del celular muestre el nombre. Best-effort, post-respuesta.
async function upsertGoogleContact(name: string, phone: string): Promise<void> {
  try {
    const cfg = await getCfg();
    if (!cfg.calendar_script_url || !cfg.calendar_script_secret) return;
    await fetch(cfg.calendar_script_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: cfg.calendar_script_secret, action: "upsert_contact", name, phone }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    console.error("whatsapp-webhook: alta de contacto fallo", e);
  }
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
    const serverUrl = (cfg.server_url || "").replace(/[/]+$/, "");
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

const TAG_PALETTE = ["#22C55E", "#F59E0B", "#4A67D8", "#E11D48", "#7C3AED", "#0E7490", "#15803D", "#B45309", "#2563EB", "#DC2626", "#8E24AA", "#0891B2"];

// Catálogo de etiquetas del panel (soporte_config.tags).
async function getTagsCatalog(): Promise<any[]> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const v = (data?.value as any) || {};
  return Array.isArray(v.tags) ? v.tags : [];
}
async function saveTagsCatalog(tags: any[]): Promise<void> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const v = (data?.value as any) || {};
  await supabase.from("app_settings").update({ value: { ...v, tags } }).eq("key", "soporte_config");
}

// Nombre de una etiqueta de WhatsApp (Evolution) por su id corto.
async function fetchLabelName(labelId: string): Promise<string | null> {
  try {
    const cfg = await getCfg();
    const serverUrl = (cfg.server_url || "").replace(/[/]+$/, "");
    if (!serverUrl || !cfg.evolution_api_key) return null;
    const r = await fetch(`${serverUrl}/label/findLabels/${cfg.instance_name || "korex-soporte"}`,
      { headers: { apikey: cfg.evolution_api_key }, signal: AbortSignal.timeout(8000) });
    const arr = await r.json().catch(() => null);
    const list = Array.isArray(arr) ? arr : (arr?.labels || []);
    const f = list.find((l: any) => String(l.labelId ?? l.id) === String(labelId) || String(l.id) === String(labelId));
    return f ? str(f.name) || null : null;
  } catch { return null; }
}

// Sincroniza una asociación etiqueta↔chat (labels.association) a la bandeja:
// agrega/quita el tag en la conversación, crea el tag si falta y, si el nombre
// del tag coincide con un cliente, vincula la conversación a ese cliente.
async function handleLabelAssociation(data: any): Promise<void> {
  const assoc = data?.association || data || {};
  const chatId = str(assoc.chatId || assoc.chatJid || assoc.remoteJid);
  const labelId = str(assoc.labelId);
  const type = str(assoc.type || data?.type).toLowerCase(); // add | remove
  if (!chatId || !labelId) return;
  const tagId = `wa-${labelId}`;

  let tags = await getTagsCatalog();
  let tagLabel = tags.find((t) => t.id === tagId)?.label || "";
  if (type !== "remove" && !tags.find((t) => t.id === tagId)) {
    tagLabel = (await fetchLabelName(labelId)) || `Etiqueta ${labelId}`;
    tags = [...tags, { id: tagId, label: tagLabel, color: TAG_PALETTE[tags.length % TAG_PALETTE.length] }];
    await saveTagsCatalog(tags);
  }

  const { data: conv } = await supabase
    .from("wa_conversations").select("id, tags, client_id").eq("wa_jid", chatId).maybeSingle();
  if (!conv) return;
  const cur: string[] = Array.isArray(conv.tags) ? conv.tags : [];
  const next = type === "remove" ? cur.filter((t) => t !== tagId) : (cur.includes(tagId) ? cur : [...cur, tagId]);
  const patch: Record<string, unknown> = {};
  if (next.length !== cur.length) patch.tags = next;
  // Auto-vincular a cliente si la etiqueta coincide con el nombre de un cliente.
  if (type !== "remove" && !conv.client_id && tagLabel.trim()) {
    const { data: client } = await supabase.from("clients").select("id").ilike("name", tagLabel.trim()).maybeSingle();
    if (client) patch.client_id = client.id;
  }
  if (Object.keys(patch).length) await supabase.from("wa_conversations").update(patch).eq("id", conv.id);
}

// labels.edit: alta/renombre/baja de una etiqueta en el catálogo del panel.
async function handleLabelEdit(data: any): Promise<void> {
  const labelId = str(data?.id ?? data?.labelId);
  if (!labelId) return;
  const tagId = `wa-${labelId}`;
  let tags = await getTagsCatalog();
  if (data?.deleted === true) {
    tags = tags.filter((t) => t.id !== tagId);
  } else {
    const nm = str(data?.name) || `Etiqueta ${labelId}`;
    const ex = tags.find((t) => t.id === tagId);
    if (ex) ex.label = nm;
    else tags = [...tags, { id: tagId, label: nm, color: TAG_PALETTE[tags.length % TAG_PALETTE.length] }];
  }
  await saveTagsCatalog(tags);
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
    // Chat nuevo: se asigna por defecto a la asistente (soporte_config).
    const cfg = await getCfg();
    const { data: created, error } = await supabase
      .from("wa_conversations")
      .insert({ wa_jid: jid, wa_phone: waPhone, is_group: isGroup, assigned_to: cfg.default_assignee || null })
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
    // Primera vez que conocemos el nombre: alta en Google Contacts, despues
    // de responder el webhook (no demora la respuesta a Evolution).
    if (!existing?.wa_profile_name && waPhone) {
      try {
        // deno-lint-ignore no-explicit-any
        (globalThis as any).EdgeRuntime?.waitUntil
          ? (globalThis as any).EdgeRuntime.waitUntil(upsertGoogleContact(pushName, waPhone))
          : upsertGoogleContact(pushName, waPhone);
      } catch {
        // sin waitUntil: igual se intenta, sin bloquear
      }
    }
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

  // Etiquetas de WhatsApp (sincronización automática con la bandeja).
  if (event === "labels.association") {
    try { await handleLabelAssociation(Array.isArray(payload.data) ? payload.data[0] : payload.data); }
    catch (e) { console.error("whatsapp-webhook: labels.association", e); }
    return jsonResp(200, { ok: true, label: "association" });
  }
  if (event === "labels.edit") {
    try { await handleLabelEdit(Array.isArray(payload.data) ? payload.data[0] : payload.data); }
    catch (e) { console.error("whatsapp-webhook: labels.edit", e); }
    return jsonResp(200, { ok: true, label: "edit" });
  }

  // Otros eventos: solo log por ahora (connection.update, messages.update, ...).
  console.log("whatsapp-webhook: evento ignorado", event);
  return jsonResp(200, { ok: true, ignored: event });
});
