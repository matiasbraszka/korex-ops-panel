import { useApp } from '../context/AppContext';
import { PHASES, PROCESS_STEPS, TASK_STATUS, TEAM } from '../utils/constants';
import { progress, getPhaseTimings } from '../utils/helpers';
import KpiRow from '../components/KpiRow';

export default function DashboardPage() {
  const { clients, tasks } = useApp();

  const totalClients = clients.length;
  const launched = clients.filter(c => c.steps[17] && c.steps[17].status === 'completed').length;
  const avgProgress = totalClients ? Math.round(clients.reduce((s, c) => s + progress(c), 0) / totalClients) : 0;
  const blockedClients = clients.filter(c => c.steps.some(s => s.status === 'blocked')).length;

  // Phase timing averages
  const phaseAvgs = {};
  Object.keys(PHASES).forEach(phase => {
    let totalDays = 0, count = 0;
    clients.forEach(c => {
      const t = getPhaseTimings(c);
      if (t[phase] && t[phase].actualDays !== null && t[phase].allDone) { totalDays += t[phase].actualDays; count++; }
    });
    const avg = count > 0 ? Math.round(totalDays / count) : null;
    const expected = PROCESS_STEPS.filter(s => s.phase === phase).reduce((s, x) => s + x.days, 0);
    phaseAvgs[phase] = { avg, expected, count };
  });

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
                {clients.filter(c => c.steps.some(s => s.status !== 'pending')).map(c => {
                  const timings = getPhaseTimings(c);
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