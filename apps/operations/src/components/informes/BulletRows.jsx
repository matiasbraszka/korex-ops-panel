import { useRef } from 'react';
import { X, GripVertical, Plus, CheckCircle2, Circle } from 'lucide-react';

// BulletRows — lista editable de bullets para los informes.
// Cada bullet: { text, category: 'entregable' | 'avance' | null }.
// El padre maneja todo el estado; este componente solo emite cambios.
//
// UX:
// - Cada fila: drag handle + chip de categoria + input de texto + boton X.
// - Default al agregar: category=null (sin elegir) para forzar decision.
// - Drag & drop nativo (mismo patron que NotasView).
// - Texto vacio se filtra al guardar (no es bug).

export default function BulletRows({ bullets, onChange, disabled = false }) {
  const dragIdx = useRef(null);
  const overIdx = useRef(null);

  const update = (idx, patch) => {
    const next = bullets.map((b, i) => i === idx ? { ...b, ...patch } : b);
    onChange(next);
  };

  const remove = (idx) => {
    onChange(bullets.filter((_, i) => i !== idx));
  };

  const add = () => {
    onChange([...(bullets || []), { text: '', category: null }]);
  };

  const handleDragStart = (e, idx) => {
    if (disabled) return;
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch {}
  };
  const handleDragOver = (e, idx) => {
    e.preventDefault();
    overIdx.current = idx;
  };
  const handleDrop = (e) => {
    e.preventDefault();
    const from = dragIdx.current;
    const to = overIdx.current;
    dragIdx.current = null;
    overIdx.current = null;
    if (from == null || to == null || from === to) return;
    const next = [...bullets];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      {(bullets || []).map((b, i) => {
        const isEntregable = b.category === 'entregable';
        const isAvance = b.category === 'avance';
        const needsCategory = b.text.trim() && !b.category;
        return (
          <div
            key={i}
            draggable={!disabled}
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={handleDrop}
            onDragEnd={() => { dragIdx.current = null; overIdx.current = null; }}
            className={`group flex items-start gap-1.5 rounded-md p-1 ${needsCategory ? 'bg-amber-50/40' : ''}`}
          >
            <button
              type="button"
              tabIndex={-1}
              className="mt-1.5 text-gray-300 hover:text-gray-500 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
              title="Arrastrar para reordenar"
            >
              <GripVertical size={14} />
            </button>

            <div className="flex shrink-0 gap-1 mt-0.5">
              <button
                type="button"
                onClick={() => update(i, { category: isEntregable ? null : 'entregable' })}
                disabled={disabled}
                title="Entregable: trabajo terminado y entregado"
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] font-semibold border transition-colors ${
                  isEntregable
                    ? 'bg-green-100 border-green-300 text-green-800'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-green-300 hover:text-green-700'
                }`}
              >
                {isEntregable ? <CheckCircle2 size={11} /> : <Circle size={11} />}
                Entregable
              </button>
              <button
                type="button"
                onClick={() => update(i, { category: isAvance ? null : 'avance' })}
                disabled={disabled}
                title="Avance: trabajo en proceso"
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] font-semibold border transition-colors ${
                  isAvance
                    ? 'bg-blue-100 border-blue-300 text-blue-800'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-700'
                }`}
              >
                {isAvance ? <CheckCircle2 size={11} /> : <Circle size={11} />}
                Avance
              </button>
            </div>

            <input
              type="text"
              value={b.text}
              onChange={(e) => update(i, { text: e.target.value })}
              disabled={disabled}
              placeholder="Ej: Terminé el contrato para networkers"
              className={`flex-1 border rounded-md py-1.5 px-2 text-[12.5px] outline-none focus:border-blue-400 transition-colors ${
                needsCategory ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'
              }`}
            />

            <button
              type="button"
              onClick={() => remove(i)}
              disabled={disabled}
              title="Eliminar"
              className="mt-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        disabled={disabled}
        className="flex items-center gap-1.5 text-[11.5px] text-blue-600 hover:text-blue-700 font-semibold py-1 px-1.5 rounded-md hover:bg-blue-50 transition-colors"
      >
        <Plus size={13} /> Agregar bullet
      </button>

      {(bullets || []).some(b => b.text.trim() && !b.category) && (
        <div className="text-[10.5px] text-amber-700 pl-1">
          Hay bullets sin categoría — marcalos como Entregable o Avance.
        </div>
      )}
    </div>
  );
}
