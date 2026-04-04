import { useState, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { PROCESS_STEPS, PHASES, PRIO_CLIENT, STATUS, TASK_PRIO, TASK_STATUS, TASK_STATUS_ORDER, TEAM } from '../utils/constants';
import { initials, progress, currentStep, getBottleneck, getPhaseTimings, getAllPhases, getStepNameForClient, daysAgo, daysBetween, fmtDate, clientPill, today, effectiveTime } from '../utils/helpers';
import Modal from '../components/Modal';
import Dropdown from '../components/Dropdown';
import StatusPill from '../components/StatusPill';

const PHASE_COLORS = ['#5B7CF5','#22C55E','#EAB308','#F97316','#8B5CF6','#06B6D4','#EC4899','#EF4444','#14B8A6','#A855F7'];

export default function ClientDetail({ client: c }) {
  const { setSelectedId, updateClient, tasks, createTask, updateTask, deleteTask, save, clients, currentUser } = useApp();
  const [phase, setPhase] = useState('all');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [stepModal, setStepModal] = useState(null); // { idx, isCustom, customIdx }
  const [depsModal, setDepsModal] = useState(null); // { idx } - only for standard steps
  const [depsForm, setDepsForm] = useState([]);
  const [editModal, setEditModal] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState(false);
  const [clientFbModal, setClientFbModal] = useState(false);
  const [customRoadmapModal, setCustomRoadmapModal] = useState(false);
  const [crTab, setCrTab] = useState('section');
  const [crColor, setCrColor] = useState('#8B5CF6');
  const [openDropdown, setOpenDropdown] = useState(null);
  const [expandedTasks, setExpandedTasks] = useState({});
  const [openTranscription, setOpenTranscription] = useState({});
  const [addingTaskToStep, setAddingTaskToStep] = useState(null);
  const [editingStartDate, setEditingStartDate] = useState(false);
  const [expandedCompleted, setExpandedCompleted] = useState({});

  const dropdownRefs = useRef({});

  const pct = progress(c);
  const cur = currentStep(c);
  const days = daysAgo(c.startDate);
  const p = c.priority || 4;
  const pcfg = PRIO_CLIENT[p];
  const pill = clientPill(c);
  const bn = getBottleneck(c);
  const ct = tasks.filter(t => t.clientId === c.id && t.status !== 'done').length;
  const allPh = getAllPhases(c);
  const clientTasks = tasks.filter(t => t.clientId === c.id);

  const getDropdownRef = useCallback((key) => {
    if (!dropdownRefs.current[key]) dropdownRefs.current[key] = { current: null };
    return dropdownRefs.current[key];
  }, []);

  // Step modal form state
  const [stepForm, setStepForm] = useState({});
  const openStepModal = (idx, isCustom = false, customIdx = null) => {
    let cs;
    if (isCustom) {
      cs = c.customSteps[customIdx];
    } else {
      cs = c.steps[idx];
    }
    setStepForm({
      status: cs.status || 'pending',
      startDate: cs.startDate || '',
      endDate: cs.endDate || '',
      responsible: cs.responsible || '',
      notes: cs.notes || '',
    });
    setStepModal({ idx, isCustom, customIdx });
  };

  const saveStep = () => {
    if (!stepModal) return;
    const { idx, isCustom, customIdx } = stepModal;
    const newSteps = [...c.steps];
    const newCustomSteps = [...(c.customSteps || [])];
    const newHistory = [...c.history];

    // Auto-set dates based on status change
    const autoForm = { ...stepForm };
    if (isCustom) {
      const old = newCustomSteps[customIdx].status;
      if (autoForm.status !== old) {
        if (autoForm.status === 'in-progress' && !autoForm.startDate) autoForm.startDate = today();
        if (autoForm.status === 'completed' && !autoForm.endDate) autoForm.endDate = today();
      }
      const cs = { ...newCustomSteps[customIdx] };
      Object.assign(cs, autoForm);
      newCustomSteps[customIdx] = cs;
      if (old !== autoForm.status) {
        newHistory.push({ text: `${cs.name} \u2192 ${STATUS[autoForm.status]?.label || autoForm.status}`, date: today(), color: STATUS[autoForm.status]?.color || '#5B7CF5' });
      }
      updateClient(c.id, { customSteps: newCustomSteps, history: newHistory });
    } else {
      const old = newSteps[idx].status;
      if (autoForm.status !== old) {
        if (autoForm.status === 'in-progress' && !autoForm.startDate) autoForm.startDate = today();
        if (autoForm.status === 'completed' && !autoForm.endDate) autoForm.endDate = today();
      }
      newSteps[idx] = { ...newSteps[idx], ...autoForm };
      if (old !== autoForm.status) {
        newHistory.push({ text: `${PROCESS_STEPS[idx].name} \u2192 ${STATUS[autoForm.status]?.label || autoForm.status}`, date: today(), color: STATUS[autoForm.status]?.color || '#5B7CF5' });
      }
      updateClient(c.id, { steps: newSteps, history: newHistory });
    }
    setStepModal(null);
  };

  // Dependencies modal
  const openDepsModal = (idx) => {
    const currentDeps = c.steps[idx]?.dependsOn || PROCESS_STEPS[idx]?.dependsOn || [];
    setDepsForm([...currentDeps]);
    setDepsModal({ idx });
  };
  const saveDeps = () => {
    if (!depsModal) return;
    const newSteps = [...c.steps];
    newSteps[depsModal.idx] = { ...newSteps[depsModal.idx], dependsOn: [...depsForm] };
    updateClient(c.id, { steps: newSteps });
    setDepsModal(null);
  };

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

  // Custom roadmap
  const [crSectionForm, setCrSectionForm] = useState({ name: '', phase: 'pre-onboarding', days: 7, resp: '' });
  const [crPhaseName, setCrPhaseName] = useState('');
  const saveCustomRoadmap = () => {
    if (crTab === 'phase') {
      if (!crPhaseName.trim()) return;
      const id = 'custom_phase_' + Date.now();
      const newPhases = [...(c.customPhases || []), { id, label: crPhaseName.trim(), color: crColor }];
      const newHistory = [...c.history, { text: 'Nueva fase: ' + crPhaseName.trim(), date: today(), color: crColor }];
      updateClient(c.id, { customPhases: newPhases, history: newHistory });
    } else {
      if (!crSectionForm.name.trim()) return;
      const newSteps = [...(c.customSteps || []), { name: crSectionForm.name.trim(), phase: crSectionForm.phase, status: 'pending', startDate: '', endDate: '', responsible: crSectionForm.resp, notes: '', days: crSectionForm.days }];
      const newHistory = [...c.history, { text: 'Nueva seccion: ' + crSectionForm.name.trim(), date: today(), color: '#5B7CF5' }];
      updateClient(c.id, { customSteps: newSteps, history: newHistory });
    }
    setCustomRoadmapModal(false);
  };

  const deleteCustomStep = (customIdx) => {
    if (!confirm('Eliminar esta fase personalizada?')) return;
    const stepIdx = PROCESS_STEPS.length + customIdx;
    const tasksToDelete = tasks.filter(t => t.clientId === c.id && t.stepIdx === stepIdx);
    tasksToDelete.forEach(t => deleteTask(t.id));
    const newCustom = [...(c.customSteps || [])];
    newCustom.splice(customIdx, 1);
    updateClient(c.id, { customSteps: newCustom });
  };

  const editSectionTitle = (stepIdx, isCustom) => {
    if (isCustom) {
      const cs = c.customSteps[stepIdx];
      const newName = prompt('Nuevo nombre de la seccion:', cs.name);
      if (newName?.trim()) {
        const newCustom = [...(c.customSteps || [])];
        newCustom[stepIdx] = { ...newCustom[stepIdx], name: newName.trim() };
        updateClient(c.id, { customSteps: newCustom });
      }
    } else {
      const currentName = c.stepNameOverrides?.[stepIdx] || PROCESS_STEPS[stepIdx].name;
      const newName = prompt('Nuevo nombre de la seccion:', currentName);
      if (newName?.trim()) {
        updateClient(c.id, { stepNameOverrides: { ...(c.stepNameOverrides || {}), [stepIdx]: newName.trim() } });
      }
    }
  };

  const editPhaseTitle = (phaseId) => {
    const cp = (c.customPhases || []).find(pp => pp.id === phaseId);
    if (cp) {
      const newName = prompt('Nuevo nombre de la fase:', cp.label);
      if (newName?.trim()) {
        const newPhases = (c.customPhases || []).map(pp => pp.id === phaseId ? { ...pp, label: newName.trim() } : pp);
        updateClient(c.id, { customPhases: newPhases });
      }
    } else {
      const stdPhase = PHASES[phaseId];
      const currentName = c.phaseNameOverrides?.[phaseId] || (stdPhase ? stdPhase.label : phaseId);
      const newName = prompt('Nuevo nombre de la fase:', currentName);
      if (newName?.trim()) {
        updateClient(c.id, { phaseNameOverrides: { ...(c.phaseNameOverrides || {}), [phaseId]: newName.trim() } });
      }
    }
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

  // Cycle task status
  const cycleTaskStatus = (taskId) => {
    const key = 'status-' + taskId;
    setOpenDropdown(prev => prev === key ? null : key);
  };

  // Step task add inline
  const handleStepTaskAdd = (stepIdx, title) => {
    if (title.trim()) {
      createTask(title.trim(), c.id, '', 'normal', 'backlog', '', stepIdx);
    }
    setAddingTaskToStep(null);
  };

  const renderTaskTimeBadge = (t, stepDays) => {
    const etime = effectiveTime(t, c);
    if (etime === null) return null;
    const isDone = t.status === 'done';
    const isOver = stepDays && etime > stepDays;
    const color = isDone ? (isOver ? '#F97316' : '#22C55E') : (isOver ? '#F97316' : '#5B7CF5');
    const bg = isDone ? (isOver ? '#FFF7ED' : '#ECFDF5') : (isOver ? '#FFF7ED' : '#EEF2FF');
    return (
      <span className="inline-flex items-center py-[1px] px-1.5 rounded text-[9px] font-semibold ml-1" style={{ color, background: bg }}>{etime}d</span>
    );
  };

  const renderStepTaskRow = (t, stepDays) => {
    const ts = TASK_STATUS[t.status] || TASK_STATUS.backlog;
    const tp = TASK_PRIO[t.priority] || TASK_PRIO.normal;
    const isDone = t.status === 'done';
    const assignee = TEAM.find(m => m.name.toLowerCase() === t.assignee?.toLowerCase() || m.id === t.assignee);

    const assigneeRef = getDropdownRef('step-assignee-' + t.id);
    const prioRef = getDropdownRef('step-prio-' + t.id);
    const statusRef = getDropdownRef('step-status-' + t.id);

    return (
      <div key={t.id} className="grid items-center gap-1.5 py-1 border-b border-border last:border-b-0 text-[11px] hover:bg-blue-bg2 hover:mx-[-4px] hover:px-1 hover:rounded-[3px] group" style={{ gridTemplateColumns: '20px 1fr 90px 70px 24px' }}>
        <div
          ref={el => statusRef.current = el}
          className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] cursor-pointer shrink-0"
          style={{ background: ts.bg, color: ts.color, border: `1.5px solid ${ts.color}` }}
          onClick={(e) => { e.stopPropagation(); cycleTaskStatus(t.id); }}
          title={ts.label}
        >{ts.icon}</div>
        <Dropdown
          open={openDropdown === 'status-' + t.id}
          onClose={() => setOpenDropdown(null)}
          anchorRef={statusRef}
          items={Object.entries(TASK_STATUS).map(([k, v]) => ({ label: v.label, icon: v.icon, iconColor: v.color, onClick: () => updateTask(t.id, { status: k }) }))}
        />
        <span className={`cursor-text py-[1px] px-1 rounded-[3px] ${isDone ? 'line-through text-text3' : ''}`} onDoubleClick={(e) => {
          const input = document.createElement('input');
          input.className = 'border border-blue rounded-[3px] py-[2px] px-1.5 text-[11px] font-sans outline-none w-full';
          input.value = t.title;
          let saved = false;
          const doSave = () => { if (saved) return; saved = true; updateTask(t.id, { title: input.value.trim() || t.title }); };
          input.onblur = doSave;
          input.onkeydown = (ev) => { if (ev.key === 'Enter') input.blur(); if (ev.key === 'Escape') { input.value = t.title; input.blur(); } };
          e.target.replaceWith(input);
          input.focus(); input.select();
        }}>{t.title}{(t.status === 'in-progress' || t.status === 'done') && renderTaskTimeBadge(t, stepDays)}</span>
        <div
          ref={el => assigneeRef.current = el}
          className="cursor-pointer relative"
          onClick={(e) => { e.stopPropagation(); setOpenDropdown(prev => prev === 'step-assignee-' + t.id ? null : 'step-assignee-' + t.id); }}
        >
          <div className="flex items-center gap-[3px] py-[1px] px-1 rounded-[3px] text-[10px] text-text2 hover:bg-surface2">
            {assignee ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold shrink-0" style={{ background: assignee.color + '18', color: assignee.color }}>{assignee.initials}</span>
                {assignee.name}
              </>
            ) : <span className="text-text3">+ Asignar</span>}
          </div>
        </div>
        <Dropdown
          open={openDropdown === 'step-assignee-' + t.id}
          onClose={() => setOpenDropdown(null)}
          anchorRef={assigneeRef}
          items={[{ label: 'Sin asignar', onClick: () => updateTask(t.id, { assignee: '' }) }, ...TEAM.map(m => ({ label: m.name, icon: m.initials, iconColor: m.color, node: <><span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ background: m.color + '18', color: m.color }}>{m.initials}</span>{m.name}</>, onClick: () => updateTask(t.id, { assignee: m.name }) }))]}
        />
        <div
          ref={el => prioRef.current = el}
          className="cursor-pointer relative"
          onClick={(e) => { e.stopPropagation(); setOpenDropdown(prev => prev === 'step-prio-' + t.id ? null : 'step-prio-' + t.id); }}
        >
          <div className="flex items-center gap-[2px] py-[1px] px-1 rounded-[3px] text-[10px] font-semibold hover:bg-surface2" style={{ color: tp.color }}>{tp.flag} {tp.label}</div>
        </div>
        <Dropdown
          open={openDropdown === 'step-prio-' + t.id}
          onClose={() => setOpenDropdown(null)}
          anchorRef={prioRef}
          items={Object.entries(TASK_PRIO).map(([k, v]) => ({ label: v.label, icon: v.flag, iconColor: v.color, onClick: () => updateTask(t.id, { priority: k }) }))}
        />
        <button className="bg-transparent border-none text-text3 cursor-pointer text-[10px] opacity-0 group-hover:opacity-100 transition-opacity p-[2px] hover:text-red" onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}>{'\u2715'}</button>
      </div>
    );
  };

  // Build timeline items
  let timelineItems = PROCESS_STEPS.map((s, i) => ({ s, i, cs: c.steps[i], isCustom: false })).filter(x => phase === 'all' || x.s.phase === phase);
  const customs = c.customSteps || [];
  customs.forEach((cs, ci) => {
    if (phase === 'all' || phase === cs.phase) {
      timelineItems.push({ s: { id: 'custom_' + ci, name: cs.name, phase: cs.phase || 'auditoria', days: cs.days || 7, client: false, dependsOn: [] }, i: PROCESS_STEPS.length + ci, cs, isCustom: true, customIdx: ci });
    }
  });
  if (hideCompleted) timelineItems = timelineItems.filter(x => x.cs.status !== 'completed');

  // Group by phase
  const phaseGroups = [];
  let currentPhase = '';
  timelineItems.forEach(item => {
    if (item.s.phase !== currentPhase) {
      currentPhase = item.s.phase;
      phaseGroups.push({ phase: item.s.phase, items: [item] });
    } else {
      phaseGroups[phaseGroups.length - 1].items.push(item);
    }
  });

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
  c.steps.forEach((s, si) => { if (s.notes) brainPoints.push({ text: PROCESS_STEPS[si].name + ': ' + s.notes, source: 'Roadmap', type: 'step' }); });
  const typeIcons = { call: '\uD83C\uDFA7', complaint: '\u26A0\uFE0F', problem: '\u26A0\uFE0F', suggestion: '\uD83D\uDCA1', request: '\uD83D\uDCCC', bottleneck: '\u26D4', note: '\uD83D\uDCDD', step: '\uD83D\uDEE4\uFE0F' };

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
          <div className="flex justify-between text-[11px] text-text2"><span>Progreso</span><span>{pct}% {'\u00B7'} {c.steps.filter(s => s.status === 'completed').length}/{c.steps.length}</span></div>
          <div className="h-[5px] bg-surface3 rounded-[3px] overflow-hidden mt-1.5">
            <div className="h-full rounded-[3px] bg-blue" style={{ width: pct + '%' }} />
          </div>
        </div>

        {bn && (
          <div className="mt-3 bg-red-bg border border-[#fecaca] rounded-md py-2 px-3 text-xs text-red">{'\u26A1'} {bn}</div>
        )}
      </div>

      {/* Phase bar - horizontal proportional segments */}
      {(() => {
        const phaseEntries = Object.entries(allPh);
        const totalSteps = PROCESS_STEPS.length + customs.length;
        return (
          <div className="mb-3.5">
            <div className="flex rounded-lg overflow-hidden h-[30px] cursor-pointer mb-2">
              {phaseEntries.map(([k, v]) => {
                const stepsInPhase = PROCESS_STEPS.filter(s => s.phase === k).length + customs.filter(cs => cs.phase === k).length;
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
        {/* Left: Timeline - minimal vertical list */}
        <div>
          {phaseGroups.map(pg => {
            const phInfo = allPh[pg.phase] || { label: pg.phase, color: '#5B7CF5' };
            const standardSteps = PROCESS_STEPS.filter(x => x.phase === pg.phase);
            const dn = standardSteps.filter(x => { const idx = PROCESS_STEPS.indexOf(x); return c.steps[idx]?.status === 'completed'; }).length;
            const customInPhase = customs.filter(x => x.phase === pg.phase);
            const customDone = customInPhase.filter(x => x.status === 'completed').length;
            const phaseTimings = getPhaseTimings(c);
            const pt = phaseTimings[pg.phase];

            return (
              <div key={pg.phase} className="mb-4">
                {/* Phase header - pill style */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1.5 py-[4px] px-2.5 rounded-full text-[11px] font-bold text-white" style={{ background: phInfo.color }}>
                    {phInfo.label}
                    <span className="text-[9px] font-normal opacity-80">{dn + customDone}/{standardSteps.length + customInPhase.length}</span>
                  </span>
                  <button className="bg-transparent border-none cursor-pointer text-[10px] text-text3 hover:text-text" onClick={() => editPhaseTitle(pg.phase)} title="Renombrar fase">{'\u270E'}</button>
                  {pt?.actualDays != null && <span className="text-[10px] text-text3">{pt.actualDays}d</span>}
                </div>

                {/* Steps - flat list with colored left border */}
                <div className="rounded-lg overflow-hidden" style={{ borderLeft: `3px solid ${phInfo.color}` }}>
                  {pg.items.map(({ s, i, cs, isCustom, customIdx }) => {
                    const cfg = STATUS[cs.status] || STATUS.pending;
                    const isCompleted = cs.status === 'completed';
                    const isActive = cs.status === 'in-progress';
                    let d = null;
                    if (cs.startDate && cs.endDate) d = daysBetween(cs.startDate, cs.endDate);
                    else if (cs.startDate && cs.status !== 'pending') d = daysAgo(cs.startDate);
                    const over = d !== null && d > s.days && !isCompleted;
                    const stepTasks = clientTasks.filter(t => t.stepIdx === i);
                    const deps = (!isCustom && cs.dependsOn) ? cs.dependsOn : ((!isCustom && s.dependsOn) ? s.dependsOn : []);
                    const unmetDeps = deps.filter(di => c.steps[di] && c.steps[di].status !== 'completed');
                    const depsBlocked = unmetDeps.length > 0 && !isCompleted;
                    const depsLabel = unmetDeps.map(di => PROCESS_STEPS[di]?.name || '?').join(', ');
                    const isExpanded = expandedCompleted[`${pg.phase}_${i}`];

                    // Completed steps: collapsed single line
                    if (isCompleted && !isExpanded) {
                      return (
                        <div key={i} className="flex items-center gap-2 py-[6px] px-3 cursor-pointer hover:bg-surface2 group" onClick={() => setExpandedCompleted(prev => ({ ...prev, [`${pg.phase}_${i}`]: true }))}>
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#22C55E' }} />
                          <span className="text-[13px] text-text3 line-through">{isCustom ? s.name : getStepNameForClient(c, i)}</span>
                          {d !== null && <span className="text-[10px] text-text3 ml-auto">{d}d</span>}
                          <button className="shrink-0 bg-transparent border-none text-text3 cursor-pointer text-[10px] opacity-0 group-hover:opacity-100 ml-1" onClick={(e) => { e.stopPropagation(); openStepModal(i, isCustom, isCustom ? customIdx : null); }}>{'\u270E'}</button>
                        </div>
                      );
                    }

                    return (
                      <div key={i} className={`py-2 px-3 ${isActive ? 'bg-blue-bg2' : ''} ${depsBlocked ? 'opacity-60' : ''}`}>
                        {/* Collapse button for expanded completed */}
                        {isCompleted && isExpanded && (
                          <button className="text-[9px] text-text3 bg-transparent border-none cursor-pointer mb-1 hover:text-text font-sans" onClick={() => setExpandedCompleted(prev => ({ ...prev, [`${pg.phase}_${i}`]: false }))}>Colapsar</button>
                        )}
                        <div className="flex items-center gap-2">
                          {/* Status dot - 8px */}
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: depsBlocked ? '#9CA3AF' : cfg.color }} />
                          {/* Step name */}
                          <span className="text-[13px] font-medium flex-1 min-w-0">
                            {depsBlocked && <span className="mr-1">{'\uD83D\uDD12'}</span>}
                            {isCustom ? s.name : getStepNameForClient(c, i)}
                            {s.client && <span className="text-[9px] font-bold text-orange ml-1.5 uppercase tracking-[0.5px]">CLIENTE</span>}
                            {isCustom && <span className="text-[9px] font-bold text-blue ml-1.5 uppercase tracking-[0.5px]">PERSONALIZADO</span>}
                          </span>
                          {/* Time badge */}
                          {isCompleted && d !== null ? (
                            <span className={`text-[10px] font-semibold ${d > s.days ? 'text-orange' : 'text-green'}`}>Completado en {d}d</span>
                          ) : (
                            <span className={`text-[10px] ${over ? 'text-orange font-semibold' : 'text-text3'}`}>Est: {s.days}d{d !== null && cs.status !== 'pending' ? <>{' '}<span className={d > s.days ? 'text-orange font-semibold' : 'text-green'}>Real: {d}d</span></> : ''}{over ? ' (+' + (d - s.days) + ')' : ''}</span>
                          )}
                          {/* Responsible */}
                          {cs.responsible && <span className="text-[10px] text-text3">{cs.responsible}</span>}
                          {/* Edit buttons */}
                          <div className="flex gap-1 shrink-0">
                            <button className="bg-transparent border-none cursor-pointer text-[9px] text-text3 hover:text-text" onClick={() => editSectionTitle(isCustom ? customIdx : i, isCustom)} title="Renombrar">{'\u270E'}</button>
                            {!isCustom && <button className="bg-transparent border-none cursor-pointer text-[9px] text-text3 hover:text-blue" onClick={() => openDepsModal(i)} title="Configurar dependencias">{'\uD83D\uDD17'}</button>}
                            <button className="bg-transparent border-none cursor-pointer text-[9px] text-text3 hover:text-text" onClick={() => openStepModal(i, isCustom, isCustom ? customIdx : null)}>{'\u2699'}</button>
                            {isCustom && <button className="bg-transparent border-none cursor-pointer text-[9px] text-red hover:text-red" onClick={() => deleteCustomStep(customIdx)}>{'\u2715'}</button>}
                          </div>
                        </div>
                        {/* Dependency warning */}
                        {depsBlocked && (
                          <div className="text-[10px] text-orange ml-4 mt-0.5">Requiere: {depsLabel}</div>
                        )}
                        {/* Notes */}
                        {cs.notes && <div className="mt-1 ml-4 text-[11px] text-text2 bg-surface2 py-1 px-2 rounded leading-relaxed">{cs.notes}</div>}
                        {/* Tasks as subtle sub-items */}
                        {stepTasks.length > 0 && (
                          <div className="mt-1 ml-4">{stepTasks.map(t => renderStepTaskRow(t, s.days))}</div>
                        )}
                        {/* Add task */}
                        {addingTaskToStep === i ? (
                          <input
                            className="border border-blue rounded-[3px] py-[2px] px-1.5 text-[11px] font-sans outline-none w-[200px] mt-1 ml-4"
                            placeholder="Nombre de la tarea..."
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') handleStepTaskAdd(i, e.target.value); if (e.key === 'Escape') setAddingTaskToStep(null); }}
                            onBlur={(e) => handleStepTaskAdd(i, e.target.value)}
                          />
                        ) : (
                          <button className="inline-flex items-center gap-1 text-[10px] text-text3 cursor-pointer mt-0.5 ml-4 py-[1px] px-1 rounded bg-transparent border-none font-sans hover:text-blue hover:bg-blue-bg" onClick={() => setAddingTaskToStep(i)}>+ Tarea</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Custom phases with no steps */}
          {(c.customPhases || []).map(cp => {
            const hasSteps = customs.some(cs => cs.phase === cp.id) || PROCESS_STEPS.some(s => s.phase === cp.id);
            if (hasSteps || (phase !== 'all' && phase !== cp.id)) return null;
            return (
              <div key={cp.id} className="mb-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1.5 py-[4px] px-2.5 rounded-full text-[11px] font-bold text-white" style={{ background: cp.color }}>{cp.label} <span className="text-[9px] font-normal opacity-80">0/0</span></span>
                </div>
                <div className="rounded-lg py-3 px-4 text-text3 text-xs italic" style={{ borderLeft: `3px solid ${cp.color}` }}>Sin secciones aun. Agrega una seccion a esta fase.</div>
              </div>
            );
          })}

          <button className="flex items-center gap-1.5 text-text3 text-xs cursor-pointer py-2.5 px-[18px] border border-dashed border-border rounded-lg mt-2 bg-transparent font-sans w-full hover:text-blue hover:border-blue hover:bg-blue-bg2" onClick={() => { setCrTab('section'); setCrSectionForm({ name: '', phase: Object.keys(allPh)[0] || 'pre-onboarding', days: 7, resp: '' }); setCrPhaseName(''); setCustomRoadmapModal(true); }}>+ Agregar fase o seccion al roadmap</button>
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

      {/* Step Modal */}
      <Modal
        open={!!stepModal}
        onClose={() => setStepModal(null)}
        title={stepModal ? (stepModal.isCustom ? c.customSteps[stepModal.customIdx]?.name : PROCESS_STEPS[stepModal.idx]?.name) : 'Actualizar paso'}
        footer={<>
          <button className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] cursor-pointer font-sans hover:bg-surface2" onClick={() => setStepModal(null)}>Cancelar</button>
          <button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark" onClick={saveStep}>Guardar</button>
        </>}
      >
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Estado</label><select className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={stepForm.status || 'pending'} onChange={e => setStepForm(f => ({ ...f, status: e.target.value }))}><option value="pending">Pendiente</option><option value="in-progress">En progreso</option><option value="waiting-client">Esperando cliente</option><option value="blocked">Bloqueado</option><option value="completed">Completado</option></select></div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Fecha inicio</label><input type="date" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={stepForm.startDate || ''} onChange={e => setStepForm(f => ({ ...f, startDate: e.target.value }))} /></div>
          <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Fecha fin</label><input type="date" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={stepForm.endDate || ''} onChange={e => setStepForm(f => ({ ...f, endDate: e.target.value }))} /></div>
        </div>
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Responsable</label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={stepForm.responsible || ''} onChange={e => setStepForm(f => ({ ...f, responsible: e.target.value }))} /></div>
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Notas</label><textarea className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue resize-y min-h-[80px] leading-relaxed" value={stepForm.notes || ''} onChange={e => setStepForm(f => ({ ...f, notes: e.target.value }))} /></div>
      </Modal>

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

      {/* Dependencies Modal */}
      <Modal
        open={!!depsModal}
        onClose={() => setDepsModal(null)}
        title="Configurar dependencias"
        maxWidth={440}
        footer={<>
          <button className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] cursor-pointer font-sans hover:bg-surface2" onClick={() => setDepsModal(null)}>Cancelar</button>
          <button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark" onClick={saveDeps}>Guardar</button>
        </>}
      >
        {depsModal && (
          <div>
            <p className="text-xs text-text2 mb-3">Que secciones deben completarse antes de <strong>{PROCESS_STEPS[depsModal.idx]?.name}</strong>?</p>
            {(() => {
              let lastPhase = '';
              return PROCESS_STEPS.slice(0, depsModal.idx).map((ps, pi) => {
                const showPhase = ps.phase !== lastPhase;
                lastPhase = ps.phase;
                const phInfo = PHASES[ps.phase];
                return (
                  <div key={pi}>
                    {showPhase && <div className="text-[10px] font-bold mt-2.5 mb-1 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: phInfo?.color || '#5B7CF5' }} />{phInfo?.label || ps.phase}</div>}
                    <label className="flex items-center gap-2 py-[5px] px-2 rounded cursor-pointer text-xs hover:bg-surface2">
                      <input
                        type="checkbox"
                        className="cursor-pointer"
                        checked={depsForm.includes(pi)}
                        onChange={(e) => {
                          if (e.target.checked) setDepsForm(prev => [...prev, pi]);
                          else setDepsForm(prev => prev.filter(x => x !== pi));
                        }}
                      />
                      {getStepNameForClient(c, pi)}
                    </label>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </Modal>

      {/* Custom Roadmap Modal */}
      <Modal
        open={customRoadmapModal}
        onClose={() => setCustomRoadmapModal(false)}
        title="Agregar al roadmap"
        maxWidth={440}
        footer={<>
          <button className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] cursor-pointer font-sans hover:bg-surface2" onClick={() => setCustomRoadmapModal(false)}>Cancelar</button>
          <button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark" onClick={saveCustomRoadmap}>Crear</button>
        </>}
      >
        <div className="flex gap-2 mb-4">
          <button className={`py-1.5 px-3.5 rounded-[20px] border text-xs cursor-pointer font-sans ${crTab === 'section' ? 'bg-blue text-white border-blue' : 'bg-white text-text2 border-border'}`} onClick={() => setCrTab('section')}>Nueva seccion</button>
          <button className={`py-1.5 px-3.5 rounded-[20px] border text-xs cursor-pointer font-sans ${crTab === 'phase' ? 'bg-blue text-white border-blue' : 'bg-white text-text2 border-border'}`} onClick={() => setCrTab('phase')}>Nueva fase</button>
        </div>
        {crTab === 'section' ? (
          <>
            <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Nombre de la seccion</label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" placeholder="Ej: Crear contenido para redes" value={crSectionForm.name} onChange={e => setCrSectionForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Fase a la que pertenece</label><select className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" value={crSectionForm.phase} onChange={e => setCrSectionForm(f => ({ ...f, phase: e.target.value }))}>{Object.entries(allPh).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Dias estimados</label><input type="number" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" min="1" value={crSectionForm.days} onChange={e => setCrSectionForm(f => ({ ...f, days: parseInt(e.target.value) || 7 }))} /></div>
              <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Responsable</label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" placeholder="Jose Martin" value={crSectionForm.resp} onChange={e => setCrSectionForm(f => ({ ...f, resp: e.target.value }))} /></div>
            </div>
          </>
        ) : (
          <>
            <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Nombre de la fase</label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" placeholder="Ej: Optimizacion avanzada" value={crPhaseName} onChange={e => setCrPhaseName(e.target.value)} /></div>
            <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Color</label>
              <div className="flex gap-1.5 flex-wrap">
                {PHASE_COLORS.map(col => (
                  <div key={col} className="w-7 h-7 rounded-full cursor-pointer" style={{ background: col, outline: col === crColor ? `2px solid ${col}` : 'none' }} onClick={() => setCrColor(col)} />
                ))}
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}