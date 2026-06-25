import { useState, useMemo, useRef } from 'react';
import { ChevronDown, ChevronRight, GripVertical, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { isKorexClient, userOwnsTask, getAllPhases } from '../../utils/helpers';
import { startDragScroll, stopDragScroll } from '../../utils/dragScroll';
import AddToSprintButton from './AddToSprintButton';
import DepartmentPicker from './DepartmentPicker';
import AssigneePicker from './AssigneePicker';
import StatusPicker from './StatusPicker';
import TaskDetailDrawer from './TaskDetailDrawer';

function dotStyle(status) {
  if (status === 'done') return { border: 'none', bg: '#22C55E', icon: '✓' };
  if (status === 'in-progress' || status === 'en-revision' || status === 'priorizado') return { border: 'none', bg: '#5B7CF5', icon: '' };
  return { border: '2px solid #D0D5DD', bg: 'transparent', icon: '' };
}
function taskInsertIndex(containerEl, clientY, draggedId) {
  const rows = Array.from(containerEl.querySelectorAll('[data-task-id]')).filter(el => el.getAttribute('data-task-id') !== draggedId);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return i;
  }
  return rows.length;
}

export default function ListaView() {
  const {
    clients, tasks, teamMembers, currentUser, activeSprint,
    updateTask, deleteTask, reorderTask,
    taskAssignee, hideCompletedTasks, taskClientFilter,
    taskComments, unreadCommentTaskIds,
    taskUserPositions, reorderTaskForUser, clientUserPositions, reorderClientForUser,
  } = useApp();
  const isAdmin = !!currentUser?.isAdmin;
  const restricted = !!currentUser && !currentUser.isAdmin;

  const [openTaskId, setOpenTaskId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [draggedClientId, setDraggedClientId] = useState(null);
  const [overClientId, setOverClientId] = useState(null);
  const [collapsed, setCollapsed] = useState(() => { try { return JSON.parse(localStorage.getItem('tareas_lista_collapsed') || '{}'); } catch { return {}; } });
  const toggleClient = (id) => setCollapsed(prev => { const n = { ...prev, [id]: !prev[id] }; try { localStorage.setItem('tareas_lista_collapsed', JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const busyRef = useRef(false);

  // Usuario cuyo orden personalizado usamos (el del filtro por persona).
  const orderUserId = useMemo(() => {
    if (!taskAssignee || taskAssignee === 'all') return null;
    const m = (teamMembers || []).find(x => x.name?.toLowerCase() === taskAssignee.toLowerCase() || x.id === taskAssignee);
    return m?.id || null;
  }, [taskAssignee, teamMembers]);
  const posByTask = useMemo(() => {
    const map = {}; if (orderUserId) (taskUserPositions || []).forEach(r => { if (r.user_id === orderUserId) map[r.task_id] = r.position; });
    return map;
  }, [orderUserId, taskUserPositions]);
  const posByClient = useMemo(() => {
    const map = {}; if (orderUserId) (clientUserPositions || []).forEach(r => { if (r.user_id === orderUserId) map[r.client_id] = r.position; });
    return map;
  }, [orderUserId, clientUserPositions]);
  const canDragForUser = !!orderUserId && (orderUserId === currentUser?.id || isAdmin);
  const tPos = (t) => (orderUserId && posByTask[t.id] !== undefined) ? posByTask[t.id] : (t.position ?? 0);
  const cPos = (c) => (orderUserId && posByClient[c.id] !== undefined) ? posByClient[c.id] : (c.position ?? 0);

  const matchesAssignee = (t) => {
    if (taskAssignee === 'all') return true;
    if (!t.assignee) return false;
    return t.assignee.split(',').map(s => s.trim().toLowerCase()).includes(taskAssignee.toLowerCase());
  };
  const clientById = (id) => (clients || []).find(c => c.id === id);
  const visible = (t) => {
    if (!activeSprint || t.sprintId !== activeSprint.id) return false;       // solo tareas del sprint
    if (restricted && !userOwnsTask(t, currentUser, teamMembers)) return false;
    if (!matchesAssignee(t)) return false;
    if (taskClientFilter !== 'all' && t.clientId !== taskClientFilter) return false;
    if (hideCompletedTasks && t.status === 'done') return false;
    return true;
  };

  // Agrupar por cliente y ordenar
  const groups = useMemo(() => {
    const byClient = new Map();
    (tasks || []).filter(visible).forEach(t => { if (!byClient.has(t.clientId)) byClient.set(t.clientId, []); byClient.get(t.clientId).push(t); });
    const list = [];
    byClient.forEach((arr, cid) => {
      const c = clientById(cid); if (!c) return;
      list.push({ c, tasks: arr.sort((a, b) => tPos(a) - tPos(b)) });
    });
    return list.sort((a, b) => cPos(a.c) - cPos(b.c));
    // eslint-disable-next-line
  }, [tasks, activeSprint, taskAssignee, hideCompletedTasks, taskClientFilter, posByTask, posByClient, orderUserId]);

  const initials = (c) => (c?.name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const runOnce = (fn) => { if (busyRef.current) return; busyRef.current = true; try { fn(); } finally { setTimeout(() => { busyRef.current = false; }, 0); } };
  const toggleDone = (t) => updateTask(t.id, { status: t.status === 'done' ? 'backlog' : 'done' });
  const saveTitle = (t) => runOnce(() => { const v = editTitle.trim(); setEditingId(null); if (v && v !== t.title) updateTask(t.id, { title: v }); });

  const dropTask = (e, clientTasks, clientId) => {
    e.preventDefault(); e.stopPropagation();
    const id = draggedTaskId; setDraggedTaskId(null);
    if (!id) return;
    const dragged = tasks.find(t => t.id === id);
    if (!dragged || dragged.clientId !== clientId) return;
    const base = clientTasks.filter(t => t.id !== id);
    const index = taskInsertIndex(e.currentTarget, e.clientY, id);
    if (orderUserId && canDragForUser) {
      const below = base[index]; const above = base[index - 1];
      reorderTaskForUser(id, orderUserId, { prevPosition: below ? tPos(below) : null, nextPosition: above ? tPos(above) : null });
    } else {
      reorderTask([...base.slice(0, index), dragged, ...base.slice(index)]);
    }
  };
  const dropClient = (target) => {
    const dragId = draggedClientId; setDraggedClientId(null); setOverClientId(null);
    if (!dragId || dragId === target.id || !orderUserId || !canDragForUser) return;
    const idx = groups.findIndex(g => g.c.id === target.id);
    let above = null; for (let i = idx - 1; i >= 0; i--) { if (groups[i].c.id !== dragId) { above = groups[i].c; break; } }
    reorderClientForUser(dragId, orderUserId, { prevPosition: cPos(target), nextPosition: above ? cPos(above) : null });
  };

  if (!activeSprint) return <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 14, padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No hay un sprint activo todavía.</div>;
  if (!groups.length) return <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 14, padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>El sprint no tiene tareas con estos filtros. Mandá tareas al sprint desde Objetivos.</div>;

  const personName = orderUserId ? (teamMembers || []).find(m => m.id === orderUserId)?.name : null;

  return (
    <div>
      {personName && (
        <div style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <GripVertical size={13} /> Orden personalizado para <b style={{ color: '#1A1D26' }}>{personName}</b>{canDragForUser ? ' — arrastrá clientes y tareas para priorizar' : ''}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {groups.map(g => {
          const c = g.c;
          const done = g.tasks.filter(t => t.status === 'done').length;
          const canDragClient = !!orderUserId && canDragForUser;
          return (
            <div key={c.id}
              onDragOver={(e) => { if (draggedClientId && draggedClientId !== c.id) { e.preventDefault(); setOverClientId(c.id); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverClientId(prev => prev === c.id ? null : prev); }}
              onDrop={() => dropClient(c)}
              style={{ background: '#fff', border: `1px solid ${overClientId === c.id ? '#5B7CF5' : '#E2E5EB'}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(10,22,40,.05)', overflow: 'hidden', opacity: draggedClientId === c.id ? 0.5 : 1 }}>
              {/* header cliente */}
              <div onClick={() => toggleClient(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderBottom: collapsed[c.id] ? 'none' : '1px solid #F0F2F5', cursor: 'pointer' }}>
                {canDragClient && (
                  <span draggable onClick={(e) => e.stopPropagation()} onDragStart={(e) => { e.stopPropagation(); setDraggedClientId(c.id); startDragScroll(); }} onDragEnd={() => { setDraggedClientId(null); setOverClientId(null); stopDragScroll(); }}
                    title="Arrastrar para priorizar este cliente" style={{ display: 'flex', color: '#C7CBD3', cursor: 'grab', flexShrink: 0 }}><GripVertical size={15} /></span>
                )}
                <span style={{ color: '#9CA3AF', flexShrink: 0, display: 'flex' }}>{collapsed[c.id] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</span>
                {c.avatarUrl ? <img src={c.avatarUrl} alt={c.name} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  : <span style={{ width: 30, height: 30, borderRadius: '50%', background: isKorexClient(c) ? '#0D1117' : (c.color || '#5B7CF5'), color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(c)}</span>}
                <span style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</span>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>{done}/{g.tasks.length}</span>
              </div>
              {/* tareas */}
              {!collapsed[c.id] && (
              <div onDragOver={(e) => { if (draggedTaskId) e.preventDefault(); }} onDrop={(e) => dropTask(e, g.tasks, c.id)}>
                {g.tasks.map((t, i) => {
                  const d = dotStyle(t.status);
                  const cCount = (taskComments || []).filter(cc => cc.task_id === t.id && !cc.parent_id).length;
                  const unread = unreadCommentTaskIds?.has?.(t.id);
                  const phase = t.phase ? getAllPhases(c)[t.phase] : null;
                  const editing = editingId === t.id;
                  return (
                    <div key={t.id} data-task-id={t.id} draggable={!editing}
                      onDragStart={(e) => { e.stopPropagation(); setDraggedTaskId(t.id); startDragScroll(); }}
                      onDragEnd={() => { setDraggedTaskId(null); stopDragScroll(); }}
                      onClick={() => { if (!editing) setOpenTaskId(t.id); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < g.tasks.length - 1 ? '1px solid #F0F2F5' : 'none', cursor: 'pointer', opacity: draggedTaskId === t.id ? 0.4 : 1 }}>
                      <span onClick={(e) => { e.stopPropagation(); toggleDone(t); }} title={t.status === 'done' ? 'Marcar pendiente' : 'Marcar completada'} style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: d.border, background: d.bg, color: '#fff', fontSize: 11, cursor: 'pointer' }}>{d.icon}</span>
                      {editing ? (
                        <input autoFocus value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(t); if (e.key === 'Escape') setEditingId(null); }} onBlur={() => saveTitle(t)}
                          style={{ flex: 1, minWidth: 0, fontSize: 13, border: '1px solid #C7D2FE', borderRadius: 7, padding: '5px 9px', outline: 'none', fontFamily: 'inherit' }} />
                      ) : (
                        <>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#1A1D26', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</span>
                          {phase && <span style={{ fontSize: 10.5, fontWeight: 600, color: phase.color, background: phase.color + '1A', borderRadius: 5, padding: '2px 7px', flexShrink: 0, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phase.label}</span>}
                          <span onClick={(e) => { e.stopPropagation(); setEditTitle(t.title); setEditingId(t.id); }} title="Editar título" style={{ color: '#C7CBD3', cursor: 'pointer', flexShrink: 0, display: 'flex' }}><Pencil size={12} /></span>
                          <span onClick={(e) => { e.stopPropagation(); if (window.confirm(`Eliminar la tarea «${t.title}»?`)) deleteTask(t.id); }} title="Eliminar tarea" style={{ color: '#C7CBD3', cursor: 'pointer', flexShrink: 0, display: 'flex' }}><Trash2 size={12} /></span>
                        </>
                      )}
                      <StatusPicker value={t.status} onChange={(s) => updateTask(t.id, { status: s })} />
                      {cCount > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: unread ? '#5B7CF5' : '#9CA3AF', flexShrink: 0 }}><MessageSquare size={13} />{cCount}{unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#5B7CF5' }} />}</span>}
                      <DepartmentPicker value={t.department} onChange={(dep) => updateTask(t.id, { department: dep })} />
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }} title="Horas estimadas" onClick={(e) => e.stopPropagation()}>
                        <input type="number" min="0" step="0.5" defaultValue={t.estimatedHours ?? ''} placeholder="–"
                          onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (t.estimatedHours ?? null)) updateTask(t.id, { estimatedHours: v }); }}
                          style={{ width: 40, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#3F4653', textAlign: 'right', border: '1px solid #E2E5EB', borderRadius: 6, padding: '3px 5px', background: '#fff', outline: 'none' }} />
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>h</span>
                      </span>
                      <AssigneePicker value={t.assignee} onChange={(name) => updateTask(t.id, { assignee: name })} />
                      <AddToSprintButton task={t} />
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          );
        })}
      </div>

      {openTaskId && <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </div>
  );
}
