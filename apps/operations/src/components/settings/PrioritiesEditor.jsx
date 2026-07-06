import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import SaveBar from './SaveBar';

// Prioridades por defecto (solo se usan si app_settings todavía no tiene nada).
const DEFAULTS = [
  { key: 1, label: 'SUPER PRIORITARIO', color: '#EF4444', hidden: false },
  { key: 2, label: 'IMPORTANTES',       color: '#F97316', hidden: false },
  { key: 3, label: 'NORMAL',            color: '#22C55E', hidden: false },
  { key: 4, label: 'POCO IMPORTANTES',  color: '#9CA3AF', hidden: false },
  { key: 5, label: 'NUEVOS',            color: '#8B5CF6', hidden: false },
  { key: 6, label: 'DESCARTADOS',       color: '#6B7280', hidden: true  },
];

// Convierte el objeto priority_labels (keyed por slot) en un array ordenado de
// filas editables. Retrocompat: si ningún slot define `hidden`, se marca como
// descartado el slot 6 (la regla vieja).
function toRows(labels) {
  if (!labels || !Object.keys(labels).length) return DEFAULTS.map(r => ({ ...r }));
  const anyHidden = Object.values(labels).some(v => v && typeof v.hidden === 'boolean');
  return Object.entries(labels)
    .map(([k, v]) => ({
      key: Number(k),
      label: v?.label ?? `Prioridad ${k}`,
      color: v?.color ?? '#9CA3AF',
      hidden: anyHidden ? !!v?.hidden : (Number(k) === 6),
      order: (v && typeof v.order === 'number') ? v.order : Number(k),
    }))
    .sort((a, b) => (a.order - b.order) || (a.key - b.key));
}

export default function PrioritiesEditor() {
  const { appSettings, updateAppSettings, clients } = useApp();
  const [rows, setRows] = useState(() => toRows(appSettings?.priority_labels));
  const [dirty, setDirty] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // key con borrado pendiente de confirmar

  useEffect(() => {
    if (!dirty) setRows(toRows(appSettings?.priority_labels));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings]);

  // Cuántos clientes tiene cada prioridad asignada (para avisar antes de borrar).
  const countByPrio = useMemo(() => {
    const m = {};
    for (const c of (clients || [])) {
      const p = c.priority || 5;
      m[p] = (m[p] || 0) + 1;
    }
    return m;
  }, [clients]);

  const markDirty = () => setDirty(true);

  const updateRow = (idx, patch) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    markDirty();
  };
  const move = (idx, dir) => {
    setConfirmDel(null);
    setRows(prev => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    markDirty();
  };
  const addRow = () => {
    setConfirmDel(null);
    setRows(prev => {
      const maxKey = prev.reduce((m, r) => Math.max(m, r.key), 0);
      return [...prev, { key: maxKey + 1, label: 'NUEVA PRIORIDAD', color: '#9CA3AF', hidden: false }];
    });
    markDirty();
  };
  const doRemove = (idx) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
    setConfirmDel(null);
    markDirty();
  };
  const requestRemove = (row, idx) => {
    if (rows.length <= 1) return; // siempre queda al menos una prioridad
    const n = countByPrio[row.key] || 0;
    if (n > 0) { setConfirmDel(row.key); return; } // pide confirmación si hay clientes
    doRemove(idx);
  };

  const handleSave = () => {
    const labels = {};
    rows.forEach((r, i) => {
      labels[r.key] = {
        label: (r.label || '').trim() || `Prioridad ${r.key}`,
        color: r.color,
        order: i,
        hidden: !!r.hidden,
      };
    });
    updateAppSettings({ priority_labels: labels });
    setDirty(false);
    setConfirmDel(null);
  };
  const handleCancel = () => {
    setRows(toRows(appSettings?.priority_labels));
    setDirty(false);
    setConfirmDel(null);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[640px] relative">
      <div className="mb-3">
        <h2 className="text-[14px] font-bold text-gray-800">Etiquetas de prioridad</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Renombrá los niveles de prioridad de cada cliente, ajustá sus colores, y agregá o borrá los que necesites.
          El orden (de arriba hacia abajo) es el rango: la de más arriba es la más prioritaria.
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((row, idx) => {
          const label = row.label || '';
          const isConfirming = confirmDel === row.key;
          const clientCount = countByPrio[row.key] || 0;
          return (
            <div key={row.key} className={`rounded-lg ${isConfirming ? 'bg-red-50 ring-1 ring-red-200 p-2 -mx-1' : ''}`}>
              <div className="flex items-center gap-2">
                {/* Reordenar (rango) */}
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    title="Subir prioridad"
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:hover:text-gray-300 disabled:cursor-default cursor-pointer leading-none"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={idx === rows.length - 1}
                    title="Bajar prioridad"
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:hover:text-gray-300 disabled:cursor-default cursor-pointer leading-none"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>

                <span className="text-[11px] font-bold text-gray-400 w-4 text-center">{idx + 1}</span>

                <input
                  type="color"
                  value={row.color}
                  onChange={(e) => updateRow(idx, { color: e.target.value })}
                  className="w-8 h-8 rounded-md border border-gray-200 cursor-pointer p-0 bg-white shrink-0"
                  title="Color"
                />

                <input
                  type="text"
                  value={label}
                  onChange={(e) => updateRow(idx, { label: e.target.value })}
                  placeholder="Nombre de la prioridad"
                  className={`flex-1 min-w-0 border border-gray-200 rounded-md py-1.5 px-2.5 text-[13px] font-sans outline-none focus:border-blue-400 ${row.hidden ? 'text-gray-400' : ''}`}
                />

                {/* Preview del badge */}
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase whitespace-nowrap max-w-[130px] truncate shrink-0"
                  style={{ background: row.color + '18', color: row.color }}
                  title={label}
                >
                  {label || '—'}
                </span>

                {/* Marcar como descartada (se oculta de la lista y no cuenta como activo) */}
                <button
                  type="button"
                  onClick={() => updateRow(idx, { hidden: !row.hidden })}
                  title={row.hidden ? 'Descartada: oculta de la lista y no cuenta como cliente activo. Click para reactivar.' : 'Marcar como descartada (se oculta de la lista y no cuenta como activo)'}
                  className={`shrink-0 cursor-pointer rounded-md p-1 border ${row.hidden ? 'text-gray-500 border-gray-300 bg-gray-100' : 'text-gray-300 border-transparent hover:text-gray-500 hover:border-gray-200'}`}
                >
                  {row.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>

                {/* Borrar */}
                <button
                  type="button"
                  onClick={() => requestRemove(row, idx)}
                  disabled={rows.length <= 1}
                  title={rows.length <= 1 ? 'Tiene que quedar al menos una prioridad' : 'Borrar prioridad'}
                  className="shrink-0 cursor-pointer rounded-md p-1 border border-transparent text-gray-300 hover:text-red-500 hover:border-red-200 disabled:opacity-30 disabled:hover:text-gray-300 disabled:hover:border-transparent disabled:cursor-default"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Confirmación de borrado cuando hay clientes asignados */}
              {isConfirming && (
                <div className="flex items-center gap-2 mt-1.5 pl-1 flex-wrap">
                  <span className="text-[11px] text-red-600">
                    {clientCount} {clientCount === 1 ? 'cliente tiene' : 'clientes tienen'} esta prioridad. Al borrarla, {clientCount === 1 ? 'queda' : 'quedan'} <b>Sin prioridad</b> hasta que {clientCount === 1 ? 'lo reasignes' : 'los reasignes'}.
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmDel(null)}
                      className="py-1 px-2.5 text-[11px] text-gray-600 hover:text-gray-800 bg-white border border-gray-200 rounded-md cursor-pointer font-sans"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => doRemove(idx)}
                      className="py-1 px-2.5 text-[11px] font-semibold text-white bg-red-500 hover:bg-red-600 border-none rounded-md cursor-pointer font-sans"
                    >
                      Borrar igual
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="mt-3 inline-flex items-center gap-1.5 py-1.5 px-3 text-[12px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md cursor-pointer font-sans"
      >
        <Plus size={14} /> Agregar prioridad
      </button>

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}
