import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';

const DEFAULT_COLORS = ['#8B5CF6', '#5B7CF5', '#EAB308', '#22C55E', '#9CA3AF', '#EF4444', '#06B6D4', '#EC4899'];

// Fases universales del dashboard. Cada etapa de cada pipeline tiene que
// pertenecer a una de estas 4 categorias para que el dashboard "Todos los CRMs"
// pueda agrupar correctamente.
const BUCKETS = [
  { id: 'inicial',    label: 'Inicial',    color: '#9CA3AF' },
  { id: 'en_proceso', label: 'En proceso', color: '#EAB308' },
  { id: 'por_cerrar', label: 'Por cerrar', color: '#F97316' },
  { id: 'cerrados',   label: 'Cerrados',   color: '#22C55E' },
];

export default function StagesEditorModal({ open, onClose, stages, onAdd, onUpdate, onDelete, onReorder }) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);
  const [newBucket, setNewBucket] = useState('en_proceso');

  if (!open) return null;

  const move = (idx, dir) => {
    const next = [...stages];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onReorder(next.map((s) => s.id));
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await onAdd(newName.trim(), newColor, newBucket);
    setNewName('');
    setNewColor(DEFAULT_COLORS[0]);
    setNewBucket('en_proceso');
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-border">
          <h2 className="text-[15px] font-bold">Editar columnas del Kanban</h2>
          <p className="text-xs text-text3 mt-1">Agregá, renombrá, reordená o eliminá las etapas del pipeline.</p>
        </div>
        <div className="p-5 space-y-2">
          <div className="text-[10.5px] text-text3 mb-1">
            Cada etapa pertenece a una <b>fase universal</b> que el dashboard usa para sumar todos los CRMs.
          </div>
          {stages.map((s, idx) => (
            <div key={s.id} className="flex items-center gap-2 py-2 border border-border rounded-md px-3">
              <div className="flex flex-col gap-0.5">
                <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0}
                        className="text-[9px] text-text3 hover:text-text disabled:opacity-30">▲</button>
                <button type="button" onClick={() => move(idx, +1)} disabled={idx === stages.length - 1}
                        className="text-[9px] text-text3 hover:text-text disabled:opacity-30">▼</button>
              </div>
              <input type="color" value={s.color} onChange={(e) => onUpdate(s.id, { color: e.target.value })}
                     className="w-7 h-7 rounded cursor-pointer border-0" />
              <input value={s.name} onChange={(e) => onUpdate(s.id, { name: e.target.value })}
                     className="flex-1 bg-transparent outline-none text-[13px] py-1" />
              <select value={s.bucket || 'en_proceso'}
                      onChange={(e) => onUpdate(s.id, { bucket: e.target.value })}
                      title="Fase universal del dashboard"
                      className="text-[11px] border border-border rounded px-1.5 py-1 bg-white outline-none cursor-pointer">
                {BUCKETS.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
              <button type="button" onClick={() => onDelete(s.id)}
                      className="text-text3 hover:text-red p-1">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="p-5 border-t border-border space-y-2">
          <label className="block text-xs font-semibold text-text2 mb-1">Nueva etapa</label>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
                   className="w-8 h-8 rounded cursor-pointer border-0" />
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
                   placeholder="Nombre de la etapa"
                   className="flex-1 min-w-[140px] bg-bg border border-border rounded-md py-[9px] px-3 text-[13px] outline-none focus:border-blue" />
            <select value={newBucket} onChange={(e) => setNewBucket(e.target.value)}
                    className="text-[12px] border border-border rounded-md py-2 px-2 bg-white outline-none cursor-pointer">
              {BUCKETS.map((b) => (
                <option key={b.id} value={b.id}>Fase: {b.label}</option>
              ))}
            </select>
            <button type="button" onClick={handleAdd}
                    className="py-2 px-3 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark flex items-center gap-1">
              <Plus size={14} /> Agregar
            </button>
          </div>
        </div>
        <div className="p-5 border-t border-border flex justify-end">
          <button onClick={onClose} className="py-2 px-4 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark">
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
