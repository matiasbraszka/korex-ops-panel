import { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { PROCESS_STEPS, PHASES, TASK_STATUS } from '../utils/constants';
import { getStepName, today, fmtDate, getAllPhases, getElapsedDays, getEstimatedDays, isInDueRange, taskVisibleToNonAdmin } from '../utils/helpers';
import { GripVertical, MessageSquare, Link2, Calendar, AlertTriangle } from 'lucide-react';
import Dropdown from '../components/Dropdown';
import Modal from '../components/Modal';
import TeamAvatar from '../components/TeamAvatar';
import AddToWeeklyButton from '../components/tareas/AddToWeeklyButton';

export default function TasksPage({ embedded = false }) {
  const { clients, tasks, taskFilter, setTaskFilter, taskAssignee, setTaskAssignee, taskClientFilter, setTaskClientFilter, taskPriority, taskDueFilter, hideCompletedTasks, setHideCompletedTasks, hideBlockedTasks, setHideBlockedTasks, collapsedGroups, setCollapsedGroups, currentUser, createTask, updateTask, deleteTask, reorderTask, teamMembers, taskComments, openTaskComments, unreadCommentTaskIds, taskUserPositions, reorderTaskForUser, clientUserPositions, reorderClientForUser, adminMembers } = useApp();
  const isAdmin = !!(currentUser?.isAdmin || currentUser?.role === 'COO');
  const commentCountsByTask = useMemo(() => {
    const map = {};
    (taskComments || []).forEach(c => { map[c.task_id] = (map[c.task_id] || 0) + 1; });
    return map;
  }, [taskComments]);
  const TEAM = teamMembers || [];

  // ── Orden custom por persona ──
  // Resolver el user_id segun el filtro de Encargado:
  // - 'all'  → null (sin orden custom, usa tasks.position global)
  // - 'mine' → currentUser.id
  // - nombre → buscar member por nombre (lowercase match)
  const orderUserId = useMemo(() => {
    if (!taskAssignee || taskAssignee === 'all') return null;
    if (taskAssignee === 'mine') return currentUser?.id || null;
    const m = (teamMembers || []).find(x => x.name.toLowerCase() === taskAssignee.toLowerCase() || x.id === taskAssignee);
    return m?.id || null;
  }, [taskAssignee, currentUser?.id, teamMembers]);

  // Mapa task_id → position custom para el user de filtro. Si no hay row, undefined.
  const customPosByTask = useMemo(() => {
    if (!orderUserId) return {};
    const map = {};
    (taskUserPositions || []).forEach(r => { if (r.user_id === orderUserId) map[r.task_id] = r.position; });
    return map;
  }, [orderUserId, taskUserPositions]);

  // Mapa client_id → position custom para el user de filtro (orden de la Lista por persona).
  const customPosByClient = useMemo(() => {
    if (!orderUserId) return {};
    const map = {};
    (clientUserPositions || []).forEach(r => { if (r.user_id === orderUserId) map[r.client_id] = r.position; });
    return map;
  }, [orderUserId, clientUserPositions]);

  // ¿Puede el currentUser arrastrar con este filtro?
  // - Si filtro = 'all' → no (se mantiene drag global existente con reorderTask)
  // - Si filtro = mio o soy admin → si
  const canDragForUser = !!orderUserId && (orderUserId === currentUser?.id || isAdmin);
  const [addingTaskTo, setAddingTaskTo] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [expandedTasks, setExpandedTasks] = useState({});
  const [depsModal, setDepsModal] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTitleVal, setEditTitleVal] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const newTaskInputRef = useRef(null);
  const dropdownRefs = useRef({});

  // Drag & drop state
  const [dragTaskId, setDragTaskId] = useState(null);
  const [dragOverTaskId, setDragOverTaskId] = useState(null);
  const [dragOverHalf, setDragOverHalf] = useState(null); // 'top' | 'bottom'
  const dragGroupRef = useRef(null); // status group of dragged task

  // Drag & drop a nivel CLIENTE (solo cuando hay filtro por persona).
  const [dragClientId, setDragClientId] = useState(null);
  const [dragOverClientId, setDragOverClientId] = useState(null);
  const [dragOverClientHalf, setDragOverClientHalf] = useState(null); // 'top' | 'bottom'

  // Highlight task (cuando viene de Timeline o del SearchBar global)
  const [highlightTaskId, setHighlightTaskId] = useState(null);
  useEffect(() => {
    const trigger = () => {
      try {
        const hid = localStorage.getItem('tareas_highlight_task');
        if (!hid) return;
        setHighlightTaskId(hid);
        localStorage.removeItem('tareas_highlight_task');
        // Scroll to task después de pintar
        setTimeout(() => {
          const el = document.getElementById('task-row-' + hid);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
        setTimeout(() => setHighlightTaskId(null), 3000);
      } catch {}
    };
    trigger(); // primera carga
    window.addEventListener('tareas:gotoTask', trigger);
    return () => window.removeEventListener('tareas:gotoTask', trigger);
  }, []);

  // Dependency checking (FIX 5)
  const isTaskBlocked = (task) => {
    if (!task.dependsOn || task.dependsOn.length === 0) return false;
    if (task.status === 'done') return false;
    return task.dependsOn.some(depId => {
      const depTask = tasks.find(t => t.id === depId);
      return depTask && depTask.status !== 'done';
    });
  };
  const getBlockingNames = (task) => {
    if (!task.dependsOn || task.dependsOn.length === 0) return [];
    return task.dependsOn
      .map(depId => { const d = tasks.find(t => t.id === depId); return d && d.status !== 'done' ? d.title : null; })
      .filter(Boolean);
  };

  const getRef = (key) => {
    if (!dropdownRefs.current[key]) dropdownRefs.current[key] = { current: null };
    return dropdownRefs.current[key];
  };

  // Identify Korex client
  const isKorexClient = (c) => /empresa|korex/i.test(c.name);
  const korexClient = clients.find(c => isKorexClient(c));
  const korexClientId = korexClient?.id;
  // Hide descartados unless explicitly filtered by priority
  const regularClients = clients.filter(c => {
    if (isKorexClient(c)) return false;
    if (taskPriority !== 'all') return true; // let priority filter handle it
    return (c.priority || 5) !== 6;
  });

  const filterDefs = [
    { key: 'all', label: 'Todas' },
    { key: 'in-progress', label: 'En progreso' },
    { key: 'blocked', label: 'Bloqueadas' },
    { key: 'done', label: 'Completadas' },
  ];

  // Build assignee filter from TEAM members who have at least one task assigned
  const assigneeList = TEAM.filter(m => {
    return tasks.some(t => {
      if (t.clientId === korexClientId || !t.assignee) return false;
      const parts = t.assignee.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      return parts.includes(m.name.toLowerCase()) || parts.includes(m.id);
    });
  });

  let filteredTasks = [...tasks];
  if (taskFilter === 'in-progress') filteredTasks = filteredTasks.filter(t => t.status === 'in-progress');
  if (taskFilter === 'blocked') filteredTasks = filteredTasks.filter(t => t.status === 'blocked' || t.status === 'retrasadas');
  if (taskFilter === 'done') filteredTasks = filteredTasks.filter(t => t.status === 'done');
  if (hideCompletedTasks && taskFilter !== 'done') filteredTasks = filteredTasks.filter(t => t.status !== 'done');
  if (hideBlockedTasks && taskFilter !== 'blocked') filteredTasks = filteredTasks.filter(t => !isTaskBlocked(t));

  if (taskAssignee === 'mine' && currentUser) {
    const myNames = [currentUser.name.toLowerCase(), currentUser.name.split(' ')[0].toLowerCase()];
    const myTeam = TEAM.find(m => m.id === currentUser.id);
    if (myTeam) myNames.push(myTeam.name.toLowerCase());
    filteredTasks = filteredTasks.filter(t => {
      if (!t.assignee) return false;
      const parts = t.assignee.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      return parts.some(p => myNames.includes(p));
    });
  } else if (taskAssignee !== 'all') {
    filteredTasks = filteredTasks.filter(t => {
      if (!t.assignee) return false;
      const parts = t.assignee.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      return parts.includes(taskAssignee.toLowerCase());
    });
  }

  // Usuarios de operaciones que NO son admin ven las tareas de todos MENOS las
  // que tienen a un administrador como encargado (taskVisibleToNonAdmin).
  const restricted = !!currentUser && !currentUser.isAdmin;
  if (restricted) {
    filteredTasks = filteredTasks.filter(t => taskVisibleToNonAdmin(t, currentUser, TEAM, adminMembers));
  }

  // Client filter
  if (taskClientFilter !== 'all') {
    filteredTasks = filteredTasks.filter(t => t.clientId === taskClientFilter);
  }

  // Priority filter: only tasks belonging to clients of that priority
  if (taskDueFilter && taskDueFilter !== 'all') {
    // Solo tareas con dueDate en el rango (sin dueDate se ocultan)
    filteredTasks = filteredTasks.filter(t => t.dueDate && isInDueRange(t.dueDate, taskDueFilter));
  }
  if (taskPriority !== 'all') {
    const allowedClientIds = new Set(regularClients.filter(c => String(c.priority || 5) === taskPriority).map(c => c.id));
    filteredTasks = filteredTasks.filter(t => allowedClientIds.has(t.clientId));
  }

  const grouped = {};
  regularClients.forEach(c => { grouped[c.id] = { client: c, tasks: [] }; });
  filteredTasks.filter(t => t.clientId !== korexClientId).forEach(t => { if (grouped[t.clientId]) grouped[t.clientId].tasks.push(t); });

  const groups = Object.values(grouped).filter(g => g.tasks.length > 0 || addingTaskTo === g.client.id);
  // Sort client groups:
  // - Sin filtro de persona → por prioridad del cliente (critico=1 primero).
  // - Con filtro de persona → puramente por position efectiva. Si la persona ya
  //   ordenó ese cliente, usa su position custom; si no, cae al fallback
  //   priority*100000 + position. De esta forma, mover un cliente "hacia abajo"
  //   pasando otros que no tienen orden custom queda bien posicionado entre
  //   ellos (la nueva position se calcula en el rango de los vecinos).
  // Sin filtro de persona: usa la position global de clientes (mismo orden que
  // la pestaña Clientes, que ya viene sorteada por position.asc desde la DB).
  // Con filtro de persona: position custom si existe, sino la global como fallback.
  const getClientEffPos = (c) => {
    if (orderUserId && customPosByClient[c.id] !== undefined) return customPosByClient[c.id];
    return c.position ?? 0;
  };
  groups.sort((a, b) => getClientEffPos(a.client) - getClientEffPos(b.client));

  // ── Drag de CLIENTES (solo con filtro persona) ──
  const handleClientDragStart = (e, clientId) => {
    if (!orderUserId || !canDragForUser) { e.preventDefault(); return; }
    setDragClientId(clientId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', clientId);
  };
  const handleClientDragEnd = () => {
    setDragClientId(null);
    setDragOverClientId(null);
    setDragOverClientHalf(null);
  };
  const handleClientDragOver = (e, clientId) => {
    if (!dragClientId || dragClientId === clientId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const half = (e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom';
    setDragOverClientId(clientId);
    setDragOverClientHalf(half);
  };
  const handleClientDrop = (e, targetClientId, sortedGroups) => {
    e.preventDefault();
    const fromId = dragClientId;
    if (!fromId || fromId === targetClientId) { handleClientDragEnd(); return; }
    if (!orderUserId || !canDragForUser) { handleClientDragEnd(); return; }
    const targetIdx = sortedGroups.findIndex(g => g.client.id === targetClientId);
    const fromIdx = sortedGroups.findIndex(g => g.client.id === fromId);
    if (targetIdx < 0 || fromIdx < 0) { handleClientDragEnd(); return; }
    let insertIdx = dragOverClientHalf === 'top' ? targetIdx : targetIdx + 1;
    if (fromIdx < insertIdx) insertIdx--;
    const reordered = [...sortedGroups];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(insertIdx, 0, moved);

    const newIdx = reordered.findIndex(g => g.client.id === fromId);
    const above = newIdx > 0 ? reordered[newIdx - 1] : null;
    const below = newIdx < reordered.length - 1 ? reordered[newIdx + 1] : null;
    const effPos = (g) => getClientEffPos(g.client);
    const prevPosition = below ? effPos(below) : null;
    const nextPosition = above ? effPos(above) : null;
    reorderClientForUser(fromId, orderUserId, { prevPosition, nextPosition });
    handleClientDragEnd();
  };

  const [inlinePhase, setInlinePhase] = useState('');

  const handleAddTask = (clientId) => {
    if (!newTaskTitle.trim()) return;
    const t = createTask(newTaskTitle.trim(), clientId, '', 'normal', 'backlog', '', null);
    if (inlinePhase && t) updateTask(t.id, { phase: inlinePhase });
    setNewTaskTitle('');
    setTimeout(() => { if (newTaskInputRef.current) newTaskInputRef.current.focus(); }, 30);
  };

  const startEditTitle = (taskId) => {
    const t = tasks.find(x => x.id === taskId);
    if (!t) return;
    setEditingTaskId(taskId);
    setEditTitleVal(t.title);
  };

  const saveEditTitle = (taskId) => {
    if (editTitleVal.trim()) updateTask(taskId, { title: editTitleVal.trim() });
    setEditingTaskId(null);
  };

  // Drag helpers
  const getStatusGroup = (task) => {
    if (task.status === 'done') return 2;
    if (isTaskBlocked(task)) return 1;
    return 0;
  };
  const handleDragStart = (e, task, group) => {
    // Si hay filtro por persona y el currentUser no esta autorizado (no es esa persona ni admin), bloquear.
    if (orderUserId && !canDragForUser) { e.preventDefault(); return; }
    setDragTaskId(task.id);
    dragGroupRef.current = getStatusGroup(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  };
  const handleDragEnd = (e) => {
    setDragTaskId(null);
    setDragOverTaskId(null);
    setDragOverHalf(null);
    dragGroupRef.current = null;
  };
  const handleDragOver = (e, task, sortedGroup) => {
    e.preventDefault();
    // Only allow drop in same status group
    if (dragGroupRef.current !== getStatusGroup(task)) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const half = (e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom';
    setDragOverTaskId(task.id);
    setDragOverHalf(half);
  };
  const handleDrop = (e, task, sortedGroup) => {
    e.preventDefault();
    const fromId = dragTaskId;
    if (!fromId || fromId === task.id) return;
    if (dragGroupRef.current !== getStatusGroup(task)) return;
    const targetIdx = sortedGroup.findIndex(t => t.id === task.id);
    const fromIdx = sortedGroup.findIndex(t => t.id === fromId);
    if (targetIdx < 0 || fromIdx < 0) return;
    let insertIdx = dragOverHalf === 'top' ? targetIdx : targetIdx + 1;
    if (fromIdx < insertIdx) insertIdx--;
    const reordered = [...sortedGroup];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(insertIdx, 0, moved);

    if (orderUserId && canDragForUser) {
      // Orden custom por persona: persistir solo la fila task_user_positions del item movido.
      const newIdx = reordered.findIndex(t => t.id === fromId);
      const above = newIdx > 0 ? reordered[newIdx - 1] : null;
      const below = newIdx < reordered.length - 1 ? reordered[newIdx + 1] : null;
      const effPos = (t) => (customPosByTask[t.id] !== undefined) ? customPosByTask[t.id] : (t.position ?? 0);
      const prevPosition = below ? effPos(below) : null;
      const nextPosition = above ? effPos(above) : null;
      reorderTaskForUser(fromId, orderUserId, { prevPosition, nextPosition });
    } else {
      reorderTask(reordered);
    }

    setDragTaskId(null);
    setDragOverTaskId(null);
    setDragOverHalf(null);
  };

  const renderTaskRow = (t, { sortedGroup }) => {
    const ts = TASK_STATUS[t.status] || TASK_STATUS.backlog;
    const stepName = getStepName(t, clients);
    const hasDesc = !!((t.description && t.description.trim()) || (t.notes && t.notes.trim()));
    const isExpanded = expandedTasks[t.id];
    const statusRef = getRef('status-' + t.id);
    const stepRef = getRef('step-' + t.id);
    const assigneeRef = getRef('assignee-' + t.id);

    const blocked = isTaskBlocked(t);
    const blockingNames = blocked ? getBlockingNames(t) : [];
    const isDragOver = dragOverTaskId === t.id && dragTaskId !== t.id;
    const isDragging = dragTaskId === t.id;
    const isOverdue = t.dueDate && t.status !== 'done' && !blocked && t.dueDate < today();

    const client = clients.find(x => x.id === t.clientId);

    // Phase display — usa overrides del cliente para que los renames del Roadmap se reflejen
    const clientAllPhases = client ? getAllPhases(client) : PHASES;
    const phaseInfo = t.phase ? clientAllPhases[t.phase] : null;

    // El dropdown solo muestra fases que este cliente realmente usa:
    // - fases que tienen al menos una tarea
    // - fases con deadline asignada
    // - fases custom del cliente
    // - la fase actualmente asignada a la tarea (para no perderla si no hay otras)
    const clientTaskPhases = new Set();
    tasks.forEach(x => {
      if (x.clientId === t.clientId && x.phase) clientTaskPhases.add(x.phase);
    });
    Object.keys(client?.phaseDeadlines || {}).forEach(k => clientTaskPhases.add(k));
    (client?.customPhases || []).forEach(cp => clientTaskPhases.add(cp.id));
    if (t.phase) clientTaskPhases.add(t.phase);

    const stepDropdownItems = [
      { label: 'Sin vincular', onClick: () => updateTask(t.id, { stepIdx: null, phase: null }) },
      { divider: true, label: 'Fases', color: '#9CA3AF' },
    ];
    Object.entries(clientAllPhases).forEach(([key, ph]) => {
      if (!clientTaskPhases.has(key)) return; // ocultar fases default sin uso en este cliente
      stepDropdownItems.push({ label: ph.label, onClick: () => updateTask(t.id, { phase: key, stepIdx: null }), style: { paddingLeft: 8 }, icon: '\u25CF', iconColor: ph.color });
    });

    const isHighlighted = highlightTaskId === t.id;
    return (
      <div id={'task-row-' + t.id} key={t.id} className={`border-b border-border last:border-b-0 transition-all ${isDragging ? 'opacity-40 scale-[0.98]' : ''} ${isHighlighted ? 'highlight-pulse' : ''}`}>
        {/* Drop indicator */}
        {isDragOver && dragOverHalf === 'top' && <div className="drag-indicator" />}
        {/* Desktop row */}
        <div
          className={`hidden md:grid gap-3 py-[7px] px-4 items-center text-xs transition-colors hover:bg-[#F7F9FC] group border-t border-[#F1F3F6] ${blocked ? 'opacity-60' : ''}`}
          style={{ gridTemplateColumns: '16px 18px minmax(0,1fr) 130px 88px 48px 110px' }}
          onDragOver={(e) => handleDragOver(e, t, sortedGroup)}
          onDrop={(e) => handleDrop(e, t, sortedGroup)}
          onDragLeave={() => { if (dragOverTaskId === t.id) setDragOverTaskId(null); }}
        >
          {/* Drag handle por tarea — siempre disponible.
              Con filtro por persona persiste en task_user_positions; sin filtro, en tasks.position. */}
          {getStatusGroup(t) === 0 && (!orderUserId || canDragForUser) ? (
            <div
              className="flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity text-gray-400 select-none"
              draggable
              onDragStart={(e) => handleDragStart(e, t, sortedGroup)}
              onDragEnd={handleDragEnd}
              title={orderUserId ? 'Arrastrá para reordenar (solo para esta persona)' : 'Arrastrar para reordenar'}
            ><GripVertical size={14} /></div>
          ) : <div />}

          {/* Status icon */}
          <div
            ref={el => statusRef.current = el}
            className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] cursor-pointer shrink-0"
            style={{ background: ts.bg, color: ts.color, border: `1.5px solid ${ts.color}` }}
            onClick={(e) => { e.stopPropagation(); setOpenDropdown('status-' + t.id); }}
            title={ts.label}
          >{ts.icon}</div>
          <Dropdown
            open={openDropdown === 'status-' + t.id}
            onClose={() => setOpenDropdown(null)}
            anchorRef={statusRef}
            items={Object.entries(TASK_STATUS).filter(([k]) => k !== 'blocked' && k !== 'retrasadas').map(([k, v]) => ({ label: v.label, icon: v.icon, iconColor: v.color, onClick: () => updateTask(t.id, { status: k }) }))}
          />

          {/* Title — limpio, una sola linea + iconos hover */}
          <div className="min-w-0 flex items-center gap-1.5" onClick={(e)=>e.stopPropagation()}>
            {blocked && <span className="shrink-0 text-[10px]" title="Bloqueada por dependencias">🔒</span>}
            {hasDesc && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#5B7CF5]" title="Tiene descripción" />}
            {(t.dependsOn && t.dependsOn.length > 0) && (
              <span className="shrink-0 text-[9.5px] text-[#9CA3AF] inline-flex items-center gap-0.5" title={`${t.dependsOn.length} dependencia(s)`}>
                <Link2 size={9} />{t.dependsOn.length}
              </span>
            )}
            {editingTaskId === t.id ? (
              <input
                className="border border-[#5B7CF5] rounded py-[2px] px-1.5 text-[13px] font-sans outline-none flex-1 min-w-0 bg-white"
                value={editTitleVal}
                onChange={(e) => setEditTitleVal(e.target.value)}
                onBlur={() => saveEditTitle(t.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingTaskId(null); }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            ) : (
              <span
                className="cursor-text py-[2px] px-1 rounded flex-1 min-w-0 truncate text-[13px] text-[#1A1D26] font-medium hover:bg-[#F0F2F5] leading-tight"
                onClick={(e) => { e.stopPropagation(); startEditTitle(t.id); }}
                title={t.title}
              >{t.title}</span>
            )}
            <button
              className="shrink-0 w-6 h-6 rounded-lg bg-transparent text-[#9CA3AF] hover:bg-[#EEF2FF] hover:text-[#5B7CF5] cursor-pointer flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border-none"
              onClick={(e) => { e.stopPropagation(); setDepsModal(t.id); }}
              title="Editar dependencias"
            ><Link2 size={11} /></button>
            <button
              className="shrink-0 w-6 h-6 rounded-lg bg-transparent text-[#9CA3AF] hover:bg-[#EEF2FF] hover:text-[#5B7CF5] cursor-pointer flex items-center justify-center border-none text-[10px]"
              onClick={(e) => { e.stopPropagation(); setExpandedTasks(prev => ({ ...prev, [t.id]: !prev[t.id] })); }}
              title={isExpanded ? 'Colapsar' : 'Expandir'}
            >{isExpanded ? '▲' : '▼'}</button>
          </div>

          {/* Step */}
          <div
            ref={el => stepRef.current = el}
            className="cursor-pointer relative"
            onClick={(e) => { e.stopPropagation(); setOpenDropdown('step-' + t.id); }}
          >
            <div className={`text-[10px] py-[3px] px-2 rounded whitespace-nowrap overflow-hidden text-ellipsis max-w-[130px] transition-colors hover:bg-surface2 ${phaseInfo || stepName ? 'text-text2' : 'text-text3 italic'}`}>
              {phaseInfo ? (
                <span className="inline-flex items-center gap-1 py-[1px] px-1.5 rounded-full text-[9px] font-semibold" style={{ background: phaseInfo.color + '18', color: phaseInfo.color }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: phaseInfo.color }} />
                  {phaseInfo.label}
                </span>
              ) : stepName ? (
                stepName
              ) : (
                '+ Fase'
              )}
            </div>
          </div>
          <Dropdown
            open={openDropdown === 'step-' + t.id}
            onClose={() => setOpenDropdown(null)}
            anchorRef={stepRef}
            items={stepDropdownItems}
            minWidth={220}
            maxHeight={300}
          />

          {/* ENTREGA — chip de fecha de entrega */}
          <div className="flex items-center justify-end min-w-0" onClick={(e) => e.stopPropagation()}>
            {t.dueDate ? (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${
                  isOverdue ? 'bg-[#FEF2F2] text-[#DC4B43]' : 'bg-[#F0F2F5] text-[#6B7280]'
                }`}
                title={`Vence: ${t.dueDate}`}
              >
                {isOverdue ? <AlertTriangle size={9} /> : <Calendar size={9} />}
                {fmtDate(t.dueDate)}
              </span>
            ) : (
              <span className="text-[10.5px] text-[#B6BCC4] italic opacity-0 group-hover:opacity-100 transition-opacity">sin fecha</span>
            )}
          </div>

          {/* COMENTARIOS — abre panel lateral */}
          <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const cnt = commentCountsByTask[t.id] || 0;
              if (cnt === 0) {
                return (
                  <button
                    className="w-[30px] h-[26px] rounded-lg bg-transparent text-[#9CA3AF] border-none cursor-pointer opacity-0 group-hover:opacity-100 hover:bg-[#EEF2FF] hover:text-[#5B7CF5] flex items-center justify-center transition-colors"
                    onClick={(e) => { e.stopPropagation(); openTaskComments(t.id); }}
                    title="Comentar"
                  ><MessageSquare size={13} /></button>
                );
              }
              const unread = unreadCommentTaskIds?.has(t.id);
              return (
                <button
                  className={`text-[11.5px] h-[26px] rounded-lg px-2 border-none cursor-pointer font-semibold flex items-center gap-1 transition-colors ${
                    unread
                      ? 'bg-[#EEF2FF] text-[#4A67D8] hover:bg-[#DEE6FE]'
                      : 'bg-[#F1F3F6] text-[#9CA3AF] hover:bg-[#E5E7EB]'
                  }`}
                  onClick={(e) => { e.stopPropagation(); openTaskComments(t.id); }}
                  title={unread ? `${cnt} comentario${cnt !== 1 ? 's' : ''} · sin leer` : `${cnt} comentario${cnt !== 1 ? 's' : ''}`}
                >
                  <MessageSquare size={11} />{cnt}
                </button>
              );
            })()}
          </div>

          {/* Assignee */}
          {(() => {
            const assigneeNames = t.assignee ? t.assignee.split(',').map(s => s.trim()).filter(Boolean) : [];
            const hasClient = assigneeNames.some(n => n.toLowerCase() === 'cliente');
            const assigneeMembers = assigneeNames.map(name => TEAM.find(m => m.name.toLowerCase() === name.toLowerCase() || m.id === name)).filter(Boolean);
            const taskClient = clients.find(cl => cl.id === t.clientId);
            const clientColor = taskClient?.color || '#5B7CF5';
            const clientName = taskClient?.name || 'Cliente';
            const toggleAssignee = (memberName) => {
              const current = t.assignee ? t.assignee.split(',').map(s => s.trim()).filter(Boolean) : [];
              const exists = current.some(n => n.toLowerCase() === memberName.toLowerCase());
              const updated = exists ? current.filter(n => n.toLowerCase() !== memberName.toLowerCase()) : [...current, memberName];
              updateTask(t.id, { assignee: updated.join(', ') });
            };
            return (
              <div className="flex items-center justify-end gap-1 min-w-0">
                <div
                  ref={el => assigneeRef.current = el}
                  className="cursor-pointer relative"
                  onClick={(e) => { e.stopPropagation(); setOpenDropdown('assignee-' + t.id); }}
                >
                  <div className="flex items-center gap-1 py-[2px] px-1.5 rounded text-[11px] text-text2 hover:bg-[#F0F2F5]">
                    {(assigneeMembers.length > 0 || hasClient) ? (
                      <div className="flex items-center">
                        {assigneeMembers.slice(0, 2).map((am, ai) => (
                          <TeamAvatar key={am.id} member={am} size={20} className="border-2 border-white" style={{ marginLeft: ai > 0 ? '-6px' : '0', zIndex: 2 - ai }} />
                        ))}
                        {hasClient && (
                          <span
                            title={`Asignada al cliente: ${clientName}`}
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold border-2 border-white"
                            style={{ background: clientColor + '22', color: clientColor, marginLeft: assigneeMembers.length > 0 ? '-6px' : '0', zIndex: 3 }}
                          >{clientName[0]?.toUpperCase() || 'C'}</span>
                        )}
                        {assigneeMembers.length > 2 && (
                          <span className="w-[20px] h-[20px] rounded-full flex items-center justify-center text-[8px] font-bold bg-gray-200 text-gray-600 border-2 border-white" style={{ marginLeft: '-6px', zIndex: 0 }}>+{assigneeMembers.length - 2}</span>
                        )}
                      </div>
                    ) : <span className="text-[#9CA3AF] text-[10.5px]">+ Asignar</span>}
                  </div>
                </div>
                <Dropdown
                  open={openDropdown === 'assignee-' + t.id}
                  onClose={() => setOpenDropdown(null)}
                  anchorRef={assigneeRef}
                  keepOpen
                  searchable
                  items={[
                    { label: 'Sin asignar', onClick: () => { updateTask(t.id, { assignee: '' }); setOpenDropdown(null); } },
                    {
                      label: `Cliente (${clientName})`,
                      node: <div className="flex items-center gap-2 w-full">
                        <input type="checkbox" checked={hasClient} readOnly className="pointer-events-none" />
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: clientColor + '22', color: clientColor }}>{clientName[0]?.toUpperCase() || 'C'}</span>
                        <span>Cliente <span className="text-[10px] text-gray-500">({clientName})</span></span>
                      </div>,
                      onClick: () => toggleAssignee('Cliente'),
                    },
                    ...TEAM.map(m => {
                      const isSelected = assigneeNames.some(n => n.toLowerCase() === m.name.toLowerCase());
                      return {
                        label: m.name,
                        node: <div className="flex items-center gap-2 w-full"><input type="checkbox" checked={isSelected} readOnly className="pointer-events-none" /><TeamAvatar member={m} size={20} /><span>{m.name}</span></div>,
                        onClick: () => toggleAssignee(m.name),
                      };
                    })
                  ]}
                />
                {/* Acciones \u2014 Mi Semana + Delete, visibles solo en hover */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <AddToWeeklyButton task={t} />
                  <button
                    className="w-6 h-6 rounded-md bg-transparent border-none text-[#9CA3AF] hover:bg-[#FEF2F2] hover:text-[#EF4444] cursor-pointer flex items-center justify-center transition-colors text-[12px]"
                    onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}
                    title="Eliminar"
                  >{'\u2715'}</button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Mobile card — uses separate refs (mob-*) so they don't overwrite desktop refs */}
        {(() => {
          const mobStatusRef = getRef('mob-status-' + t.id);
          const mobStepRef = getRef('mob-step-' + t.id);
          const mobAssigneeRef = getRef('mob-assignee-' + t.id);
          return (
            <div className={`md:hidden py-2.5 px-3 text-xs group ${blocked ? 'opacity-60' : ''}`} onClick={() => setExpandedTasks(prev => ({ ...prev, [t.id]: !prev[t.id] }))}>
              <div className="flex items-start gap-2">
                <div
                  ref={el => mobStatusRef.current = el}
                  className="w-[20px] h-[20px] rounded-full flex items-center justify-center text-[10px] cursor-pointer shrink-0 mt-[1px]"
                  style={{ background: ts.bg, color: ts.color, border: `1.5px solid ${ts.color}` }}
                  onClick={(e) => { e.stopPropagation(); setOpenDropdown('mob-status-' + t.id); }}
                >{ts.icon}</div>
                <Dropdown
                  open={openDropdown === 'mob-status-' + t.id}
                  onClose={() => setOpenDropdown(null)}
                  anchorRef={mobStatusRef}
                  items={Object.entries(TASK_STATUS).filter(([k]) => k !== 'blocked' && k !== 'retrasadas').map(([k, v]) => ({ label: v.label, icon: v.icon, iconColor: v.color, onClick: () => updateTask(t.id, { status: k }) }))}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    {blocked && <span className="shrink-0 text-[11px]">{'\uD83D\uDD12'}</span>}
                    {editingTaskId === t.id ? (
                      <input
                        className="border border-blue rounded py-[2px] px-1.5 text-[13px] font-sans outline-none flex-1 bg-white w-full"
                        value={editTitleVal}
                        onChange={(e) => setEditTitleVal(e.target.value)}
                        onBlur={() => saveEditTitle(t.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingTaskId(null); }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <span
                        className="text-[13px] font-medium text-text leading-tight break-words cursor-text flex-1"
                        onClick={(e) => { e.stopPropagation(); startEditTitle(t.id); }}
                        title="Tocar para editar"
                      >
                        {t.title}
                      </span>
                    )}
                    {hasDesc && <span className="w-1.5 h-1.5 rounded-full bg-blue shrink-0" />}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {phaseInfo ? (
                      <span
                        ref={el => mobStepRef.current = el}
                        className="inline-flex items-center gap-1 py-[1px] px-1.5 rounded-full text-[9px] font-semibold cursor-pointer"
                        style={{ background: phaseInfo.color + '18', color: phaseInfo.color }}
                        onClick={(e) => { e.stopPropagation(); setOpenDropdown('mob-step-' + t.id); }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: phaseInfo.color }} />
                        {phaseInfo.label}
                      </span>
                    ) : (
                      <span
                        ref={el => mobStepRef.current = el}
                        className="inline-flex items-center gap-1 py-[1px] px-1.5 rounded-full text-[9px] font-semibold cursor-pointer bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                        onClick={(e) => { e.stopPropagation(); setOpenDropdown('mob-step-' + t.id); }}
                      >
                        + Fase
                      </span>
                    )}
                    <Dropdown
                      open={openDropdown === 'mob-step-' + t.id}
                      onClose={() => setOpenDropdown(null)}
                      anchorRef={mobStepRef}
                      items={stepDropdownItems}
                      minWidth={220}
                      maxHeight={300}
                    />
                    {(() => {
                      const clientTasks = tasks.filter(ct => ct.clientId === t.clientId);
                      const elapsed = getElapsedDays(t, clientTasks);
                      if (elapsed <= 0) return null;
                      const est = getEstimatedDays(t);
                      const color = est ? (elapsed >= est * 2 ? '#EF4444' : elapsed > est ? '#F97316' : '#22C55E') : '#5B7CF5';
                      const bg = est ? (elapsed >= est * 2 ? '#FEF2F2' : elapsed > est ? '#FFF7ED' : '#ECFDF5') : '#EEF2FF';
                      return <span className="text-[9px] font-semibold py-[1px] px-1.5 rounded" style={{ color, background: bg }}>{'\u23F1'} {elapsed}d{est !== null ? `/${est}d` : ''}</span>;
                    })()}
                    {(() => {
                      const assigneeNames = t.assignee ? t.assignee.split(',').map(s => s.trim()).filter(Boolean) : [];
                      const hasClient = assigneeNames.some(n => n.toLowerCase() === 'cliente');
                      const assigneeMembers = assigneeNames.map(name => TEAM.find(m => m.name.toLowerCase() === name.toLowerCase() || m.id === name)).filter(Boolean);
                      const taskClient = clients.find(cl => cl.id === t.clientId);
                      const clientColor = taskClient?.color || '#5B7CF5';
                      const clientName = taskClient?.name || 'Cliente';
                      if (assigneeMembers.length === 0 && !hasClient) {
                        return (
                          <span
                            ref={el => mobAssigneeRef.current = el}
                            className="inline-flex items-center gap-1 py-[1px] px-1.5 rounded-full text-[9px] font-semibold cursor-pointer bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                            onClick={(e) => { e.stopPropagation(); setOpenDropdown('mob-assignee-' + t.id); }}
                          >
                            + Asignar
                          </span>
                        );
                      }
                      return (
                        <div
                          ref={el => mobAssigneeRef.current = el}
                          className="flex items-center cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); setOpenDropdown('mob-assignee-' + t.id); }}
                        >
                          {assigneeMembers.slice(0, 2).map((am, ai) => (
                            <TeamAvatar key={am.id} member={am} size={18} className="border border-white" style={{ marginLeft: ai > 0 ? '-4px' : '0', zIndex: 2 - ai }} />
                          ))}
                          {hasClient && (
                            <span
                              title={`Asignada al cliente: ${clientName}`}
                              className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-bold border border-white"
                              style={{ background: clientColor + '22', color: clientColor, marginLeft: assigneeMembers.length > 0 ? '-4px' : '0', zIndex: 3 }}
                            >{clientName[0]?.toUpperCase() || 'C'}</span>
                          )}
                        </div>
                      );
                    })()}
                    {(() => {
                      const assigneeNames = t.assignee ? t.assignee.split(',').map(s => s.trim()).filter(Boolean) : [];
                      const hasClient = assigneeNames.some(n => n.toLowerCase() === 'cliente');
                      const taskClient = clients.find(cl => cl.id === t.clientId);
                      const clientColor = taskClient?.color || '#5B7CF5';
                      const clientName = taskClient?.name || 'Cliente';
                      const toggleAssignee = (memberName) => {
                        const current = t.assignee ? t.assignee.split(',').map(s => s.trim()).filter(Boolean) : [];
                        const exists = current.some(n => n.toLowerCase() === memberName.toLowerCase());
                        const updated = exists ? current.filter(n => n.toLowerCase() !== memberName.toLowerCase()) : [...current, memberName];
                        updateTask(t.id, { assignee: updated.join(', ') });
                      };
                      return (
                        <Dropdown
                          open={openDropdown === 'mob-assignee-' + t.id}
                          onClose={() => setOpenDropdown(null)}
                          anchorRef={mobAssigneeRef}
                          keepOpen
                          searchable
                          items={[
                            { label: 'Sin asignar', onClick: () => { updateTask(t.id, { assignee: '' }); setOpenDropdown(null); } },
                            {
                              label: `Cliente (${clientName})`,
                              node: <div className="flex items-center gap-2 w-full">
                                <input type="checkbox" checked={hasClient} readOnly className="pointer-events-none" />
                                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: clientColor + '22', color: clientColor }}>{clientName[0]?.toUpperCase() || 'C'}</span>
                                <span>Cliente <span className="text-[10px] text-gray-500">({clientName})</span></span>
                              </div>,
                              onClick: () => toggleAssignee('Cliente'),
                            },
                            ...TEAM.map(m => {
                              const isSelected = assigneeNames.some(n => n.toLowerCase() === m.name.toLowerCase());
                              return {
                                label: m.name,
                                node: <div className="flex items-center gap-2 w-full"><input type="checkbox" checked={isSelected} readOnly className="pointer-events-none" /><TeamAvatar member={m} size={20} /><span>{m.name}</span></div>,
                                onClick: () => toggleAssignee(m.name),
                              };
                            })
                          ]}
                        />
                      );
                    })()}
                  </div>
                  {blocked && blockingNames.length > 0 && (
                    <div className="text-[10px] text-red-500 mt-1 leading-tight">Bloqueada por: {blockingNames.join(', ')}</div>
                  )}
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <button
                    className="bg-transparent border-none text-text3 cursor-pointer text-[10px] p-1"
                    onClick={(e) => { e.stopPropagation(); setExpandedTasks(prev => ({ ...prev, [t.id]: !prev[t.id] })); }}
                    title={isExpanded ? 'Colapsar' : 'Expandir'}
                  >
                    {isExpanded ? '\u25B2' : '\u25BC'}
                  </button>
                  <AddToWeeklyButton task={t} />
                  <button className="bg-transparent border-none text-text3 cursor-pointer text-sm p-1" onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}>{'\uD83D\uDDD1'}</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Expandable description — shared */}
        {isExpanded && (
          <div className="py-1.5 px-4 pl-[44px] pb-3 text-xs text-text2 leading-relaxed bg-blue-bg2 border-t border-dashed border-border max-md:px-3 max-md:pl-3">
            <textarea
              className="w-full border border-border rounded-md py-2 px-2.5 text-xs font-sans resize-y min-h-[60px] outline-none bg-white focus:border-blue mb-2"
              placeholder="Escribe una descripción para esta tarea..."
              defaultValue={t.description || ''}
              onBlur={(e) => updateTask(t.id, { description: e.target.value })}
            />
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex items-center gap-1 text-[11px]">
                <span className="text-text3">{'\uD83D\uDCC5'} Fecha límite:</span>
                <input
                  type="date"
                  className="border border-border rounded py-[2px] px-1.5 text-[11px] font-sans outline-none bg-white focus:border-blue w-[120px]"
                  value={t.dueDate || ''}
                  onChange={(e) => updateTask(t.id, { dueDate: e.target.value || null })}
                />
                {t.dueDate && (
                  <button className="text-text3 hover:text-red bg-transparent border-none cursor-pointer text-[10px] font-sans" onClick={() => updateTask(t.id, { dueDate: null })}>{'\u2715'}</button>
                )}
                {isOverdue && <span className="text-red text-[10px] font-semibold">Vencida</span>}
              </div>
              <div className="inline-flex items-center gap-1 text-[11px]">
                <span className="text-text3">{'\u23F1'}</span>
                <span className="text-text2 font-semibold">
                  {(() => {
                    if (t.status === 'blocked' || blocked) return 'bloqueada \u2014 sin fecha de inicio';
                    const est = getEstimatedDays(t);
                    const clientTs = tasks.filter(ct => ct.clientId === t.clientId);
                    const elapsed = getElapsedDays(t, clientTs);
                    if (est === null) {
                      // Sin dueDate: solo mostrar tiempo activa
                      if (t.startedDate) return `lleva ${elapsed}d activa \u00b7 sin fecha de entrega`;
                      return 'sin fecha de entrega';
                    }
                    return `${elapsed}d / ${est}d estimados${t.startedDate ? ' (habilitada ' + fmtDate(t.startedDate) + ')' : ''}`;
                  })()}
                </span>
              </div>
              <div className="md:hidden flex gap-1.5 w-full mt-1">
                <button className="py-1 px-2 rounded text-[10px] bg-blue-bg text-blue border-none cursor-pointer font-sans" onClick={(e) => { e.stopPropagation(); setDepsModal(t.id); }}>{'\uD83D\uDD17'} Dependencias</button>
              </div>
            </div>
          </div>
        )}
        {/* Drop indicator bottom */}
        {isDragOver && dragOverHalf === 'bottom' && <div className="drag-indicator" />}
      </div>
    );
  };

  const clientsInGroups = new Set(groups.map(g => g.client.id));
  const remaining = regularClients.filter(c => !clientsInGroups.has(c.id));

  // Korex tasks (always shown at bottom). `filteredTasks` ya viene filtrado a
  // las tareas del usuario cuando es no-admin (ver arriba).
  const korexTasks = korexClient ? filteredTasks.filter(t => t.clientId === korexClientId) : [];
  const korexTaskCount = korexTasks.filter(t => t.status !== 'done').length;
  const korexCollapsed = collapsedGroups['_korex'];

  return (
    <div>
      {/* Filters — hidden when embedded inside TareasPage (it has its own unified FiltersBar) */}
      {!embedded && (
        <div className="bg-white border border-border rounded-xl p-3 mb-4 flex items-center gap-3 flex-wrap max-md:gap-2 max-md:p-2.5">
          <select
            className="text-xs py-1.5 px-3 border border-border rounded-md bg-surface2 text-text font-sans outline-none cursor-pointer focus:border-blue"
            value={taskFilter}
            onChange={(e) => setTaskFilter(e.target.value)}
          >
            {filterDefs.map(f => (
              <option key={f.key} value={f.key}>{f.key === 'all' ? 'Estado: Todas' : f.label}</option>
            ))}
          </select>
          <select
            className="text-xs py-1.5 px-3 border border-border rounded-md bg-surface2 text-text font-sans outline-none cursor-pointer focus:border-blue"
            value={taskClientFilter}
            onChange={(e) => setTaskClientFilter(e.target.value)}
          >
            <option value="all">Cliente: Todos</option>
            {regularClients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            className="text-xs py-1.5 px-3 border border-border rounded-md bg-surface2 text-text font-sans outline-none cursor-pointer focus:border-blue"
            value={taskAssignee}
            onChange={(e) => setTaskAssignee(e.target.value)}
          >
            <option value="all">Encargado: Todos</option>
            <option value="mine">Mis tareas</option>
            {assigneeList.map(m => (
              <option key={m.id} value={m.name}>{m.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-3 ml-auto max-md:ml-0 max-md:w-full max-md:justify-between">
            <label className="flex items-center gap-1.5 text-[11px] text-text3 cursor-pointer select-none whitespace-nowrap">
              <input type="checkbox" checked={hideCompletedTasks} onChange={(e) => setHideCompletedTasks(e.target.checked)} className="cursor-pointer accent-blue" /> Ocultar completadas
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-text3 cursor-pointer select-none whitespace-nowrap">
              <input type="checkbox" checked={hideBlockedTasks} onChange={(e) => setHideBlockedTasks(e.target.checked)} className="cursor-pointer accent-blue" /> Ocultar bloqueadas
            </label>
          </div>
        </div>
      )}

      {!groups.length && !addingTaskTo && (
        <>
          <div className="text-center text-text3 text-xs py-[60px]">Sin tareas. Hace click en &quot;+ Agregar tarea&quot; debajo de un cliente.</div>
          <div className="mt-3">
            {clients.map(c => (
              <div key={c.id} className="flex items-center gap-1.5 py-1.5 px-4 cursor-pointer text-text3 text-xs bg-white border border-border rounded-xl mb-1 hover:text-blue hover:bg-blue-bg2" onClick={() => setAddingTaskTo(c.id)}>+ Agregar tarea a <b className="ml-1">{c.name}</b></div>
            ))}
          </div>
        </>
      )}

      {/* Empresa Korex section — at top, solo si tiene tareas visibles con los filtros activos */}
      {korexClient && korexTasks.length > 0 && (
        <div className="mb-2 bg-slate-50 border border-slate-300 border-l-[5px] border-l-slate-700 rounded-xl overflow-visible">
          <div
            className="flex items-center gap-2.5 py-2.5 px-4 text-[13px] font-bold cursor-pointer select-none border-b border-slate-200 hover:bg-slate-100 rounded-t-[6px]"
            onClick={() => setCollapsedGroups(prev => ({ ...prev, '_korex': !prev['_korex'] }))}
          >
            <span className={`text-xs text-slate-400 transition-transform duration-200 ${korexCollapsed ? '-rotate-90' : ''}`}>{'\u25BC'}</span>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[14px] shrink-0 bg-slate-700">{'\uD83C\uDFE2'}</div>
            <span className="text-slate-800">Empresa Korex</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase whitespace-nowrap bg-slate-700 text-white">{'\uD83C\uDFE2'} INTERNO</span>
            <span className="bg-slate-200 text-slate-600 text-[11px] font-semibold py-[1px] px-2 rounded-xl ml-auto">{korexTaskCount}</span>
          </div>
          {!korexCollapsed && (
          <div>
              {korexTasks.length > 0 ? (
                (() => {
                  const getG = (t) => { if (t.status === 'done') return 2; if (isTaskBlocked(t)) return 1; return 0; };
                  const effPos = (t) => (orderUserId && customPosByTask[t.id] !== undefined) ? customPosByTask[t.id] : (t.position ?? 0);
                  const sorted = [...korexTasks].sort((a, b) => {
                    const ga = getG(a), gb = getG(b);
                    if (ga !== gb) return ga - gb;
                    const aHas = orderUserId && customPosByTask[a.id] !== undefined;
                    const bHas = orderUserId && customPosByTask[b.id] !== undefined;
                    if (aHas !== bHas) return aHas ? -1 : 1;
                    return effPos(a) - effPos(b);
                  });
                  return (
                    <>
                      <div
                        className="hidden md:grid gap-3 py-2 px-4 text-[10px] font-bold tracking-wider uppercase text-[#B6BCC4] border-b border-[#EEF0F3]"
                        style={{ gridTemplateColumns: '16px 18px minmax(0,1fr) 130px 88px 48px 110px' }}
                      >
                        <span /><span />
                        <span>Tarea</span>
                        <span>Fase</span>
                        <span className="text-right">Entrega</span>
                        <span className="flex justify-center"><MessageSquare size={11} /></span>
                        <span className="text-right">Equipo</span>
                      </div>
                      {sorted.map(t => renderTaskRow(t, { sortedGroup: sorted }))}
                    </>
                  );
                })()
              ) : (
                <div className="text-center text-slate-400 text-xs py-4">Sin tareas internas</div>
              )}

              {/* Inline new task for Korex — no phases */}
              {addingTaskTo === korexClientId && (
                <div className="flex gap-2 py-2 px-4 items-center border-t border-slate-200 bg-slate-100 max-md:px-3">
                  <div className="text-slate-400 text-[10px] max-md:hidden">+</div>
                  <input
                    id="korex-task-input"
                    className="border-none bg-transparent text-xs font-sans outline-none py-1 text-slate-800 flex-1 min-w-0"
                    placeholder="Nombre de la tarea interna..."
                    autoFocus
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTaskTitle.trim()) {
                        createTask(newTaskTitle.trim(), korexClientId, '', 'normal', 'backlog', '', null);
                        setNewTaskTitle('');
                        setTimeout(() => { const i = document.getElementById('korex-task-input'); if (i) i.focus(); }, 50);
                      }
                      if (e.key === 'Escape') { setAddingTaskTo(null); setNewTaskTitle(''); }
                    }}
                  />
                  <button
                    className="py-1 px-3 bg-slate-700 text-white text-[11px] font-semibold rounded border-none cursor-pointer hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed font-sans shrink-0"
                    disabled={!newTaskTitle.trim()}
                    onClick={() => {
                      if (newTaskTitle.trim()) {
                        createTask(newTaskTitle.trim(), korexClientId, '', 'normal', 'backlog', '', null);
                        setNewTaskTitle('');
                        setTimeout(() => { const i = document.getElementById('korex-task-input'); if (i) i.focus(); }, 50);
                      }
                    }}
                  >
                    Agregar
                  </button>
                  <button className="bg-transparent border-none text-slate-400 cursor-pointer text-sm shrink-0" onClick={() => { setAddingTaskTo(null); setNewTaskTitle(''); }}>{'\u2715'}</button>
                </div>
              )}

              <div className="py-1.5 px-4 flex items-center gap-1.5 cursor-pointer text-slate-400 text-xs hover:text-slate-700 hover:bg-slate-100" onClick={() => { setAddingTaskTo(korexClientId); setTimeout(() => { const i = document.getElementById('korex-task-input'); if (i) i.focus(); }, 50); }}>+ Agregar tarea</div>
          </div>
          )}
        </div>
      )}

      {groups.map(g => {
        // Sort: active (backlog+in-progress+revision) → blocked → done
        // Within each group, sort by manual position
        const getGroup = (t) => {
          if (t.status === 'done') return 2;
          if (isTaskBlocked(t)) return 1;
          return 0; // backlog, in-progress, en-revision = all active
        };
        const effectivePos = (t) => {
          // Cuando hay filtro de persona, priorizar position custom de esa persona.
          // Fallback al position global de la tarea.
          if (orderUserId && customPosByTask[t.id] !== undefined) return customPosByTask[t.id];
          return t.position ?? 0;
        };
        const sortedTasks = [...g.tasks].sort((a, b) => {
          const ga = getGroup(a), gb = getGroup(b);
          if (ga !== gb) return ga - gb;
          const pa = effectivePos(a), pb = effectivePos(b);
          // Tareas con custom position van primero (las arrastradas explicitamente). Las sin custom usan position global.
          const aHasCustom = orderUserId && customPosByTask[a.id] !== undefined;
          const bHasCustom = orderUserId && customPosByTask[b.id] !== undefined;
          if (aHasCustom !== bHasCustom) return aHasCustom ? -1 : 1;
          return pa - pb;
        });
        const taskCount = g.tasks.filter(t => t.status !== 'done').length;
        const collapsed = collapsedGroups[g.client.id];
        const isClientDragging = dragClientId === g.client.id;
        const isClientDragOver = dragOverClientId === g.client.id && dragClientId !== g.client.id;
        const showClientDrag = !!orderUserId && canDragForUser;

        return (
          <div
            key={g.client.id}
            className={`mb-3 bg-white border border-[#E2E5EB] rounded-2xl overflow-visible transition-opacity ${isClientDragging ? 'opacity-40' : ''}`}
            onDragOver={(e) => showClientDrag && handleClientDragOver(e, g.client.id)}
            onDrop={(e) => showClientDrag && handleClientDrop(e, g.client.id, groups)}
            onDragLeave={() => { if (dragOverClientId === g.client.id) setDragOverClientId(null); }}
          >
            {isClientDragOver && dragOverClientHalf === 'top' && <div className="drag-indicator" />}
            <div
              className="flex items-center gap-2.5 py-3 px-4 text-[13.5px] font-bold cursor-pointer select-none border-b border-[#EEF0F3] bg-[#FAFBFC] hover:bg-[#F4F6F9]"
              onClick={() => setCollapsedGroups(prev => ({ ...prev, [g.client.id]: !prev[g.client.id] }))}
            >
              <span className={`text-xs text-[#9CA3AF] transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}>{'\u25BC'}</span>
              {showClientDrag ? (
                <span
                  className="cursor-grab active:cursor-grabbing text-[#9CA3AF] hover:text-[#5B7CF5] transition-colors"
                  draggable
                  onClick={(e) => e.stopPropagation()}
                  onDragStart={(e) => { e.stopPropagation(); handleClientDragStart(e, g.client.id); }}
                  onDragEnd={handleClientDragEnd}
                  title={orderUserId === currentUser?.id ? 'Arrastr\u00E1 para reordenar tus clientes' : 'Arrastr\u00E1 para reordenar los clientes de esta persona'}
                ><GripVertical size={14} /></span>
              ) : null}
              <TeamAvatar member={{ name: g.client.name, color: g.client.color, avatar: g.client.avatarUrl, initials: (g.client.name||'').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase() }} size={26} />
              <span className="text-[#1A1D26]">{g.client.name}</span>
              <span className="bg-[#F0F2F5] text-[#6B7280] text-[11px] font-semibold py-[2px] px-2 rounded-full">{taskCount} pendiente{taskCount !== 1 ? 's' : ''}</span>
            </div>
            {!collapsed && (
            <div>
                {/* Column header \u2014 solo desktop. Mismo grid que las filas. */}
                <div
                  className="hidden md:grid gap-3 py-2 px-4 text-[10px] font-bold tracking-wider uppercase text-[#B6BCC4] border-b border-[#EEF0F3]"
                  style={{ gridTemplateColumns: '16px 18px minmax(0,1fr) 130px 88px 48px 110px' }}
                >
                  <span />
                  <span />
                  <span>Tarea</span>
                  <span>Fase</span>
                  <span className="text-right">Entrega</span>
                  <span className="flex justify-center"><MessageSquare size={11} /></span>
                  <span className="text-right">Equipo</span>
                </div>
                {sortedTasks.map(t => renderTaskRow(t, { sortedGroup: sortedTasks }))}

                {/* Inline new task */}
                {addingTaskTo === g.client.id && (
                  <div className="flex gap-2 py-2 px-4 items-center border-t border-border bg-blue-bg2 max-md:px-3 max-md:flex-wrap">
                    <div className="text-text3 text-[10px] max-md:hidden">+</div>
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <input
                        ref={newTaskInputRef}
                        className="border-none bg-transparent text-xs font-sans outline-none py-1 text-text w-full"
                        placeholder="Nombre de la tarea..."
                        autoFocus
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddTask(g.client.id);
                          if (e.key === 'Escape') { setAddingTaskTo(null); setNewTaskTitle(''); }
                        }}
                      />
                      <select className="text-[11px] py-[3px] px-1.5 border border-border rounded text-text2 font-sans" value={inlinePhase} onChange={(e) => setInlinePhase(e.target.value)}>
                        <option value="">Sin vincular a fase</option>
                        {(() => {
                          const inUse = new Set();
                          tasks.forEach(x => { if (x.clientId === g.client.id && x.phase) inUse.add(x.phase); });
                          Object.keys(g.client.phaseDeadlines || {}).forEach(k => inUse.add(k));
                          (g.client.customPhases || []).forEach(cp => inUse.add(cp.id));
                          return Object.entries(getAllPhases(g.client))
                            .filter(([k]) => inUse.has(k))
                            .map(([k, v]) => <option key={k} value={k}>{v.label}</option>);
                        })()}
                      </select>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className="py-1 px-3 bg-blue text-white text-[11px] font-semibold rounded border-none cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed font-sans"
                        disabled={!newTaskTitle.trim()}
                        onClick={() => handleAddTask(g.client.id)}
                      >
                        Agregar
                      </button>
                      <button className="bg-transparent border-none text-text3 cursor-pointer text-sm px-1" onClick={() => { setAddingTaskTo(null); setNewTaskTitle(''); setInlinePhase(''); }} title="Cancelar">{'\u2715'}</button>
                    </div>
                  </div>
                )}

                <div className="py-1.5 px-4 flex items-center gap-1.5 cursor-pointer text-text3 text-xs hover:text-blue hover:bg-blue-bg2" onClick={() => { setAddingTaskTo(g.client.id); setNewTaskTitle(''); setTimeout(() => { if (newTaskInputRef.current) newTaskInputRef.current.focus(); }, 50); }}>+ Agregar tarea</div>
            </div>
            )}
            {isClientDragOver && dragOverClientHalf === 'bottom' && <div className="drag-indicator" />}
          </div>
        );
      })}

      {/* Remaining clients */}
      {remaining.length > 0 && taskFilter === 'all' && (
        <div className="mt-2 py-1.5">
          {remaining.filter(c => addingTaskTo !== c.id).slice(0, 5).map(c => (
            <span key={c.id} className="inline-block py-1.5 px-3.5 rounded-full border border-border bg-white text-text2 text-xs cursor-pointer m-0.5 hover:border-blue hover:text-text" onClick={() => { setAddingTaskTo(c.id); setTimeout(() => { const i = document.getElementById('inline-task-input'); if (i) i.focus(); }, 50); }}>{c.name}</span>
          ))}
          {remaining.length > 5 && <span className="text-[11px] text-text3 ml-1">+{remaining.length - 5} mas</span>}
        </div>
      )}


      {/* Dependencies Modal (FIX 3) */}
      <Modal
        open={!!depsModal}
        onClose={() => setDepsModal(null)}
        title="Configurar dependencias"
        footer={<button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark" onClick={() => setDepsModal(null)}>Cerrar</button>}
      >
        {depsModal && (() => {
          const currentTask = tasks.find(t => t.id === depsModal);
          if (!currentTask) return <div className="text-xs text-text3">Tarea no encontrada</div>;
          const clientForDeps = clients.find(cl => cl.id === currentTask.clientId);
          const clientTasks = tasks.filter(t => t.clientId === currentTask.clientId);
          const otherTasks = clientTasks.filter(t => t.id !== depsModal);
          const currentDeps = currentTask.dependsOn || [];
          const allPh = clientForDeps ? getAllPhases(clientForDeps) : {};

          const resolvePhaseForDep = (t) => {
            if (t.phase) return t.phase;
            if (t.stepIdx != null && PROCESS_STEPS[t.stepIdx]) return PROCESS_STEPS[t.stepIdx].phase;
            return '_unphased';
          };
          const depPhaseKeys = [...Object.keys(allPh), '_unphased'];
          const depPhaseGroups = depPhaseKeys.map(pk => {
            const phInfo = pk === '_unphased' ? { label: 'Sin fase', color: '#9CA3AF' } : (allPh[pk] || { label: pk, color: '#9CA3AF' });
            const tasksInPhase = otherTasks.filter(t => resolvePhaseForDep(t) === pk);
            return { pk, phInfo, tasksInPhase };
          }).filter(g => g.tasksInPhase.length > 0);

          return (
            <div>
              <div className="text-xs text-text2 mb-3">Selecciona las tareas que deben completarse antes de <strong>{currentTask.title}</strong>:</div>
              {otherTasks.length === 0 ? (
                <div className="text-xs text-text3 py-4 text-center">No hay otras tareas en este cliente</div>
              ) : (
                <div className="max-h-[350px] overflow-y-auto">
                  {depPhaseGroups.map(({ pk, phInfo, tasksInPhase }) => (
                    <div key={pk} className="mb-2">
                      <div className="flex items-center gap-1.5 py-1.5 px-1 sticky top-0 bg-white z-[1]">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: phInfo.color }} />
                        <span className="text-[11px] font-bold" style={{ color: phInfo.color }}>{phInfo.label}</span>
                      </div>
                      {tasksInPhase.map(t => {
                        const isChecked = currentDeps.includes(t.id);
                        const isDone = t.status === 'done';
                        return (
                          <label key={t.id} className={`flex items-center gap-2.5 py-1.5 px-3 pl-6 rounded-md cursor-pointer text-xs hover:bg-surface2 ${isDone ? 'opacity-50' : ''}`}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const newDeps = isChecked ? currentDeps.filter(d => d !== t.id) : [...currentDeps, t.id];
                                updateTask(depsModal, { dependsOn: newDeps });
                              }}
                              className="cursor-pointer"
                            />
                            <span className={`flex-1 ${isDone ? 'line-through text-text3' : 'text-text'}`}>{t.title}</span>
                            {isDone && <span className="text-[9px] text-green font-semibold">COMPLETADA</span>}
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}