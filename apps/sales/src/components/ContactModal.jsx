import { useEffect, useState } from 'react';

export default function ContactModal({ open, contact, categories, onClose, onSave }) {
  const [form, setForm] = useState(empty());

  useEffect(() => {
    if (!open) return;
    setForm(contact ? { ...empty(), ...contact, categories: contact.categories || [] } : empty());
  }, [open, contact]);

  if (!open) return null;
  const isEdit = !!contact?.id;

  const toggleCat = (id) => {
    setForm((f) => {
      const set = new Set(f.categories || []);
      if (set.has(id)) set.delete(id); else set.add(id);
      return { ...f, categories: [...set] };
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    await onSave(form);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[520px] max-h-[90vh] max-md:max-h-[100vh] max-md:rounded-none max-md:max-w-full overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div className="p-5 border-b border-border">
            <h2 className="text-[15px] font-bold">{isEdit ? 'Detalle del contacto' : 'Nuevo contacto'}</h2>
          </div>
          <div className="p-5 space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre *">
                <input required value={form.first_name || ''}
                       onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                       className={inputCls} autoFocus />
              </Field>
              <Field label="Apellido">
                <input value={form.last_name || ''}
                       onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                       className={inputCls} />
              </Field>
            </div>
            <Field label="Empresa / Multinivel">
              <input value={form.company || ''}
                     onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                     className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Teléfono">
                <input value={form.phone || ''}
                       onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                       className={inputCls} placeholder="+34 612 ..." />
              </Field>
              <Field label="Email">
                <input type="email" value={form.email || ''}
                       onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                       className={inputCls} placeholder="correo@ejemplo.com" />
              </Field>
            </div>
            <Field label="Categorías">
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => {
                  const active = (form.categories || []).includes(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => toggleCat(c.id)}
                            className={`px-2 py-1 rounded-full text-[11px] border transition-colors flex items-center gap-1.5 ${active ? 'border-transparent text-white' : 'border-border bg-white text-text2 hover:bg-surface2'}`}
                            style={active ? { background: c.color } : undefined}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? '#fff' : c.color }} />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Notas">
              <textarea rows={4} value={form.notes || ''}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        className={inputCls + ' resize-y'} placeholder="Contexto, observaciones…" />
            </Field>
            {isEdit && (form.linked_client_id || form.linked_team_member_id) && (
              <div className="text-[11px] text-text3 bg-surface2 rounded-md p-2.5 space-y-1">
                {form.linked_client_id && <div>Vinculado a cliente de Operaciones: <code className="text-[10px]">{form.linked_client_id}</code></div>}
                {form.linked_team_member_id && <div>Vinculado al equipo Korex.</div>}
              </div>
            )}
          </div>
          <div className="p-5 border-t border-border flex items-center justify-end gap-2">
            <button type="button" onClick={onClose}
                    className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] hover:bg-surface2">Cancelar</button>
            <button type="submit"
                    className="py-2 px-4 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark">{isEdit ? 'Guardar' : 'Crear'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function empty() {
  return { first_name: '', last_name: '', phone: '', email: '', company: '', notes: '', categories: [] };
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text2 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(91,124,245,0.1)]';
