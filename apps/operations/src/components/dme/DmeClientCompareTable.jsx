import { useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { fmtMetric } from '../../lib/dme/format.js';
import { metricTone } from '../../lib/dme/color.js';

const num = (x) => Number(x || 0);
// Suma de dos métricas; queda en blanco si ninguna tiene dato (no muestra 0).
const sum2 = (b, a, c) => (b[a] == null && b[c] == null ? undefined : num(b[a]) + num(b[c]));

// Columnas = mismas métricas del Dashboard, una fila por cliente.
// `toneKey` -> se pinta con el semáforo de esa métrica. `strong` -> negrita.
const COLS = [
  { key: 'cc_pub',   label: 'CashCollect Pub',    kind: 'money', adminOnly: true, get: (b) => b.cashcollect_pub },
  { key: 'cc_set',   label: 'CashCollect Setups', kind: 'money', adminOnly: true, get: (b) => b.cashcollect_setups },
  { key: 'cc_tot',   label: 'CashCollect Total',  kind: 'money', adminOnly: true, strong: true, get: (b) => sum2(b, 'cashcollect_pub', 'cashcollect_setups') },
  { key: 'gasto',    label: 'Gasto total',        kind: 'money', strong: true, get: (b) => sum2(b, 'embudo1_total_gastado', 'embudo2_total_gastado') },
  { key: 'leads',    label: 'Leads totales',      kind: 'int',   get: (b) => b.leads_obtenidos },
  { key: 'cpl',      label: 'CPL promedio',       kind: 'cpl',   toneKey: 'cpl', get: (b) => b.cpl },
  { key: 'usuarios', label: 'Usuarios nuevos',    kind: 'int',   adminOnly: true, get: (b) => b.nuevos_usuarios },
  { key: 'cargas',   label: 'Cargas totales',     kind: 'int',   adminOnly: true, get: (b) => b.cargas_totales_pub },
  { key: 'pct_inv',  label: '% invirtiendo',      kind: 'pct',   adminOnly: true, toneKey: 'pct_activos_con_pub', get: (b) => b.pct_activos_con_pub },
  { key: 'avg_inv',  label: 'AVG inversión',      kind: 'money', adminOnly: true, get: (b) => b.avg_inversion_usuario },
  { key: 'cierres',  label: 'Cierres',            kind: 'int',   get: (b) => b.cierres_total },
];

// Tabla comparativa por cliente para el Dashboard. `rows` = [{ id, name, bag }].
// Encabezados ordenables (para ver qué cliente rinde mejor); click en fila abre
// ese cliente. Las columnas admin-only se ocultan a los no-admins.
export default function DmeClientCompareTable({ rows = [], config, isAdmin, onSelectClient }) {
  const cols = COLS.filter((c) => isAdmin || !c.adminOnly);
  const [sortKey, setSortKey] = useState('cc_tot');
  const [dir, setDir] = useState('desc');

  const col = cols.find((c) => c.key === sortKey) || cols[0];
  const sorted = [...rows].sort((a, b) => {
    const av = Number(col.get(a.bag)); const bv = Number(col.get(b.bag));
    const aok = Number.isFinite(av); const bok = Number.isFinite(bv);
    if (!aok && !bok) return a.name.localeCompare(b.name);
    if (!aok) return 1;  // los vacíos van al fondo
    if (!bok) return -1;
    return dir === 'desc' ? bv - av : av - bv;
  });

  const clickSort = (key) => {
    if (key === sortKey) setDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setDir('desc'); }
  };

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="px-4 pt-3.5 pb-3 border-b border-border flex items-center justify-between gap-2">
        <div>
          <div className="text-[13px] font-bold text-text">Comparativa por cliente</div>
          <div className="text-[10.5px] text-text3 mt-0.5">Tocá un encabezado para ordenar · tocá un cliente para abrir su DME</div>
        </div>
        <ArrowUpDown size={15} className="text-text3 shrink-0" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="text-text3 text-[10px] uppercase tracking-wider bg-surface2/40">
              <th className="text-left font-bold px-3 py-2 sticky left-0 bg-[#FAFBFC] z-10">Cliente</th>
              {cols.map((c) => (
                <th key={c.key} onClick={() => clickSort(c.key)}
                    className={`text-right font-bold px-3 py-2 whitespace-nowrap cursor-pointer select-none hover:text-text ${sortKey === c.key ? 'text-text' : ''}`}>
                  {c.label}{sortKey === c.key ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} onClick={() => onSelectClient?.(r.id)}
                  className="border-t border-[#F1F3F7] hover:bg-blue-bg/40 cursor-pointer">
                <td className="text-left px-3 py-2 text-text font-semibold whitespace-nowrap sticky left-0 bg-white">{r.name}</td>
                {cols.map((c) => {
                  const v = c.get(r.bag);
                  const tone = c.toneKey ? metricTone(c.toneKey, v, config) : null;
                  return (
                    <td key={c.key} className="text-right px-3 py-2 tabular-nums">
                      <span className={`px-1.5 py-0.5 rounded ${c.strong ? 'font-bold' : ''}`}
                            style={tone ? { background: tone.bg, color: tone.fg } : undefined}>
                        {fmtMetric(c.kind, v)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={cols.length + 1} className="text-center text-text3 py-6">Sin datos en el período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
