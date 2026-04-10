import { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { PROCESS_STEPS, PHASES, TASK_STATUS, TEAM } from '../utils/constants';
import { getStepName, today, fmtDate, getAllPhases, getElapsedDays, getEstimatedDays } from '../utils/helpers';
import Dropdown from '../components/Dropdown';
import Modal from '../components/Modal';
import TeamAvatar from '../components/TeamAvatar';

export default function TasksPage({ embedded = false }) {
  const { clients, tasks, taskFilter, setTaskFilter, taskAssignee, setTaskAssignee, taskClientFilter, setTaskClientFilter, taskPriority, hideCompletedTasks, setHideCompletedTasks, hideBlockedTasks, setHideBlockedTasks, collapsedGroups, setCollapsedGroups, currentUser, createTask, updateTask, deleteTask, reorderTask } = useApp();
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

  // Highlight task (when coming from Timeline click)
  const [highlightTaskId, setHighlightTaskId] = useState(null);
  useEffect(() => {
    try {
      const hid = localStorage.getItem('tareas_highlight_task');
      if (hid) {
        setHighlightTaskId(hid);
        localStorage.removeItem('tareas_highlight_task');
        // Scroll to task after mount
        setTimeout(() => {
          const el = document.getElementById('task-row-' + hid);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
        // Clear highlight after 3 seconds
        setTimeout(() => setHighlightTaskId(null), 3000);
      }
    } catch {}
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

  // Client filter
  if (taskClientFilter !== 'all') {
    filteredTasks = filteredTasks.filter(t => t.clientId === taskClientFilter);
  }

  // Priority filter: only tasks belonging to clients of that priority
  if (taskPriority !== 'all') {
    const allowedClientIds = new Set(regularClients.filter(c => String(c.priority || 5) === taskPriority).map(c => c.id));
    filteredTasks = filteredTasks.filter(t => allowedClientIds.has(t.clientId));
  }

  const grouped = {};
  regularClients.forEach(c => { grouped[c.id] = { client: c, tasks: [] }; });
  filteredTasks.filter(t => t.clientId !== korexClientId).forEach(t => { if (grouped[t.clientId]) grouped[t.clientId].tasks.push(t); });

  const groups = Object.values(grouped).filter(g => g.tasks.length > 0 || addingTaskTo === g.client.id);
  // Sort client groups by CLIENT priority (critico=1 first), NOT by task priority
  groups.sort((a, b) => (a.client.priority || 5) - (b.client.priority || 5));

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
    setDragTaskId(task.id);
    dragGroupRef.current = getStatusGroup(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
    // Collapse to small ghost
    const el = e.currentTarget;
    el.classList.add('drag-dragging');
    setTimeout(() => el.classList.add('drag-ghost'), 0);
  };
  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('drag-dragging', 'drag-ghost');
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
    reorderTask(reordered);
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

    const stepDropdownItems = [
      { label: 'Sin vincular', onClick: () => updateTask(t.id, { stepIdx: null, phase: null }) },
      { divider: true, label: 'Fases', color: '#9CA3AF' },
    ];
    Object.entries(clientAllPhases).forEach(([key, ph]) => {
      stepDropdownItems.push({ label: ph.label, onClick: () => updateTask(t.id, { phase: key, stepIdx: null }), style: { paddingLeft: 8 }, icon: '\u25CF', iconColor: ph.color });
    });

    const isHighlighted = highlightTaskId === t.id;
    return (
      <div id={'task-row-' + t.id} key={t.id} className={`border-b border-border last:border-b-0 ${isDragging ? 'drag-ghost' : ''} ${isHighlighted ? 'highlight-pulse' : ''}`}>
        {/* Drop indicator */}
        {isDragOver && dragOverHalf === 'top' && <div className="drag-indicator" />}
        {/* Desktop row */}
        <div
          className={`hidden md:grid gap-2 py-2 px-4 items-start text-xs transition-colors hover:bg-blue-bg2 min-h-[38px] group ${blocked ? 'opacity-60' : ''}`}
          style={{ gridTemplateColumns: '20px 28px 1fr 110px 50px 30px' }}
          onDragOver={(e) => handleDragOver(e, t, sortedGroup)}
          onDrop={(e) => handleDrop(e, t, sortedGroup)}
          onDragLeave={() => { if (dragOverTaskId === t.id) setDragOverTaskId(null); }}
        >
          {/* Drag handle — solo tareas activas */}
          {getStatusGroup(t) === 0 ? (
            <div
              className="flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity text-text3 text-[14px] select-none"
              draggable
              onDragStart={(e) => handleDragStart(e, t, sortedGroup)}
              onDragEnd={handleDragEnd}
              title="Arrastrar para reordenar"
            >{'\u2630'}</div>
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

          {/* Title row: titulo wrappea + badges agrupados a la derecha */}
          <div className="min-w-0 flex flex-col gap-0.5">
            <div className="flex items-start gap-1.5 min-w-0">
              {blocked && <span className="shrink-0 mt-[1px]" title="Bloqueada por dependencias">{'\uD83D\uDD12'}</span>}
              {editingTaskId === t.id ? (
                <input
                  className="border border-blue rounded-[3px] py-[2px] px-1.5 text-xs font-sans outline-none flex-1 min-w-0 bg-white"
                  value={editTitleVal}
                  onChange={(e) => setEditTitleVal(e.target.value)}
                  onBlur={() => saveEditTitle(t.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingTaskId(null); }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span
                  className="cursor-text py-[2px] px-1 rounded-[3px] flex-1 min-w-0 break-words hover:bg-surface2 leading-tight"
                  onClick={(e) => { e.stopPropagation(); startEditTitle(t.id); }}
                >
                  {t.title}
                </span>
              )}
              {/* Badges: cada uno con shrink-0, agrupados en su propio contenedor */}
              <div className="flex items-center gap-1.5 shrink-0 mt-[1px]">
                {(() => {
                  const clientTasks = tasks.filter(ct => ct.clientId === t.clientId);
                  const elapsed = getElapsedDays(t, clientTasks);
                  if (elapsed <= 0) return null;
                  const est = getEstimatedDays(t);
                  const color = est ? (elapsed >= est * 2 ? '#EF4444' : elapsed > est ? '#F97316' : '#22C55E') : '#5B7CF5';
                  const bg = est ? (elapsed >= est * 2 ? '#FEF2F2' : elapsed > est ? '#FFF7ED' : '#ECFDF5') : '#EEF2FF';
                  return (
                    <span className="inline-flex items-center py-[1px] px-1.5 rounded text-[9px] font-semibold" style={{ color, background: bg }}>
                      {'\u23F1'} {elapsed}d{est !== null ? ` / ${est}d` : ''}
                    </span>
                  );
                })()}
                {t.dueDate && (
                  <span className={`inline-flex items-center py-[1px] px-1.5 rounded text-[9px] font-medium ${isOverdue ? 'text-red-500 bg-red-50' : 'text-gray-400 bg-gray-50'}`}>
                    {isOverdue ? '\u26A0' : '\uD83D\uDCC5'} {fmtDate(t.dueDate)}
                  </span>
                )}
                {hasDesc && <span className="w-1.5 h-1.5 rounded-full bg-blue" title="Tiene descripci\u00f3n" />}
                <button className="bg-transparent border-none text-text3 cursor-pointer text-[11px] py-[2px] px-1 rounded-[3px] hover:text-blue hover:bg-blue-bg opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setDepsModal(t.id); }} title="Dependencias">{'\uD83D\uDD17'}</button>
                <button className="bg-transparent border-none text-text3 cursor-pointer text-[11px] py-[2px] px-1 rounded-[3px] hover:text-blue hover:bg-blue-bg" onClick={() => setExpandedTasks(prev => ({ ...prev, [t.id]: !prev[t.id] }))}>{isExpanded ? '\u25B2' : '\u25BC'}</button>
              </div>
            </div>
            {blocked && blockingNames.length > 0 && (
              <div className="text-[10px] text-red-500 pl-1 leading-tight">Bloqueada por: {blockingNames.join(', ')}</div>
            )}
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

          {/* Assignee */}
          {(() => {
            const assigneeNames = t.assignee ? t.assignee.split(',').map(s => s.trim()).filter(Boolean) : [];
            const assigneeMembers = assigneeNames.map(name => TEAM.find(m => m.name.toLowerCase() === name.toLowerCase() || m.id === name)).filter(Boolean);
            const toggleAssignee = (memberName) => {
              const current = t.assignee ? t.assignee.split(',').map(s => s.trim()).filter(Boolean) : [];
              const exists = current.some(n => n.toLowerCase() === memberName.toLowerCase());
              const updated = exists ? current.filter(n => n.toLowerCase() !== memberName.toLowerCase()) : [...current, memberName];
              updateTask(t.id, { assignee: updated.join(', ') });
            };
            return (
              <>
                <div
                  ref={el => assigneeRef.current = el}
                  className="cursor-pointer relative"
                  onClick={(e) => { e.stopPropagation(); setOpenDropdown('assignee-' + t.id); }}
                >
                  <div className="flex items-center gap-1 py-[2px] px-1.5 rounded text-[11px] text-text2 hover:bg-surface2">
                    {assigneeMembers.length > 0 ? (
                      <div className="flex items-center">
                        {assigneeMembers.slice(0, 2).map((am, ai) => (
                          <TeamAvatar key={am.id} member={am} size={20} className="border-2 border-white" style={{ marginLeft: ai > 0 ? '-6px' : '0', zIndex: 2 - ai }} />
                        ))}
                        {assigneeMembers.length > 2 && (
                          <span className="w-[20px] h-[20px] rounded-full flex items-center justify-center text-[8px] font-bold bg-gray-200 text-gray-600 border-2 border-white" style={{ marginLeft: '-6px', zIndex: 0 }}>+{assigneeMembers.length - 2}</span>
                        )}
                      </div>
                    ) : <span className="text-text3">+ Asignar</span>}
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
              </>
            );
          })()}

          {/* Delete */}
          <div className="flex items-center justify-center">
            <button className="bg-transparent border-none text-text3 cursor-pointer text-sm py-[2px] rounded opacity-0 group-hover:opacity-100 transition-opacity hover:text-red" onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}>{'\uD83D\uDDD1'}</button>
          </div>
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
                        className="border border-blue rounded-[3px] py-[2px] px-1.5 text-[13px] font-sans outline-none flex-1 bg-white w-full"
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
                      const assigneeMembers = assigneeNames.map(name => TEAM.find(m => m.name.toLowerCase() === name.toLowerCase() || m.id === name)).filter(Boolean);
                      if (assigneeMembers.length === 0) {
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
                        </div>
                      );
                    })()}
                    {(() => {
                      const assigneeNames = t.assignee ? t.assignee.split(',').map(s => s.trim()).filter(Boolean) : [];
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

  // Korex tasks (always shown at bottom)
  const korexTasks = korexClient ? filteredTasks.filter(t => t.clientId === korexClientId) : [];
  const korexTaskCount = korexTasks.filter(t => t.status !== 'done').length;
  const korexCollapsed = collapsedGroups['_korex'];

  return (
    <div>
      {/* Filters — hidden when embedded inside TareasPage (it has its own unified FiltersBar) */}
      {!embedded && (
        <div className="bg-white border border-border rounded-[10px] p-3 mb-4 flex items-center gap-3 flex-wrap max-md:gap-2 max-md:p-2.5">
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
              <div key={c.id} className="flex items-center gap-1.5 py-1.5 px-4 cursor-pointer text-text3 text-xs bg-white border border-border rounded-[10px] mb-1 hover:text-blue hover:bg-blue-bg2" onClick={() => setAddingTaskTo(c.id)}>+ Agregar tarea a <b className="ml-1">{c.name}</b></div>
            ))}
          </div>
        </>
      )}

      {groups.map(g => {
        // Sort: active (backlog+in-progress+revision) → blocked → done
        // Within each group, sort by manual position
        const getGroup = (t) => {
          if (t.status === 'done') return 2;
          if (isTaskBlocked(t)) return 1;
          return 0; // backlog, in-progress, en-revision = all active
        };
        const sortedTasks = [...g.tasks].sort((a, b) => {
          const ga = getGroup(a), gb = getGroup(b);
          if (ga !== gb) return ga - gb;
          return (a.position ?? 0) - (b.position ?? 0);
        });
        const collapsed = collapsedGroups[g.client.id];
        const taskCount = g.tasks.filter(t => t.status !== 'done').length;

        return (
          <div key={g.client.id} className="mb-1.5 bg-white border border-border rounded-[10px] overflow-visible">
            <div
              className="flex items-center gap-2.5 py-2.5 px-4 text-[13px] font-bold cursor-pointer select-none border-b border-border bg-surface2 hover:bg-surface3"
              onClick={() => setCollapsedGroups(prev => ({ ...prev, [g.client.id]: !prev[g.client.id] }))}
            >
              <span className={`text-xs text-text3 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}>{'\u25BC'}</span>
              <span>{g.client.name}</span>
              <span className="bg-surface3 text-text2 text-[11px] font-semibold py-[1px] px-2 rounded-[10px]">{taskCount}</span>
            </div>
            {!collapsed && (
              <div>
                {sortedTasks.map(t => renderTaskRow(t, { sortedGroup: sortedTasks }))}

                {/* Inline new task */}
                {addingTaskTo === g.client.id && (
                  <div className="flex gap-2 py-2 px-4 items-center border-t border-border bg-blue-bg2 max-md:px-3 max-md:flex-wrap">
                    <div className="text-text3 text-[10px] max-md:hidden">+</div>
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <input
                        ref={newTaskInputRef}
                        className="border-none bg-transparent text-xs font-sans outline-none py-1 text-text w-full"
                        placeholder="Nombre de la tarea + Enter..."
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
                        {Object.entries(getAllPhases(g.client)).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div><button className="bg-transparent border-none text-text3 cursor-pointer text-sm" onClick={() => { setAddingTaskTo(null); setNewTaskTitle(''); }}>{'\u2715'}</button></div>
                  </div>
                )}

                <div className="py-1.5 px-4 flex items-center gap-1.5 cursor-pointer text-text3 text-xs hover:text-blue hover:bg-blue-bg2" onClick={() => { setAddingTaskTo(g.client.id); setNewTaskTitle(''); setTimeout(() => { if (newTaskInputRef.current) newTaskInputRef.current.focus(); }, 50); }}>+ Agregar tarea</div>
              </div>
            )}
          </div>
        );
      })}

      {/* Remaining clients */}
      {remaining.length > 0 && taskFilter === 'all' && (
        <div className="mt-2 py-1.5">
          {remaining.filter(c => addingTaskTo !== c.id).slice(0, 5).map(c => (
            <span key={c.id} className="inline-block py-1.5 px-3.5 rounded-[20px] border border-border bg-white text-text2 text-xs cursor-pointer m-0.5 hover:border-blue hover:text-text" onClick={() => { setAddingTaskTo(c.id); setTimeout(() => { const i = document.getElementById('inline-task-input'); if (i) i.focus(); }, 50); }}>{c.name}</span>
          ))}
          {remaining.length > 5 && <span className="text-[11px] text-text3 ml-1">+{remaining.length - 5} mas</span>}
        </div>
      )}

      {/* Empresa Korex section — always at bottom */}
      {korexClient && (
        <div className="mt-6 mb-1.5 bg-white border border-border rounded-[10px] overflow-visible">
          <div
            className="flex items-center gap-2.5 py-2.5 px-4 text-[13px] font-bold cursor-pointer select-none border-b border-border rounded-t-[10px]"
            style={{ background: '#E8EDF4' }}
            onClick={() => setCollapsedGroups(prev => ({ ...prev, '_korex': !prev['_korex'] }))}
          >
            <span className={`text-xs text-text3 transition-transform duration-200 ${korexCollapsed ? '-rotate-90' : ''}`}>{'\u25BC'}</span>
            <span>{'\uD83D\uDCCB'} Tareas internas — Korex</span>
            <span className="bg-surface3 text-text2 text-[11px] font-semibold py-[1px] px-2 rounded-[10px]">{korexTaskCount}</span>
          </div>
          {!korexCollapsed && (
            <div>
              {korexTasks.length > 0 ? (
                (() => {
                  const getG = (t) => { if (t.status === 'done') return 2; if (isTaskBlocked(t)) return 1; return 0; };
                  const sorted = [...korexTasks].sort((a, b) => {
                    const ga = getG(a), gb = getG(b);
                    if (ga !== gb) return ga - gb;
                    return (a.position ?? 0) - (b.position ?? 0);
                  });
                  return sorted.map(t => renderTaskRow(t, { sortedGroup: sorted }));
                })()
              ) : (
                <div className="text-center text-text3 text-xs py-4">Sin tareas internas</div>
              )}

              {/* Inline new task for Korex — no phases */}
              {addingTaskTo === korexClientId && (
                <div className="flex gap-2 py-2 px-4 items-center border-t border-border bg-blue-bg2 max-md:px-3">
                  <div className="text-text3 text-[10px] max-md:hidden">+</div>
                  <input id="korex-task-input" className="border-none bg-transparent text-xs font-sans outline-none py-1 text-text flex-1 min-w-0" placeholder="Nombre de la tarea + Enter..." autoFocus onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      createTask(e.target.value.trim(), korexClientId, '', 'normal', 'backlog', '', null);
                      e.target.value = '';
                      setTimeout(() => { const i = document.getElementById('korex-task-input'); if (i) i.focus(); }, 50);
                    }
                    if (e.key === 'Escape') setAddingTaskTo(null);
                  }} />
                  <button className="bg-transparent border-none text-text3 cursor-pointer text-sm shrink-0" onClick={() => setAddingTaskTo(null)}>{'\u2715'}</button>
                </div>
              )}

              <div className="py-1.5 px-4 flex items-center gap-1.5 cursor-pointer text-text3 text-xs hover:text-blue hover:bg-blue-bg2" onClick={() => { setAddingTaskTo(korexClientId); setTimeout(() => { const i = document.getElementById('korex-task-input'); if (i) i.focus(); }, 50); }}>+ Agregar tarea</div>
            </div>
          )}
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