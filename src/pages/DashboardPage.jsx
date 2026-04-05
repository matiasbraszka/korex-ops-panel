import { useApp } from '../context/AppContext';
import { PHASES, PROCESS_STEPS, TASK_STATUS, TEAM } from '../utils/constants';
import { progress, getPhaseTimings, daysBetween, daysAgo, today } from '../utils/helpers';
import KpiRow from '../components/KpiRow';

export default function DashboardPage() {
  const { clients, tasks } = useApp();

  const totalClients = clients.length;
  const launched = clients.filter(c => {
    const lt = tasks.find(t => t.clientId === c.id && t.isRoadmapTask && t.templateId === 'lanzamiento');
    if (lt) return lt.status === 'done';
    return c.steps[17] && c.steps[17].status === 'completed';
  }).length;
  const avgProgress = totalClients ? Math.round(clients.reduce((s, c) => s + progress(c, tasks), 0) / totalClients) : 0;
  const blockedClients = clients.filter(c => {
    const rt = tasks.filter(t => t.clientId === c.id && t.isRoadmapTask);
    if (rt.length > 0) return rt.some(t => t.status === 'blocked');
    return c.steps.some(s => s.status === 'blocked');
  }).length;

  // Phase timing averages
  const phaseAvgs = {};
  Object.keys(PHASES).forEach(phase => {
    let totalDays = 0, count = 0;
    clients.forEach(c => {
      const t = getPhaseTimings(c, tasks);
      if (t[phase] && t[phase].actualDays !== null && t[phase].allDone) { totalDays += t[phase].actualDays; count++; }
    });
    const avg = count > 0 ? Math.round(totalDays / count) : null;
    const expected = PROCESS_STEPS.filter(s => s.phase === phase).reduce((s, x) => s + x.days, 0);
    phaseAvgs[phase] = { avg, expected, count };
  });

  // Team velocity
  const now = today();
  const monthStart = now.substring(0, 7) + '-01';
  const teamVelocity = TEAM.map(m => {
    const myTasks = tasks.filter(t => t.assignee?.toLowerCase() === m.name.toLowerCase() || t.assignee === m.id);
    const completedThisMonth = myTasks.filter(t => t.status === 'done' && t.completedDate && t.completedDate >= monthStart);
    const inProgress = myTasks.filter(t => t.status === 'in-progress');
    let totalCompletionDays = 0, completionCount = 0;
    myTasks.forEach(t => {
      if (t.status === 'done' && t.startedDate && t.completedDate) {
        const d = daysBetween(t.startedDate, t.completedDate);
        if (d !== null && d >= 0) { totalCompletionDays += d; completionCount++; }
      }
    });
    const avgDays = completionCount > 0 ? Math.round((totalCompletionDays / completionCount) * 10) / 10 : null;
    return { ...m, completedThisMonth: completedThisMonth.length, inProgress: inProgress.length, avgDays };
  });

  // Overdue alerts
  const overdueSteps = [];
  clients.forEach(c => {
    // Only use steps for clients without roadmap tasks
    const hasRT = tasks.some(t => t.clientId === c.id && t.isRoadmapTask);
    if (!hasRT) {
      c.steps.forEach((cs, idx) => {
        if (cs.status === 'in-progress' && cs.startDate) {
          const d = daysAgo(cs.startDate);
          if (d > PROCESS_STEPS[idx].days) {
            overdueSteps.push({ clientName: c.name, stepName: PROCESS_STEPS[idx].name, days: d, est: PROCESS_STEPS[idx].days, type: 'step' });
          }
        }
      });
    }
  });
  const overdueTasks = tasks.filter(t => {
    if (t.status !== 'in-progress' || !t.startedDate) return false;
    const d = daysAgo(t.startedDate);
    if (t.isRoadmapTask && t.estimatedDays) return d > t.estimatedDays;
    if (t.stepIdx !== null && t.stepIdx < PROCESS_STEPS.length) return d > PROCESS_STEPS[t.stepIdx].days;
    return d > 7; // default threshold
  }).map(t => {
    const client = clients.find(x => x.id === t.clientId);
    const d = daysAgo(t.startedDate);
    const est = t.isRoadmapTask && t.estimatedDays ? t.estimatedDays : (t.stepIdx !== null && t.stepIdx < PROCESS_STEPS.length ? PROCESS_STEPS[t.stepIdx].days : 7);
    return { clientName: client?.name || '?', stepName: t.title, days: d, est, type: 'task' };
  });
  const allOverdue = [...overdueSteps, ...overdueTasks].sort((a, b) => (b.days - b.est) - (a.days - a.est));

  // Tasks by assignee
  const teamLoad = TEAM.map(m => {
    const memberTasks = tasks.filter(t => t.status !== 'done' && (t.assignee?.toLowerCase() === m.name.toLowerCase() || t.assignee === m.id));
    const urgent = memberTasks.filter(t => t.priority === 'urgent').length;
    return { ...m, taskCount: memberTasks.length, urgent };
  });
  const maxTasks = Math.max(...teamLoad.map(m => m.taskCount), 1);

  return (
    <div>
      <KpiRow items={[
        { label: 'Clientes activos', value: totalClients, color: 'var(--color-blue)' },
        { label: 'Progreso promedio', value: avgProgress + '%', color: 'var(--color-green)' },
        { label: 'Ads lanzados', value: launched, color: 'var(--color-purple)' },
        { label: 'Bloqueados', value: blockedClients, color: 'var(--color-red)' },
      ]} />

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
        {/* Phase timing */}
        <div className="bg-white border border-border rounded-[14px] py-5 px-6">
          <div className="text-sm font-bold mb-3.5 flex items-center gap-2">Tiempo promedio por fase</div>
          {Object.entries(PHASES).map(([k, v]) => {
            const pa = phaseAvgs[k];
            if (!pa) return null;
            const pct = pa.avg !== null ? Math.min(100, Math.round(pa.avg / Math.max(1, pa.expected) * 100)) : 0;
            const color = pa.avg !== null && pa.avg > pa.expected ? 'var(--color-red)' : v.color;
            return (
              <div key={k} className="flex items-center gap-2.5 py-[5px] text-xs">
                <div className="min-w-[130px] text-text2 whitespace-nowrap overflow-hidden text-ellipsis">{v.label}</div>
                <div className="flex-1 h-2 bg-surface3 rounded overflow-hidden">
                  <div className="h-full rounded transition-[width] duration-300" style={{ width: pct + '%', background: color }} />
                </div>
                <div className="min-w-[50px] text-right font-semibold text-[11px]" style={{ color }}>{pa.avg !== null ? pa.avg + 'd' : '-'} / {pa.expected}d</div>
              </div>
            );
          })}
          <div className="text-[10px] text-text3 mt-2">Basado en {Object.values(phaseAvgs).reduce((s, x) => Math.max(s, x.count), 0)} clientes completados</div>
        </div>

        {/* Tasks by status */}
        <div className="bg-white border border-border rounded-[14px] py-5 px-6">
          <div className="text-sm font-bold mb-3.5">Tareas por estado</div>
          <div className="grid grid-cols-2 gap-2.5">
            {Object.entries(TASK_STATUS).map(([k, v]) => {
              const count = tasks.filter(t => t.status === k).length;
              return (
                <div key={k} className="text-center py-3 border border-border rounded-[10px]">
                  <div className="text-[28px] font-extrabold tracking-tight" style={{ color: v.color }}>{count}</div>
                  <div className="text-[10px] text-text3 mt-0.5">{v.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Load per person */}
        <div className="bg-white border border-border rounded-[14px] py-5 px-6">
          <div className="text-sm font-bold mb-3.5">Carga por persona</div>
          {teamLoad.map(m => {
            const pct = Math.round(m.taskCount / maxTasks * 100);
            return (
              <div key={m.id} className="flex items-center gap-2.5 py-[5px] text-xs">
                <div className="min-w-[130px] text-text2 whitespace-nowrap overflow-hidden text-ellipsis">{m.name}</div>
                <div className="flex-1 h-2 bg-surface3 rounded overflow-hidden">
                  <div className="h-full rounded transition-[width] duration-300" style={{ width: pct + '%', background: m.color }} />
                </div>
                <div className="min-w-[50px] text-right font-semibold text-[11px]">{m.taskCount}{m.urgent > 0 ? ` (${m.urgent} urg)` : ''}</div>
              </div>
            );
          })}
        </div>

        {/* Team velocity */}
        <div className="bg-white border border-border rounded-[14px] py-5 px-6">
          <div className="text-sm font-bold mb-3.5">Velocidad del equipo</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-surface2">
                  <th className="py-1.5 px-2 text-left border border-border">Miembro</th>
                  <th className="py-1.5 px-2 text-center border border-border">Prom. dias</th>
                  <th className="py-1.5 px-2 text-center border border-border">Hechas (mes)</th>
                  <th className="py-1.5 px-2 text-center border border-border">En progreso</th>
                </tr>
              </thead>
              <tbody>
                {teamVelocity.map(m => (
                  <tr key={m.id}>
                    <td className="py-[5px] px-2 border border-border font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold" style={{ background: m.color + '18', color: m.color }}>{m.initials}</span>
                        {m.name}
                      </span>
                    </td>
                    <td className="py-[5px] px-2 text-center border border-border">{m.avgDays !== null ? m.avgDays + 'd' : '-'}</td>
                    <td className="py-[5px] px-2 text-center border border-border font-semibold" style={{ color: m.completedThisMonth > 0 ? 'var(--color-green)' : 'var(--color-text3)' }}>{m.completedThisMonth}</td>
                    <td className="py-[5px] px-2 text-center border border-border" style={{ color: m.inProgress > 0 ? 'var(--color-blue)' : 'var(--color-text3)' }}>{m.inProgress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cuellos de botella - tareas que frenan el progreso */}
        <div className="bg-white border border-red rounded-[14px] py-5 px-6 border-opacity-20" style={{ borderColor: 'rgba(239,68,68,0.25)' }}>
          <div className="text-sm font-bold mb-1 flex items-center gap-2 text-red">{'\u26A1'} Cuellos de botella</div>
          <div className="text-[11px] text-text3 mb-3">Tareas que estan frenando el progreso de la entrega de servicio</div>
          {(() => {
            // Find tasks that are blocking other tasks (bottlenecks)
            const bottlenecks = [];
            tasks.forEach(t => {
              if (t.status === 'done') return;
              // How many tasks does this one block?
              const blocking = tasks.filter(other =>
                other.clientId === t.clientId &&
                other.dependsOn &&
                other.dependsOn.includes(t.id) &&
                other.status !== 'done'
              );
              if (blocking.length > 0) {
                const client = clients.find(x => x.id === t.clientId);
                const d = t.startedDate ? daysAgo(t.startedDate) : (t.dueDate && t.dueDate < today() ? daysAgo(t.dueDate) : 0);
                bottlenecks.push({ task: t, client, blockingCount: blocking.length, days: d, blockedTasks: blocking.map(b => b.title) });
              }
            });
            // Also add overdue tasks (in-progress for too long)
            allOverdue.forEach(item => {
              if (!bottlenecks.find(b => b.task?.title === item.stepName)) {
                bottlenecks.push({ task: null, client: clients.find(x => x.name === item.clientName), blockingCount: 0, days: item.days - item.est, stepName: item.stepName, isOverdue: true });
              }
            });
            // Sort by impact (blocking count) then by days
            bottlenecks.sort((a, b) => (b.blockingCount - a.blockingCount) || (b.days - a.days));

            if (bottlenecks.length === 0) return <div className="text-center text-text3 text-xs py-5">Sin cuellos de botella detectados</div>;

            return (
              <div className="max-h-[300px] overflow-y-auto">
                {bottlenecks.slice(0, 15).map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 py-2 border-b border-border last:border-b-0 text-xs">
                    <span className="text-red text-sm mt-0.5">{item.blockingCount > 0 ? '\uD83D\uDD12' : '\u26A0\uFE0F'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-text">{item.client?.name || '?'}</span>
                        <span className="text-text2 truncate">{item.task?.title || item.stepName}</span>
                      </div>
                      {item.blockingCount > 0 && (
                        <div className="text-[10px] text-red mt-0.5">Bloquea {item.blockingCount} tarea{item.blockingCount > 1 ? 's' : ''}: {item.blockedTasks.join(', ')}</div>
                      )}
                      {item.isOverdue && (
                        <div className="text-[10px] text-orange mt-0.5">Retraso de +{item.days}d sobre el estimado</div>
                      )}
                      {item.task?.assignee && <div className="text-[10px] text-text3 mt-0.5">Asignada a: {item.task.assignee}</div>}
                    </div>
                    {item.days > 0 && <span className="text-[10px] font-bold text-red shrink-0 mt-0.5">+{item.days}d</span>}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Phase timing per client table */}
        <div className="bg-white border border-border rounded-[14px] py-5 px-6" style={{ gridColumn: '1 / -1' }}>
          <div className="text-sm font-bold mb-3.5">Tiempo real por fase (dias)</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-surface2">
                  <th className="py-1.5 px-2 text-left border border-border">Cliente</th>
                  {Object.values(PHASES).map(v => (
                    <th key={v.label} className="py-1.5 px-2 text-center border border-border" style={{ color: v.color }}>{v.label}</th>
                  ))}
                  <th className="py-1.5 px-2 text-center border border-border">Total</th>
                </tr>
              </thead>
              <tbody>
                {clients.filter(c => {
                const hasRT = tasks.some(t => t.clientId === c.id && t.isRoadmapTask);
                if (hasRT) return tasks.some(t => t.clientId === c.id && t.isRoadmapTask && t.status !== 'backlog');
                return c.steps.some(s => s.status !== 'pending');
              }).map(c => {
                  const timings = getPhaseTimings(c, tasks);
                  let total = 0;
                  return (
                    <tr key={c.id}>
                      <td className="py-[5px] px-2 border border-border font-semibold">{c.name}</td>
                      {Object.entries(PHASES).map(([k, v]) => {
                        const t = timings[k];
                        const val = t?.actualDays;
                        const exp = t?.expectedDays || 0;
                        if (val != null) total += val;
                        const over = val != null && val > exp;
                        return (
                          <td key={k} className="py-[5px] px-2 text-center border border-border" style={over ? { color: 'var(--color-red)', fontWeight: 600 } : { color: 'var(--color-text2)' }}>
                            {val != null ? val + 'd' : '-'}
                          </td>
                        );
                      })}
                      <td className="py-[5px] px-2 text-center border border-border font-bold">{total ? total + 'd' : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}