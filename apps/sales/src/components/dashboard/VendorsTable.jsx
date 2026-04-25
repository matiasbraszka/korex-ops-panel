import { useState } from 'react';
import { X } from 'lucide-react';
import { fmtMoney, initials } from './format.js';

// rows: array de objetos por vendedor con metricas ya agregadas + target
// shape: { user_id, name, role, color, avatar_url, contacts, calls, proposals, won, convRate, pipeline, revenue, avg_deal, target, contactsTrend, wonTrend, ... }
export default function VendorsTable({ rows = [], vendor, onVendorClick, range }) {
  const [sort, setSort] = useState('revenue');
  const sorted = [...rows].sort((a, b) => Number(b[sort] || 0) - Number(a[sort] || 0));

  const cols = [
    ['vendor', 'Vendedor', 'left'],
    ['contacts', 'Contactos', 'right'],
    ['calls', 'Llamadas', 'right'],
    ['proposals', 'Propuestas', 'right'],
    ['won', 'Cerrados', 'right'],
    ['convRate', 'Conv.', 'right'],
    ['pipeline', 'Pipeline', 'right'],
    ['revenue', 'Ingresos', 'right'],
    ['target', 'Meta', 'left'],
  ];

  return (
    <div className="bg-white border border-border rounded-xl">
      <div className="px-4 pt-3.5 pb-3 border-b border-border">
        <div className="text-[13px] font-bold text-text">
          {vendor === 'all' ? 'Métricas por vendedor' : 'Equipo · vendedor seleccionado resaltado'}
        </div>
        <div className="text-[10.5px] text-text3 mt-0.5">
          {range === 'max' ? 'Histórico · todos los registros' : 'Mes en curso · contactos, llamadas, propuestas, cierres'}
        </div>
      </div>
      <div className="overflow-x-auto">
        {rows.length === 0 ? (
          <div className="text-[12px] text-text3 text-center py-8">Sin datos para este rango.</div>
        ) : (
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="text-left">
                {cols.map(([k, l, a]) => {
                  const sortable = k !== 'vendor' && k !== 'target';
                  return (
                    <th key={k}
                        onClick={() => sortable && setSort(k)}
                        className={`px-2.5 py-2.5 border-b border-border text-[9.5px] font-bold uppercase tracking-wider text-text3 ${sortable ? 'cursor-pointer hover:bg-surface2' : ''}`}
                        style={{ textAlign: a, background: sort === k ? 'var(--color-blue-bg2, #F5F7FF)' : 'transparent' }}>
                      {l}{sort === k && ' ↓'}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((v, idx) => {
                const target = Number(v.target || 0);
                const revenue = Number(v.revenue || 0);
                const pct = target > 0 ? (revenue / target) * 100 : 0;
                const reached = target > 0 && revenue >= target;
                const selected = vendor === v.user_id;
                const dim = vendor !== 'all' && !selected;
                const convColor = v.convRate >= 0.30
                  ? { bg: 'var(--color-green-bg)', fg: '#16A34A' }
                  : v.convRate >= 0.20
                  ? { bg: 'var(--color-yellow-bg, #FEFCE8)', fg: '#CA8A04' }
                  : { bg: 'var(--color-red-bg)', fg: 'var(--color-red)' };
                return (
                  <tr key={v.user_id}
                      onClick={() => onVendorClick && onVendorClick(selected ? 'all' : v.user_id)}
                      className="border-b border-border cursor-pointer hover:bg-blue-bg2 transition-colors"
                      style={{
                        background: selected ? 'var(--color-blue-bg2, #F5F7FF)' : 'transparent',
                        opacity: dim ? 0.5 : 1,
                      }}>
                    <td className="px-2.5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="relative">
                          {v.avatar_url ? (
                            <img src={v.avatar_url} alt={v.name}
                                 className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <span className="w-8 h-8 rounded-full inline-flex items-center justify-center font-bold text-[11px] text-white"
                                  style={{ background: v.color || '#5B7CF5' }}>
                              {initials(v.name)}
                            </span>
                          )}
                          {idx < 3 && vendor === 'all' && range !== 'max' && revenue > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[9px] font-extrabold flex items-center justify-center ring-2 ring-white"
                                  style={{ background: idx === 0 ? '#EAB308' : idx === 1 ? '#9CA3AF' : '#F97316' }}>
                              {idx + 1}
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="text-[12.5px] font-semibold">{v.name || '—'}</div>
                          <div className="text-[10px] text-text3">{v.role || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2.5 py-3 text-right">
                      <div className="text-[12.5px] font-bold tabular-nums">{(v.contacts || 0).toLocaleString('es-AR')}</div>
                    </td>
                    <td className="px-2.5 py-3 text-right">
                      <div className="text-[12.5px] font-semibold tabular-nums">{v.calls || 0}</div>
                    </td>
                    <td className="px-2.5 py-3 text-right">
                      <div className="text-[12.5px] font-semibold tabular-nums">{v.proposals || 0}</div>
                    </td>
                    <td className="px-2.5 py-3 text-right">
                      <div className="text-[12.5px] font-bold tabular-nums" style={{ color: '#16A34A' }}>{v.won || 0}</div>
                    </td>
                    <td className="px-2.5 py-3 text-right">
                      <span className="text-[11.5px] font-bold tabular-nums px-2 py-0.5 rounded-md"
                            style={{ background: convColor.bg, color: convColor.fg }}>
                        {((v.convRate || 0) * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-2.5 py-3 text-right">
                      <div className="text-[12px] font-semibold tabular-nums">{fmtMoney(v.pipeline)}</div>
                    </td>
                    <td className="px-2.5 py-3 text-right">
                      <div className="text-[13px] font-bold tabular-nums">{fmtMoney(v.revenue)}</div>
                      <div className="text-[10px] text-text3 tabular-nums">avg {fmtMoney(v.avg_deal)}</div>
                    </td>
                    <td className="px-2.5 py-3 min-w-[130px]">
                      {target > 0 ? (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-[6px] bg-surface2 rounded-full overflow-hidden">
                              <div className="h-full rounded-full"
                                   style={{
                                     width: Math.min(100, pct) + '%',
                                     background: reached ? '#22C55E' : pct >= 70 ? '#5B7CF5' : '#F97316',
                                   }} />
                            </div>
                            <span className="text-[10.5px] font-bold tabular-nums min-w-[30px] text-right"
                                  style={{ color: reached ? '#16A34A' : 'var(--color-text2)' }}>
                              {Math.round(pct)}%
                            </span>
                          </div>
                          <div className="text-[10px] text-text3 mt-0.5 tabular-nums">meta {fmtMoney(target)}</div>
                        </>
                      ) : (
                        <span className="text-[10.5px] text-text3">Sin meta cargada</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {vendor !== 'all' && (
        <div className="m-3 px-3 py-2 bg-blue-bg2 rounded-lg text-[11px] text-text2 flex items-center gap-2">
          <span>
            Filtro activo: viendo solo a{' '}
            <b className="text-blue">{rows.find((r) => r.user_id === vendor)?.name || '—'}</b>.
          </span>
          <button onClick={() => onVendorClick && onVendorClick('all')}
                  className="ml-auto inline-flex items-center gap-1 bg-white border border-border rounded-md px-2 py-1 text-[11px] font-medium hover:bg-surface2 cursor-pointer">
            <X size={11} /> Quitar filtro
          </button>
        </div>
      )}
    </div>
  );
}
