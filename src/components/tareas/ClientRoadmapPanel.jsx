import { useState, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { PROCESS_STEPS, TASK_STATUS } from '../../utils/constants';
import { getAllPhases, fmtDate, today, getElapsedDays, getEstimatedDays, daysBetween, daysAgo, isInDueRange } from '../../utils/helpers';
import Dropdown from '../Dropdown';
import TeamAvatar from '../TeamAvatar';
import Modal from '../Modal';

/**
 * Panel completo de roadmap para un cliente. Replica el comportamiento del roadmap
 * original de ClientDetail: status dropdown, assignee dropdown, descripcion expandible,
 * drag & drop entre fases, renombrar fase, cambiar deadline, agregar tarea, eliminar,
 * dependencias, etc.
 *
 * Se usa desde RoadmapView para renderizar el roadmap de cada cliente expandido.
 */
export default function ClientRoadmapPanel({ client: c, assigneeFilter = 'all', hideCompleted = false, hideBlocked = false, dueFilter = 'all' }) {
  const { tasks, createTask, updateTask, updateClient, deleteTask, reorderTask, teamMembers } = useApp();
  const TEAM = teamMembers || [];

  // Estado local al panel (cada cliente tiene su propio estado de UI)
  const [openDropdown, setOpenDropdown] = useState(null);
  const [expandedTasks, setExpandedTasks] = useState({});
  const [addingToPhase, setAddingToPhase] = useState(null);
  const [collapsedPhases, setCollapsedPhases] = useState({});
  const [editingTitle, setEditingTitle] = useState(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [editingPhase, setEditingPhase] = useState(null);
  const [editPhaseValue, setEditPhaseValue] = useState('');
  const [editingDeadline, setEditingDeadline] = useState(null);
  const [addingPhase, setAddingPhase] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [depsModal, setDepsModal] = useState(null);
  const [deletePhaseConfirm, setDeletePhaseConfirm] = useState(null);
  const [rdDragId, setRdDragId] = useState(null);
  const [rdDragOverId, setRdDragOverId] = useState(null);
  const [rdDragOverHalf, setRdDragOverHalf] = useState(null);
  const [rdDragOverPhase, setRdDragOverPhase] = useState(null);
  const rdDragGroupRef = useRef(null);
  const rdDragPhaseRef = useRef(null);
  const dropdownRefs = useRef({});

  const clientTasks = tasks.filter(t => t.clientId === c.id);
  const allPh = getAllPhases(c);
  const now = today();

  const getDropdownRef = useCallback((key) => {
    if (!dropdownRefs.current[key]) dropdownRefs.current[key] = { current: null };
    return dropdownRefs.current[key];
  }, []);

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

  const handlePhaseTaskAdd = (phaseKey, title) => {
    if (title.trim()) {
      const t = createTask(title.trim(), c.id, '', 'normal', 'backlog', '', null);
      if (t) updateTask(t.id, { isRoadmapTask: true, phase: phaseKey });
    }
    setAddingToPhase(null);
  };

  // Filtros cascada
  const taskMatchesAssignee = (t, filter) => {
    if (filter === 'all') return true;
    if (!t.assignee) return false;
    const parts = t.assignee.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    return parts.includes(filter.toLowerCase());
  };

  const getFilteredTasks = () => {
    let all = [...clientTasks];
    if (assigneeFilter !== 'all') {
      all = all.filter(t => taskMatchesAssignee(t, assigneeFilter));
    }
    if (hideCompleted) all = all.filter(t => t.status !== 'done');
    if (hideBlocked) all = all.filter(t => !(t.status === 'blocked' || isTaskBlocked(t)));
    if (dueFilter && dueFilter !== 'all') {
      // Solo tareas cuya dueDate caiga en el rango (tareas sin dueDate se ocultan)
      all = all.filter(t => t.dueDate && isInDueRange(t.dueDate, dueFilter));
    }
    return all;
  };

  const resolvePhase = (t) => {
    if (t.phase) return t.phase;
    if (t.stepIdx != null && PROCESS_STEPS[t.stepIdx]) return PROCESS_STEPS[t.stepIdx].phase;
    return '_unphased';
  };

  const filteredTasks = getFilteredTasks();
  const phaseKeys = [...Object.keys(allPh), '_unphased'];
  const phaseGroups = phaseKeys.map(phaseKey => {
    const phInfo = phaseKey === '_unphased' ? { label: 'Sin fase', color: '#9CA3AF' } : (allPh[phaseKey] || { label: phaseKey, color: '#9CA3AF' });
    const phaseTasks = filteredTasks.filter(t => resolvePhase(t) === phaseKey);
    const allPhaseTasks = clientTasks.filter(t => resolvePhase(t) === phaseKey);
    const totalCount = allPhaseTasks.length;
    const doneCount = allPhaseTasks.filter(t => t.status === 'done').length;
    const allDone = totalCount > 0 && doneCount === totalCount;
    // phaseStart = startedDate mas temprano entre las tareas de la fase
    const startedDates = allPhaseTasks.map(t => t.startedDate).filter(Boolean);
    const phaseStart = startedDates.length > 0 ? startedDates.sort()[0] : null;
    // completedDate mas tardio si toda la fase esta hecha
    const completedDates = allPhaseTasks.map(t => t.completedDate).filter(Boolean);
    const phaseEnd = allDone && completedDates.length > 0 ? completedDates.sort().slice(-1)[0] : null;
    return { phaseKey, phInfo, phaseTasks, totalCount, doneCount, allDone, phaseStart, phaseEnd };
  }).filter(g => {
      // Si hay algun filtro activo (assignee, hide completed, hide blocked, due range),
      // ocultar fases cuyas tareas filtradas (phaseTasks) son 0 — no relleno vacio.
      const anyFilterActive = assigneeFilter !== 'all' || hideCompleted || hideBlocked || (dueFilter && dueFilter !== 'all');
      if (anyFilterActive) {
        // Con filtro: solo mostrar fases con al menos 1 tarea visible
        if (g.phaseTasks.length === 0) {
          // Excepcion: si tiene deadline de fase en rango de dueFilter, mostrar (sin tareas pero con deadline relevante)
          if (dueFilter && dueFilter !== 'all') {
            const phDeadline = (c.phaseDeadlines || {})[g.phaseKey];
            if (phDeadline && isInDueRange(phDeadline, dueFilter)) return true;
          }
          return false;
        }
        return true;
      }
      // Sin filtros: mostrar fases con tareas o custom phases vacias
      return g.totalCount > 0 || (g.phaseKey !== '_unphased' && (c.customPhases || []).some(cp => cp.id === g.phaseKey));
    });

  const isCollapsed = (phaseKey, allDone) => {
    if (collapsedPhases[phaseKey] !== undefined) return collapsedPhases[phaseKey];
    return allDone;
  };

  const togglePhase = (phaseKey) => {
    setCollapsedPhases(prev => ({ ...prev, [phaseKey]: !isCollapsed(phaseKey, phaseGroups.find(g => g.phaseKey === phaseKey)?.allDone) }));
  };

  // Drag & drop
  const rdGetGroup = (task) => {
    if (task.status === 'done') return 2;
    if (isTaskBlocked(task)) return 1;
    return 0;
  };
  const rdCanDrag = (task) => rdGetGroup(task) === 0;
  const rdHandleDragStart = (e, task) => {
    if (!rdCanDrag(task)) { e.preventDefault(); return; }
    setRdDragId(task.id);
    rdDragGroupRef.current = 0;
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
  const rdHandleDragOver = (e, task) => {
    e.preventDefault();
    if (rdDragGroupRef.current !== 0) { e.dataTransfer.dropEffect = 'none'; return; }
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    setRdDragOverId(task.id);
    setRdDragOverHalf((e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom');
    setRdDragOverPhase(null);
  };
  const rdHandleDrop = (e, task, sortedTasks) => {
    e.preventDefault();
    if (!rdDragId || rdDragId === task.id) return;
    const draggedTask = clientTasks.find(t => t.id === rdDragId);
    if (!draggedTask) return;
    const targetPhase = task.phase;
    if (targetPhase !== draggedTask.phase) {
      updateTask(rdDragId, { phase: targetPhase, isRoadmapTask: true });
    }
    const targetGroup = rdGetGroup(task);
    const fromIdx = sortedTasks.findIndex(t => t.id === rdDragId);
    const targetIdx = sortedTasks.findIndex(t => t.id === task.id);
    if (targetIdx < 0) { rdClearDrag(); return; }
    let insertIdx;
    if (targetGroup === 0) {
      insertIdx = rdDragOverHalf === 'top' ? targetIdx : targetIdx + 1;
    } else {
      insertIdx = sortedTasks.findIndex(t => rdGetGroup(t) !== 0);
      if (insertIdx < 0) insertIdx = sortedTasks.length;
    }
    if (fromIdx < 0) {
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

  const renderTaskRow = (t, isLast, sortedGroup) => {
    const blocked = isTaskBlocked(t);
    const blockingNames = blocked ? getBlockingNames(t) : [];
    const hasDesc = !!(t.description && t.description.trim());
    const elapsed = getElapsedDays(t, clientTasks);
    const estimated = getEstimatedDays(t);
    const isExpanded = expandedTasks[t.id];
    const isDone = t.status === 'done';
    const isOverdue = t.dueDate && !isDone && !blocked && t.dueDate < now;

    const statusRef = getDropdownRef('rd-status-' + t.id);
    const assigneeRef = getDropdownRef('rd-assignee-' + t.id);
    const movePhaseRef = getDropdownRef('rd-movephase-' + t.id);

    let statusIcon, statusColor;
    if (isDone) { statusIcon = '\u2713'; statusColor = '#22C55E'; }
    else if (blocked) { statusIcon = '\uD83D\uDD12'; statusColor = '#9CA3AF'; }
    else if (t.status === 'in-progress') { statusIcon = '\u25CF'; statusColor = '#5B7CF5'; }
    else if (t.status === 'en-revision') { statusIcon = '\u25C8'; statusColor = '#EAB308'; }
    else { statusIcon = '\u25CB'; statusColor = '#9CA3AF'; }

    const rowBg = t.status === 'in-progress' ? 'bg-blue-50/40' : '';
    const rdIsDragOver = rdDragOverId === t.id && rdDragId !== t.id;
    const rdIsDragging = rdDragId === t.id;

    return (
      <div key={t.id} className={`group ${blocked ? 'opacity-60' : ''} ${rdIsDragging ? 'drag-ghost' : ''}`}>
        {rdIsDragOver && rdDragOverHalf === 'top' && <div className="drag-indicator" />}
        <div
          className={`hover:bg-gray-50 cursor-pointer ${rowBg} grid grid-cols-[18px_22px_14px_1fr_70px_70px_56px] items-center gap-2 py-2 px-3`}
          onClick={() => setExpandedTasks(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
          onDragOver={(e) => rdHandleDragOver(e, t)}
          onDrop={(e) => rdHandleDrop(e, t, sortedGroup)}
          onDragLeave={() => { if (rdDragOverId === t.id) setRdDragOverId(null); }}
        >
          {/* Col 0: Drag handle */}
          {rdCanDrag(t) ? (
            <div
              className="flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity text-gray-300 text-[14px] select-none"
              draggable
              onDragStart={(e) => rdHandleDragStart(e, t)}
              onDragEnd={rdHandleDragEnd}
              title="Arrastrar para reordenar"
            >{'\u2630'}</div>
          ) : <div />}

          {/* Col 1: Status dot - clickable */}
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

          {/* Col 2: Tree connector */}
          <span className="text-gray-300 text-[11px] text-center select-none">{isLast ? '\u2514' : '\u251C'}</span>

          {/* Col 3: Title */}
          <div className="flex items-center gap-1.5 min-w-0">
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
                className={`flex-1 min-w-0 text-[13px] leading-snug break-words ${isDone ? 'text-gray-400 line-through' : blocked ? 'text-red-600' : 'text-gray-800'} ${t.isClientTask ? 'font-semibold' : 'font-medium'}`}
                onDoubleClick={(e) => { e.stopPropagation(); setEditingTitle(t.id); setEditTitleValue(t.title); }}
                title="Doble click para renombrar"
              >
                {t.title}
              </span>
            )}
            <div className="flex items-center gap-1 shrink-0">
              {t.isClientTask && (
                <span className="w-[14px] h-[14px] rounded-full flex items-center justify-center text-[7px] font-bold text-white bg-orange-400" title="Tarea del cliente">C</span>
              )}
              {hasDesc && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" title="Tiene descripci\u00f3n" />}
              {(t.dependsOn && t.dependsOn.length > 0) && (
                <span className="text-[9px] text-gray-400" title={`${t.dependsOn.length} dependencia(s)`}>{'\uD83D\uDD17'}{t.dependsOn.length}</span>
              )}
              {t.dueDate && (
                <span className={`text-[9px] font-medium whitespace-nowrap ${isOverdue ? 'text-red-500' : 'text-gray-400'}`} title={`Vence: ${t.dueDate}`}>
                  {isOverdue ? '\u26A0' : '\uD83D\uDCC5'} {fmtDate(t.dueDate)}
                </span>
              )}
            </div>
          </div>

          {/* Col 4: Assignees */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', minWidth: 0 }}>
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
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] bg-gray-100 text-gray-400 opacity-40 group-hover:opacity-100 transition-opacity" title="Asignar">+</span>
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

          {/* Col 5: Time display */}
          <div style={{ textAlign: 'right', minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
            {estimated !== null ? (
              <span className="text-[10px]">
                {elapsed > 0 ? (
                  <span className="font-semibold" style={{ color: elapsed >= estimated * 2 ? '#EF4444' : elapsed > estimated ? '#F97316' : '#22C55E' }}>
                    {'\u23F1'} {elapsed}d <span className="text-gray-300 font-normal">/ {estimated}d</span>
                  </span>
                ) : (
                  <span className="text-gray-400">{estimated}d est.</span>
                )}
              </span>
            ) : elapsed > 0 ? (
              <span className="text-[10px] text-blue-500 font-semibold">{'\u23F1'} {elapsed}d</span>
            ) : (
              <span className="text-[10px] text-gray-300 opacity-0 group-hover:opacity-100">sin fecha</span>
            )}
          </div>

          {/* Col 6: Actions */}
          <div className="flex items-center justify-end gap-0.5 min-w-0">
            <button
              className="text-[11px] w-5 h-5 rounded hover:bg-gray-200 text-gray-400 bg-transparent border-none cursor-pointer font-sans opacity-0 group-hover:opacity-100 hover:text-blue-500 flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); setDepsModal(t.id); }}
              title="Dependencias"
            >{'\uD83D\uDD17'}</button>
            <div
              ref={el => movePhaseRef.current = el}
              className="w-5 h-5 cursor-pointer opacity-0 group-hover:opacity-100 rounded hover:bg-gray-200 flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); setOpenDropdown('rd-movephase-' + t.id); }}
              title="Mover a otra fase"
            >
              <span className="text-[11px] text-gray-400">{'\u2194'}</span>
            </div>
            <Dropdown
              open={openDropdown === 'rd-movephase-' + t.id}
              onClose={() => setOpenDropdown(null)}
              anchorRef={movePhaseRef}
              items={Object.entries(allPh).map(([k, v]) => ({ label: v.label, icon: '\u25CF', iconColor: v.color, onClick: () => updateTask(t.id, { phase: k, isRoadmapTask: true }) }))}
            />
            <button
              className="text-[11px] w-5 h-5 rounded hover:bg-red-50 text-gray-400 bg-transparent border-none cursor-pointer font-sans opacity-0 group-hover:opacity-100 hover:text-red-500 flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); if (confirm('Eliminar esta tarea?')) deleteTask(t.id); }}
              title="Eliminar"
            >{'\u2715'}</button>
          </div>
        </div>

        {/* Blocked warning */}
        {blocked && blockingNames.length > 0 && (
          <div className="text-[10px] text-red-500 pl-[52px] pb-1 leading-tight">Bloqueada por: {blockingNames.join(', ')}</div>
        )}

        {/* Expanded detail */}
        {isExpanded && (
          <div className="pl-[52px] pr-3 pb-2.5 pt-1 bg-gray-50/50">
            <textarea
              className="w-full border border-gray-200 rounded-md py-2 px-2.5 text-xs font-sans resize-y min-h-[50px] outline-none bg-white focus:border-blue-400 mb-2"
              placeholder="Descripci\u00f3n de la tarea..."
              defaultValue={t.description || ''}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => updateTask(t.id, { description: e.target.value })}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1 text-[10px]" onClick={(e) => e.stopPropagation()}>
                <span className="text-gray-400">{'\uD83D\uDCC5'} Entrega:</span>
                <input
                  type="date"
                  className="border border-gray-200 rounded py-[2px] px-1.5 text-[10px] font-sans outline-none bg-white focus:border-blue-400 w-[120px]"
                  value={t.dueDate || ''}
                  onChange={(e) => updateTask(t.id, { dueDate: e.target.value || null })}
                />
                {t.dueDate && (
                  <button className="text-gray-400 hover:text-red-400 bg-transparent border-none cursor-pointer text-[10px] font-sans" onClick={() => updateTask(t.id, { dueDate: null })}>{'\u2715'}</button>
                )}
              </div>
              <button
                className="text-[10px] py-[3px] px-2 rounded bg-red-50 text-red-500 hover:bg-red-100 cursor-pointer font-sans ml-auto border-none"
                onClick={(e) => { e.stopPropagation(); if (confirm('Eliminar esta tarea?')) deleteTask(t.id); }}
              >Eliminar</button>
            </div>
          </div>
        )}
        {rdIsDragOver && rdDragOverHalf === 'bottom' && <div className="drag-indicator" />}
      </div>
    );
  };

  return (
    <div className="space-y-2 p-3">
      {phaseGroups.map(({ phaseKey, phInfo, phaseTasks, totalCount, doneCount, allDone, phaseStart, phaseEnd }) => {
        const collapsed = isCollapsed(phaseKey, allDone);
        const getGroup = (t) => {
          if (t.status === 'done') return 2;
          if (isTaskBlocked(t)) return 1;
          return 0;
        };
        const sortedTasks = [...phaseTasks].sort((a, b) => {
          const ga = getGroup(a), gb = getGroup(b);
          if (ga !== gb) return ga - gb;
          return (a.position ?? 0) - (b.position ?? 0);
        });

        return (
          <div key={phaseKey} className={`rounded-lg overflow-hidden bg-white border ${rdDragOverPhase === phaseKey ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-100'}`} style={{ borderLeft: `3px solid ${phInfo.color}` }}>
            <div
              className={`flex items-center gap-2 py-2.5 px-3 cursor-pointer select-none hover:bg-gray-50 group/phase transition-colors ${rdDragOverPhase === phaseKey ? 'bg-blue-50' : ''}`}
              onClick={() => togglePhase(phaseKey)}
              onDragOver={(e) => rdHandleDragOverPhase(e, phaseKey)}
              onDrop={(e) => rdHandleDropOnPhase(e, phaseKey)}
              onDragLeave={() => { if (rdDragOverPhase === phaseKey) setRdDragOverPhase(null); }}
            >
              <span className="text-[11px] text-gray-400 shrink-0">{collapsed ? '\u25B6' : '\u25BC'}</span>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: phInfo.color }} />
              {phaseKey === '_unphased' ? (
                <span
                  className="text-[13px] font-bold py-0.5 px-1 italic"
                  style={{ color: phInfo.color }}
                  title="Fase del sistema: contiene tareas sin fase asignada"
                >{phInfo.label}</span>
              ) : editingPhase === phaseKey ? (
                <input
                  className="text-[13px] font-bold border border-blue-400 rounded-md py-0.5 px-2 outline-none bg-white font-sans"
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
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => { e.stopPropagation(); setEditingPhase(phaseKey); setEditPhaseValue(phInfo.label); }}
                  title="Doble click para renombrar"
                >{phInfo.label}</span>
              )}
              <span className="text-[11px] font-semibold text-gray-400">({doneCount}/{totalCount})</span>
              {(() => {
                // Badge de dias transcurridos / estimados — misma logica que las tareas
                if (phaseKey === '_unphased') return null;
                const deadline = (c.phaseDeadlines || {})[phaseKey];
                if (allDone && phaseStart && phaseEnd) {
                  const d = daysBetween(phaseStart, phaseEnd);
                  if (d === null) return null;
                  return <span className="text-[10px] text-gray-400" title="Duracion real">{'\u23F1'} hecho en {d}d</span>;
                }
                if (!phaseStart) return null;
                const elapsed = daysAgo(phaseStart);
                const estimated = deadline ? daysBetween(phaseStart, deadline) : null;
                if (estimated !== null && estimated >= 0) {
                  const color = elapsed >= estimated * 2 ? '#EF4444' : elapsed > estimated ? '#F97316' : '#22C55E';
                  return (
                    <span className="text-[10px] font-semibold" style={{ color }} title="Dias transcurridos / estimados">
                      {'\u23F1'} {elapsed}d <span className="text-gray-300 font-normal">/ {estimated}d</span>
                    </span>
                  );
                }
                return <span className="text-[10px] text-blue-500 font-semibold" title="Dias transcurridos">{'\u23F1'} {elapsed}d</span>;
              })()}
              {allDone && <span className="text-green-500 text-sm">{'\u2713'}</span>}
              {phaseKey !== '_unphased' && (() => {
                const deadline = (c.phaseDeadlines || {})[phaseKey];
                const deadlineOverdue = deadline && !allDone && deadline < now;
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
                        const deadlines = { ...(c.phaseDeadlines || {}) };
                        if (val) deadlines[phaseKey] = val;
                        else delete deadlines[phaseKey];
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
                      className={`text-[10px] font-medium ml-1 px-1.5 py-[1px] rounded cursor-pointer hover:bg-gray-100 ${deadlineOverdue ? 'text-red-500 bg-red-50' : 'text-gray-400'}`}
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
              {/* Eliminar fase — solo para fases custom de este cliente */}
              {(c.customPhases || []).some(cp => cp.id === phaseKey) && (
                <button
                  className="ml-auto text-[10px] text-gray-400 bg-transparent border-none cursor-pointer font-sans py-0.5 px-1.5 rounded hover:text-red-500 hover:bg-red-50 opacity-0 group-hover/phase:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    const tasksInPhase = clientTasks.filter(t => (t.phase || '_unphased') === phaseKey);
                    setDeletePhaseConfirm({ phaseKey, label: phInfo.label, color: phInfo.color, taskCount: tasksInPhase.length });
                  }}
                  title="Eliminar fase"
                >{'\uD83D\uDDD1'} Eliminar</button>
              )}
            </div>

            {!collapsed && (
              <div className="border-t border-gray-50">
                {sortedTasks.map((t, idx) => renderTaskRow(t, idx === sortedTasks.length - 1, sortedTasks))}
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

      {addingPhase ? (
        <div className="rounded-lg overflow-hidden bg-white border border-blue-300 p-2.5 flex items-center gap-2" style={{ borderLeft: '3px solid #5B7CF5' }}>
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: '#5B7CF5' }} />
          <input
            className="flex-1 text-[13px] font-bold border border-blue-400 rounded-md py-1 px-2 outline-none bg-white font-sans"
            placeholder="Nombre de la nueva fase..."
            value={newPhaseName}
            onChange={(e) => setNewPhaseName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const label = newPhaseName.trim();
                if (label) {
                  const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                  const color = ['#8B5CF6', '#F97316', '#EC4899', '#14B8A6', '#06B6D4'][Math.floor(Math.random() * 5)];
                  updateClient(c.id, { customPhases: [...(c.customPhases || []), { id, label, color }] });
                }
                setNewPhaseName('');
                setAddingPhase(false);
              }
              if (e.key === 'Escape') { setNewPhaseName(''); setAddingPhase(false); }
            }}
            onBlur={() => {
              const label = newPhaseName.trim();
              if (label) {
                const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                const color = ['#8B5CF6', '#F97316', '#EC4899', '#14B8A6', '#06B6D4'][Math.floor(Math.random() * 5)];
                updateClient(c.id, { customPhases: [...(c.customPhases || []), { id, label, color }] });
              }
              setNewPhaseName('');
              setAddingPhase(false);
            }}
          />
        </div>
      ) : (
        <button
          className="w-full text-[12px] text-gray-400 py-2.5 px-3 bg-white border border-dashed border-gray-200 rounded-lg cursor-pointer font-sans hover:text-blue-500 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
          onClick={() => setAddingPhase(true)}
        >+ Agregar fase</button>
      )}

      <Modal
        open={!!depsModal}
        onClose={() => setDepsModal(null)}
        title="Configurar dependencias"
        maxWidth={450}
        footer={<button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark" onClick={() => setDepsModal(null)}>Cerrar</button>}
      >
        {depsModal && (() => {
          const currentTask = clientTasks.find(t => t.id === depsModal);
          if (!currentTask) return <div className="text-xs text-gray-400">Tarea no encontrada</div>;
          const otherTasks = clientTasks.filter(t => t.id !== depsModal);
          const currentDeps = currentTask.dependsOn || [];
          const depPhaseKeys = [...Object.keys(allPh), '_unphased'];
          const depPhaseGroups = depPhaseKeys.map(pk => {
            const phInfo = pk === '_unphased' ? { label: 'Sin fase', color: '#9CA3AF' } : (allPh[pk] || { label: pk, color: '#9CA3AF' });
            const tasksInPhase = otherTasks.filter(t => resolvePhase(t) === pk);
            return { pk, phInfo, tasksInPhase };
          }).filter(g => g.tasksInPhase.length > 0);

          return (
            <div>
              <div className="text-xs text-gray-500 mb-3">Selecciona las tareas que deben completarse antes de <strong>{currentTask.title}</strong>:</div>
              {otherTasks.length === 0 ? (
                <div className="text-xs text-gray-400 py-4 text-center">No hay otras tareas en este cliente</div>
              ) : (
                <div className="max-h-[350px] overflow-y-auto">
                  {depPhaseGroups.map(({ pk, phInfo, tasksInPhase }) => (
                    <div key={pk} className="mb-2">
                      <div className="flex items-center gap-1.5 py-1.5 px-1 sticky top-0 bg-white z-[1]">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: phInfo.color }} />
                        <span className="text-[11px] font-bold" style={{ color: phInfo.color }}>{phInfo.label}</span>
                      </div>
                      {tasksInPhase.map(tt => {
                        const isChecked = currentDeps.includes(tt.id);
                        const isDone = tt.status === 'done';
                        return (
                          <label key={tt.id} className={`flex items-center gap-2.5 py-1.5 px-3 pl-6 rounded-md cursor-pointer text-xs hover:bg-gray-50 ${isDone ? 'opacity-50' : ''}`}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const newDeps = isChecked ? currentDeps.filter(d => d !== tt.id) : [...currentDeps, tt.id];
                                updateTask(depsModal, { dependsOn: newDeps });
                              }}
                              className="cursor-pointer"
                            />
                            <span className={`flex-1 ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>{tt.title}</span>
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

      {/* Confirmacion eliminar fase */}
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
                <div className="text-[13px] font-semibold text-red-600 mb-1">{'\u26A0'} Se eliminar\u00E1n {deletePhaseConfirm.taskCount} tarea{deletePhaseConfirm.taskCount > 1 ? 's' : ''}</div>
                <div className="text-[12px] text-red-500">Todas las tareas dentro de esta fase ser\u00E1n eliminadas permanentemente. Esta acci\u00F3n no se puede deshacer.</div>
              </div>
            ) : (
              <div className="text-[13px] text-gray-500 mb-5">Esta fase no tiene tareas. Se eliminar\u00E1 solo la fase.</div>
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
                  const tasksInPhase = clientTasks.filter(t => (t.phase || '_unphased') === pk);
                  tasksInPhase.forEach(t => deleteTask(t.id));
                  const newCustomPhases = (c.customPhases || []).filter(cp => cp.id !== pk);
                  updateClient(c.id, { customPhases: newCustomPhases });
                  setDeletePhaseConfirm(null);
                }}
              >{deletePhaseConfirm.taskCount > 0 ? `S\u00ED, eliminar fase y sus ${deletePhaseConfirm.taskCount} tareas` : 'S\u00ED, eliminar fase'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
