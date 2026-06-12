import { useState } from 'react';
import { supabase } from '@korex/db';
import { Paperclip, X } from 'lucide-react';
import { CURRENCIES, inputCls, uploadStaffDoc, deleteStaffDoc } from './utils';

// Alta / edición de un pago mensual, con factura adjunta opcional.
export default function PagoModal({ member, initial, defaultCurrency = 'USD', onClose, onDone }) {
  const editing = !!initial;
  const [form, setForm] = useState({
    period: initial?.period ? initial.period.slice(0, 7) : new Date().toISOString().slice(0, 7), // YYYY-MM
    amount: initial?.amount ?? '',
    currency: initial?.currency || defaultCurrency,
    paid_at: initial?.paid_at || new Date().toISOString().slice(0, 10),
    notes: initial?.notes || '',
  });
  const [file, setFile] = useState(null);
  const [removeInvoice, setRemoveInvoice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.period) { setError('Elegí el mes.'); return; }
    if (form.amount === '' || Number(form.amount) < 0) { setError('Cargá el monto.'); return; }
    setSubmitting(true);
    try {
      let invoice_path = initial?.invoice_path || null;
      let invoice_filename = initial?.invoice_filename || null;

      if (removeInvoice && invoice_path) {
        await deleteStaffDoc(invoice_path);
        invoice_path = null;
        invoice_filename = null;
      }
      if (file) {
        if (invoice_path) await deleteStaffDoc(invoice_path);
        invoice_path = await uploadStaffDoc(member.id, 'facturas', file);
        invoice_filename = file.name;
      }

      const row = {
        member_id: member.id,
        period: `${form.period}-01`,
        amount: Number(form.amount),
        currency: form.currency,
        paid_at: form.paid_at || null,
        invoice_path,
        invoice_filename,
        notes: form.notes || null,
      };

      const { error: err } = editing
        ? await supabase.from('staff_payments').update(row).eq('id', initial.id)
        : await supabase.from('staff_payments').insert(row);
      if (err) throw err;

      await onDone();
    } catch (err) {
      setError(err.message || 'Error guardando el pago');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[460px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div className="p-5 border-b border-border">
            <h2 className="text-[15px] font-bold">{editing ? 'Editar pago' : 'Registrar pago'} — {member.name}</h2>
            <p className="text-xs text-text3 mt-1">Cuánto se le pagó ese mes. Podés adjuntar la factura que entregó.</p>
          </div>

          <div className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mes que se paga *">
                <input type="month" value={form.period} onChange={(e) => set('period', e.target.value)} required className={inputCls} />
              </Field>
              <Field label="Fecha de pago">
                <input type="date" value={form.paid_at} onChange={(e) => set('paid_at', e.target.value)} className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monto *">
                <input type="number" min="0" step="0.01" value={form.amount}
                       onChange={(e) => set('amount', e.target.value)} required placeholder="0" className={inputCls} autoFocus />
              </Field>
              <Field label="Moneda">
                <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className={inputCls}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Factura (PDF o imagen)">
              {initial?.invoice_path && !removeInvoice && !file && (
                <div className="flex items-center gap-2 text-[12px] text-text2 bg-surface2 rounded-md py-1.5 px-2 mb-1.5">
                  <Paperclip size={12} className="shrink-0" />
                  <span className="truncate flex-1">{initial.invoice_filename || 'Factura adjunta'}</span>
                  <button type="button" onClick={() => setRemoveInvoice(true)}
                          className="text-text3 hover:text-red p-0.5"><X size={13} /></button>
                </div>
              )}
              <input type="file" accept=".pdf,image/*"
                     onChange={(e) => setFile(e.target.files?.[0] || null)}
                     className="block w-full text-[12px] text-text2 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-blue/10 file:text-blue file:text-[12px] file:cursor-pointer cursor-pointer" />
              {removeInvoice && !file && <p className="text-[10px] text-red mt-1">La factura actual se va a eliminar al guardar.</p>}
            </Field>

            <Field label="Notas">
              <input value={form.notes} onChange={(e) => set('notes', e.target.value)}
                     placeholder="Bono, ajuste, aclaración…" className={inputCls} />
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
              {submitting ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar pago'}
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
