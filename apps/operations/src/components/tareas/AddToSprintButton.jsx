import { useState } from 'react';
import { Zap, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SPRINT_PRIORITY } from '../../utils/constants';
// "En sprint" es clickeable: lo saca del sprint (vuelve a Objetivos).

// Botón "al sprint" para una tarea de Objetivos. Abre un modal chico para
// elegir responsable + prioridad y la manda al sprint activo (columna
// Priorizado). Si la tarea ya está en el sprint activo, muestra estado "en el
// sprint" y no deja duplicar.
//
// Props:
//   - task: objeto tarea completo

export default function AddToSprintButton({ task }) {
  const { activeSprint, addTaskToSprint, createSprint, removeTaskFromSprint, teamMembers } = useApp();
  const [open, setOpen] = useState(false);

  const inSprint = !!activeSprint && task?.sprintId === activeSprint.id;

  // Responsable por defecto: primer nombre del assignee actual de la tarea.
  const defaultAssignee = (() => {
    const first = String(task?.assignee || '').split(',')[0]?.trim();
    return first || '';
  })();
  const [assignee, setAssignee] = useState(defaultAssignee);
  const [priority, setPriority] = useState(task?.sprintPriority || 3);

  const handleConfirm = () => {
    // Garantizar que exista un sprint activo (crea el de la semana si no hay).
    if (!activeSprint) createSprint();
    addTaskToSprint(task.id, {
      assignee: assignee || undefined,
      sprintPriority: Number(priority),
      status: assignee ? 'priorizado' : 'backlog',
    });
    setOpen(false);
  };

  if (inSprint) {
    return (
      <span
        onClick={(e) => { e.stopPropagation(); removeTaskFromSprint(task.id); }}
        title="Quitar del sprint"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#fff', background: '#5B7CF5', borderRadius: 7, padding: '5px 10px', whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer' }}
      >
        <Zap size={13} fill="currentColor" stroke="none" /> En sprint <X size={12} strokeWidth={2.5} />
      </span>
    );
  }

  return (
    <>
      <span
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Enviar al sprint en curso"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#5B7CF5', background: '#EEF2FF', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        <Zap size={13} fill="currentColor" stroke="none" /> al sprint
      </span>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
          onClick={(e) => { e.stopPropagation(); setOpen(false); }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-[380px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Zap size={16} className="text-blue" />
              <div className="font-semibold text-[14px] flex-1">Enviar al sprint</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded flex items-center justify-center text-text3 hover:bg-surface2 cursor-pointer border-none bg-transparent"
              ><X size={16} /></button>
            </div>

            <div className="px-4 py-3 space-y-3">
              <div className="text-[13px] text-text2 leading-snug">
                <span className="font-medium text-text">{task?.title}</span>
                {activeSprint && (
                  <span className="text-text3"> · {activeSprint.name}</span>
                )}
              </div>

              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-text3 mb-1">Responsable</label>
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="w-full border border-border rounded-lg py-2 px-2.5 text-[13px] font-sans outline-none focus:border-blue bg-white"
                >
                  <option value="">Sin asignar (va a Backlog)</option>
                  {(teamMembers || []).map(m => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-text3 mb-1">Prioridad</label>
                <div className="flex gap-1.5">
                  {Object.entries(SPRINT_PRIORITY).map(([num, p]) => {
                    const n = Number(num);
                    const active = Number(priority) === n;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setPriority(n)}
                        className="flex-1 py-1.5 rounded-lg text-[12px] font-semibold border cursor-pointer transition-all"
                        style={active
                          ? { background: p.color, color: '#fff', borderColor: p.color }
                          : { background: p.bg, color: p.color, borderColor: 'transparent' }}
                      >{p.label}</button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-surface2/40">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[12.5px] text-text2 hover:text-text px-3 py-1.5 rounded cursor-pointer bg-transparent border-none"
              >Cancelar</button>
              <button
                type="button"
                onClick={handleConfirm}
                className="text-[12.5px] font-semibold rounded-md px-3.5 py-1.5 bg-blue text-white hover:bg-blue-dark cursor-pointer border-none flex items-center gap-1.5"
              ><Zap size={13} /> Agregar al sprint</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
