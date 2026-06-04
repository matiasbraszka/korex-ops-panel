import { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import Modal from '../Modal';
import { CreditCard, FileText, ExternalLink, Plus, Pencil, Trash2, Scale, Calendar, AlertTriangle } from 'lucide-react';
import { fmtDate, today, daysBetween } from '../../utils/helpers';

const CURR_SYMBOL = { USD: '$', EUR: '€', ARS: '$', MXN: 'MX$' };
const CYCLE_OPTIONS = [
  ['mensual', 'Mensual'], ['trimestral', 'Trimestral'], ['semestral', 'Semestral'],
  ['anual', 'Anual'], ['unico', 'Pago único'],
];
const PAYMENT_METHODS = ['Stripe', 'Transferencia', 'PayPal', 'Mercury', 'Efectivo', 'Otro'];
const BILLING_STATUS = {
  al_dia:    { bg: '#ECFDF5', fg: '#16A34A', label: 'Al día' },
  pendiente: { bg: '#FEFCE8', fg: '#CA8A04', label: 'Pendiente' },
  impago:    { bg: '#FEF2F2', fg: '#EF4444', label: 'Impago' },
};
const INVOICE_STATUS = {
  pagada:    { bg: '#ECFDF5', fg: '#16A34A', label: 'Pagada' },
  pendiente: { bg: '#FEFCE8', fg: '#CA8A04', label: 'Pendiente' },
  vencida:   { bg: '#FEF2F2', fg: '#EF4444', label: 'Vencida' },
};

function LegalCard({ c, onEdit }) {
  const hasContract = !!(c.contractUrl || c.contractSignedDate || c.contractRenewalDate);
  // Renewal warning: less than 30 days left
  let renewalWarn = null;
  if (c.contractRenewalDate) {
    const diff = daysBetween(today(), c.contractRenewalDate);
    if (diff != null) {
      if (diff < 0) renewalWarn = { color: '#EF4444', text: `Vencido hace ${-diff} día${diff === -1 ? '' : 's'}` };
      else if (diff <= 30) renewalWarn = { color: '#F97316', text: `Renueva en ${diff} día${diff === 1 ? '' : 's'}` };
      else renewalWarn = { color: '#16A34A', text: `Renueva en ${diff} días` };
    }
  }

  return (
    <div className="bg-white border border-[#E2E5EB] rounded-xl shadow-sm p-[18px]">
      <div className="flex items-center justify-between mb-3">
        <div className="inline-flex items-center gap-2 font-bold text-[14px]" style={{ color: '#1A1D26' }}>
          <Scale size={16} className="text-text2" /> Legal · Contrato
        </div>
        <button className="inline-flex items-center gap-1 text-[11.5px] py-1 px-2 rounded-md border border-[#E2E5EB] bg-white cursor-pointer hover:border-blue hover:text-blue" style={{ color: '#6B7280' }} onClick={onEdit}>
          <Pencil size={11} /> Editar
        </button>
      </div>
      {!hasContract ? (
        <div className="text-center text-[12px] py-4" style={{ color: '#9CA3AF' }}>
          Sin contrato cargado. Tocá <b>Editar</b> para agregar.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {c.contractUrl ? (
            <a href={c.contractUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg border border-[#E2E5EB] no-underline hover:border-blue hover:bg-blue-bg2 transition-colors" style={{ color: '#1A1D26' }}>
              <span className="w-8 h-8 rounded-md inline-flex items-center justify-center shrink-0" style={{ background: '#F5F3FF' }}>
                <FileText size={14} className="text-purple" />
              </span>
              <span className="flex-1 min-w-0">
                <b className="text-[12.5px] font-semibold block">Contrato firmado</b>
                <i className="not-italic text-[10.5px] block truncate" style={{ color: '#9CA3AF' }}>Abrir PDF</i>
              </span>
              <ExternalLink size={12} className="text-text3 shrink-0" />
            </a>
          ) : (
            <div className="text-[11.5px] italic" style={{ color: '#9CA3AF' }}>Sin PDF adjunto</div>
          )}
          <div className="grid gap-y-2 gap-x-3 text-[12.5px]" style={{ gridTemplateColumns: 'auto 1fr' }}>
            <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: '#9CA3AF' }}><Calendar size={11} /> Firma</span>
            <span className="text-right" style={{ color: '#1A1D26' }}>{c.contractSignedDate ? fmtDate(c.contractSignedDate) : '—'}</span>
            <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: '#9CA3AF' }}><Calendar size={11} /> Renovación</span>
            <span className="text-right" style={{ color: '#1A1D26' }}>{c.contractRenewalDate ? fmtDate(c.contractRenewalDate) : '—'}</span>
          </div>
          {renewalWarn && (
            <div className="inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-md text-[11px] font-semibold" style={{ background: renewalWarn.color + '15', color: renewalWarn.color }}>
              <AlertTriangle size={12} /> {renewalWarn.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LegalEditModal({ open, onClose, client, updateClient }) {
  const [form, setForm] = useState({
    contractUrl: client.contractUrl || '',
    contractSignedDate: client.contractSignedDate || '',
    contractRenewalDate: client.contractRenewalDate || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = () => {
    updateClient(client.id, {
      contractUrl: form.contractUrl.trim() || null,
      contractSignedDate: form.contractSignedDate || null,
      contractRenewalDate: form.contractRenewalDate || null,
    });
    onClose();
  };
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Editar contrato" maxWidth={500}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cancelar</button>
          <button className="text-[12.5px] py-2 px-4 rounded-lg border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark" onClick={save}>Guardar</button>
        </div>
      }
    >
      <div className="grid gap-3 p-1">
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>URL del contrato (PDF)</label>
          <input type="url" value={form.contractUrl} onChange={e => set('contractUrl', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue focus:ring focus:ring-blue-bg bg-white" placeholder="https://drive.google.com/..." autoFocus />
          <span className="text-[10.5px]" style={{ color: '#9CA3AF' }}>Subí el PDF a Drive y pegá el link público o de la carpeta.</span>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="grid gap-1">
            <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Fecha de firma</label>
            <input type="date" value={form.contractSignedDate} onChange={e => set('contractSignedDate', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white" />
          </div>
          <div className="grid gap-1">
            <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Fecha de renovación</label>
            <input type="date" value={form.contractRenewalDate} onChange={e => set('contractRenewalDate', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white" />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function BillingSummary({ c, onEdit }) {
  const bs = BILLING_STATUS[c.billingStatus || 'al_dia'];
  const sym = CURR_SYMBOL[c.billingCurrency || 'EUR'] || '€';
  const cycle = CYCLE_OPTIONS.find(([k]) => k === c.billingCycle)?.[1] || 'Mensual';

  return (
    <div className="bg-white border border-[#E2E5EB] rounded-xl shadow-sm p-[18px]">
      <div className="flex items-center justify-between mb-3">
        <div className="inline-flex items-center gap-2 font-bold text-[14px]" style={{ color: '#1A1D26' }}>
          <CreditCard size={16} className="text-text2" /> Resumen
        </div>
        <button className="inline-flex items-center gap-1 text-[11.5px] py-1 px-2 rounded-md border border-[#E2E5EB] bg-white cursor-pointer hover:border-blue hover:text-blue" style={{ color: '#6B7280' }} onClick={onEdit}>
          <Pencil size={11} /> Editar
        </button>
      </div>
      <div className="grid gap-y-2 gap-x-3 text-[12.5px]" style={{ gridTemplateColumns: 'auto 1fr' }}>
        <span className="font-medium" style={{ color: '#9CA3AF' }}>Importe</span>
        <span className="font-semibold text-right" style={{ color: '#1A1D26' }}>{c.billingAmount != null ? `${sym}${Number(c.billingAmount).toLocaleString()}` : '—'}</span>
        <span className="font-medium" style={{ color: '#9CA3AF' }}>Ciclo</span>
        <span className="text-right" style={{ color: '#1A1D26' }}>{cycle}{c.billingInstallments > 1 ? ` · ${c.billingInstallments} cuotas` : ''}</span>
        <span className="font-medium" style={{ color: '#9CA3AF' }}>Próximo cobro</span>
        <span className="text-right" style={{ color: '#1A1D26' }}>{c.nextChargeDate ? fmtDate(c.nextChargeDate) : '—'}</span>
        <span className="font-medium" style={{ color: '#9CA3AF' }}>Método</span>
        <span className="text-right" style={{ color: '#1A1D26' }}>{c.paymentMethod || '—'}</span>
        <span className="font-medium" style={{ color: '#9CA3AF' }}>Estado</span>
        <span className="text-right">
          <span className="inline-flex items-center py-[3px] px-[9px] rounded-full text-[10px] font-bold" style={{ background: bs.bg, color: bs.fg }}>{bs.label}</span>
        </span>
      </div>
    </div>
  );
}

function InvoiceItem({ inv, onEdit, onDelete }) {
  const st = INVOICE_STATUS[inv.status] || INVOICE_STATUS.pendiente;
  const sym = CURR_SYMBOL[inv.currency] || inv.currency;
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 border-b border-[#F0F2F5] last:border-b-0 hover:bg-[#F7F9FC] group">
      <span className="w-8 h-8 rounded-md inline-flex items-center justify-center shrink-0" style={{ background: '#F0F2F5' }}>
        <FileText size={14} className="text-text2" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold truncate" style={{ color: '#1A1D26' }}>Factura #{inv.number}</div>
        <div className="text-[10.5px]" style={{ color: '#9CA3AF' }}>{fmtDate(inv.issue_date)} · {sym}{Number(inv.amount).toLocaleString()}{inv.concept ? ' · ' + inv.concept : ''}</div>
      </div>
      <span className="inline-flex items-center py-[3px] px-[9px] rounded-full text-[10px] font-bold shrink-0" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
      {inv.pdf_url ? (
        <a href={inv.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[11px] text-blue font-medium no-underline hover:underline shrink-0">PDF <ExternalLink size={11} /></a>
      ) : <span className="text-[11px] text-text3 shrink-0">sin PDF</span>}
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button className="w-6 h-6 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center" onClick={() => onEdit(inv)} title="Editar"><Pencil size={11} /></button>
        <button className="w-6 h-6 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => { if (window.confirm(`¿Borrar factura #${inv.number}?`)) onDelete(inv.id); }} title="Eliminar"><Trash2 size={11} /></button>
      </div>
    </div>
  );
}

function InvoiceModal({ open, onClose, clientId, initial, addInvoice, updateInvoice, defaultCurrency }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(() => initial ? {
    number: initial.number,
    issue_date: initial.issue_date,
    amount: initial.amount,
    currency: initial.currency,
    concept: initial.concept || '',
    status: initial.status,
    payment_method: initial.payment_method || '',
    pdf_url: initial.pdf_url || '',
  } : {
    number: '',
    issue_date: today(),
    amount: '',
    currency: defaultCurrency || 'EUR',
    concept: '',
    status: 'pendiente',
    payment_method: '',
    pdf_url: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.number.trim() || !form.issue_date || !form.amount) return;
    setSaving(true);
    try {
      if (isEdit) {
        await updateInvoice(initial.id, {
          number: form.number.trim(),
          issue_date: form.issue_date,
          amount: Number(form.amount),
          currency: form.currency,
          concept: form.concept.trim() || null,
          status: form.status,
          payment_method: form.payment_method.trim() || null,
          pdf_url: form.pdf_url.trim() || null,
        });
      } else {
        await addInvoice({
          client_id: clientId,
          number: form.number.trim(),
          issue_date: form.issue_date,
          amount: Number(form.amount),
          currency: form.currency,
          concept: form.concept.trim() || null,
          status: form.status,
          payment_method: form.payment_method.trim() || null,
          pdf_url: form.pdf_url.trim() || null,
        });
      }
      onClose();
    } catch (e) {
      console.warn('save invoice error', e);
      alert('Error al guardar la factura');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Editar factura #${initial.number}` : 'Agregar factura'} maxWidth={520}>
      <div className="grid gap-3 p-1">
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Nº de factura *</label>
          <input type="text" value={form.number} onChange={e => set('number', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue focus:ring focus:ring-blue-bg" placeholder="1040" />
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="grid gap-1">
            <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Fecha de emisión *</label>
            <input type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue" />
          </div>
          <div className="grid gap-1">
            <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Importe *</label>
            <div className="flex gap-1">
              <select value={form.currency} onChange={e => set('currency', e.target.value)} className="text-[13px] py-2 px-2 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white">
                <option value="EUR">€</option><option value="USD">$</option><option value="ARS">AR$</option><option value="MXN">MX$</option>
              </select>
              <input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue flex-1" placeholder="1500" />
            </div>
          </div>
        </div>
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Concepto / Periodo</label>
          <input type="text" value={form.concept} onChange={e => set('concept', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue" placeholder="Servicio de marketing — Mayo 2026" />
        </div>
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Estado</label>
          <div className="flex gap-1.5">
            {Object.entries(INVOICE_STATUS).map(([k, v]) => (
              <button key={k} type="button" className={`text-[11.5px] py-1.5 px-3 rounded-lg border cursor-pointer font-medium ${form.status === k ? 'border-2' : 'bg-white'}`} style={form.status === k ? { borderColor: v.fg, background: v.bg, color: v.fg } : { borderColor: '#E2E5EB', color: '#6B7280' }} onClick={() => set('status', k)}>{v.label}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="grid gap-1">
            <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Método de pago</label>
            <select value={form.payment_method} onChange={e => set('payment_method', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white">
              <option value="">—</option>
              {PAYMENT_METHODS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>URL del PDF</label>
            <input type="url" value={form.pdf_url} onChange={e => set('pdf_url', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue" placeholder="https://..." />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-[#F0F2F5] mt-2">
          <button className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cancelar</button>
          <button className="text-[12.5px] py-2 px-4 rounded-lg border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark disabled:opacity-50" disabled={saving || !form.number.trim() || !form.amount} onClick={handleSave}>{saving ? 'Guardando…' : (isEdit ? 'Guardar' : 'Guardar factura')}</button>
        </div>
      </div>
    </Modal>
  );
}

function BillingEditModal({ open, onClose, client, updateClient }) {
  const [form, setForm] = useState({
    billingAmount: client.billingAmount ?? '',
    billingCurrency: client.billingCurrency || 'EUR',
    billingCycle: client.billingCycle || 'mensual',
    billingInstallments: client.billingInstallments || 1,
    nextChargeDate: client.nextChargeDate || '',
    paymentMethod: client.paymentMethod || '',
    billingStatus: client.billingStatus || 'al_dia',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    updateClient(client.id, {
      billingAmount: form.billingAmount === '' ? null : Number(form.billingAmount),
      billingCurrency: form.billingCurrency,
      billingCycle: form.billingCycle,
      billingInstallments: Number(form.billingInstallments) || 1,
      nextChargeDate: form.nextChargeDate || null,
      paymentMethod: form.paymentMethod || null,
      billingStatus: form.billingStatus,
    });
    onClose();
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Editar facturación" maxWidth={540}>
      <div className="grid gap-3 p-1">
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="grid gap-1">
            <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Importe</label>
            <div className="flex gap-1">
              <select value={form.billingCurrency} onChange={e => set('billingCurrency', e.target.value)} className="text-[13px] py-2 px-2 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white">
                <option value="EUR">€</option><option value="USD">$</option><option value="ARS">AR$</option><option value="MXN">MX$</option>
              </select>
              <input type="number" step="0.01" value={form.billingAmount} onChange={e => set('billingAmount', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue flex-1" placeholder="1500" />
            </div>
          </div>
          <div className="grid gap-1">
            <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Ciclo</label>
            <select value={form.billingCycle} onChange={e => set('billingCycle', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white">
              {CYCLE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="grid gap-1">
            <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Cuotas</label>
            <input type="number" min="1" value={form.billingInstallments} onChange={e => set('billingInstallments', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue" />
          </div>
          <div className="grid gap-1">
            <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Próximo cobro</label>
            <input type="date" value={form.nextChargeDate} onChange={e => set('nextChargeDate', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue" />
          </div>
        </div>
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Método de pago</label>
          <select value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white">
            <option value="">—</option>
            {PAYMENT_METHODS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Estado</label>
          <div className="flex gap-1.5">
            {Object.entries(BILLING_STATUS).map(([k, v]) => (
              <button key={k} type="button" className={`text-[11.5px] py-1.5 px-3 rounded-lg border cursor-pointer font-medium ${form.billingStatus === k ? 'border-2' : 'bg-white'}`} style={form.billingStatus === k ? { borderColor: v.fg, background: v.bg, color: v.fg } : { borderColor: '#E2E5EB', color: '#6B7280' }} onClick={() => set('billingStatus', k)}>{v.label}</button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-[#F0F2F5] mt-2">
          <button className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cancelar</button>
          <button className="text-[12.5px] py-2 px-4 rounded-lg border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark" onClick={handleSave}>Guardar</button>
        </div>
      </div>
    </Modal>
  );
}

export default function BillingTab({ client }) {
  const { invoices, addInvoice, updateInvoice, deleteInvoice, updateClient } = useApp();
  const [invoiceModal, setInvoiceModal] = useState(null); // null | 'new' | invoice obj
  const [billingModal, setBillingModal] = useState(false);
  const [legalModal, setLegalModal] = useState(false);

  const myInvoices = useMemo(
    () => invoices.filter(i => i.client_id === client.id).sort((a, b) => (b.issue_date || '').localeCompare(a.issue_date || '')),
    [invoices, client.id]
  );

  return (
    <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: '330px 1fr' }}>
      <div className="flex flex-col gap-4">
        <BillingSummary c={client} onEdit={() => setBillingModal(true)} />
        <LegalCard c={client} onEdit={() => setLegalModal(true)} />
      </div>

      <div className="bg-white border border-[#E2E5EB] rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between py-3 px-4 border-b border-[#F0F2F5]">
          <div className="inline-flex items-center gap-2 font-bold text-[14px]" style={{ color: '#1A1D26' }}>
            <FileText size={16} className="text-text2" /> Facturas ({myInvoices.length})
          </div>
          <button className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold py-1.5 px-3 rounded-lg bg-blue text-white border-none cursor-pointer hover:bg-blue-dark" onClick={() => setInvoiceModal('new')}>
            <Plus size={12} /> Agregar factura
          </button>
        </div>
        {myInvoices.length === 0 ? (
          <div className="text-center text-text3 text-[12px] py-10">Sin facturas registradas. Tocá "Agregar factura" para la primera.</div>
        ) : (
          <div>
            {myInvoices.map(inv => (
              <InvoiceItem key={inv.id} inv={inv} onEdit={(i) => setInvoiceModal(i)} onDelete={deleteInvoice} />
            ))}
          </div>
        )}
      </div>

      {invoiceModal && (
        <InvoiceModal
          open={!!invoiceModal}
          onClose={() => setInvoiceModal(null)}
          clientId={client.id}
          initial={invoiceModal === 'new' ? null : invoiceModal}
          addInvoice={addInvoice}
          updateInvoice={updateInvoice}
          defaultCurrency={client.billingCurrency || 'EUR'}
        />
      )}
      {billingModal && (
        <BillingEditModal open={billingModal} onClose={() => setBillingModal(false)} client={client} updateClient={updateClient} />
      )}
      {legalModal && (
        <LegalEditModal open={legalModal} onClose={() => setLegalModal(false)} client={client} updateClient={updateClient} />
      )}
    </div>
  );
}
