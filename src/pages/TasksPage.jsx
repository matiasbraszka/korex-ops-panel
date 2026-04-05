import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { PROCESS_STEPS, PHASES, TASK_PRIO, TASK_STATUS, TEAM } from '../utils/constants';
import { getStepName, today, fmtDate, getAllPhases, getElapsedDays } from '../utils/helpers';
import Dropdown from '../components/Dropdown';
import Modal from '../components/Modal';

export default function TasksPage() {
  const { clients, tasks, taskFilter, setTaskFilter, taskAssignee, setTaskAssignee, hideCompletedTasks, setHideCompletedTasks, collapsedGroups, setCollapsedGroups, currentUser, createTask, updateTask, deleteTask } = useApp();
  const [addingTaskTo, setAddingTaskTo] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [expandedTasks, setExpandedTasks] = useState({});
  const [depsModal, setDepsModal] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTitleVal, setEditTitleVal] = useState('');
  const dropdownRefs = useRef({});

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
  const regularClients = clients.filter(c => !isKorexClient(c));

  const filterDefs = [
    { key: 'all', label: 'Todas' },
    { key: 'urgent', label: 'Urgentes' },
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
  if (taskFilter === 'urgent') filteredTasks = filteredTasks.filter(t => t.priority === 'urgent');
  if (taskFilter === 'in-progress') filteredTasks = filteredTasks.filter(t => t.status === 'in-progress');
  if (taskFilter === 'blocked') filteredTasks = filteredTasks.filter(t => t.status === 'blocked' || t.status === 'retrasadas');
  if (taskFilter === 'done') filteredTasks = filteredTasks.filter(t => t.status === 'done');
  if (hideCompletedTasks && taskFilter !== 'done') filteredTasks = filteredTasks.filter(t => t.status !== 'done');

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

  const grouped = {};
  regularClients.forEach(c => { grouped[c.id] = { client: c, tasks: [] }; });
  filteredTasks.filter(t => t.clientId !== korexClientId).forEach(t => { if (grouped[t.clientId]) grouped[t.clientId].tasks.push(t); });

  const prioSort = { urgent: 0, high: 1, normal: 2, low: 3 };
  const groups = Object.values(grouped).filter(g => g.tasks.length > 0 || addingTaskTo === g.client.id);
  // Sort client groups by CLIENT priority (critico=1 first), NOT by task priority
  groups.sort((a, b) => (a.client.priority || 4) - (b.client.priority || 4));

  const inlineTaskKeydown = (e, clientId) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      const phaseSelect = document.getElementById('inline-task-phase');
      const phase = phaseSelect && phaseSelect.value !== '' ? phaseSelect.value : null;
      const t = createTask(e.target.value.trim(), clientId, '', 'normal', 'backlog', '', null);
      if (phase && t) updateTask(t.id, { phase });
      e.target.value = '';
      setTimeout(() => { const i = document.getElementById('inline-task-input'); if (i) i.focus(); }, 50);
    }
    if (e.key === 'Escape') setAddingTaskTo(null);
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

  const renderTaskRow = (t) => {
    const ts = TASK_STATUS[t.status] || TASK_STATUS.backlog;
    const tp = TASK_PRIO[t.priority] || TASK_PRIO.normal;
    const stepName = getStepName(t, clients);
    const hasDesc = !!((t.description && t.description.trim()) || (t.notes && t.notes.trim()));
    const isExpanded = expandedTasks[t.id];
    const statusRef = getRef('status-' + t.id);
    const stepRef = getRef('step-' + t.id);
    const assigneeRef = getRef('assignee-' + t.id);
    const prioRef = getRef('prio-' + t.id);

    const blocked = isTaskBlocked(t);
    const blockingNames = blocked ? getBlockingNames(t) : [];
    const isOverdue = t.dueDate && t.status !== 'done' && !blocked && t.dueDate < today();

    const client = clients.find(x => x.id === t.clientId);

    // Phase display for roadmap tasks
    const phaseInfo = t.phase ? PHASES[t.phase] : null;

    const stepDropdownItems = [
      { label: 'Sin vincular', onClick: () => updateTask(t.id, { stepIdx: null, phase: null }) },
      { divider: true, label: 'Fases', color: '#9CA3AF' },
    ];
    Object.entries(PHASES).forEach(([key, ph]) => {
      stepDropdownItems.push({ label: ph.label, onClick: () => updateTask(t.id, { phase: key, stepIdx: null }), style: { paddingLeft: 8 }, icon: '\u25CF', iconColor: ph.color });
    });
    const customPhases = client?.customPhases || [];
    if (customPhases.length > 0) {
      customPhases.forEach(cp => {
        stepDropdownItems.push({ label: cp.label, onClick: () => updateTask(t.id, { phase: cp.id, stepIdx: null }), style: { paddingLeft: 8 }, icon: '\u25CF', iconColor: cp.color });
      });
    }

    return (
      <div key={t.id} className="border-b border-border last:border-b-0">
        {/* Desktop row */}
        <div className={`hidden md:grid gap-2 py-2 px-4 items-center text-xs transition-colors hover:bg-blue-bg2 min-h-[38px] group ${blocked ? 'opacity-60' : ''}`} style={{ gridTemplateColumns: '28px 1fr 110px 50px 70px 30px' }}>
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
            items={Object.entries(TASK_STATUS).map(([k, v]) => ({ label: v.label, icon: v.icon, iconColor: v.color, onClick: () => updateTask(t.id, { status: k }) }))}
          />

          {/* Title */}
          <div className="min-w-0 flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              {blocked && <span className="shrink-0" title="Bloqueada por dependencias">{'\uD83D\uDD12'}</span>}
              {editingTaskId === t.id ? (
                <input
                  className="border border-blue rounded-[3px] py-[2px] px-1.5 text-xs font-sans outline-none flex-1 bg-white"
                  value={editTitleVal}
                  onChange={(e) => setEditTitleVal(e.target.value)}
                  onBlur={() => saveEditTitle(t.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingTaskId(null); }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span className="cursor-text py-[2px] px-1 rounded-[3px] flex-1 hover:bg-surface2 leading-tight" onClick={(e) => { e.stopPropagation(); startEditTitle(t.id); }}>{t.title}</span>
              )}
              {(() => {
                const clientTasks = tasks.filter(ct => ct.clientId === t.clientId);
                const elapsed = getElapsedDays(t, clientTasks);
                if (elapsed <= 0) return null;
                const est = t.estimatedDays || (t.stepIdx !== null && t.stepIdx < PROCESS_STEPS.length ? PROCESS_STEPS[t.stepIdx].days : null);
                const color = est ? (elapsed >= est * 2 ? '#EF4444' : elapsed > est ? '#F97316' : '#22C55E') : '#5B7CF5';
                const bg = est ? (elapsed >= est * 2 ? '#FEF2F2' : elapsed > est ? '#FFF7ED' : '#ECFDF5') : '#EEF2FF';
                return (
                  <span className="inline-flex items-center py-[1px] px-1.5 rounded text-[9px] font-semibold shrink-0" style={{ color, background: bg }}>
                    {'\u23F1'} {elapsed}d{est ? ` / ${est}d` : ''}
                  </span>
                );
              })()}
              {t.dueDate && (
                <span className={`inline-flex items-center py-[1px] px-1.5 rounded text-[9px] font-medium shrink-0 ${isOverdue ? 'text-red-500 bg-red-50' : 'text-gray-400 bg-gray-50'}`}>
                  {isOverdue ? '\u26A0' : '\uD83D\uDCC5'} {fmtDate(t.dueDate)}
                </span>
              )}
              {hasDesc && <span className="w-1.5 h-1.5 rounded-full bg-blue shrink-0 ml-0.5" />}
              <button className="bg-transparent border-none text-text3 cursor-pointer text-[11px] py-[2px] px-1 rounded-[3px] hover:text-blue hover:bg-blue-bg opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setDepsModal(t.id); }} title="Dependencias">{'\uD83D\uDD17'}</button>
              <button className="bg-transparent border-none text-text3 cursor-pointer text-[11px] py-[2px] px-1 rounded-[3px] hover:text-blue hover:bg-blue-bg" onClick={() => setExpandedTasks(prev => ({ ...prev, [t.id]: !prev[t.id] }))}>{isExpanded ? '\u25B2' : '\u25BC'}</button>
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
                          <span key={am.id} className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 border border-white" style={{ background: am.color + '18', color: am.color, marginLeft: ai > 0 ? '-6px' : '0', zIndex: 2 - ai }} title={am.name}>{am.initials}</span>
                        ))}
                        {assigneeMembers.length > 2 && (
                          <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-bold bg-gray-200 text-gray-600 border border-white" style={{ marginLeft: '-6px', zIndex: 0 }}>+{assigneeMembers.length - 2}</span>
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
                  items={[
                    { label: 'Sin asignar', onClick: () => { updateTask(t.id, { assignee: '' }); setOpenDropdown(null); } },
                    ...TEAM.map(m => {
                      const isSelected = assigneeNames.some(n => n.toLowerCase() === m.name.toLowerCase());
                      return {
                        node: <div className="flex items-center gap-2 w-full"><input type="checkbox" checked={isSelected} readOnly className="pointer-events-none" /><span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ background: m.color + '18', color: m.color }}>{m.initials}</span><span>{m.name}</span></div>,
                        onClick: () => toggleAssignee(m.name),
                      };
                    })
                  ]}
                />
              </>
            );
          })()}

          {/* Priority */}
          <div
            ref={el => prioRef.current = el}
            className="cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setOpenDropdown('prio-' + t.id); }}
          >
            <div className="flex items-center gap-[2px] py-[2px] px-1.5 rounded text-[11px] font-semibold hover:bg-surface2" style={{ color: tp.color }}>{tp.flag} {tp.label}</div>
          </div>
          <Dropdown
            open={openDropdown === 'prio-' + t.id}
            onClose={() => setOpenDropdown(null)}
            anchorRef={prioRef}
            items={Object.entries(TASK_PRIO).map(([k, v]) => ({ label: v.label, icon: v.flag, iconColor: v.color, onClick: () => updateTask(t.id, { priority: k }) }))}
          />

          {/* Delete */}
          <div className="flex items-center justify-center">
            <button className="bg-transparent border-none text-text3 cursor-pointer text-sm py-[2px] rounded opacity-0 group-hover:opacity-100 transition-opacity hover:text-red" onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}>{'\uD83D\uDDD1'}</button>
          </div>
        </div>

        {/* Mobile card */}
        <div className={`md:hidden py-2.5 px-3 text-xs group ${blocked ? 'opacity-60' : ''}`} onClick={() => setExpandedTasks(prev => ({ ...prev, [t.id]: !prev[t.id] }))}>
          <div className="flex items-start gap-2">
            <div
              ref={el => statusRef.current = el}
              className="w-[20px] h-[20px] rounded-full flex items-center justify-center text-[10px] cursor-pointer shrink-0 mt-[1px]"
              style={{ background: ts.bg, color: ts.color, border: `1.5px solid ${ts.color}` }}
              onClick={(e) => { e.stopPropagation(); setOpenDropdown('status-' + t.id); }}
            >{ts.icon}</div>
            <Dropdown
              open={openDropdown === 'status-' + t.id}
              onClose={() => setOpenDropdown(null)}
              anchorRef={statusRef}
              items={Object.entries(TASK_STATUS).map(([k, v]) => ({ label: v.label, icon: v.icon, iconColor: v.color, onClick: () => updateTask(t.id, { status: k }) }))}
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
                  <span className="text-[13px] font-medium text-text leading-tight break-words">{t.title}</span>
                )}
                {hasDesc && <span className="w-1.5 h-1.5 rounded-full bg-blue shrink-0" />}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {phaseInfo && (
                  <span
                    ref={el => stepRef.current = el}
                    className="inline-flex items-center gap-1 py-[1px] px-1.5 rounded-full text-[9px] font-semibold cursor-pointer"
                    style={{ background: phaseInfo.color + '18', color: phaseInfo.color }}
                    onClick={(e) => { e.stopPropagation(); setOpenDropdown('step-' + t.id); }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: phaseInfo.color }} />
                    {phaseInfo.label}
                  </span>
                )}
                <Dropdown
                  open={openDropdown === 'step-' + t.id}
                  onClose={() => setOpenDropdown(null)}
                  anchorRef={stepRef}
                  items={stepDropdownItems}
                  minWidth={220}
                  maxHeight={300}
                />
                <span
                  ref={el => prioRef.current = el}
                  className="text-[10px] font-semibold cursor-pointer"
                  style={{ color: tp.color }}
                  onClick={(e) => { e.stopPropagation(); setOpenDropdown('prio-' + t.id); }}
                >{tp.flag} {tp.label}</span>
                <Dropdown
                  open={openDropdown === 'prio-' + t.id}
                  onClose={() => setOpenDropdown(null)}
                  anchorRef={prioRef}
                  items={Object.entries(TASK_PRIO).map(([k, v]) => ({ label: v.label, icon: v.flag, iconColor: v.color, onClick: () => updateTask(t.id, { priority: k }) }))}
                />
                {(() => {
                  const clientTasks = tasks.filter(ct => ct.clientId === t.clientId);
                  const elapsed = getElapsedDays(t, clientTasks);
                  if (elapsed <= 0) return null;
                  const est = t.estimatedDays || (t.stepIdx !== null && t.stepIdx < PROCESS_STEPS.length ? PROCESS_STEPS[t.stepIdx].days : null);
                  const color = est ? (elapsed >= est * 2 ? '#EF4444' : elapsed > est ? '#F97316' : '#22C55E') : '#5B7CF5';
                  const bg = est ? (elapsed >= est * 2 ? '#FEF2F2' : elapsed > est ? '#FFF7ED' : '#ECFDF5') : '#EEF2FF';
                  return <span className="text-[9px] font-semibold py-[1px] px-1.5 rounded" style={{ color, background: bg }}>{'\u23F1'} {elapsed}d{est ? `/${est}d` : ''}</span>;
                })()}
                {(() => {
                  const assigneeNames = t.assignee ? t.assignee.split(',').map(s => s.trim()).filter(Boolean) : [];
                  const assigneeMembers = assigneeNames.map(name => TEAM.find(m => m.name.toLowerCase() === name.toLowerCase() || m.id === name)).filter(Boolean);
                  if (assigneeMembers.length === 0) return null;
                  return (
                    <div
                      ref={el => assigneeRef.current = el}
                      className="flex items-center cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setOpenDropdown('assignee-' + t.id); }}
                    >
                      {assigneeMembers.slice(0, 2).map((am, ai) => (
                        <span key={am.id} className="w-[16px] h-[16px] rounded-full flex items-center justify-center text-[7px] font-bold shrink-0 border border-white" style={{ background: am.color + '18', color: am.color, marginLeft: ai > 0 ? '-4px' : '0', zIndex: 2 - ai }}>{am.initials}</span>
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
                      open={openDropdown === 'assignee-' + t.id}
                      onClose={() => setOpenDropdown(null)}
                      anchorRef={assigneeRef}
                      keepOpen
                      items={[
                        { label: 'Sin asignar', onClick: () => { updateTask(t.id, { assignee: '' }); setOpenDropdown(null); } },
                        ...TEAM.map(m => {
                          const isSelected = assigneeNames.some(n => n.toLowerCase() === m.name.toLowerCase());
                          return {
                            node: <div className="flex items-center gap-2 w-full"><input type="checkbox" checked={isSelected} readOnly className="pointer-events-none" /><span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ background: m.color + '18', color: m.color }}>{m.initials}</span><span>{m.name}</span></div>,
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
            <button className="bg-transparent border-none text-text3 cursor-pointer text-sm p-1 shrink-0" onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}>{'\uD83D\uDDD1'}</button>
          </div>
        </div>

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
                <span className="text-text3">{'\u23F1'} Tiempo estimado:</span>
                <input
                  type="number"
                  className="border border-border rounded py-[2px] px-1.5 text-[11px] font-sans outline-none bg-white focus:border-blue w-[60px]"
                  value={t.estimatedDays || ''}
                  step="0.5"
                  min="0.1"
                  placeholder="días"
                  onChange={(e) => { const v = parseFloat(e.target.value); updateTask(t.id, { estimatedDays: !isNaN(v) && v > 0 ? v : null }); }}
                />
                <span className="text-text3">días</span>
              </div>
              <div className="md:hidden flex gap-1.5 w-full mt-1">
                <button className="py-1 px-2 rounded text-[10px] bg-blue-bg text-blue border-none cursor-pointer font-sans" onClick={(e) => { e.stopPropagation(); setDepsModal(t.id); }}>{'\uD83D\uDD17'} Dependencias</button>
              </div>
            </div>
          </div>
        )}
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
      {/* Filters */}
      <div className="flex gap-2.5 items-center mb-4 max-md:flex-wrap max-md:gap-1.5">
        <select
          className="text-xs py-1.5 px-3 border border-border rounded-md bg-white text-text font-sans outline-none cursor-pointer focus:border-blue max-md:flex-1 max-md:min-w-0"
          value={taskFilter}
          onChange={(e) => setTaskFilter(e.target.value)}
        >
          {filterDefs.map(f => (
            <option key={f.key} value={f.key}>{f.key === 'all' ? 'Estado: Todas' : f.label}</option>
          ))}
        </select>
        <select
          className="text-xs py-1.5 px-3 border border-border rounded-md bg-white text-text font-sans outline-none cursor-pointer focus:border-blue max-md:flex-1 max-md:min-w-0"
          value={taskAssignee}
          onChange={(e) => setTaskAssignee(e.target.value)}
        >
          <option value="all">Encargado: Todos</option>
          <option value="mine">Mis tareas</option>
          {assigneeList.map(m => (
            <option key={m.id} value={m.name}>{m.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-text3 cursor-pointer select-none max-md:w-full">
          <input type="checkbox" checked={hideCompletedTasks} onChange={(e) => setHideCompletedTasks(e.target.checked)} className="cursor-pointer" /> Ocultar completadas
        </label>
      </div>

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
        const sortedTasks = [...g.tasks].sort((a, b) => {
          if (a.status === 'done' && b.status !== 'done') return 1;
          if (b.status === 'done' && a.status !== 'done') return -1;
          const pa = prioSort[a.priority] !== undefined ? prioSort[a.priority] : 2;
          const pb = prioSort[b.priority] !== undefined ? prioSort[b.priority] : 2;
          return pa - pb;
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
                {sortedTasks.map(t => renderTaskRow(t))}

                {/* Inline new task */}
                {addingTaskTo === g.client.id && (
                  <div className="flex gap-2 py-2 px-4 items-center border-t border-border bg-blue-bg2 max-md:px-3 max-md:flex-wrap">
                    <div className="text-text3 text-[10px] max-md:hidden">+</div>
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <input id="inline-task-input" className="border-none bg-transparent text-xs font-sans outline-none py-1 text-text w-full" placeholder="Nombre de la tarea + Enter..." autoFocus onKeyDown={(e) => inlineTaskKeydown(e, g.client.id)} />
                      <select id="inline-task-phase" className="text-[11px] py-[3px] px-1.5 border border-border rounded text-text2 font-sans">
                        <option value="">Sin vincular a fase</option>
                        {Object.entries(PHASES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        {(g.client.customPhases || []).map(cp => <option key={cp.id} value={cp.id}>{cp.label}</option>)}
                      </select>
                    </div>
                    <div><button className="bg-transparent border-none text-text3 cursor-pointer text-sm" style={{ opacity: 1 }} onClick={() => setAddingTaskTo(null)}>{'\u2715'}</button></div>
                  </div>
                )}

                <div className="py-1.5 px-4 flex items-center gap-1.5 cursor-pointer text-text3 text-xs hover:text-blue hover:bg-blue-bg2" onClick={() => { setAddingTaskTo(g.client.id); setTimeout(() => { const i = document.getElementById('inline-task-input'); if (i) i.focus(); }, 50); }}>+ Agregar tarea</div>
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
                [...korexTasks].sort((a, b) => {
                  if (a.status === 'done' && b.status !== 'done') return 1;
                  if (b.status === 'done' && a.status !== 'done') return -1;
                  return (prioSort[a.priority] || 2) - (prioSort[b.priority] || 2);
                }).map(t => renderTaskRow(t))
              ) : (
                <div className="text-center text-text3 text-xs py-4">Sin tareas internas</div>
              )}

              {/* Inline new task for Korex */}
              {addingTaskTo === korexClientId && (
                <div className="flex gap-2 py-2 px-4 items-center border-t border-border bg-blue-bg2 max-md:px-3 max-md:flex-wrap">
                  <div className="text-text3 text-[10px] max-md:hidden">+</div>
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <input id="inline-task-input" className="border-none bg-transparent text-xs font-sans outline-none py-1 text-text w-full" placeholder="Nombre de la tarea + Enter..." autoFocus onKeyDown={(e) => inlineTaskKeydown(e, korexClientId)} />
                    <select id="inline-task-phase" className="text-[11px] py-[3px] px-1.5 border border-border rounded text-text2 font-sans">
                      <option value="">Sin vincular a fase</option>
                      {Object.entries(PHASES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div><button className="bg-transparent border-none text-text3 cursor-pointer text-sm" style={{ opacity: 1 }} onClick={() => setAddingTaskTo(null)}>{'\u2715'}</button></div>
                </div>
              )}

              <div className="py-1.5 px-4 flex items-center gap-1.5 cursor-pointer text-text3 text-xs hover:text-blue hover:bg-blue-bg2" onClick={() => { setAddingTaskTo(korexClientId); setTimeout(() => { const i = document.getElementById('inline-task-input'); if (i) i.focus(); }, 50); }}>+ Agregar tarea</div>
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