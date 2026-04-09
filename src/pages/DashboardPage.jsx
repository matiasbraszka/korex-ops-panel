import { useApp } from '../context/AppContext';
import { TEAM, PHASES } from '../utils/constants';
import { daysBetween, daysAgo, today, fmtDate, getAllPhases } from '../utils/helpers';
import TeamAvatar from '../components/TeamAvatar';

export default function DashboardPage() {
  const { clients, tasks } = useApp();

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

  return (
    <div className="space-y-5 overflow-x-hidden">
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

        {/* Bottleneck per team member */}
        <div className="mt-4 space-y-1">
          {teamMembers.map(m => {
            const bn = memberBottlenecks[m.id];
            if (!bn) return null;
            return (
              <div key={m.id}>
                <div className="text-[11px] text-gray-600 hidden md:grid grid-cols-[18px_80px_10px_1fr] items-center gap-1.5">
                  <TeamAvatar member={m} size={18} />
                  <span className="font-semibold text-gray-800 truncate">{m.name}</span>
                  <span className="text-gray-400 text-center">|</span>
                  <span className="flex items-center gap-1 min-w-0">
                    <span className="text-gray-500 shrink-0">Cuello de botella:</span>
                    <span className="text-red-500 font-medium truncate">{bn}</span>
                  </span>
                </div>
                <div className="md:hidden flex items-center gap-2 py-1.5 border-b border-gray-100 text-[11px] text-gray-600">
                  <TeamAvatar member={m} size={18} />
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-gray-800">{m.name}</span>
                    <div className="text-red-500 font-medium text-[10px] truncate">{bn}</div>
                  </div>
                </div>
              </div>
            );
          })}
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

      {/* D. Phase deadlines calendar */}
      {(() => {
        const now = today();
        // Collect all phases with deadlines across all clients
        const entries = [];
        clients.filter(c => !isKorexClient(c) && c.phaseDeadlines).forEach(c => {
          const allPh = getAllPhases(c);
          Object.entries(c.phaseDeadlines || {}).forEach(([phaseKey, deadline]) => {
            if (!deadline) return;
            const phInfo = allPh[phaseKey] || PHASES[phaseKey];
            if (!phInfo) return;
            const phaseTasks = tasks.filter(t => t.clientId === c.id && t.phase === phaseKey);
            const done = phaseTasks.length > 0 && phaseTasks.every(t => t.status === 'done');
            const isOverdue = deadline < now && !done;
            entries.push({ client: c, phaseKey, phInfo, deadline, done, isOverdue, tasksDone: phaseTasks.filter(t => t.status === 'done').length, tasksTotal: phaseTasks.length });
          });
        });
        entries.sort((a, b) => a.deadline.localeCompare(b.deadline));

        if (entries.length === 0) return null;

        // Calculate timeline range
        const minDate = entries.reduce((min, e) => e.deadline < min ? e.deadline : min, now);
        const maxDate = entries.reduce((max, e) => e.deadline > max ? e.deadline : max, now);
        const startDate = new Date(minDate < now ? minDate : now);
        startDate.setDate(startDate.getDate() - 2);
        const endDate = new Date(maxDate);
        endDate.setDate(endDate.getDate() + 7);
        const totalDays = Math.max(14, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
        const todayOffset = Math.ceil((new Date(now) - startDate) / (1000 * 60 * 60 * 24));

        // Generate week markers
        const weeks = [];
        const ws = new Date(startDate);
        ws.setDate(ws.getDate() - ws.getDay() + 1); // Monday
        while (ws <= endDate) {
          const offset = Math.ceil((ws - startDate) / (1000 * 60 * 60 * 24));
          if (offset >= 0) weeks.push({ date: new Date(ws), offset, label: ws.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) });
          ws.setDate(ws.getDate() + 7);
        }

        // Group entries by client
        const byClient = {};
        entries.forEach(e => {
          if (!byClient[e.client.id]) byClient[e.client.id] = { client: e.client, phases: [] };
          byClient[e.client.id].phases.push(e);
        });

        return (
          <div className="bg-white border border-gray-200 rounded-xl p-5 max-md:p-3 max-md:rounded-lg">
            <div className="text-sm font-bold mb-3">{'\uD83D\uDCC5'} Calendario de fases</div>

            {/* Desktop: Gantt chart */}
            <div className="hidden md:block overflow-x-auto">
              <div style={{ minWidth: Math.max(600, totalDays * 20) + 160 }}>
                {/* Week headers */}
                <div className="flex border-b border-gray-200 mb-1" style={{ paddingLeft: 160 }}>
                  {weeks.map((w, i) => (
                    <div key={i} className="text-[10px] text-gray-400 font-medium" style={{ position: 'absolute', left: 160 + w.offset * 20 }}>{w.label}</div>
                  ))}
                </div>
                <div style={{ position: 'relative', paddingTop: 20 }}>
                  {/* Today line */}
                  <div className="absolute top-0 bottom-0 border-l-2 border-blue-400 z-10 opacity-50" style={{ left: 160 + todayOffset * 20 }}>
                    <span className="absolute -top-0.5 -left-2.5 text-[8px] bg-blue-500 text-white px-1 rounded">Hoy</span>
                  </div>

                  {/* Client rows */}
                  {Object.values(byClient).map(({ client: cl, phases }) => (
                    <div key={cl.id} className="flex items-center mb-2 relative" style={{ height: phases.length * 22 + 4 }}>
                      <div className="w-[150px] shrink-0 pr-2 truncate text-[11px] font-semibold text-gray-700">{cl.name}</div>
                      <div className="flex-1 relative" style={{ height: '100%' }}>
                        {phases.map((ph, pi) => {
                          const deadlineOffset = Math.ceil((new Date(ph.deadline) - startDate) / (1000 * 60 * 60 * 24));
                          const barStart = Math.max(0, todayOffset);
                          const barEnd = deadlineOffset;
                          const barLeft = Math.min(barStart, barEnd) * 20;
                          const barWidth = Math.max(20, Math.abs(barEnd - barStart) * 20);
                          const color = ph.done ? '#22C55E' : ph.isOverdue ? '#EF4444' : ph.phInfo.color;
                          return (
                            <div key={ph.phaseKey} className="absolute flex items-center gap-1" style={{ top: pi * 22, left: barLeft, height: 20 }}>
                              <div className="rounded-full h-3 flex items-center" style={{ width: barWidth, background: color + '25', border: `1.5px solid ${color}` }}>
                                <div className="h-full rounded-full" style={{ width: `${ph.tasksTotal > 0 ? (ph.tasksDone / ph.tasksTotal * 100) : 0}%`, background: color + '60' }} />
                              </div>
                              <span className="text-[9px] font-medium whitespace-nowrap" style={{ color }}>{ph.phInfo.label}</span>
                              {ph.done && <span className="text-[9px] text-green-500">{'\u2713'}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Mobile: compact list */}
            <div className="md:hidden space-y-1.5">
              {entries.map((e, i) => (
                <div key={i} className={`flex items-center gap-2 py-1.5 px-2 rounded-md text-[11px] ${e.isOverdue ? 'bg-red-50' : e.done ? 'bg-green-50' : 'bg-gray-50'}`}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.done ? '#22C55E' : e.isOverdue ? '#EF4444' : e.phInfo.color }} />
                  <span className="font-semibold text-gray-700 truncate">{e.client.name}</span>
                  <span className="text-gray-400 truncate">{e.phInfo.label}</span>
                  <span className={`ml-auto shrink-0 font-medium ${e.isOverdue ? 'text-red-500' : e.done ? 'text-green-500' : 'text-gray-500'}`}>
                    {e.done ? '\u2713' : fmtDate(e.deadline)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}