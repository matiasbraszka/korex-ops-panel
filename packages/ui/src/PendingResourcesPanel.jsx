import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, CheckCircle2, Circle } from 'lucide-react';

// Panel de "Recursos pendientes": checklist editable de recursos que el
// cliente nos debe enviar (logo, fotos, testimonios, etc.).
//
// Props:
//   - items: [{ id, label, description, done }]
//   - onToggle(id): marca/desmarca
//   - onAdd({ label, description })
//   - onUpdate(id, { label, description })
//   - onDelete(id)
//   - title: string (default "Recursos pendientes")
//
// Cada item muestra label + descripción visible debajo (sin click).
// El header muestra contador "X pendientes" en vivo.

export default function PendingResourcesPanel({
  items = [],
  onToggle,
  onAdd,
  onUpdate,
  onDelete,
  title = 'Recursos pendientes',
}) {
  const [modal, setModal] = useState(null); // null | { mode: 'new'|'edit', initial }

  const total = items.length;
  const pending = items.filter((i) => !i.done).length;
  const completed = total - pending;

  const openNew = () => setModal({ mode: 'new', initial: { label: '', description: '' } });
  const openEdit = (it) => setModal({ mode: 'edit', initial: it });
  const close = () => setModal(null);

  const submit = async (form) => {
    if (modal.mode === 'new') {
      await onAdd?.({ label: form.label.trim(), description: form.description.trim() });
    } else {
      await onUpdate?.(modal.initial.id, { label: form.label.trim(), description: form.description.trim() });
    }
    close();
  };

  const handleDelete = (it) => {
    const label = it.label || 'este item';
    if (window.confirm(`¿Eliminar "${label}"? No se puede deshacer.`)) onDelete?.(it.id);
  };

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden flex flex-col">
      <div className="py-3 px-4 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 rounded-md flex items-center justify-center text-[13px] shrink-0"
                style={{ background: '#FEF3C7', color: '#D97706' }}>
            ✓
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-bold truncate">{title}</div>
            <div className="text-[10.5px] text-text3 mt-px">
              {pending === 0 && total > 0
                ? <span className="text-green-600 font-semibold">Todo recibido ✓</span>
                : <><span className="font-semibold text-text2">{pending}</span> pendiente{pending === 1 ? '' : 's'}{total > 0 && <> · {completed}/{total} recibidos</>}</>
              }
            </div>
          </div>
        </div>
        <button onClick={openNew}
                title="Agregar nuevo item"
                className="shrink-0 bg-transparent border-none text-text2 cursor-pointer text-xs py-1 px-2 rounded hover:bg-surface2 font-sans flex items-center gap-1">
          <Plus size={13} /> Nuevo
        </button>
      </div>

      <div className="py-2 px-2 flex-1 overflow-y-auto">
        {total === 0 ? (
          <div className="text-center text-text3 text-xs py-8 px-4">
            <p className="font-medium mb-1">Sin recursos pendientes</p>
            <p className="text-[10px]">Agregá los items que el cliente debe enviarte.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {items.map((it) => {
              const done = !!it.done;
              return (
                <div key={it.id}
                     className={`group flex items-start gap-2.5 py-2 px-2.5 rounded-md border transition-colors ${
                       done
                         ? 'bg-green-50/40 border-green-100'
                         : 'bg-white border-border hover:bg-surface2/50'
                     }`}>
                  <button onClick={() => onToggle?.(it.id)}
                          title={done ? 'Marcar como pendiente' : 'Marcar como recibido'}
                          aria-label={done ? 'Marcar como pendiente' : 'Marcar como recibido'}
                          className="shrink-0 mt-px bg-transparent border-none cursor-pointer p-0 leading-none">
                    {done
                      ? <CheckCircle2 size={18} className="text-green-600" strokeWidth={2.25} />
                      : <Circle size={18} className="text-text3 hover:text-blue" strokeWidth={1.75} />
                    }
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[12.5px] font-semibold leading-tight ${
                      done ? 'text-text3 line-through' : 'text-text'
                    }`}>
                      {it.label || <span className="italic text-text3">Sin título</span>}
                    </div>
                    {it.description && (
                      <div className={`text-[11px] mt-0.5 leading-relaxed ${
                        done ? 'text-text3/70' : 'text-text3'
                      }`}>
                        {it.description}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => openEdit(it)}
                            title="Editar"
                            aria-label="Editar item"
                            className="text-text3 hover:text-blue hover:bg-blue-bg2 bg-transparent border-none cursor-pointer p-1.5 rounded transition-colors flex items-center justify-center">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => handleDelete(it)}
                            title="Eliminar"
                            aria-label="Eliminar item"
                            className="text-text3 hover:text-red hover:bg-red-bg bg-transparent border-none cursor-pointer p-1.5 rounded transition-colors flex items-center justify-center">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && (
        <PendingResourceModal
          mode={modal.mode}
          initial={modal.initial}
          onSubmit={submit}
          onClose={close}
        />
      )}
    </div>
  );
}

function PendingResourceModal({ mode, initial, onSubmit, onClose }) {
  const [form, setForm] = useState({ label: '', description: '' });

  useEffect(() => {
    setForm({ label: initial?.label || '', description: initial?.description || '' });
  }, [initial]);

  const submit = (e) => {
    e.preventDefault();
    if (!form.label.trim()) { alert('El nombre del item es obligatorio.'); return; }
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[460px]" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div className="p-5 border-b border-border">
            <h2 className="text-[15px] font-bold">{mode === 'new' ? 'Nuevo recurso pendiente' : 'Editar recurso pendiente'}</h2>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-text2 mb-1">Nombre *</label>
              <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                     placeholder="Logo en alta resolución"
                     autoFocus
                     className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-[13px] outline-none focus:border-blue" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text2 mb-1">Descripción</label>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        rows={3}
                        placeholder="Detalle visible debajo del título (qué pedirle al cliente exactamente)"
                        className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-[13px] outline-none focus:border-blue resize-none" />
            </div>
          </div>
          <div className="p-5 border-t border-border flex justify-end gap-2">
            <button type="button" onClick={onClose}
                    className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] hover:bg-surface2">
              Cancelar
            </button>
            <button type="submit"
                    className="py-2 px-4 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark">
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
