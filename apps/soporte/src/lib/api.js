// Capa de acceso a datos del modulo Soporte. Wrappers finos sin estado sobre
// sbFetch (REST con JWT del usuario -> RLS aplica) y functions.invoke.
import { supabase, sbFetch } from '@korex/db';
import { fmtNextCita } from './format.js';

// Columnas explícitas: participants (puede tener cientos de miembros en
// comunidades) NO viaja con la lista — se pide aparte al abrir el panel.
const CONV_COLS = 'id,wa_jid,wa_phone,is_group,wa_profile_name,description,contact_id,client_id,status,assigned_to,unread_count,last_message_at,last_message_preview,last_message_direction,tags,notes,archived,created_at';
const CONV_SELECT = `select=${CONV_COLS},contact:contacts(id,full_name,phone,email),client:clients(id,name)`;

export async function fetchConversations() {
  const [convs, citas] = await Promise.all([
    sbFetch(
      `wa_conversations?${CONV_SELECT}&order=last_message_at.desc.nullslast&limit=1000`,
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

// Briefings vivos por cliente (sección Recursos → Resumen de grupos).
export async function fetchBriefings() {
  const rows = await sbFetch(
    'wa_briefings?select=*,client:clients(id,name)&order=sat_overall.asc.nullslast&limit=300',
    { headers: { Prefer: 'return=representation' } },
  );
  return Array.isArray(rows) ? rows : [];
}

export async function fetchAppointments(convId) {
  const rows = await sbFetch(
    `appointments?conversation_id=eq.${convId}&order=start_at.desc&limit=50`,
    { headers: { Prefer: 'return=representation' } },
  );
  return Array.isArray(rows) ? rows : [];
}

// Citas de un rango (vista semanal de la página Citas), con su conversación
// y el calendario de reserva (para pintar el punto del color de GCal).
export async function fetchAppointmentsRange(fromISO, toISO) {
  const rows = await sbFetch(
    `appointments?select=*,calendar:booking_calendars(id,name,gcal_color_id),conversation:wa_conversations(id,wa_jid,wa_profile_name,is_group,contact:contacts(id,full_name))` +
    `&status=eq.scheduled&start_at=gte.${encodeURIComponent(fromISO)}&start_at=lt.${encodeURIComponent(toISO)}&order=start_at.asc&limit=200`,
    { headers: { Prefer: 'return=representation' } },
  );
  return Array.isArray(rows) ? rows : [];
}

// Eventos reales del Google Calendar de admin@ en un rango (para mostrar la
// agenda completa). Devuelve [] si el Apps Script no está actualizado o falla.
export async function fetchGcalEvents(fromISO, toISO) {
  try {
    const { data, error } = await supabase.functions.invoke('gcal-events', {
      body: { from: fromISO, to: toISO },
    });
    if (error || !data?.ok || !Array.isArray(data.events)) return [];
    return data.events;
  } catch {
    return [];
  }
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

// Miembros del equipo (selector "Asignado a", filtro de la bandeja y
// pestañas Calendarios/Disponibilidad). Cacheado: cambia poco en la sesión.
let teamCache = null;
export async function fetchTeamMembers() {
  if (teamCache) return teamCache;
  const rows = await sbFetch(
    'team_members?select=id,name,role,color,initials,avatar_url,email,whatsapp,availability&order=position.asc&limit=50',
    { headers: { Prefer: 'return=representation' } },
  );
  teamCache = Array.isArray(rows) ? rows : [];
  return teamCache;
}

// Solo los miembros con acceso al módulo Soporte (o admins) — para que las
// pestañas Calendarios/Disponibilidad no listen a todo el equipo. Si el RPC
// falla, se devuelve el equipo completo (mejor que una lista vacía).
let soporteTeamCache = null;
export async function fetchSoporteTeam() {
  if (soporteTeamCache) return soporteTeamCache;
  const all = await fetchTeamMembers();
  let allowed = null;
  try {
    const { data } = await supabase.rpc('korex_soporte_member_ids');
    if (Array.isArray(data) && data.length) allowed = new Set(data);
  } catch { /* fallback al equipo completo */ }
  soporteTeamCache = allowed ? all.filter((m) => allowed.has(m.id)) : all;
  return soporteTeamCache;
}

// Email / disponibilidad de un miembro (pestaña Disponibilidad, solo admin).
export async function updateTeamMember(id, patch) {
  const rows = await sbFetch(`team_members?id=eq.${encodeURIComponent(id)}&select=id,name,role,color,initials,avatar_url,email,whatsapp,availability`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
    headers: { Prefer: 'return=representation' },
    throwOnError: true,
  });
  // Refrescar el caché en memoria con la fila actualizada.
  const updated = Array.isArray(rows) ? rows[0] : null;
  // RLS puede filtrar el UPDATE sin error (0 filas) — tratarlo como fallo.
  if (!updated) throw new Error('update_denied');
  const patchMember = (list) => list.map((m) => (m.id === updated.id ? { ...m, ...updated } : m));
  if (teamCache) teamCache = patchMember(teamCache);
  if (soporteTeamCache) soporteTeamCache = patchMember(soporteTeamCache);
  return updated;
}

// ── Calendarios de reserva (pestaña Calendarios, link público por slug) ──
export async function fetchBookingCalendars() {
  const rows = await sbFetch(
    'booking_calendars?select=*&order=created_at.asc&limit=50',
    { headers: { Prefer: 'return=representation' } },
  );
  return Array.isArray(rows) ? rows : [];
}

export async function createBookingCalendar(cal) {
  const rows = await sbFetch('booking_calendars', {
    method: 'POST',
    body: JSON.stringify(cal),
    headers: { Prefer: 'return=representation' },
    throwOnError: true,
  });
  const created = Array.isArray(rows) ? rows[0] : rows;
  if (!created?.id) throw new Error('insert_denied');
  return created;
}

export async function updateBookingCalendar(id, patch) {
  const rows = await sbFetch(`booking_calendars?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
    headers: { Prefer: 'return=representation' },
    throwOnError: true,
  });
  const updated = Array.isArray(rows) ? rows[0] : rows;
  if (!updated?.id) throw new Error('update_denied');
  return updated;
}

export async function searchContacts(q) {
  const term = encodeURIComponent(`%${q}%`);
  const rows = await sbFetch(
    `contacts?or=(full_name.ilike.${term},phone.ilike.${term},email.ilike.${term})&select=id,full_name,phone,email&limit=10`,
    { headers: { Prefer: 'return=representation' } },
  );
  return Array.isArray(rows) ? rows : [];
}

// Clientes por nombre. RPC SECURITY DEFINER: soporte no puede leer `clients`
// directo (es módulo operations). Se usa para vincular grupos a un cliente.
export async function searchClients(q) {
  const { data, error } = await supabase.rpc('soporte_search_clients', { p_q: q });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// Personas del Directorio de Finanzas (base general) por nombre/teléfono, con
// el cliente derivado. RPC SECURITY DEFINER (soporte no puede leer finanzas).
export async function searchFinPeople(q) {
  const { data, error } = await supabase.rpc('soporte_search_fin_people', { p_q: q });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// Edge functions (usan el JWT de la sesion; la function valida permiso soporte).
// media (opcional): { base64, mimetype, filename, kind: image|video|audio|document }
export async function invokeSend({ conversationId, text, media, quotedId, mentioned }) {
  const { data, error } = await supabase.functions.invoke('whatsapp-send', {
    body: { conversation_id: conversationId, text, media, quoted_id: quotedId, mentioned },
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

// Exporta la conversacion completa a texto plano (.txt).
export async function invokeExport(conversationId) {
  const { data, error } = await supabase.functions.invoke('whatsapp-export', {
    body: { conversation_id: conversationId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data; // { ok, filename, text }
}

// Administra un grupo: nombre (subject), descripcion y participantes.
// action: 'set_subject' | 'set_description' | 'update_participants'
export async function invokeGroup({ conversationId, action, value, op, participants }) {
  const { data, error } = await supabase.functions.invoke('whatsapp-group', {
    body: { conversation_id: conversationId, action, value, op, participants },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.detail || data.error);
  return data; // { ok, subject?, description?, participants? }
}

// Vincula la conversacion a una persona del Directorio de Finanzas: deriva el
// cliente, puentea al CRM y agenda en Google Contacts con el nombre de la base.
export async function invokeLink({ conversationId, directoryId }) {
  const { data, error } = await supabase.functions.invoke('whatsapp-link', {
    body: { conversation_id: conversationId, directory_id: directoryId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data; // { ok, contact_id, client_id, client_name, name }
}

// Transcribe un audio/video suelto (herramienta "Auditoría de audios" de Recursos).
// Recibe el archivo en base64 y devuelve { ok, text } o { ok:false, error }.
// Devolvemos el objeto tal cual (sin lanzar en ok:false) para que el llamador
// decida por audio: reintentar un rate_limited, marcar el fallo, etc.
export async function invokeTranscribir({ base64, mimetype, filename }) {
  const { data, error } = await supabase.functions.invoke('transcribir-audio', {
    body: { base64, mimetype, filename },
  });
  if (error) throw error; // error de transporte/HTTP (403, 400, red)
  return data; // { ok:true, text } | { ok:false, error, detail? }
}
