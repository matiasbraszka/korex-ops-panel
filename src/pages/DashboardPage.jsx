import { useApp } from '../context/AppContext';
import { TEAM } from '../utils/constants';
import { daysBetween, today } from '../utils/helpers';
import TeamAvatar from '../components/TeamAvatar';

export default function DashboardPage() {
  const { clients, tasks } = useApp();

  const now = today();
  const monthStart = now.substring(0, 7) + '-01';

  // Filter out Empresa (Korex) from dashboard
  const isKorexClient = (c) => /empresa|korex/i.test(c.name);

  // Active (non-completed, non-Korex) clients
  const activeClients = clients.filter(c => c.status !== 'completed' && !isKorexClient(c));
  const teamMembers = TEAM;

  // ── Helper: check if a task is blocked by unmet dependencies
  const isBlockedByDeps = (task) => {
    if (!task.dependsOn || task.dependsOn.length === 0) return false;
    if (task.status === 'done') return false;
    return task.dependsOn.some(depId => {
      const dep = tasks.find(t => t.id === depId);
      return dep && dep.status !== 'done';
    });
  };

  // ── A. Summary KPIs at top ──
  const korexClientIds = new Set(clients.filter(c => isKorexClient(c)).map(c => c.id));
  const activeTasks = tasks.filter(t => !korexClientIds.has(t.clientId));
  const pendingTasks = activeTasks.filter(t => t.status !== 'done');
  const inProgressTasks = activeTasks.filter(t => t.status === 'in-progress');
  const blockedTasks = activeTasks.filter(t => t.status === 'blocked' || isBlockedByDeps(t));
  const overduePhases = (() => {
    let count = 0;
    clients.filter(c => !isKorexClient(c)).forEach(c => {
      const deadlines = c.phaseDeadlines || {};
      Object.entries(deadlines).forEach(([phaseKey, deadline]) => {
        if (!deadline) return;
        const phaseTasks = tasks.filter(t => t.clientId === c.id && t.phase === phaseKey);
        if (phaseTasks.length === 0) return;
        const allDone = phaseTasks.every(t => t.status === 'done');
        if (deadline < now && !allDone) count++;
      });
    });
    return count;
  })();

  const kpis = [
    { label: 'Clientes activos',   value: activeClients.length,  color: '#5B7CF5', bg: '#EEF2FF' },
    { label: 'Tareas pendientes',  value: pendingTasks.length,   color: '#EAB308', bg: '#FEFCE8' },
    { label: 'Tareas en progreso', value: inProgressTasks.length, color: '#22C55E', bg: '#ECFDF5' },
    { label: 'Tareas bloqueadas',  value: blockedTasks.length,   color: '#EF4444', bg: '#FEF2F2' },
    { label: 'Fases vencidas',     value: overduePhases,         color: '#F97316', bg: '#FFF7ED' },
  ];

  // ── B. Team x Client matrix ──
  const matrix = {};
  const memberTotals = {};
  const clientTotals = {};
  teamMembers.forEach(m => { matrix[m.id] = {}; memberTotals[m.id] = 0; });
  activeClients.forEach(c => { clientTotals[c.id] = 0; });

  tasks.forEach(t => {
    if (t.status === 'done') return;
    if (isBlockedByDeps(t)) return;
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

  // ── C. Team velocity ──
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

  return (
    <div className="space-y-5 overflow-x-hidden">
      {/* KPI summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((k, i) => (
          <div
            key={i}
            className="bg-white border border-gray-200 rounded-xl p-4 max-md:p-3"
            style={{ borderLeftWidth: 4, borderLeftColor: k.color }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{k.label}</div>
            <div className="text-2xl font-extrabold mt-1" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

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
    </div>
  );
}
