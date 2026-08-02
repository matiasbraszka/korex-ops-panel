import { useApp } from '../context/AppContext';
import { initials } from '../utils/helpers';
import KpiRow from '../components/KpiRow';

// Tipos de cambio a USD. Mismos valores que motor_config.fx_rates del motor de
// métricas, para que las dos vistas den el mismo número.
const RATES_TO_USD = { USD: 1, EUR: 1.08, MXN: 0.058, ARS: 0.000909, COP: 0.000238, CLP: 0.00102 };

function toUSD(amount, currency) {
  if (!amount) return 0;
  const rate = RATES_TO_USD[currency] || 1;
  return amount * rate;
}

// Divisa con la que convertir el gasto de un cliente. metaMetrics.currency es una
// sola por cliente (la de la cuenta que más gastó en la corrida), así que para
// quien tiene cuentas en dos monedas se queda corta: en ese caso mandan las
// cuentas cargadas en Links, que es donde se declara la divisa de cada una.
function monedaDe(c) {
  const cuentas = (c.metaAds || []).filter((a) => a.status !== 'interna' && a.currency);
  const unicas = [...new Set(cuentas.map((a) => String(a.currency).toUpperCase()))];
  if (unicas.length === 1) return unicas[0];
  return c.metaMetrics?.currency || unicas[0] || 'USD';
}
// true si el cliente tiene cuentas en monedas distintas: ahí el total del panel es
// una aproximación (el gasto viene mezclado desde Meta) y conviene avisarlo.
function monedaMixta(c) {
  const u = [...new Set((c.metaAds || []).filter((a) => a.status !== 'interna' && a.currency).map((a) => String(a.currency).toUpperCase()))];
  return u.length > 1;
}

export default function PublicidadPage() {
  const { clients, setView, setSelectedId } = useApp();

  const isKorexClient = (c) => /empresa|korex/i.test(c.name);
  const clientsWithAds = clients.filter(c => !isKorexClient(c) && c.metaAds && c.metaAds.length > 0 && c.metaAds.some(a => a.status !== 'interna'));
  const activeClients = clientsWithAds.filter(c => c.metaMetrics && c.metaMetrics.adsActive);
  const pausedClients = clientsWithAds.filter(c => !c.metaMetrics || !c.metaMetrics.adsActive);
  const noAds = clients.filter(c => !isKorexClient(c) && (!c.metaAds || c.metaAds.length === 0 || c.metaAds.every(a => a.status === 'interna')));

  // Total en USD. Antes usaba metaMetrics.currency a secas: cuando ese campo no
  // estaba escrito caía a USD y sumaba euros como si fueran dólares.
  const totalSpend7dUSD = activeClients.reduce((s, c) => s + toUSD(c.metaMetrics?.totalSpend7d || 0, monedaDe(c)), 0);
  const totalLeads7d = activeClients.reduce((s, c) => s + (c.metaMetrics?.totalConversions7d || 0), 0);

  const openClient = (id) => { setSelectedId(id); setView('clients'); };

  const fmtUSD = (amount, currency) => '$' + toUSD(amount, currency).toFixed(2);

  // Sorted table: active first, then paused, then no account
  const sortedWithAds = [...activeClients, ...pausedClients];

  return (
    <div>
      <KpiRow items={[
        { label: 'Cuentas con Ads', value: clientsWithAds.length, color: 'var(--color-blue)' },
        { label: 'Publicidad activa', value: activeClients.length, color: 'var(--color-green)' },
        { label: 'Inversión 7d', value: '$' + totalSpend7dUSD.toFixed(0), color: 'var(--color-purple)' },
        { label: 'Leads 7d', value: totalLeads7d, color: 'var(--color-orange)' },
      ]} />

      {/* Detail cards for active clients */}
      {activeClients.length > 0 && (
        <>
          <div className="text-[13px] font-bold mb-2.5">Detalle por cliente activo</div>
          <div className="grid gap-3.5 mb-5 max-md:gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))' }}>
            {activeClients.map(c => {
              const m = c.metaMetrics;
              const curr = monedaDe(c);
              return (
                <div key={c.id} className="bg-white border border-border rounded-xl py-4 px-[18px] cursor-pointer transition-all duration-150 hover:border-blue hover:shadow-sm max-md:py-3 max-md:px-3" onClick={() => openClient(c.id)}>
                  <div className="flex items-center gap-2.5 mb-3">
                    {c.avatarUrl ? (
                      <img src={c.avatarUrl} alt={c.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0" style={{ background: c.color + '15', color: c.color }}>{initials(c.name)}</div>
                    )}
                    <div className="flex-1 min-w-0"><div className="text-sm font-bold truncate">{c.name}</div><div className="text-[11px] text-text3 truncate">{c.company}</div></div>
                    <span className="inline-flex items-center gap-1 py-[2px] px-2 rounded-xl text-[9px] font-bold bg-green-bg text-[#16A34A] shrink-0">{'\u25CF'} Activa</span>
                  </div>
                  {m.conversionEvent && <div className="mb-2"><span className="text-[9px] bg-purple-bg text-purple py-[2px] px-1.5 rounded font-medium">Evento: {m.conversionEvent}</span></div>}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center py-2 px-1 bg-surface2 rounded-md"><div className="text-base font-extrabold tracking-tight">${toUSD(m.totalSpend7d, curr).toFixed(0)}</div><div className="text-[9px] text-text3 uppercase tracking-[0.5px] mt-0.5">Inversión 7d</div></div>
                    <div className="text-center py-2 px-1 bg-surface2 rounded-md"><div className="text-base font-extrabold tracking-tight text-blue">{m.totalConversions7d || 0}</div><div className="text-[9px] text-text3 uppercase tracking-[0.5px] mt-0.5">Leads 7d</div></div>
                    <div className="text-center py-2 px-1 bg-surface2 rounded-md"><div className="text-base font-extrabold tracking-tight" style={{ color: toUSD(m.avgCpl7d, curr) > 15 ? 'var(--color-red)' : 'var(--color-green)' }}>${toUSD(m.avgCpl7d, curr).toFixed(2)}</div><div className="text-[9px] text-text3 uppercase tracking-[0.5px] mt-0.5">CPL prom.</div></div>
                  </div>
                  <div className="mt-2.5">
                    <div className="flex justify-between items-center text-[11px] text-text2 py-1 border-b border-border"><span>Gasto ayer</span><strong>${toUSD(m.spendYesterday, curr).toFixed(2)}</strong></div>
                    <div className="flex justify-between items-center text-[11px] text-text2 py-1 border-b border-border"><span>Leads ayer</span><strong className="text-blue">{m.conversionsYesterday || 0}</strong></div>
                    <div className="flex justify-between items-center text-[11px] text-text2 py-1"><span>CTR</span><strong>{m.ctr7d?.toFixed(2) || '\u2014'}%</strong></div>
                  </div>
                  <div className="mt-2 text-[10px] text-text3">Actualizado: {m.lastUpdated || '\u2014'}{curr !== 'USD' && <span className="ml-1">({curr} convertido a USD)</span>}</div>
                  {monedaMixta(c) && (
                    <div className="mt-1 text-[10px]" style={{ color: '#B45309' }} title="Este cliente tiene cuentas en monedas distintas. Meta entrega el gasto ya sumado, as\u00ed que el total se convierte con una sola tasa y es aproximado.">
                      \u26a0\ufe0f Cuentas en varias monedas \u00b7 total aproximado
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Report table — sorted: active > paused > sin cuenta */}
      <div className="bg-white border border-border rounded-xl p-[18px] mb-5 max-md:p-3 max-md:rounded-lg">
        <div className="text-sm font-bold mb-1">Informe de publicidad</div>
        <div className="text-[11px] text-text3 mb-3">Métricas de los últimos 7 días en USD. Solo campañas con eventos de conversión de nuestro funnel.</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="text-left py-2 px-2.5 bg-surface2 border border-border text-[10px] uppercase tracking-[0.5px] text-text3 font-semibold">Cliente</th>
                <th className="text-left py-2 px-2.5 bg-surface2 border border-border text-[10px] uppercase tracking-[0.5px] text-text3 font-semibold">Estado</th>
                <th className="text-left py-2 px-2.5 bg-surface2 border border-border text-[10px] uppercase tracking-[0.5px] text-text3 font-semibold max-md:hidden">Evento</th>
                <th className="text-left py-2 px-2.5 bg-surface2 border border-border text-[10px] uppercase tracking-[0.5px] text-text3 font-semibold">Inv. 7d</th>
                <th className="text-left py-2 px-2.5 bg-surface2 border border-border text-[10px] uppercase tracking-[0.5px] text-text3 font-semibold">Leads</th>
                <th className="text-left py-2 px-2.5 bg-surface2 border border-border text-[10px] uppercase tracking-[0.5px] text-text3 font-semibold">CPL</th>
                <th className="text-left py-2 px-2.5 bg-surface2 border border-border text-[10px] uppercase tracking-[0.5px] text-text3 font-semibold max-md:hidden">Inv. Ayer</th>
                <th className="text-left py-2 px-2.5 bg-surface2 border border-border text-[10px] uppercase tracking-[0.5px] text-text3 font-semibold max-md:hidden">Leads ayer</th>
              </tr>
            </thead>
            <tbody>
              {sortedWithAds.map(c => {
                const m = c.metaMetrics || {};
                const isActive = m.adsActive;
                const curr = monedaDe(c);
                return (
                  <tr key={c.id} className="cursor-pointer hover:bg-blue-bg2" style={!isActive ? { opacity: 0.7 } : {}} onClick={() => openClient(c.id)}>
                    <td className="py-2 px-2.5 border border-border">
                      <strong>{c.name}</strong> <span className="text-[10px] text-text3">{c.company}</span>
                      {!isActive && m.pauseReason && <div className="text-[9px] text-red mt-0.5">{'\u26A0'} {m.pauseReason}</div>}
                    </td>
                    <td className="py-2 px-2.5 border border-border">
                      <span className={`inline-flex items-center gap-1 py-[2px] px-2 rounded-xl text-[9px] font-bold ${isActive ? 'bg-green-bg text-[#16A34A]' : 'bg-yellow-bg text-[#CA8A04]'}`}>
                        {isActive ? '\u25CF Activa' : '\u23F8 Pausada'}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 border border-border max-md:hidden">
                      {m.conversionEvent ? <span className="text-[9px] bg-purple-bg text-purple py-[2px] px-1.5 rounded font-medium">{m.conversionEvent}</span> : <span className="text-[10px] text-text3">{'\u2014'}</span>}
                    </td>
                    <td className="py-2 px-2.5 border border-border font-semibold">{m.totalSpend7d ? fmtUSD(m.totalSpend7d, curr) : '\u2014'}</td>
                    <td className="py-2 px-2.5 border border-border font-semibold text-blue">{m.totalConversions7d || '\u2014'}</td>
                    <td className="py-2 px-2.5 border border-border font-semibold" style={{ color: m.avgCpl7d && toUSD(m.avgCpl7d, curr) > 15 ? 'var(--color-red)' : 'var(--color-green)' }}>{m.avgCpl7d ? fmtUSD(m.avgCpl7d, curr) : '\u2014'}</td>
                    <td className="py-2 px-2.5 border border-border max-md:hidden">{m.spendYesterday ? fmtUSD(m.spendYesterday, curr) : '\u2014'}</td>
                    <td className="py-2 px-2.5 border border-border text-blue font-semibold max-md:hidden">{m.conversionsYesterday || '\u2014'}</td>
                  </tr>
                );
              })}
              {noAds.map(c => (
                <tr key={c.id} className="cursor-pointer hover:bg-blue-bg2" style={{ opacity: 0.5 }} onClick={() => openClient(c.id)}>
                  <td className="py-2 px-2.5 border border-border">{c.name} <span className="text-[10px] text-text3">{c.company}</span></td>
                  <td className="py-2 px-2.5 border border-border"><span className="inline-flex items-center gap-1 py-[2px] px-2 rounded-xl text-[9px] font-bold bg-surface2 text-text3">Sin cuenta</span></td>
                  <td colSpan={3} className="py-2 px-2.5 border border-border text-[10px] text-text3 max-md:hidden">No tiene cuenta de Meta Ads configurada</td>
                  <td colSpan={3} className="py-2 px-2.5 border border-border text-[10px] text-text3 hidden max-md:table-cell">Sin cuenta</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}