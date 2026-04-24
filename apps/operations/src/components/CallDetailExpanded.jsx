import { useState } from 'react';
import { Pencil, Trash2, ArrowRight, Check, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';

const AREA_COLORS = {
  marketing: { bg: '#EFF6FF', text: '#1D4ED8', label: 'Marketing' },
  empresa:   { bg: '#F0FDF4', text: '#166534', label: 'Empresa' },
  producto:  { bg: '#FDF4FF', text: '#7E22CE', label: 'Producto' },
};

const TIPO_COLORS = {
  queja:  { bg: '#FEF2F2', text: '#DC2626', label: 'Queja' },
  mejora: { bg: '#F0FDF4', text: '#16A34A', label: 'Mejora' },
};

export default function CallDetailExpanded({ llamada, onUpdate, onCreateTask, clients, tasks, onToggleRetro }) {
  const { teamMembers } = useApp();
  const TEAM = teamMembers || [];
  const [editingSection, setEditingSection] = useState(null);
  const [editForm, setEditForm] = useState({});
  // Task creation modal
  const [taskModal, setTaskModal] = useState(null); // { source, idx, defaults }

  const l = llamada;

  const startEdit = (section, idx, data) => {
    setEditingSection(`${section}-${idx}`);
    setEditForm(data);
  };
  const cancelEdit = () => { setEditingSection(null); setEditForm({}); };

  // --- Get phases for a client ---
  const getClientPhases = (clientId) => {
    if (!clientId || !tasks) return [];
    const clientTasks = tasks.filter(t => t.clientId === clientId);
    const phases = [...new Set(clientTasks.map(t => t.phase).filter(Boolean))];
    return phases;
  };

  // --- Task creation modal ---
  const openTaskModal = (defaults) => {
    setTaskModal({
      title: defaults.title || '',
      description: defaults.description || '',
      clientId: defaults.clientId || l.cliente_id || '',
      assignee: defaults.assignee || '',
      phase: '',
      onSave: defaults.onSave,
    });
  };

  const saveTaskFromModal = () => {
    if (!taskModal || !taskModal.title.trim()) return;
    const task = onCreateTask(
      taskModal.title.trim(),
      taskModal.clientId,
      taskModal.assignee,
      'normal',
      'backlog',
      taskModal.description,
      null
    );
    // If phase selected, update the task
    if (task && taskModal.phase && tasks) {
      // Phase is set via the onSave callback
    }
    if (task && taskModal.onSave) {
      taskModal.onSave(task);
    }
    setTaskModal(null);
  };

  const clientPhases = taskModal ? getClientPhases(taskModal.clientId) : [];

  // --- Próximos pasos ---
  const savePasoEdit = (idx) => {
    const updated = [...(l.proximos_pasos || [])];
    updated[idx] = { ...updated[idx], accion: editForm.accion, responsable: editForm.responsable, plazo: editForm.plazo };
    onUpdate(l.id, { proximos_pasos: updated });
    cancelEdit();
  };
  const deletePaso = (idx) => {
    const updated = (l.proximos_pasos || []).filter((_, i) => i !== idx);
    onUpdate(l.id, { proximos_pasos: updated });
  };
  const convertPasoToTask = (idx) => {
    const paso = l.proximos_pasos[idx];
    openTaskModal({
      title: paso.accion,
      description: `Desde llamada: ${l.titulo}${paso.plazo ? '\nPlazo: ' + paso.plazo : ''}`,
      assignee: paso.responsable || '',
      clientId: l.cliente_id || '',
      onSave: (task) => {
        const updated = [...(l.proximos_pasos || [])];
        updated[idx] = { ...updated[idx], task_id: task.id };
        onUpdate(l.id, { proximos_pasos: updated });
      }
    });
  };

  // --- Feedback ---
  const saveFbEdit = (idx) => {
    const updated = [...(l.feedback || [])];
    updated[idx] = { ...updated[idx], texto: editForm.texto, descripcion: editForm.descripcion, area: editForm.area };
    onUpdate(l.id, { feedback: updated });
    cancelEdit();
  };
  const deleteFb = (idx) => {
    const updated = (l.feedback || []).filter((_, i) => i !== idx);
    onUpdate(l.id, { feedback: updated });
  };
  const convertFbToTask = (idx) => {
    const fb = l.feedback[idx];
    openTaskModal({
      title: fb.texto,
      description: `Feedback (${fb.area}) de llamada: ${l.titulo}${fb.descripcion ? '\n\nCita: "' + fb.descripcion + '"' : ''}`,
      clientId: l.cliente_id || '',
      onSave: (task) => {
        const updated = [...(l.feedback || [])];
        updated[idx] = { ...updated[idx], converted_task_id: task.id };
        onUpdate(l.id, { feedback: updated });
      }
    });
  };

  // --- Problemas ---
  const deleteProblema = (idx) => {
    const updated = (l.problemas_detectados || []).filter((_, i) => i !== idx);
    onUpdate(l.id, { problemas_detectados: updated });
  };
  const convertProblemaToTask = (idx) => {
    const texto = getItemText(l.problemas_detectados[idx]);
    openTaskModal({
      title: texto,
      description: `Problema detectado en llamada: ${l.titulo}`,
      clientId: l.cliente_id || '',
      onSave: () => {
        const updated = [...(l.problemas_detectados || [])];
        updated[idx] = { text: texto, converted: true };
        onUpdate(l.id, { problemas_detectados: updated });
      }
    });
  };

  // --- Objeciones ---
  const deleteObjecion = (idx) => {
    const updated = (l.objeciones || []).filter((_, i) => i !== idx);
    onUpdate(l.id, { objeciones: updated });
  };
  const convertObjecionToTask = (idx) => {
    const texto = getItemText(l.objeciones[idx]);
    openTaskModal({
      title: texto,
      description: `Objecion de llamada: ${l.titulo}`,
      clientId: l.cliente_id || '',
      onSave: () => {
        const updated = [...(l.objeciones || [])];
        updated[idx] = { text: texto, converted: true };
        onUpdate(l.id, { objeciones: updated });
      }
    });
  };

  const getItemText = (item) => typeof item === 'string' ? item : item?.text || '';
  const isConverted = (item) => typeof item === 'object' && item?.converted;

  return (
    <div className="border-t border-gray-100 bg-gray-50/30">
      {/* Retroalimentacion button */}
      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
        <button
          onClick={() => onToggleRetro && onToggleRetro(l.id)}
          className={`flex items-center gap-1.5 text-[11px] font-semibold rounded-lg py-1.5 px-3 border cursor-pointer font-sans transition-colors ${
            l.usar_como_contexto
              ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
              : 'bg-transparent border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          <RefreshCw size={12} />
          {l.usar_como_contexto ? 'Retroalimentacion activa' : 'Usar como retroalimentacion'}
        </button>
        {l.usar_como_contexto && (
          <span className="text-[10px] text-green-600">Esta llamada se usara como contexto para el agente de ops</span>
        )}
      </div>

      {/* Resumen */}
      {l.resumen && (
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Resumen</div>
          <div className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap">{l.resumen}</div>
        </div>
      )}

      {/* Próximos pasos */}
      {(l.proximos_pasos || []).length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Proximos pasos</div>
          <div className="space-y-1.5">
            {(l.proximos_pasos || []).map((paso, i) => {
              // Si ya es tarea real en el sistema, no mostrarlo
              const isRealTask = !!paso.task_id && (tasks || []).some(t => t.id === paso.task_id);
              if (isRealTask) return null;

              const isEditing = editingSection === `paso-${i}`;

              if (isEditing) {
                return (
                  <div key={i} className="bg-white rounded-lg border border-blue-200 p-2.5 space-y-2">
                    <input type="text" value={editForm.accion || ''} onChange={e => setEditForm(f => ({ ...f, accion: e.target.value }))}
                      className="w-full border border-gray-200 rounded py-1.5 px-2.5 text-[12px] font-sans outline-none focus:border-blue-400" placeholder="Accion" />
                    <div className="flex gap-2">
                      <input type="text" value={editForm.responsable || ''} onChange={e => setEditForm(f => ({ ...f, responsable: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded py-1.5 px-2.5 text-[12px] font-sans outline-none focus:border-blue-400" placeholder="Responsable" />
                      <input type="text" value={editForm.plazo || ''} onChange={e => setEditForm(f => ({ ...f, plazo: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded py-1.5 px-2.5 text-[12px] font-sans outline-none focus:border-blue-400" placeholder="Plazo" />
                    </div>
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={cancelEdit} className="text-[11px] text-gray-500 bg-transparent border border-gray-200 rounded px-2.5 py-1 cursor-pointer font-sans hover:bg-gray-50">Cancelar</button>
                      <button onClick={() => savePasoEdit(i)} className="text-[11px] text-white bg-blue-500 border-none rounded px-2.5 py-1 cursor-pointer font-sans hover:bg-blue-600">Guardar</button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={i} className="flex items-start gap-2 group rounded-lg px-2.5 py-1.5 hover:bg-white transition-colors">
                  <span className="text-[11px] text-gray-400 mt-0.5">•</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[12px] text-gray-700">{paso.accion}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      {paso.responsable && <span className="text-[10px] text-gray-400">{paso.responsable}</span>}
                      {paso.plazo && <span className="text-[10px] text-gray-400">{paso.plazo}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => startEdit('paso', i, { accion: paso.accion, responsable: paso.responsable, plazo: paso.plazo })}
                      className="p-1 text-gray-400 hover:text-blue-500 bg-transparent border-none cursor-pointer" title="Editar"><Pencil size={11} /></button>
                    <button onClick={() => deletePaso(i)}
                      className="p-1 text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer" title="Eliminar"><Trash2 size={11} /></button>
                    <button onClick={() => convertPasoToTask(i)}
                      className="p-1 text-gray-400 hover:text-green-500 bg-transparent border-none cursor-pointer" title="Convertir a tarea"><ArrowRight size={11} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quejas y Mejoras */}
      {(l.feedback || []).length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Quejas y mejoras</div>
          <div className="space-y-2">
            {(l.feedback || []).map((fb, i) => {
              const isEditing = editingSection === `fb-${i}`;
              const converted = !!fb.converted_task_id;
              const area = AREA_COLORS[fb.area] || AREA_COLORS.empresa;

              if (isEditing) {
                return (
                  <div key={i} className="bg-white rounded-lg border border-blue-200 p-2.5 space-y-2">
                    <div className="flex gap-2">
                      <select value={editForm.area || 'empresa'} onChange={e => setEditForm(f => ({ ...f, area: e.target.value }))}
                        className="border border-gray-200 rounded py-1.5 px-2.5 text-[12px] font-sans outline-none focus:border-blue-400">
                        <option value="marketing">Marketing</option>
                        <option value="empresa">Empresa</option>
                        <option value="producto">Producto</option>
                      </select>
                      <input type="text" value={editForm.texto || ''} onChange={e => setEditForm(f => ({ ...f, texto: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded py-1.5 px-2.5 text-[12px] font-sans outline-none focus:border-blue-400" placeholder="Titulo del feedback" />
                    </div>
                    <textarea value={editForm.descripcion || ''} onChange={e => setEditForm(f => ({ ...f, descripcion: e.target.value }))}
                      className="w-full border border-gray-200 rounded py-1.5 px-2.5 text-[12px] font-sans outline-none focus:border-blue-400 resize-y min-h-[50px]" placeholder="Cita textual del cliente..." />
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={cancelEdit} className="text-[11px] text-gray-500 bg-transparent border border-gray-200 rounded px-2.5 py-1 cursor-pointer font-sans hover:bg-gray-50">Cancelar</button>
                      <button onClick={() => saveFbEdit(i)} className="text-[11px] text-white bg-blue-500 border-none rounded px-2.5 py-1 cursor-pointer font-sans hover:bg-blue-600">Guardar</button>
                    </div>
                  </div>
                );
              }

              const tipo = TIPO_COLORS[fb.tipo] || TIPO_COLORS.mejora;

              return (
                <div key={i} className={`rounded-lg px-2.5 py-2 hover:bg-white transition-colors group ${converted ? 'opacity-50' : ''}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-[9px] font-bold rounded px-1.5 py-0.5 shrink-0 mt-0.5 uppercase"
                      style={{ background: tipo.bg, color: tipo.text }}>{tipo.label}</span>
                    <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 shrink-0 mt-0.5"
                      style={{ background: area.bg, color: area.text }}>{area.label}</span>
                    <span className={`text-[12px] font-medium flex-1 min-w-0 ${converted ? 'line-through text-gray-400' : 'text-gray-700'}`}>{fb.texto}</span>
                    {!converted && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => startEdit('fb', i, { texto: fb.texto, descripcion: fb.descripcion || '', area: fb.area })}
                          className="p-1 text-gray-400 hover:text-blue-500 bg-transparent border-none cursor-pointer" title="Editar"><Pencil size={11} /></button>
                        <button onClick={() => deleteFb(i)}
                          className="p-1 text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer" title="Eliminar"><Trash2 size={11} /></button>
                        <button onClick={() => convertFbToTask(i)}
                          className="p-1 text-gray-400 hover:text-green-500 bg-transparent border-none cursor-pointer" title="Convertir a tarea"><ArrowRight size={11} /></button>
                      </div>
                    )}
                  </div>
                  {/* Cita textual */}
                  {fb.descripcion && (
                    <div className="mt-1 ml-[calc(1.5rem+8px)] text-[11px] text-gray-400 italic border-l-2 border-gray-200 pl-2">
                      "{fb.descripcion}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Problemas detectados */}
      {(l.problemas_detectados || []).length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Problemas detectados</div>
          <div className="space-y-1.5">
            {(l.problemas_detectados || []).map((item, i) => {
              const text = getItemText(item);
              const converted = isConverted(item);
              return (
                <div key={i} className={`flex items-start gap-2 group rounded-lg px-2.5 py-1.5 hover:bg-white transition-colors ${converted ? 'opacity-50' : ''}`}>
                  <span className="text-[11px] text-gray-400 mt-0.5">{converted ? <Check size={12} className="text-green-500" /> : '•'}</span>
                  <span className={`text-[12px] flex-1 min-w-0 ${converted ? 'line-through text-gray-400' : 'text-gray-700'}`}>{text}</span>
                  {!converted && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => deleteProblema(i)}
                        className="p-1 text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer" title="Eliminar"><Trash2 size={11} /></button>
                      <button onClick={() => convertProblemaToTask(i)}
                        className="p-1 text-gray-400 hover:text-green-500 bg-transparent border-none cursor-pointer" title="Convertir a tarea"><ArrowRight size={11} /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Objeciones (solo ventas) */}
      {(l.objeciones || []).length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Objeciones</div>
          <div className="space-y-1.5">
            {(l.objeciones || []).map((item, i) => {
              const text = getItemText(item);
              const converted = isConverted(item);
              return (
                <div key={i} className={`flex items-start gap-2 group rounded-lg px-2.5 py-1.5 hover:bg-white transition-colors ${converted ? 'opacity-50' : ''}`}>
                  <span className="text-[11px] text-gray-400 mt-0.5">{converted ? <Check size={12} className="text-green-500" /> : '•'}</span>
                  <span className={`text-[12px] flex-1 min-w-0 ${converted ? 'line-through text-gray-400' : 'text-gray-700'}`}>{text}</span>
                  {!converted && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => deleteObjecion(i)}
                        className="p-1 text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer" title="Eliminar"><Trash2 size={11} /></button>
                      <button onClick={() => convertObjecionToTask(i)}
                        className="p-1 text-gray-400 hover:text-green-500 bg-transparent border-none cursor-pointer" title="Convertir a tarea"><ArrowRight size={11} /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notas clave */}
      {l.notas_clave && (
        <div className="px-4 py-3">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Notas clave</div>
          <div className="text-[12px] text-gray-600 leading-relaxed whitespace-pre-wrap">{l.notas_clave}</div>
        </div>
      )}

      {/* Task creation modal */}
      {taskModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setTaskModal(null)}>
          <div className="bg-white rounded-xl border border-gray-200 p-5 w-full max-w-[480px] shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-[14px] font-bold text-gray-800 mb-4">Crear tarea</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Titulo</label>
                <input type="text" value={taskModal.title} onChange={e => setTaskModal(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400" autoFocus />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Descripcion</label>
                <textarea value={taskModal.description} onChange={e => setTaskModal(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400 resize-y min-h-[60px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Cliente</label>
                  <select value={taskModal.clientId} onChange={e => setTaskModal(f => ({ ...f, clientId: e.target.value, phase: '' }))}
                    className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400">
                    <option value="">Sin cliente</option>
                    {(clients || []).filter(c => c.name?.includes('Korex')).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    <option disabled>──────────</option>
                    {(clients || []).filter(c => !c.name?.includes('Korex')).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Fase</label>
                  <select value={taskModal.phase} onChange={e => setTaskModal(f => ({ ...f, phase: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400">
                    <option value="">Sin fase</option>
                    {clientPhases.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Asignados</label>
                <div className="flex flex-wrap gap-1.5">
                  {TEAM.map(m => {
                    const assignees = (taskModal.assignee || '').split(',').map(s => s.trim()).filter(Boolean);
                    const selected = assignees.includes(m.name);
                    return (
                      <button key={m.id} type="button"
                        onClick={() => {
                          const current = (taskModal.assignee || '').split(',').map(s => s.trim()).filter(Boolean);
                          const next = selected ? current.filter(n => n !== m.name) : [...current, m.name];
                          setTaskModal(f => ({ ...f, assignee: next.join(', ') }));
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-full border cursor-pointer font-sans transition-colors ${
                          selected
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                        }`}
                      >{m.name.split(' ')[0]}</button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 justify-end">
                <button onClick={() => setTaskModal(null)}
                  className="py-2 px-4 bg-transparent border border-gray-200 text-gray-600 text-[13px] rounded-lg cursor-pointer font-sans hover:bg-gray-50">Cancelar</button>
                <button onClick={saveTaskFromModal} disabled={!taskModal.title.trim()}
                  className="py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white text-[13px] font-semibold rounded-lg border-none cursor-pointer font-sans disabled:opacity-40">Crear tarea</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
