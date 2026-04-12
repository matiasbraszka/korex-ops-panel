import { useState } from 'react';
import { Pencil, Trash2, ArrowRight, Check, X } from 'lucide-react';

const AREA_COLORS = {
  marketing: { bg: '#EFF6FF', text: '#1D4ED8', label: 'Marketing' },
  empresa:   { bg: '#F0FDF4', text: '#166534', label: 'Empresa' },
  producto:  { bg: '#FDF4FF', text: '#7E22CE', label: 'Producto' },
};

export default function CallDetailExpanded({ llamada, onUpdate, onCreateTask, clients }) {
  const [editingSection, setEditingSection] = useState(null); // 'paso-0', 'fb-1', etc.
  const [editForm, setEditForm] = useState({});

  const l = llamada;
  const clientName = l.cliente_id ? clients?.find(c => c.id === l.cliente_id)?.name : null;

  // --- Helpers ---
  const startEdit = (section, idx, data) => {
    setEditingSection(`${section}-${idx}`);
    setEditForm(data);
  };
  const cancelEdit = () => { setEditingSection(null); setEditForm({}); };

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
    const task = onCreateTask(
      paso.accion,
      l.cliente_id || '',
      paso.responsable || '',
      paso.urgencia === 'high' ? 'urgent' : 'normal',
      'backlog',
      `Desde llamada: ${l.titulo}${paso.plazo ? ' | Plazo: ' + paso.plazo : ''}`,
      null
    );
    if (task) {
      const updated = [...(l.proximos_pasos || [])];
      updated[idx] = { ...updated[idx], task_proposal_id: task.id };
      onUpdate(l.id, { proximos_pasos: updated });
    }
  };

  // --- Feedback ---
  const saveFbEdit = (idx) => {
    const updated = [...(l.feedback || [])];
    updated[idx] = { ...updated[idx], texto: editForm.texto, area: editForm.area };
    onUpdate(l.id, { feedback: updated });
    cancelEdit();
  };
  const deleteFb = (idx) => {
    const updated = (l.feedback || []).filter((_, i) => i !== idx);
    onUpdate(l.id, { feedback: updated });
  };
  const convertFbToTask = (idx) => {
    const fb = l.feedback[idx];
    const task = onCreateTask(
      fb.texto,
      l.cliente_id || '',
      '',
      'normal',
      'backlog',
      `Feedback (${fb.area}) de llamada: ${l.titulo}`,
      null
    );
    if (task) {
      const updated = [...(l.feedback || [])];
      updated[idx] = { ...updated[idx], converted_task_id: task.id };
      onUpdate(l.id, { feedback: updated });
    }
  };

  // --- Problemas ---
  const deleteProblema = (idx) => {
    const updated = (l.problemas_detectados || []).filter((_, i) => i !== idx);
    onUpdate(l.id, { problemas_detectados: updated });
  };
  const convertProblemaToTask = (idx) => {
    const texto = l.problemas_detectados[idx];
    onCreateTask(texto, l.cliente_id || '', '', 'normal', 'backlog', `Problema detectado en llamada: ${l.titulo}`, null);
    // Mark as converted by wrapping in object
    const updated = [...(l.problemas_detectados || [])];
    updated[idx] = { text: texto, converted: true };
    onUpdate(l.id, { problemas_detectados: updated });
  };

  // --- Objeciones ---
  const deleteObjecion = (idx) => {
    const updated = (l.objeciones || []).filter((_, i) => i !== idx);
    onUpdate(l.id, { objeciones: updated });
  };
  const convertObjecionToTask = (idx) => {
    const texto = l.objeciones[idx];
    onCreateTask(texto, l.cliente_id || '', '', 'normal', 'backlog', `Objecion de llamada: ${l.titulo}`, null);
    const updated = [...(l.objeciones || [])];
    updated[idx] = { text: texto, converted: true };
    onUpdate(l.id, { objeciones: updated });
  };

  const getItemText = (item) => typeof item === 'string' ? item : item?.text || '';
  const isConverted = (item) => typeof item === 'object' && item?.converted;

  return (
    <div className="border-t border-gray-100 bg-gray-50/30">
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
              const isEditing = editingSection === `paso-${i}`;
              const converted = !!paso.task_proposal_id;

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
                <div key={i} className={`flex items-start gap-2 group rounded-lg px-2.5 py-1.5 hover:bg-white transition-colors ${converted ? 'opacity-50' : ''}`}>
                  <span className="text-[11px] text-gray-400 mt-0.5">{converted ? <Check size={12} className="text-green-500" /> : '•'}</span>
                  <div className="flex-1 min-w-0">
                    <span className={`text-[12px] ${converted ? 'line-through text-gray-400' : 'text-gray-700'}`}>{paso.accion}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      {paso.responsable && <span className="text-[10px] text-gray-400">{paso.responsable}</span>}
                      {paso.plazo && <span className="text-[10px] text-gray-400">{paso.plazo}</span>}
                    </div>
                  </div>
                  {!converted && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => startEdit('paso', i, { accion: paso.accion, responsable: paso.responsable, plazo: paso.plazo })}
                        className="p-1 text-gray-400 hover:text-blue-500 bg-transparent border-none cursor-pointer" title="Editar"><Pencil size={11} /></button>
                      <button onClick={() => deletePaso(i)}
                        className="p-1 text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer" title="Eliminar"><Trash2 size={11} /></button>
                      <button onClick={() => convertPasoToTask(i)}
                        className="p-1 text-gray-400 hover:text-green-500 bg-transparent border-none cursor-pointer" title="Convertir a tarea"><ArrowRight size={11} /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Feedback */}
      {(l.feedback || []).length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Feedback</div>
          <div className="space-y-1.5">
            {(l.feedback || []).map((fb, i) => {
              const isEditing = editingSection === `fb-${i}`;
              const converted = !!fb.converted_task_id;
              const area = AREA_COLORS[fb.area] || AREA_COLORS.empresa;

              if (isEditing) {
                return (
                  <div key={i} className="bg-white rounded-lg border border-blue-200 p-2.5 space-y-2">
                    <select value={editForm.area || 'empresa'} onChange={e => setEditForm(f => ({ ...f, area: e.target.value }))}
                      className="border border-gray-200 rounded py-1.5 px-2.5 text-[12px] font-sans outline-none focus:border-blue-400">
                      <option value="marketing">Marketing</option>
                      <option value="empresa">Empresa</option>
                      <option value="producto">Producto</option>
                    </select>
                    <textarea value={editForm.texto || ''} onChange={e => setEditForm(f => ({ ...f, texto: e.target.value }))}
                      className="w-full border border-gray-200 rounded py-1.5 px-2.5 text-[12px] font-sans outline-none focus:border-blue-400 resize-y min-h-[50px]" />
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={cancelEdit} className="text-[11px] text-gray-500 bg-transparent border border-gray-200 rounded px-2.5 py-1 cursor-pointer font-sans hover:bg-gray-50">Cancelar</button>
                      <button onClick={() => saveFbEdit(i)} className="text-[11px] text-white bg-blue-500 border-none rounded px-2.5 py-1 cursor-pointer font-sans hover:bg-blue-600">Guardar</button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={i} className={`flex items-start gap-2 group rounded-lg px-2.5 py-1.5 hover:bg-white transition-colors ${converted ? 'opacity-50' : ''}`}>
                  <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 shrink-0 mt-0.5"
                    style={{ background: area.bg, color: area.text }}>{area.label}</span>
                  <span className={`text-[12px] flex-1 min-w-0 ${converted ? 'line-through text-gray-400' : 'text-gray-700'}`}>{fb.texto}</span>
                  {!converted && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => startEdit('fb', i, { texto: fb.texto, area: fb.area })}
                        className="p-1 text-gray-400 hover:text-blue-500 bg-transparent border-none cursor-pointer" title="Editar"><Pencil size={11} /></button>
                      <button onClick={() => deleteFb(i)}
                        className="p-1 text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer" title="Eliminar"><Trash2 size={11} /></button>
                      <button onClick={() => convertFbToTask(i)}
                        className="p-1 text-gray-400 hover:text-green-500 bg-transparent border-none cursor-pointer" title="Convertir a tarea"><ArrowRight size={11} /></button>
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
    </div>
  );
}
