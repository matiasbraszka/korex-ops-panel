import { useState } from 'react';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SPRINT_COLUMNS, DEPARTMENTS, TASK_PRIORITY } from '../../utils/constants';
import { sprintTasks, userOwnsTask, sprintProgress, getAllPhases, isTaskBlocked, sprintDaysLeft, isSprintLocked, canValidate, pendingCriteria, sprintCount, computeStatusDurations, fmtDuration, assigneeMatches } from '../../utils/helpers';
import { startDragScroll, stopDragScroll } from '../../utils/dragScroll';
import TaskDetailDrawer from './TaskDetailDrawer';
import PriorityPicker from './PriorityPicker';

const prioRank = (t) => TASK_PRIORITY[t?.priority]?.rank ?? 9;

const COL_STATUSES = SPRINT_COLUMNS.map(c => c.status);

function insertIndexAt(colEl, clientY, draggedId) {
  const cards = Array.from(colEl.querySelectorAll('[data-card-id]')).filter(el => el.getAttribute('data-card-id') !== draggedId);
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return i;
  }
  return cards.length;
}

export default function SprintBoardView() {
  const {
    activeSprint, sprints, tasks, updateTask, reorderTask, moveTaskToSprint, teamMembers, clients, currentUser,
    taskAssignee, taskClientFilter, taskComments,
  } = useApp();
  const restricted = !!currentUser && !currentUser.isAdmin;

  const [draggedId, setDraggedId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [wipMsg, setWipMsg] = useState('');
  const [openTaskId, setOpenTaskId] = useState(null);
  const [query, setQuery] = useState('');

  // Navegación entre sprints: por defecto el activo; se puede ir a los anteriores.
  // Un sprint cerrado queda bloqueado (sus tareas no cambian de estado; solo se
  // pueden mover al sprint actual). null = sigue al sprint activo.
  const sprintsSorted = [...(sprints || [])].sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  const [viewSprintId, setViewSprintId] = useState(null);
  const viewSprint = (sprints || []).find(s => s.id === viewSprintId) || activeSprint;
  const locked = isSprintLocked(viewSprint);
  const viewIdx = sprintsSorted.findIndex(s => s.id === viewSprint?.id);
  const hasPrev = viewIdx >= 0 && viewIdx + 1 < sprintsSorted.length;
  const hasNext = viewIdx > 0;
  const goPrev = () => { if (hasPrev) setViewSprintId(sprintsSorted[viewIdx + 1].id); };
  const goNext = () => { if (hasNext) setViewSprintId(sprintsSorted[viewIdx - 1].id); };

  const clientById = (id) => (clients || []).find(c => c.id === id);
  const matchesQuery = (t) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const c = clientById(t.clientId);
    const phaseLabel = c && t.phase ? (getAllPhases(c)[t.phase]?.label || '') : '';
    const dept = t.department ? (DEPARTMENTS[t.department]?.label || '') : '';
    return `${t.title} ${c?.name || ''} ${phaseLabel} ${dept}`.toLowerCase().includes(q);
  };
  const matchesAssignee = (t) => assigneeMatches(t.assignee, taskAssignee);
  const visible = (t) => {
    if (restricted && !userOwnsTask(t, currentUser, teamMembers)) return false;
    if (!matchesAssignee(t)) return false;
    if (!matchesQuery(t)) return false;
    if (taskClientFilter !== 'all' && t.clientId !== taskClientFilter) return false;
    // En el Tablero Sprint la columna "Validado" SIEMPRE muestra las tareas
    // completadas del sprint (es su propósito). No aplicamos "ocultar
    // completadas" acá: si no, al soltar una tarea en Validado desaparecía.
    return true;
  };

  const inSprint = sprintTasks(tasks, viewSprint).filter(visible);
  const memberOf = (name) => {
    const f = String(name || '').split(',')[0]?.trim().toLowerCase();
    if (!f) return null;
    return (teamMembers || []).find(m => m.name?.toLowerCase() === f || m.name?.toLowerCase().split(' ')[0] === f);
  };
  const initialsFor = (m) => (m?.initials || m?.name?.slice(0, 2) || '?').toUpperCase();

  // Columna del tablero para una tarea. Si está bloqueada (a mano con status
  // 'blocked' o por una dependencia sin validar) va SIEMPRE a la columna Bloqueos.
  const taskColumn = (t) => {
    if (t.status === 'blocked' || isTaskBlocked(t, tasks)) return 'blocked';
    return COL_STATUSES.includes(t.status) ? t.status : 'priorizado';
  };

  const columnTasks = (status) => inSprint
    .filter(t => taskColumn(t) === status)
    // Orden visual por PRIORIDAD (súper-alta arriba → alta → media → baja → sin
    // prioridad). La posición y la prioridad de sprint solo desempatan.
    .sort((a, b) => prioRank(a) - prioRank(b) || (a.position ?? 0) - (b.position ?? 0) || (a.sprintPriority || 9) - (b.sprintPriority || 9));

  const onDrop = (colStatus, e) => {
    setOverCol(null);
    const id = draggedId; setDraggedId(null);
    if (!id) return;
    if (locked) {
      setWipMsg('Este sprint está cerrado. Para reorganizar una tarea, movela al sprint actual desde la tarjeta.');
      setTimeout(() => setWipMsg(''), 4500);
      return;
    }
    const task = inSprint.find(t => t.id === id);
    if (!task) return;
    const movingCol = taskColumn(task) !== colStatus;
    // Trabada por una dependencia sin validar: no se puede avanzar a una columna
    // de flujo. Sí se puede dejar en Bloqueos (o moverla dentro de Bloqueos).
    if (movingCol && colStatus !== 'blocked' && isTaskBlocked(task, tasks)) {
      setWipMsg('No se puede avanzar: está bloqueada por otra tarea sin validar. Destrabá esa primero.');
      setTimeout(() => setWipMsg(''), 4500);
      return;
    }
    // Candado de validación: no se puede pasar a "Validado" con criterios de
    // aceptación pendientes (solo se chequea al destino Validado).
    if (movingCol && colStatus === 'done' && !canValidate(task)) {
      setWipMsg(`Faltan ${pendingCriteria(task)} criterio(s) de aceptación para validar «${task.title}».`);
      setTimeout(() => setWipMsg(''), 5000);
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

  if (!viewSprint) {
    return <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 14, padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No hay un sprint activo todavía.</div>;
  }

  const prog = sprintProgress(tasks, viewSprint);
  const remaining = Math.max(0, prog.total - prog.done); // tareas que faltan terminar
  const daysLeft = sprintDaysLeft(viewSprint);

  return (
    <div>
      {/* Fila 2: info del sprint + KPIs (Avance / En curso) + buscador, todo junto. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: '#fff', border: '1px solid #E2E5EB', borderRadius: 12, padding: '9px 14px', marginBottom: 16, boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span onClick={goPrev} title="Sprint anterior" style={{ display: 'flex', width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: '1px solid #E2E5EB', cursor: hasPrev ? 'pointer' : 'not-allowed', color: hasPrev ? '#3F4653' : '#C7CBD3' }}><ChevronLeft size={15} /></span>
          <span onClick={goNext} title="Sprint siguiente" style={{ display: 'flex', width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: '1px solid #E2E5EB', cursor: hasNext ? 'pointer' : 'not-allowed', color: hasNext ? '#3F4653' : '#C7CBD3' }}><ChevronRight size={15} /></span>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: '#1A1D26', whiteSpace: 'nowrap' }}>{viewSprint?.name || 'Sprint'}</span>
          {locked
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6B7280', background: '#F0F2F5', borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}><Lock size={11} />Cerrado</span>
            : (daysLeft != null && <span style={{ fontSize: 11, fontWeight: 600, color: '#B45309', background: '#FFF7ED', borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>{daysLeft === 0 ? 'cierra hoy' : `quedan ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}`}</span>)}
          {viewSprint?.id !== activeSprint?.id && activeSprint && <span onClick={() => setViewSprintId(activeSprint.id)} style={{ fontSize: 12, fontWeight: 600, color: '#5B7CF5', cursor: 'pointer', whiteSpace: 'nowrap' }}>Volver al actual</span>}
        </div>
        <span style={{ width: 1, height: 20, background: '#E2E5EB' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9CA3AF' }}>Avance</span>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: '#1A1D26' }}>{prog.done}<span style={{ color: '#9CA3AF', fontWeight: 600 }}>/{prog.total}</span></span>
          <span style={{ display: 'block', width: 70, height: 6, borderRadius: 999, background: '#F0F2F5', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', background: '#5B7CF5', width: prog.pct + '%' }} /></span>
        </div>
        <span style={{ width: 1, height: 20, background: '#E2E5EB' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9CA3AF' }}>En curso</span>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: '#1A1D26' }}>{prog.wip}<span style={{ color: '#9CA3AF', fontWeight: 600 }}>/{remaining}</span></span>
        </div>
        <span style={{ flex: 1, minWidth: 16 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F7F8FA', border: '1px solid #E2E5EB', borderRadius: 9, padding: '6px 11px', width: 240, maxWidth: '100%' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tarea o cliente…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: '#1A1D26', fontFamily: 'inherit' }} />
          {query && <span onClick={() => setQuery('')} title="Limpiar" style={{ cursor: 'pointer', color: '#9CA3AF', display: 'flex' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg></span>}
        </div>
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
              style={{ flex: 1, minWidth: 238, background: col.bg, borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, alignSelf: draggedId ? 'stretch' : 'flex-start', outline: overCol === col.status ? '2px dashed #5B7CF5' : 'none', outlineOffset: -3 }}>
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
                const cCount = (taskComments || []).filter(cc => cc.task_id === t.id && !cc.parent_id && (!cc.kind || cc.kind === 'user')).length;
                const blocked = isTaskBlocked(t, tasks);
                const dur = computeStatusDurations(t, taskComments);
                const showDur = (t.status === 'in-progress' || t.status === 'en-revision');
                const nSprints = sprintCount(t);
                return (
                  <div key={t.id} data-card-id={t.id} draggable={!locked}
                    onDragStart={() => { if (locked) return; setDraggedId(t.id); startDragScroll(); }}
                    onDragEnd={() => { setDraggedId(null); setOverCol(null); stopDragScroll(); }}
                    onClick={() => setOpenTaskId(t.id)}
                    style={{ background: blocked ? '#FFFBFB' : '#fff', border: blocked ? '1px solid #FECACA' : '1px solid #E2E5EB', borderRadius: 11, padding: '11px 12px', boxShadow: '0 1px 2px rgba(10,22,40,.04)', cursor: 'pointer', opacity: draggedId === t.id ? 0.4 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      {c
                        ? <span title={c.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, fontSize: 10.5, fontWeight: 600, color: c.color || '#6B7280', background: (c.color || '#9CA3AF') + '1A', borderRadius: 6, padding: '2px 8px' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color || '#9CA3AF', flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                          </span>
                        : <span />}
                      <span style={{ flex: 1, minWidth: 0 }} />
                      <PriorityPicker value={t.priority} onChange={(p) => updateTask(t.id, { priority: p || 'normal' })} />
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
                        {showDur && <span title="Tiempo en el estado actual" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#9CA3AF' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>{fmtDuration(dur.current?.days)}</span>}
                        {nSprints > 1 && <span title={`Lleva ${nSprints} sprints`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#B45309', background: '#FFF7ED', borderRadius: 5, padding: '1px 6px' }}>{nSprints} sprints</span>}
                        {subTotal > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#6B7280' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>{subDone}/{subTotal}</span>}
                        {cCount > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9CA3AF' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" /></svg>{cCount}</span>}
                      </div>
                    </div>
                    {locked && activeSprint && viewSprint?.id !== activeSprint.id && (
                      <div onClick={(e) => { e.stopPropagation(); moveTaskToSprint(t.id, activeSprint.id); }}
                        style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#5B7CF5', background: '#EEF2FF', borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}>
                        Mover al sprint actual
                      </div>
                    )}
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
