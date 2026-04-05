import { useApp } from '../context/AppContext';
import { PRIO_CLIENT, PHASES } from '../utils/constants';
import { initials, progress, currentTask, getBottleneck, daysAgo, fmtDate, clientPill } from '../utils/helpers';
import KpiRow from '../components/KpiRow';
import ClientDetail from './ClientDetail';

export default function ClientsPage() {
  const { clients, tasks, filter, setFilter, selectedId, setSelectedId, setView, briefing, taskProposals } = useApp();

  if (selectedId) {
    const c = clients.find(x => x.id === selectedId);
    if (c) return <ClientDetail client={c} />;
  }

  const pendingProposals = taskProposals.filter(p => p.approval === 'pending').length;
  const stored = briefing;

  // Filter out Empresa (Korex) from the client list
  const isKorexClient = (c) => /empresa|korex/i.test(c.name);
  const visibleClients = clients.filter(c => !isKorexClient(c));

  let preview = 'Sin informe disponible. El agente de operaciones enviará el próximo informe automáticamente.';
  if (stored && stored.text) {
    const lines = stored.text.replace(/<[^>]+>/g, '').split('\n').filter(l => l.trim() && !l.startsWith('#'));
    preview = lines.slice(0, 2).join(' ').substring(0, 200);
    if (lines.join(' ').length > 200) preview += '...';
  }

  const t = visibleClients.length;
  const b = visibleClients.filter(c => (c.priority || 4) <= 2).length;
  const l = visibleClients.filter(c => {
    // New system: check if lanzamiento roadmap task is done
    const launchTask = tasks.find(tk => tk.clientId === c.id && tk.isRoadmapTask && tk.templateId === 'lanzamiento');
    if (launchTask) return launchTask.status === 'done';
    // Fallback to steps
    return c.steps[17] && c.steps[17].status === 'completed';
  }).length;
  const n = visibleClients.filter(c => (c.priority || 4) === 5).length;

  const filterDefs = [
    { key: 'all', label: 'Todos' },
    { key: 'critical', label: 'Críticos' },
    { key: 'in-progress', label: 'En progreso' },
    { key: 'waiting', label: 'Esp. cliente' },
    { key: 'new', label: 'Nuevos' },
  ];

  let cls = [...visibleClients].sort((a, bb) => (a.priority || 4) - (bb.priority || 4));
  if (filter === 'critical') cls = cls.filter(c => (c.priority || 4) <= 2);
  if (filter === 'in-progress') cls = cls.filter(c => {
    const ct = tasks.filter(tk => tk.clientId === c.id);
    if (ct.length > 0) return ct.some(tk => tk.status === 'in-progress');
    return c.steps.some(s => s.status === 'in-progress');
  });
  if (filter === 'waiting') cls = cls.filter(c => {
    const ct = tasks.filter(tk => tk.clientId === c.id);
    if (ct.length > 0) return ct.some(tk => tk.isClientTask && tk.status !== 'done' && tk.status !== 'backlog');
    return c.steps.some(s => s.status === 'waiting-client');
  });
  if (filter === 'new') cls = cls.filter(c => (c.priority || 4) === 5);

  let lastPrio = null;

  return (
    <div>
      {/* Briefing card */}
      <div
        className="border rounded-[14px] py-3.5 px-[18px] mb-5 relative cursor-pointer transition-all duration-150 hover:shadow-sm max-md:py-3 max-md:px-3.5 max-md:mb-3 max-md:rounded-[10px]"
        style={{ background: 'linear-gradient(135deg, var(--color-blue-bg2), var(--color-surface))', borderColor: 'rgba(91,124,245,0.13)' }}
        onClick={() => setView('informe')}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="bg-blue text-white text-[9px] font-bold py-0.5 px-2 rounded-[10px] tracking-[0.5px]">INFORME DIARIO</span>
          <span className="text-xs font-semibold text-text">Último informe de operaciones</span>
          {pendingProposals > 0 && (
            <span className="bg-orange text-white text-[9px] font-bold py-0.5 px-2 rounded-[10px]">{pendingProposals} propuestas</span>
          )}
          <span className="text-[11px] text-text3 ml-auto">{stored?.date ? fmtDate(stored.date) : '\u2014'}</span>
        </div>
        <div className="text-xs leading-[1.7] text-text2">{preview}</div>
        <div className="mt-2 text-[11px] text-blue font-semibold">Ver informe completo &rarr;</div>
      </div>

      <KpiRow items={[
        { label: 'Clientes activos', value: t, color: 'var(--color-blue)' },
        { label: 'Críticos / Urgentes', value: b, color: 'var(--color-red)' },
        { label: 'Ads lanzados', value: l, color: 'var(--color-green)' },
        { label: 'Nuevos', value: n, color: 'var(--color-purple)' },
      ]} />

      {/* Filters */}
      <div className="flex gap-1.5 items-center mb-4 flex-wrap max-md:gap-1 max-md:mb-3">
        {filterDefs.map(f => (
          <button
            key={f.key}
            className={`py-1.5 px-3.5 rounded-[20px] border text-xs cursor-pointer font-sans transition-all duration-150 max-md:py-1 max-md:px-2.5 max-md:text-[11px] ${filter === f.key ? 'bg-blue text-white border-blue' : 'bg-white text-text2 border-border hover:border-blue hover:text-text'}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Client list */}
      {!cls.length && (
        <div className="text-center text-text3 text-xs py-[60px]">Sin resultados</div>
      )}
      {cls.map(c => {
        const p = c.priority || 4;
        const pcfg = PRIO_CLIENT[p];
        const cur = currentTask(c, tasks);
        const pct = progress(c, tasks);
        const days = daysAgo(c.startDate);
        const bottleneck = getBottleneck(c, tasks);
        const pill = clientPill(c, tasks);

        const adsBadge = c.metaMetrics && c.metaMetrics.adsActive
          ? <span className="inline-flex items-center gap-[3px] text-[9px] font-semibold py-[1px] px-1.5 rounded-lg whitespace-nowrap bg-green-bg text-[#16A34A]">{'\u25CF'} Ads</span>
          : (c.metaAds && c.metaAds.length > 0 && c.metaAds.some(a => a.status !== 'interna')
            ? <span className="inline-flex items-center gap-[3px] text-[9px] font-semibold py-[1px] px-1.5 rounded-lg whitespace-nowrap bg-surface2 text-text3">{'\u25CB'} Ads</span>
            : null);

        let prioLabel = null;
        if (p !== lastPrio) {
          lastPrio = p;
          prioLabel = (
            <div className="text-[10px] font-bold uppercase tracking-[1.5px] py-2 pb-1.5 flex items-center gap-2" style={{ color: pcfg.color }}>
              {pcfg.label}
              <span className="flex-1 h-px bg-border" />
            </div>
          );
        }

        return (
          <div key={c.id}>
            {prioLabel}
            <div
              className="grid items-center gap-3 py-3 px-4 bg-white border border-border rounded-[10px] mb-1.5 cursor-pointer transition-all duration-150 hover:border-blue hover:shadow-sm grid-cols-[36px_1.5fr_110px_60px_120px_90px_28px] max-md:gap-2 max-md:py-2.5 max-md:px-3 max-md:grid-cols-[30px_1fr_20px]"
              onClick={() => setSelectedId(c.id)}
            >
              <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center font-bold text-[11px] max-md:w-[30px] max-md:h-[30px] max-md:text-[10px]" style={{ background: c.color + '15', color: c.color }}>
                {initials(c.name)}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-[13px] max-md:text-[12px] flex items-center gap-1 flex-wrap">
                  <span className="truncate">{c.name}</span> <span className="font-normal text-[11px] text-text3 max-md:text-[10px] truncate">{c.company}</span> {adsBadge}
                </div>
                {bottleneck ? (
                  <div className="text-[10px] text-red font-medium mt-[3px] flex items-center gap-[3px]">{'\u26A1'} <span className="truncate">{bottleneck}</span></div>
                ) : (
                  <div className="text-[10px] text-green mt-0.5">Sin bloqueos</div>
                )}
                {c.metaMetrics && c.metaMetrics.adsActive && (
                  <div className="text-[9px] text-text3 mt-[1px]">
                    CPL: {c.metaMetrics.currency === 'EUR' ? '\u20AC' : '$'}{c.metaMetrics.avgCpl7d?.toFixed(2) || '\u2014'} {'\u00B7'} {c.metaMetrics.totalConversions7d || 0} leads 7d
                  </div>
                )}
                {/* Mobile-only: progress + pill inline */}
                <div className="hidden max-md:flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-1 bg-surface3 rounded-sm overflow-hidden max-w-[80px]">
                    <div className="h-full rounded-sm" style={{ width: pct + '%', background: c.color }} />
                  </div>
                  <span className="text-[10px] text-text3 font-semibold">{pct}%</span>
                  <span className={`inline-flex items-center gap-1 py-[2px] px-2 rounded-[20px] text-[9px] font-semibold whitespace-nowrap ${pill.pillClass === 'pill-green' ? 'bg-green-bg text-[#16A34A]' : pill.pillClass === 'pill-red' ? 'bg-red-bg text-red' : pill.pillClass === 'pill-yellow' ? 'bg-yellow-bg text-[#CA8A04]' : pill.pillClass === 'pill-blue' ? 'bg-blue-bg text-blue' : 'bg-surface2 text-text3'}`}>
                    {pill.text}
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-text2 max-md:hidden">{cur ? PHASES[cur.phase]?.label : 'Lanzado'}</div>
              <div className="text-center max-md:hidden">
                <strong className="text-[15px]">{days}</strong>
                <div className="text-[9px] text-text3">días</div>
              </div>
              <div className="max-md:hidden">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-surface3 rounded-sm overflow-hidden">
                    <div className="h-full rounded-sm" style={{ width: pct + '%', background: c.color }} />
                  </div>
                  <div className="text-[11px] text-text3 font-semibold min-w-[32px] text-right">{pct}%</div>
                </div>
              </div>
              <div className="max-md:hidden">
                <span className={`inline-flex items-center gap-1 py-[3px] px-2.5 rounded-[20px] text-[10px] font-semibold whitespace-nowrap ${pill.pillClass === 'pill-green' ? 'bg-green-bg text-[#16A34A]' : pill.pillClass === 'pill-red' ? 'bg-red-bg text-red' : pill.pillClass === 'pill-yellow' ? 'bg-yellow-bg text-[#CA8A04]' : pill.pillClass === 'pill-blue' ? 'bg-blue-bg text-blue' : 'bg-surface2 text-text3'}`}>
                  {pill.text}
                </span>
              </div>
              <div className="text-text3 text-center max-md:self-center">&rsaquo;</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}