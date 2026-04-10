import { useApp } from '../context/AppContext';
import { TEAM } from '../utils/constants';
import { daysBetween, daysAgo, today } from '../utils/helpers';
import TeamAvatar from '../components/TeamAvatar';

export default function DashboardPage() {
  const { clients, tasks, dashboardAlerts, dismissAlert } = useApp();

  const now = today();
  const monthStart = now.substring(0, 7) + '-01';

  // Filter out Empresa (Korex) from dashboard
  const isKorexClient = (c) => /empresa|korex/i.test(c.name);

  // Active (non-completed, non-Korex) clients
  const activeClients = clients.filter(c => c.status !== 'completed' && !isKorexClient(c));
  const teamMembers = TEAM;
  const korexClientIds = new Set(clients.filter(c => isKorexClient(c)).map(c => c.id));

  // Helper: check if a task is blocked by unmet dependencies
  const isBlockedByDeps = (task) => {
    if (!task.dependsOn || task.dependsOn.length === 0) return false;
    if (task.status === 'done') return false;
    return task.dependsOn.some(depId => {
      const dep = tasks.find(t => t.id === depId);
      return dep && dep.status !== 'done';
    });
  };

  // ── 1. Summary KPIs ──
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
    { label: 'Clientes activos',   value: activeClients.length,  color: '#5B7CF5' },
    { label: 'Tareas pendientes',  value: pendingTasks.length,   color: '#EAB308' },
    { label: 'Tareas en progreso', value: inProgressTasks.length, color: '#22C55E' },
    { label: 'Tareas bloqueadas',  value: blockedTasks.length,   color: '#EF4444' },
    { label: 'Fases vencidas',     value: overduePhases,         color: '#F97316' },
  ];

  // ── 3. Tareas retrasadas (in-progress tasks that exceeded their estimated days) ──
  const overdueTasks = [];
  tasks.forEach(t => {
    if (t.status !== 'in-progress' || !t.startedDate) return;
    if (korexClientIds.has(t.clientId)) return;
    const d = daysAgo(t.startedDate);
    const est = t.estimatedDays || 7;
    if (d > est) {
      const client = clients.find(x => x.id === t.clientId);
      overdueTasks.push({ task: t, client, daysOver: d - est, elapsedDays: d, estimatedDays: est });
    }
  });
  overdueTasks.sort((a, b) => b.daysOver - a.daysOver);

  // ── 4. Team x Client matrix ──
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

  // ── 5. Team velocity ──
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

  // Priority visual for alerts
  const alertPrioStyle = {
    urgent:    { color: '#EF4444', bg: '#FEF2F2', border: '#FCA5A5', label: 'URGENTE' },
    important: { color: '#F97316', bg: '#FFF7ED', border: '#FDBA74', label: 'IMPORTANTE' },
    info:      { color: '#5B7CF5', bg: '#EEF2FF', border: '#A5B4FC', label: 'AVISO' },
  };

  return (
    <div className="space-y-5 overflow-x-hidden">
      {/* 1. KPI summary cards */}
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

      {/* 2. Avisos importantes (pendientes de Slack, WhatsApp, etc.) */}
      {dashboardAlerts && dashboardAlerts.length > 0 && (
        <div className="bg-white border rounded-xl p-5 max-md:p-3 max-md:rounded-lg" style={{ borderColor: '#FCA5A5', borderLeftWidth: 4, borderLeftColor: '#EF4444' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">{'\uD83D\uDD14'}</span>
            <span className="text-sm font-bold text-red-500">Avisos importantes</span>
            <span className="text-[10px] text-gray-400">({dashboardAlerts.length})</span>
          </div>
          <div className="space-y-2">
            {dashboardAlerts.map((a) => {
              const style = alertPrioStyle[a.priority] || alertPrioStyle.important;
              const client = a.client_id ? clients.find(c => c.id === a.client_id) : null;
              return (
                <div
                  key={a.id}
                  className="flex items-start gap-2 p-3 rounded-lg border group/alert"
                  style={{ background: style.bg, borderColor: style.border }}
                >
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5" style={{ background: style.color + '25', color: style.color }}>
                    {style.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-gray-800 leading-snug">{a.text}</div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500 flex-wrap">
                      {client && <span className="font-semibold">{client.name}</span>}
                      {a.source && <span>{'\u00b7'} {a.source}</span>}
                      {a.days_old > 0 && (
                        <span className="font-semibold" style={{ color: style.color }}>
                          {'\u00b7'} Hace {a.days_old}d sin responder
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    className="text-[10px] text-gray-400 hover:text-gray-700 bg-white/50 hover:bg-white border border-transparent hover:border-gray-200 rounded px-2 py-1 font-sans cursor-pointer shrink-0 opacity-0 group-hover/alert:opacity-100 transition-opacity"
                    onClick={() => dismissAlert(a.id)}
                    title="Marcar como resuelto"
                  >
                    {'\u2713'} Resuelto
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Tareas retrasadas */}
      <div className="bg-white border rounded-xl overflow-hidden max-md:rounded-lg" style={{ borderColor: 'rgba(249,115,22,0.25)', borderLeftWidth: 4, borderLeftColor: '#F97316' }}>
        <div className="py-3 px-5 border-b border-gray-100 flex items-center gap-2 max-md:px-3">
          <span className="text-lg">{'\u23F0'}</span>
          <span className="text-sm font-bold text-orange-500">Tareas retrasadas</span>
          <span className="text-[10px] text-gray-400">({overdueTasks.length})</span>
        </div>
        <div>
          {overdueTasks.length === 0 ? (
            <div className="text-center text-gray-400 text-xs py-6">Ninguna tarea en progreso pasó su tiempo estimado</div>
          ) : (
            <div className="max-h-[280px] overflow-y-auto">
              {overdueTasks.slice(0, 20).map((item, idx) => {
                const members = (item.task.assignee ? item.task.assignee.split(',').map(s => s.trim()).filter(Boolean) : [])
                  .map(name => TEAM.find(m => m.name.toLowerCase() === name.toLowerCase() || m.id === name))
                  .filter(Boolean);
                return (
                  <div key={idx} className="flex items-center gap-2 py-2 px-5 border-b border-gray-50 last:border-b-0 text-xs max-md:px-3 max-md:flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-gray-800">{item.client?.name || '?'}</span>
                        <span className="text-gray-500 truncate">{'\u2022'} {item.task.title}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {item.elapsedDays}d transcurridos · estimado {item.estimatedDays}d
                      </div>
                    </div>
                    {members.length > 0 && (
                      <div className="flex -space-x-1 shrink-0">
                        {members.slice(0, 3).map(m => <TeamAvatar key={m.id} member={m} size={20} className="ring-2 ring-white" />)}
                      </div>
                    )}
                    <span className="text-[11px] font-bold shrink-0 text-orange-500">+{item.daysOver}d</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 4. Team x Client table */}
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

      {/* 5. Team velocity table */}
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
