import { useEffect, useState } from 'react';

// Modal para crear o editar un lead.
// Props: open, onClose, lead (null = crear), stages, onCreate, onUpdate, onDelete.
export default function LeadModal({ open, onClose, lead, stages, onCreate, onUpdate, onDelete }) {
  const [form, setForm] = useState(emptyForm(stages));

  useEffect(() => {
    if (open) setForm(lead ? { ...emptyForm(stages), ...lead } : emptyForm(stages));
  }, [open, lead, stages]);

  if (!open) return null;

  const isEdit = !!lead?.id;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name?.trim()) { alert('El nombre es obligatorio.'); return; }
    if (isEdit) {
      await onUpdate(lead.id, {
        full_name: form.full_name.trim(),
        company_multinivel: form.company_multinivel?.trim() || null,
        proposal: form.proposal?.trim() || null,
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
        notes: form.notes?.trim() || null,
        stage_id: form.stage_id || null,
      });
    } else {
      await onCreate({
        full_name: form.full_name.trim(),
        company_multinivel: form.company_multinivel?.trim() || null,
        proposal: form.proposal?.trim() || null,
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
        notes: form.notes?.trim() || null,
        stage_id: form.stage_id || stages[0]?.id,
      });
    }
    onClose();
  };

  const handleDelete = async () => {
    if (!confirm('¿Eliminar este lead? Esta acción no se puede deshacer.')) return;
    await onDelete(lead.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="p-5 border-b border-border">
            <h2 className="text-[15px] font-bold">{isEdit ? 'Editar lead' : 'Nuevo lead'}</h2>
          </div>
          <div className="p-5 space-y-3.5">
            <Field label="Nombre *">
              <input required value={form.full_name || ''} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                     className={inputCls} autoFocus />
            </Field>
            <Field label="Empresa / Multinivel">
              <input value={form.company_multinivel || ''} onChange={(e) => setForm((f) => ({ ...f, company_multinivel: e.target.value }))}
                     className={inputCls} placeholder="Herbalife, Amway, ..." />
            </Field>
            <Field label="Propuesta">
              <textarea rows={2} value={form.proposal || ''} onChange={(e) => setForm((f) => ({ ...f, proposal: e.target.value }))}
                        className={inputCls + ' resize-y'} placeholder="Que le vamos a ofrecer..." />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Teléfono">
                <input value={form.phone || ''} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                       className={inputCls} placeholder="+34 612 ..." />
              </Field>
              <Field label="Email">
                <input type="email" value={form.email || ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                       className={inputCls} placeholder="correo@ejemplo.com" />
              </Field>
            </div>
            <Field label="Etapa">
              <select value={form.stage_id || ''} onChange={(e) => setForm((f) => ({ ...f, stage_id: e.target.value }))}
                      className={inputCls + ' cursor-pointer'}>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Notas">
              <textarea rows={4} value={form.notes || ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        className={inputCls + ' resize-y'} placeholder="Historial, observaciones, próximos pasos..." />
            </Field>
          </div>
          <div className="p-5 border-t border-border flex items-center justify-between gap-2">
            <div>
              {isEdit && (
                <button type="button" onClick={handleDelete}
                        className="text-xs text-red hover:underline">
                  Eliminar
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose}
                      className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] hover:bg-surface2">
                Cancelar
              </button>
              <button type="submit"
                      className="py-2 px-4 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark">
                {isEdit ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function emptyForm(stages) {
  return {
    full_name: '',
    company_multinivel: '',
    proposal: '',
    phone: '',
    email: '',
    notes: '',
    stage_id: stages?.[0]?.id || '',
  };
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
