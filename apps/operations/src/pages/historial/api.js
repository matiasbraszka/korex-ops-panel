// Capa de datos del Historial — Supabase
import { sbFetch, supabase } from '@korex/db';

const TABLE = 'historial_eventos';

function rowToEvento(r) {
  if (!r) return null;
  return {
    id: r.id,
    cliente_id: r.cliente_id,
    tipo: r.tipo,
    fase: r.fase,                    // id de la fase del roadmap (text)
    fecha: r.fecha,
    hora: r.hora || '',
    titulo: r.titulo,
    descripcion: r.descripcion || '',
    autor: r.autor || '',            // legacy, todavía se muestra como fallback
    autorUser: r.autor_user || null, // { id, name, avatar_url, color, initials }
    responsable: r.responsable || '',
    tiempo: r.tiempo_min || 0,
    estado: r.estado || 'completado',
    links: Array.isArray(r.links) ? r.links : [],
    adjuntos: Array.isArray(r.links) ? r.links.length : (r.adjuntos || 0),
    incluirResumen: r.incluir_resumen !== false,
    bloqueo: r.tipo === 'bloqueo'
      ? {
          categoria: r.bloqueo_categoria || '',
          esperando: r.bloqueo_esperando || '',
          diasBloqueo: r.bloqueo_dias || 0,
        }
      : undefined,
  };
}

function eventoToRow(e, clienteId) {
  return {
    cliente_id: clienteId,
    tipo: e.tipo,
    fase: String(e.fase || ''),
    fecha: e.fecha,
    hora: e.hora || null,
    titulo: e.titulo,
    descripcion: e.descripcion || '',
    autor: e.autor || (e.autorUser?.name || ''),
    autor_user: e.autorUser || null,
    responsable: e.responsable || 'Korex',
    tiempo_min: Number(e.tiempo) || 0,
    estado: e.estado || 'completado',
    links: Array.isArray(e.links) ? e.links : [],
    adjuntos: Array.isArray(e.links) ? e.links.length : 0,
    bloqueo_categoria: e.bloqueo?.categoria || null,
    bloqueo_esperando: e.bloqueo?.esperando || null,
    bloqueo_dias: Number(e.bloqueo?.diasBloqueo) || 0,
    incluir_resumen: e.incluirResumen !== false,
  };
}

export async function listEventos(clienteId) {
  if (!clienteId) return [];
  const path = `${TABLE}?cliente_id=eq.${encodeURIComponent(clienteId)}&select=*&order=fecha.desc,hora.desc`;
  const rows = await sbFetch(path, { headers: { Prefer: 'return=representation' } });
  if (!Array.isArray(rows)) return [];
  return rows.map(rowToEvento);
}

export async function createEvento(clienteId, evento) {
  const row = eventoToRow(evento, clienteId);
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${TABLE}`;
  const session = (await supabase.auth.getSession()).data.session;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    console.warn('createEvento error', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return rowToEvento(Array.isArray(data) ? data[0] : data);
}

export async function deleteEvento(eventoId) {
  if (!eventoId) return false;
  await sbFetch(`${TABLE}?id=eq.${encodeURIComponent(eventoId)}`, { method: 'DELETE' });
  return true;
}

export async function updateEvento(eventoId, patch) {
  if (!eventoId) return null;
  await sbFetch(`${TABLE}?id=eq.${encodeURIComponent(eventoId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return true;
}

export async function sendResumenEmail({ cliente_id, destinatario_real, asunto, cuerpo }) {
  try {
    const { data, error } = await supabase.functions.invoke('send-resumen-email', {
      body: { cliente_id, destinatario_real, asunto, cuerpo },
    });
    if (error) {
      // intentar leer el body del error (Supabase wraps non-2xx en error.context.response)
      let detail = error.message || String(error);
      try {
        const r = error?.context?.response;
        if (r) {
          const txt = await r.text();
          const j = JSON.parse(txt);
          detail = j.error || j.message || txt || detail;
        }
      } catch { /* ignore */ }
      return { ok: false, error: detail };
    }
    return data || { ok: false, error: 'empty_response' };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
