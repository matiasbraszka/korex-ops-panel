import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import SaveBar from './SaveBar';
import { DEFAULT_DME_CONFIG, CONFIG_BLOQUES, METRIC_BY_KEY } from '../../lib/dme/registry.js';
import { fmtMetric } from '../../lib/dme/format.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
// % y ROI se editan en %, pero se guardan como ratio (0.20 = 20%).
const isRatio = (key) => { const k = METRIC_BY_KEY[key]?.kind; return k === 'pct' || k === 'roi'; };

function ThresholdInput({ keyName, value, onChange }) {
  const ratio = isRatio(keyName);
  const shown = ratio ? Math.round(Number(value) * 1000) / 10 : value;
  return (
    <div className="inline-flex items-center gap-1">
      <input type="number" step={ratio ? '1' : '0.5'} value={shown}
             onChange={(e) => {
               const raw = e.target.value === '' ? 0 : Number(e.target.value);
               onChange(ratio ? raw / 100 : raw);
             }}
             className="w-[68px] text-[12px] text-right border border-gray-200 rounded-md px-1.5 py-1 outline-none focus:border-blue-400 tabular-nums" />
      <span className="text-[10px] text-gray-400">{ratio ? '%' : ''}</span>
    </div>
  );
}

export default function DmeConfigEditor() {
  const { appSettings, updateAppSettings } = useApp();
  const base = () => clone(appSettings?.dme_config || DEFAULT_DME_CONFIG);
  const [draft, setDraft] = useState(base);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(base());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings]);

  const setField = (key, field, val) => {
    setDraft((d) => ({ ...d, [key]: { ...d[key], [field]: val } }));
    setDirty(true);
  };
  const handleSave = () => { updateAppSettings({ dme_config: draft }); setDirty(false); };
  const handleCancel = () => { setDraft(base()); setDirty(false); };

  // Agrupar las metricas configurables por bloque (orden CONFIG_BLOQUES).
  const keysByBloque = {};
  Object.keys(draft).forEach((k) => { const b = draft[k].bloque || 'Otros'; (keysByBloque[b] ||= []).push(k); });
  const bloques = [...CONFIG_BLOQUES.filter((b) => keysByBloque[b]), ...Object.keys(keysByBloque).filter((b) => !CONFIG_BLOQUES.includes(b))];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 relative">
      <div className="mb-3">
        <h2 className="text-[14px] font-bold text-gray-800">Métricas DME · semáforo</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Umbrales de color (verde / amarillo / crítico) por métrica. Se aplican a TODOS los clientes y al Maestro. Solo las métricas activas se pintan.
        </p>
      </div>

      <div className="space-y-5">
        {bloques.map((bloque) => (
          <div key={bloque}>
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">{bloque}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="text-gray-400 text-[10px] uppercase tracking-wider">
                    <th className="text-center font-bold px-2 py-1.5">Activo</th>
                    <th className="text-left font-bold px-2 py-1.5 min-w-[180px]">Métrica</th>
                    <th className="text-left font-bold px-2 py-1.5">Tipo</th>
                    <th className="text-right font-bold px-2 py-1.5">Verde</th>
                    <th className="text-right font-bold px-2 py-1.5">Amarillo</th>
                    <th className="text-right font-bold px-2 py-1.5">Crítico</th>
                    <th className="text-left font-bold px-2 py-1.5">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {keysByBloque[bloque].map((key) => {
                    const cfg = draft[key];
                    const label = METRIC_BY_KEY[key]?.label || key;
                    const kind = METRIC_BY_KEY[key]?.kind || 'num';
                    return (
                      <tr key={key} className="border-t border-gray-100" style={{ opacity: cfg.activo === false ? 0.5 : 1 }}>
                        <td className="text-center px-2 py-1.5">
                          <input type="checkbox" checked={cfg.activo !== false}
                                 onChange={(e) => setField(key, 'activo', e.target.checked)}
                                 className="cursor-pointer w-4 h-4" />
                        </td>
                        <td className="text-left px-2 py-1.5 text-gray-700 whitespace-nowrap">{label}</td>
                        <td className="text-left px-2 py-1.5">
                          <select value={cfg.direction} onChange={(e) => setField(key, 'direction', e.target.value)}
                                  className="text-[11.5px] border border-gray-200 rounded-md px-1.5 py-1 outline-none focus:border-blue-400 bg-white cursor-pointer">
                            <option value="mayor">Mayor es mejor</option>
                            <option value="menor">Menor es mejor</option>
                          </select>
                        </td>
                        <td className="text-right px-2 py-1.5"><ThresholdInput keyName={key} value={cfg.verde} onChange={(v) => setField(key, 'verde', v)} /></td>
                        <td className="text-right px-2 py-1.5"><ThresholdInput keyName={key} value={cfg.amarillo} onChange={(v) => setField(key, 'amarillo', v)} /></td>
                        <td className="text-right px-2 py-1.5"><ThresholdInput keyName={key} value={cfg.critico} onChange={(v) => setField(key, 'critico', v)} /></td>
                        <td className="text-left px-2 py-1.5">
                          <input type="text" value={cfg.notas || ''} onChange={(e) => setField(key, 'notas', e.target.value)}
                                 className="w-full min-w-[160px] text-[11.5px] border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-blue-400" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}
