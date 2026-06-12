// Capa de acceso a datos del modulo Soporte. Wrappers finos sin estado sobre
// sbFetch (REST con JWT del usuario -> RLS aplica) y functions.invoke.
import { supabase, sbFetch } from '@korex/db';

const CONV_SELECT = 'select=*,contact:contacts(id,full_name,phone,email),client:clients(id,name)';

export async function fetchConversations() {
  return sbFetch(
    `wa_conversations?${CONV_SELECT}&order=last_message_at.desc.nullslast&limit=300`,
    { headers: { Prefer: 'return=representation' } },
  );
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
export async function invokeSend({ conversationId, text }) {
  const { data, error } = await supabase.functions.invoke('whatsapp-send', {
    body: { conversation_id: conversationId, text },
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
