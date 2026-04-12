import { useState, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { PROCESS_STEPS, PHASES, PRIO_CLIENT, STATUS, TASK_STATUS, TEAM } from '../utils/constants';
import { initials, progress, getBottleneck, getAllPhases, getStepNameForClient, getRoadmapTasks, daysAgo, daysBetween, fmtDate, clientPill, today, getElapsedDays } from '../utils/helpers';
import Modal from '../components/Modal';
import Dropdown from '../components/Dropdown';
import StatusPill from '../components/StatusPill';
import TeamAvatar from '../components/TeamAvatar';

// Link categories — used to organize Drive links, docs, landings, etc.
const LINK_CATEGORIES = {
  folder:  { label: 'Carpetas',     icon: '\uD83D\uDCC1', color: '#F59E0B' },
  doc:     { label: 'Docs',         icon: '\uD83D\uDCC4', color: '#3B82F6' },
  sheet:   { label: 'Sheets',       icon: '\uD83D\uDCCA', color: '#10B981' },
  landing: { label: 'Landings',     icon: '\uD83C\uDF10', color: '#8B5CF6' },
  pdf:     { label: 'PDFs',         icon: '\uD83D\uDCC4', color: '#EF4444' },
  other:   { label: 'Otros',        icon: '\uD83D\uDD17', color: '#6B7280' },
};
const LINK_CATEGORY_ORDER = ['folder', 'doc', 'sheet', 'landing', 'pdf', 'other'];

export default function ClientDetail({ client: c }) {
  const { setSelectedId, setView, setTaskClientFilter, updateClient, deleteClient, tasks, createTask, updateTask, deleteTask, reorderTask, currentUser, getPriorityLabel, getAllPriorityLabels } = useApp();
  const [linkModal, setLinkModal] = useState(false);
  const [linkForm, setLinkForm] = useState({ label: '', url: '', category: 'folder' });
  const [editingLinkIdx, setEditingLinkIdx] = useState(null);
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState(false);
  const [clientFbModal, setClientFbModal] = useState(false);
  const [fbSourceFilter, setFbSourceFilter] = useState('all');
  const [openDropdown, setOpenDropdown] = useState(null);
  const [expandedTasks, setExpandedTasks] = useState({});
  const [openTranscription, setOpenTranscription] = useState({});
  const [addingToPhase, setAddingToPhase] = useState(null);
  const [collapsedPhases, setCollapsedPhases] = useState({});
  const [editingStartDate, setEditingStartDate] = useState(false);
  const [editingTitle, setEditingTitle] = useState(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [depsModal, setDepsModal] = useState(null);
  const [addPhaseModal, setAddPhaseModal] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [newPhaseColor, setNewPhaseColor] = useState('#5B7CF5');
  const [editingEstDays, setEditingEstDays] = useState(null);
  const [estDaysValue, setEstDaysValue] = useState('');
  const [editingPhase, setEditingPhase] = useState(null);
  const [editPhaseValue, setEditPhaseValue] = useState('');
  const [deletePhaseConfirm, setDeletePhaseConfirm] = useState(null);
  const [editingDeadline, setEditingDeadline] = useState(null);
  const [deleteClientModal, setDeleteClientModal] = useState(false);
  const [deleteClientConfirmName, setDeleteClientConfirmName] = useState('');

  const dropdownRefs = useRef({});

  const canDeleteClient = currentUser?.role === 'COO' || currentUser?.canAccessSettings === true;

  const clientTasks = tasks.filter(t => t.clientId === c.id);
  const roadmapTasks = getRoadmapTasks(c.id, tasks);
  // Use new system if client has ANY tasks (not just roadmap-flagged ones)
  const useNewSystem = clientTasks.length > 0;

  const pct = progress(c, tasks);
  const days = daysAgo(c.startDate);
  const p = c.priority || 5;
  const pcfg = getPriorityLabel(p);
  const pill = clientPill(c, tasks);
  const bn = getBottleneck(c, tasks);
  const ct = clientTasks.filter(t => t.status !== 'done').length;
  const allPh = getAllPhases(c);

  const getDropdownRef = useCallback((key) => {
    if (!dropdownRefs.current[key]) dropdownRefs.current[key] = { current: null };
    return dropdownRefs.current[key];
  }, []);

  // Edit client modal
  const [editForm, setEditForm] = useState({});
  const openEditModal = () => {
    setEditForm({
      name: c.name, company: c.company, service: c.service || '',
      startDate: c.startDate || '', avatarUrl: c.avatarUrl || '', bottleneck: c.bottleneck || '',
      status: c.status, notes: c.notes || '',
    });
    setEditModal(true);
  };
  const saveEdit = () => {
    updateClient(c.id, {
      name: editForm.name, company: editForm.company, service: editForm.service,
      startDate: editForm.startDate, avatarUrl: editForm.avatarUrl, bottleneck: editForm.bottleneck,
      status: editForm.status, notes: editForm.notes,
    });
    setEditModal(false);
  };

  // Feedback modal
  const [fbForm, setFbForm] = useState({ date: today(), sentiment: 'neutral', text: '', fathomLink: '', keypoints: '', transcription: '' });
  const saveFeedback = () => {
    if (!fbForm.text.trim()) return;
    const newFeedback = [...c.feedback, { type: 'call', date: fbForm.date, sentiment: fbForm.sentiment, text: fbForm.text.trim(), fathomLink: fbForm.fathomLink, keypoints: fbForm.keypoints, transcription: fbForm.transcription }];
    const newHistory = [...c.history, { text: 'Llamada registrada', date: fbForm.date, color: '#5B7CF5' }];
    updateClient(c.id, { feedback: newFeedback, history: newHistory });
    setFeedbackModal(false);
    setFbForm({ date: today(), sentiment: 'neutral', text: '', fathomLink: '', keypoints: '', transcription: '' });
  };

  // Client feedback modal (new model)
  const SOURCE_COLORS = { cliente: '#5B7CF5', usuario: '#8B5CF6', mentor: '#22C55E', equipo: '#F97316' };
  const SOURCE_LABELS = { cliente: 'Cliente', usuario: 'Usuario', mentor: 'Mentor', equipo: 'Equipo' };
  const PRIO_OPTIONS = [
    { value: 'urgent', label: 'Urgente', color: '#EF4444' },
    { value: 'high', label: 'Alta', color: '#F97316' },
    { value: 'normal', label: 'Normal', color: '#6B7280' },
    { value: 'low', label: 'Baja', color: '#9CA3AF' },
  ];
  const [cfbForm, setCfbForm] = useState({ source: 'cliente', callUrl: '', priority: 'normal', currentItem: '', items: [] });
  const saveClientFeedback = () => {
    const allItems = [...cfbForm.items];
    if (cfbForm.currentItem.trim()) allItems.push(cfbForm.currentItem.trim());
    if (!allItems.length) return;
    const newFb = {
      id: 'fb_' + Date.now(),
      clientId: c.id,
      source: cfbForm.source,
      callUrl: cfbForm.callUrl.trim(),
      date: today(),
      priority: cfbForm.priority,
      items: allItems.map(text => ({ text, convertedTaskId: null })),
      comments: [],
    };
    const newFbs = [...(c.clientFeedbacks || []), newFb];
    const newHistory = [...c.history, { text: 'Feedback (' + SOURCE_LABELS[cfbForm.source] + '): ' + allItems[0].substring(0, 50), date: today(), color: SOURCE_COLORS[cfbForm.source] }];
    updateClient(c.id, { clientFeedbacks: newFbs, history: newHistory });
    setClientFbModal(false);
    setCfbForm({ source: 'cliente', callUrl: '', priority: 'normal', currentItem: '', items: [] });
  };

  // Normalize old feedback format to new format for display
  const normalizeFeedback = (f, idx) => {
    if (f.items) return f; // already new format
    return {
      id: f.id || 'fb_legacy_' + idx,
      clientId: c.id,
      source: f.source === 'whatsapp' || f.source === 'call' || f.source === 'slack' || f.source === 'email' ? 'cliente' : (f.source || 'cliente'),
      callUrl: f.fathomLink || '',
      date: f.date || today(),
      priority: 'normal',
      items: [{ text: f.text, convertedTaskId: f.convertedTaskId || null }],
      comments: f.comments || [],
    };
  };

  const addFbComment = (fbIdx) => {
    const text = prompt('Tu comentario sobre este feedback:');
    if (!text?.trim()) return;
    const newFbs = (c.clientFeedbacks || []).map((f, i) => i === fbIdx ? { ...normalizeFeedback(f, i), comments: [...(f.comments || []), { user: currentUser?.name || 'Usuario', text: text.trim(), date: today() }] } : f);
    updateClient(c.id, { clientFeedbacks: newFbs });
  };

  const convertFbItemToTask = (fbIdx, itemIdx) => {
    const rawFb = c.clientFeedbacks[fbIdx];
    const fb = normalizeFeedback(rawFb, fbIdx);
    const item = fb.items[itemIdx];
    if (!item || item.convertedTaskId) return;
    const t = createTask(item.text.substring(0, 80), c.id, '', 'normal', 'backlog', '', null);
    updateTask(t.id, { description: item.text });
    const newFbs = [...(c.clientFeedbacks || [])];
    const normalized = normalizeFeedback(newFbs[fbIdx], fbIdx);
    const newItems = [...normalized.items];
    newItems[itemIdx] = { ...newItems[itemIdx], convertedTaskId: t.id };
    newFbs[fbIdx] = { ...normalized, items: newItems };
    const newHistory = [...c.history, { text: 'Feedback convertido a tarea: ' + item.text.substring(0, 40), date: today(), color: '#5B7CF5' }];
    updateClient(c.id, { clientFeedbacks: newFbs, history: newHistory });
  };

  const deleteFbItem = (fbIdx, itemIdx) => {
    const rawFb = c.clientFeedbacks[fbIdx];
    const fb = normalizeFeedback(rawFb, fbIdx);
    const newItems = fb.items.filter((_, i) => i !== itemIdx);
    if (newItems.length === 0) {
      // Remove entire feedback if no items left
      const newFbs = (c.clientFeedbacks || []).filter((_, i) => i !== fbIdx);
      updateClient(c.id, { clientFeedbacks: newFbs });
    } else {
      const newFbs = [...(c.clientFeedbacks || [])];
      newFbs[fbIdx] = { ...fb, items: newItems };
      updateClient(c.id, { clientFeedbacks: newFbs });
    }
  };

  const handleInlineStartDate = (val) => {
    updateClient(c.id, { startDate: val });
    setEditingStartDate(false);
  };

  // Check if a roadmap task is blocked by dependencies (uses task IDs)
  const isTaskBlocked = (task) => {
    if (!task.dependsOn || task.dependsOn.length === 0) return false;
    if (task.status === 'done') return false;
    return task.dependsOn.some(depId => {
      const depTask = clientTasks.find(t => t.id === depId);
      return depTask && depTask.status !== 'done';
    });
  };

  const getBlockingNames = (task) => {
    if (!task.dependsOn || task.dependsOn.length === 0) return [];
    return task.dependsOn
      .map(depId => {
        const depTask = clientTasks.find(t => t.id === depId);
        return depTask && depTask.status !== 'done' ? depTask.title : null;
      })
      .filter(Boolean);
  };

  // Add task to a specific phase
  const handlePhaseTaskAdd = (phaseKey, title) => {
    if (title.trim()) {
      const t = createTask(title.trim(), c.id, '', 'normal', 'backlog', '', null);
      updateTask(t.id, { isRoadmapTask: true, phase: phaseKey });
    }
    setAddingToPhase(null);
  };

  // Get filtered tasks for roadmap list
  const getFilteredTasks = () => {
    let allTasks = [...clientTasks];

    // Filter by assignee (supports comma-separated multi-assignee)
    if (assigneeFilter !== 'all') {
      const memberName = assigneeFilter.toLowerCase();
      allTasks = allTasks.filter(t => {
        if (!t.assignee) return false;
        const parts = t.assignee.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        return parts.some(p => {
          const a = TEAM.find(m => m.name.toLowerCase() === p || m.id === p);
          return a && (a.name.toLowerCase() === memberName || a.id === memberName);
        });
      });
    }

    // Hide completed
    if (hideCompleted) {
      allTasks = allTasks.filter(t => t.status !== 'done');
    }

    return allTasks;
  };

  // ===== VERTICAL LIST ROADMAP =====
  // Drag & drop state for roadmap
  const [rdDragId, setRdDragId] = useState(null);
  const [rdDragOverId, setRdDragOverId] = useState(null);
  const [rdDragOverHalf, setRdDragOverHalf] = useState(null);
  const [rdDragOverPhase, setRdDragOverPhase] = useState(null);
  const rdDragGroupRef = useRef(null); // 0=active, 1=blocked, 2=done
  const rdDragPhaseRef = useRef(null); // phase key of dragged task

  const rdGetGroup = (task) => {
    if (task.status === 'done') return 2;
    if (isTaskBlocked(task)) return 1;
    return 0;
  };
  const rdCanDrag = (task) => rdGetGroup(task) === 0; // solo activas se arrastran

  const rdHandleDragStart = (e, task) => {
    if (!rdCanDrag(task)) { e.preventDefault(); return; }
    setRdDragId(task.id);
    rdDragGroupRef.current = 0; // siempre activa
    rdDragPhaseRef.current = task.phase || null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
    setTimeout(() => e.currentTarget.classList.add('drag-ghost'), 0);
  };
  const rdHandleDragEnd = (e) => {
    e.currentTarget.classList.remove('drag-ghost');
    setRdDragId(null);
    setRdDragOverId(null);
    setRdDragOverHalf(null);
    setRdDragOverPhase(null);
    rdDragGroupRef.current = null;
    rdDragPhaseRef.current = null;
  };
  const rdClearDrag = () => {
    setRdDragId(null);
    setRdDragOverId(null);
    setRdDragOverHalf(null);
    setRdDragOverPhase(null);
  };
  // Drag over a task row — active tasks can drop on any row (same or different phase)
  const rdHandleDragOver = (e, task) => {
    e.preventDefault();
    if (rdDragGroupRef.current !== 0) { e.dataTransfer.dropEffect = 'none'; return; }
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    setRdDragOverId(task.id);
    setRdDragOverHalf((e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom');
    setRdDragOverPhase(null);
  };
  // Drop on a task row — inserts before blocked/completed
  const rdHandleDrop = (e, task, sortedTasks) => {
    e.preventDefault();
    if (!rdDragId || rdDragId === task.id) return;
    const draggedTask = clientTasks.find(t => t.id === rdDragId);
    if (!draggedTask) return;
    const targetPhase = task.phase;
    // Change phase if needed
    if (targetPhase !== draggedTask.phase) {
      updateTask(rdDragId, { phase: targetPhase, isRoadmapTask: true });
    }
    // Figure out insert position — always within active group (before blocked/done)
    const targetGroup = rdGetGroup(task);
    const fromIdx = sortedTasks.findIndex(t => t.id === rdDragId);
    const targetIdx = sortedTasks.findIndex(t => t.id === task.id);
    if (targetIdx < 0) { rdClearDrag(); return; }
    let insertIdx;
    if (targetGroup === 0) {
      // Dropping on active task: respect half position
      insertIdx = rdDragOverHalf === 'top' ? targetIdx : targetIdx + 1;
    } else {
      // Dropping on blocked/done: insert before all non-active (top of blocked/done group)
      insertIdx = sortedTasks.findIndex(t => rdGetGroup(t) !== 0);
      if (insertIdx < 0) insertIdx = sortedTasks.length;
    }
    if (fromIdx < 0) {
      // Coming from another phase
      const withDragged = [...sortedTasks];
      withDragged.splice(insertIdx, 0, { ...draggedTask, phase: targetPhase });
      reorderTask(withDragged);
    } else {
      if (fromIdx < insertIdx) insertIdx--;
      const reordered = [...sortedTasks];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(insertIdx, 0, moved);
      reorderTask(reordered);
    }
    rdClearDrag();
  };
  // Drop on a phase header (move to that phase, append at end of active group)
  const rdHandleDropOnPhase = (e, phaseKey) => {
    e.preventDefault();
    if (!rdDragId || rdDragGroupRef.current !== 0) return;
    const draggedTask = clientTasks.find(t => t.id === rdDragId);
    if (!draggedTask || draggedTask.phase === phaseKey) { rdClearDrag(); return; }
    updateTask(rdDragId, { phase: phaseKey, isRoadmapTask: true });
    rdClearDrag();
  };
  const rdHandleDragOverPhase = (e, phaseKey) => {
    e.preventDefault();
    if (rdDragGroupRef.current !== 0) { e.dataTransfer.dropEffect = 'none'; return; }
    e.dataTransfer.dropEffect = 'move';
    setRdDragOverPhase(phaseKey);
    setRdDragOverId(null);
  };

  const renderRoadmap = () => {
    const filteredTasks = getFilteredTasks();

    // Build assignee filter from TEAM members who have at least one task in this client
    const assigneeList = TEAM.filter(m => {
      return clientTasks.some(t => {
        if (!t.assignee) return false;
        const parts = t.assignee.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        return parts.includes(m.name.toLowerCase()) || parts.includes(m.id);
      });
    });

    // Resolve phase for each task (tasks without phase inherit from stepIdx/PROCESS_STEPS)
    const resolvePhase = (t) => {
      if (t.phase) return t.phase;
      if (t.stepIdx != null && PROCESS_STEPS[t.stepIdx]) return PROCESS_STEPS[t.stepIdx].phase;
      return '_unphased';
    };

    // Group tasks by phase
    const phaseKeys = [...Object.keys(allPh), '_unphased'];
    const phaseGroups = phaseKeys.map(phaseKey => {
      const phInfo = phaseKey === '_unphased' ? { label: 'Sin fase', color: '#9CA3AF' } : (allPh[phaseKey] || { label: phaseKey, color: '#9CA3AF' });
      const phaseTasks = filteredTasks.filter(t => resolvePhase(t) === phaseKey);
      const allPhaseTasks = clientTasks.filter(t => resolvePhase(t) === phaseKey);
      const totalCount = allPhaseTasks.length;
      const doneCount = allPhaseTasks.filter(t => t.status === 'done').length;
      const allDone = totalCount > 0 && doneCount === totalCount;
      return { phaseKey, phInfo, phaseTasks, totalCount, doneCount, allDone };
    }).filter(g => g.totalCount > 0 || (g.phaseKey !== '_unphased' && (c.customPhases || []).some(cp => cp.id === g.phaseKey)));

    // Initialize collapsed state for all-done phases (only on first render logic)
    const isCollapsed = (phaseKey, allDone) => {
      if (collapsedPhases[phaseKey] !== undefined) return collapsedPhases[phaseKey];
      return allDone;
    };

    const togglePhase = (phaseKey) => {
      setCollapsedPhases(prev => ({ ...prev, [phaseKey]: !isCollapsed(phaseKey, phaseGroups.find(g => g.phaseKey === phaseKey)?.allDone) }));
    };

    // Render a single task row
    const renderTaskRow = (t, isLast, sortedGroup) => {
      const blocked = isTaskBlocked(t);
      const blockingNames = blocked ? getBlockingNames(t) : [];
      const hasDesc = !!(t.description && t.description.trim());
      const elapsed = getElapsedDays(t, clientTasks);
      const est = t.estimatedDays || null;
      const isExpanded = expandedTasks[t.id];

      // Due date logic
      const isOverdue = t.dueDate && t.status !== 'done' && !blocked && t.dueDate < today();

      const statusRef = getDropdownRef('rd-status-' + t.id);
      const assigneeRef = getDropdownRef('rd-assignee-' + t.id);
      const movePhaseRef = getDropdownRef('rd-movephase-' + t.id);

      // Status icon
      let statusIcon, statusColor;
      if (t.status === 'done') { statusIcon = '\u2713'; statusColor = '#22C55E'; }
      else if (blocked) { statusIcon = '\uD83D\uDD12'; statusColor = '#9CA3AF'; }
      else if (t.status === 'in-progress') { statusIcon = '\u25CF'; statusColor = '#5B7CF5'; }
      else if (t.status === 'en-revision') { statusIcon = '\u25C8'; statusColor = '#EAB308'; }
      else { statusIcon = '\u25CB'; statusColor = '#9CA3AF'; }

      // Row background
      let rowBg = '';
      if (t.status === 'in-progress') rowBg = 'bg-blue-50/40';

      const rdIsDragOver = rdDragOverId === t.id && rdDragId !== t.id;
      const rdIsDragging = rdDragId === t.id;

      return (
        <div key={t.id} className={`group ${blocked ? 'opacity-50' : ''} ${rdIsDragging ? 'drag-ghost' : ''}`}>
          {/* Drop indicator top */}
          {rdIsDragOver && rdDragOverHalf === 'top' && <div className="drag-indicator" />}
          {/* Main row - CSS Grid for consistent alignment */}
          <div
            className={`hover:bg-gray-50 cursor-pointer ${rowBg} hidden md:grid grid-cols-[20px_16px_20px_1fr_90px_80px_30px] items-center gap-1 py-[7px] px-3`}
            onClick={() => setExpandedTasks(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
            onDragOver={(e) => rdHandleDragOver(e, t)}
            onDrop={(e) => rdHandleDrop(e, t, sortedGroup)}
            onDragLeave={() => { if (rdDragOverId === t.id) setRdDragOverId(null); }}
          >
            {/* Col 0: Drag handle — solo tareas activas */}
            {rdCanDrag(t) ? (
              <div
                className="flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity text-gray-300 text-[14px] select-none"
                draggable
                onDragStart={(e) => rdHandleDragStart(e, t)}
                onDragEnd={rdHandleDragEnd}
                title="Arrastrar para reordenar"
              >{'\u2630'}</div>
            ) : <div />}

            {/* Col 1: Status dot — clickable */}
            <div
              ref={el => statusRef.current = el}
              className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] cursor-pointer shrink-0 select-none"
              style={{ background: statusColor + '15', color: statusColor, border: `1.5px solid ${statusColor}` }}
              onClick={(e) => { e.stopPropagation(); setOpenDropdown('rd-status-' + t.id); }}
              title={TASK_STATUS[t.status]?.label || 'Estado'}
            >{statusIcon}</div>
            <Dropdown
              open={openDropdown === 'rd-status-' + t.id}
              onClose={() => setOpenDropdown(null)}
              anchorRef={statusRef}
              items={Object.entries(TASK_STATUS).filter(([k]) => k !== 'blocked' && k !== 'retrasadas').map(([k, v]) => ({ label: v.label, icon: v.icon, iconColor: v.color, onClick: () => updateTask(t.id, { status: k }) }))}
            />

            {/* Col 2: Tree connector — hidden on mobile */}
            <span className="text-gray-300 text-[11px] text-center select-none max-md:hidden">{isLast ? '\u2514' : '\u251C'}</span>

            {/* Col 3: Task name (flexible) — on mobile this is the main content area */}
            <div className="max-md:flex-1 max-md:min-w-0 max-md:flex-wrap" style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
              {editingTitle === t.id ? (
                <input
                  className="w-full border border-blue-400 rounded py-0.5 px-1.5 text-[13px] font-sans outline-none"
                  value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  onBlur={() => { updateTask(t.id, { title: editTitleValue.trim() || t.title }); setEditingTitle(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingTitle(null); }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span
                  className={`text-[13px] leading-tight max-md:text-[12px] max-md:whitespace-normal max-md:break-words ${t.status === 'done' ? 'text-text3' : 'text-gray-800'} ${t.isClientTask ? 'font-semibold' : 'font-medium'}`}
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
                  onDoubleClick={(e) => { e.stopPropagation(); setEditingTitle(t.id); setEditTitleValue(t.title); }}
                >
                  {t.title}
                </span>
              )}
              {t.isClientTask && (
                <span className="w-[14px] h-[14px] rounded-full flex items-center justify-center text-[7px] font-bold text-white bg-orange-400" style={{ flexShrink: 0 }} title="Tarea del cliente">C</span>
              )}
              {hasDesc && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" style={{ flexShrink: 0 }} title="Tiene descripción" />}
              {t.dueDate && (
                <span className={`text-[9px] font-medium max-md:hidden ${isOverdue ? 'text-red-500' : 'text-gray-400'}`} style={{ flexShrink: 0, whiteSpace: 'nowrap' }} title={`Vence: ${t.dueDate}`}>
                  {isOverdue ? '\u26A0' : '\uD83D\uDCC5'} {fmtDate(t.dueDate)}
                </span>
              )}
            </div>

            {/* Col 4: Assignee (90px fixed) — hidden on mobile */}
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
                <div className="max-md:hidden" style={{ display: 'flex', alignItems: 'center', gap: '3px', minWidth: 0 }}>
                  <div
                    ref={el => assigneeRef.current = el}
                    className="cursor-pointer"
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}
                    onClick={(e) => { e.stopPropagation(); setOpenDropdown('rd-assignee-' + t.id); }}
                  >
                    {assigneeMembers.length > 0 ? (
                      <div className="flex items-center" style={{ direction: 'ltr' }}>
                        {assigneeMembers.slice(0, 2).map((am, ai) => (
                          <TeamAvatar key={am.id} member={am} size={24} className="border-2 border-white" style={{ marginLeft: ai > 0 ? '-8px' : '0', zIndex: 2 - ai }} />
                        ))}
                        {assigneeMembers.length > 2 && (
                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold bg-gray-200 text-gray-600 border-2 border-white" style={{ marginLeft: '-8px', zIndex: 0 }}>+{assigneeMembers.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] bg-gray-100 text-gray-400 opacity-0 group-hover:opacity-100" title="Asignar">+</span>
                    )}
                  </div>
                  <Dropdown
                    open={openDropdown === 'rd-assignee-' + t.id}
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
                </div>
              );
            })()}

            {/* Col 5: Time display (80px fixed) — hidden on mobile */}
            <div className="max-md:hidden" style={{ textAlign: 'right', minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
              {editingEstDays === t.id ? (
                <input
                  type="number"
                  className="w-[50px] border border-blue-400 rounded py-[2px] px-1 text-[10px] font-sans outline-none text-right"
                  value={estDaysValue}
                  onChange={(e) => setEstDaysValue(e.target.value)}
                  onBlur={() => { const v = parseFloat(estDaysValue); if (!isNaN(v) && v > 0) updateTask(t.id, { estimatedDays: v }); setEditingEstDays(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingEstDays(null); }}
                  autoFocus
                  step="0.5"
                  min="0.1"
                />
              ) : (
                <span
                  className="cursor-pointer rounded px-1 py-[1px] hover:bg-gray-100"
                  onClick={() => { setEditingEstDays(t.id); setEstDaysValue(est || ''); }}
                  title="Click para editar estimado"
                >
                  {est ? (
                    <span className="text-[10px]">
                      {elapsed > 0 ? (
                        <span className="font-semibold" style={{ color: elapsed >= est * 2 ? '#EF4444' : elapsed > est ? '#F97316' : '#22C55E' }}>
                          {'\u23F1'} {elapsed}d <span className="text-gray-300 font-normal">/ {est}d</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">{est}d est.</span>
                      )}
                    </span>
                  ) : elapsed > 0 ? (
                    <span className="text-[10px] text-blue-500 font-semibold">{'\u23F1'} {elapsed}d</span>
                  ) : (
                    <span className="text-[10px] text-gray-300 opacity-0 group-hover:opacity-100">+ est.</span>
                  )}
                </span>
              )}
            </div>

            {/* Col 6: Actions (30px fixed) — hidden on mobile */}
            <div className="max-md:hidden" style={{ display: 'flex', alignItems: 'center', gap: '1px', minWidth: 0 }}>
              {/* Move phase */}
              <div
                ref={el => movePhaseRef.current = el}
                className="cursor-pointer opacity-0 group-hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); setOpenDropdown('rd-movephase-' + t.id); }}
                title="Mover a otra fase"
              >
                <span className="text-[10px] py-[2px] px-0.5 rounded hover:bg-gray-200 text-gray-400">{'\u2194'}</span>
              </div>
              <Dropdown
                open={openDropdown === 'rd-movephase-' + t.id}
                onClose={() => setOpenDropdown(null)}
                anchorRef={movePhaseRef}
                items={Object.entries(allPh).map(([k, v]) => ({ label: v.label, icon: '\u25CF', iconColor: v.color, onClick: () => updateTask(t.id, { phase: k, isRoadmapTask: true }) }))}
              />

              {/* Dependencies */}
              <button
                className="text-[10px] py-[2px] px-0.5 rounded hover:bg-blue-50 text-gray-400 bg-transparent border-none cursor-pointer font-sans opacity-0 group-hover:opacity-100 hover:text-blue-500"
                onClick={(e) => { e.stopPropagation(); setDepsModal(t.id); }}
                title="Dependencias"
              >{'\uD83D\uDD17'}</button>

              {/* Delete */}
              <button
                className="text-[10px] py-[2px] px-0.5 rounded hover:bg-red-50 text-gray-400 bg-transparent border-none cursor-pointer font-sans opacity-0 group-hover:opacity-100 hover:text-red-500"
                onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}
              >x</button>
            </div>
          </div>

          {/* Mobile task row — uses separate ref to avoid overwriting desktop ref */}
          {(() => {
            const mobStatusRef = getDropdownRef('mob-rd-status-' + t.id);
            return (
          <div
            className={`md:hidden hover:bg-gray-50 cursor-pointer ${rowBg} flex items-start gap-2 py-2.5 px-3`}
            onClick={() => setExpandedTasks(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
          >
            <div
              ref={el => mobStatusRef.current = el}
              className="w-[20px] h-[20px] rounded-full flex items-center justify-center text-[10px] cursor-pointer shrink-0 mt-[1px]"
              style={{ background: statusColor + '15', color: statusColor, border: `1.5px solid ${statusColor}` }}
              onClick={(e) => { e.stopPropagation(); setOpenDropdown('mob-rd-status-' + t.id); }}
            >{statusIcon}</div>
            <Dropdown
              open={openDropdown === 'mob-rd-status-' + t.id}
              onClose={() => setOpenDropdown(null)}
              anchorRef={mobStatusRef}
              items={Object.entries(TASK_STATUS).filter(([k]) => k !== 'blocked' && k !== 'retrasadas').map(([k, v]) => ({ label: v.label, icon: v.icon, iconColor: v.color, onClick: () => updateTask(t.id, { status: k }) }))}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-gray-800 leading-tight break-words">
                {t.title}
                {t.isClientTask && <span className="ml-1 w-[14px] h-[14px] rounded-full inline-flex items-center justify-center text-[7px] font-bold text-white bg-orange-400 align-middle">C</span>}
                {hasDesc && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-blue-400 inline-block align-middle" />}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                {est && elapsed > 0 && (
                  <span className="text-[9px] font-semibold py-[1px] px-1.5 rounded" style={{ color: elapsed >= est * 2 ? '#EF4444' : elapsed > est ? '#F97316' : '#22C55E', background: elapsed >= est * 2 ? '#FEF2F2' : elapsed > est ? '#FFF7ED' : '#ECFDF5' }}>
                    {'\u23F1'} {elapsed}d/{est}d
                  </span>
                )}
                {(() => {
                  const aNames = t.assignee ? t.assignee.split(',').map(s => s.trim()).filter(Boolean) : [];
                  const aMembers = aNames.map(name => TEAM.find(m => m.name.toLowerCase() === name.toLowerCase() || m.id === name)).filter(Boolean);
                  if (aMembers.length === 0) return null;
                  return (
                    <div className="flex items-center">
                      {aMembers.slice(0, 2).map((am, ai) => (
                        <TeamAvatar key={am.id} member={am} size={18} className="border border-white" style={{ marginLeft: ai > 0 ? '-4px' : '0' }} />
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
            );
          })()}

          {/* Blocked warning - spans full row below */}
          {blocked && blockingNames.length > 0 && (
            <div className="text-[10px] text-red-500 pl-[52px] pb-1 leading-tight max-md:pl-8">Bloqueada por: {blockingNames.join(', ')}</div>
          )}

          {/* Expanded detail area */}
          {isExpanded && (
            <div className="pl-[52px] pr-3 pb-2.5 pt-1 bg-gray-50/50 max-md:pl-3 max-md:pr-3">
              {/* Description */}
              <textarea
                className="w-full border border-gray-200 rounded-md py-2 px-2.5 text-xs font-sans resize-y min-h-[50px] outline-none bg-white focus:border-blue-400 mb-2"
                placeholder="Descripción de la tarea..."
                defaultValue={t.description || ''}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => updateTask(t.id, { description: e.target.value })}
              />

              {/* Inline controls row */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Status dropdown */}
                <div
                  ref={el => getDropdownRef('rd-status2-' + t.id).current = el}
                  className="cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setOpenDropdown('rd-status2-' + t.id); }}
                >
                  <span className="text-[10px] py-[3px] px-2 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1">
                    <span style={{ color: TASK_STATUS[t.status]?.color }}>{TASK_STATUS[t.status]?.icon}</span> {TASK_STATUS[t.status]?.label || 'Estado'}
                  </span>
                </div>
                <Dropdown
                  open={openDropdown === 'rd-status2-' + t.id}
                  onClose={() => setOpenDropdown(null)}
                  anchorRef={getDropdownRef('rd-status2-' + t.id)}
                  items={Object.entries(TASK_STATUS).filter(([k]) => k !== 'blocked' && k !== 'retrasadas').map(([k, v]) => ({ label: v.label, icon: v.icon, iconColor: v.color, onClick: () => updateTask(t.id, { status: k }) }))}
                />

                {/* Due date input (FIX 6) */}
                <div className="inline-flex items-center gap-1 text-[10px]" onClick={(e) => e.stopPropagation()}>
                  <span className="text-gray-400">{'\uD83D\uDCC5'}</span>
                  <input
                    type="date"
                    className="border border-gray-200 rounded py-[2px] px-1.5 text-[10px] font-sans outline-none bg-white focus:border-blue-400 w-[110px]"
                    value={t.dueDate || ''}
                    onChange={(e) => updateTask(t.id, { dueDate: e.target.value || null })}
                  />
                  {t.dueDate && (
                    <button className="text-gray-400 hover:text-red-400 bg-transparent border-none cursor-pointer text-[10px] font-sans" onClick={() => updateTask(t.id, { dueDate: null })}>{'\u2715'}</button>
                  )}
                </div>

                {/* Delete */}
                <button
                  className="text-[10px] py-[3px] px-2 rounded border border-gray-200 bg-white text-red-400 hover:bg-red-50 hover:text-red-500 cursor-pointer font-sans ml-auto border-none"
                  onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}
                >Eliminar</button>
              </div>
            </div>
          )}
          {/* Drop indicator bottom */}
          {rdIsDragOver && rdDragOverHalf === 'bottom' && <div className="drag-indicator" />}
        </div>
      );
    };

    return (
      <div>
        {/* Filters */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[11px] text-gray-500 font-semibold">Encargado:</span>
          <select
            className="text-[11px] py-1 px-2 border border-gray-200 rounded-md bg-white text-gray-700 font-sans outline-none cursor-pointer"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="all">Todos</option>
            {assigneeList.map(m => (
              <option key={m.id} value={m.name}>{m.name}</option>
            ))}
          </select>
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer select-none">
            <input type="checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} className="cursor-pointer" /> Ocultar completadas
          </label>
        </div>

        {/* Phase sections */}
        <div className="space-y-2">
          {phaseGroups.map(({ phaseKey, phInfo, phaseTasks, totalCount, doneCount, allDone }) => {
            const collapsed = isCollapsed(phaseKey, allDone);
            // Sort: active (backlog+in-progress+revision) → blocked → done
            // Within each group, sort by manual position
            const getGroup = (t) => {
              if (t.status === 'done') return 2;
              if (isTaskBlocked(t)) return 1;
              return 0; // backlog, in-progress, en-revision = all active
            };
            const sortedTasks = [...phaseTasks].sort((a, b) => {
              const ga = getGroup(a), gb = getGroup(b);
              if (ga !== gb) return ga - gb;
              return (a.position ?? 0) - (b.position ?? 0);
            });

            return (
              <div key={phaseKey} className={`rounded-lg overflow-hidden bg-white border ${rdDragOverPhase === phaseKey ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-100'}`} style={{ borderLeft: `3px solid ${phInfo.color}` }}>
                {/* Phase header — also a drop target */}
                <div
                  className={`flex items-center gap-2 py-2.5 px-3 cursor-pointer select-none hover:bg-gray-50 group/phase transition-colors ${rdDragOverPhase === phaseKey ? 'bg-blue-50' : ''}`}
                  onClick={() => togglePhase(phaseKey)}
                  onDragOver={(e) => rdHandleDragOverPhase(e, phaseKey)}
                  onDrop={(e) => rdHandleDropOnPhase(e, phaseKey)}
                  onDragLeave={() => { if (rdDragOverPhase === phaseKey) setRdDragOverPhase(null); }}
                >
                  <span className="text-[11px] text-gray-400 shrink-0">{collapsed ? '\u25B6' : '\u25BC'}</span>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: phInfo.color }} />
                  {editingPhase === phaseKey ? (
                    <input
                      className="text-[13px] font-bold border border-blue rounded-md py-0.5 px-2 outline-none bg-white font-sans"
                      style={{ color: phInfo.color, width: Math.max(120, editPhaseValue.length * 9) }}
                      value={editPhaseValue}
                      onChange={(e) => setEditPhaseValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => {
                        if (editPhaseValue.trim()) {
                          const isCustom = (c.customPhases || []).some(cp => cp.id === phaseKey);
                          if (isCustom) {
                            const newCustomPhases = (c.customPhases || []).map(cp => cp.id === phaseKey ? { ...cp, label: editPhaseValue.trim() } : cp);
                            updateClient(c.id, { customPhases: newCustomPhases });
                          } else {
                            const overrides = { ...(c.phaseNameOverrides || {}), [phaseKey]: editPhaseValue.trim() };
                            updateClient(c.id, { phaseNameOverrides: overrides });
                          }
                        }
                        setEditingPhase(null);
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingPhase(null); }}
                      autoFocus
                    />
                  ) : (
                    <span
                      className="text-[13px] font-bold cursor-text hover:bg-gray-100 py-0.5 px-1 rounded"
                      style={{ color: phInfo.color }}
                      onDoubleClick={(e) => { e.stopPropagation(); setEditingPhase(phaseKey); setEditPhaseValue(phInfo.label); }}
                    >{phInfo.label}</span>
                  )}
                  <span className="text-[11px] font-semibold text-gray-400">({doneCount}/{totalCount})</span>
                  {allDone && <span className="text-green-500 text-sm">{'\u2713'}</span>}
                  {/* Phase deadline */}
                  {(() => {
                    const deadline = (c.phaseDeadlines || {})[phaseKey];
                    const isOverdue = deadline && !allDone && deadline < today();
                    if (editingDeadline === phaseKey) {
                      return (
                        <input
                          type="date"
                          className="border border-blue-400 rounded py-[2px] px-1.5 text-[10px] font-sans outline-none bg-white ml-1"
                          defaultValue={deadline || ''}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => {
                            const val = e.target.value || null;
                            const deadlines = { ...(c.phaseDeadlines || {}), [phaseKey]: val };
                            if (!val) delete deadlines[phaseKey];
                            updateClient(c.id, { phaseDeadlines: deadlines });
                            setEditingDeadline(null);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingDeadline(null); }}
                        />
                      );
                    }
                    if (deadline) {
                      return (
                        <span
                          className={`text-[10px] font-medium ml-1 px-1.5 py-[1px] rounded cursor-pointer hover:bg-gray-100 ${isOverdue ? 'text-red-500 bg-red-50' : 'text-gray-400'}`}
                          onClick={(e) => { e.stopPropagation(); setEditingDeadline(phaseKey); }}
                          title="Click para cambiar deadline"
                        >{'\uD83D\uDCC5'} {fmtDate(deadline)}</span>
                      );
                    }
                    return (
                      <span
                        className="text-[10px] text-gray-300 ml-1 px-1 py-[1px] rounded cursor-pointer hover:text-gray-500 hover:bg-gray-100 opacity-0 group-hover/phase:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); setEditingDeadline(phaseKey); }}
                        title="Agregar deadline"
                      >{'\uD83D\uDCC5'}</span>
                    );
                  })()}
                  {/* Delete phase — custom phases only */}
                  {(c.customPhases || []).some(cp => cp.id === phaseKey) && (
                    <button
                      className="ml-auto text-[10px] text-gray-400 bg-transparent border-none cursor-pointer font-sans py-0.5 px-1.5 rounded hover:text-red-500 hover:bg-red-50 opacity-0 group-hover/phase:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        const tasksInPhase = clientTasks.filter(t => t.phase === phaseKey);
                        setDeletePhaseConfirm({ phaseKey, label: phInfo.label, color: phInfo.color, taskCount: tasksInPhase.length });
                      }}
                      title="Eliminar fase"
                    >{'\uD83D\uDDD1'} Eliminar</button>
                  )}
                </div>

                {/* Task rows */}
                {!collapsed && (
                  <div className="border-t border-gray-50">
                    {sortedTasks.map((t, idx) => renderTaskRow(t, idx === sortedTasks.length - 1, sortedTasks))}

                    {/* Add task inline */}
                    {addingToPhase === phaseKey ? (
                      <div className="py-1.5 px-3 pl-[52px]">
                        <input
                          className="w-full border border-blue-300 rounded py-1.5 px-2.5 text-[12px] font-sans outline-none bg-white"
                          placeholder="Nombre de la tarea..."
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') handlePhaseTaskAdd(phaseKey, e.target.value); if (e.key === 'Escape') setAddingToPhase(null); }}
                          onBlur={(e) => { if (e.target.value.trim()) handlePhaseTaskAdd(phaseKey, e.target.value); else setAddingToPhase(null); }}
                        />
                      </div>
                    ) : (
                      <button
                        className="w-full text-left text-[11px] text-gray-400 py-1.5 px-3 pl-[52px] bg-transparent border-none cursor-pointer font-sans hover:text-blue-500 hover:bg-gray-50"
                        onClick={() => setAddingToPhase(phaseKey)}
                      >+ Agregar tarea</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Add custom phase button */}
          <button
            className="w-full text-left text-[12px] text-gray-400 py-2.5 px-3 bg-transparent border border-dashed border-gray-200 rounded-lg cursor-pointer font-sans hover:text-blue-500 hover:border-blue-300 hover:bg-blue-50/30 mt-1"
            onClick={() => { setNewPhaseName(''); setNewPhaseColor('#5B7CF5'); setAddPhaseModal(true); }}
          >+ Agregar fase</button>
        </div>
      </div>
    );
  };

  // ===== FALLBACK: Old step-based roadmap =====
  const renderOldRoadmap = () => {
    let timelineItems = PROCESS_STEPS.map((s, i) => ({ s, i, cs: c.steps[i] || { status: 'pending', startDate: '', endDate: '', responsible: '', notes: '' }, isCustom: false }));
    const customs = c.customSteps || [];
    customs.forEach((cs, ci) => {
      timelineItems.push({ s: { id: 'custom_' + ci, name: cs.name, phase: cs.phase || 'auditoria', days: cs.days || 7, client: false, dependsOn: [] }, i: PROCESS_STEPS.length + ci, cs, isCustom: true, customIdx: ci });
    });

    const oldPhaseGroups = [];
    let currentPhaseKey = '';
    timelineItems.forEach(item => {
      if (item.s.phase !== currentPhaseKey) {
        currentPhaseKey = item.s.phase;
        oldPhaseGroups.push({ phase: item.s.phase, items: [item] });
      } else {
        oldPhaseGroups[oldPhaseGroups.length - 1].items.push(item);
      }
    });

    return (
      <div className="mb-4">
        <div className="text-[11px] text-gray-400 mb-2 italic">Vista simplificada (cliente sin roadmap de tareas)</div>
        {oldPhaseGroups.map(pg => {
          const phInfo = allPh[pg.phase] || { label: pg.phase, color: '#5B7CF5' };
          return (
            <div key={pg.phase} className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 py-[4px] px-2.5 rounded-full text-[11px] font-bold text-white" style={{ background: phInfo.color }}>{phInfo.label}</span>
              </div>
              <div className="rounded-lg overflow-hidden" style={{ borderLeft: `3px solid ${phInfo.color}` }}>
                {pg.items.map(({ s, i, cs, isCustom }) => {
                  const cfg = STATUS[cs.status] || STATUS.pending;
                  const isCompleted = cs.status === 'completed';
                  let d = null;
                  if (cs.startDate && cs.endDate) d = daysBetween(cs.startDate, cs.endDate);
                  else if (cs.startDate && cs.status !== 'pending') d = daysAgo(cs.startDate);
                  return (
                    <div key={i} className="flex items-center gap-2 py-[6px] px-3 hover:bg-gray-50">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.color }} />
                      <span className={`text-[13px] flex-1 ${isCompleted ? 'text-gray-400' : 'text-gray-800'}`}>{isCustom ? s.name : getStepNameForClient(c, i)}</span>
                      {s.client && <span className="w-[14px] h-[14px] rounded-full flex items-center justify-center text-[7px] font-bold text-white bg-orange-400" title="Tarea del cliente">C</span>}
                      {d !== null && <span className="text-[10px] text-gray-400">{d}d</span>}
                      {cs.responsible && <span className="text-[10px] text-gray-400">{cs.responsible}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const sentEmoji = { positive: '\uD83D\uDE0A', neutral: '\uD83D\uDE10', negative: '\uD83D\uDE1F' };

  // Merge brain points into history
  const brainPoints = [];
  (c.feedback || []).forEach(f => {
    if (f.keypoints) f.keypoints.split('\n').filter(k => k.trim()).forEach(k => brainPoints.push({ text: k.trim(), source: 'Llamada ' + fmtDate(f.date), type: 'call' }));
  });
  (c.clientFeedbacks || []).forEach((f, fi) => {
    const nf = normalizeFeedback(f, fi);
    nf.items.forEach(item => {
      brainPoints.push({ text: item.text, source: (SOURCE_LABELS[nf.source] || nf.source) + ' ' + fmtDate(nf.date || ''), type: 'request' });
    });
  });
  if (bn) brainPoints.push({ text: bn, source: 'Auto-detectado', type: 'bottleneck' });
  if (c.notes) brainPoints.push({ text: c.notes, source: 'Notas generales', type: 'note' });
  const typeIcons = { call: '\uD83C\uDFA7', complaint: '\u26A0\uFE0F', problem: '\u26A0\uFE0F', suggestion: '\uD83D\uDCA1', request: '\uD83D\uDCCC', bottleneck: '\u26D4', note: '\uD83D\uDCDD', step: '\uD83D\uDEE4\uFE0F' };

  // Total roadmap tasks for progress display
  const totalRoadmap = useNewSystem ? roadmapTasks.length : c.steps.length;
  const doneRoadmap = useNewSystem ? roadmapTasks.filter(t => t.status === 'done').length : c.steps.filter(s => s.status === 'completed').length;

  return (
    <div>
      <button className="inline-flex items-center gap-1.5 text-text2 text-[13px] cursor-pointer mb-4 py-1.5 px-2.5 rounded-md bg-transparent border-none font-sans hover:text-blue hover:bg-blue-bg" onClick={() => setSelectedId(null)}>
        &larr; Volver
      </button>

      {/* Hero */}
      <div className="bg-white border border-border rounded-xl p-6 mb-5 max-md:p-4 max-md:rounded-xl max-md:mb-3">
        <div className="flex items-start gap-4 max-md:gap-3">
          {c.avatarUrl ? (
            <img src={c.avatarUrl} alt={c.name} className="w-[52px] h-[52px] rounded-full object-cover shrink-0 max-md:w-[40px] max-md:h-[40px]" />
          ) : (
            <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center font-extrabold text-xl shrink-0 max-md:w-[40px] max-md:h-[40px] max-md:text-base" style={{ background: c.color + '15', color: c.color }}>{initials(c.name)}</div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-xl font-extrabold tracking-tight max-md:text-[17px]">{c.name}</div>
              <span
                ref={el => getDropdownRef('client-prio').current = el}
                className="inline-flex items-center gap-1 py-[3px] px-2.5 rounded-full text-[10px] font-semibold cursor-pointer hover:opacity-80"
                style={{ background: pcfg.color + '12', color: pcfg.color }}
                onClick={() => setOpenDropdown('client-prio')}
              >{pcfg.label}</span>
              <Dropdown
                open={openDropdown === 'client-prio'}
                onClose={() => setOpenDropdown(null)}
                anchorRef={getDropdownRef('client-prio')}
                items={Object.entries(getAllPriorityLabels()).map(([k, v]) => ({ label: v.label, iconColor: v.color, icon: '\u25CF', onClick: () => { updateClient(c.id, { priority: parseInt(k) }); setOpenDropdown(null); } }))}
              />
              <StatusPill text={pill.text} pillClass={pill.pillClass} />
            </div>
            <div className="text-[13px] text-text2 mt-0.5 max-md:text-[12px]">{c.company}</div>
            <div className="flex gap-4 mt-2.5 flex-wrap max-md:gap-2 max-md:mt-2">
              <span className="text-xs text-text2 flex items-center gap-1 max-md:text-[11px]">{'\uD83D\uDCE6'} {c.service || '\u2014'}</span>
              <span className="text-xs text-text2 flex items-center gap-1 max-md:text-[11px]">
                {'\uD83D\uDCC5'}{' '}
                {editingStartDate ? (
                  <input type="date" className="border border-blue rounded py-[2px] px-1.5 text-xs font-sans outline-none" defaultValue={c.startDate || ''} autoFocus onBlur={(e) => handleInlineStartDate(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />
                ) : (
                  <span className="cursor-pointer py-[1px] px-1 rounded hover:bg-surface2" onClick={() => setEditingStartDate(true)}>{fmtDate(c.startDate)}</span>
                )}{' '}
                {'\u00B7'} Día {days}
              </span>
              {ct > 0 && <span className="text-xs text-blue flex items-center gap-1 max-md:text-[11px]">{'\uD83D\uDDD2'} {ct} tareas</span>}
            </div>
          </div>
          <div className="flex gap-2 ml-auto shrink-0">
            <button className="py-1.5 px-2.5 rounded-md border border-border bg-white text-text2 text-xs cursor-pointer font-sans hover:bg-surface2 hover:text-text max-md:py-1 max-md:px-2 max-md:text-[11px]" onClick={openEditModal}>Editar</button>
            {canDeleteClient && (
              <button
                className="py-1.5 px-2.5 rounded-md border border-red-200 bg-white text-red-500 text-xs cursor-pointer font-sans hover:bg-red-50 hover:border-red-300 max-md:py-1 max-md:px-2 max-md:text-[11px]"
                onClick={() => { setDeleteClientConfirmName(''); setDeleteClientModal(true); }}
                title="Eliminar cliente y todas sus tareas"
              >Eliminar</button>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-[11px] text-text2"><span>Progreso</span><span>{pct}% {'\u00B7'} {doneRoadmap}/{totalRoadmap}</span></div>
          <div className="h-[5px] bg-surface3 rounded overflow-hidden mt-1.5">
            <div className="h-full rounded bg-blue" style={{ width: pct + '%' }} />
          </div>
        </div>

        {bn && (
          <div className="mt-3 bg-red-bg border border-[#fecaca] rounded-md py-2 px-3 text-xs text-red">{'\u26A1'} {bn}</div>
        )}
      </div>

      {/* Ver roadmap — CTA full width */}
      <button
        className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl p-5 mb-4 flex items-center justify-between hover:from-blue-600 hover:to-blue-700 transition-all shadow-sm hover:shadow-md font-sans cursor-pointer border-none max-md:p-4"
        onClick={() => {
          setTaskClientFilter(c.id);
          setView('tasks');
        }}
      >
        <div className="text-left">
          <div className="text-[11px] uppercase tracking-wider opacity-80 font-semibold">Roadmap, Timeline y Tareas</div>
          <div className="text-[16px] font-bold mt-0.5">Ver roadmap completo</div>
          <div className="text-[11px] opacity-80 mt-0.5">{pct}% completado &middot; {doneRoadmap}/{totalRoadmap} tareas</div>
        </div>
        <span className="text-2xl">{'\u2192'}</span>
      </button>

      {/* Row 1: Links + Publicidad (2-col, balanced) */}
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        {/* Links del cliente — Drive, docs, etc. Agrupados por categoría */}
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="py-3 px-4 border-b border-border text-[13px] font-bold flex items-center justify-between">
            <span className="inline-flex items-center gap-2">
              <span className="w-6 h-6 rounded-md flex items-center justify-center text-[13px]" style={{ background: '#EEF2FF', color: '#5B7CF5' }}>{'\uD83D\uDD17'}</span>
              Links y recursos
            </span>
            <button
              className="bg-transparent border-none text-text2 cursor-pointer text-xs py-1 px-2 rounded hover:bg-surface2 font-sans"
              onClick={() => { setLinkForm({ label: '', url: '', category: 'folder' }); setEditingLinkIdx(null); setLinkModal(true); }}
            >
              + Nuevo
            </button>
          </div>
          <div className="py-3 px-4">
            {!(c.links || []).length ? (
              <div className="text-center text-text3 text-xs py-6">
                Sin links registrados
                <div className="text-[10px] text-text3 mt-1">Agregá carpetas de Drive, docs, landings, PDFs, etc.</div>
              </div>
            ) : (() => {
              // Group links by category
              const grouped = {};
              (c.links || []).forEach((link, originalIdx) => {
                const cat = link.category || 'other';
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push({ ...link, originalIdx });
              });
              return (
                <div className="space-y-3">
                  {LINK_CATEGORY_ORDER.filter(cat => grouped[cat]?.length).map(cat => {
                    const catInfo = LINK_CATEGORIES[cat];
                    return (
                      <div key={cat}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: catInfo.color }}>
                            {catInfo.icon} {catInfo.label}
                          </span>
                          <span className="text-[9px] text-text3">({grouped[cat].length})</span>
                        </div>
                        <div className="space-y-0.5">
                          {grouped[cat].map(link => (
                            <div
                              key={link.originalIdx}
                              className="group/link flex items-center gap-2.5 py-1.5 px-2.5 rounded-md hover:bg-blue-50/50 border border-transparent hover:border-blue-100 transition-colors"
                            >
                              <span className="text-sm shrink-0">{catInfo.icon}</span>
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex-1 min-w-0 text-[12px] text-gray-800 hover:text-blue-600 no-underline font-sans font-medium truncate"
                              >
                                {link.label || link.url}
                              </a>
                              <button
                                className="text-[10px] text-gray-300 hover:text-blue-500 bg-transparent border-none cursor-pointer py-1 px-1.5 rounded opacity-0 group-hover/link:opacity-100 transition-opacity font-sans"
                                onClick={() => {
                                  setLinkForm({ label: link.label || '', url: link.url || '', category: link.category || 'other' });
                                  setEditingLinkIdx(link.originalIdx);
                                  setLinkModal(true);
                                }}
                                title="Editar"
                              >
                                {'\u270F\uFE0F'}
                              </button>
                              <button
                                className="text-[10px] text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer py-1 px-1.5 rounded opacity-0 group-hover/link:opacity-100 transition-opacity font-sans"
                                onClick={() => {
                                  const newLinks = [...(c.links || [])];
                                  newLinks.splice(link.originalIdx, 1);
                                  updateClient(c.id, { links: newLinks });
                                }}
                                title="Eliminar"
                              >
                                {'\u2715'}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Publicidad (Meta Ads) */}
        {c.metaAds && c.metaAds.length > 0 && c.metaAds.some(a => a.status !== 'interna') && (() => {
            const m = c.metaMetrics || {};
            const isActive = m.adsActive;
            const curr = m.currency || 'USD';
            const cs = curr === 'EUR' ? '\u20AC' : curr === 'MXN' ? 'MX$' : '$';
            return (
              <div className="bg-white border border-border rounded-xl overflow-hidden mb-3">
                <div className="py-3 px-4 border-b border-border text-[13px] font-bold flex items-center justify-between">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md flex items-center justify-center text-[13px]" style={{ background: '#FFF7ED', color: '#F97316' }}>{'\uD83D\uDCE3'}</span>
                    Publicidad
                  </span>
                  <span className={`inline-flex items-center gap-1 py-[2px] px-2 rounded-xl text-[9px] font-bold ml-auto ${isActive ? 'bg-green-bg text-[#16A34A]' : 'bg-surface2 text-text3'}`}>{isActive ? '\u25CF Activa' : '\u25CB Inactiva'}</span>
                </div>
                <div className="py-3 px-4">
                  {isActive && m.totalSpend7d ? (
                    <>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <div className="text-center py-2 px-1 bg-surface2 rounded-md"><div className="text-base font-extrabold tracking-tight">{cs}{m.totalSpend7d?.toFixed(0) || 0}</div><div className="text-[9px] text-text3 uppercase tracking-[0.5px] mt-0.5">Inv. 7d</div></div>
                        <div className="text-center py-2 px-1 bg-surface2 rounded-md"><div className="text-base font-extrabold tracking-tight text-blue">{m.totalConversions7d || 0}</div><div className="text-[9px] text-text3 uppercase tracking-[0.5px] mt-0.5">Leads 7d</div></div>
                        <div className="text-center py-2 px-1 bg-surface2 rounded-md"><div className="text-base font-extrabold tracking-tight" style={{ color: m.avgCpl7d > 15 ? 'var(--color-red)' : 'var(--color-green)' }}>{cs}{m.avgCpl7d?.toFixed(2) || '\u2014'}</div><div className="text-[9px] text-text3 uppercase tracking-[0.5px] mt-0.5">CPL prom.</div></div>
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-text2 py-1 border-b border-border"><span>Gasto ayer</span><strong>{cs}{m.spendYesterday?.toFixed(2) || '0'}</strong></div>
                      <div className="flex justify-between items-center text-[11px] text-text2 py-1 border-b border-border"><span>Leads ayer</span><strong className="text-blue">{m.conversionsYesterday || 0}</strong></div>
                      <div className="flex justify-between items-center text-[11px] text-text2 py-1 border-b border-border"><span>Impresiones 7d</span><strong>{(m.impressions7d || 0).toLocaleString()}</strong></div>
                      <div className="flex justify-between items-center text-[11px] text-text2 py-1"><span>CTR</span><strong>{m.ctr7d?.toFixed(2) || '\u2014'}%</strong></div>
                      {m.conversionEvent && <div className="mt-1.5"><span className="text-[9px] bg-purple-bg text-purple py-[2px] px-1.5 rounded font-medium">Evento: {m.conversionEvent}</span></div>}
                      <div className="mt-1.5 text-[9px] text-text3">Actualizado: {m.lastUpdated || '\u2014'}</div>
                    </>
                  ) : (
                    m.pauseReason ? <div className="text-[11px] text-red py-2">{'\u26A0'} {m.pauseReason}</div> : <div className="text-center text-text3 text-xs py-3.5">Sin datos de publicidad recientes</div>
                  )}
                  <div className="mt-2.5 border-t border-border pt-2">
                    <div className="text-[10px] font-semibold text-text3 mb-1">Cuentas vinculadas</div>
                    {c.metaAds.filter(a => a.status !== 'interna').map((a, ai) => (
                      <div key={ai} className="text-[11px] py-[3px] flex justify-between items-center">
                        <span>{a.name}</span>
                        <span className={`inline-flex items-center gap-1 py-[2px] px-2 rounded-xl text-[8px] font-bold ${a.status === 'activa' ? 'bg-green-bg text-[#16A34A]' : 'bg-surface2 text-text3'}`}>{a.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
      </div>
      {/* End Row 1 */}

      {/* Row 2: Llamadas + Client Feedback */}
      <div className="grid gap-4 md:grid-cols-2 mb-4">
          {/* Calls */}
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="py-3 px-4 border-b border-border text-[13px] font-bold flex items-center justify-between">
              <span className="inline-flex items-center gap-2">
                <span className="w-6 h-6 rounded-md flex items-center justify-center text-[13px]" style={{ background: '#ECFDF5', color: '#22C55E' }}>{'\uD83D\uDCDE'}</span>
                Llamadas
              </span>
              <button className="bg-transparent border-none text-text2 cursor-pointer text-xs py-1 px-2 rounded hover:bg-surface2 font-sans" onClick={() => { setFbForm({ date: today(), sentiment: 'neutral', text: '', fathomLink: '', keypoints: '', transcription: '' }); setFeedbackModal(true); }}>+ Nueva</button>
            </div>
            <div className="py-3 px-4">
              {!c.feedback.length ? (
                <div className="text-center text-text3 text-xs py-3.5">Sin llamadas registradas</div>
              ) : (
                [...c.feedback].reverse().map((f, fi) => (
                  <div key={fi} className="py-2.5 px-4 border-b border-border last:border-b-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-sm">{sentEmoji[f.sentiment] || ''}</span>
                      <span className="text-[10px] text-text3">{fmtDate(f.date)}</span>
                      {f.fathomLink && <a className="text-[10px] text-blue no-underline ml-auto hover:underline" href={f.fathomLink} target="_blank" rel="noreferrer">{'\uD83C\uDFAC'} Fathom</a>}
                    </div>
                    <div className="text-xs leading-relaxed mb-1">{f.text}</div>
                    {f.keypoints && (
                      <div className="mt-1">
                        {f.keypoints.split('\n').filter(k => k.trim()).map((k, ki) => (
                          <div key={ki} className="text-[11px] text-text2 py-[2px] flex items-start gap-1">
                            <span className="text-blue font-bold shrink-0">{'\u2022'}</span>{k.trim()}
                          </div>
                        ))}
                      </div>
                    )}
                    {f.transcription && (() => {
                      const tKey = c.id + '_' + fi;
                      return (
                        <>
                          <button className="text-[10px] text-text3 cursor-pointer mt-1 bg-transparent border-none font-sans hover:text-blue" onClick={() => setOpenTranscription(prev => ({ ...prev, [tKey]: !prev[tKey] }))}>{'\uD83D\uDCDD'} {openTranscription[tKey] ? 'Ocultar' : 'Ver'} transcripcion</button>
                          {openTranscription[tKey] && <div className="text-[11px] text-text3 bg-surface2 py-2 px-2.5 rounded-md mt-1 max-h-[200px] overflow-y-auto whitespace-pre-wrap leading-relaxed">{f.transcription}</div>}
                        </>
                      );
                    })()}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Client Feedback */}
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="py-3 px-4 border-b border-border text-[13px] font-bold flex items-center justify-between">
              <span className="inline-flex items-center gap-2">
                <span className="w-6 h-6 rounded-md flex items-center justify-center text-[13px]" style={{ background: '#F5F3FF', color: '#8B5CF6' }}>{'\uD83D\uDCAC'}</span>
                Feedback del cliente
              </span>
              <button className="bg-transparent border-none text-text2 cursor-pointer text-xs py-1 px-2 rounded hover:bg-surface2 font-sans" onClick={() => { setCfbForm({ source: 'cliente', callUrl: '', priority: 'normal', currentItem: '', items: [] }); setClientFbModal(true); }}>+ Nuevo</button>
            </div>
            <div className="py-3 px-4">
              {!(c.clientFeedbacks || []).length ? (
                <div className="text-center text-text3 text-xs py-3.5">Sin feedback registrado</div>
              ) : (
                (c.clientFeedbacks || []).map((f, fi) => {
                  const typeLabel = f.type === 'complaint' ? 'Queja' : f.type === 'problem' ? 'Problema' : f.type === 'suggestion' ? 'Sugerencia' : 'Pedido';
                  const typeBg = f.type === 'complaint' ? 'var(--color-red-bg)' : f.type === 'problem' ? 'var(--color-orange-bg)' : 'var(--color-blue-bg)';
                  return (
                    <div key={fi} className="py-2.5 px-4 border-b border-border last:border-b-0 group/fb">
                      <div className="flex items-start gap-1">
                        <div className="text-xs leading-relaxed mb-1 flex-1">{f.text}</div>
                        <button
                          className="text-[10px] text-gray-300 bg-transparent border-none cursor-pointer py-[2px] px-1 rounded hover:text-red-500 hover:bg-red-50 shrink-0 opacity-0 group-hover/fb:opacity-100 transition-opacity"
                          onClick={() => {
                            const newFbs = [...(c.clientFeedbacks || [])];
                            newFbs.splice(fi, 1);
                            updateClient(c.id, { clientFeedbacks: newFbs });
                          }}
                          title="Eliminar feedback"
                        >{'\u2715'}</button>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-text3 flex-wrap">
                        <span className="bg-surface2 py-[1px] px-1.5 rounded font-semibold">{f.source || 'otro'}</span>
                        <span>{f.sourceDetail || ''}</span>
                        <span>{'\uD83D\uDCC5'} {fmtDate(f.date || today())}</span>
                        <span className="py-[1px] px-1.5 rounded" style={{ background: typeBg }}>{typeLabel}</span>
                      </div>
                      {f.comments?.length > 0 && (
                        <div className="mt-1.5 pl-3 border-l-2 border-border">
                          {f.comments.map((cm, ci) => (
                            <div key={ci} className="text-[11px] text-text2 py-[3px]"><strong className="text-text">{cm.user}:</strong> {cm.text} <span className="text-[9px] text-text3">{fmtDate(cm.date)}</span></div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1.5 mt-1.5">
                        <button className="bg-surface2 text-text2 border border-border rounded py-[3px] px-2 cursor-pointer font-sans text-[10px] hover:bg-surface3" onClick={() => addFbComment(fi)}>{'\uD83D\uDCAC'} Comentar</button>
                        {!f.convertedTaskId ? (
                          <button className="bg-blue-bg text-blue border rounded py-[3px] px-2 cursor-pointer font-sans text-[10px] font-semibold hover:bg-blue hover:text-white" style={{ borderColor: 'rgba(91,124,245,0.2)' }} onClick={() => convertFbItemToTask(fi, 0)}>{'\u2192'} Crear tarea</button>
                        ) : (
                          <span className="text-[10px] text-green">{'\u2713'} Tarea creada</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

      </div>
      {/* End Row 2 */}

      {/* Historial del cliente (merged with brain points) — full width at bottom */}
      <div className="bg-white border border-border rounded-xl overflow-hidden mb-4">
            <div className="py-3 px-4 border-b border-border text-[13px] font-bold">
              <span className="inline-flex items-center gap-2">
                <span className="w-6 h-6 rounded-md flex items-center justify-center text-[13px]" style={{ background: '#F3F4F6', color: '#6B7280' }}>{'\uD83D\uDCDC'}</span>
                Historial del cliente
              </span>
            </div>
            <div className="py-3 px-4">
              {/* Brain points section */}
              {brainPoints.length > 0 && (
                <div className="mb-3 pb-3 border-b border-border">
                  <div className="text-[10px] font-semibold text-text3 uppercase tracking-wide mb-1.5">Puntos clave</div>
                  {brainPoints.map((bp, i) => (
                    <div key={'bp-' + i} className="flex gap-2 py-[4px] text-xs leading-relaxed">
                      <span className="shrink-0">{typeIcons[bp.type] || '\u2022'}</span>
                      <div><div>{bp.text}</div><div className="text-[9px] text-text3 mt-[1px]">{bp.source}</div></div>
                    </div>
                  ))}
                </div>
              )}

              {/* History entries */}
              {!c.history.length && !brainPoints.length ? (
                <div className="text-center text-text3 text-xs py-3.5">Sin historial</div>
              ) : (
                [...c.history].reverse().map((h, i) => (
                  <div key={i} className="flex gap-2 py-[5px]">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: h.color }} />
                    <div><div className="text-xs leading-relaxed">{h.text}</div><div className="text-[10px] text-text3 mt-[1px]">{fmtDate(h.date)}</div></div>
                  </div>
                ))
              )}
            </div>
      </div>
      {/* End Historial */}

      {/* Edit Client Modal */}
      <Modal
        open={editModal}
        onClose={() => setEditModal(false)}
        title="Editar cliente"
        footer={<>
          <button className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] cursor-pointer font-sans hover:bg-surface2" onClick={() => setEditModal(false)}>Cancelar</button>
          <button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark" onClick={saveEdit}>Guardar</button>
        </>}
      >
        <div className="grid grid-cols-2 gap-2.5">
          <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Nombre</label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Empresa</label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={editForm.company || ''} onChange={e => setEditForm(f => ({ ...f, company: e.target.value }))} /></div>
        </div>
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Servicio</label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={editForm.service || ''} onChange={e => setEditForm(f => ({ ...f, service: e.target.value }))} /></div>
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Fecha inicio</label><input type="date" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={editForm.startDate || ''} onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))} /></div>
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Foto de perfil (URL)</label><input type="text" placeholder="https://..." className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={editForm.avatarUrl || ''} onChange={e => setEditForm(f => ({ ...f, avatarUrl: e.target.value }))} /></div>
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Cuello de botella</label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={editForm.bottleneck || ''} onChange={e => setEditForm(f => ({ ...f, bottleneck: e.target.value }))} /></div>
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Estado</label><select className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={editForm.status || 'active'} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}><option value="active">Activo</option><option value="paused">Pausado</option><option value="completed">Completado</option></select></div>
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Notas</label><textarea className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue resize-y min-h-[80px] leading-relaxed" value={editForm.notes || ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} /></div>
      </Modal>

      {/* Feedback (Call) Modal */}
      <Modal
        open={feedbackModal}
        onClose={() => setFeedbackModal(false)}
        title="Registrar llamada"
        maxWidth={520}
        footer={<>
          <button className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] cursor-pointer font-sans hover:bg-surface2" onClick={() => setFeedbackModal(false)}>Cancelar</button>
          <button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark" onClick={saveFeedback}>Guardar</button>
        </>}
      >
        <div className="grid grid-cols-2 gap-2.5">
          <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Fecha</label><input type="date" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={fbForm.date} onChange={e => setFbForm(f => ({ ...f, date: e.target.value }))} /></div>
          <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Sentimiento</label><select className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={fbForm.sentiment} onChange={e => setFbForm(f => ({ ...f, sentiment: e.target.value }))}><option value="positive">Positivo</option><option value="neutral">Neutral</option><option value="negative">Negativo</option></select></div>
        </div>
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Link de Fathom</label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" placeholder="https://fathom.video/..." value={fbForm.fathomLink} onChange={e => setFbForm(f => ({ ...f, fathomLink: e.target.value }))} /></div>
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Resumen de la llamada</label><textarea className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue resize-y min-h-[80px] leading-relaxed" value={fbForm.text} onChange={e => setFbForm(f => ({ ...f, text: e.target.value }))} /></div>
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Puntos clave (uno por linea)</label><textarea className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue resize-y min-h-[80px] leading-relaxed" placeholder={'El cliente quiere lanzar antes del 15\nNecesita mas contenido visual'} value={fbForm.keypoints} onChange={e => setFbForm(f => ({ ...f, keypoints: e.target.value }))} /></div>
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Transcripcion (opcional)</label><textarea className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue resize-y min-h-[60px] leading-relaxed" placeholder="Pega aqui la transcripcion completa..." value={fbForm.transcription} onChange={e => setFbForm(f => ({ ...f, transcription: e.target.value }))} /></div>
      </Modal>

      {/* Client Feedback Modal */}
      <Modal
        open={clientFbModal}
        onClose={() => setClientFbModal(false)}
        title={'Feedback — ' + c.name}
        footer={<>
          <button className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] cursor-pointer font-sans hover:bg-surface2" onClick={() => setClientFbModal(false)}>Cancelar</button>
          <button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark" onClick={saveClientFeedback}>Guardar</button>
        </>}
      >
        {/* Source pills */}
        <div className="mb-3.5">
          <label className="block text-xs font-semibold text-text2 mb-1.5">Fuente</label>
          <div className="flex gap-1.5">
            {Object.entries(SOURCE_COLORS).map(([key, color]) => (
              <button key={key} className={`py-1.5 px-3 rounded-full text-xs font-medium cursor-pointer font-sans border ${cfbForm.source === key ? 'text-white border-transparent' : 'bg-white border-border text-text2'}`}
                style={cfbForm.source === key ? { background: color } : {}}
                onClick={() => setCfbForm(f => ({ ...f, source: key }))}
              >{SOURCE_LABELS[key]}</button>
            ))}
          </div>
        </div>

        {/* Call URL */}
        <div className="mb-3.5">
          <label className="block text-xs font-semibold text-text2 mb-1">URL de la llamada (opcional)</label>
          <input type="text" className="w-full bg-bg border border-border rounded-md py-2 px-3 text-text text-[13px] font-sans outline-none focus:border-blue" placeholder="https://fathom.video/..." value={cfbForm.callUrl} onChange={e => setCfbForm(f => ({ ...f, callUrl: e.target.value }))} />
        </div>

        {/* Priority */}
        <div className="mb-3.5">
          <label className="block text-xs font-semibold text-text2 mb-1">Prioridad</label>
          <select className="w-full bg-bg border border-border rounded-md py-2 px-3 text-text text-[13px] font-sans outline-none" value={cfbForm.priority} onChange={e => setCfbForm(f => ({ ...f, priority: e.target.value }))}>
            {PRIO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Feedback items */}
        <div className="mb-2">
          <label className="block text-xs font-semibold text-text2 mb-1">Feedback</label>
          <textarea
            className="w-full bg-bg border border-border rounded-md py-2 px-3 text-text text-[13px] font-sans outline-none focus:border-blue resize-y min-h-[70px] leading-relaxed"
            placeholder="Escribe el feedback..."
            value={cfbForm.currentItem}
            onChange={e => setCfbForm(f => ({ ...f, currentItem: e.target.value }))}
          />
          {cfbForm.items.length > 0 && (
            <div className="mt-2 space-y-1">
              {cfbForm.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5 bg-surface2 rounded-md py-1.5 px-2.5 text-xs text-text">
                  <span className="flex-1">{item}</span>
                  <button className="bg-transparent border-none text-text3 cursor-pointer hover:text-red text-sm" onClick={() => setCfbForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}>&#x2715;</button>
                </div>
              ))}
            </div>
          )}
          <button className="mt-1.5 text-[11px] text-blue bg-transparent border-none cursor-pointer font-sans hover:underline" onClick={() => {
            if (cfbForm.currentItem.trim()) {
              setCfbForm(f => ({ ...f, items: [...f.items, f.currentItem.trim()], currentItem: '' }));
            }
          }}>+ Agregar otro item</button>
        </div>
      </Modal>

      {/* Delete Phase Confirmation */}
      <Modal
        open={!!deletePhaseConfirm}
        onClose={() => setDeletePhaseConfirm(null)}
        title=""
        maxWidth={420}
        footer={null}
      >
        {deletePhaseConfirm && (
          <div className="text-center py-2">
            <div className="text-4xl mb-3">{'\u26A0\uFE0F'}</div>
            <div className="text-[17px] font-bold text-gray-800 mb-2">Eliminar fase</div>
            <div className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-sm font-bold mb-4" style={{ background: deletePhaseConfirm.color + '18', color: deletePhaseConfirm.color }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: deletePhaseConfirm.color }} />
              {deletePhaseConfirm.label}
            </div>
            {deletePhaseConfirm.taskCount > 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-lg py-3 px-4 mb-5 text-left">
                <div className="text-[13px] font-semibold text-red-600 mb-1">{'\u26A0'} Se eliminarán {deletePhaseConfirm.taskCount} tarea{deletePhaseConfirm.taskCount > 1 ? 's' : ''}</div>
                <div className="text-[12px] text-red-500">Todas las tareas dentro de esta fase serán eliminadas permanentemente. Esta acción no se puede deshacer.</div>
              </div>
            ) : (
              <div className="text-[13px] text-gray-500 mb-5">Esta fase no tiene tareas. Se eliminará solo la fase.</div>
            )}
            <div className="flex flex-col gap-2">
              <button
                className="w-full py-3 px-4 rounded-lg border-none bg-blue text-white text-[14px] font-bold cursor-pointer font-sans hover:bg-blue-dark transition-colors"
                onClick={() => setDeletePhaseConfirm(null)}
              >No borrar, mantener la fase</button>
              <button
                className="w-full py-2 px-4 rounded-lg border border-gray-200 bg-white text-gray-400 text-[12px] font-medium cursor-pointer font-sans hover:text-red-500 hover:border-red-300 hover:bg-red-50 transition-colors"
                onClick={() => {
                  const pk = deletePhaseConfirm.phaseKey;
                  const tasksInPhase = clientTasks.filter(t => t.phase === pk);
                  tasksInPhase.forEach(t => deleteTask(t.id));
                  const newCustomPhases = (c.customPhases || []).filter(cp => cp.id !== pk);
                  updateClient(c.id, { customPhases: newCustomPhases });
                  setDeletePhaseConfirm(null);
                }}
              >{deletePhaseConfirm.taskCount > 0 ? `Sí, eliminar fase y sus ${deletePhaseConfirm.taskCount} tareas` : 'Sí, eliminar fase'}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Phase Modal */}
      <Modal
        open={addPhaseModal}
        onClose={() => setAddPhaseModal(false)}
        title="Agregar fase personalizada"
        maxWidth={400}
        footer={<>
          <button className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] cursor-pointer font-sans hover:bg-surface2" onClick={() => setAddPhaseModal(false)}>Cancelar</button>
          <button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark" onClick={() => {
            if (!newPhaseName.trim()) return;
            const phaseId = 'custom-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
            const newCustomPhases = [...(c.customPhases || []), { id: phaseId, label: newPhaseName.trim(), color: newPhaseColor }];
            updateClient(c.id, { customPhases: newCustomPhases });
            setAddPhaseModal(false);
            setNewPhaseName('');
            setNewPhaseColor('#5B7CF5');
          }}>Guardar</button>
        </>}
      >
        <div className="mb-3.5">
          <label className="block text-xs font-semibold text-text2 mb-[5px]">Nombre de la fase</label>
          <input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" placeholder="Ej: Seguimiento mensual" value={newPhaseName} onChange={e => setNewPhaseName(e.target.value)} autoFocus />
        </div>
        <div className="mb-3.5">
          <label className="block text-xs font-semibold text-text2 mb-[5px]">Color</label>
          <div className="flex gap-2 flex-wrap">
            {['#5B7CF5', '#22C55E', '#EAB308', '#F97316', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#14B8A6', '#6366F1'].map(color => (
              <button
                key={color}
                className={`w-8 h-8 rounded-full border-2 cursor-pointer ${newPhaseColor === color ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                style={{ background: color }}
                onClick={() => setNewPhaseColor(color)}
              />
            ))}
          </div>
        </div>
      </Modal>

      {/* Dependencies Modal */}
      <Modal
        open={!!depsModal}
        onClose={() => setDepsModal(null)}
        title="Configurar dependencias"
        maxWidth={450}
        footer={<button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark" onClick={() => setDepsModal(null)}>Cerrar</button>}
      >
        {depsModal && (() => {
          const currentTask = clientTasks.find(t => t.id === depsModal);
          if (!currentTask) return <div className="text-xs text-text3">Tarea no encontrada</div>;
          const otherTasks = clientTasks.filter(t => t.id !== depsModal);
          const currentDeps = currentTask.dependsOn || [];

          // Group other tasks by phase (FIX 4)
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
                          <label key={t.id} className={`flex items-center gap-2.5 py-1.5 px-3 pl-6 rounded-md cursor-pointer text-xs hover:bg-gray-50 ${isDone ? 'opacity-50' : ''}`}>
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
                            {isDone && <span className="text-[9px] text-green-500 font-semibold">COMPLETADA</span>}
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

      {/* Eliminar cliente — modal de confirmacion (escribir nombre) */}
      <Modal
        open={deleteClientModal}
        onClose={() => setDeleteClientModal(false)}
        title="Eliminar cliente"
        maxWidth={460}
        footer={<>
          <button className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] cursor-pointer font-sans hover:bg-surface2" onClick={() => setDeleteClientModal(false)}>Cancelar</button>
          <button
            className="py-2 px-4 rounded-md border-none bg-red-500 text-white text-[13px] cursor-pointer font-sans hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={deleteClientConfirmName.trim() !== c.name.trim()}
            onClick={async () => {
              await deleteClient(c.id);
              setDeleteClientModal(false);
              setSelectedId(null);
              setView('clients');
            }}
          >Eliminar definitivamente</button>
        </>}
      >
        <div className="text-[13px] text-gray-700 leading-relaxed">
          Esto va a borrar <strong>{c.name}</strong>, todas sus fases, todas sus tareas y todo su historial.
          La acción <strong>no se puede deshacer</strong>.
        </div>
        <div className="mt-3 text-[12px] text-gray-500">
          Para confirmar, escribí el nombre del cliente exacto:
        </div>
        <div className="mt-1 text-[11px] text-gray-400 font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1 inline-block">{c.name}</div>
        <input
          type="text"
          autoFocus
          value={deleteClientConfirmName}
          onChange={(e) => setDeleteClientConfirmName(e.target.value)}
          placeholder="Escribí el nombre del cliente"
          className="w-full mt-3 border border-gray-300 rounded-md py-2 px-3 text-[13px] font-sans outline-none focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.1)]"
        />
      </Modal>

      {/* Link Modal (add / edit) */}
      <Modal
        open={linkModal}
        onClose={() => setLinkModal(false)}
        title={editingLinkIdx !== null ? 'Editar link' : 'Nuevo link'}
        maxWidth={440}
        footer={<>
          <button className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] cursor-pointer font-sans hover:bg-surface2" onClick={() => setLinkModal(false)}>Cancelar</button>
          <button
            className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark disabled:opacity-50"
            disabled={!linkForm.url.trim()}
            onClick={() => {
              const url = linkForm.url.trim();
              if (!url) return;
              const newLink = {
                label: linkForm.label.trim() || url,
                url: url.startsWith('http') ? url : 'https://' + url,
                category: linkForm.category || 'other',
              };
              const newLinks = [...(c.links || [])];
              if (editingLinkIdx !== null) {
                newLinks[editingLinkIdx] = newLink;
              } else {
                newLinks.push(newLink);
              }
              updateClient(c.id, { links: newLinks });
              setLinkModal(false);
              setLinkForm({ label: '', url: '', category: 'folder' });
              setEditingLinkIdx(null);
            }}
          >
            Guardar
          </button>
        </>}
      >
        <div className="mb-3.5">
          <label className="block text-xs font-semibold text-text2 mb-[5px]">Categoría</label>
          <div className="grid grid-cols-3 gap-1.5">
            {LINK_CATEGORY_ORDER.map(cat => {
              const info = LINK_CATEGORIES[cat];
              const active = linkForm.category === cat;
              return (
                <button
                  key={cat}
                  className={`py-2 px-2 rounded-md border flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer font-sans transition-all ${active ? 'border-blue bg-blue-bg text-blue' : 'border-border bg-white text-text2 hover:bg-surface2'}`}
                  onClick={() => setLinkForm({ ...linkForm, category: cat })}
                >
                  <span className="text-sm">{info.icon}</span>
                  <span className="truncate">{info.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mb-3.5">
          <label className="block text-xs font-semibold text-text2 mb-[5px]">Nombre</label>
          <input
            type="text"
            className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue"
            placeholder="Ej: Drive principal, Doc estrategia, Landing final..."
            value={linkForm.label}
            onChange={(e) => setLinkForm({ ...linkForm, label: e.target.value })}
          />
        </div>
        <div className="mb-3.5">
          <label className="block text-xs font-semibold text-text2 mb-[5px]">URL</label>
          <input
            type="url"
            className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue"
            placeholder="https://drive.google.com/..."
            value={linkForm.url}
            onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })}
            autoFocus
          />
        </div>
      </Modal>
    </div>
  );
}