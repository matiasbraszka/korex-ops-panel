// taskActivity.js — helpers para el historial automatico de tareas.
//
// Cada cambio relevante de una tarea (status, dueDate, phase, assignee) se
// registra como una row en task_comments con kind='system'. Bullets de informe
// vinculados a tareas se registran con kind='report'. Aca centralizamos:
//
//  - diffTaskFields(prev, next): detecta los cambios entre dos versiones.
//  - formatSystemEvent({field, from, to}, ctx): arma el texto a mostrar.
//  - formatReportEvent(meta, body, ctx): arma el texto del bullet de informe.
//  - parseAssignees(str): normaliza el campo assignee (CSV).

import { TASK_STATUS } from './constants';

const STATUS_LABELS = {
  backlog: 'Backlog',
  'in-progress': 'En progreso',
  'en-revision': 'En revision',
  paused: 'Pausada',
  done: 'Completada',
  blocked: 'Bloqueada',
  retrasadas: 'Retrasada',
};

const FIELDS = ['status', 'dueDate', 'phase', 'assignee'];

export function parseAssignees(str) {
  if (!str) return [];
  return String(str).split(',').map(s => s.trim()).filter(Boolean);
}

// Devuelve un array de eventos { field, from, to } por cada campo que cambio.
// Para `assignee` se desarma en una entrada por persona agregada/quitada para
// que el feed muestre "+ Christian" en lugar de un diff crudo del CSV.
export function diffTaskFields(prev, next) {
  if (!prev || !next) return [];
  const events = [];
  for (const f of FIELDS) {
    if (f === 'assignee') {
      const a = new Set(parseAssignees(prev.assignee));
      const b = new Set(parseAssignees(next.assignee));
      const added = [...b].filter(x => !a.has(x));
      const removed = [...a].filter(x => !b.has(x));
      added.forEach(name => events.push({ field: 'assignee', op: 'add', value: name }));
      removed.forEach(name => events.push({ field: 'assignee', op: 'remove', value: name }));
      continue;
    }
    const pv = prev[f] ?? null;
    const nv = next[f] ?? null;
    if (pv !== nv) events.push({ field: f, from: pv, to: nv });
  }
  return events;
}

function fmtDateShort(iso) {
  if (!iso) return 'sin fecha';
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  } catch { return iso; }
}

// ctx puede traer `phases` (mapa key→{label,color}) para resolver el nombre
// de la fase. Si no, mostramos el key crudo.
export function formatSystemEvent(meta, ctx = {}) {
  if (!meta) return { icon: '○', text: 'Cambio en la tarea' };
  if (meta.field === 'status') {
    const fromLbl = STATUS_LABELS[meta.from] || meta.from || 'sin estado';
    const toLbl = STATUS_LABELS[meta.to] || meta.to || 'sin estado';
    const cfg = TASK_STATUS[meta.to];
    return {
      icon: cfg?.icon || '●',
      iconColor: cfg?.color || '#6B7280',
      text: `Estado: ${fromLbl} → ${toLbl}`,
    };
  }
  if (meta.field === 'dueDate') {
    return {
      icon: '📅',
      text: `Fecha de entrega: ${fmtDateShort(meta.from)} → ${fmtDateShort(meta.to)}`,
    };
  }
  if (meta.field === 'phase') {
    const phases = ctx.phases || {};
    const fromLbl = meta.from ? (phases[meta.from]?.label || meta.from) : 'sin fase';
    const toLbl = meta.to ? (phases[meta.to]?.label || meta.to) : 'sin fase';
    return { icon: '🏷', text: `Fase: ${fromLbl} → ${toLbl}` };
  }
  if (meta.field === 'assignee') {
    if (meta.op === 'add') return { icon: '👤', text: `Asignada a: + ${meta.value}` };
    if (meta.op === 'remove') return { icon: '👤', text: `Asignacion: − ${meta.value}` };
  }
  return { icon: '○', text: 'Cambio en la tarea' };
}

export function formatReportEvent(meta, body) {
  const category = meta?.category;
  if (category === 'entregable') {
    return { badge: 'Entregable en informe', color: '#16A34A', bg: '#ECFDF5', body };
  }
  if (category === 'avance') {
    return { badge: 'Avance en informe', color: '#5B7CF5', bg: '#EEF2FF', body };
  }
  return { badge: 'Mencion en informe', color: '#6B7280', bg: '#F3F4F6', body };
}

// Diff de bullets para detectar los que necesitan generar un task_comment
// kind='report'. Compara por (bullet.id, bullet.task_id). Un bullet pasa el
// filtro si: (a) es nuevo y tiene task_id, o (b) cambio su task_id.
export function diffBulletsByTaskLink(prev, next) {
  const prevMap = new Map();
  (prev || []).forEach(item => {
    (item.bullets || []).forEach(b => { if (b?.id) prevMap.set(b.id, b); });
  });
  const toEmit = [];
  (next || []).forEach(item => {
    (item.bullets || []).forEach(b => {
      if (!b?.task_id) return;
      const before = prevMap.get(b?.id || '');
      if (!before) { toEmit.push(b); return; }
      if (before.task_id !== b.task_id) { toEmit.push(b); return; }
    });
  });
  return toEmit;
}
