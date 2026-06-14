import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import DmeCell from './DmeCell.jsx';
import { metricTone } from '../../lib/dme/color.js';

// Tabla grande del DME. Filas = metricas agrupadas por seccion; columnas = dias /
// semanas / meses + una columna final TOTAL/SNAPSHOT.
//   - primera columna (metrica) congelada (sticky left)
//   - header congelado (sticky top)
//   - secciones colapsables
//   - celdas con semaforo segun la config
// Props:
//   sections : SECTIONS (del registry)
//   columns  : [{ key, label, title, bag }]  bag = { metricKey: value }
//   totalCol : { key, label, bag } | null
//   config   : config de umbrales resuelta
//   onCellClick(columnKey, metric) : opcional (para editar un dia)
export default function DmeMetricTable({ sections, columns, totalCol, config, onCellClick }) {
  const [collapsed, setCollapsed] = useState({});
  const toggle = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  const colCount = 1 + columns.length + (totalCol ? 1 : 0);

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="overflow-auto" style={{ maxHeight: '72vh' }}>
        <table className="text-[12px] border-collapse min-w-full">
          <thead>
            <tr className="text-text3 text-[10px] uppercase tracking-wider">
              <th className="text-left font-bold px-3 py-2 sticky left-0 top-0 z-30 bg-white border-b border-border min-w-[230px]">
                Métrica
              </th>
              {columns.map((c) => (
                <th key={c.key} title={c.title}
                    className="text-right font-bold px-2.5 py-2 sticky top-0 z-20 bg-white border-b border-l border-[#F1F3F7] whitespace-nowrap">
                  {c.label}
                </th>
              ))}
              {totalCol && (
                <th className="text-right font-bold px-2.5 py-2 sticky top-0 right-0 z-20 bg-[#F8FAFC] border-b border-l border-border whitespace-nowrap">
                  {totalCol.label}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => {
              const isCollapsed = collapsed[sec.id];
              return (
                <Fragment key={sec.id}>
                  <tr onClick={() => toggle(sec.id)} className="cursor-pointer select-none">
                    <td className="sticky left-0 z-10 bg-surface2 px-3 py-1.5 font-bold text-[10.5px] uppercase tracking-wider text-text2 border-b border-border whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                        {sec.title}
                      </span>
                    </td>
                    <td colSpan={colCount - 1} className="bg-surface2 border-b border-border" />
                  </tr>
                  {!isCollapsed && sec.metrics.map((m) => (
                    <tr key={m.key} className="border-b border-[#F1F3F7] hover:bg-surface2/40">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap text-text" title={m.help || undefined}>
                        <span className={`${m.type === 'derived' ? 'text-text2' : 'text-text'} ${m.help ? 'border-b border-dotted border-text3/50 cursor-help' : ''}`}>
                          {m.label}
                        </span>
                        {m.type === 'derived' && <span className="ml-1.5 text-[9px] text-text3">(auto)</span>}
                      </td>
                      {columns.map((c) => {
                        const v = c.bag[m.key];
                        return (
                          <DmeCell
                            key={c.key}
                            kind={m.kind}
                            value={v}
                            tone={metricTone(m.key, v, config)}
                            clickable={!!onCellClick}
                            onClick={onCellClick ? () => onCellClick(c.key, m) : undefined}
                          />
                        );
                      })}
                      {totalCol && (
                        <DmeCell
                          kind={m.kind}
                          value={totalCol.bag[m.key]}
                          tone={metricTone(m.key, totalCol.bag[m.key], config)}
                          bold
                        />
                      )}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
