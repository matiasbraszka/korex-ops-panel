import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { PROCESS_STEPS, PHASES, TASK_PRIO, TASK_STATUS, TEAM } from '../utils/constants';
import { getStepName, effectiveTime, today, fmtDate, getAllPhases } from '../utils/helpers';
import Dropdown from '../components/Dropdown';
import Modal from '../components/Modal';

export default function TasksPage() {
  const { clients, tasks, taskFilter, setTaskFilter, taskAssignee, setTaskAssignee, hideCompletedTasks, setHideCompletedTasks, collapsedGroups, setCollapsedGroups, currentUser, createTask, updateTask, deleteTask } = useApp();
  const [addingTaskTo, setAddingTaskTo] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [expandedTasks, setExpandedTasks] = useState({});
  const [depsModal, setDepsModal] = useState(null);
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

  const filterDefs = [
    { key: 'all', label: 'Todas' },
    { key: 'urgent', label: 'Urgentes' },
    { key: 'in-progress', label: 'En progreso' },
    { key: 'blocked', label: 'Bloqueadas' },
    { key: 'done', label: 'Completadas' },
  ];

  const assignees = new Set();
  tasks.forEach(t => { if (t.assignee) assignees.add(t.assignee); });
  const assigneeList = [...assignees].sort();

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
    filteredTasks = filteredTasks.filter(t => t.assignee && myNames.includes(t.assignee.toLowerCase()));
  } else if (taskAssignee !== 'all') {
    filteredTasks = filteredTasks.filter(t => t.assignee && t.assignee.toLowerCase() === taskAssignee.toLowerCase());
  }

  const grouped = {};
  clients.forEach(c => { grouped[c.id] = { client: c, tasks: [] }; });
  filteredTasks.forEach(t => { if (grouped[t.clientId]) grouped[t.clientId].tasks.push(t); });

  const prioSort = { urgent: 0, high: 1, normal: 2, low: 3 };
  const groups = Object.values(grouped).filter(g => g.tasks.length > 0 || addingTaskTo === g.client.id);
  groups.sort((a, b) => {
    const am = a.tasks.length ? Math.min(...a.tasks.map(t => prioSort[t.priority] || 2)) : 9;
    const bm = b.tasks.length ? Math.min(...b.tasks.map(t => prioSort[t.priority] || 2)) : 9;
    return am - bm;
  });

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

  const startEditTitle = (taskId, el) => {
    const t = tasks.find(x => x.id === taskId);
    if (!t) return;
    const input = document.createElement('input');
    input.className = 'border border-blue rounded-[3px] py-[2px] px-1.5 text-xs font-sans outline-none w-full bg-white';
    input.value = t.title;
    let saved = false;
    const doSave = () => { if (saved) return; saved = true; updateTask(taskId, { title: input.value.trim() || t.title }); };
    input.onblur = doSave;
    input.onkeydown = (ev) => { if (ev.key === 'Enter') input.blur(); if (ev.key === 'Escape') { input.value = t.title; input.blur(); } };
    el.replaceWith(input);
    input.focus();
    input.select();
  };

  const renderTaskRow = (t) => {
    const ts = TASK_STATUS[t.status] || TASK_STATUS.backlog;
    const tp = TASK_PRIO[t.priority] || TASK_PRIO.normal;
    const assignee = TEAM.find(m => m.name.toLowerCase() === t.assignee?.toLowerCase() || m.id === t.assignee);
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
        <div className={`grid gap-2 py-2 px-4 items-center text-xs transition-colors hover:bg-blue-bg2 min-h-[38px] group ${blocked ? 'opacity-60' : ''}`} style={{ gridTemplateColumns: '28px 1fr 130px 120px 80px 36px' }}>
          {/* Status icon */}
          <div
            ref={el => statusRef.current = el}
            className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] cursor-pointer shrink-0"
            style={{ background: ts.bg, color: ts.color, border: `1.5px solid ${ts.color}` }}
            onClick={(e) => { e.stopPropagation(); setOpenDropdown(prev => prev === 'status-' + t.id ? null : 'status-' + t.id); }}
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
              <span className="cursor-text py-[2px] px-1 rounded-[3px] whitespace-nowrap overflow-hidden text-ellipsis flex-1 hover:bg-surface2" onDoubleClick={(e) => startEditTitle(t.id, e.target)}>{t.title}</span>
              {(() => {
                const client = clients.find(x => x.id === t.clientId);
                const etime = effectiveTime(t, client);
                if (etime === null) return null;
                const isDone = t.status === 'done';
                const stepDays = t.stepIdx !== null && t.stepIdx < PROCESS_STEPS.length ? PROCESS_STEPS[t.stepIdx].days : null;
                const isOver = stepDays && etime > stepDays;
                const color = isDone ? (isOver ? '#F97316' : '#22C55E') : (isOver ? '#F97316' : '#5B7CF5');
                const bg = isDone ? (isOver ? '#FFF7ED' : '#ECFDF5') : (isOver ? '#FFF7ED' : '#EEF2FF');
                return <span className="inline-flex items-center py-[1px] px-1.5 rounded text-[9px] font-semibold shrink-0" style={{ color, background: bg }}>{etime}d</span>;
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
            onClick={(e) => { e.stopPropagation(); setOpenDropdown(prev => prev === 'step-' + t.id ? null : 'step-' + t.id); }}
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
          <div
            ref={el => assigneeRef.current = el}
            className="cursor-pointer relative"
            onClick={(e) => { e.stopPropagation(); setOpenDropdown(prev => prev === 'assignee-' + t.id ? null : 'assignee-' + t.id); }}
          >
            <div className="flex items-center gap-1 py-[2px] px-1.5 rounded text-[11px] text-text2 hover:bg-surface2">
              {assignee ? (
                <>
                  <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-bold shrink-0" style={{ background: assignee.color + '18', color: assignee.color }}>{assignee.initials}</span>
                  <span>{assignee.name}</span>
                </>
              ) : <span className="text-text3">+ Asignar</span>}
            </div>
          </div>
          <Dropdown
            open={openDropdown === 'assignee-' + t.id}
            onClose={() => setOpenDropdown(null)}
            anchorRef={assigneeRef}
            items={[{ label: 'Sin asignar', onClick: () => updateTask(t.id, { assignee: '' }) }, ...TEAM.map(m => ({ node: <><span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ background: m.color + '18', color: m.color }}>{m.initials}</span>{m.name}</>, onClick: () => updateTask(t.id, { assignee: m.name }) }))]}
          />

          {/* Priority */}
          <div
            ref={el => prioRef.current = el}
            className="cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setOpenDropdown(prev => prev === 'prio-' + t.id ? null : 'prio-' + t.id); }}
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

        {/* Expandable description */}
        {isExpanded && (
          <div className="py-1.5 px-4 pb-3 text-xs text-text2 leading-relaxed bg-blue-bg2 border-t border-dashed border-border" style={{ paddingLeft: 44 }}>
            <textarea
              className="w-full border border-border rounded-md py-2 px-2.5 text-xs font-sans resize-y min-h-[60px] outline-none bg-white focus:border-blue"
              placeholder="Escribe una descripcion para esta tarea..."
              defaultValue={t.description || ''}
              onBlur={(e) => updateTask(t.id, { description: e.target.value })}
            />
          </div>
        )}
      </div>
    );
  };

  const clientsInGroups = new Set(groups.map(g => g.client.id));
  const remaining = clients.filter(c => !clientsInGroups.has(c.id));

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-2.5 items-center mb-4">
        <select
          className="text-xs py-1.5 px-3 border border-border rounded-md bg-white text-text font-sans outline-none cursor-pointer focus:border-blue"
          value={taskFilter}
          onChange={(e) => setTaskFilter(e.target.value)}
        >
          {filterDefs.map(f => (
            <option key={f.key} value={f.key}>{f.key === 'all' ? 'Estado: Todas' : f.label}</option>
          ))}
        </select>
        <select
          className="text-xs py-1.5 px-3 border border-border rounded-md bg-white text-text font-sans outline-none cursor-pointer focus:border-blue"
          value={taskAssignee}
          onChange={(e) => setTaskAssignee(e.target.value)}
        >
          <option value="all">Encargado: Todos</option>
          <option value="mine">Mis tareas</option>
          {assigneeList.map(a => {
            const m = TEAM.find(t => t.name.toLowerCase() === a.toLowerCase() || t.id === a);
            return <option key={a} value={a}>{m ? m.name : a}</option>;
          })}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-text3 cursor-pointer select-none">
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
        g.tasks.sort((a, b) => {
          if (a.status === 'done' && b.status !== 'done') return 1;
          if (b.status === 'done' && a.status !== 'done') return -1;
          return (prioSort[a.priority] || 2) - (prioSort[b.priority] || 2);
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
                {g.tasks.map(t => renderTaskRow(t))}

                {/* Inline new task */}
                {addingTaskTo === g.client.id && (
                  <div className="grid gap-2 py-1.5 px-4 items-center border-t border-border bg-blue-bg2" style={{ gridTemplateColumns: '28px 1fr 120px 80px 36px' }}>
                    <div className="text-text3 text-[10px]">+</div>
                    <div className="flex flex-col gap-1 flex-1">
                      <input id="inline-task-input" className="border-none bg-transparent text-xs font-sans outline-none py-1 text-text w-full" placeholder="Escribe el nombre de la tarea y presiona Enter..." autoFocus onKeyDown={(e) => inlineTaskKeydown(e, g.client.id)} />
                      <select id="inline-task-phase" className="text-[11px] py-[3px] px-1.5 border border-border rounded text-text2 font-sans">
                        <option value="">Sin vincular a fase</option>
                        {Object.entries(PHASES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        {(g.client.customPhases || []).map(cp => <option key={cp.id} value={cp.id}>{cp.label}</option>)}
                      </select>
                    </div>
                    <div />
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
    </div>
  );
}