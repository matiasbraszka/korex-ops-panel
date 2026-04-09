import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TEAM, PHASES } from '../utils/constants';
import { daysBetween, daysAgo, today, fmtDate, getAllPhases } from '../utils/helpers';
import TeamAvatar from '../components/TeamAvatar';

export default function DashboardPage() {
  const { clients, tasks, updateClient } = useApp();
  const [assigningDeadline, setAssigningDeadline] = useState(null);

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
    // Phases with tasks
    const clientPhaseKeys = new Set();
    tasks.filter(t => t.clientId === c.id && t.phase).forEach(t => clientPhaseKeys.add(t.phase));
    // Also include phases from PHASES and customPhases
    Object.keys(allPh).forEach(k => clientPhaseKeys.add(k));

    clientPhaseKeys.forEach(phaseKey => {
      const phInfo = allPh[phaseKey] || PHASES[phaseKey];
      if (!phInfo) return;
      const phaseTasks = tasks.filter(t => t.clientId === c.id && t.phase === phaseKey);
      if (phaseTasks.length === 0 && !deadlines[phaseKey]) return; // skip empty phases without deadline
      const done = phaseTasks.length > 0 && phaseTasks.every(t => t.status === 'done');
      const progress = phaseTasks.length > 0 ? Math.round(phaseTasks.filter(t => t.status === 'done').length / phaseTasks.length * 100) : 0;
      const deadline = deadlines[phaseKey];
      if (deadline) {
        const isOverdue = deadline < now && !done;
        ganttEntries.push({ client: c, phaseKey, phInfo, deadline, done, isOverdue, progress });
      } else if (!done) {
        unscheduledPhases.push({ client: c, phaseKey, phInfo, progress });
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

  // Timeline: show 21 days from today (or from earliest deadline)
  const ganttStartDate = new Date(now);
  ganttStartDate.setDate(ganttStartDate.getDate() - 3);
  const displayDays = 28;
  const dayColumns = [];
  for (let d = 0; d < displayDays; d++) {
    const date = new Date(ganttStartDate);
    date.setDate(date.getDate() + d);
    const iso = date.toISOString().split('T')[0];
    const dayNum = date.getDate();
    const weekDay = date.getDay(); // 0=Sun
    const monthLabel = dayNum === 1 || d === 0 ? date.toLocaleDateString('es-AR', { month: 'short' }) : null;
    dayColumns.push({ iso, dayNum, weekDay, monthLabel, isToday: iso === now, isWeekend: weekDay === 0 || weekDay === 6 });
  }
  const dayWidth = 32; // px per day
  const labelWidth = 150;

  const handleAssignDeadline = (clientId, phaseKey, dateVal) => {
    const c = clients.find(x => x.id === clientId);
    if (!c) return;
    const deadlines = { ...(c.phaseDeadlines || {}), [phaseKey]: dateVal };
    updateClient(clientId, { phaseDeadlines: deadlines });
    setAssigningDeadline(null);
  };

  return (
    <div className="space-y-5 overflow-x-hidden">
      {/* Timeline Gantt */}
      {(ganttEntries.length > 0 || unscheduledPhases.length > 0) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 max-md:p-3 max-md:rounded-lg">
          <div className="text-sm font-bold mb-4">Timeline de fases</div>

          {/* Desktop Gantt — day columns */}
          {ganttEntries.length > 0 && (
            <div className="hidden md:block overflow-x-auto">
              <div style={{ minWidth: labelWidth + dayColumns.length * dayWidth }}>
                {/* Day header */}
                <div className="flex" style={{ marginLeft: labelWidth }}>
                  {dayColumns.map((d, i) => (
                    <div key={i} className={`text-center shrink-0 border-b ${d.isToday ? 'border-b-2 border-blue-500' : 'border-gray-100'} ${d.isWeekend ? 'bg-gray-50/50' : ''}`} style={{ width: dayWidth }}>
                      {d.monthLabel && <div className="text-[9px] font-semibold text-gray-600 capitalize -mt-3 mb-0.5">{d.monthLabel}</div>}
                      <div className={`text-[10px] leading-none pb-1 ${d.isToday ? 'font-bold text-blue-600' : d.isWeekend ? 'text-gray-300' : 'text-gray-400'}`}>{d.dayNum}</div>
                    </div>
                  ))}
                </div>

                {/* Client rows */}
                {Object.values(ganttByClient).map(({ client: cl, phases }) => (
                  <div key={cl.id} className="border-b border-gray-100 last:border-b-0">
                    {phases.map((ph, pi) => {
                      const color = ph.done ? '#22C55E' : ph.isOverdue ? '#EF4444' : ph.phInfo.color;
                      // Find bar start (today) and end (deadline) in day indices
                      const todayIdx = dayColumns.findIndex(d => d.iso === now);
                      const deadlineIdx = dayColumns.findIndex(d => d.iso === ph.deadline);
                      const startIdx = Math.max(0, Math.min(todayIdx >= 0 ? todayIdx : 0, deadlineIdx >= 0 ? deadlineIdx : 0));
                      const endIdx = Math.max(todayIdx >= 0 ? todayIdx : dayColumns.length - 1, deadlineIdx >= 0 ? deadlineIdx : dayColumns.length - 1);
                      const barLeft = startIdx * dayWidth;
                      const barW = Math.max(dayWidth, (endIdx - startIdx + 1) * dayWidth);

                      return (
                        <div key={ph.phaseKey} className="flex items-center" style={{ height: 32 }}>
                          <div className="shrink-0 pr-2 overflow-hidden" style={{ width: labelWidth }}>
                            {pi === 0 && <div className="text-[11px] font-bold text-gray-800 truncate leading-tight">{cl.name}</div>}
                            <div className="text-[9px] truncate leading-tight" style={{ color }}>{ph.phInfo.label}</div>
                          </div>
                          <div className="relative flex items-center" style={{ width: dayColumns.length * dayWidth, height: '100%' }}>
                            {/* Day grid lines */}
                            {dayColumns.map((d, i) => (
                              <div key={i} className={`absolute top-0 bottom-0 ${d.isWeekend ? 'bg-gray-50/50' : ''} ${d.isToday ? 'bg-blue-50/40' : ''}`} style={{ left: i * dayWidth, width: dayWidth, borderLeft: '1px solid #f3f4f6' }} />
                            ))}
                            {/* Bar */}
                            <div className="absolute flex items-center z-[1]" style={{ left: barLeft, width: barW, height: 18, top: 7 }}>
                              <div className="w-full h-full rounded relative overflow-hidden" style={{ background: color + '25' }}>
                                <div className="h-full rounded" style={{ width: `${ph.progress}%`, background: color, opacity: 0.6 }} />
                                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold" style={{ color: ph.progress > 40 ? '#fff' : color }}>{ph.progress}%</span>
                              </div>
                            </div>
                          </div>
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

          {/* Unscheduled phases — assign deadline from here */}
          {unscheduledPhases.length > 0 && (
            <div className={ganttEntries.length > 0 ? 'mt-4 pt-3 border-t border-gray-100' : ''}>
              <div className="text-[11px] font-semibold text-gray-500 mb-2">Sin fecha asignada ({unscheduledPhases.length})</div>
              <div className="flex flex-wrap gap-1.5">
                {unscheduledPhases.map((u, i) => {
                  const key = u.client.id + '_' + u.phaseKey;
                  if (assigningDeadline === key) {
                    return (
                      <div key={i} className="inline-flex items-center gap-1 py-1 px-2 rounded-md bg-blue-50 border border-blue-200 text-[10px]">
                        <span className="font-semibold text-gray-700">{u.client.name}</span>
                        <span style={{ color: u.phInfo.color }}>{u.phInfo.label}</span>
                        <input
                          type="date"
                          className="border border-blue-300 rounded py-[1px] px-1 text-[10px] outline-none bg-white w-[110px]"
                          autoFocus
                          onChange={(e) => { if (e.target.value) handleAssignDeadline(u.client.id, u.phaseKey, e.target.value); }}
                          onBlur={() => setAssigningDeadline(null)}
                        />
                      </div>
                    );
                  }
                  return (
                    <button
                      key={i}
                      className="inline-flex items-center gap-1 py-1 px-2 rounded-md bg-gray-50 border border-gray-200 text-[10px] cursor-pointer hover:bg-blue-50 hover:border-blue-200 font-sans"
                      onClick={() => setAssigningDeadline(key)}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: u.phInfo.color }} />
                      <span className="font-semibold text-gray-600">{u.client.name}</span>
                      <span className="text-gray-400">{u.phInfo.label}</span>
                      <span className="text-gray-300 ml-0.5">{'\uD83D\uDCC5'}</span>
                    </button>
                  );
                })}
              </div>
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