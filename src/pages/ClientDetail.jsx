import { useState, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { PROCESS_STEPS, PHASES, PRIO_CLIENT, STATUS, TASK_PRIO, TASK_STATUS, TEAM } from '../utils/constants';
import { initials, progress, getBottleneck, getPhaseTimings, getAllPhases, getStepNameForClient, getRoadmapTasks, daysAgo, daysBetween, fmtDate, clientPill, today, effectiveTime } from '../utils/helpers';
import Modal from '../components/Modal';
import Dropdown from '../components/Dropdown';
import StatusPill from '../components/StatusPill';

export default function ClientDetail({ client: c }) {
  const { setSelectedId, updateClient, tasks, createTask, updateTask, deleteTask, currentUser } = useApp();
  const [phase, setPhase] = useState('all');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState(false);
  const [clientFbModal, setClientFbModal] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [expandedTasks, setExpandedTasks] = useState({});
  const [openTranscription, setOpenTranscription] = useState({});
  const [addingTaskToPhase, setAddingTaskToPhase] = useState(null);
  const [editingStartDate, setEditingStartDate] = useState(false);
  const [expandedCompleted, setExpandedCompleted] = useState({});

  const dropdownRefs = useRef({});

  const clientTasks = tasks.filter(t => t.clientId === c.id);
  const roadmapTasks = getRoadmapTasks(c.id, tasks);
  const useNewSystem = roadmapTasks.length > 0;

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

  // Check if a roadmap task is blocked by dependencies
  const isTaskBlocked = (task) => {
    if (!task.dependsOn || task.dependsOn.length === 0) return false;
    if (task.status === 'done') return false;
    return task.dependsOn.some(depId => {
      const depTask = roadmapTasks.find(t => t.templateId === depId);
      return depTask && depTask.status !== 'done';
    });
  };

  const getBlockingNames = (task) => {
    if (!task.dependsOn || task.dependsOn.length === 0) return [];
    return task.dependsOn
      .map(depId => {
        const depTask = roadmapTasks.find(t => t.templateId === depId);
        return depTask && depTask.status !== 'done' ? depTask.title : null;
      })
      .filter(Boolean);
  };

  // Add task to a specific phase
  const handlePhaseTaskAdd = (phaseKey, title) => {
    if (title.trim()) {
      const t = createTask(title.trim(), c.id, '', 'normal', 'backlog', '', null);
      updateTask(t.id, { phase: phaseKey });
    }
    setAddingTaskToPhase(null);
  };

  const renderTaskTimeBadge = (t) => {
    const etime = effectiveTime(t, c);
    const est = t.estimatedDays || null;
    if (t.status === 'done' && etime !== null) {
      const isOver = est && etime > est;
      const color = isOver ? '#F97316' : '#22C55E';
      const bg = isOver ? '#FFF7ED' : '#ECFDF5';
      return <span className="inline-flex items-center py-[1px] px-1.5 rounded text-[9px] font-semibold ml-1" style={{ color, background: bg }}>{etime}d</span>;
    }
    if (t.status === 'in-progress' && etime !== null) {
      const isOver = est && etime > est;
      const color = isOver ? '#F97316' : '#5B7CF5';
      const bg = isOver ? '#FFF7ED' : '#EEF2FF';
      return <span className="inline-flex items-center py-[1px] px-1.5 rounded text-[9px] font-semibold ml-1" style={{ color, background: bg }}>{etime}d{est ? ` / ${est}d est.` : ''}</span>;
    }
    if (est && t.status === 'backlog') {
      return <span className="inline-flex items-center py-[1px] px-1.5 rounded text-[9px] font-semibold ml-1 text-text3 bg-surface2">{est}d est.</span>;
    }
    return null;
  };

  // Render a roadmap task row (new system)
  const renderRoadmapTaskRow = (t) => {
    const ts = TASK_STATUS[t.status] || TASK_STATUS.backlog;
    const tp = TASK_PRIO[t.priority] || TASK_PRIO.normal;
    const isDone = t.status === 'done';
    const isInProgress = t.status === 'in-progress';
    const blocked = isTaskBlocked(t);
    const blockingNames = blocked ? getBlockingNames(t) : [];
    const assignee = TEAM.find(m => m.name.toLowerCase() === t.assignee?.toLowerCase() || m.id === t.assignee);

    const statusRef = getDropdownRef('rd-status-' + t.id);
    const assigneeRef = getDropdownRef('rd-assignee-' + t.id);
    const prioRef = getDropdownRef('rd-prio-' + t.id);

    // Completed: collapsed single line by default
    const isExpanded = expandedCompleted['task_' + t.id];
    if (isDone && !isExpanded && hideCompleted) return null;
    if (isDone && !isExpanded) {
      return (
        <div key={t.id} className="flex items-center gap-2 py-[6px] px-3 cursor-pointer hover:bg-surface2 group" onClick={() => setExpandedCompleted(prev => ({ ...prev, ['task_' + t.id]: true }))}>
          <span className="text-[#22C55E] text-xs shrink-0">{'\u2713'}</span>
          <span className="text-[13px] text-text3 flex-1 min-w-0 truncate">{t.title}</span>
          {assignee && <span className="text-[10px] text-text3">{assignee.name}</span>}
          {renderTaskTimeBadge(t)}
        </div>
      );
    }

    return (
      <div key={t.id} className={`py-2 px-3 ${isInProgress ? 'bg-blue-bg2' : ''} ${blocked ? 'opacity-50' : ''}`}>
        {isDone && isExpanded && (
          <button className="text-[9px] text-text3 bg-transparent border-none cursor-pointer mb-1 hover:text-text font-sans" onClick={() => setExpandedCompleted(prev => ({ ...prev, ['task_' + t.id]: false }))}>Colapsar</button>
        )}
        <div className="flex items-center gap-2 group">
          {/* Status dot */}
          <div
            ref={el => statusRef.current = el}
            className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] cursor-pointer shrink-0"
            style={{ background: blocked ? '#FEF2F2' : ts.bg, color: blocked ? '#EF4444' : ts.color, border: `1.5px solid ${blocked ? '#EF4444' : ts.color}` }}
            onClick={(e) => { e.stopPropagation(); setOpenDropdown(prev => prev === 'rd-status-' + t.id ? null : 'rd-status-' + t.id); }}
            title={blocked ? 'Bloqueada' : ts.label}
          >{blocked ? '\uD83D\uDD12' : ts.icon}</div>
          <Dropdown
            open={openDropdown === 'rd-status-' + t.id}
            onClose={() => setOpenDropdown(null)}
            anchorRef={statusRef}
            items={Object.entries(TASK_STATUS).map(([k, v]) => ({ label: v.label, icon: v.icon, iconColor: v.color, onClick: () => updateTask(t.id, { status: k }) }))}
          />

          {/* Title */}
          <span className={`text-[13px] font-medium flex-1 min-w-0 cursor-text py-[1px] px-1 rounded-[3px] hover:bg-surface2 ${isDone ? 'text-text3' : ''}`} onDoubleClick={(e) => {
            const input = document.createElement('input');
            input.className = 'border border-blue rounded-[3px] py-[2px] px-1.5 text-[13px] font-sans outline-none w-full';
            input.value = t.title;
            let saved = false;
            const doSave = () => { if (saved) return; saved = true; updateTask(t.id, { title: input.value.trim() || t.title }); };
            input.onblur = doSave;
            input.onkeydown = (ev) => { if (ev.key === 'Enter') input.blur(); if (ev.key === 'Escape') { input.value = t.title; input.blur(); } };
            e.target.replaceWith(input);
            input.focus(); input.select();
          }}>
            {t.title}
            {t.isClientTask && <span className="text-[9px] font-bold text-orange ml-1.5 uppercase tracking-[0.5px]">CLIENTE</span>}
          </span>

          {/* Assignee */}
          <div
            ref={el => assigneeRef.current = el}
            className="cursor-pointer relative shrink-0"
            onClick={(e) => { e.stopPropagation(); setOpenDropdown(prev => prev === 'rd-assignee-' + t.id ? null : 'rd-assignee-' + t.id); }}
          >
            <div className="flex items-center gap-[3px] py-[1px] px-1 rounded-[3px] text-[10px] text-text2 hover:bg-surface2">
              {assignee ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold shrink-0" style={{ background: assignee.color + '18', color: assignee.color }}>{assignee.initials}</span>
                  {assignee.name}
                </>
              ) : <span className="text-text3 opacity-0 group-hover:opacity-100">+ Asignar</span>}
            </div>
          </div>
          <Dropdown
            open={openDropdown === 'rd-assignee-' + t.id}
            onClose={() => setOpenDropdown(null)}
            anchorRef={assigneeRef}
            items={[{ label: 'Sin asignar', onClick: () => updateTask(t.id, { assignee: '' }) }, ...TEAM.map(m => ({ node: <><span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ background: m.color + '18', color: m.color }}>{m.initials}</span>{m.name}</>, onClick: () => updateTask(t.id, { assignee: m.name }) }))]}
          />

          {/* Time badge */}
          {renderTaskTimeBadge(t)}

          {/* Priority (only show if urgent/high) */}
          {(t.priority === 'urgent' || t.priority === 'high') && (
            <div
              ref={el => prioRef.current = el}
              className="cursor-pointer shrink-0"
              onClick={(e) => { e.stopPropagation(); setOpenDropdown(prev => prev === 'rd-prio-' + t.id ? null : 'rd-prio-' + t.id); }}
            >
              <div className="flex items-center gap-[2px] py-[1px] px-1 rounded-[3px] text-[10px] font-semibold hover:bg-surface2" style={{ color: tp.color }}>{tp.flag}</div>
            </div>
          )}
          {(t.priority === 'urgent' || t.priority === 'high') && (
            <Dropdown
              open={openDropdown === 'rd-prio-' + t.id}
              onClose={() => setOpenDropdown(null)}
              anchorRef={prioRef}
              items={Object.entries(TASK_PRIO).map(([k, v]) => ({ label: v.label, icon: v.flag, iconColor: v.color, onClick: () => updateTask(t.id, { priority: k }) }))}
            />
          )}

          {/* Delete */}
          <button className="bg-transparent border-none text-text3 cursor-pointer text-[10px] opacity-0 group-hover:opacity-100 transition-opacity p-[2px] hover:text-red shrink-0" onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}>{'\u2715'}</button>
        </div>

        {/* Blocked warning */}
        {blocked && blockingNames.length > 0 && (
          <div className="text-[11px] text-red ml-6 mt-0.5">Bloqueada por: {blockingNames.join(', ')}</div>
        )}

        {/* Expandable description */}
        {expandedTasks[t.id] && (
          <div className="mt-1 ml-6">
            <textarea
              className="w-full border border-border rounded-md py-2 px-2.5 text-xs font-sans resize-y min-h-[60px] outline-none bg-white focus:border-blue"
              placeholder="Descripcion de la tarea..."
              defaultValue={t.description || ''}
              onBlur={(e) => updateTask(t.id, { description: e.target.value })}
            />
          </div>
        )}
        {(t.description || t.notes) && (
          <button className="bg-transparent border-none text-text3 cursor-pointer text-[10px] ml-6 mt-0.5 hover:text-blue font-sans" onClick={() => setExpandedTasks(prev => ({ ...prev, [t.id]: !prev[t.id] }))}>{expandedTasks[t.id] ? '\u25B2 Ocultar' : '\u25BC Detalle'}</button>
        )}
      </div>
    );
  };

  // Build phase groups for the new task-based roadmap
  const buildPhaseGroups = () => {
    const phaseOrder = Object.keys(PHASES);
    // Also include custom phases
    const customPhaseKeys = (c.customPhases || []).map(cp => cp.id);
    const allPhaseKeys = [...phaseOrder, ...customPhaseKeys];

    return allPhaseKeys.map(phaseKey => {
      const phInfo = allPh[phaseKey] || { label: phaseKey, color: '#5B7CF5' };
      // Get roadmap tasks for this phase
      let phaseTasks = roadmapTasks.filter(t => t.phase === phaseKey);
      // Also include non-roadmap tasks that have this phase
      const manualTasks = clientTasks.filter(t => !t.isRoadmapTask && t.phase === phaseKey);
      const allPhaseTasks = [...phaseTasks, ...manualTasks];

      if (allPhaseTasks.length === 0 && phase !== 'all' && phase !== phaseKey) return null;
      if (phase !== 'all' && phase !== phaseKey) return null;

      const doneTasks = allPhaseTasks.filter(t => t.status === 'done').length;

      return {
        phaseKey,
        phInfo,
        tasks: allPhaseTasks,
        doneCount: doneTasks,
        totalCount: allPhaseTasks.length,
      };
    }).filter(Boolean);
  };

  const phaseGroups = useNewSystem ? buildPhaseGroups() : null;

  // ===== FALLBACK: Old step-based roadmap =====
  // (keeping for backward compat with existing clients that don't have roadmap tasks)
  const renderOldRoadmap = () => {
    let timelineItems = PROCESS_STEPS.map((s, i) => ({ s, i, cs: c.steps[i], isCustom: false })).filter(x => phase === 'all' || x.s.phase === phase);
    const customs = c.customSteps || [];
    customs.forEach((cs, ci) => {
      if (phase === 'all' || phase === cs.phase) {
        timelineItems.push({ s: { id: 'custom_' + ci, name: cs.name, phase: cs.phase || 'auditoria', days: cs.days || 7, client: false, dependsOn: [] }, i: PROCESS_STEPS.length + ci, cs, isCustom: true, customIdx: ci });
      }
    });
    if (hideCompleted) timelineItems = timelineItems.filter(x => x.cs.status !== 'completed');

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

    return oldPhaseGroups.map(pg => {
      const phInfo = allPh[pg.phase] || { label: pg.phase, color: '#5B7CF5' };
      const standardSteps = PROCESS_STEPS.filter(x => x.phase === pg.phase);
      const dn = standardSteps.filter(x => { const idx = PROCESS_STEPS.indexOf(x); return c.steps[idx]?.status === 'completed'; }).length;
      const customInPhase = (c.customSteps || []).filter(x => x.phase === pg.phase);
      const customDone = customInPhase.filter(x => x.status === 'completed').length;

      return (
        <div key={pg.phase} className="mb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 py-[4px] px-2.5 rounded-full text-[11px] font-bold text-white" style={{ background: phInfo.color }}>
              {phInfo.label}
              <span className="text-[9px] font-normal opacity-80">{dn + customDone}/{standardSteps.length + customInPhase.length}</span>
            </span>
          </div>
          <div className="rounded-lg overflow-hidden" style={{ borderLeft: `3px solid ${phInfo.color}` }}>
            {pg.items.map(({ s, i, cs, isCustom }) => {
              const cfg = STATUS[cs.status] || STATUS.pending;
              const isCompleted = cs.status === 'completed';
              let d = null;
              if (cs.startDate && cs.endDate) d = daysBetween(cs.startDate, cs.endDate);
              else if (cs.startDate && cs.status !== 'pending') d = daysAgo(cs.startDate);

              return (
                <div key={i} className="flex items-center gap-2 py-[6px] px-3 hover:bg-surface2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.color }} />
                  <span className={`text-[13px] flex-1 ${isCompleted ? 'text-text3' : 'text-text'}`}>{isCustom ? s.name : getStepNameForClient(c, i)}</span>
                  {s.client && <span className="text-[9px] font-bold text-orange uppercase tracking-[0.5px]">CLIENTE</span>}
                  {d !== null && <span className="text-[10px] text-text3">{d}d</span>}
                  {cs.responsible && <span className="text-[10px] text-text3">{cs.responsible}</span>}
                </div>
              );
            })}
          </div>
        </div>
      );
    });
  };

  const sentEmoji = { positive: '\uD83D\uDE0A', neutral: '\uD83D\uDE10', negative: '\uD83D\uDE1F' };

  // Brain points
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

      {/* Phase bar */}
      {(() => {
        const phaseEntries = Object.entries(allPh);
        const totalSteps = useNewSystem ? roadmapTasks.length : (PROCESS_STEPS.length + (c.customSteps || []).length);
        return (
          <div className="mb-3.5">
            <div className="flex rounded-lg overflow-hidden h-[30px] cursor-pointer mb-2">
              {phaseEntries.map(([k, v]) => {
                const stepsInPhase = useNewSystem
                  ? roadmapTasks.filter(t => t.phase === k).length
                  : (PROCESS_STEPS.filter(s => s.phase === k).length + (c.customSteps || []).filter(cs => cs.phase === k).length);
                const widthPct = totalSteps > 0 ? (stepsInPhase / totalSteps * 100) : 0;
                if (widthPct === 0) return null;
                const isActive = phase === k;
                return (
                  <div key={k} className="flex items-center justify-center text-[10px] font-semibold text-white whitespace-nowrap overflow-hidden transition-all" style={{ width: widthPct + '%', background: v.color, opacity: isActive || phase === 'all' ? 1 : 0.4 }} onClick={() => setPhase(prev => prev === k ? 'all' : k)} title={v.label}>
                    {widthPct > 8 && v.label}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button className={`py-[5px] px-2.5 rounded-full cursor-pointer text-[10px] font-medium whitespace-nowrap border font-sans ${phase === 'all' ? 'bg-blue text-white border-blue' : 'bg-transparent text-text3 border-border hover:text-text hover:bg-surface2'}`} onClick={() => setPhase('all')}>Todos</button>
              <label className="ml-auto flex items-center gap-1.5 text-[11px] text-text3 cursor-pointer select-none whitespace-nowrap">
                <input type="checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} className="cursor-pointer" /> Ocultar completados
              </label>
            </div>
          </div>
        );
      })()}

      {/* Main grid */}
      <div className="grid gap-4 max-md:grid-cols-1" style={{ gridTemplateColumns: '1fr 320px' }}>
        {/* Left: Timeline/Roadmap */}
        <div>
          {useNewSystem ? (
            /* NEW SYSTEM: Tasks grouped by phase */
            <>
              {phaseGroups.map(pg => {
                const phaseTimings = getPhaseTimings(c, tasks);
                const pt = phaseTimings[pg.phaseKey];

                return (
                  <div key={pg.phaseKey} className="mb-4">
                    {/* Phase header pill */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="inline-flex items-center gap-1.5 py-[4px] px-2.5 rounded-full text-[11px] font-bold text-white" style={{ background: pg.phInfo.color }}>
                        {pg.phInfo.label}
                        <span className="text-[9px] font-normal opacity-80">{pg.doneCount}/{pg.totalCount}</span>
                      </span>
                      {pt?.actualDays != null && <span className="text-[10px] text-text3">{pt.actualDays}d</span>}
                    </div>

                    {/* Task list */}
                    <div className="rounded-lg overflow-hidden" style={{ borderLeft: `3px solid ${pg.phInfo.color}` }}>
                      {pg.tasks.map(t => renderRoadmapTaskRow(t))}
                    </div>

                    {/* Add task button */}
                    {addingTaskToPhase === pg.phaseKey ? (
                      <div className="ml-[3px] mt-1">
                        <input
                          className="border border-blue rounded-[3px] py-[4px] px-2 text-[12px] font-sans outline-none w-[280px]"
                          placeholder="Nombre de la tarea..."
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') handlePhaseTaskAdd(pg.phaseKey, e.target.value); if (e.key === 'Escape') setAddingTaskToPhase(null); }}
                          onBlur={(e) => { if (e.target.value.trim()) handlePhaseTaskAdd(pg.phaseKey, e.target.value); else setAddingTaskToPhase(null); }}
                        />
                      </div>
                    ) : (
                      <button className="inline-flex items-center gap-1 text-[10px] text-text3 cursor-pointer mt-0.5 ml-[3px] py-[1px] px-1 rounded bg-transparent border-none font-sans hover:text-blue hover:bg-blue-bg" onClick={() => setAddingTaskToPhase(pg.phaseKey)}>+ Tarea</button>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            /* OLD SYSTEM: Step-based roadmap (backward compat) */
            renderOldRoadmap()
          )}
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
                    <div key={fi} className="py-2.5 px-4 border-b border-border last:border-b-0">
                      <div className="text-xs leading-relaxed mb-1">{f.text}</div>
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

          {/* Brain */}
          <div className="bg-white border border-border rounded-[10px] overflow-hidden mb-3">
            <div className="py-3 px-4 border-b border-border text-[13px] font-bold">Cerebro del cliente</div>
            <div className="py-3 px-4">
              {!brainPoints.length ? (
                <div className="text-center text-text3 text-xs py-3.5">El cerebro se nutre de llamadas, feedback y datos del roadmap.</div>
              ) : (
                brainPoints.map((bp, i) => (
                  <div key={i} className="flex gap-2 py-[5px] border-b border-border text-xs leading-relaxed">
                    <span className="shrink-0">{typeIcons[bp.type] || '\u2022'}</span>
                    <div><div>{bp.text}</div><div className="text-[9px] text-text3 mt-[1px]">{bp.source}</div></div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* History */}
          <div className="bg-white border border-border rounded-[10px] overflow-hidden mb-3">
            <div className="py-3 px-4 border-b border-border text-[13px] font-bold">Historial</div>
            <div className="py-3 px-4">
              {!c.history.length ? (
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
    </div>
  );
}
