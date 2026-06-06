import { useRef, useState } from 'react';
import { X, GripVertical, Plus, CheckCircle2, Circle, Link2, ChevronDown, Sparkles } from 'lucide-react';
import MentionTextarea from '../comments/MentionTextarea';
import { useApp } from '../../context/AppContext';
import { parseAssignees } from '../../utils/taskActivity';

// BulletRows — lista editable de bullets para los informes.
// Cada bullet: { id?, text, category: 'entregable' | 'avance' | null, task_id? }.
// El padre maneja todo el estado; este componente solo emite cambios.
//
// UX:
// - Cada fila: drag handle + chips de categoria + input de texto + boton X.
// - Default al agregar: category=null (sin elegir) para forzar decision.
// - Drag & drop nativo (mismo patron que NotasView).
// - Texto vacio se filtra al guardar (no es bug).
// - Si se pasa clientId, se habilita el flujo de "vincular tarea":
//     * Boton "Cargar mis pendientes" arriba (atajo): inserta un bullet por
//       cada tarea pendiente mia, prerellenado con el titulo y task_id.
//     * En cada bullet, debajo del input, "+ Vincular tarea" o un chip con
//       la tarea ya vinculada (con boton X para desvincular).
//     * Si el bullet esta marcado entregable Y tiene task_id, hint verde:
//       "Al guardar se marca la tarea como completada".

export default function BulletRows({ bullets, onChange, disabled = false, clientId = null }) {
  const { teamMembers, currentUser, tasks } = useApp();
  const dragIdx = useRef(null);
  const overIdx = useRef(null);
  const [taskPickerOpenForIdx, setTaskPickerOpenForIdx] = useState(null);

  // Tareas mias con este cliente. Incluimos las completadas (done) para que
  // el usuario pueda igual dejar un avance/entregable sobre algo ya cerrado.
  // Pending primero, done despues; visualmente diferenciadas por status.
  const myTasksForClient = (() => {
    if (!clientId || !currentUser) return [];
    const myNames = new Set([
      (currentUser.name || '').toLowerCase(),
      ((currentUser.name || '').split(' ')[0] || '').toLowerCase(),
      currentUser.id,
    ].filter(Boolean));
    const mine = (tasks || []).filter(t => {
      if (t.clientId !== clientId) return false;
      const parts = parseAssignees(t.assignee).map(s => s.toLowerCase());
      return parts.some(p => myNames.has(p));
    });
    return mine.sort((a, b) => {
      const aDone = a.status === 'done' ? 1 : 0;
      const bDone = b.status === 'done' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return (a.title || '').localeCompare(b.title || '');
    });
  })();
  // Alias por compatibilidad con el resto del componente.
  const myPendingTasks = myTasksForClient.filter(t => t.status !== 'done');

  // task_ids ya vinculados en la lista actual (para no repetir el atajo).
  const linkedTaskIds = new Set((bullets || []).map(b => b?.task_id).filter(Boolean));
  // Incluye tareas done para que un bullet ya vinculado a una tarea cerrada
  // pueda seguir mostrando su chip y permitir desvincular.
  const tasksById = Object.fromEntries(myTasksForClient.map(t => [t.id, t]));

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

  // Atajo: insertar un bullet por cada tarea pendiente mia que no este ya
  // vinculada en la lista actual. Si todas estan vinculadas, no agrega nada.
  const addAllMyPending = () => {
    const news = myPendingTasks
      .filter(t => !linkedTaskIds.has(t.id))
      .map(t => ({ text: '', category: null, task_id: t.id }));
    if (news.length === 0) return;
    onChange([...(bullets || []), ...news]);
  };
  const pendingPickableCount = myPendingTasks.filter(t => !linkedTaskIds.has(t.id)).length;

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
      {/* Atajo: cargar mis pendientes con este cliente. Solo cuando clientId
          fue pasado y hay tareas no vinculadas todavia. */}
      {clientId && pendingPickableCount > 0 && (
        <button
          type="button"
          onClick={addAllMyPending}
          disabled={disabled}
          className="w-full flex items-center justify-between gap-2 text-[11.5px] text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-3 py-1.5 cursor-pointer font-sans transition-colors"
          title="Inserta un bullet vinculado por cada tarea pendiente tuya con este cliente"
        >
          <span className="flex items-center gap-1.5">
            <Sparkles size={13} />
            <span className="font-semibold">Cargar mis tareas pendientes</span>
            <span className="text-blue-500">({pendingPickableCount})</span>
          </span>
          <span className="text-blue-400 text-[10px]">Las podes editar o quitar despues</span>
        </button>
      )}

      {(bullets || []).map((b, i) => {
        const isEntregable = b.category === 'entregable';
        const isAvance = b.category === 'avance';
        const needsCategory = b.text.trim() && !b.category;
        const linkedTask = b.task_id ? tasksById[b.task_id] : null;
        const pickerOpen = taskPickerOpenForIdx === i;
        // Mostramos SIEMPRE todas mis tareas del cliente (pending + done).
        // Sin filtrar las ya vinculadas: una misma tarea puede tener avances
        // en varios bullets (ej: avance + entregable mas tarde).
        const pickableForThisBullet = myTasksForClient;
        return (
          <div
            key={i}
            draggable={!disabled}
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={handleDrop}
            onDragEnd={() => { dragIdx.current = null; overIdx.current = null; }}
            className={`group flex items-start gap-1.5 rounded-md p-1.5 transition-colors ${
              needsCategory ? 'bg-amber-50/40' : ''
            } ${linkedTask ? 'bg-blue-50/30 ring-1 ring-blue-100' : ''}`}
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

            <div className="flex-1 min-w-0 space-y-1">
              <MentionTextarea
                singleLine
                value={b.text}
                onChange={(v) => update(i, { text: v })}
                disabled={disabled}
                teamMembers={teamMembers || []}
                excludeId={currentUser?.id}
                placeholder={linkedTask
                  ? `Avance sobre "${linkedTask.title}"...`
                  : "Ej: Terminé el contrato. Etiquetá con @ si necesitás algo de alguien."
                }
                className={`w-full border rounded-md py-1.5 px-2 text-[12.5px] outline-none focus:border-blue-400 transition-colors ${
                  needsCategory ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'
                }`}
              />

              {/* Linea de vinculacion con tarea — solo cuando hay clientId */}
              {clientId && (
                <div className="flex items-center gap-2 flex-wrap">
                  {linkedTask ? (
                    <span className="inline-flex items-center gap-1.5 bg-blue-100 border border-blue-200 text-blue-800 text-[11px] rounded-full pl-2 pr-1 py-0.5 max-w-full">
                      <Link2 size={11} className="shrink-0" />
                      <span className="font-semibold truncate max-w-[280px]" title={linkedTask.title}>
                        {linkedTask.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => update(i, { task_id: null })}
                        disabled={disabled}
                        title="Desvincular"
                        className="ml-0.5 w-4 h-4 rounded-full bg-blue-200 hover:bg-blue-300 text-blue-800 border-none cursor-pointer flex items-center justify-center"
                      >
                        <X size={9} />
                      </button>
                    </span>
                  ) : (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setTaskPickerOpenForIdx(pickerOpen ? null : i)}
                        disabled={disabled}
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:bg-blue-50 border border-blue-200 bg-white rounded-full px-2 py-0.5 cursor-pointer font-sans transition-colors"
                        title="Vincular este bullet a una tarea pendiente tuya"
                      >
                        <Link2 size={10} />
                        Vincular tarea
                        <ChevronDown size={10} className={pickerOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                      </button>
                      {pickerOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-[60]"
                            onClick={() => setTaskPickerOpenForIdx(null)}
                          />
                          <div className="absolute z-[61] mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[220px] overflow-y-auto min-w-[280px]">
                            {pickableForThisBullet.length === 0 && (
                              <div className="px-3 py-2 text-[11.5px] text-gray-400 italic">
                                Sin tareas mias en este cliente
                              </div>
                            )}
                            {pickableForThisBullet.map(t => {
                              const isDone = t.status === 'done';
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => { update(i, { task_id: t.id }); setTaskPickerOpenForIdx(null); }}
                                  className={`block w-full text-left px-3 py-1.5 text-[12px] hover:bg-blue-50 cursor-pointer border-none bg-transparent ${
                                    isDone ? 'text-gray-500' : 'text-gray-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className={`font-medium truncate ${isDone ? 'line-through' : ''}`}>
                                      {t.title}
                                    </span>
                                    {isDone && (
                                      <span className="ml-auto shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide rounded-full bg-green-100 text-green-700 px-1.5 py-0.5">
                                        Completada
                                      </span>
                                    )}
                                  </div>
                                  {t.phase && (
                                    <span className="block text-[10px] text-gray-400 mt-0.5">Fase: {t.phase}</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Hint resaltado cuando entregable + linked */}
                  {linkedTask && isEntregable && (
                    <span className="inline-flex items-center gap-1 text-[10.5px] text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 font-semibold">
                      <CheckCircle2 size={10} />
                      Al guardar marca la tarea como completada
                    </span>
                  )}
                  {linkedTask && !b.category && (
                    <span className="text-[10.5px] text-amber-700">
                      Marcá Entregable para cerrar la tarea, o Avance para solo dejar nota.
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
