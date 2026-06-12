import { useState } from 'react';
import { supabase } from '@korex/db';
import { Paperclip, X } from 'lucide-react';
import { inputCls, uploadStaffDoc, deleteStaffDoc } from './utils';

// Alta / edición de un contrato enviado al miembro, con archivo adjunto.
export default function ContratoModal({ member, initial, onClose, onDone }) {
  const editing = !!initial;
  const [form, setForm] = useState({
    title: initial?.title || '',
    sent_at: initial?.sent_at || new Date().toISOString().slice(0, 10),
    start_date: initial?.start_date || '',
    end_date: initial?.end_date || '',
    terms: initial?.terms || '',
  });
  const [file, setFile] = useState(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.end_date && form.start_date && form.end_date < form.start_date) {
      setError('El vencimiento no puede ser anterior al inicio.');
      return;
    }
    setSubmitting(true);
    try {
      let file_path = initial?.file_path || null;
      let file_filename = initial?.file_filename || null;

      if (removeFile && file_path) {
        await deleteStaffDoc(file_path);
        file_path = null;
        file_filename = null;
      }
      if (file) {
        if (file_path) await deleteStaffDoc(file_path);
        file_path = await uploadStaffDoc(member.id, 'contratos', file);
        file_filename = file.name;
      }

      const row = {
        member_id: member.id,
        title: form.title.trim() || 'Contrato',
        sent_at: form.sent_at || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        terms: form.terms.trim() || null,
        file_path,
        file_filename,
      };

      const { error: err } = editing
        ? await supabase.from('staff_contracts').update(row).eq('id', initial.id)
        : await supabase.from('staff_contracts').insert(row);
      if (err) throw err;

      await onDone();
    } catch (err) {
      setError(err.message || 'Error guardando el contrato');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[480px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div className="p-5 border-b border-border">
            <h2 className="text-[15px] font-bold">{editing ? 'Editar contrato' : 'Agregar contrato'} — {member.name}</h2>
            <p className="text-xs text-text3 mt-1">
              Adjuntá el contrato enviado y detallá fechas y condiciones (ej. "primer mes de prueba US$ 500, después US$ 800").
            </p>
          </div>

          <div className="p-5 space-y-3">
            <Field label="Título">
              <input value={form.title} onChange={(e) => set('title', e.target.value)}
                     placeholder="Contrato de servicios 2026" className={inputCls} autoFocus />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Enviado el">
                <input type="date" value={form.sent_at} onChange={(e) => set('sent_at', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Inicio">
                <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Vencimiento">
                <input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} className={inputCls} />
              </Field>
            </div>
            <p className="text-[10px] text-text3 -mt-1">Dejá el vencimiento vacío si el contrato no vence.</p>

            <Field label="Condiciones">
              <textarea value={form.terms} onChange={(e) => set('terms', e.target.value)} rows={3}
                        placeholder={'Período de prueba, escalas de pago, cláusulas particulares…'}
                        className={inputCls + ' resize-y'} />
            </Field>

            <Field label="Archivo del contrato (PDF)">
              {initial?.file_path && !removeFile && !file && (
                <div className="flex items-center gap-2 text-[12px] text-text2 bg-surface2 rounded-md py-1.5 px-2 mb-1.5">
                  <Paperclip size={12} className="shrink-0" />
                  <span className="truncate flex-1">{initial.file_filename || 'Contrato adjunto'}</span>
                  <button type="button" onClick={() => setRemoveFile(true)}
                          className="text-text3 hover:text-red p-0.5"><X size={13} /></button>
                </div>
              )}
              <input type="file" accept=".pdf,.doc,.docx,image/*"
                     onChange={(e) => setFile(e.target.files?.[0] || null)}
                     className="block w-full text-[12px] text-text2 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-blue/10 file:text-blue file:text-[12px] file:cursor-pointer cursor-pointer" />
              {removeFile && !file && <p className="text-[10px] text-red mt-1">El archivo actual se va a eliminar al guardar.</p>}
            </Field>

            {error && <div className="text-red text-xs bg-red/5 rounded-md p-2">{error}</div>}
          </div>

          <div className="p-5 border-t border-border flex justify-end gap-2">
            <button type="button" onClick={onClose}
                    className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] hover:bg-surface2">
              Cancelar
            </button>
            <button type="submit" disabled={submitting}
                    className="py-2 px-4 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark disabled:opacity-60">
              {submitting ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar contrato'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text2 mb-1">{label}</label>
      {children}
    </div>
  );
}
