import { useApp } from '../context/AppContext';
import { initials } from '../utils/helpers';
import KpiRow from '../components/KpiRow';

export default function PublicidadPage() {
  const { clients, setView, setSelectedId } = useApp();

  const isKorexClient = (c) => /empresa|korex/i.test(c.name);
  const clientsWithAds = clients.filter(c => !isKorexClient(c) && c.metaAds && c.metaAds.length > 0 && c.metaAds.some(a => a.status !== 'interna'));
  const activeClients = clientsWithAds.filter(c => c.metaMetrics && c.metaMetrics.adsActive);
  const totalSpend7d = activeClients.reduce((s, c) => s + (c.metaMetrics?.totalSpend7d || 0), 0);
  const totalLeads7d = activeClients.reduce((s, c) => s + (c.metaMetrics?.totalConversions7d || 0), 0);
  const noAds = clients.filter(c => !isKorexClient(c) && (!c.metaAds || c.metaAds.length === 0 || c.metaAds.every(a => a.status === 'interna')));

  const openClient = (id) => { setSelectedId(id); setView('clients'); };

  const currSymbol = (curr) => curr === 'EUR' ? '\u20AC' : curr === 'MXN' ? 'MX$' : '$';

  return (
    <div>
      <KpiRow items={[
        { label: 'Cuentas con Ads', value: clientsWithAds.length, color: 'var(--color-blue)' },
        { label: 'Publicidad activa', value: activeClients.length, color: 'var(--color-green)' },
        { label: 'Inversion 7d', value: '$' + totalSpend7d.toFixed(0), color: 'var(--color-purple)' },
        { label: 'Leads 7d', value: totalLeads7d, color: 'var(--color-orange)' },
      ]} />

      {/* Report table */}
      <div className="bg-white border border-border rounded-[10px] p-[18px] mb-5">
        <div className="text-sm font-bold mb-1">Informe de publicidad</div>
        <div className="text-[11px] text-text3 mb-3">Metricas de los ultimos 7 dias. Solo campanas con eventos de conversion de nuestro funnel.</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {['Cliente', 'Estado', 'Evento principal', 'Inversion 7d', 'Leads 7d', 'CPL prom.', 'Inv. ayer', 'Leads ayer'].map(h => (
                  <th key={h} className="text-left py-2 px-2.5 bg-surface2 border border-border text-[10px] uppercase tracking-[0.5px] text-text3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientsWithAds.map(c => {
                const m = c.metaMetrics || {};
                const isActive = m.adsActive;
                const cs = currSymbol(m.currency || 'USD');
                return (
                  <tr key={c.id} className="cursor-pointer hover:bg-blue-bg2" style={!isActive ? { opacity: 0.7 } : {}} onClick={() => openClient(c.id)}>
                    <td className="py-2 px-2.5 border border-border">
                      <strong>{c.name}</strong> <span className="text-[10px] text-text3">{c.company}</span>
                      {!isActive && m.pauseReason && <div className="text-[9px] text-red mt-0.5">{'\u26A0'} {m.pauseReason}</div>}
                    </td>
                    <td className="py-2 px-2.5 border border-border">
                      <span className={`inline-flex items-center gap-1 py-[2px] px-2 rounded-[10px] text-[9px] font-bold ${isActive ? 'bg-green-bg text-[#16A34A]' : 'bg-yellow-bg text-[#CA8A04]'}`}>
                        {isActive ? '\u25CF Activa' : '\u23F8 Pausada'}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 border border-border">
                      {m.conversionEvent ? <span className="text-[9px] bg-purple-bg text-purple py-[2px] px-1.5 rounded font-medium">{m.conversionEvent}</span> : <span className="text-[10px] text-text3">{'\u2014'}</span>}
                    </td>
                    <td className="py-2 px-2.5 border border-border font-semibold">{m.totalSpend7d ? cs + m.totalSpend7d.toFixed(2) : '\u2014'}</td>
                    <td className="py-2 px-2.5 border border-border font-semibold text-blue">{m.totalConversions7d || '\u2014'}</td>
                    <td className="py-2 px-2.5 border border-border font-semibold" style={{ color: m.avgCpl7d && m.avgCpl7d > 15 ? 'var(--color-red)' : 'var(--color-green)' }}>{m.avgCpl7d ? cs + m.avgCpl7d.toFixed(2) : '\u2014'}</td>
                    <td className="py-2 px-2.5 border border-border">{m.spendYesterday ? cs + m.spendYesterday.toFixed(2) : '\u2014'}</td>
                    <td className="py-2 px-2.5 border border-border text-blue font-semibold">{m.conversionsYesterday || '\u2014'}</td>
                  </tr>
                );
              })}
              {noAds.map(c => (
                <tr key={c.id} className="cursor-pointer hover:bg-blue-bg2" style={{ opacity: 0.5 }} onClick={() => openClient(c.id)}>
                  <td className="py-2 px-2.5 border border-border">{c.name} <span className="text-[10px] text-text3">{c.company}</span></td>
                  <td className="py-2 px-2.5 border border-border"><span className="inline-flex items-center gap-1 py-[2px] px-2 rounded-[10px] text-[9px] font-bold bg-surface2 text-text3">Sin cuenta</span></td>
                  <td colSpan={6} className="py-2 px-2.5 border border-border text-[10px] text-text3">No tiene cuenta de Meta Ads configurada</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail cards for active clients */}
      {activeClients.length > 0 && (
        <>
          <div className="text-[13px] font-bold mb-2.5">Detalle por cliente activo</div>
          <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
            {activeClients.map(c => {
              const m = c.metaMetrics;
              const cs = currSymbol(m.currency || 'USD');
              return (
                <div key={c.id} className="bg-white border border-border rounded-[10px] py-4 px-[18px] cursor-pointer transition-all duration-150 hover:border-blue hover:shadow-sm" onClick={() => openClient(c.id)}>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px]" style={{ background: c.color + '15', color: c.color }}>{initials(c.name)}</div>
                    <div className="flex-1"><div className="text-sm font-bold">{c.name}</div><div className="text-[11px] text-text3">{c.company}</div></div>
                    <span className="inline-flex items-center gap-1 py-[2px] px-2 rounded-[10px] text-[9px] font-bold bg-green-bg text-[#16A34A]">{'\u25CF'} Activa</span>
                  </div>
                  {m.conversionEvent && <div className="mb-2"><span className="text-[9px] bg-purple-bg text-purple py-[2px] px-1.5 rounded font-medium">Evento: {m.conversionEvent}</span></div>}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center py-2 px-1 bg-surface2 rounded-md"><div className="text-base font-extrabold tracking-tight">{cs}{m.totalSpend7d?.toFixed(0) || 0}</div><div className="text-[9px] text-text3 uppercase tracking-[0.5px] mt-0.5">Inversion 7d</div></div>
                    <div className="text-center py-2 px-1 bg-surface2 rounded-md"><div className="text-base font-extrabold tracking-tight text-blue">{m.totalConversions7d || 0}</div><div className="text-[9px] text-text3 uppercase tracking-[0.5px] mt-0.5">Leads 7d</div></div>
                    <div className="text-center py-2 px-1 bg-surface2 rounded-md"><div className="text-base font-extrabold tracking-tight" style={{ color: m.avgCpl7d > 15 ? 'var(--color-red)' : 'var(--color-green)' }}>{cs}{m.avgCpl7d?.toFixed(2) || '\u2014'}</div><div className="text-[9px] text-text3 uppercase tracking-[0.5px] mt-0.5">CPL prom.</div></div>
                  </div>
                  <div className="mt-2.5">
                    <div className="flex justify-between items-center text-[11px] text-text2 py-1 border-b border-border"><span>Gasto ayer</span><strong>{cs}{m.spendYesterday?.toFixed(2) || '0'}</strong></div>
                    <div className="flex justify-between items-center text-[11px] text-text2 py-1 border-b border-border"><span>Leads ayer</span><strong className="text-blue">{m.conversionsYesterday || 0}</strong></div>
                    <div className="flex justify-between items-center text-[11px] text-text2 py-1 border-b border-border"><span>Impresiones 7d</span><strong>{(m.impressions7d || 0).toLocaleString()}</strong></div>
                    <div className="flex justify-between items-center text-[11px] text-text2 py-1 border-b border-border"><span>Clicks 7d</span><strong>{(m.clicks7d || 0).toLocaleString()}</strong></div>
                    <div className="flex justify-between items-center text-[11px] text-text2 py-1"><span>CTR</span><strong>{m.ctr7d?.toFixed(2) || '\u2014'}%</strong></div>
                  </div>
                  <div className="mt-2 text-[10px] text-text3">Actualizado: {m.lastUpdated || '\u2014'}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}