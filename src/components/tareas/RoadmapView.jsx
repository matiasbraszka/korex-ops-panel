import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { PRIO_CLIENT, TEAM, TASK_STATUS } from '../../utils/constants';
import { getAllPhases, fmtDate, today, getEstimatedDays, daysBetween, daysAgo } from '../../utils/helpers';
import TeamAvatar from '../TeamAvatar';

const EXPANDED_KEY = 'tareas_roadmap_expanded';

export default function RoadmapView() {
  const {
    clients,
    tasks,
    updateTask,
    updateClient,
    createTask,
    deleteTask,
    setView,
    setSelectedId,
    taskClientFilter,
    taskPriority,
    taskAssignee,
    hideCompletedTasks,
    hideBlockedTasks,
  } = useApp();

  // Expanded state persisted
  const [expanded, setExpanded] = useState(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded)); } catch {}
  }, [expanded]);

  // Inline editing state
  const [editingDeadline, setEditingDeadline] = useState(null);
  const [editingTaskDue, setEditingTaskDue] = useState(null);
  const [editingPhaseName, setEditingPhaseName] = useState(null); // key: clientId_phaseKey
  const [editingTaskTitle, setEditingTaskTitle] = useState(null); // taskId
  const [addingTaskIn, setAddingTaskIn] = useState(null); // key: clientId_phaseKey

  const now = today();

  const isKorexClient = (c) => /empresa|korex/i.test(c.name);

  // Helper: check if a task matches the assignee filter
  const taskMatchesAssignee = (t, assigneeFilter) => {
    if (assigneeFilter === 'all') return true;
    if (!t.assignee) return false;
    const parts = t.assignee.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    return parts.includes(assigneeFilter.toLowerCase());
  };

  // Dependency-blocked detection: a task is blocked if any of its dependencies isn't done
  const isTaskBlockedByDeps = (t) => {
    if (!t.dependsOn || t.dependsOn.length === 0) return false;
    if (t.status === 'done') return false;
    return t.dependsOn.some(depId => {
      const dep = tasks.find(x => x.id === depId);
      return dep && dep.status !== 'done';
    });
  };

  // Combined: either literal 'blocked' status OR blocked by deps
  const isTaskBlockedAny = (t) => t.status === 'blocked' || isTaskBlockedByDeps(t);

  // Helper: check if a task should be hidden by completion/blocked toggles
  const isTaskHidden = (t) => {
    if (hideCompletedTasks && t.status === 'done') return true;
    if (hideBlockedTasks && isTaskBlockedAny(t)) return true;
    return false;
  };

  // Active clients (not completed, not Korex, not descartados by default)
  let filteredClients = clients.filter(c => c.status !== 'completed' && !isKorexClient(c));

  // Apply client filter
  if (taskClientFilter !== 'all') {
    filteredClients = filteredClients.filter(c => c.id === taskClientFilter);
  }

  // Apply priority filter (if no explicit priority filter, hide descartados)
  if (taskPriority !== 'all') {
    filteredClients = filteredClients.filter(c => String(c.priority || 5) === taskPriority);
  } else {
    filteredClients = filteredClients.filter(c => (c.priority || 5) !== 6);
  }

  // Apply assignee filter: only keep clients that have at least one task matching
  if (taskAssignee !== 'all') {
    filteredClients = filteredClients.filter(c =>
      tasks.some(t => t.clientId === c.id && taskMatchesAssignee(t, taskAssignee))
    );
  }

  // Compute progress per client
  const clientProgress = (c) => {
    const cTasks = tasks.filter(t => t.clientId === c.id);
    if (cTasks.length === 0) return 0;
    return Math.round(cTasks.filter(t => t.status === 'done').length / cTasks.length * 100);
  };

  // Sort: by priority, then by progress
  filteredClients = [...filteredClients].sort((a, b) => {
    const pa = a.priority || 5;
    const pb = b.priority || 5;
    if (pa !== pb) return pa - pb;
    return clientProgress(a) - clientProgress(b);
  });

  // Auto-expand first Super Prioritario on first load if nothing expanded
  useEffect(() => {
    if (Object.keys(expanded).length === 0) {
      const activeClients = clients.filter(c => c.status !== 'completed' && !isKorexClient(c));
      const first = activeClients.find(c => c.priority === 1) || activeClients[0];
      if (first) setExpanded({ [first.id]: true });
    }
    // eslint-disable-next-line
  }, []);

  // When filtering to a single client, force expand
  const isForceExpanded = taskClientFilter !== 'all';

  const toggleExpand = (clientId) => {
    setExpanded(prev => ({ ...prev, [clientId]: !prev[clientId] }));
  };

  const handleDeadlineChange = (clientId, phaseKey, value) => {
    const c = clients.find(x => x.id === clientId);
    if (!c) return;
    const deadlines = { ...(c.phaseDeadlines || {}), [phaseKey]: value };
    updateClient(clientId, { phaseDeadlines: deadlines });
    setEditingDeadline(null);
  };

  const handleTaskDueChange = (taskId, value) => {
    updateTask(taskId, { dueDate: value });
    setEditingTaskDue(null);
  };

  const cycleTaskStatus = (t) => {
    const order = ['backlog', 'in-progress', 'en-revision', 'done'];
    const cur = order.indexOf(t.status);
    const next = order[(cur + 1) % order.length];
    const updates = { status: next };
    if (next === 'done') updates.completedDate = now;
    if (next === 'in-progress' && !t.startedDate) updates.startedDate = now;
    updateTask(t.id, updates);
  };

  const openInClientDetail = (clientId) => {
    setSelectedId(clientId);
    setView('clients');
  };

  // Renombrar fase: guarda un override por-cliente (no cambia la constante global)
  const handlePhaseRename = (clientId, phaseKey, newLabel) => {
    const c = clients.find(x => x.id === clientId);
    if (!c) return;
    const overrides = { ...(c.phaseNameOverrides || {}) };
    const trimmed = (newLabel || '').trim();
    if (trimmed) {
      overrides[phaseKey] = trimmed;
    } else {
      delete overrides[phaseKey];
    }
    updateClient(clientId, { phaseNameOverrides: overrides });
    setEditingPhaseName(null);
  };

  // Crear tarea nueva en una fase espec\u00edfica
  const handleCreateTaskInPhase = (clientId, phaseKey, title) => {
    const trimmed = (title || '').trim();
    if (!trimmed) {
      setAddingTaskIn(null);
      return;
    }
    const t = createTask(trimmed, clientId, '', 'normal', 'backlog', '', null);
    // Asignar a la fase + marcar como roadmap task
    if (t) updateTask(t.id, { phase: phaseKey, isRoadmapTask: true });
    setAddingTaskIn(null);
  };

  const handleDeleteTask = (taskId) => {
    if (confirm('Eliminar esta tarea?')) {
      deleteTask(taskId);
    }
  };

  const handleTaskTitleRename = (taskId, newTitle) => {
    const trimmed = (newTitle || '').trim();
    if (trimmed) updateTask(taskId, { title: trimmed });
    setEditingTaskTitle(null);
  };

  return (
    <div className="space-y-3">
      {filteredClients.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          No hay clientes que coincidan con los filtros
        </div>
      ) : filteredClients.map(c => {
        const isExpanded = isForceExpanded || !!expanded[c.id];
        const progress = clientProgress(c);
        const prio = PRIO_CLIENT[c.priority || 5];
        const clientTasks = tasks.filter(t => t.clientId === c.id);
        const allPh = getAllPhases(c);
        const deadlines = c.phaseDeadlines || {};

        // Group tasks by phase, with cascading assignee filter + hide toggles
        const resolvePhase = (t) => t.phase || '_unphased';
        const phaseKeys = [...Object.keys(allPh)];
        const phaseGroups = phaseKeys.map(phaseKey => {
          const phInfo = allPh[phaseKey] || { label: phaseKey, color: '#9CA3AF' };
          // Start with all tasks in this phase for the client
          let phaseTasks = clientTasks.filter(t => resolvePhase(t) === phaseKey);
          // Apply assignee cascade filter
          if (taskAssignee !== 'all') {
            phaseTasks = phaseTasks.filter(t => taskMatchesAssignee(t, taskAssignee));
          }
          // Apply hide toggles
          phaseTasks = phaseTasks.filter(t => !isTaskHidden(t));
          // Compute counts from ALL tasks in the phase (unfiltered) for the progress display
          const allPhaseTasks = clientTasks.filter(t => resolvePhase(t) === phaseKey);
          const totalCount = allPhaseTasks.length;
          const doneCount = allPhaseTasks.filter(t => t.status === 'done').length;
          const allDone = totalCount > 0 && doneCount === totalCount;
          const deadline = deadlines[phaseKey];
          const isOverdue = deadline && deadline < now && !allDone;
          return { phaseKey, phInfo, phaseTasks, totalCount, doneCount, allDone, deadline, isOverdue };
        }).filter(g => g.totalCount > 0 || g.deadline);

        const isCompleted = progress === 100;

        return (
          <div
            key={c.id}
            className={`bg-white border rounded-xl overflow-hidden transition-all ${
              isCompleted ? 'opacity-60 border-gray-100' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            {/* Client header */}
            <div
              className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleExpand(c.id)}
            >
              {/* Expand arrow */}
              <span
                className={`text-[10px] text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              >
                {'\u25B6'}
              </span>

              {/* Avatar */}
              {c.avatarUrl ? (
                <img src={c.avatarUrl} alt={c.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[11px] shrink-0"
                  style={{ background: c.color || '#5B7CF5' }}
                >
                  {c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              )}

              {/* Name + company */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-bold text-gray-800 truncate">{c.name}</span>
                  {prio && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0"
                      style={{ background: prio.color + '18', color: prio.color }}
                    >
                      {prio.label}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-gray-400 truncate">
                  {c.company} {c.pm ? `\u00b7 PM: ${c.pm}` : ''}
                </div>
              </div>

              {/* Progress */}
              <div className="shrink-0 flex items-center gap-2 max-md:hidden">
                <div className="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${progress}%`, background: progress === 100 ? '#22C55E' : '#5B7CF5' }}
                  />
                </div>
                <span className="text-[11px] font-semibold text-gray-600 w-8 text-right">{progress}%</span>
              </div>

              {/* Open in detail button */}
              <button
                className="text-[11px] text-gray-400 hover:text-blue-500 px-2 py-1 rounded hover:bg-blue-50 font-sans shrink-0"
                onClick={(e) => { e.stopPropagation(); openInClientDetail(c.id); }}
                title="Abrir perfil del cliente"
              >
                {'\u2197'}
              </button>
            </div>

            {/* Expanded body */}
            {isExpanded && (
              <div className="border-t border-gray-100 bg-gray-50/30">
                {phaseGroups.length === 0 ? (
                  <div className="text-center text-gray-400 text-[11px] py-6">
                    {taskAssignee !== 'all'
                      ? `Sin tareas de ${taskAssignee} en este cliente`
                      : 'Sin tareas asignadas'}
                  </div>
                ) : phaseGroups.map(g => {
                  const phaseEditKey = `${c.id}_${g.phaseKey}`;
                  const isRenaming = editingPhaseName === phaseEditKey;
                  return (
                  <div key={g.phaseKey} className="border-b border-gray-100 last:border-b-0 group/phase">
                    {/* Phase header */}
                    <div className="flex items-center gap-2 px-4 py-2 bg-white">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: g.phInfo.color }} />
                      {isRenaming ? (
                        <input
                          type="text"
                          className="text-[11px] font-bold uppercase tracking-wide bg-white border border-blue-300 rounded px-1.5 py-0.5 outline-none flex-1 max-w-[280px]"
                          style={{ color: g.phInfo.color }}
                          defaultValue={g.phInfo.label}
                          autoFocus
                          onBlur={(e) => handlePhaseRename(c.id, g.phaseKey, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.target.blur();
                            if (e.key === 'Escape') setEditingPhaseName(null);
                          }}
                        />
                      ) : (
                        <span
                          className="text-[11px] font-bold uppercase tracking-wide cursor-pointer hover:underline"
                          style={{ color: g.phInfo.color }}
                          onClick={() => setEditingPhaseName(phaseEditKey)}
                          title="Click para renombrar"
                        >
                          {g.phInfo.label}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">
                        {g.doneCount}/{g.totalCount}
                      </span>
                      {g.allDone && <span className="text-[10px] text-green-500">{'\u2713'}</span>}

                      {/* Phase deadline */}
                      <div className="ml-auto">
                        {editingDeadline === `${c.id}_${g.phaseKey}` ? (
                          <input
                            type="date"
                            className="border border-blue-300 rounded text-[10px] px-1 outline-none w-[115px]"
                            defaultValue={g.deadline || ''}
                            autoFocus
                            onChange={(e) => e.target.value && handleDeadlineChange(c.id, g.phaseKey, e.target.value)}
                            onBlur={() => setEditingDeadline(null)}
                          />
                        ) : g.deadline ? (
                          <button
                            className={`text-[10px] font-semibold hover:underline font-sans ${g.isOverdue ? 'text-red-500' : 'text-gray-500'}`}
                            onClick={() => setEditingDeadline(`${c.id}_${g.phaseKey}`)}
                          >
                            {'\uD83D\uDCC5'} {fmtDate(g.deadline)}
                          </button>
                        ) : (
                          <button
                            className="text-[10px] text-blue-400 hover:text-blue-600 font-sans"
                            onClick={() => setEditingDeadline(`${c.id}_${g.phaseKey}`)}
                          >
                            + deadline
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Phase tasks */}
                    <div className="divide-y divide-gray-100">
                      {g.phaseTasks.map(t => {
                        const members = (t.assignee ? t.assignee.split(',').map(s => s.trim()).filter(Boolean) : [])
                          .map(name => TEAM.find(m => m.name.toLowerCase() === name.toLowerCase() || m.id === name))
                          .filter(Boolean);
                        const taskStatus = TASK_STATUS[t.status];
                        const isOverdueByDue = t.dueDate && t.status !== 'done' && t.dueDate < now;
                        const depBlocked = isTaskBlockedByDeps(t);
                        const literalBlocked = t.status === 'blocked';
                        const isBlocked = literalBlocked || depBlocked;
                        const isDone = t.status === 'done';

                        // Badges de d\u00edas estimado / transcurrido
                        const hasStart = !!t.startedDate;
                        const estimatedD = getEstimatedDays(t);
                        const elapsedD = hasStart && !isDone ? Math.max(0, daysBetween(t.startedDate, now) || 0) : null;
                        const isOverdueByTime = estimatedD !== null && elapsedD !== null && elapsedD > estimatedD;
                        const blockedSinceD = isBlocked && t.blockedSince ? daysAgo(t.blockedSince) : null;
                        const doneInDays = isDone && hasStart && t.completedDate ? (daysBetween(t.startedDate, t.completedDate) ?? 0) : null;

                        // Visual: blocked tasks get red accent
                        const iconColor = isBlocked ? '#EF4444' : (taskStatus?.color || '#9CA3AF');
                        const iconChar = isBlocked ? '\uD83D\uDD12' : (taskStatus?.icon || '\u25CB');

                        return (
                          <div
                            key={t.id}
                            className={`flex items-center gap-2 px-4 py-2 hover:bg-white group ${t.status === 'done' ? 'opacity-60' : ''} ${isBlocked ? 'bg-red-50/40' : ''}`}
                            title={depBlocked ? 'Bloqueada por dependencias' : literalBlocked ? 'Bloqueada' : ''}
                          >
                            {/* Status icon (click to cycle) */}
                            <button
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 cursor-pointer"
                              style={{
                                background: iconColor + '15',
                                color: iconColor,
                                border: `1.5px solid ${iconColor}`,
                              }}
                              title={taskStatus?.label}
                              onClick={() => cycleTaskStatus(t)}
                            >
                              {iconChar}
                            </button>

                            {/* Title (click to rename) */}
                            {editingTaskTitle === t.id ? (
                              <input
                                type="text"
                                className="text-[12px] flex-1 min-w-0 bg-white border border-blue-300 rounded px-1.5 py-0.5 outline-none"
                                defaultValue={t.title}
                                autoFocus
                                onBlur={(e) => handleTaskTitleRename(t.id, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.target.blur();
                                  if (e.key === 'Escape') setEditingTaskTitle(null);
                                }}
                              />
                            ) : (
                              <span
                                className={`text-[12px] flex-1 min-w-0 cursor-pointer hover:underline ${
                                  t.status === 'done' ? 'line-through text-gray-400' : isBlocked ? 'text-red-600' : 'text-gray-700'
                                }`}
                                onClick={() => setEditingTaskTitle(t.id)}
                                title="Click para renombrar"
                              >
                                {t.title}
                                {depBlocked && <span className="ml-1.5 text-[9px] text-red-500 font-semibold uppercase">bloqueada</span>}
                              </span>
                            )}

                            {/* Badge d\u00edas */}
                            {isBlocked ? (
                              <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold font-sans" title={blockedSinceD !== null ? 'Bloqueada hace ' + blockedSinceD + ' d\u00edas' : 'Bloqueada'}>
                                {'\uD83D\uDD12'} {blockedSinceD !== null ? `${blockedSinceD}d` : 'bloqueada'}
                              </span>
                            ) : doneInDays !== null ? (
                              <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-semibold font-sans" title="D\u00edas que tom\u00f3">
                                hecho en {doneInDays}d
                              </span>
                            ) : estimatedD !== null && elapsedD !== null ? (
                              <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-semibold font-sans ${isOverdueByTime ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`} title={`${elapsedD}d transcurridos de ${estimatedD}d estimados`}>
                                {elapsedD}/{estimatedD}d
                              </span>
                            ) : null}

                            {/* Assignees */}
                            {members.length > 0 && (
                              <div className="flex -space-x-1 shrink-0">
                                {members.slice(0, 3).map(m => (
                                  <TeamAvatar key={m.id} member={m} size={18} className="ring-2 ring-white" />
                                ))}
                                {members.length > 3 && (
                                  <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-bold bg-gray-200 text-gray-600 ring-2 ring-white">
                                    +{members.length - 3}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Due date */}
                            <div className="shrink-0 w-[105px] text-right">
                              {editingTaskDue === t.id ? (
                                <input
                                  type="date"
                                  className="border border-blue-300 rounded text-[10px] px-1 outline-none w-[100px]"
                                  defaultValue={t.dueDate || ''}
                                  autoFocus
                                  onChange={(e) => e.target.value && handleTaskDueChange(t.id, e.target.value)}
                                  onBlur={() => setEditingTaskDue(null)}
                                />
                              ) : t.dueDate ? (
                                <button
                                  className={`text-[10px] font-semibold hover:underline font-sans ${isOverdueByDue ? 'text-red-500' : 'text-gray-400'}`}
                                  onClick={() => setEditingTaskDue(t.id)}
                                >
                                  {fmtDate(t.dueDate)}
                                </button>
                              ) : (
                                <button
                                  className="text-[10px] text-blue-300 hover:text-blue-500 font-sans"
                                  onClick={() => setEditingTaskDue(t.id)}
                                >
                                  {'\uD83D\uDCC5'}
                                </button>
                              )}
                            </div>

                            {/* Delete button */}
                            <button
                              className="shrink-0 text-[11px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity font-sans w-5 text-center"
                              onClick={() => handleDeleteTask(t.id)}
                              title="Eliminar tarea"
                            >
                              {'\uD83D\uDDD1'}
                            </button>
                          </div>
                        );
                      })}

                      {/* Add task button / inline input */}
                      {addingTaskIn === phaseEditKey ? (
                        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50/30">
                          <span className="w-5 h-5 shrink-0" />
                          <input
                            type="text"
                            className="text-[12px] flex-1 bg-white border border-blue-300 rounded px-2 py-1 outline-none"
                            placeholder="T\u00edtulo de la nueva tarea..."
                            autoFocus
                            onBlur={(e) => handleCreateTaskInPhase(c.id, g.phaseKey, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.target.blur();
                              if (e.key === 'Escape') setAddingTaskIn(null);
                            }}
                          />
                        </div>
                      ) : (
                        <button
                          className="w-full text-left text-[11px] text-gray-400 hover:text-blue-500 hover:bg-blue-50/30 px-4 py-1.5 font-sans transition-colors"
                          onClick={() => setAddingTaskIn(phaseEditKey)}
                        >
                          + Agregar tarea
                        </button>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
