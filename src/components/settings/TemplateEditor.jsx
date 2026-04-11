import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Plus, X, ArrowUp, ArrowDown, Link2, RotateCcw } from 'lucide-react';
import Modal from '../Modal';
import SaveBar from './SaveBar';
import { DEFAULT_TASKS_TEMPLATE, PHASES } from '../../utils/constants';

/**
 * Editor del template global de roadmap. Trabaja sobre un draft local;
 * los cambios se persisten en app_settings solo al clickear "Guardar cambios".
 */
export default function TemplateEditor() {
  const { appSettings, updateAppSettings, teamMembers } = useApp();
  const emptyTpl = { phases: [], tasks: [] };
  const [draft, setDraft] = useState(appSettings?.roadmap_template || emptyTpl);
  const [dirty, setDirty] = useState(false);

  const [depsModal, setDepsModal] = useState(null);
  const [addingTaskTo, setAddingTaskTo] = useState(null);
  const [newTaskName, setNewTaskName] = useState('');
  const [addingPhase, setAddingPhase] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState('');

  // Resync con contexto si no hay cambios pendientes
  useEffect(() => {
    if (!dirty && appSettings?.roadmap_template) {
      setDraft(appSettings.roadmap_template);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings]);

  const phases = draft.phases || [];
  const tasks = draft.tasks || [];

  const sortedPhases = useMemo(() => [...phases].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [phases]);

  // Helper para mutar el draft completo
  const setTemplate = (next) => { setDraft(next); setDirty(true); };

  const handleSave = () => {
    updateAppSettings({ roadmap_template: draft });
    setDirty(false);
  };
  const handleCancel = () => {
    setDraft(appSettings?.roadmap_template || emptyTpl);
    setDirty(false);
    setAddingTaskTo(null);
    setAddingPhase(false);
    setNewTaskName('');
    setNewPhaseName('');
  };

  // ── Phase ops ──
  const updatePhase = (phaseId, fields) => {
    setTemplate({
      ...draft,
      phases: phases.map(p => p.id === phaseId ? { ...p, ...fields } : p),
    });
  };

  const movePhase = (phaseId, dir) => {
    const idx = sortedPhases.findIndex(p => p.id === phaseId);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= sortedPhases.length) return;
    const reordered = [...sortedPhases];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(target, 0, moved);
    const nextPhases = reordered.map((p, i) => ({ ...p, order: i }));
    setTemplate({ ...draft, phases: nextPhases });
  };

  const deletePhase = (phaseId) => {
    const phase = phases.find(p => p.id === phaseId);
    const tasksInPhase = tasks.filter(t => t.phaseId === phaseId);
    if (tasksInPhase.length > 0) {
      if (!confirm(`La fase "${phase?.label}" tiene ${tasksInPhase.length} tareas. Eliminarla y todas sus tareas?`)) return;
    } else {
      if (!confirm(`Eliminar la fase "${phase?.label}"?`)) return;
    }
    const remainingTaskIds = new Set(tasks.filter(t => t.phaseId !== phaseId).map(t => t.id));
    setTemplate({
      ...draft,
      phases: phases.filter(p => p.id !== phaseId),
      // Limpiar deps que apuntaban a tareas eliminadas
      tasks: tasks
        .filter(t => t.phaseId !== phaseId)
        .map(t => ({ ...t, dependsOn: (t.dependsOn || []).filter(d => remainingTaskIds.has(d)) })),
    });
  };

  const addPhase = () => {
    const label = newPhaseName.trim();
    if (!label) return;
    const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const colors = ['#8B5CF6', '#5B7CF5', '#EAB308', '#22C55E', '#06B6D4', '#EC4899', '#F97316'];
    const color = colors[phases.length % colors.length];
    setTemplate({
      ...draft,
      phases: [...phases, { id, label, color, order: phases.length }],
    });
    setNewPhaseName('');
    setAddingPhase(false);
  };

  // ── Task ops ──
  const updateTask = (taskId, fields) => {
    setTemplate({
      ...draft,
      tasks: tasks.map(t => t.id === taskId ? { ...t, ...fields } : t),
    });
  };

  const deleteTask = (taskId) => {
    if (!confirm('Eliminar esta tarea del template?')) return;
    setTemplate({
      ...draft,
      tasks: tasks
        .filter(t => t.id !== taskId)
        .map(t => ({ ...t, dependsOn: (t.dependsOn || []).filter(d => d !== taskId) })),
    });
  };

  const addTaskToPhase = (phaseId) => {
    const name = newTaskName.trim();
    if (!name) return;
    const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    setTemplate({
      ...draft,
      tasks: [
        ...tasks,
        { id, name, phaseId, assignee: '', daysFromUnblock: 1, isClientTask: false, dependsOn: [] },
      ],
    });
    setNewTaskName('');
    setAddingTaskTo(null);
  };

  // ── Restaurar template original ──
  const restoreOriginal = () => {
    if (!confirm('Esto reemplaza el template actual con el original del sistema. ¿Continuar?')) return;
    const restoredPhases = Object.entries(PHASES).map(([id, p], i) => ({ id, label: p.label, color: p.color, order: i }));
    const restoredTasks = DEFAULT_TASKS_TEMPLATE.map(t => ({
      id: t.id,
      name: t.name,
      phaseId: t.phase,
      assignee: t.assignee || '',
      daysFromUnblock: t.days,
      isClientTask: !!t.client,
      dependsOn: [...(t.dependsOn || [])],
    }));
    setTemplate({ phases: restoredPhases, tasks: restoredTasks });
  };

  if (!appSettings) {
    return <div className="text-xs text-gray-400 p-8 text-center">Cargando template...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[14px] font-bold text-gray-800">Plantilla de Roadmap</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">El roadmap que se le carga a cada cliente nuevo. Los cambios no afectan a clientes existentes.</p>
        </div>
        <button
          className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-orange-600 bg-white border border-gray-200 hover:border-orange-300 rounded-md py-1.5 px-2.5 cursor-pointer font-sans transition-colors"
          onClick={restoreOriginal}
          title="Volver al template hardcodeado del sistema"
        >
          <RotateCcw size={12} /> Restaurar original
        </button>
      </div>

      {sortedPhases.map((phase, phaseIdx) => {
        const phaseTasks = tasks.filter(t => t.phaseId === phase.id);
        return (
          <div key={phase.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden" style={{ borderLeft: `3px solid ${phase.color}` }}>
            {/* Phase header */}
            <div className="flex items-center gap-2 py-2.5 px-3 bg-gray-50/50 border-b border-gray-100">
              <input
                type="color"
                value={phase.color}
                onChange={(e) => updatePhase(phase.id, { color: e.target.value })}
                className="w-6 h-6 rounded border border-gray-200 cursor-pointer p-0 bg-white shrink-0"
                title="Color"
              />
              <input
                type="text"
                value={phase.label}
                onChange={(e) => updatePhase(phase.id, { label: e.target.value })}
                className="text-[13px] font-bold border border-transparent hover:border-gray-200 focus:border-blue-400 rounded py-0.5 px-1.5 outline-none bg-transparent flex-1 min-w-0"
                style={{ color: phase.color }}
              />
              <span className="text-[10px] text-gray-400 shrink-0">{phaseTasks.length} tareas</span>
              <button
                className="bg-transparent border-none text-gray-400 hover:text-gray-700 cursor-pointer p-1 rounded hover:bg-gray-200 disabled:opacity-30"
                onClick={() => movePhase(phase.id, -1)}
                disabled={phaseIdx === 0}
                title="Subir"
              >
                <ArrowUp size={12} />
              </button>
              <button
                className="bg-transparent border-none text-gray-400 hover:text-gray-700 cursor-pointer p-1 rounded hover:bg-gray-200 disabled:opacity-30"
                onClick={() => movePhase(phase.id, 1)}
                disabled={phaseIdx === sortedPhases.length - 1}
                title="Bajar"
              >
                <ArrowDown size={12} />
              </button>
              <button
                className="bg-transparent border-none text-gray-400 hover:text-red-500 cursor-pointer p-1 rounded hover:bg-red-50"
                onClick={() => deletePhase(phase.id)}
                title="Eliminar fase"
              >
                <X size={13} />
              </button>
            </div>

            {/* Tasks */}
            <div className="divide-y divide-gray-50">
              {phaseTasks.map(t => (
                <div key={t.id} className="grid grid-cols-[1fr_140px_90px_80px_56px] gap-2 items-center py-2 px-3 hover:bg-gray-50/50">
                  <input
                    type="text"
                    value={t.name}
                    onChange={(e) => updateTask(t.id, { name: e.target.value })}
                    className="text-[12px] font-medium text-gray-800 border border-transparent hover:border-gray-200 focus:border-blue-400 rounded py-1 px-1.5 outline-none bg-transparent min-w-0"
                  />
                  <select
                    value={t.assignee || ''}
                    onChange={(e) => updateTask(t.id, { assignee: e.target.value })}
                    className="text-[11px] border border-gray-200 rounded py-1 px-1.5 outline-none bg-white focus:border-blue-400 cursor-pointer"
                  >
                    <option value="">Sin asignar</option>
                    {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={t.daysFromUnblock ?? ''}
                      onChange={(e) => updateTask(t.id, { daysFromUnblock: e.target.value === '' ? null : Number(e.target.value) })}
                      className="w-12 text-[11px] border border-gray-200 rounded py-1 px-1.5 outline-none bg-white focus:border-blue-400 text-right"
                      title="Días estimados desde que la tarea se desbloquea"
                    />
                    <span className="text-[10px] text-gray-400">d</span>
                  </div>
                  <label className="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!t.isClientTask}
                      onChange={(e) => updateTask(t.id, { isClientTask: e.target.checked })}
                      className="cursor-pointer"
                    />
                    Cliente
                  </label>
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      className="bg-transparent border-none text-gray-400 hover:text-blue-500 cursor-pointer p-1 rounded hover:bg-blue-50 relative"
                      onClick={() => setDepsModal(t.id)}
                      title="Dependencias"
                    >
                      <Link2 size={13} />
                      {(t.dependsOn || []).length > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[8px] font-bold rounded-full w-3 h-3 flex items-center justify-center">{t.dependsOn.length}</span>
                      )}
                    </button>
                    <button
                      className="bg-transparent border-none text-gray-400 hover:text-red-500 cursor-pointer p-1 rounded hover:bg-red-50"
                      onClick={() => deleteTask(t.id)}
                      title="Eliminar"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Add task to phase */}
              {addingTaskTo === phase.id ? (
                <div className="py-1.5 px-3 bg-blue-50/30">
                  <input
                    type="text"
                    placeholder="Nombre de la tarea... (Enter para crear)"
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addTaskToPhase(phase.id);
                      if (e.key === 'Escape') { setAddingTaskTo(null); setNewTaskName(''); }
                    }}
                    onBlur={() => {
                      if (newTaskName.trim()) addTaskToPhase(phase.id);
                      else { setAddingTaskTo(null); setNewTaskName(''); }
                    }}
                    autoFocus
                    className="w-full border border-blue-300 rounded py-1.5 px-2 text-[12px] font-sans outline-none focus:border-blue-500 bg-white"
                  />
                </div>
              ) : (
                <button
                  className="w-full text-left text-[11px] text-gray-400 hover:text-blue-500 hover:bg-gray-50 py-1.5 px-3 bg-transparent border-none cursor-pointer font-sans"
                  onClick={() => { setAddingTaskTo(phase.id); setNewTaskName(''); }}
                >
                  + Agregar tarea
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Add phase */}
      {addingPhase ? (
        <div className="bg-white border border-blue-300 rounded-lg p-2.5 flex items-center gap-2" style={{ borderLeft: '3px solid #5B7CF5' }}>
          <input
            type="text"
            placeholder="Nombre de la nueva fase..."
            value={newPhaseName}
            onChange={(e) => setNewPhaseName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addPhase();
              if (e.key === 'Escape') { setAddingPhase(false); setNewPhaseName(''); }
            }}
            onBlur={() => {
              if (newPhaseName.trim()) addPhase();
              else setAddingPhase(false);
            }}
            autoFocus
            className="flex-1 text-[13px] font-bold border border-blue-400 rounded py-1 px-2 outline-none bg-white"
          />
        </div>
      ) : (
        <button
          className="w-full text-[12px] text-gray-400 hover:text-blue-500 bg-white border border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 rounded-lg py-2.5 px-3 cursor-pointer font-sans transition-colors"
          onClick={() => setAddingPhase(true)}
        >
          + Agregar fase
        </button>
      )}

      {/* Dependencies modal */}
      <Modal
        open={!!depsModal}
        onClose={() => setDepsModal(null)}
        title="Configurar dependencias"
        maxWidth={460}
        footer={<button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark" onClick={() => setDepsModal(null)}>Cerrar</button>}
      >
        {depsModal && (() => {
          const current = tasks.find(t => t.id === depsModal);
          if (!current) return null;
          const others = tasks.filter(t => t.id !== depsModal);
          const currentDeps = current.dependsOn || [];
          // Agrupar por fase
          const groups = sortedPhases.map(p => ({
            phase: p,
            tasks: others.filter(t => t.phaseId === p.id),
          })).filter(g => g.tasks.length > 0);
          return (
            <div>
              <div className="text-xs text-gray-500 mb-3">Tareas que deben completarse antes de <strong>{current.name}</strong>:</div>
              <div className="max-h-[400px] overflow-y-auto">
                {groups.map(({ phase, tasks: gt }) => (
                  <div key={phase.id} className="mb-2">
                    <div className="flex items-center gap-1.5 py-1.5 px-1 sticky top-0 bg-white z-[1]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: phase.color }} />
                      <span className="text-[11px] font-bold" style={{ color: phase.color }}>{phase.label}</span>
                    </div>
                    {gt.map(tt => {
                      const isChecked = currentDeps.includes(tt.id);
                      return (
                        <label key={tt.id} className="flex items-center gap-2.5 py-1.5 px-3 pl-6 rounded-md cursor-pointer text-xs hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const newDeps = isChecked
                                ? currentDeps.filter(d => d !== tt.id)
                                : [...currentDeps, tt.id];
                              updateTask(depsModal, { dependsOn: newDeps });
                            }}
                            className="cursor-pointer"
                          />
                          <span className="flex-1 text-gray-800">{tt.name}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Modal>

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}
