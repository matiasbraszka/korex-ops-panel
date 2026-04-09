import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TEAM, PHASES } from '../utils/constants';
import { daysBetween, daysAgo, today, fmtDate, getAllPhases } from '../utils/helpers';
import TeamAvatar from '../components/TeamAvatar';

export default function DashboardPage() {
  const { clients, tasks, updateClient, updateTask } = useApp();
  const [assigningDeadline, setAssigningDeadline] = useState(null);
  const [expandedPhases, setExpandedPhases] = useState({});
  const [assigningTaskDate, setAssigningTaskDate] = useState(null);
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [editingPhaseDeadline, setEditingPhaseDeadline] = useState(null);

  const now = today();
  const monthStart = now.substring(0, 7) + '-01';

  // Filter out Empresa (Korex) from dashboard
  const isKorexClient = (c) => /empresa|korex/i.test(c.name);

  // ── A. Team x Client matrix ──
  const activeClients = clients.filter(c => c.status !== 'completed' && !isKorexClient(c));
  const teamMembers = TEAM;

  // Build matrix: member -> client -> active task count
  const matrix = {};
  const memberTotals = {};
  const clientTotals = {};
  teamMembers.forEach(m => { matrix[m.id] = {}; memberTotals[m.id] = 0; });
  activeClients.forEach(c => { clientTotals[c.id] = 0; });

  // Helper: check if a task is blocked by unmet dependencies
  const isBlockedByDeps = (task) => {
    if (!task.dependsOn || task.dependsOn.length === 0) return false;
    const clientTasks = tasks.filter(t => t.clientId === task.clientId);
    return task.dependsOn.some(depId => {
      const dep = clientTasks.find(t => t.id === depId);
      return dep && dep.status !== 'done';
    });
  };

  tasks.forEach(t => {
    if (t.status === 'done') return;
    if (isBlockedByDeps(t)) return; // Skip tasks blocked by dependencies
    const names = t.assignee ? t.assignee.split(',').map(s => s.trim()).filter(Boolean) : [];
    const client = activeClients.find(c => c.id === t.clientId);
    if (!client) return;
    let counted = false;
    names.forEach(name => {
      const member = teamMembers.find(m => name.toLowerCase() === m.name.toLowerCase() || name === m.id);
      if (!member) return;
      matrix[member.id][client.id] = (matrix[member.id][client.id] || 0) + 1;
      memberTotals[member.id] = (memberTotals[member.id] || 0) + 1;
      counted = true;
    });
    if (counted) clientTotals[client.id] = (clientTotals[client.id] || 0) + 1;
  });

  const grandTotal = Object.values(memberTotals).reduce((s, v) => s + v, 0);

  // Find oldest non-done task per team member (bottleneck)
  const memberBottlenecks = {};
  teamMembers.forEach(m => {
    const myTasks = tasks.filter(t => {
      if (t.status === 'done' || !t.assignee) return false;
      const parts = t.assignee.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      return parts.includes(m.name.toLowerCase()) || parts.includes(m.id);
    });
    if (myTasks.length === 0) { memberBottlenecks[m.id] = null; return; }
    let oldest = myTasks[0];
    myTasks.forEach(t => {
      const tDate = t.startedDate || t.createdDate;
      const oDate = oldest.startedDate || oldest.createdDate;
      if (tDate && oDate && tDate < oDate) oldest = t;
    });
    const client = clients.find(c => c.id === oldest.clientId);
    memberBottlenecks[m.id] = `${oldest.title}${client ? ' (' + client.name + ')' : ''}`;
  });

  // ── B. Team velocity ──
  const teamVelocity = teamMembers.map(m => {
    const myTasks = tasks.filter(t => {
      if (!t.assignee) return false;
      const parts = t.assignee.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      return parts.includes(m.name.toLowerCase()) || parts.includes(m.id);
    });
    const pending = myTasks.filter(t => t.status !== 'done' && t.status !== 'in-progress').length;
    const inProgress = myTasks.filter(t => t.status === 'in-progress').length;
    const completedThisMonth = myTasks.filter(t => t.status === 'done' && t.completedDate && t.completedDate >= monthStart).length;
    let totalCompletionDays = 0, completionCount = 0;
    myTasks.forEach(t => {
      if (t.status === 'done' && t.startedDate && t.completedDate) {
        const d = daysBetween(t.startedDate, t.completedDate);
        if (d !== null && d >= 0) { totalCompletionDays += d; completionCount++; }
      }
    });
    const avgDays = completionCount > 0 ? Math.round((totalCompletionDays / completionCount) * 10) / 10 : null;
    return { ...m, pending, inProgress, completedThisMonth, avgDays };
  });

  // ── C. Bottlenecks (tasks blocking other tasks) ──
  const korexClientIds = new Set(clients.filter(c => isKorexClient(c)).map(c => c.id));
  const bottlenecks = [];
  tasks.forEach(t => {
    if (t.status === 'done') return;
    if (korexClientIds.has(t.clientId)) return;
    const blocking = tasks.filter(other =>
      other.clientId === t.clientId &&
      other.dependsOn &&
      other.dependsOn.includes(t.id) &&
      other.status !== 'done'
    );
    if (blocking.length > 0) {
      const client = clients.find(x => x.id === t.clientId);
      const d = t.startedDate ? daysAgo(t.startedDate) : (t.dueDate && t.dueDate < now ? daysAgo(t.dueDate) : 0);
      bottlenecks.push({ task: t, client, blockingCount: blocking.length, days: d, blockedTasks: blocking.map(b => b.title) });
    }
  });
  // Also add overdue tasks
  tasks.forEach(t => {
    if (t.status !== 'in-progress' || !t.startedDate) return;
    if (korexClientIds.has(t.clientId)) return;
    const d = daysAgo(t.startedDate);
    const est = t.estimatedDays || 7;
    if (d > est && !bottlenecks.find(b => b.task?.id === t.id)) {
      const client = clients.find(x => x.id === t.clientId);
      bottlenecks.push({ task: t, client, blockingCount: 0, days: d - est, isOverdue: true, blockedTasks: [] });
    }
  });
  bottlenecks.sort((a, b) => (b.blockingCount - a.blockingCount) || (b.days - a.days));

  // ── D. Phase timeline data ──
  const ganttEntries = [];
  const unscheduledPhases = [];
  clients.filter(c => !isKorexClient(c)).forEach(c => {
    const allPh = getAllPhases(c);
    const deadlines = c.phaseDeadlines || {};
    const clientPhaseKeys = new Set();
    tasks.filter(t => t.clientId === c.id && t.phase).forEach(t => clientPhaseKeys.add(t.phase));
    Object.keys(allPh).forEach(k => clientPhaseKeys.add(k));

    clientPhaseKeys.forEach(phaseKey => {
      const phInfo = allPh[phaseKey] || PHASES[phaseKey];
      if (!phInfo) return;
      const phaseTasks = tasks.filter(t => t.clientId === c.id && t.phase === phaseKey);
      if (phaseTasks.length === 0 && !deadlines[phaseKey]) return;
      const done = phaseTasks.length > 0 && phaseTasks.every(t => t.status === 'done');
      const progress = phaseTasks.length > 0 ? Math.round(phaseTasks.filter(t => t.status === 'done').length / phaseTasks.length * 100) : 0;
      const deadline = deadlines[phaseKey];
      if (deadline) {
        const isOverdue = deadline < now && !done;
        ganttEntries.push({ client: c, phaseKey, phInfo, deadline, done, isOverdue, progress, phaseTasks });
      } else if (!done) {
        unscheduledPhases.push({ client: c, phaseKey, phInfo, progress, phaseTasks });
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

  // Timeline: week columns (8 weeks)
  const ganttStartDate = new Date(now);
  // Go back to previous Monday
  const startDay = ganttStartDate.getDay();
  const mondayOffset = startDay === 0 ? -6 : 1 - startDay;
  ganttStartDate.setDate(ganttStartDate.getDate() + mondayOffset - 7); // start 1 week before current
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
  const weekWidth = 100; // px per week
  const labelWidth = 240;
  const totalTimelineStart = weekColumns[0].startIso;
  const totalTimelineEnd = weekColumns[weekColumns.length - 1].endIso;
  const totalDays = Math.round((new Date(totalTimelineEnd) - new Date(totalTimelineStart)) / 864e5);

  // Helper: date to px position within timeline
  const dateToPx = (dateStr) => {
    const d = Math.round((new Date(dateStr) - new Date(totalTimelineStart)) / 864e5);
    return Math.max(0, Math.min(d / totalDays * weekColumns.length * weekWidth, weekColumns.length * weekWidth));
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
    <div className="space-y-5 overflow-x-hidden">
      {/* Timeline Gantt */}
      {(ganttEntries.length > 0 || unscheduledPhases.length > 0) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 max-md:p-3 max-md:rounded-lg">
          <div className="text-sm font-bold mb-4">Timeline de fases</div>

          {/* Desktop Gantt — week columns */}
          {ganttEntries.length > 0 && (
            <div className="hidden md:block overflow-x-auto">
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

                {/* Client rows */}
                {Object.values(ganttByClient).map(({ client: cl, phases }) => (
                  <div key={cl.id} className="border-b border-gray-100 last:border-b-0">
                    {/* Client name row */}
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

                      return (
                        <div key={ph.phaseKey}>
                          {/* Phase row */}
                          <div className={`flex items-start py-1 ${hasTasks ? 'cursor-pointer hover:bg-gray-50/50' : ''}`} onClick={() => hasTasks && togglePhaseExpand(cl.id, ph.phaseKey)}>
                            <div className="shrink-0 pr-2 flex items-start gap-1 pt-0.5" style={{ width: labelWidth }}>
                              {hasTasks && <span className={`text-[8px] text-gray-400 transition-transform mt-0.5 ${isExpanded ? 'rotate-90' : ''}`}>{'\u25B6'}</span>}
                              <div className="text-[10px] leading-snug flex items-start gap-1 flex-1 min-w-0" style={{ color }}>
                                <span className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ background: color }} />
                                <span>{ph.phInfo.label}</span>
                                <span className="text-gray-400 text-[9px] shrink-0">({ph.progress}%)</span>
                              </div>
                              {/* Editable deadline date */}
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
                                  title="Cambiar fecha"
                                >
                                  {fmtDate(ph.deadline)}
                                </button>
                              )}
                            </div>
                            <div className="relative flex items-center shrink-0" style={{ width: weekColumns.length * weekWidth, height: 28 }}>
                              {/* Week grid lines */}
                              {weekColumns.map((w, i) => (
                                <div key={i} className={`absolute top-0 bottom-0 ${w.hasToday ? 'bg-blue-50/30' : ''}`} style={{ left: i * weekWidth, width: weekWidth, borderLeft: '1px solid #f0f0f0' }} />
                              ))}
                              {/* Today marker */}
                              <div className="absolute top-0 bottom-0 z-[2]" style={{ left: dateToPx(now), width: 1.5, background: '#5B7CF5', opacity: 0.5 }} />
                              {/* Phase bar */}
                              <div className="absolute flex items-center z-[1]" style={{ left: barLeft, width: barW, height: 16, top: 7 }}>
                                <div className="w-full h-full rounded-sm relative overflow-hidden" style={{ background: color + '20' }}>
                                  <div className="h-full rounded-sm" style={{ width: `${ph.progress}%`, background: color, opacity: 0.5 }} />
                                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold" style={{ color }}>{ph.progress}%</span>
                                </div>
                              </div>
                              {/* Deadline diamond marker — click to edit */}
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

                          {/* Expanded tasks */}
                          {isExpanded && ph.phaseTasks.map(task => {
                            const taskColor = task.status === 'done' ? '#22C55E' : task.status === 'blocked' ? '#EF4444' : '#94A3B8';
                            const taskHasDate = !!task.dueDate;
                            const taskBarLeft = taskHasDate ? dateToPx(task.startedDate || now) : 0;
                            const taskBarEnd = taskHasDate ? dateToPx(task.dueDate) : 0;
                            const taskBarW = taskHasDate ? Math.max(weekWidth * 0.15, Math.abs(taskBarEnd - Math.min(taskBarLeft, taskBarEnd))) : 0;
                            const taskBarStart = taskHasDate ? Math.min(taskBarLeft, taskBarEnd) : 0;
                            const isAssigning = assigningTaskDate === task.id;

                            return (
                              <div key={task.id} className="flex items-start py-1 border-b border-gray-50 last:border-b-0">
                                <div className="shrink-0 pr-2 flex items-start gap-1 pl-5" style={{ width: labelWidth }}>
                                  <span className="text-[9px] shrink-0 mt-0.5" style={{ color: taskColor }}>
                                    {task.status === 'done' ? '\u2713' : task.status === 'blocked' ? '\u2715' : '\u25CB'}
                                  </span>
                                  <span className={`text-[9px] leading-snug ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-600'}`}>{task.title}</span>
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
                                      title="Cambiar fecha"
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
                                      <div className="absolute z-[1] cursor-pointer" style={{ left: taskBarStart, width: taskBarW, height: 10, top: 6 }} onClick={(e) => { e.stopPropagation(); setAssigningTaskDate(task.id); }}>
                                        <div className="w-full h-full rounded-sm" style={{ background: taskColor, opacity: 0.35 }} />
                                      </div>
                                      <div className="absolute z-[3] cursor-pointer group" style={{ left: dateToPx(task.dueDate) - 5, top: 5, padding: 2 }} onClick={(e) => { e.stopPropagation(); setAssigningTaskDate(task.id); }} title={task.dueDate}>
                                        <div className="w-2 h-2 rounded-full group-hover:scale-150 transition-transform" style={{ background: taskColor }} />
                                      </div>
                                    </>
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

          {/* Mobile: compact list */}
          {ganttEntries.length > 0 && (
            <div className="md:hidden space-y-1">
              {ganttEntries.map((e, i) => (
                <div key={i} className={`flex items-center gap-2 py-2 px-2.5 rounded-lg text-[11px] ${e.isOverdue ? 'bg-red-50' : e.done ? 'bg-green-50' : 'bg-gray-50'}`}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.done ? '#22C55E' : e.isOverdue ? '#EF4444' : e.phInfo.color }} />
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-gray-700">{e.client.name}</span>
                    <span className="text-gray-400 ml-1">{e.phInfo.label}</span>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <div className="w-12 h-1.5 rounded-full bg-gray-200 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${e.progress}%`, background: e.done ? '#22C55E' : e.isOverdue ? '#EF4444' : e.phInfo.color }} /></div>
                    <span className={`font-medium text-[10px] ${e.isOverdue ? 'text-red-500' : e.done ? 'text-green-500' : 'text-gray-500'}`}>
                      {e.done ? '\u2713' : fmtDate(e.deadline)}
                    </span>
                  </div>
                </div>
              ))}
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
                      const isExpanded = expandedPhases['unsched_' + key];
                      const hasTasks = u.phaseTasks && u.phaseTasks.length > 0;
                      return (
                        <div key={i}>
                          <div className="flex items-center gap-1.5 py-1.5 px-2 rounded-md hover:bg-gray-50 text-[10px]">
                            {hasTasks && (
                              <button className={`text-[8px] text-gray-400 transition-transform font-sans ${isExpanded ? 'rotate-90' : ''}`} onClick={() => setExpandedPhases(prev => ({ ...prev, ['unsched_' + key]: !prev['unsched_' + key] }))}>
                                {'\u25B6'}
                              </button>
                            )}
                            {!hasTasks && <span className="w-2" />}
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
                          {isExpanded && hasTasks && (
                            <div className="ml-8 space-y-0.5">
                              {u.phaseTasks.map(task => {
                                const taskColor = task.status === 'done' ? '#22C55E' : task.status === 'blocked' ? '#EF4444' : '#94A3B8';
                                const isAssigning = assigningTaskDate === task.id;
                                return (
                                  <div key={task.id} className="flex items-center gap-1.5 py-0.5 px-2 text-[9px]">
                                    <span style={{ color: taskColor }}>{task.status === 'done' ? '\u2713' : task.status === 'blocked' ? '\u2715' : '\u25CB'}</span>
                                    <span className={task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-600'}>{task.title}</span>
                                    {task.dueDate ? (
                                      <span className="text-gray-400 ml-auto shrink-0">{fmtDate(task.dueDate)}</span>
                                    ) : isAssigning ? (
                                      <input
                                        type="date"
                                        className="border border-blue-300 rounded text-[9px] px-0.5 outline-none bg-white w-[95px] ml-auto shrink-0"
                                        autoFocus
                                        onChange={(e) => { if (e.target.value) handleAssignTaskDate(task.id, e.target.value); }}
                                        onBlur={() => setAssigningTaskDate(null)}
                                      />
                                    ) : (
                                      <button className="text-[8px] text-blue-400 hover:text-blue-600 ml-auto shrink-0 font-sans" onClick={() => setAssigningTaskDate(task.id)}>{'\uD83D\uDCC5'}</button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* A. Team x Client table */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 max-md:p-3 max-md:rounded-lg">
        <div className="text-sm font-bold mb-3">Equipo x Cliente</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px] max-md:text-[10px]">
            <thead>
              <tr className="bg-gray-50">
                <th className="py-2 px-2 text-left border border-gray-200 font-semibold text-gray-600 sticky left-0 bg-gray-50 z-10 max-md:px-1.5 max-md:py-1.5">Miembro</th>
                {activeClients.map(c => (
                  <th key={c.id} className="py-2 px-2 text-center border border-gray-200 font-semibold text-gray-600 whitespace-nowrap max-w-[90px] truncate max-md:px-1 max-md:py-1.5 max-md:text-[9px]" title={c.name}>
                    {c.name.split(' ')[0]}
                  </th>
                ))}
                <th className="py-2 px-2 text-center border border-gray-200 font-bold text-gray-800 bg-gray-100 max-md:px-1.5">Total</th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.map(m => (
                <tr key={m.id} className="hover:bg-blue-50/30">
                  <td className="py-1.5 px-2 border border-gray-200 font-semibold sticky left-0 bg-white z-10">
                    <span className="inline-flex items-center gap-1.5">
                      <TeamAvatar member={m} size={20} />
                      {m.name}
                    </span>
                  </td>
                  {activeClients.map(c => {
                    const count = matrix[m.id][c.id] || 0;
                    return (
                      <td key={c.id} className="py-1.5 px-2 text-center border border-gray-200">
                        {count > 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold" style={{ background: m.color + '15', color: m.color }}>{count}</span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-2 text-center border border-gray-200 font-bold bg-gray-50">{memberTotals[m.id] || 0}</td>
                </tr>
              ))}
              {/* Column totals */}
              <tr className="bg-gray-100 font-bold">
                <td className="py-1.5 px-2 border border-gray-200 sticky left-0 bg-gray-100 z-10">Total</td>
                {activeClients.map(c => (
                  <td key={c.id} className="py-1.5 px-2 text-center border border-gray-200">{clientTotals[c.id] || 0}</td>
                ))}
                <td className="py-1.5 px-2 text-center border border-gray-200 text-blue-600">{grandTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>

      {/* B. Team velocity table */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 max-md:p-3 max-md:rounded-lg">
        <div className="text-sm font-bold mb-3">Velocidad del equipo</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-gray-50">
                <th className="py-2 px-3 text-left border border-gray-200 font-semibold text-gray-600">Miembro</th>
                <th className="py-2 px-3 text-center border border-gray-200 font-semibold text-gray-600">Pendientes</th>
                <th className="py-2 px-3 text-center border border-gray-200 font-semibold text-gray-600">En progreso</th>
                <th className="py-2 px-3 text-center border border-gray-200 font-semibold text-gray-600">Completadas (mes)</th>
                <th className="py-2 px-3 text-center border border-gray-200 font-semibold text-gray-600">Prom. días/tarea</th>
              </tr>
            </thead>
            <tbody>
              {teamVelocity.map(m => (
                <tr key={m.id} className="hover:bg-blue-50/30">
                  <td className="py-2 px-3 border border-gray-200 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <TeamAvatar member={m} size={20} />
                      {m.name}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center border border-gray-200" style={{ color: m.pending > 0 ? '#6B7280' : '#D1D5DB' }}>{m.pending}</td>
                  <td className="py-2 px-3 text-center border border-gray-200" style={{ color: m.inProgress > 0 ? '#5B7CF5' : '#D1D5DB' }}>{m.inProgress}</td>
                  <td className="py-2 px-3 text-center border border-gray-200 font-semibold" style={{ color: m.completedThisMonth > 0 ? '#22C55E' : '#D1D5DB' }}>{m.completedThisMonth}</td>
                  <td className="py-2 px-3 text-center border border-gray-200">{m.avgDays !== null ? m.avgDays + 'd' : <span className="text-gray-300">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* C. Cuellos de botella — split into blocking vs overdue */}
      {(() => {
        const blockingItems = bottlenecks.filter(b => b.blockingCount > 0);
        const overdueItems = bottlenecks.filter(b => b.blockingCount === 0 && b.isOverdue);

        const renderBottleneckItem = (item, idx) => (
          <div key={idx} className="flex items-start gap-2 py-2 border-b border-gray-100 last:border-b-0 text-xs">
            <span className="text-sm mt-0.5">{item.blockingCount > 0 ? '\uD83D\uDD12' : '\u23F0'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-gray-800">{item.client?.name || '?'}</span>
                <span className="text-gray-600 truncate">{item.task?.title}</span>
              </div>
              {item.blockingCount > 0 && (
                <div className="text-[10px] text-red-500 mt-0.5">Bloquea {item.blockingCount} tarea{item.blockingCount > 1 ? 's' : ''}: {item.blockedTasks.join(', ')}</div>
              )}
              {item.isOverdue && (
                <div className="text-[10px] text-orange-500 mt-0.5">Retraso de +{item.days}d sobre el estimado</div>
              )}
              {item.task?.assignee && <div className="text-[10px] text-gray-400 mt-0.5">Asignada a: {item.task.assignee}</div>}
            </div>
            {item.days > 0 && <span className="text-[10px] font-bold shrink-0 mt-0.5" style={{ color: item.blockingCount > 0 ? '#EF4444' : '#F97316' }}>+{item.days}d</span>}
          </div>
        );

        return (
          <div className="space-y-4">
            {/* Blocking tasks */}
            <div className="bg-white border rounded-xl p-5 overflow-hidden max-md:p-3 max-md:rounded-lg" style={{ borderColor: 'rgba(239,68,68,0.25)', borderLeftWidth: '4px', borderLeftColor: '#EF4444' }}>
              <div className="text-sm font-bold mb-1 flex items-center gap-2 text-red-500">{'\uD83D\uDD12'} Cuellos de botella</div>
              <div className="text-[11px] text-gray-400 mb-3">Tareas que estan bloqueando a otras tareas dependientes</div>
              {blockingItems.length === 0 ? (
                <div className="text-center text-gray-400 text-xs py-4">Sin tareas bloqueantes</div>
              ) : (
                <div className="max-h-[250px] overflow-y-auto">
                  {blockingItems.slice(0, 15).map((item, idx) => renderBottleneckItem(item, idx))}
                </div>
              )}
            </div>

            {/* Overdue tasks */}
            <div className="bg-white border rounded-xl p-5 overflow-hidden max-md:p-3 max-md:rounded-lg" style={{ borderColor: 'rgba(249,115,22,0.25)', borderLeftWidth: '4px', borderLeftColor: '#F97316' }}>
              <div className="text-sm font-bold mb-1 flex items-center gap-2 text-orange-500">{'\u23F0'} Retrasos</div>
              <div className="text-[11px] text-gray-400 mb-3">Tareas que superaron su tiempo estimado pero no bloquean a otras</div>
              {overdueItems.length === 0 ? (
                <div className="text-center text-gray-400 text-xs py-4">Sin tareas retrasadas</div>
              ) : (
                <div className="max-h-[250px] overflow-y-auto">
                  {overdueItems.slice(0, 15).map((item, idx) => renderBottleneckItem(item, idx))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
}