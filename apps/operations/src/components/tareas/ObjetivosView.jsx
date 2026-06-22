import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Target, Clock, ArrowUpRight, Info, GripVertical, MessageSquare, Plus, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { isKorexClient, userOwnsTask, getAllPhases } from '../../utils/helpers';
import { startDragScroll, stopDragScroll } from '../../utils/dragScroll';
import AddToSprintButton from './AddToSprintButton';
import DepartmentPicker from './DepartmentPicker';
import PriorityPicker from './PriorityPicker';
import AssigneePicker from './AssigneePicker';
import TaskDetailDrawer from './TaskDetailDrawer';

const EXPANDED_KEY = 'tareas_objetivos_expanded';

// Índice de inserción según la posición vertical del cursor dentro del grupo.
function taskInsertIndex(containerEl, clientY, draggedId) {
  const rows = Array.from(containerEl.querySelectorAll('[data-task-id]')).filter(el => el.getAttribute('data-task-id') !== draggedId);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return i;
  }
  return rows.length;
}

// Estado → estilo del puntito de la tarea (igual que el diseño).
function dotStyle(status) {
  if (status === 'done') return { border: 'none', bg: '#22C55E', icon: '✓' };
  if (status === 'in-progress' || status === 'en-revision' || status === 'priorizado') return { border: 'none', bg: '#5B7CF5', icon: '' };
  return { border: '2px solid #D0D5DD', bg: 'transparent', icon: '' };
}

export default function ObjetivosView({ scope = 'cli', onlySprint = false }) {
  const {
    clients, tasks, teamMembers, currentUser, updateTask, createTask, reorderTask, deleteTask, updateClient, activeSprint,
    taskAssignee, taskClientFilter, hideCompletedTasks, reorderClient, setSelectedId, setView,
    taskComments, unreadCommentTaskIds, addTaskToSprint,
  } = useApp();
  const restricted = !!currentUser && !currentUser.isAdmin;

  const [editingPhase, setEditingPhase] = useState(null); // `${clientId}::${phaseKey}`
  const [editPhaseText, setEditPhaseText] = useState('');
  const [addingPhase, setAddingPhase] = useState(null); // clientId
  const [newPhaseText, setNewPhaseText] = useState('');

  // ── Gestión de objetivos (fases) por cliente, como en el roadmap viejo ──
  const renamePhase = (c, phaseKey) => {
    const label = editPhaseText.trim();
    if (label) {
      const isCustom = (c.customPhases || []).some(cp => cp.id === phaseKey);
      if (isCustom) updateClient(c.id, { customPhases: (c.customPhases || []).map(cp => cp.id === phaseKey ? { ...cp, label } : cp) });
      else updateClient(c.id, { phaseNameOverrides: { ...(c.phaseNameOverrides || {}), [phaseKey]: label } });
    }
    setEditingPhase(null);
  };
  const addPhase = (c) => runOnce(() => {
    const label = newPhaseText.trim();
    setNewPhaseText(''); setAddingPhase(null);
    if (!label) return;
    const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    updateClient(c.id, { customPhases: [...(c.customPhases || []), { id, label, color: '#5B7CF5' }] });
  });
  const deletePhase = (c, phaseKey, label, taskCount) => {
    const msg = taskCount > 0
      ? `Eliminar el objetivo «${label}»: sus ${taskCount} tarea${taskCount === 1 ? '' : 's'} pasan a «Otras tareas». ¿Continuar?`
      : `Eliminar el objetivo «${label}»?`;
    if (!window.confirm(msg)) return;
    const isCustom = (c.customPhases || []).some(cp => cp.id === phaseKey);
    if (isCustom) updateClient(c.id, { customPhases: (c.customPhases || []).filter(cp => cp.id !== phaseKey) });
    else updateClient(c.id, { phaseNameOverrides: { ...(c.phaseNameOverrides || {}), [phaseKey]: '__HIDDEN__' } });
  };

  const [dragClientId, setDragClientId] = useState(null);
  const [dragOverClientId, setDragOverClientId] = useState(null);
  const [openTaskId, setOpenTaskId] = useState(null);
  const [adding, setAdding] = useState(null); // clave clientId::phaseKey
  const [newTitle, setNewTitle] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  // Drag de tareas: reordenar dentro de una fase o MOVER a otro objetivo del
  // mismo cliente (cambia su fase). Setea position = orden.
  const dropTask = (e, group, clientId) => {
    e.preventDefault(); e.stopPropagation();
    const id = draggedTaskId; setDraggedTaskId(null);
    if (!id) return;
    const dragged = tasks.find(t => t.id === id);
    if (!dragged || dragged.clientId !== clientId) return; // mismo cliente
    const inGroup = group.tasks.some(t => t.id === id);
    const newPhase = group.key === 'otras' ? null : group.key;
    const base = group.tasks.filter(t => t.id !== id);
    const index = taskInsertIndex(e.currentTarget, e.clientY, id);
    if (!inGroup) updateTask(id, { phase: newPhase });   // cambió de objetivo
    reorderTask([...base.slice(0, index), dragged, ...base.slice(index)]);
  };
  const saveTitle = (t) => { const v = editTitle.trim(); if (v && v !== t.title) updateTask(t.id, { title: v }); setEditingId(null); };

  // Guard anti-doble: Enter + blur pueden disparar el mismo handler dos veces.
  const busyRef = useRef(false);
  const runOnce = (fn) => { if (busyRef.current) return; busyRef.current = true; try { fn(); } finally { setTimeout(() => { busyRef.current = false; }, 0); } };

  // Crear una tarea nueva en un cliente/fase, ya con su fase (un solo paso, sin
  // que "desaparezca y vuelva"). phaseKey 'otras' => sin fase.
  const createInPhase = (clientId, phaseKey) => runOnce(() => {
    const title = newTitle.trim();
    setNewTitle(''); setAdding(null);
    if (!title) return;
    // Bugfix: un usuario no-admin solo ve las tareas que le pertenecen
    // (userOwnsTask). Si crea una tarea SIN responsable, queda invisible para él
    // y "desaparece" apenas la crea. La asignamos a quien la crea por defecto;
    // puede reasignarla desde la fila. Los admin siguen creando sin responsable.
    const me = (teamMembers || []).find(m => m.id === currentUser?.id);
    const defaultAssignee = restricted ? (me?.name || currentUser?.name || '') : '';
    const created = createTask(title, clientId, defaultAssignee, 'normal', 'backlog', '', null, phaseKey === 'otras' ? null : phaseKey);
    // Bugfix: con el filtro "solo sprint" activo, una tarea recién creada (que
    // todavía no está en el sprint) quedaría oculta y "desaparece". Si estamos
    // en esa vista, la metemos al sprint activo para que se mantenga visible.
    if (onlySprint && activeSprint && created?.id) addTaskToSprint(created.id, { assignee: defaultAssignee || undefined });
  });
  // Marcar/desmarcar completada desde la fila (sin abrir la ficha).
  const toggleDone = (t) => updateTask(t.id, { status: t.status === 'done' ? 'backlog' : 'done' });
  const [expanded, setExpanded] = useState(() => {
    try { const raw = localStorage.getItem(EXPANDED_KEY); return raw ? JSON.parse(raw) : {}; }
    catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded)); } catch { /* ignore */ }
  }, [expanded]);

  const matchesAssignee = (t) => {
    if (taskAssignee === 'all') return true;
    if (!t.assignee) return false;
    return t.assignee.split(',').map(s => s.trim().toLowerCase()).includes(taskAssignee.toLowerCase());
  };
  const visibleTask = (t) => {
    if (restricted && !userOwnsTask(t, currentUser, teamMembers)) return false;
    if (!matchesAssignee(t)) return false;
    if (hideCompletedTasks && t.status === 'done') return false;
    if (onlySprint && (!activeSprint || t.sprintId !== activeSprint.id)) return false;
    return true;
  };

  let clientList = clients.filter(c => c.status !== 'completed');
  clientList = clientList.filter(c => (scope === 'int' ? isKorexClient(c) : !isKorexClient(c)));
  if (taskClientFilter !== 'all') clientList = clientList.filter(c => c.id === taskClientFilter);
  clientList = clientList.filter(c => {
    // Mostrar si tiene al menos una tarea visible (respeta ocultar completadas,
    // en el sprint, persona, etc.).
    if (tasks.some(t => t.clientId === c.id && visibleTask(t))) return true;
    // Sin tareas visibles: solo mostrar si NO tiene ninguna tarea pero sí
    // objetivos personalizados para gestionar (cliente recién creado).
    const hasAnyTask = tasks.some(t => t.clientId === c.id);
    return !hasAnyTask && (c.customPhases || []).length > 0;
  });
  clientList = [...clientList].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  useEffect(() => {
    if (Object.keys(expanded).length === 0 && clientList.length) {
      const first = clientList.find(c => c.priority === 1) || clientList[0];
      if (first) setExpanded({ [first.id]: true });
    }
    // eslint-disable-next-line
  }, [clientList.length]);

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  // Reordenar clientes (prioridad): soltar el arrastrado ARRIBA del target.
  const handleClientDrop = (target) => {
    const dragId = dragClientId;
    setDragClientId(null); setDragOverClientId(null);
    if (!dragId || dragId === target.id || restricted) return;
    const idx = clientList.findIndex(x => x.id === target.id);
    let above = null;
    for (let i = idx - 1; i >= 0; i--) { if (clientList[i].id !== dragId) { above = clientList[i]; break; } }
    reorderClient(dragId, { prevPosition: target.position ?? 0, nextPosition: above ? (above.position ?? 0) : null });
  };
  const memberOf = (name) => {
    const f = String(name || '').split(',')[0]?.trim().toLowerCase();
    if (!f) return null;
    return (teamMembers || []).find(m => m.name?.toLowerCase() === f || m.name?.toLowerCase().split(' ')[0] === f);
  };
  const initialsFor = (m) => (m?.initials || m?.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?').toUpperCase();
  const hoursOf = (t) => Number(t.estimatedHours) || 0;
  const monthName = (() => { const s = new Date().toLocaleDateString('es', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); })();

  const objetivos = clientList.map(c => {
    const cTasks = tasks.filter(t => t.clientId === c.id && visibleTask(t));
    const done = cTasks.filter(t => t.status === 'done').length;
    const prog = cTasks.filter(t => ['in-progress', 'en-revision', 'priorizado'].includes(t.status)).length;
    const pend = cTasks.length - done - prog;
    const total = cTasks.length || 1;
    const estH = cTasks.reduce((s, t) => s + hoursOf(t), 0);
    // equipo: miembros únicos asignados
    const teamIds = [];
    cTasks.forEach(t => { const m = memberOf(t.assignee); if (m && !teamIds.includes(m.id)) teamIds.push(m.id); });
    const team = teamIds.map(id => (teamMembers || []).find(m => m.id === id)).filter(Boolean).slice(0, 4);
    // grupos por fase: mostramos TODOS los objetivos (fases) del cliente, aunque
    // estén vacíos, para poder gestionarlos (como el roadmap viejo).
    const phaseMap = getAllPhases(c);
    const allClientTasks = tasks.filter(t => t.clientId === c.id);
    const phaseHasAnyTask = (k) => allClientTasks.some(t => (phaseMap[t.phase] ? t.phase : 'otras') === k);
    const byPhase = new Map();
    cTasks.forEach(t => { const k = phaseMap[t.phase] ? t.phase : 'otras'; if (!byPhase.has(k)) byPhase.set(k, []); byPhase.get(k).push(t); });
    const order = [...Object.keys(phaseMap), ...(byPhase.has('otras') ? ['otras'] : [])];
    const groups = order.map(k => {
      const list = (byPhase.get(k) || []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const meta = phaseMap[k] || { label: 'Otras tareas', color: '#9CA3AF' };
      const gdone = list.filter(t => t.status === 'done').length;
      const gEst = list.reduce((s, t) => s + hoursOf(t), 0);
      const isCustom = k !== 'otras' && (c.customPhases || []).some(cp => cp.id === k);
      return { key: k, label: meta.label, dot: meta.color, count: `${gdone}/${list.length}`, est: gEst, pctw: list.length ? Math.round(gdone / list.length * 100) + '%' : '0%', tasks: list, isCustom, manageable: k !== 'otras' };
    }).filter(g => {
      if (g.key === 'otras') return g.tasks.length > 0;     // unphased solo si hay
      if (g.tasks.length > 0) return true;                   // tiene tareas visibles
      // sin tareas visibles: mostrar solo objetivos personalizados aún vacíos
      // (recién creados) para poder cargarles tareas; ocultar fases estándar
      // vacías y las que quedaron todas completadas/filtradas.
      return g.isCustom && !phaseHasAnyTask(g.key);
    });
    return {
      c, done, prog, pend, total: cTasks.length, estH, team, groups,
      pct: Math.round(done / total * 100),
      isInterno: isKorexClient(c), isSuper: c.priority === 1,
    };
  });

  const grandTotalHours = objetivos.reduce((s, o) => s + o.estH, 0);

  if (!objetivos.length) {
    return <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 14, padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No hay objetivos que coincidan con los filtros.</div>;
  }

  const count = objetivos.length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 15 }}>
        <Target size={16} stroke="#5B7CF5" strokeWidth={1.9} />
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>Objetivos de {monthName}</span>
        <span style={{ fontSize: 13, color: '#9CA3AF' }}>· {count} {count === 1 ? 'objetivo' : 'objetivos'}</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6B7280', background: '#F0F2F5', borderRadius: 7, padding: '4px 10px' }}><Clock size={13} /> {grandTotalHours}h estimadas</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {objetivos.map(o => {
          const open = !!expanded[o.c.id];
          const w = (n) => Math.round(n / (o.total || 1) * 100) + '%';
          return (
            <div key={o.c.id}
              onDragOver={(e) => { if (dragClientId && dragClientId !== o.c.id) { e.preventDefault(); setDragOverClientId(o.c.id); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverClientId(prev => prev === o.c.id ? null : prev); }}
              onDrop={() => handleClientDrop(o.c)}
              style={{ background: '#fff', border: `1px solid ${dragOverClientId === o.c.id ? '#5B7CF5' : (open ? '#C7D2FE' : '#E2E5EB')}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(10,22,40,.05)', overflow: 'hidden', opacity: dragClientId === o.c.id ? 0.5 : 1 }}>
              <div onClick={() => toggle(o.c.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }}>
                {!restricted && (
                  <span draggable
                    onDragStart={(e) => { e.stopPropagation(); setDragClientId(o.c.id); startDragScroll(); }}
                    onDragEnd={() => { setDragClientId(null); setDragOverClientId(null); stopDragScroll(); }}
                    onClick={(e) => e.stopPropagation()}
                    title="Arrastrar para ordenar la prioridad"
                    style={{ display: 'flex', color: '#C7CBD3', cursor: 'grab', flexShrink: 0 }}><GripVertical size={15} /></span>
                )}
                <span style={{ color: '#9CA3AF', flexShrink: 0, display: 'flex' }}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                {o.c.avatarUrl
                  ? <img src={o.c.avatarUrl} alt={o.c.name} style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                  : <span style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: o.isInterno ? '#0D1117' : (o.c.color || '#5B7CF5'), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>{(o.c.name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.c.name}</span>
                    {o.isInterno && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', color: '#fff', background: '#0D1117', borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>INTERNO</span>}
                    {o.isSuper && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: '.04em', color: '#DC2626', background: '#FEF2F2', borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#DC2626' }} />SUPER PRIORITARIO</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.c.company}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#6B7280', background: '#F0F2F5', borderRadius: 5, padding: '1px 7px', whiteSpace: 'nowrap', flexShrink: 0 }}><Clock size={11} /> {o.estH}h</span>
                  </div>
                </div>
                <div className="kx-team" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  {o.team.map(m => <span key={m.id} style={{ width: 26, height: 26, borderRadius: '50%', background: m.color || '#9CA3AF', color: '#fff', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', marginLeft: -7 }}>{initialsFor(m)}</span>)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexShrink: 0, width: 248, justifyContent: 'flex-end' }}>
                  <div style={{ flex: 1, maxWidth: 168 }}>
                    <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: '#F0F2F5' }}>
                      <span style={{ width: w(o.done), background: '#22C55E' }} />
                      <span style={{ width: w(o.prog), background: '#5B7CF5' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 11, marginTop: 6, fontSize: 11, color: '#9CA3AF' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E' }} />{o.done}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#5B7CF5' }} />{o.prog}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D0D5DD' }} />{o.pend}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', width: 62, flexShrink: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>{o.pct}%</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{o.total} tareas</div>
                  </div>
                </div>
              </div>

              {open && (
                <div style={{ borderTop: '1px solid #E2E5EB', background: '#FBFBFD', padding: '6px 18px 14px' }}>
                  {o.groups.map(g => (
                    <div key={g.key} className="kx-obj-group" style={{ padding: '12px 0 4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: g.dot }} />
                        {editingPhase === `${o.c.id}::${g.key}` ? (
                          <input autoFocus value={editPhaseText} onChange={(e) => setEditPhaseText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') renamePhase(o.c, g.key); if (e.key === 'Escape') setEditingPhase(null); }}
                            onBlur={() => renamePhase(o.c, g.key)}
                            style={{ fontSize: 13, fontWeight: 600, border: '1px solid #C7D2FE', borderRadius: 6, padding: '3px 8px', outline: 'none', fontFamily: 'inherit' }} />
                        ) : (
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{g.label}</span>
                        )}
                        <span style={{ fontSize: 12, color: '#9CA3AF' }}>{g.count}</span>
                        <span style={{ fontSize: 11, color: '#6B7280', background: '#F0F2F5', borderRadius: 5, padding: '1px 7px' }}>{g.est}h</span>
                        {!restricted && g.manageable && editingPhase !== `${o.c.id}::${g.key}` && (
                          <span className="kx-obj-actions" style={{ display: 'inline-flex', gap: 6 }}>
                            <span onClick={() => { setEditPhaseText(g.label); setEditingPhase(`${o.c.id}::${g.key}`); }} title="Renombrar objetivo" style={{ color: '#C7CBD3', cursor: 'pointer', display: 'flex' }}><Pencil size={13} /></span>
                            <span onClick={() => deletePhase(o.c, g.key, g.label, g.tasks.length)} title="Eliminar objetivo" style={{ color: '#C7CBD3', cursor: 'pointer', display: 'flex' }}><Trash2 size={13} /></span>
                          </span>
                        )}
                        <span style={{ flex: 1 }} />
                        <span style={{ height: 6, width: 90, borderRadius: 999, background: '#F0F2F5', overflow: 'hidden', display: 'inline-block' }}><span style={{ display: 'block', height: '100%', background: '#22C55E', width: g.pctw }} /></span>
                      </div>
                      <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 11, overflow: 'hidden', outline: draggedTaskId ? '1px dashed #C7D2FE' : 'none', outlineOffset: -1 }}
                        onDragOver={(e) => { if (draggedTaskId) e.preventDefault(); }}
                        onDrop={(e) => dropTask(e, g, o.c.id)}>
                        {g.tasks.map((t, i) => {
                          const d = dotStyle(t.status);
                          const cCount = (taskComments || []).filter(cc => cc.task_id === t.id && !cc.parent_id && (!cc.kind || cc.kind === 'user')).length;
                          const unread = unreadCommentTaskIds?.has?.(t.id);
                          const editing = editingId === t.id;
                          return (
                            <div key={t.id} data-task-id={t.id} draggable={!editing}
                              onDragStart={(e) => { e.stopPropagation(); setDraggedTaskId(t.id); startDragScroll(); }}
                              onDragEnd={() => { setDraggedTaskId(null); stopDragScroll(); }}
                              onClick={() => { if (!editing) setOpenTaskId(t.id); }}
                              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < g.tasks.length - 1 ? '1px solid #F0F2F5' : 'none', cursor: 'pointer', opacity: draggedTaskId === t.id ? 0.4 : 1 }}>
                              <span onClick={(e) => { e.stopPropagation(); toggleDone(t); }} title={t.status === 'done' ? 'Marcar pendiente' : 'Marcar completada'} style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: d.border, background: d.bg, color: '#fff', fontSize: 11, cursor: 'pointer' }}>{d.icon}</span>
                              {editing ? (
                                <input autoFocus value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(t); if (e.key === 'Escape') setEditingId(null); }}
                                  onBlur={() => saveTitle(t)}
                                  style={{ flex: 1, minWidth: 0, fontSize: 13, border: '1px solid #C7D2FE', borderRadius: 7, padding: '5px 9px', outline: 'none', fontFamily: 'inherit' }} />
                              ) : (
                                <>
                                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#1A1D26', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</span>
                                  <span onClick={(e) => { e.stopPropagation(); setEditTitle(t.title); setEditingId(t.id); }} title="Editar título" style={{ color: '#C7CBD3', cursor: 'pointer', flexShrink: 0, display: 'flex' }}><Pencil size={12} /></span>
                                  <span onClick={(e) => { e.stopPropagation(); if (window.confirm(`Eliminar la tarea «${t.title}»?`)) deleteTask(t.id); }} title="Eliminar tarea" style={{ color: '#C7CBD3', cursor: 'pointer', flexShrink: 0, display: 'flex' }}><Trash2 size={12} /></span>
                                </>
                              )}
                              {cCount > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: unread ? '#5B7CF5' : '#9CA3AF', flexShrink: 0 }} title={`${cCount} comentario${cCount === 1 ? '' : 's'}${unread ? ' · sin leer' : ''}`}><MessageSquare size={13} />{cCount}{unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#5B7CF5' }} />}</span>}
                              <PriorityPicker value={t.priority} onChange={(p) => updateTask(t.id, { priority: p || 'normal' })} />
                              <DepartmentPicker value={t.department} onChange={(dep) => updateTask(t.id, { department: dep })} />
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }} title="Horas estimadas" onClick={(e) => e.stopPropagation()}>
                                <input type="number" min="0" step="0.5" defaultValue={t.estimatedHours ?? ''} placeholder="–"
                                  onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (t.estimatedHours ?? null)) updateTask(t.id, { estimatedHours: v }); }}
                                  style={{ width: 40, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#3F4653', textAlign: 'right', border: '1px solid #E2E5EB', borderRadius: 6, padding: '3px 5px', background: '#fff', outline: 'none' }} />
                                <span style={{ fontSize: 11, color: '#9CA3AF' }}>h</span>
                              </span>
                              <AssigneePicker value={t.assignee} onChange={(name) => updateTask(t.id, { assignee: name })} />
                              {t.status !== 'done' && <AddToSprintButton task={t} />}
                            </div>
                          );
                        })}
                        {(() => {
                          const key = `${o.c.id}::${g.key}`;
                          return adding === key ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderTop: '1px solid #F0F2F5' }} onClick={(e) => e.stopPropagation()}>
                              <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') createInPhase(o.c.id, g.key); if (e.key === 'Escape') { setNewTitle(''); setAdding(null); } }}
                                onBlur={() => createInPhase(o.c.id, g.key)}
                                placeholder="Nombre de la tarea…  (Enter para crear)"
                                style={{ flex: 1, fontSize: 13, border: '1px solid #C7D2FE', borderRadius: 8, padding: '6px 10px', outline: 'none', fontFamily: 'inherit' }} />
                            </div>
                          ) : (
                            <div onClick={(e) => { e.stopPropagation(); setNewTitle(''); setAdding(key); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderTop: '1px solid #F0F2F5', fontSize: 12.5, fontWeight: 500, color: '#9CA3AF', cursor: 'pointer' }}>
                              <Plus size={14} /> Agregar tarea
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 12 }}>
                    {!restricted && (addingPhase === o.c.id ? (
                      <input autoFocus value={newPhaseText} onChange={(e) => setNewPhaseText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addPhase(o.c); if (e.key === 'Escape') { setNewPhaseText(''); setAddingPhase(null); } }}
                        onBlur={() => addPhase(o.c)}
                        placeholder="Nombre del objetivo…  (Enter para crear)"
                        style={{ fontSize: 12.5, border: '1px solid #C7D2FE', borderRadius: 8, padding: '6px 10px', outline: 'none', fontFamily: 'inherit', minWidth: 260 }} />
                    ) : (
                      <span onClick={() => { setNewPhaseText(''); setAddingPhase(o.c.id); }} style={{ fontSize: 12, fontWeight: 600, color: '#5B7CF5', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Nuevo objetivo</span>
                    ))}
                    <span onClick={() => { setSelectedId(o.c.id); setView('clients'); }} style={{ fontSize: 12, fontWeight: 500, color: '#9CA3AF', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>Abrir ficha del cliente <ArrowUpRight size={12} /></span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'flex-start', background: '#F5F7FF', border: '1px solid #DCE3FF', borderRadius: 11, padding: '13px 16px' }}>
        <Info size={17} stroke="#5B7CF5" strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12.5, color: '#3F4653', lineHeight: 1.55 }}>
          <b style={{ color: '#1A1D26' }}>Horas estimadas:</b> cada tarea tiene un campo editable de horas. El objetivo suma las horas de sus tareas (chip junto al cliente) y arriba se muestra el total del periodo.
        </div>
      </div>

      {openTaskId && <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </div>
  );
}
