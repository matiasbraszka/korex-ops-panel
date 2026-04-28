// Almacenamiento de eventos del historial — localStorage por ahora.
// TODO backend: reemplazar por tabla Supabase `historial_eventos` con columnas:
//   id (uuid), cliente_id (uuid), tipo (text), fase (int), fecha (date),
//   hora (text), titulo (text), descripcion (text), autor (text),
//   responsable (text), tiempo_min (int), estado (text), adjuntos (int),
//   bloqueo_categoria, bloqueo_esperando_a, bloqueo_dias, incluir_resumen (bool),
//   created_at, updated_at.

const KEY = 'korex_historial_eventos_v1';

export function loadEventos(clienteId) {
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? JSON.parse(raw) : {};
    const list = all[clienteId] || [];
    return list.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
  } catch {
    return [];
  }
}

export function saveEvento(clienteId, evento) {
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? JSON.parse(raw) : {};
    const list = all[clienteId] || [];
    const withId = { id: evento.id || `ev_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, ...evento };
    const next = [withId, ...list.filter(e => e.id !== withId.id)];
    all[clienteId] = next;
    localStorage.setItem(KEY, JSON.stringify(all));
    return withId;
  } catch {
    return null;
  }
}

export function deleteEvento(clienteId, eventoId) {
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[clienteId] = (all[clienteId] || []).filter(e => e.id !== eventoId);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* noop */
  }
}

// Seed de demo: si no hay eventos para este cliente, devuelve 3 eventos de ejemplo
// para que la UI no quede vacía al primer ingreso.
export function seedDemoIfEmpty(clienteId, clienteNombre) {
  const list = loadEventos(clienteId);
  if (list.length > 0) return list;
  const today = new Date();
  const iso = (offset) => {
    const d = new Date(today); d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  const demo = [
    {
      tipo: 'bloqueo', fase: 5, fecha: iso(1), hora: '14:32',
      titulo: 'Esperando grabación VSL del cliente',
      descripcion: 'Sin avances. Bloqueando avance de Diseño Landing.',
      autor: 'Equipo Korex', responsable: 'Cliente',
      bloqueo: { categoria: 'Cliente', esperando: clienteNombre || 'Cliente', diasBloqueo: 8 },
      tiempo: 15, estado: 'en-curso', adjuntos: 1, incluirResumen: true,
    },
    {
      tipo: 'entregable', fase: 5, fecha: iso(3), hora: '17:48',
      titulo: 'Mockup landing v2 entregado',
      descripcion: 'Diseño en Figma actualizado. Esperando feedback.',
      autor: 'Diseño', responsable: 'Cliente',
      tiempo: 180, estado: 'completado', adjuntos: 3, incluirResumen: true,
    },
    {
      tipo: 'hito', fase: 1, fecha: iso(30), hora: '10:00',
      titulo: 'Contrato firmado · Inicio del proyecto',
      descripcion: 'Plan 90 días.',
      autor: 'Matias Braszka', responsable: 'Korex',
      tiempo: 30, estado: 'completado', adjuntos: 1, incluirResumen: true,
    },
  ];
  demo.forEach(e => saveEvento(clienteId, e));
  return loadEventos(clienteId);
}
