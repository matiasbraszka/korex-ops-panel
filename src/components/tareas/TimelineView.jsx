import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { TEAM, PHASES } from '../../utils/constants';
import { today, fmtDate, getAllPhases } from '../../utils/helpers';
import TeamAvatar from '../TeamAvatar';

export default function TimelineView() {
  const {
    clients,
    tasks,
    updateClient,
    updateTask,
    taskClientFilter,
    taskPriority,
    taskAssignee,
    hideCompletedTasks,
    hideBlockedTasks,
  } = useApp();

  const [assigningDeadline, setAssigningDeadline] = useState(null);
  const [expandedPhases, setExpandedPhases] = useState({});
  const [assigningTaskDate, setAssigningTaskDate] = useState(null);
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [editingPhaseDeadline, setEditingPhaseDeadline] = useState(null);

  const now = today();

  const isKorexClient = (c) => /empresa|korex/i.test(c.name);

  // Helper: check if a task matches the assignee filter
  const taskMatchesAssignee = (t, assigneeFilter) => {
    if (assigneeFilter === 'all') return true;
    if (!t.assignee) return false;
    const parts = t.assignee.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    return parts.includes(assigneeFilter.toLowerCase());
  };

  // Dependency-blocked detection
  const isTaskBlockedByDeps = (t) => {
    if (!t.dependsOn || t.dependsOn.length === 0) return false;
    if (t.status === 'done') return false;
    return t.dependsOn.some(depId => {
      const dep = tasks.find(x => x.id === depId);
      return dep && dep.status !== 'done';
    });
  };
  const isTaskBlockedAny = (t) => t.status === 'blocked' || isTaskBlockedByDeps(t);

  const isTaskHidden = (t) => {
    if (hideCompletedTasks && t.status === 'done') return true;
    if (hideBlockedTasks && isTaskBlockedAny(t)) return true;
    return false;
  };

  // Apply client + priority filters
  const filteredClients = clients.filter(c => {
    if (isKorexClient(c)) return false;
    if (taskClientFilter !== 'all' && c.id !== taskClientFilter) return false;
    if (taskPriority !== 'all' && String(c.priority || 4) !== taskPriority) return false;
    return true;
  });

  // Phase timeline data
  const ganttEntries = [];
  const unscheduledPhases = [];
  filteredClients.forEach(c => {
    const allPh = getAllPhases(c);
    const deadlines = c.phaseDeadlines || {};
    const clientPhaseKeys = new Set();
    tasks.filter(t => t.clientId === c.id && t.phase).forEach(t => clientPhaseKeys.add(t.phase));
    Object.keys(allPh).forEach(k => clientPhaseKeys.add(k));

    clientPhaseKeys.forEach(phaseKey => {
      const phInfo = allPh[phaseKey] || PHASES[phaseKey];
      if (!phInfo) return;
      // Start with all tasks in this phase
      let phaseTasks = tasks.filter(t => t.clientId === c.id && t.phase === phaseKey);
      // Apply assignee cascade filter
      if (taskAssignee !== 'all') {
        phaseTasks = phaseTasks.filter(t => taskMatchesAssignee(t, taskAssignee));
      }
      // Apply hide toggles
      phaseTasks = phaseTasks.filter(t => !isTaskHidden(t));
      if (phaseTasks.length === 0 && !deadlines[phaseKey]) return;
      const done = phaseTasks.length > 0 && phaseTasks.every(t => t.status === 'done');
      const progress = phaseTasks.length > 0 ? Math.round(phaseTasks.filter(t => t.status === 'done').length / phaseTasks.length * 100) : 0;
      const deadline = deadlines[phaseKey];
      if (deadline && !done) {
        const isOverdue = deadline < now;
        ganttEntries.push({ client: c, phaseKey, phInfo, deadline, done, isOverdue, progress, phaseTasks: phaseTasks.filter(t => t.status !== 'done') });
      } else if (!done) {
        unscheduledPhases.push({ client: c, phaseKey, phInfo, progress, phaseTasks: phaseTasks.filter(t => t.status !== 'done') });
      }
    });
  });
  ganttEntries.sort((a, b) => a.deadline.localeCompare(b.deadline));

  // Group by client for Gantt
  const ganttByClient = {};
  ganttEntries.forEach(e => {
    if (!ganttByClient[e.client.id]) ganttByClient[e.client.id] = { client: e.client, phases: [] };
    ganttByClient[e.client.id].phases.push(e);
  });

  // Timeline: week columns
  const ganttStartDate = new Date(now);
  const startDay = ganttStartDate.getDay();
  const mondayOffset = startDay === 0 ? -6 : 1 - startDay;
  ganttStartDate.setDate(ganttStartDate.getDate() + mondayOffset - 7);
  const displayWeeks = 10;
  const weekColumns = [];
  for (let w = 0; w < displayWeeks; w++) {
    const weekStart = new Date(ganttStartDate);
    weekStart.setDate(weekStart.getDate() + w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const startIso = weekStart.toISOString().split('T')[0];
    const endIso = weekEnd.toISOString().split('T')[0];
    const startNum = weekStart.getDate();
    const endNum = weekEnd.getDate();
    const monthLabel = weekStart.toLocaleDateString('es-AR', { month: 'short' });
    const hasToday = now >= startIso && now <= endIso;
    weekColumns.push({ startIso, endIso, startNum, endNum, monthLabel, hasToday });
  }
  const weekWidth = 100;
  const labelWidth = 240;
  const totalTimelineStart = weekColumns[0].startIso;
  const totalTimelineEnd = weekColumns[weekColumns.length - 1].endIso;
  const totalDays = Math.round((new Date(totalTimelineEnd) - new Date(totalTimelineStart)) / 864e5);

  const dateToPx = (dateStr) => {
    const d = Math.round((new Date(dateStr) - new Date(totalTimelineStart)) / 864e5);
    return Math.max(0, Math.min(d / totalDays * weekColumns.length * weekWidth, weekColumns.length * weekWidth));
  };

  const resolveMembers = (assigneeStr) => {
    if (!assigneeStr) return [];
    const names = assigneeStr.split(',').map(s => s.trim()).filter(Boolean);
    const members = [];
    const seen = new Set();
    names.forEach(name => {
      const m = TEAM.find(t => t.name.toLowerCase() === name.toLowerCase() || t.id === name.toLowerCase());
      if (m && !seen.has(m.id)) { seen.add(m.id); members.push(m); }
    });
    return members;
  };

  const getPhaseMembers = (phaseTasks) => {
    const seen = new Set();
    const members = [];
    (phaseTasks || []).forEach(t => {
      resolveMembers(t.assignee).forEach(m => {
        if (!seen.has(m.id)) { seen.add(m.id); members.push(m); }
      });
    });
    return members;
  };

  const handleAssignDeadline = (clientId, phaseKey, dateVal) => {
    const c = clients.find(x => x.id === clientId);
    if (!c) return;
    const deadlines = { ...(c.phaseDeadlines || {}), [phaseKey]: dateVal };
    updateClient(clientId, { phaseDeadlines: deadlines });
    setAssigningDeadline(null);
  };

  const handleAssignTaskDate = (taskId, dateVal) => {
    updateTask(taskId, { dueDate: dateVal });
    setAssigningTaskDate(null);
  };

  const togglePhaseExpand = (clientId, phaseKey) => {
    const key = clientId + '_' + phaseKey;
    setExpandedPhases(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-md:p-3 max-md:rounded-lg">
      {ganttEntries.length === 0 && unscheduledPhases.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-8">
          No hay fases con deadlines asignadas. Asignales fecha desde la vista Roadmap.
        </div>
      ) : (
        <>
          {/* Hint for mobile horizontal scroll */}
          <div className="md:hidden text-[10px] text-gray-400 mb-2 flex items-center gap-1">
            {'\u2190'} Desliz\u00e1 horizontalmente para ver m\u00e1s semanas {'\u2192'}
          </div>

          {/* Gantt — week columns, scrollable on all viewports */}
          {ganttEntries.length > 0 && (
            <div
              className="timeline-scroll overflow-x-auto -mx-5 max-md:-mx-3 px-5 max-md:px-3"
              style={{ touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}
            >
              <div style={{ minWidth: labelWidth + weekColumns.length * weekWidth }}>
                {/* Week header */}
                <div className="flex" style={{ marginLeft: labelWidth }}>
                  {weekColumns.map((w, i) => (
                    <div key={i} className={`text-center shrink-0 border-b pb-1 ${w.hasToday ? 'border-b-2 border-blue-500' : 'border-gray-200'}`} style={{ width: weekWidth }}>
                      <div className="text-[9px] font-semibold text-gray-500 capitalize">{w.monthLabel}</div>
                      <div className={`text-[10px] leading-none ${w.hasToday ? 'font-bold text-blue-600' : 'text-gray-400'}`}>{w.startNum}–{w.endNum}</div>
                    </div>
                  ))}
                </div>

                {Object.values(ganttByClient).map(({ client: cl, phases }) => (
                  <div key={cl.id} className="border-b border-gray-100 last:border-b-0">
                    <div className="flex items-center" style={{ height: 24 }}>
                      <div className="shrink-0 pr-2" style={{ width: labelWidth }}>
                        <div className="text-[11px] font-bold text-gray-800 leading-tight">{cl.name}</div>
                      </div>
                    </div>
                    {phases.map((ph) => {
                      const color = ph.done ? '#22C55E' : ph.isOverdue ? '#EF4444' : ph.phInfo.color;
                      const barStartPx = dateToPx(now < ph.deadline ? now : ph.deadline);
                      const barEndPx = dateToPx(ph.deadline);
                      const barLeft = Math.min(barStartPx, barEndPx);
                      const barW = Math.max(weekWidth * 0.3, Math.abs(barEndPx - barStartPx));
                      const expandKey = cl.id + '_' + ph.phaseKey;
                      const isExpanded = expandedPhases[expandKey];
                      const hasTasks = ph.phaseTasks && ph.phaseTasks.length > 0;
                      const phaseMembers = getPhaseMembers(ph.phaseTasks);

                      return (
                        <div key={ph.phaseKey}>
                          <div className={`flex items-start py-1 ${hasTasks ? 'cursor-pointer hover:bg-gray-50/50' : ''}`} onClick={() => hasTasks && togglePhaseExpand(cl.id, ph.phaseKey)}>
                            <div className="shrink-0 pr-2 flex items-start gap-1 pt-0.5" style={{ width: labelWidth }}>
                              {hasTasks && <span className={`text-[8px] text-gray-400 transition-transform mt-0.5 ${isExpanded ? 'rotate-90' : ''}`}>{'\u25B6'}</span>}
                              <div className="text-[10px] leading-snug flex items-start gap-1 flex-1 min-w-0" style={{ color }}>
                                <span className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ background: color }} />
                                <span>{ph.phInfo.label}</span>
                                <span className="text-gray-400 text-[9px] shrink-0">({ph.progress}%)</span>
                              </div>
                              {editingPhaseDeadline === expandKey ? (
                                <input
                                  type="date"
                                  className="border border-blue-300 rounded text-[9px] px-0.5 outline-none bg-white w-[105px] shrink-0"
                                  defaultValue={ph.deadline}
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => { if (e.target.value) { handleAssignDeadline(cl.id, ph.phaseKey, e.target.value); setEditingPhaseDeadline(null); } }}
                                  onBlur={() => setEditingPhaseDeadline(null)}
                                />
                              ) : (
                                <button
                                  className={`text-[9px] shrink-0 font-sans hover:underline ${ph.isOverdue ? 'text-red-500' : 'text-gray-400'}`}
                                  onClick={(e) => { e.stopPropagation(); setEditingPhaseDeadline(expandKey); }}
                                >
                                  {fmtDate(ph.deadline)}
                                </button>
                              )}
                            </div>
                            <div className="relative flex items-center shrink-0" style={{ width: weekColumns.length * weekWidth, height: 28 }}>
                              {weekColumns.map((w, i) => (
                                <div key={i} className={`absolute top-0 bottom-0 ${w.hasToday ? 'bg-blue-50/30' : ''}`} style={{ left: i * weekWidth, width: weekWidth, borderLeft: '1px solid #f0f0f0' }} />
                              ))}
                              <div className="absolute top-0 bottom-0 z-[2]" style={{ left: dateToPx(now), width: 1.5, background: '#5B7CF5', opacity: 0.5 }} />
                              <div className="absolute flex items-center z-[1]" style={{ left: barLeft, width: barW, height: 18, top: 5 }}>
                                <div className="w-full h-full rounded-sm relative overflow-hidden" style={{ background: color + '20' }}>
                                  <div className="h-full rounded-sm" style={{ width: `${ph.progress}%`, background: color, opacity: 0.5 }} />
                                  <span className="absolute inset-0 flex items-center px-1 gap-0.5">
                                    <span className="flex -space-x-1 shrink-0">
                                      {phaseMembers.slice(0, 4).map(m => (
                                        <TeamAvatar key={m.id} member={m} size={14} className="ring-1 ring-white" />
                                      ))}
                                      {phaseMembers.length > 4 && <span className="text-[7px] font-bold ml-0.5" style={{ color }}>+{phaseMembers.length - 4}</span>}
                                    </span>
                                    <span className="text-[8px] font-bold ml-auto" style={{ color }}>{ph.progress}%</span>
                                  </span>
                                </div>
                              </div>
                              <div
                                className="absolute z-[3] cursor-pointer group"
                                style={{ left: dateToPx(ph.deadline) - 6, top: 7, padding: 2 }}
                                onClick={(e) => { e.stopPropagation(); setEditingPhaseDeadline(expandKey); }}
                                title={`Deadline: ${ph.deadline}`}
                              >
                                <div className="w-2.5 h-2.5 rotate-45 group-hover:scale-150 transition-transform" style={{ background: color, border: `1px solid ${color}` }} />
                              </div>
                            </div>
                          </div>

                          {isExpanded && ph.phaseTasks.map(task => {
                            const depBlocked = isTaskBlockedByDeps(task);
                            const literalBlocked = task.status === 'blocked';
                            const isBlocked = literalBlocked || depBlocked;
                            const taskColor = task.status === 'done' ? '#22C55E' : isBlocked ? '#EF4444' : '#94A3B8';
                            const taskMembers = resolveMembers(task.assignee);
                            const taskHasDate = !!task.dueDate;
                            const taskBarLeft = taskHasDate ? dateToPx(task.startedDate || now) : 0;
                            const taskBarEnd = taskHasDate ? dateToPx(task.dueDate) : 0;
                            const taskBarW = taskHasDate ? Math.max(weekWidth * 0.15, Math.abs(taskBarEnd - Math.min(taskBarLeft, taskBarEnd))) : 0;
                            const taskBarStart = taskHasDate ? Math.min(taskBarLeft, taskBarEnd) : 0;
                            const isAssigning = assigningTaskDate === task.id;

                            return (
                              <div key={task.id} className={`flex items-start py-1 border-b border-gray-50 last:border-b-0 ${isBlocked ? 'bg-red-50/30' : ''}`} title={depBlocked ? 'Bloqueada por dependencias' : ''}>
                                <div className="shrink-0 pr-2 flex items-start gap-1 pl-5" style={{ width: labelWidth }}>
                                  <span className="text-[9px] shrink-0 mt-0.5" style={{ color: taskColor }}>
                                    {task.status === 'done' ? '\u2713' : isBlocked ? '\uD83D\uDD12' : '\u25CB'}
                                  </span>
                                  <span className={`text-[9px] leading-snug ${task.status === 'done' ? 'line-through text-gray-400' : isBlocked ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{task.title}</span>
                                  {isAssigning ? (
                                    <input
                                      type="date"
                                      className="border border-blue-300 rounded text-[9px] px-0.5 outline-none bg-white w-[105px] ml-auto shrink-0"
                                      defaultValue={task.dueDate || ''}
                                      autoFocus
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => { if (e.target.value) handleAssignTaskDate(task.id, e.target.value); }}
                                      onBlur={() => setAssigningTaskDate(null)}
                                    />
                                  ) : taskHasDate ? (
                                    <button
                                      className="text-[9px] shrink-0 ml-auto font-sans text-gray-400 hover:text-blue-500 hover:underline"
                                      onClick={(e) => { e.stopPropagation(); setAssigningTaskDate(task.id); }}
                                    >
                                      {fmtDate(task.dueDate)}
                                    </button>
                                  ) : (
                                    <button className="text-[8px] text-blue-400 hover:text-blue-600 shrink-0 ml-auto font-sans" onClick={(e) => { e.stopPropagation(); setAssigningTaskDate(task.id); }}>{'\uD83D\uDCC5'}</button>
                                  )}
                                </div>
                                <div className="relative flex items-center shrink-0" style={{ width: weekColumns.length * weekWidth, height: 22 }}>
                                  {weekColumns.map((w, i) => (
                                    <div key={i} className={`absolute top-0 bottom-0 ${w.hasToday ? 'bg-blue-50/20' : ''}`} style={{ left: i * weekWidth, width: weekWidth, borderLeft: '1px solid #f8f8f8' }} />
                                  ))}
                                  <div className="absolute top-0 bottom-0 z-[2]" style={{ left: dateToPx(now), width: 1, background: '#5B7CF5', opacity: 0.3 }} />
                                  {taskHasDate && (
                                    <>
                                      <div className="absolute z-[1] cursor-pointer flex items-center px-0.5 gap-0.5" style={{ left: taskBarStart, width: taskBarW, height: 14, top: 4 }} onClick={(e) => { e.stopPropagation(); setAssigningTaskDate(task.id); }}>
                                        <div className="absolute inset-0 rounded-sm" style={{ background: taskColor, opacity: 0.25 }} />
                                        <span className="flex -space-x-1 shrink-0 relative z-[1]">
                                          {taskMembers.slice(0, 3).map(m => (
                                            <TeamAvatar key={m.id} member={m} size={12} className="ring-1 ring-white" />
                                          ))}
                                        </span>
                                      </div>
                                      <div className="absolute z-[3] cursor-pointer group" style={{ left: dateToPx(task.dueDate) - 5, top: 5, padding: 2 }} onClick={(e) => { e.stopPropagation(); setAssigningTaskDate(task.id); }} title={task.dueDate}>
                                        <div className="w-2 h-2 rounded-full group-hover:scale-150 transition-transform" style={{ background: taskColor }} />
                                      </div>
                                    </>
                                  )}
                                  {!taskHasDate && taskMembers.length > 0 && (
                                    <div className="absolute z-[1] flex items-center" style={{ left: dateToPx(now) + 4, top: 5 }}>
                                      <span className="flex -space-x-1">
                                        {taskMembers.slice(0, 3).map(m => (
                                          <TeamAvatar key={m.id} member={m} size={12} className="ring-1 ring-white opacity-40" />
                                        ))}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add phase button — opens selector to pick from unscheduled */}
          {unscheduledPhases.length > 0 && (
            <div className={ganttEntries.length > 0 ? 'mt-4 pt-3 border-t border-gray-100' : ''}>
              {!showAddPhase ? (
                <button
                  className="flex items-center gap-1.5 text-[11px] text-blue-500 hover:text-blue-700 font-semibold font-sans cursor-pointer"
                  onClick={() => setShowAddPhase(true)}
                >
                  <span className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 text-sm leading-none">+</span>
                  Agregar fase al timeline
                </button>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] font-semibold text-gray-500">Seleccionar fase para agendar</div>
                    <button className="text-[10px] text-gray-400 hover:text-gray-600 font-sans" onClick={() => { setShowAddPhase(false); setAssigningDeadline(null); }}>{'\u2715'} Cerrar</button>
                  </div>
                  <div className="max-h-[250px] overflow-y-auto space-y-0.5">
                    {unscheduledPhases.map((u, i) => {
                      const key = u.client.id + '_' + u.phaseKey;
                      return (
                        <div key={i} className="flex items-center gap-1.5 py-1.5 px-2 rounded-md hover:bg-gray-50 text-[10px]">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: u.phInfo.color }} />
                          <span className="font-semibold text-gray-700">{u.client.name}</span>
                          <span style={{ color: u.phInfo.color }}>{u.phInfo.label}</span>
                          <span className="text-gray-300 text-[9px]">({u.progress}%)</span>
                          {assigningDeadline === key ? (
                            <input
                              type="date"
                              className="border border-blue-300 rounded py-[1px] px-1 text-[10px] outline-none bg-white w-[110px] ml-auto"
                              autoFocus
                              onChange={(e) => { if (e.target.value) { handleAssignDeadline(u.client.id, u.phaseKey, e.target.value); setShowAddPhase(false); } }}
                              onBlur={() => setAssigningDeadline(null)}
                            />
                          ) : (
                            <button className="text-[9px] text-blue-400 hover:text-blue-600 ml-auto font-sans" onClick={() => setAssigningDeadline(key)}>{'\uD83D\uDCC5'}</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
