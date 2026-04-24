import { useEffect, useState } from 'react';
import { supabase } from '@korex/db';

// Modal para crear o editar un lead.
// Props: open, onClose, lead (null = crear), stages, onCreate, onUpdate, onDelete.
export default function LeadModal({ open, onClose, lead, stages, onCreate, onUpdate, onDelete }) {
  const [form, setForm] = useState(emptyForm(stages));
  const [calls, setCalls] = useState([]);
  const [loadingCalls, setLoadingCalls] = useState(false);

  useEffect(() => {
    if (open) setForm(lead ? { ...emptyForm(stages), ...lead } : emptyForm(stages));
  }, [open, lead, stages]);

  // Cargar historial de llamadas del lead (vista sales_v_lead_calls).
  useEffect(() => {
    if (!open || !lead?.id) { setCalls([]); return; }
    let cancelled = false;
    setLoadingCalls(true);
    supabase
      .from('sales_v_lead_calls')
      .select('*')
      .eq('lead_id', lead.id)
      .order('fecha', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('Error cargando llamadas del lead', error);
        setCalls(data || []);
        setLoadingCalls(false);
      });
    return () => { cancelled = true; };
  }, [open, lead?.id]);

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

            {isEdit && (
              <div className="pt-2 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-text2">Historial de llamadas</label>
                  <span className="text-[10px] text-text3">{calls.length} {calls.length === 1 ? 'llamada' : 'llamadas'}</span>
                </div>
                {loadingCalls ? (
                  <div className="text-[11px] text-text3 text-center py-3">Cargando…</div>
                ) : calls.length === 0 ? (
                  <div className="text-[11px] text-text3 text-center py-3 bg-surface2 rounded-md">
                    Sin llamadas registradas. Cuando entre una llamada de ventas con este nombre,
                    se va a asociar automáticamente acá.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {calls.map((c) => (
                      <div key={c.llamada_id} className="bg-surface2 rounded-md p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-[12px] font-semibold text-text truncate flex-1">{c.titulo}</div>
                          <div className="text-[10px] text-text3 shrink-0">
                            {c.fecha ? new Date(c.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : ''}
                          </div>
                        </div>
                        {c.resumen && <div className="text-[11px] text-text2 mt-1 line-clamp-3">{c.resumen}</div>}
                        <div className="flex items-center gap-3 mt-1.5">
                          {c.duracion_min && <span className="text-[10px] text-text3">{c.duracion_min} min</span>}
                          {c.recording_url && (
                            <a href={c.recording_url} target="_blank" rel="noreferrer"
                               className="text-[10px] text-blue hover:underline">
                              Ver grabación
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
