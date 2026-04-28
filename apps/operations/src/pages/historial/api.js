// Capa de datos del Historial — Supabase
// Reemplaza al storage.js de localStorage. Usa el mismo sbFetch que el resto del repo.

import { sbFetch, supabase } from '@korex/db';

const TABLE = 'historial_eventos';

// Mapea row de DB → shape que usa el frontend (camelCase + estructura bloqueo anidada).
function rowToEvento(r) {
  if (!r) return null;
  return {
    id: r.id,
    cliente_id: r.cliente_id,
    tipo: r.tipo,
    fase: r.fase,
    fecha: r.fecha,
    hora: r.hora || '',
    titulo: r.titulo,
    descripcion: r.descripcion || '',
    autor: r.autor || '',
    responsable: r.responsable || '',
    tiempo: r.tiempo_min || 0,
    estado: r.estado || 'completado',
    adjuntos: r.adjuntos || 0,
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

// Mapea shape del frontend → row de DB.
function eventoToRow(e, clienteId) {
  return {
    cliente_id: clienteId,
    tipo: e.tipo,
    fase: Number(e.fase) || 1,
    fecha: e.fecha,
    hora: e.hora || null,
    titulo: e.titulo,
    descripcion: e.descripcion || '',
    autor: e.autor || '',
    responsable: e.responsable || 'Korex',
    tiempo_min: Number(e.tiempo) || 0,
    estado: e.estado || 'completado',
    adjuntos: Number(e.adjuntos) || 0,
    bloqueo_categoria: e.bloqueo?.categoria || null,
    bloqueo_esperando: e.bloqueo?.esperando || null,
    bloqueo_dias: Number(e.bloqueo?.diasBloqueo) || 0,
    incluir_resumen: e.incluirResumen !== false,
  };
}

export async function listEventos(clienteId) {
  if (!clienteId) return [];
  const path = `${TABLE}?cliente_id=eq.${encodeURIComponent(clienteId)}&select=*&order=fecha.desc,hora.desc`;
  const rows = await sbFetch(path, {
    headers: { Prefer: 'return=representation' },
  });
  if (!Array.isArray(rows)) return [];
  return rows.map(rowToEvento);
}

export async function createEvento(clienteId, evento) {
  const row = eventoToRow(evento, clienteId);
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${TABLE}`,
    {
      method: 'POST',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    }
  );
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

// Invoca la Edge Function send-resumen-email.
// Devuelve { ok, resend_id, destinatario_efectivo, test_mode } o { ok:false, error }.
export async function sendResumenEmail({ cliente_id, destinatario_real, asunto, cuerpo }) {
  try {
    const { data, error } = await supabase.functions.invoke('send-resumen-email', {
      body: { cliente_id, destinatario_real, asunto, cuerpo },
    });
    if (error) {
      return { ok: false, error: error.message || String(error) };
    }
    return data || { ok: false, error: 'empty_response' };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
