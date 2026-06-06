import { useRef } from 'react';
import { X, GripVertical, Plus, CheckCircle2, Circle, Link2 } from 'lucide-react';
import MentionTextarea from '../comments/MentionTextarea';
import { useApp } from '../../context/AppContext';
import { parseAssignees } from '../../utils/taskActivity';

// BulletRows — lista editable de bullets para los informes.
// Cada bullet: { text, category: 'entregable' | 'avance' | null, task_id? }.
// El padre maneja todo el estado; este componente solo emite cambios.
//
// UX:
// - Cada fila: drag handle + chip de categoria + input de texto + boton X.
// - Default al agregar: category=null (sin elegir) para forzar decision.
// - Drag & drop nativo (mismo patron que NotasView).
// - Texto vacio se filtra al guardar (no es bug).
// - Si se pasa clientId, se habilita un selector opcional "Vincular tarea"
//   con las tareas pendientes del autor del informe para ese cliente.

export default function BulletRows({ bullets, onChange, disabled = false, clientId = null }) {
  const { teamMembers, currentUser, tasks } = useApp();

  // Tareas pendientes mias con este cliente (para el selector "Vincular tarea").
  // Reusa el patron de TasksPage: assignee es CSV; matchea por nombre o id.
  const myPendingTasks = (() => {
    if (!clientId || !currentUser) return [];
    const myNames = new Set([
      (currentUser.name || '').toLowerCase(),
      ((currentUser.name || '').split(' ')[0] || '').toLowerCase(),
      currentUser.id,
    ].filter(Boolean));
    return (tasks || []).filter(t => {
      if (t.clientId !== clientId) return false;
      if (t.status === 'done') return false;
      const parts = parseAssignees(t.assignee).map(s => s.toLowerCase());
      return parts.some(p => myNames.has(p));
    });
  })();
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

            <div className="flex-1 space-y-1">
              <MentionTextarea
                singleLine
                value={b.text}
                onChange={(v) => update(i, { text: v })}
                disabled={disabled}
                teamMembers={teamMembers || []}
                excludeId={currentUser?.id}
                placeholder="Ej: Terminé el contrato. Etiquetá con @ si necesitás algo de alguien."
                className={`w-full border rounded-md py-1.5 px-2 text-[12.5px] outline-none focus:border-blue-400 transition-colors ${
                  needsCategory ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'
                }`}
              />
              {clientId && myPendingTasks.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Link2 size={11} className="text-gray-400 shrink-0" />
                  <select
                    value={b.task_id || ''}
                    onChange={(e) => update(i, { task_id: e.target.value || null })}
                    disabled={disabled}
                    className={`text-[11px] py-0.5 px-1.5 border rounded-md outline-none bg-white text-gray-600 focus:border-blue-400 max-w-full truncate ${
                      b.task_id ? 'border-blue-200 bg-blue-50/40 text-blue-700 font-semibold' : 'border-gray-200'
                    }`}
                    title={b.task_id ? 'Tarea vinculada' : 'Vincular este bullet a una de tus tareas pendientes'}
                  >
                    <option value="">Sin vincular tarea</option>
                    {myPendingTasks.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                  {b.task_id && isEntregable && (
                    <span className="text-[10px] text-green-700 font-semibold inline-flex items-center gap-0.5">
                      <CheckCircle2 size={10} /> Al guardar marca la tarea como completada
                    </span>
                  )}
                </div>
              )}
            </div>

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
