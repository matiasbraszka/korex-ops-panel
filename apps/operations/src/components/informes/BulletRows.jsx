import { useRef } from 'react';
import { X, GripVertical, Plus, CheckCircle2, Circle } from 'lucide-react';
import MentionTextarea from '../comments/MentionTextarea';
import { useApp } from '../../context/AppContext';
import { parseAssignees } from '../../utils/taskActivity';

// BulletRows — lista editable de bullets para los informes.
// Cada bullet: { id?, text, category: 'entregable' | 'avance' | null, task_id? }.
//
// UX:
// - Cada fila: drag handle + chips de categoria + input de texto + boton X.
// - Default al agregar: category=null (sin elegir) para forzar decision.
// - Drag & drop nativo (mismo patron que NotasView).
// - Texto vacio se filtra al guardar (no es bug).
//
// Prop enableTaskLink:
// - true  (diario): debajo de cada bullet hay un dropdown 'Vinculada a tarea'
//   con opciones 'Otra' (default) + tareas pendientes mias del cliente.
// - false (semanal): no aparece nada del flujo de tareas.
//
// Tareas done nunca aparecen en el dropdown.

export default function BulletRows({ bullets, onChange, disabled = false, clientId = null, isInternal = false, internalTaskClientId = null, enableTaskLink = false }) {
  const { teamMembers, currentUser, tasks } = useApp();
  const dragIdx = useRef(null);
  const overIdx = useRef(null);

  // Mostramos el desplegable tanto para clientes reales como para el trabajo
  // interno de la empresa ("Korex – Interno").
  const showTaskLink = enableTaskLink && (isInternal || !!clientId);

  // Solo las tareas ASIGNADAS al usuario que carga el informe.
  // No mostramos tareas de otros miembros aunque sean del mismo cliente.
  // Se incluyen TODOS los estados menos "done" (backlog, en progreso, pausada,
  // bloqueada, en revision, retrasada).
  const myNames = (() => {
    if (!currentUser) return new Set();
    return new Set([
      (currentUser.name || '').toLowerCase(),
      ((currentUser.name || '').split(' ')[0] || '').toLowerCase(),
      currentUser.id,
    ].filter(Boolean));
  })();
  const isMine = (task) => {
    const parts = parseAssignees(task.assignee).map(s => s.toLowerCase());
    return parts.some(p => myNames.has(p));
  };
  // Para "Korex – Interno": las tareas de la empresa viven bajo el cliente
  // "Empresa (Korex)" (internalTaskClientId), no con client_id null. Por eso
  // incluimos ese cliente ademas de las tareas sin cliente.
  const belongsToScope = (t) => {
    if (isInternal) return t.clientId == null || (internalTaskClientId && t.clientId === internalTaskClientId);
    return t.clientId === clientId;
  };
  const pendingTasksForClient = (() => {
    if (!showTaskLink) return [];
    return (tasks || [])
      .filter(t => belongsToScope(t) && t.status !== 'done' && isMine(t))
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  })();

  const tasksById = Object.fromEntries(pendingTasksForClient.map(t => [t.id, t]));

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
        // Si el bullet tiene task_id pero la tarea no esta en pending (fue
        // done o eliminada), tratamos como "Otra" en el select.
        const linkedTask = b.task_id ? tasksById[b.task_id] : null;
        const selectValue = linkedTask ? b.task_id : '';
        return (
          <div
            key={i}
            draggable={!disabled}
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={handleDrop}
            onDragEnd={() => { dragIdx.current = null; overIdx.current = null; }}
            className={`group flex items-start gap-1.5 rounded-md p-1 transition-colors ${
              needsCategory ? 'bg-amber-50/40' : ''
            }`}
          >
            <button
              type="button"
              tabIndex={-1}
              className="mt-1.5 text-gray-300 hover:text-gray-500 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              title="Arrastrar para reordenar"
            >
              <GripVertical size={14} />
            </button>

            <div className="flex shrink-0 gap-1 mt-0.5">
              <button
                type="button"
                onClick={() => update(i, isEntregable ? { category: null, complete_task: undefined } : { category: 'entregable' })}
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

            <div className="flex-1 min-w-0 space-y-1">
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

              {/* Selector de tarea — solo informes diarios con cliente real */}
              {showTaskLink && (
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-[10.5px] text-gray-500 font-medium">Vinculada a tarea:</label>
                  <select
                    value={selectValue}
                    onChange={(e) => update(i, { task_id: e.target.value || null })}
                    disabled={disabled}
                    className={`text-[11.5px] py-0.5 px-1.5 border rounded-md outline-none bg-white focus:border-blue-400 max-w-[260px] truncate ${
                      selectValue ? 'border-blue-300 text-blue-700 bg-blue-50/40 font-medium' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    <option value="">Otra</option>
                    {pendingTasksForClient.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                  {linkedTask && isEntregable && (
                    <span className="inline-flex items-center gap-1.5 text-[10.5px]">
                      <span className="text-gray-500 font-medium">¿Completar la tarea?</span>
                      <button
                        type="button"
                        onClick={() => update(i, { complete_task: true })}
                        className={`px-2 py-0.5 rounded-full font-semibold border transition-colors ${
                          b.complete_task === true
                            ? 'bg-green-100 border-green-300 text-green-800'
                            : 'bg-white border-gray-200 text-gray-500 hover:border-green-300 hover:text-green-700'
                        }`}
                      >Sí</button>
                      <button
                        type="button"
                        onClick={() => update(i, { complete_task: false })}
                        className={`px-2 py-0.5 rounded-full font-semibold border transition-colors ${
                          b.complete_task === false
                            ? 'bg-gray-200 border-gray-300 text-gray-700'
                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        }`}
                      >No</button>
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
              className="mt-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
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
