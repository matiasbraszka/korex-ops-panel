import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@korex/db';
import { X, Plus, Trash2, Pencil, Paperclip, Check, IdCard } from 'lucide-react';
import PagoModal from './PagoModal';
import ContratoModal from './ContratoModal';
import {
  CURRENCIES, inputCls, TONE_CLS,
  fmtMoney, fmtDate, fmtPeriod, yearsSince, antiguedadLabel,
  contractStatus, openStaffDoc, deleteStaffDoc,
} from './utils';

// Ficha completa de un miembro: datos y salario (staff_hr), historial de
// pagos con factura (staff_payments) y contratos (staff_contracts).
export default function FichaPersonal({ member, hr, payments, contracts, onClose, onChanged }) {
  const [pagoModal, setPagoModal] = useState(null);     // null | { initial? }
  const [contratoModal, setContratoModal] = useState(null);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[860px] max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-border flex items-center gap-3 sticky top-0 bg-white rounded-t-xl z-10">
          {member.avatar_url ? (
            <img src={member.avatar_url} alt={member.name} className="w-12 h-12 rounded-full object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[13px] font-bold"
                 style={{ background: member.color || '#5B7CF5' }}>
              {member.initials || member.name?.[0] || '?'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold text-text truncate">{member.name}</h2>
            <p className="text-[12px] text-text3 truncate">{member.role || 'Sin rol descriptivo'}</p>
          </div>
          <button onClick={onClose} className="text-text3 hover:text-text p-1.5 rounded hover:bg-surface2">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <DatosSalario member={member} hr={hr} onChanged={onChanged} />

          <DatosPersonales member={member} hr={hr} onChanged={onChanged} />

          <Pagos
            payments={payments}
            onNew={() => setPagoModal({})}
            onEdit={(p) => setPagoModal({ initial: p })}
            onChanged={onChanged}
          />

          <Contratos
            contracts={contracts}
            onNew={() => setContratoModal({})}
            onEdit={(c) => setContratoModal({ initial: c })}
            onChanged={onChanged}
          />
        </div>
      </div>

      {pagoModal && (
        <PagoModal
          member={member}
          initial={pagoModal.initial}
          defaultCurrency={hr?.currency || 'USD'}
          onClose={() => setPagoModal(null)}
          onDone={async () => { setPagoModal(null); await onChanged(); }}
        />
      )}

      {contratoModal && (
        <ContratoModal
          member={member}
          initial={contratoModal.initial}
          onClose={() => setContratoModal(null)}
          onDone={async () => { setContratoModal(null); await onChanged(); }}
        />
      )}
    </div>
  );
}

// ---------- Sección 1: datos y salario ----------

function DatosSalario({ member, hr, onChanged }) {
  const [form, setForm] = useState({
    birth_date: hr?.birth_date || '',
    start_date: hr?.start_date || '',
    promised_salary: hr?.promised_salary ?? '',
    hourly_rate: hr?.hourly_rate ?? '',
    currency: hr?.currency || 'USD',
    notes: hr?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  const save = async () => {
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('staff_hr').upsert({
      member_id: member.id,
      birth_date: form.birth_date || null,
      start_date: form.start_date || null,
      promised_salary: form.promised_salary === '' ? null : Number(form.promised_salary),
      hourly_rate: form.hourly_rate === '' ? null : Number(form.hourly_rate),
      currency: form.currency,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    await onChanged();
  };

  const edad = yearsSince(form.birth_date);
  const antiguedad = antiguedadLabel(form.start_date);

  return (
    <section>
      <SectionTitle>Datos y salario</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Fecha de nacimiento" hint={edad != null ? `${edad} años` : null}>
          <input type="date" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Fecha de ingreso a Korex" hint={antiguedad ? `Antigüedad: ${antiguedad}` : null}>
          <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Salario mensual prometido">
          <input type="number" min="0" step="0.01" value={form.promised_salary}
                 onChange={(e) => set('promised_salary', e.target.value)}
                 placeholder="0" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Salario por hora">
            <input type="number" min="0" step="0.01" value={form.hourly_rate}
                   onChange={(e) => set('hourly_rate', e.target.value)}
                   placeholder="0" className={inputCls} />
          </Field>
          <Field label="Moneda">
            <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className={inputCls}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Notas">
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2}
                      placeholder="Acuerdos particulares, contexto, lo que haga falta recordar…"
                      className={inputCls + ' resize-y'} />
          </Field>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button onClick={save} disabled={saving}
                className="py-2 px-4 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar datos'}
        </button>
        {saved && <span className="text-[12px] text-green-600 flex items-center gap-1"><Check size={13} /> Guardado</span>}
        {error && <span className="text-[12px] text-red">{error}</span>}
      </div>
    </section>
  );
}

// ---------- Sección 1b: datos personales y contacto ----------

const PERSONAL_FIELDS = [
  'gender', 'document_number',
  'address_street', 'address_city', 'address_zip', 'address_state', 'address_country',
  'whatsapp', 'personal_email', 'emergency_contact', 'payment_info',
];

function DatosPersonales({ member, hr, onChanged }) {
  const [form, setForm] = useState(() =>
    Object.fromEntries(PERSONAL_FIELDS.map((k) => [k, hr?.[k] || ''])));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  const save = async () => {
    setSaving(true); setError('');
    const patch = { member_id: member.id, updated_at: new Date().toISOString() };
    PERSONAL_FIELDS.forEach((k) => { patch[k] = form[k] || null; });
    const { error: err } = await supabase.from('staff_hr').upsert(patch);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    await onChanged();
  };

  return (
    <section>
      <SectionTitle>Datos personales y contacto</SectionTitle>

      {/* Fotos cargadas en el onboarding */}
      {(hr?.profile_photo_path || hr?.document_photo_path) && (
        <div className="flex items-center gap-4 mb-3">
          {hr?.profile_photo_path && (
            <SignedImg path={hr.profile_photo_path} label="Foto de perfil" />
          )}
          {hr?.document_photo_path && (
            <button onClick={() => openStaffDoc(hr.document_photo_path)}
                    className="flex items-center gap-2 text-[12px] text-blue hover:underline border border-border rounded-lg px-3 py-2">
              <IdCard size={15} /> Ver documento de identidad
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Género">
          <input value={form.gender} onChange={(e) => set('gender', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Documento de identidad (número)">
          <input value={form.document_number} onChange={(e) => set('document_number', e.target.value)} className={inputCls} />
        </Field>
        <Field label="WhatsApp">
          <input value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Mail personal">
          <input value={form.personal_email} onChange={(e) => set('personal_email', e.target.value)} className={inputCls} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Dirección — calle y número">
            <input value={form.address_street} onChange={(e) => set('address_street', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Ciudad">
          <input value={form.address_city} onChange={(e) => set('address_city', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Código postal">
          <input value={form.address_zip} onChange={(e) => set('address_zip', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Provincia / Estado">
          <input value={form.address_state} onChange={(e) => set('address_state', e.target.value)} className={inputCls} />
        </Field>
        <Field label="País">
          <input value={form.address_country} onChange={(e) => set('address_country', e.target.value)} className={inputCls} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Contacto de emergencia">
            <input value={form.emergency_contact} onChange={(e) => set('emergency_contact', e.target.value)}
                   placeholder="Nombre, vínculo y teléfono" className={inputCls} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Datos para el pago">
            <textarea value={form.payment_info} onChange={(e) => set('payment_info', e.target.value)} rows={2}
                      placeholder="CBU / Alias / cuenta, PayPal, Wise…" className={inputCls + ' resize-y'} />
          </Field>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button onClick={save} disabled={saving}
                className="py-2 px-4 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar datos personales'}
        </button>
        {saved && <span className="text-[12px] text-green-600 flex items-center gap-1"><Check size={13} /> Guardado</span>}
        {error && <span className="text-[12px] text-red">{error}</span>}
      </div>
    </section>
  );
}

// Miniatura de una imagen del bucket privado (resuelve un signed URL al montar).
function SignedImg({ path, label }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    supabase.storage.from('staff-docs').createSignedUrl(path, 3600).then(({ data }) => {
      if (alive) setUrl(data?.signedUrl || null);
    });
    return () => { alive = false; };
  }, [path]);
  return (
    <button onClick={() => openStaffDoc(path)} title={label} className="shrink-0">
      {url ? (
        <img src={url} alt={label} className="w-14 h-14 rounded-full object-cover border border-border" />
      ) : (
        <div className="w-14 h-14 rounded-full bg-surface2 animate-pulse" />
      )}
    </button>
  );
}

// ---------- Sección 2: historial de pagos ----------

function Pagos({ payments, onNew, onEdit, onChanged }) {
  // Total de los últimos 12 meses, separado por moneda.
  const totals = useMemo(() => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);
    const out = {};
    for (const p of payments) {
      if (new Date(p.period + 'T00:00:00') < cutoff) continue;
      out[p.currency || 'USD'] = (out[p.currency || 'USD'] || 0) + Number(p.amount || 0);
    }
    return out;
  }, [payments]);

  const remove = async (p) => {
    if (!confirm(`¿Eliminar el pago de ${fmtPeriod(p.period)} (${fmtMoney(p.amount, p.currency)})?`)) return;
    await deleteStaffDoc(p.invoice_path);
    await supabase.from('staff_payments').delete().eq('id', p.id);
    await onChanged();
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SectionTitle className="mb-0">
          Historial de pagos
          {Object.keys(totals).length > 0 && (
            <span className="font-normal text-text3 text-[11px] ml-2">
              Últimos 12 meses: {Object.entries(totals).map(([c, t]) => fmtMoney(t, c)).join(' + ')}
            </span>
          )}
        </SectionTitle>
        <button onClick={onNew}
                className="py-1.5 px-3 rounded-md bg-blue text-white text-[12px] hover:bg-blue-dark flex items-center gap-1.5">
          <Plus size={13} /> Registrar pago
        </button>
      </div>

      {payments.length === 0 ? (
        <EmptyBox>Sin pagos registrados todavía. Registrá cuánto se le pagó cada mes y adjuntá la factura.</EmptyBox>
      ) : (
        <div className="overflow-x-auto mt-2 border border-border rounded-lg">
          <table className="w-full text-[12px] min-w-[560px]">
            <thead>
              <tr className="text-[10px] font-semibold text-text3 uppercase border-b border-border bg-surface2/50">
                <th className="text-left py-2 px-3">Período</th>
                <th className="text-right py-2 px-3">Monto</th>
                <th className="text-left py-2 px-3">Pagado el</th>
                <th className="text-left py-2 px-3">Factura</th>
                <th className="text-left py-2 px-3">Notas</th>
                <th className="w-[70px]"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-b-0 hover:bg-surface2/40">
                  <td className="py-2 px-3 font-semibold text-text">{fmtPeriod(p.period)}</td>
                  <td className="py-2 px-3 text-right font-semibold text-text">{fmtMoney(p.amount, p.currency)}</td>
                  <td className="py-2 px-3 text-text2">{fmtDate(p.paid_at)}</td>
                  <td className="py-2 px-3">
                    {p.invoice_path ? (
                      <button onClick={() => openStaffDoc(p.invoice_path)}
                              className="text-blue hover:underline flex items-center gap-1 max-w-[180px]">
                        <Paperclip size={12} className="shrink-0" />
                        <span className="truncate">{p.invoice_filename || 'Ver factura'}</span>
                      </button>
                    ) : <span className="text-text3">—</span>}
                  </td>
                  <td className="py-2 px-3 text-text2 max-w-[200px] truncate" title={p.notes || ''}>{p.notes || '—'}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-0.5 justify-end">
                      <button onClick={() => onEdit(p)} className="text-text3 hover:text-blue p-1 rounded hover:bg-blue/10"><Pencil size={13} /></button>
                      <button onClick={() => remove(p)} className="text-text3 hover:text-red p-1 rounded hover:bg-red/10"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------- Sección 3: contratos ----------

function Contratos({ contracts, onNew, onEdit, onChanged }) {
  const remove = async (c) => {
    if (!confirm(`¿Eliminar el contrato "${c.title || 'sin título'}"?`)) return;
    await deleteStaffDoc(c.file_path);
    await supabase.from('staff_contracts').delete().eq('id', c.id);
    await onChanged();
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SectionTitle className="mb-0">Contratos</SectionTitle>
        <button onClick={onNew}
                className="py-1.5 px-3 rounded-md bg-blue text-white text-[12px] hover:bg-blue-dark flex items-center gap-1.5">
          <Plus size={13} /> Agregar contrato
        </button>
      </div>

      {contracts.length === 0 ? (
        <EmptyBox>Sin contratos cargados. Adjuntá el contrato enviado, con sus fechas y condiciones.</EmptyBox>
      ) : (
        <div className="space-y-2 mt-2">
          {contracts.map((c) => {
            const status = contractStatus(c);
            return (
              <div key={c.id} className="border border-border rounded-lg p-3 hover:bg-surface2/30">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-bold text-text">{c.title || 'Contrato'}</span>
                  <span className={`text-[10px] py-0.5 px-2 rounded-full font-semibold ${TONE_CLS[status.tone]}`}>
                    {status.label}
                  </span>
                  <div className="ml-auto flex items-center gap-0.5">
                    <button onClick={() => onEdit(c)} className="text-text3 hover:text-blue p-1 rounded hover:bg-blue/10"><Pencil size={13} /></button>
                    <button onClick={() => remove(c)} className="text-text3 hover:text-red p-1 rounded hover:bg-red/10"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap mt-1.5 text-[11px] text-text2">
                  <span>Enviado: <strong>{fmtDate(c.sent_at)}</strong></span>
                  <span>Inicio: <strong>{fmtDate(c.start_date)}</strong></span>
                  <span>Vencimiento: <strong>{c.end_date ? fmtDate(c.end_date) : 'Sin vencimiento'}</strong></span>
                  {c.file_path && (
                    <button onClick={() => openStaffDoc(c.file_path)}
                            className="text-blue hover:underline flex items-center gap-1">
                      <Paperclip size={12} /> {c.file_filename || 'Ver contrato'}
                    </button>
                  )}
                </div>
                {c.terms && (
                  <p className="text-[11px] text-text3 mt-1.5 whitespace-pre-wrap">{c.terms}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------- mini componentes ----------

function SectionTitle({ children, className = '' }) {
  return <h3 className={`text-[13px] font-bold text-text mb-2 ${className}`}>{children}</h3>;
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text2 mb-1">
        {label}
        {hint && <span className="font-normal text-text3 ml-2">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function EmptyBox({ children }) {
  return (
    <div className="border border-dashed border-border rounded-lg p-4 text-center text-[12px] text-text3 mt-2">
      {children}
    </div>
  );
}
