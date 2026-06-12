// Capa de acceso a datos del modulo Soporte. Wrappers finos sin estado sobre
// sbFetch (REST con JWT del usuario -> RLS aplica) y functions.invoke.
import { supabase, sbFetch } from '@korex/db';
import { fmtNextCita } from './format.js';

// Columnas explícitas: participants (puede tener cientos de miembros en
// comunidades) NO viaja con la lista — se pide aparte al abrir el panel.
const CONV_COLS = 'id,wa_jid,wa_phone,is_group,wa_profile_name,contact_id,client_id,status,assigned_to,unread_count,last_message_at,last_message_preview,last_message_direction,tags,notes,archived,created_at';
const CONV_SELECT = `select=${CONV_COLS},contact:contacts(id,full_name,phone,email),client:clients(id,name)`;

export async function fetchConversations() {
  const [convs, citas] = await Promise.all([
    sbFetch(
      `wa_conversations?${CONV_SELECT}&order=last_message_at.desc.nullslast&limit=300`,
      { headers: { Prefer: 'return=representation' } },
    ),
    fetchNextAppointments(),
  ]);
  if (!Array.isArray(convs)) return convs;
  return convs.map((c) => ({ ...c, next_appointment: citas[c.id] || null }));
}

// Próxima cita por conversación (para el chip "vie 10:00" de la lista).
async function fetchNextAppointments() {
  const rows = await sbFetch(
    `appointments?select=conversation_id,start_at&status=eq.scheduled&start_at=gt.${encodeURIComponent(new Date().toISOString())}&order=start_at.asc&limit=200`,
    { headers: { Prefer: 'return=representation' } },
  ).catch(() => []);
  const map = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r.conversation_id && !map[r.conversation_id]) map[r.conversation_id] = fmtNextCita(r.start_at);
  }
  return map;
}

export async function fetchConversation(id) {
  const rows = await sbFetch(
    `wa_conversations?id=eq.${id}&${CONV_SELECT}`,
    { headers: { Prefer: 'return=representation' } },
  );
  return rows?.[0] ?? null;
}

// Mensajes: paginados por created_at (NOT NULL e indexado). before = created_at
// del mensaje mas viejo cargado, para traer la pagina anterior.
export const PAGE_SIZE = 50;
export async function fetchMessages(convId, { before = null, after = null } = {}) {
  let path = `wa_messages?conversation_id=eq.${convId}&order=created_at.desc&limit=${PAGE_SIZE}`;
  if (before) path += `&created_at=lt.${encodeURIComponent(before)}`;
  if (after) path += `&created_at=gt.${encodeURIComponent(after)}`;
  const rows = await sbFetch(path, { headers: { Prefer: 'return=representation' } });
  return Array.isArray(rows) ? rows.reverse() : []; // ASC para render
}

export async function patchConversation(id, patch, { extraFilter = '' } = {}) {
  return sbFetch(`wa_conversations?id=eq.${id}${extraFilter}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function fetchSoporteConfig() {
  const rows = await sbFetch(
    "app_settings?key=eq.soporte_config&select=value",
    { headers: { Prefer: 'return=representation' } },
  );
  return rows?.[0]?.value ?? {};
}

// Merge parcial del JSON de soporte_config (no pisa otras claves).
export async function patchSoporteConfig(partial) {
  const current = await fetchSoporteConfig();
  return sbFetch('app_settings?key=eq.soporte_config', {
    method: 'PATCH',
    body: JSON.stringify({ value: { ...current, ...partial }, updated_at: new Date().toISOString() }),
  });
}

export async function fetchAppointments(convId) {
  const rows = await sbFetch(
    `appointments?conversation_id=eq.${convId}&order=start_at.desc&limit=50`,
    { headers: { Prefer: 'return=representation' } },
  );
  return Array.isArray(rows) ? rows : [];
}

// Citas de un rango (vista semanal de la página Citas), con su conversación.
export async function fetchAppointmentsRange(fromISO, toISO) {
  const rows = await sbFetch(
    `appointments?select=*,conversation:wa_conversations(id,wa_jid,wa_profile_name,is_group,contact:contacts(id,full_name))` +
    `&status=eq.scheduled&start_at=gte.${encodeURIComponent(fromISO)}&start_at=lt.${encodeURIComponent(toISO)}&order=start_at.asc&limit=200`,
    { headers: { Prefer: 'return=representation' } },
  );
  return Array.isArray(rows) ? rows : [];
}

// Participantes de un grupo (jsonb pesado: se pide solo al abrir el panel).
export async function fetchParticipants(convId) {
  const rows = await sbFetch(
    `wa_conversations?id=eq.${convId}&select=participants`,
    { headers: { Prefer: 'return=representation' } },
  );
  return rows?.[0]?.participants || null;
}

// Nombres visibles (pushName) de quienes hablaron en el grupo, por jid.
export async function fetchGroupNames(convId) {
  const rows = await sbFetch(
    `wa_messages?conversation_id=eq.${convId}&direction=eq.in&select=sender_jid,pushname:payload->>pushName&order=created_at.desc&limit=300`,
    { headers: { Prefer: 'return=representation' } },
  );
  const map = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r.sender_jid && r.pushname && !map[r.sender_jid]) map[r.sender_jid] = r.pushname;
  }
  return map;
}

// Miembros del equipo (para el selector "Asignado a").
export async function fetchTeamMembers() {
  const rows = await sbFetch(
    'team_members?select=id,name&order=name.asc&limit=50',
    { headers: { Prefer: 'return=representation' } },
  );
  return Array.isArray(rows) ? rows : [];
}

export async function searchContacts(q) {
  const term = encodeURIComponent(`%${q}%`);
  const rows = await sbFetch(
    `contacts?or=(full_name.ilike.${term},phone.ilike.${term},email.ilike.${term})&select=id,full_name,phone,email&limit=10`,
    { headers: { Prefer: 'return=representation' } },
  );
  return Array.isArray(rows) ? rows : [];
}

export async function searchClients(q) {
  const term = encodeURIComponent(`%${q}%`);
  const rows = await sbFetch(
    `clients?name=ilike.${term}&select=id,name&limit=10`,
    { headers: { Prefer: 'return=representation' } },
  );
  return Array.isArray(rows) ? rows : [];
}

// Edge functions (usan el JWT de la sesion; la function valida permiso soporte).
// media (opcional): { base64, mimetype, filename, kind: image|video|audio|document }
export async function invokeSend({ conversationId, text, media }) {
  const { data, error } = await supabase.functions.invoke('whatsapp-send', {
    body: { conversation_id: conversationId, text, media },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data; // { ok, message }
}

export async function invokeCita(payload) {
  const { data, error } = await supabase.functions.invoke('crear-cita', { body: payload });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data; // { ok, appointment } | { ok } en cancel
}

export async function invokeMedia(messageId) {
  const { data, error } = await supabase.functions.invoke('whatsapp-media', {
    body: { message_id: messageId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data; // { ok, url, mime, filename }
}
