import { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { DEPARTMENTS, TASK_STATUS } from '../../utils/constants';
import { today, daysBetween, isKorexClient, userOwnsTask } from '../../utils/helpers';
import TaskDetailDrawer from './TaskDetailDrawer';

// Calendario mensual de ENTREGABLES: toda tarea con "fecha de entrega" (dueDate)
// cae en su día. Muy visual, respeta los filtros de encargado/cliente/alcance de
// la barra de Tareas (TareasBar). La navegación de mes vive en esa misma barra
// (props month/setMonth, elevadas a TareasPage) para seguir la estética del resto.
// Reusa el mismo drawer de detalle del Tablero Sprint.

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// 'YYYY-MM-DD' local de un objeto Date (sin pasar por UTC, igual criterio que today()).
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function CalendarView({ scope = 'cli', month }) {
  const {
    tasks, clients, teamMembers, updateTask, currentUser,
    taskAssignee, taskClientFilter, hideCompletedTasks,
  } = useApp();
  const restricted = !!currentUser && !currentUser.isAdmin;

  const [openTaskId, setOpenTaskId] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [overDay, setOverDay] = useState(null);
  const [expandedDays, setExpandedDays] = useState(() => new Set());

  const todayIso = today();
  const cur = month || (() => { const [y, m] = todayIso.split('-').map(Number); return { y, m: m - 1 }; })();
  const clientById = (id) => (clients || []).find(c => c.id === id);

  const visible = (t) => {
    if (!t.dueDate) return false;
    if (restricted && !userOwnsTask(t, currentUser, teamMembers)) return false;
    if (hideCompletedTasks && t.status === 'done') return false;
    if (taskAssignee !== 'all') {
      if (!t.assignee) return false;
      if (!t.assignee.split(',').map(s => s.trim().toLowerCase()).includes(taskAssignee.toLowerCase())) return false;
    }
    if (taskClientFilter !== 'all' && t.clientId !== taskClientFilter) return false;
    const c = clientById(t.clientId);
    if (c) { const interno = isKorexClient(c); if (scope === 'int' ? !interno : interno) return false; }
    return true;
  };

  // Mapa dueDate('YYYY-MM-DD') -> [tareas], ordenadas por estado/título.
  const byDay = useMemo(() => {
    const map = new Map();
    (tasks || []).filter(visible).forEach(t => {
      const key = String(t.dueDate).slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    for (const list of map.values()) {
      list.sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) || String(a.title).localeCompare(String(b.title)));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, clients, teamMembers, taskAssignee, taskClientFilter, hideCompletedTasks, scope, currentUser]);

  // Grilla del mes (Lun→Dom), sólo las semanas necesarias.
  const first = new Date(cur.y, cur.m, 1);
  const offset = (first.getDay() + 6) % 7; // 0 = lunes
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const gridStart = new Date(cur.y, cur.m, 1 - offset);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const monthCount = cells
    .filter(d => d.getMonth() === cur.m)
    .reduce((n, d) => n + (byDay.get(isoOf(d))?.length || 0), 0);

  const memberOf = (name) => {
    const f = String(name || '').split(',')[0]?.trim().toLowerCase();
    if (!f) return null;
    return (teamMembers || []).find(m => m.name?.toLowerCase() === f || m.name?.toLowerCase().split(' ')[0] === f);
  };
  const initialsFor = (m) => (m?.initials || m?.name?.slice(0, 2) || '?').toUpperCase();

  // Antigüedad: días desde que existe la tarea. Se congela al completar (usa
  // completedDate si está en done; si no, hoy → sigue creciendo).
  const ageOf = (t) => {
    const end = t.status === 'done' ? (t.completedDate || todayIso) : todayIso;
    const n = daysBetween(t.createdDate, end);
    return n == null ? null : Math.max(0, n);
  };

  const onDropDay = (iso) => {
    setOverDay(null);
    const id = draggedId; setDraggedId(null);
    if (!id) return;
    const t = (tasks || []).find(x => x.id === id);
    if (!t || String(t.dueDate).slice(0, 10) === iso) return;
    updateTask(id, { dueDate: iso });
  };

  const renderCard = (t) => {
    const c = clientById(t.clientId);
    const m = memberOf(t.assignee);
    const area = t.department ? DEPARTMENTS[t.department] : null;
    const st = TASK_STATUS[t.status] || TASK_STATUS.backlog;
    const iso = String(t.dueDate).slice(0, 10);
    const overdue = t.status !== 'done' && iso < todayIso;
    const age = ageOf(t);
    return (
      <div
        key={t.id}
        draggable
        onDragStart={(e) => { setDraggedId(t.id); e.stopPropagation(); }}
        onDragEnd={() => { setDraggedId(null); setOverDay(null); }}
        onClick={() => setOpenTaskId(t.id)}
        title={t.title}
        style={{
          background: '#fff', border: '1px solid #E2E5EB', borderLeft: `3px solid ${st.color}`,
          borderRadius: 8, padding: '6px 8px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(10,22,40,.04)',
          opacity: draggedId === t.id ? 0.4 : 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 10, color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c?.name || 'Interno'}</span>
          {area && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={area.color} strokeWidth="2" style={{ flexShrink: 0 }}><title>{area.label}</title><path d={area.path} /></svg>}
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#1A1D26', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 6 }}>
          {m
            ? <span style={{ width: 19, height: 19, borderRadius: '50%', background: m.color || '#9CA3AF', color: '#fff', fontSize: 8.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initialsFor(m)}</span>
            : <span style={{ fontSize: 9.5, color: '#B6B9C0', fontStyle: 'italic' }}>sin asignar</span>}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {overdue && <span title="Vencida" style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444' }} />}
            {age != null && <span title="Antigüedad (días desde que existe)" style={{ fontSize: 9.5, fontWeight: 600, color: overdue ? '#EF4444' : '#9CA3AF', background: overdue ? '#FEF2F2' : '#F3F4F6', borderRadius: 5, padding: '1px 5px' }}>{age}d</span>}
          </span>
        </div>
      </div>
    );
  };

  const MAX = 4;

  return (
    <div>
      {/* Contador del mes (la navegación de mes vive en TareasBar) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: '#6B7280' }}>
          <b style={{ color: '#1A1D26' }}>{monthCount}</b> {monthCount === 1 ? 'entregable' : 'entregables'} este mes
        </span>
      </div>

      {/* Cabecera de días */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8, marginBottom: 8 }}>
        {WEEKDAYS.map(d => (
          <div key={d} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9CA3AF', textAlign: 'center' }}>{d}</div>
        ))}
      </div>

      {/* Grilla */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
        {cells.map((d) => {
          const iso = isoOf(d);
          const inMonth = d.getMonth() === cur.m;
          const isToday = iso === todayIso;
          const list = byDay.get(iso) || [];
          const expanded = expandedDays.has(iso);
          const shown = expanded ? list : list.slice(0, MAX);
          const hidden = list.length - shown.length;
          const isOver = overDay === iso;
          return (
            <div
              key={iso}
              onDragOver={(e) => { e.preventDefault(); if (overDay !== iso) setOverDay(iso); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverDay(o => (o === iso ? null : o)); }}
              onDrop={() => onDropDay(iso)}
              style={{
                minHeight: 116, borderRadius: 12, padding: 7,
                background: inMonth ? '#fff' : '#FBFBFC',
                border: isOver ? '2px dashed #5B7CF5' : `1px solid ${isToday ? '#5B7CF5' : '#E2E5EB'}`,
                display: 'flex', flexDirection: 'column', gap: 5,
                boxShadow: isToday ? '0 0 0 1px #5B7CF5 inset' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1px 3px 2px' }}>
                <span style={{
                  fontSize: 12, fontWeight: isToday ? 700 : 600,
                  color: isToday ? '#fff' : (inMonth ? '#1A1D26' : '#C7CBD3'),
                  background: isToday ? '#5B7CF5' : 'transparent',
                  minWidth: 20, height: 20, borderRadius: '50%',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                }}>{d.getDate()}</span>
                {list.length > 0 && <span style={{ fontSize: 10, fontWeight: 600, color: '#B6B9C0' }}>{list.length}</span>}
              </div>
              {shown.map(renderCard)}
              {hidden > 0 && (
                <span onClick={() => setExpandedDays(s => { const n = new Set(s); n.add(iso); return n; })}
                  style={{ fontSize: 11, fontWeight: 600, color: '#5B7CF5', cursor: 'pointer', padding: '2px 4px' }}>+{hidden} más</span>
              )}
              {expanded && list.length > MAX && (
                <span onClick={() => setExpandedDays(s => { const n = new Set(s); n.delete(iso); return n; })}
                  style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', cursor: 'pointer', padding: '2px 4px' }}>ver menos</span>
              )}
            </div>
          );
        })}
      </div>

      {openTaskId && <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </div>
  );
}
