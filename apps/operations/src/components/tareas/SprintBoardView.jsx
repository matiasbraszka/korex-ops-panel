import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { SPRINT_COLUMNS, DEPARTMENTS } from '../../utils/constants';
import { sprintTasks, userOwnsTask, isKorexClient, progressOf, getAllPhases, isTaskBlocked } from '../../utils/helpers';
import { startDragScroll, stopDragScroll } from '../../utils/dragScroll';
import TaskDetailDrawer from './TaskDetailDrawer';

const COL_STATUSES = SPRINT_COLUMNS.map(c => c.status);
const boardColumn = (status) => (COL_STATUSES.includes(status) ? status : 'priorizado');

function insertIndexAt(colEl, clientY, draggedId) {
  const cards = Array.from(colEl.querySelectorAll('[data-card-id]')).filter(el => el.getAttribute('data-card-id') !== draggedId);
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return i;
  }
  return cards.length;
}

function Kpi({ label, value, sub, color, barw }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 14, padding: '15px 17px', boxShadow: '0 1px 2px rgba(10,22,40,.05)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: '#9CA3AF' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
        <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-0.02em', color: color || '#1A1D26' }}>{value}</span>
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>{sub}</span>
      </div>
      {barw != null && <span style={{ display: 'block', marginTop: 11, height: 7, borderRadius: 999, background: '#F0F2F5', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', background: '#5B7CF5', width: barw }} /></span>}
    </div>
  );
}

export default function SprintBoardView({ scope = 'cli' }) {
  const {
    activeSprint, tasks, updateTask, reorderTask, teamMembers, clients, currentUser,
    taskAssignee, taskClientFilter, taskComments,
  } = useApp();
  const restricted = !!currentUser && !currentUser.isAdmin;

  const [draggedId, setDraggedId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [wipMsg, setWipMsg] = useState('');
  const [openTaskId, setOpenTaskId] = useState(null);
  const [query, setQuery] = useState('');

  const clientById = (id) => (clients || []).find(c => c.id === id);
  const matchesQuery = (t) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const c = clientById(t.clientId);
    const phaseLabel = c && t.phase ? (getAllPhases(c)[t.phase]?.label || '') : '';
    const dept = t.department ? (DEPARTMENTS[t.department]?.label || '') : '';
    return `${t.title} ${c?.name || ''} ${phaseLabel} ${dept}`.toLowerCase().includes(q);
  };
  const matchesAssignee = (t) => {
    if (taskAssignee === 'all') return true;
    if (!t.assignee) return false;
    return t.assignee.split(',').map(s => s.trim().toLowerCase()).includes(taskAssignee.toLowerCase());
  };
  const visible = (t) => {
    if (restricted && !userOwnsTask(t, currentUser, teamMembers)) return false;
    if (!matchesAssignee(t)) return false;
    if (!matchesQuery(t)) return false;
    if (taskClientFilter !== 'all' && t.clientId !== taskClientFilter) return false;
    // En el Tablero Sprint la columna "Validado" SIEMPRE muestra las tareas
    // completadas del sprint (es su propósito). No aplicamos "ocultar
    // completadas" acá: si no, al soltar una tarea en Validado desaparecía.
    const c = clientById(t.clientId);
    if (c) { const interno = isKorexClient(c); if (scope === 'int' ? !interno : interno) return false; }
    return true;
  };

  const inSprint = sprintTasks(tasks, activeSprint).filter(visible);
  const memberOf = (name) => {
    const f = String(name || '').split(',')[0]?.trim().toLowerCase();
    if (!f) return null;
    return (teamMembers || []).find(m => m.name?.toLowerCase() === f || m.name?.toLowerCase().split(' ')[0] === f);
  };
  const initialsFor = (m) => (m?.initials || m?.name?.slice(0, 2) || '?').toUpperCase();

  const columnTasks = (status) => inSprint
    .filter(t => boardColumn(t.status) === status)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.sprintPriority || 9) - (b.sprintPriority || 9));

  const onDrop = (colStatus, e) => {
    setOverCol(null);
    const id = draggedId; setDraggedId(null);
    if (!id) return;
    const task = inSprint.find(t => t.id === id);
    if (!task) return;
    const movingCol = boardColumn(task.status) !== colStatus;
    // Tarea bloqueada por otra sin validar: solo puede estar en el Backlog.
    if (movingCol && colStatus !== 'backlog' && isTaskBlocked(task, tasks)) {
      setWipMsg('Tarea bloqueada por otra sin validar. Se queda en el Backlog hasta completar la que la bloquea.');
      setTimeout(() => setWipMsg(''), 4500);
      return;
    }
    const col = SPRINT_COLUMNS.find(c => c.status === colStatus);
    if (movingCol && col?.wip && columnTasks(colStatus).length >= col.wip) {
      setWipMsg(`Tope de WIP en «${col.label}» (${col.wip}). Validá o cerrá una tarea antes de mover otra.`);
      setTimeout(() => setWipMsg(''), 4000);
      return;
    }
    const base = columnTasks(colStatus).filter(t => t.id !== id);
    const index = insertIndexAt(e.currentTarget, e.clientY, id);
    const newOrder = [...base.slice(0, index), task, ...base.slice(index)];
    if (movingCol) updateTask(id, { status: colStatus });
    reorderTask(newOrder);
  };

  if (!activeSprint) {
    return <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 14, padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No hay un sprint activo todavía.</div>;
  }

  // KPIs sobre el set visible (inSprint) → se adaptan al filtro por persona,
  // cliente, búsqueda y scope. `tasks` se pasa para resolver bloqueos aunque la
  // tarea bloqueadora esté fuera del filtro actual.
  const prog = progressOf(inSprint, tasks);
  const filtered = taskAssignee !== 'all' || taskClientFilter !== 'all' || !!query.trim();
  const kpis = [
    { label: filtered ? 'Avance (filtrado)' : 'Avance del sprint', value: `${prog.done} / ${prog.total}`, sub: 'validadas', color: '#1A1D26', barw: prog.pct + '%' },
    { label: 'En curso', value: String(prog.wip), sub: prog.wip === 1 ? 'tarea activa' : 'tareas activas', color: '#1A1D26' },
    { label: 'Tareas vencidas', value: String(prog.overdue), sub: prog.overdue ? 'requieren atención' : 'sin vencidas', color: prog.overdue ? '#EF4444' : '#22C55E' },
    { label: 'Bloqueos abiertos', value: String(prog.blocked), sub: prog.blocked ? 'a destrabar' : 'todo fluye', color: prog.blocked ? '#EF4444' : '#22C55E' },
  ];

  return (
    <div>
      <div className="kx-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 16 }}>
        {kpis.map(k => <Kpi key={k.label} {...k} />)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 10, padding: '8px 12px', width: 320, maxWidth: '100%', marginBottom: 16 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tarea, objetivo o cliente…"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: '#1A1D26', fontFamily: 'inherit' }} />
        {query && <span onClick={() => setQuery('')} title="Limpiar" style={{ cursor: 'pointer', color: '#9CA3AF', display: 'flex' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg></span>}
      </div>

      {wipMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FEF2F2', color: '#DC2626', fontSize: 12.5, borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>{wipMsg}</div>
      )}

      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 10 }}>
        {SPRINT_COLUMNS.map(col => {
          const list = columnTasks(col.status);
          const atCap = col.wip && list.length >= col.wip;
          return (
            <div key={col.status}
              onDragOver={(e) => { e.preventDefault(); setOverCol(col.status); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null); }}
              onDrop={(e) => onDrop(col.status, e)}
              style={{ flex: 1, minWidth: 238, background: col.bg, borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, alignSelf: 'flex-start', outline: overCol === col.status ? '2px dashed #5B7CF5' : 'none', outlineOffset: -3 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px 0' }}>
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', color: col.tx, whiteSpace: 'nowrap' }}>{col.name || col.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: atCap ? '#DC2626' : '#9CA3AF' }}>{col.wip ? `${list.length}/${col.wip}` : list.length}</span>
              </div>
              {list.map(t => {
                const c = clientById(t.clientId);
                const m = memberOf(t.assignee);
                const area = t.department ? DEPARTMENTS[t.department] : null;
                const phase = c && t.phase ? getAllPhases(c)[t.phase] : null;
                const checklist = Array.isArray(t.checklist) ? t.checklist : [];
                const subTotal = checklist.length;
                const subDone = checklist.filter(s => s.done).length;
                const cCount = (taskComments || []).filter(cc => cc.task_id === t.id && !cc.parent_id).length;
                const blocked = isTaskBlocked(t, tasks);
                return (
                  <div key={t.id} data-card-id={t.id} draggable
                    onDragStart={() => { setDraggedId(t.id); startDragScroll(); }}
                    onDragEnd={() => { setDraggedId(null); setOverCol(null); stopDragScroll(); }}
                    onClick={() => setOpenTaskId(t.id)}
                    style={{ background: blocked ? '#FFFBFB' : '#fff', border: blocked ? '1px solid #FECACA' : '1px solid #E2E5EB', borderRadius: 11, padding: '11px 12px', boxShadow: '0 1px 2px rgba(10,22,40,.04)', cursor: 'pointer', opacity: draggedId === t.id ? 0.4 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c?.name || ''}</span>
                      {blocked && (
                        <span title="Bloqueada por otra tarea sin validar" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9.5, fontWeight: 700, color: '#DC2626', background: '#FEF2F2', borderRadius: 5, padding: '1px 5px', flexShrink: 0 }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                          Bloqueada
                        </span>
                      )}
                      {area && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={area.color} strokeWidth="1.9" style={{ flexShrink: 0 }}><title>{area.label}</title><path d={area.path} /></svg>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1D26', lineHeight: 1.4 }}>{t.title}</div>
                    {phase && (
                      <div style={{ marginTop: 8 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: phase.color, background: phase.color + '1A', borderRadius: 6, padding: '2px 8px', maxWidth: '100%', overflow: 'hidden' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: phase.color, flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phase.label}</span>
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 11 }}>
                      {m
                        ? <span style={{ width: 24, height: 24, borderRadius: '50%', background: m.color || '#9CA3AF', color: '#fff', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initialsFor(m)}</span>
                        : <span style={{ fontSize: 11, color: '#B6B9C0', fontStyle: 'italic' }}>sin asignar</span>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        {subTotal > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#6B7280' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>{subDone}/{subTotal}</span>}
                        {cCount > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9CA3AF' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" /></svg>{cCount}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {list.length === 0 && <div style={{ border: '1.5px dashed #D8DBE2', borderRadius: 10, padding: 16, textAlign: 'center', fontSize: 12, color: '#B6B9C0' }}>Sin tareas</div>}
            </div>
          );
        })}
      </div>

      {openTaskId && <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </div>
  );
}
