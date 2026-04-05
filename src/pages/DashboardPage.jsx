import { useApp } from '../context/AppContext';
import { TEAM } from '../utils/constants';
import { daysBetween, daysAgo, today } from '../utils/helpers';

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
    <div className="space-y-5">
      {/* A. Team x Client table */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 max-md:p-3 max-md:rounded-lg">
        <div className="text-sm font-bold mb-3">Equipo x Cliente</div>
        <div className="overflow-x-auto -mx-3 px-3 max-md:-mx-3 max-md:px-0">
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
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold" style={{ background: m.color + '18', color: m.color }}>{m.initials}</span>
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
                  <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[7px] font-bold" style={{ background: m.color + '18', color: m.color }}>{m.initials}</span>
                  <span className="font-semibold text-gray-800 truncate">{m.name}</span>
                  <span className="text-gray-400 text-center">|</span>
                  <span className="flex items-center gap-1 min-w-0">
                    <span className="text-gray-500 shrink-0">Cuello de botella:</span>
                    <span className="text-red-500 font-medium truncate">{bn}</span>
                  </span>
                </div>
                <div className="md:hidden flex items-center gap-2 py-1.5 border-b border-gray-100 text-[11px] text-gray-600">
                  <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[7px] font-bold shrink-0" style={{ background: m.color + '18', color: m.color }}>{m.initials}</span>
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
                <th className="py-2 px-3 text-center border border-gray-200 font-semibold text-gray-600">Prom. dias/tarea</th>
              </tr>
            </thead>
            <tbody>
              {teamVelocity.map(m => (
                <tr key={m.id} className="hover:bg-blue-50/30">
                  <td className="py-2 px-3 border border-gray-200 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold" style={{ background: m.color + '18', color: m.color }}>{m.initials}</span>
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