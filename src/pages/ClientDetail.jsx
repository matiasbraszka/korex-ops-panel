import { useState, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { PROCESS_STEPS, PHASES, PRIO_CLIENT, STATUS, TASK_PRIO, TASK_STATUS, TEAM } from '../utils/constants';
import { initials, progress, getBottleneck, getAllPhases, getStepNameForClient, getRoadmapTasks, daysAgo, daysBetween, fmtDate, clientPill, today, effectiveTime } from '../utils/helpers';
import Modal from '../components/Modal';
import Dropdown from '../components/Dropdown';
import StatusPill from '../components/StatusPill';

export default function ClientDetail({ client: c }) {
  const { setSelectedId, updateClient, tasks, createTask, updateTask, deleteTask, currentUser } = useApp();
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState(false);
  const [clientFbModal, setClientFbModal] = useState(false);
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

  const dropdownRefs = useRef({});

  const clientTasks = tasks.filter(t => t.clientId === c.id);
  const roadmapTasks = getRoadmapTasks(c.id, tasks);
  // Use new system if client has ANY tasks (not just roadmap-flagged ones)
  const useNewSystem = clientTasks.length > 0;

  const pct = progress(c, tasks);
  const days = daysAgo(c.startDate);
  const p = c.priority || 4;
  const pcfg = PRIO_CLIENT[p];
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
      startDate: c.startDate || '', pm: c.pm || '', bottleneck: c.bottleneck || '',
      status: c.status, notes: c.notes || '',
    });
    setEditModal(true);
  };
  const saveEdit = () => {
    updateClient(c.id, {
      name: editForm.name, company: editForm.company, service: editForm.service,
      startDate: editForm.startDate, pm: editForm.pm, bottleneck: editForm.bottleneck,
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

  // Client feedback modal
  const [cfbForm, setCfbForm] = useState({ text: '', source: 'whatsapp', type: 'request', sourceDetail: '' });
  const saveClientFeedback = () => {
    if (!cfbForm.text.trim()) return;
    const newFbs = [...(c.clientFeedbacks || []), { text: cfbForm.text.trim(), source: cfbForm.source, type: cfbForm.type, sourceDetail: cfbForm.sourceDetail, date: today(), comments: [], convertedTaskId: null }];
    const newHistory = [...c.history, { text: 'Feedback: ' + cfbForm.text.substring(0, 50), date: today(), color: '#F97316' }];
    updateClient(c.id, { clientFeedbacks: newFbs, history: newHistory });
    setClientFbModal(false);
    setCfbForm({ text: '', source: 'whatsapp', type: 'request', sourceDetail: '' });
  };

  const addFbComment = (fbIdx) => {
    const text = prompt('Tu comentario sobre este feedback:');
    if (!text?.trim()) return;
    const newFbs = [...(c.clientFeedbacks || [])];
    const fb = { ...newFbs[fbIdx] };
    fb.comments = [...(fb.comments || []), { user: currentUser?.name || 'Usuario', text: text.trim(), date: today() }];
    newFbs[fbIdx] = fb;
    updateClient(c.id, { clientFeedbacks: newFbs });
  };

  const convertFbToTask = (fbIdx) => {
    const fb = c.clientFeedbacks[fbIdx];
    let desc = fb.text;
    if (fb.comments?.length) desc += '\n\nComentarios del equipo:\n' + fb.comments.map(cm => cm.user + ': ' + cm.text).join('\n');
    const t = createTask(fb.text.substring(0, 80), c.id, '', 'normal', 'backlog', '', null);
    updateTask(t.id, { description: desc });
    const newFbs = [...(c.clientFeedbacks || [])];
    newFbs[fbIdx] = { ...newFbs[fbIdx], convertedTaskId: t.id };
    const newHistory = [...c.history, { text: 'Feedback convertido a tarea: ' + fb.text.substring(0, 40), date: today(), color: '#5B7CF5' }];
    updateClient(c.id, { clientFeedbacks: newFbs, history: newHistory });
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

    // Filter by assignee
    if (assigneeFilter !== 'all') {
      const memberName = assigneeFilter;
      allTasks = allTasks.filter(t => {
        const a = TEAM.find(m => m.name.toLowerCase() === t.assignee?.toLowerCase() || m.id === t.assignee);
        return a && (a.name.toLowerCase() === memberName.toLowerCase() || a.id === memberName);
      });
    }

    // Hide completed
    if (hideCompleted) {
      allTasks = allTasks.filter(t => t.status !== 'done');
    }

    return allTasks;
  };

  // ===== VERTICAL LIST ROADMAP =====
  const renderRoadmap = () => {
    const filteredTasks = getFilteredTasks();

    // Build unique assignees for filter
    const assignees = new Set();
    clientTasks.forEach(t => { if (t.assignee) assignees.add(t.assignee); });
    const assigneeList = [...assignees].sort();

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
    }).filter(g => g.totalCount > 0);

    // Initialize collapsed state for all-done phases (only on first render logic)
    const isCollapsed = (phaseKey, allDone) => {
      if (collapsedPhases[phaseKey] !== undefined) return collapsedPhases[phaseKey];
      return allDone;
    };

    const togglePhase = (phaseKey) => {
      setCollapsedPhases(prev => ({ ...prev, [phaseKey]: !isCollapsed(phaseKey, phaseGroups.find(g => g.phaseKey === phaseKey)?.allDone) }));
    };

    // Priority cycle order
    const prioOrder = ['urgent', 'high', 'normal', 'low'];
    const prioColors = { urgent: '#EF4444', high: '#F97316', normal: '#5B7CF5', low: '#9CA3AF' };
    const cyclePriority = (t) => {
      const idx = prioOrder.indexOf(t.priority);
      const next = prioOrder[(idx + 1) % prioOrder.length];
      updateTask(t.id, { priority: next });
    };

    // Render a single task row
    const renderTaskRow = (t, isLast) => {
      const blocked = isTaskBlocked(t);
      const blockingNames = blocked ? getBlockingNames(t) : [];
      const assignee = TEAM.find(m => m.name.toLowerCase() === t.assignee?.toLowerCase() || m.id === t.assignee);
      const tp = TASK_PRIO[t.priority] || TASK_PRIO.normal;
      const hasDesc = !!(t.description && t.description.trim());
      const etime = effectiveTime(t, c);
      const est = t.estimatedDays || null;
      const isExpanded = expandedTasks[t.id];

      // Due date logic
      const isOverdue = t.dueDate && t.status !== 'done' && !blocked && t.dueDate < today();

      const statusRef = getDropdownRef('rd-status-' + t.id);
      const assigneeRef = getDropdownRef('rd-assignee-' + t.id);
      const phaseChangeRef = getDropdownRef('rd-phase-' + t.id);

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

      return (
        <div key={t.id} className={`group ${blocked ? 'opacity-50' : ''}`}>
          {/* Main row */}
          <div
            className={`flex items-center gap-2 py-[7px] px-3 hover:bg-gray-50 cursor-pointer ${rowBg}`}
            onClick={() => setExpandedTasks(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
          >
            {/* Tree connector */}
            <span className="text-gray-300 text-[11px] w-3 text-center shrink-0 select-none">{isLast ? '\u2514' : '\u251C'}</span>

            {/* Status icon */}
            <span className="text-sm shrink-0 w-5 text-center select-none" style={{ color: statusColor }}>{statusIcon}</span>

            {/* Title (editable on double-click) */}
            <div className="flex-1 min-w-0">
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
                  className={`text-[13px] leading-tight truncate block ${t.status === 'done' ? 'text-text3' : 'text-gray-800'} ${t.isClientTask ? 'font-semibold' : 'font-medium'}`}
                  onDoubleClick={(e) => { e.stopPropagation(); setEditingTitle(t.id); setEditTitleValue(t.title); }}
                >
                  {t.title}
                </span>
              )}
            </div>

            {/* CLIENTE badge */}
            {t.isClientTask && (
              <span className="text-[9px] font-bold bg-orange-100 text-orange-600 py-[1px] px-1.5 rounded uppercase tracking-wide shrink-0">CLIENTE</span>
            )}

            {/* Assignee */}
            <div
              ref={el => assigneeRef.current = el}
              className="cursor-pointer shrink-0"
              onClick={(e) => { e.stopPropagation(); setOpenDropdown(prev => prev === 'rd-assignee-' + t.id ? null : 'rd-assignee-' + t.id); }}
            >
              {assignee ? (
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0" style={{ background: assignee.color + '22', color: assignee.color }} title={assignee.name}>{assignee.initials}</span>
              ) : (
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] bg-gray-100 text-gray-400 shrink-0 opacity-0 group-hover:opacity-100" title="Asignar">+</span>
              )}
            </div>
            <Dropdown
              open={openDropdown === 'rd-assignee-' + t.id}
              onClose={() => setOpenDropdown(null)}
              anchorRef={assigneeRef}
              items={[{ label: 'Sin asignar', onClick: () => updateTask(t.id, { assignee: '' }) }, ...TEAM.map(m => ({ node: <><span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ background: m.color + '18', color: m.color }}>{m.initials}</span>{m.name}</>, onClick: () => updateTask(t.id, { assignee: m.name }) }))]}
            />

            {/* Time info */}
            {est && (
              <span className="text-[10px] text-gray-400 shrink-0 w-[80px] text-right">
                {etime !== null ? (
                  <><span className="font-semibold" style={{ color: etime > est ? '#F97316' : '#5B7CF5' }}>{etime}d</span><span className="text-gray-300">/{est}d</span></>
                ) : (
                  <>{est}d est.</>
                )}
              </span>
            )}
            {!est && etime !== null && (
              <span className="text-[10px] text-blue-500 shrink-0 w-[80px] text-right font-semibold">{etime}d</span>
            )}

            {/* Priority cycle dot (FIX 1) */}
            <span
              className="w-[14px] h-[14px] rounded-full shrink-0 cursor-pointer border border-white hover:scale-125 transition-transform"
              style={{ background: prioColors[t.priority] || '#5B7CF5' }}
              title={`Prioridad: ${tp.label} (click para cambiar)`}
              onClick={(e) => { e.stopPropagation(); cyclePriority(t); }}
            />

            {/* Phase change dot (FIX 3) */}
            <div
              ref={el => phaseChangeRef.current = el}
              className="cursor-pointer shrink-0"
              onClick={(e) => { e.stopPropagation(); setOpenDropdown(prev => prev === 'rd-phase-' + t.id ? null : 'rd-phase-' + t.id); }}
              title="Cambiar fase"
            >
              <span className="w-[14px] h-[14px] rounded-sm shrink-0 inline-block border border-gray-200 hover:scale-125 transition-transform" style={{ background: (allPh[resolvePhase(t)] || { color: '#9CA3AF' }).color }} />
            </div>
            <Dropdown
              open={openDropdown === 'rd-phase-' + t.id}
              onClose={() => setOpenDropdown(null)}
              anchorRef={phaseChangeRef}
              items={Object.entries(allPh).map(([k, v]) => ({ label: v.label, icon: '\u25CF', iconColor: v.color, onClick: () => updateTask(t.id, { phase: k, isRoadmapTask: true }) }))}
            />

            {/* Due date (FIX 6) */}
            {t.dueDate && (
              <span className={`text-[9px] shrink-0 font-medium ${isOverdue ? 'text-red-500' : 'text-gray-400'}`} title={`Vence: ${t.dueDate}`}>
                {isOverdue ? '\u26A0' : '\uD83D\uDCC5'} {fmtDate(t.dueDate)}
              </span>
            )}

            {/* Description indicator */}
            {hasDesc && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" title="Tiene descripcion" />}

            {/* Status dropdown trigger (on hover) */}
            <div
              ref={el => statusRef.current = el}
              className="cursor-pointer shrink-0 opacity-0 group-hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); setOpenDropdown(prev => prev === 'rd-status-' + t.id ? null : 'rd-status-' + t.id); }}
            >
              <span className="text-[10px] py-[2px] px-1.5 rounded hover:bg-gray-200 text-gray-400">{TASK_STATUS[t.status]?.icon || '\u25CB'}</span>
            </div>
            <Dropdown
              open={openDropdown === 'rd-status-' + t.id}
              onClose={() => setOpenDropdown(null)}
              anchorRef={statusRef}
              items={Object.entries(TASK_STATUS).map(([k, v]) => ({ label: v.label, icon: v.icon, iconColor: v.color, onClick: () => updateTask(t.id, { status: k }) }))}
            />

            {/* Dependencies icon */}
            <button
              className="text-[10px] py-[2px] px-1 rounded hover:bg-blue-50 text-gray-400 bg-transparent border-none cursor-pointer font-sans opacity-0 group-hover:opacity-100 hover:text-blue-500 shrink-0"
              onClick={(e) => { e.stopPropagation(); setDepsModal(t.id); }}
              title="Dependencias"
            >{'\uD83D\uDD17'}</button>

            {/* Delete (on hover) */}
            <button
              className="text-[10px] py-[2px] px-1 rounded hover:bg-red-50 text-gray-400 bg-transparent border-none cursor-pointer font-sans opacity-0 group-hover:opacity-100 hover:text-red-500 shrink-0"
              onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}
            >x</button>
          </div>

          {/* Blocked warning */}
          {blocked && blockingNames.length > 0 && (
            <div className="text-[10px] text-red-500 pl-[52px] pb-1 leading-tight">Bloqueada por: {blockingNames.join(', ')}</div>
          )}

          {/* Expanded detail area */}
          {isExpanded && (
            <div className="pl-[52px] pr-3 pb-2.5 pt-1 bg-gray-50/50">
              {/* Description */}
              <textarea
                className="w-full border border-gray-200 rounded-md py-2 px-2.5 text-xs font-sans resize-y min-h-[50px] outline-none bg-white focus:border-blue-400 mb-2"
                placeholder="Descripcion de la tarea..."
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
                  onClick={(e) => { e.stopPropagation(); setOpenDropdown(prev => prev === 'rd-status2-' + t.id ? null : 'rd-status2-' + t.id); }}
                >
                  <span className="text-[10px] py-[3px] px-2 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1">
                    <span style={{ color: TASK_STATUS[t.status]?.color }}>{TASK_STATUS[t.status]?.icon}</span> {TASK_STATUS[t.status]?.label || 'Estado'}
                  </span>
                </div>
                <Dropdown
                  open={openDropdown === 'rd-status2-' + t.id}
                  onClose={() => setOpenDropdown(null)}
                  anchorRef={getDropdownRef('rd-status2-' + t.id)}
                  items={Object.entries(TASK_STATUS).map(([k, v]) => ({ label: v.label, icon: v.icon, iconColor: v.color, onClick: () => updateTask(t.id, { status: k }) }))}
                />

                {/* Priority dropdown */}
                <div
                  ref={el => getDropdownRef('rd-prio2-' + t.id).current = el}
                  className="cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setOpenDropdown(prev => prev === 'rd-prio2-' + t.id ? null : 'rd-prio2-' + t.id); }}
                >
                  <span className="text-[10px] py-[3px] px-2 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1">
                    <span style={{ color: tp.color }}>{tp.flag}</span> {tp.label}
                  </span>
                </div>
                <Dropdown
                  open={openDropdown === 'rd-prio2-' + t.id}
                  onClose={() => setOpenDropdown(null)}
                  anchorRef={getDropdownRef('rd-prio2-' + t.id)}
                  items={Object.entries(TASK_PRIO).map(([k, v]) => ({ label: v.label, icon: v.flag, iconColor: v.color, onClick: () => { updateTask(t.id, { priority: k }); setOpenDropdown(null); } }))}
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
            {assigneeList.map(a => {
              const m = TEAM.find(t => t.name.toLowerCase() === a.toLowerCase() || t.id === a);
              return <option key={a} value={a}>{m ? m.name : a}</option>;
            })}
          </select>
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer select-none">
            <input type="checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} className="cursor-pointer" /> Ocultar completadas
          </label>
        </div>

        {/* Phase sections */}
        <div className="space-y-2">
          {phaseGroups.map(({ phaseKey, phInfo, phaseTasks, totalCount, doneCount, allDone }) => {
            const collapsed = isCollapsed(phaseKey, allDone);
            // Sort tasks: urgent > high > normal > low
            const prioSort = { urgent: 0, high: 1, normal: 2, low: 3 };
            const sortedTasks = [...phaseTasks].sort((a, b) => (prioSort[a.priority] || 2) - (prioSort[b.priority] || 2));

            return (
              <div key={phaseKey} className="rounded-lg overflow-hidden bg-white border border-gray-100" style={{ borderLeft: `3px solid ${phInfo.color}` }}>
                {/* Phase header */}
                <div
                  className="flex items-center gap-2 py-2.5 px-3 cursor-pointer select-none hover:bg-gray-50"
                  onClick={() => togglePhase(phaseKey)}
                >
                  <span className="text-[11px] text-gray-400 shrink-0">{collapsed ? '\u25B6' : '\u25BC'}</span>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: phInfo.color }} />
                  <span className="text-[13px] font-bold" style={{ color: phInfo.color }}>{phInfo.label}</span>
                  <span className="text-[11px] font-semibold text-gray-400">({doneCount}/{totalCount})</span>
                  {allDone && <span className="text-green-500 text-sm">{'\u2713'}</span>}
                </div>

                {/* Task rows */}
                {!collapsed && (
                  <div className="border-t border-gray-50">
                    {sortedTasks.map((t, idx) => renderTaskRow(t, idx === sortedTasks.length - 1))}

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
    let timelineItems = PROCESS_STEPS.map((s, i) => ({ s, i, cs: c.steps[i], isCustom: false }));
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
                      {s.client && <span className="text-[9px] font-bold text-orange-500 uppercase tracking-wide">CLIENTE</span>}
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
  (c.clientFeedbacks || []).forEach(f => {
    brainPoints.push({ text: f.text, source: (f.source || 'otro') + ' ' + fmtDate(f.date || ''), type: f.type || 'request' });
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
      <div className="bg-white border border-border rounded-[14px] p-6 mb-5">
        <div className="flex items-start gap-4">
          <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center font-extrabold text-xl shrink-0" style={{ background: c.color + '15', color: c.color }}>{initials(c.name)}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="text-xl font-extrabold tracking-tight">{c.name}</div>
              <span className="inline-flex items-center gap-1 py-[3px] px-2.5 rounded-[20px] text-[10px] font-semibold" style={{ background: pcfg.color + '12', color: pcfg.color }}>{pcfg.label}</span>
              <StatusPill text={pill.text} pillClass={pill.pillClass} />
            </div>
            <div className="text-[13px] text-text2 mt-0.5">{c.company}</div>
            <div className="flex gap-4 mt-2.5 flex-wrap">
              <span className="text-xs text-text2 flex items-center gap-1">{'\uD83D\uDCE6'} {c.service || '\u2014'}</span>
              <span className="text-xs text-text2 flex items-center gap-1">
                {'\uD83D\uDCC5'}{' '}
                {editingStartDate ? (
                  <input type="date" className="border border-blue rounded py-[2px] px-1.5 text-xs font-sans outline-none" defaultValue={c.startDate || ''} autoFocus onBlur={(e) => handleInlineStartDate(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />
                ) : (
                  <span className="cursor-pointer py-[1px] px-1 rounded-[3px] hover:bg-surface2" onClick={() => setEditingStartDate(true)}>{fmtDate(c.startDate)}</span>
                )}{' '}
                {'\u00B7'} Dia {days}
              </span>
              <span className="text-xs text-text2 flex items-center gap-1">{'\uD83D\uDC64'} {c.pm || '\u2014'}</span>
              {ct > 0 && <span className="text-xs text-blue flex items-center gap-1">{'\uD83D\uDDD2'} {ct} tareas</span>}
            </div>
          </div>
          <div className="flex gap-2 ml-auto">
            <button className="py-1.5 px-2.5 rounded-md border border-border bg-white text-text2 text-xs cursor-pointer font-sans hover:bg-surface2 hover:text-text" onClick={openEditModal}>Editar</button>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-[11px] text-text2"><span>Progreso</span><span>{pct}% {'\u00B7'} {doneRoadmap}/{totalRoadmap}</span></div>
          <div className="h-[5px] bg-surface3 rounded-[3px] overflow-hidden mt-1.5">
            <div className="h-full rounded-[3px] bg-blue" style={{ width: pct + '%' }} />
          </div>
        </div>

        {bn && (
          <div className="mt-3 bg-red-bg border border-[#fecaca] rounded-md py-2 px-3 text-xs text-red">{'\u26A1'} {bn}</div>
        )}
      </div>

      {/* Main grid */}
      <div className="grid gap-4 max-md:grid-cols-1" style={{ gridTemplateColumns: '1fr 320px' }}>
        {/* Left: Kanban Roadmap */}
        <div>
          <div className="text-sm font-bold mb-3">Roadmap</div>
          {useNewSystem ? renderRoadmap() : renderOldRoadmap()}
        </div>

        {/* Right: Side panels */}
        <div>
          {/* Meta Ads */}
          {c.metaAds && c.metaAds.length > 0 && c.metaAds.some(a => a.status !== 'interna') && (() => {
            const m = c.metaMetrics || {};
            const isActive = m.adsActive;
            const curr = m.currency || 'USD';
            const cs = curr === 'EUR' ? '\u20AC' : curr === 'MXN' ? 'MX$' : '$';
            return (
              <div className="bg-white border border-border rounded-[10px] overflow-hidden mb-3">
                <div className="py-3 px-4 border-b border-border text-[13px] font-bold flex items-center justify-between">
                  <span>Publicidad</span>
                  <span className={`inline-flex items-center gap-1 py-[2px] px-2 rounded-[10px] text-[9px] font-bold ml-auto ${isActive ? 'bg-green-bg text-[#16A34A]' : 'bg-surface2 text-text3'}`}>{isActive ? '\u25CF Activa' : '\u25CB Inactiva'}</span>
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
                        <span className={`inline-flex items-center gap-1 py-[2px] px-2 rounded-[10px] text-[8px] font-bold ${a.status === 'activa' ? 'bg-green-bg text-[#16A34A]' : 'bg-surface2 text-text3'}`}>{a.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Calls */}
          <div className="bg-white border border-border rounded-[10px] overflow-hidden mb-3">
            <div className="py-3 px-4 border-b border-border text-[13px] font-bold flex items-center justify-between">
              <span>Llamadas</span>
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
          <div className="bg-white border border-border rounded-[10px] overflow-hidden mb-3">
            <div className="py-3 px-4 border-b border-border text-[13px] font-bold flex items-center justify-between">
              <span>{'\uD83D\uDCAC'} Feedback del cliente</span>
              <button className="bg-transparent border-none text-text2 cursor-pointer text-xs py-1 px-2 rounded hover:bg-surface2 font-sans" onClick={() => { setCfbForm({ text: '', source: 'whatsapp', type: 'request', sourceDetail: '' }); setClientFbModal(true); }}>+ Nuevo</button>
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
                        <span className="bg-surface2 py-[1px] px-1.5 rounded-[3px] font-semibold">{f.source || 'otro'}</span>
                        <span>{f.sourceDetail || ''}</span>
                        <span>{'\uD83D\uDCC5'} {fmtDate(f.date || today())}</span>
                        <span className="py-[1px] px-1.5 rounded-[3px]" style={{ background: typeBg }}>{typeLabel}</span>
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
                          <button className="bg-blue-bg text-blue border rounded py-[3px] px-2 cursor-pointer font-sans text-[10px] font-semibold hover:bg-blue hover:text-white" style={{ borderColor: 'rgba(91,124,245,0.2)' }} onClick={() => convertFbToTask(fi)}>{'\u2192'} Crear tarea</button>
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

          {/* Historial del cliente (merged with brain points) */}
          <div className="bg-white border border-border rounded-[10px] overflow-hidden mb-3">
            <div className="py-3 px-4 border-b border-border text-[13px] font-bold">Historial del cliente</div>
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
        </div>
      </div>

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
        <div className="grid grid-cols-2 gap-2.5">
          <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Fecha inicio</label><input type="date" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={editForm.startDate || ''} onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))} /></div>
          <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Responsable</label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={editForm.pm || ''} onChange={e => setEditForm(f => ({ ...f, pm: e.target.value }))} /></div>
        </div>
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
        title="Nuevo feedback del cliente"
        footer={<>
          <button className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] cursor-pointer font-sans hover:bg-surface2" onClick={() => setClientFbModal(false)}>Cancelar</button>
          <button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark" onClick={saveClientFeedback}>Guardar</button>
        </>}
      >
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Feedback</label><textarea className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue resize-y min-h-[80px] leading-relaxed" placeholder="Ej: El cliente pidio que la landing tenga mas testimonios" value={cfbForm.text} onChange={e => setCfbForm(f => ({ ...f, text: e.target.value }))} /></div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Fuente</label><select className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={cfbForm.source} onChange={e => setCfbForm(f => ({ ...f, source: e.target.value }))}><option value="whatsapp">WhatsApp</option><option value="call">Llamada</option><option value="slack">Slack</option><option value="email">Email</option><option value="other">Otro</option></select></div>
          <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Tipo</label><select className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={cfbForm.type} onChange={e => setCfbForm(f => ({ ...f, type: e.target.value }))}><option value="request">Pedido</option><option value="complaint">Queja</option><option value="suggestion">Sugerencia</option><option value="problem">Problema</option></select></div>
        </div>
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Detalle de la fuente</label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" placeholder="Ej: Lo comento en la llamada del 01/04" value={cfbForm.sourceDetail} onChange={e => setCfbForm(f => ({ ...f, sourceDetail: e.target.value }))} /></div>
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
    </div>
  );
}