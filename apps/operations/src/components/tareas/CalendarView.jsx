import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DEPARTMENTS, TASK_STATUS } from '../../utils/constants';
import { today, daysAgo, daysBetween, assigneeMatches, userSeesTask } from '../../utils/helpers';
import PersonAvatar from './PersonAvatar';
import TaskDetailDrawer from './TaskDetailDrawer';

// Calendario mensual de ENTREGABLES: toda tarea con "fecha de entrega" (dueDate)
// cae en su día. Muy visual, respeta los filtros de cliente/encargado del toolbar
// de Tareas. Reusa el mismo drawer de detalle del Tablero Sprint. La navegación de
// mes vive en la 2ª fila (igual que la barra de sprint del Tablero).

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// 'YYYY-MM-DD' local de un objeto Date (sin pasar por UTC, igual criterio que today()).
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function CalendarView({ onlySprint = false }) {
  const {
    tasks, clients, teamMembers, updateTask, currentUser, activeSprint,
    taskAssignee, taskClientFilter, hideCompletedTasks,
  } = useApp();
  const restricted = !!currentUser && !currentUser.isAdmin;

  const todayIso = today();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [openTaskId, setOpenTaskId] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [overDay, setOverDay] = useState(null);
  const [expandedDays, setExpandedDays] = useState(() => new Set());

  const clientById = (id) => (clients || []).find(c => c.id === id);

  const visible = (t) => {
    if (!t.dueDate) return false;
    if (restricted && !userSeesTask(t, currentUser, teamMembers)) return false;
    if (hideCompletedTasks && t.status === 'done') return false;
    if (onlySprint && (!activeSprint || t.sprintId !== activeSprint.id)) return false;
    if (!assigneeMatches(t.assignee, taskAssignee)) return false;
    if (taskClientFilter !== 'all' && t.clientId !== taskClientFilter) return false;
    return true;
  };

  // Mapa dueDate('YYYY-MM-DD') -> [tareas], completadas al final.
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
  }, [tasks, clients, teamMembers, taskAssignee, taskClientFilter, hideCompletedTasks, onlySprint, activeSprint, currentUser]);

  // Grilla del mes (Lun→Dom), sólo las semanas necesarias.
  const first = new Date(cursor.y, cursor.m, 1);
  const offset = (first.getDay() + 6) % 7; // 0 = lunes
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const gridStart = new Date(cursor.y, cursor.m, 1 - offset);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });

  const monthLabel = (() => { const s = first.toLocaleDateString('es', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); })();
  const monthCount = cells.filter(d => d.getMonth() === cursor.m).reduce((n, d) => n + (byDay.get(isoOf(d))?.length || 0), 0);

  const stepMonth = (delta) => setCursor(c => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const goToday = () => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); };

  const memberOf = (name) => {
    const f = String(name || '').split(',')[0]?.trim().toLowerCase();
    if (!f) return null;
    return (teamMembers || []).find(m => m.name?.toLowerCase() === f || m.name?.toLowerCase().split(' ')[0] === f);
  };

  // Antigüedad idéntica a la tarjeta del Tablero Sprint: días desde que se creó;
  // en las validadas se congela en cuánto tardó (de creada a completada).
  const ageOf = (t) => {
    if (!t.createdDate) return null;
    const isDone = t.status === 'done';
    const doneDate = t.completedDate || (t.validatedAt ? t.validatedAt.slice(0, 10) : null);
    return isDone && doneDate ? Math.max(0, daysBetween(t.createdDate, doneDate) ?? 0) : daysAgo(t.createdDate);
  };

  const onDropDay = (iso) => {
    setOverDay(null);
    const id = draggedId; setDraggedId(null);
    if (!id) return;
    const t = (tasks || []).find(x => x.id === id);
    if (!t || String(t.dueDate).slice(0, 10) === iso) return;
    updateTask(id, { dueDate: iso });
  };

  const navBtn = { display: 'flex', width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: '1px solid #E2E5EB', cursor: 'pointer', color: '#3F4653' };

  const renderCard = (t) => {
    const c = clientById(t.clientId);
    const firstName = String(t.assignee || '').split(',')[0]?.trim() || '';
    const m = memberOf(firstName);
    const nAssignees = String(t.assignee || '').split(',').map(s => s.trim()).filter(Boolean).length;
    const area = t.department ? DEPARTMENTS[t.department] : null;
    const st = TASK_STATUS[t.status] || TASK_STATUS.backlog;
    const iso = String(t.dueDate).slice(0, 10);
    const overdue = t.status !== 'done' && iso < todayIso;
    const isDone = t.status === 'done';
    const age = ageOf(t);
    const inSprint = !!activeSprint && t.sprintId === activeSprint.id;
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
          {c
            ? <span title={c.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1, fontSize: 9.5, fontWeight: 600, color: c.color || '#6B7280', background: (c.color || '#9CA3AF') + '1A', borderRadius: 5, padding: '1px 6px' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color || '#9CA3AF', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              </span>
            : <span style={{ flex: 1, minWidth: 0, fontSize: 9.5, color: '#9CA3AF' }}>Interno</span>}
          {inSprint
            ? <span title="En el sprint actual" style={{ display: 'inline-flex', flexShrink: 0 }}><Zap size={11} fill="#5B7CF5" stroke="none" /></span>
            : <span title="Fuera del sprint" style={{ display: 'inline-flex', flexShrink: 0 }}><Zap size={11} fill="none" stroke="#D0D5DD" strokeWidth={2} /></span>}
          {area && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={area.color} strokeWidth="2" style={{ flexShrink: 0 }}><title>{area.label}</title><path d={area.path} /></svg>}
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#1A1D26', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 6 }}>
          {firstName
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
                <PersonAvatar member={m} name={firstName} size={19} title={m?.name || firstName} />
                {nAssignees > 1 && <span style={{ fontSize: 9, fontWeight: 600, color: '#9CA3AF' }}>+{nAssignees - 1}</span>}
              </span>
            : <span style={{ fontSize: 9.5, color: '#B6B9C0', fontStyle: 'italic' }}>sin asignar</span>}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {overdue && <span title="Vencida" style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444' }} />}
            {age != null && <span title={isDone ? 'Cuánto tardó: de creada a completada' : 'Días desde que se creó la tarea'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9.5, fontWeight: 600, color: overdue ? '#EF4444' : '#9CA3AF', background: overdue ? '#FEF2F2' : '#F3F4F6', borderRadius: 5, padding: '1px 5px' }}>{isDone ? age + 'd' : (age === 0 ? 'hoy' : age + 'd')}</span>}
          </span>
        </div>
      </div>
    );
  };

  const MAX = 4;

  return (
    <div>
      {/* Fila 2: navegación de mes + contador (mismo estilo que la barra del Tablero Sprint) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#fff', border: '1px solid #E2E5EB', borderRadius: 12, padding: '9px 14px', marginBottom: 16, boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span onClick={() => stepMonth(-1)} title="Mes anterior" style={navBtn}><ChevronLeft size={15} /></span>
          <span onClick={() => stepMonth(1)} title="Mes siguiente" style={navBtn}><ChevronRight size={15} /></span>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: '#1A1D26', whiteSpace: 'nowrap', minWidth: 130 }}>{monthLabel}</span>
          <span onClick={goToday} style={{ fontSize: 12, fontWeight: 600, color: '#5B7CF5', background: '#EEF2FF', borderRadius: 8, padding: '5px 11px', cursor: 'pointer' }}>Hoy</span>
        </div>
        <span style={{ flex: 1, minWidth: 16 }} />
        <span style={{ fontSize: 12.5, color: '#6B7280', whiteSpace: 'nowrap' }}>
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
          const inMonth = d.getMonth() === cursor.m;
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
