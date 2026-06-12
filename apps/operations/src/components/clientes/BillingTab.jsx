import { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import Modal from '../Modal';
import { CreditCard, FileText, ExternalLink, Plus, Pencil, Trash2, Scale, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Copy, Check, FileSignature } from 'lucide-react';
import { fmtDate, today, daysBetween } from '../../utils/helpers';

// Estado del contrato en DocuSign (lo manda el webhook a la tabla contracts).
const CONTRACT_STATUS = {
  created:   { bg: '#F1F5F9', fg: '#64748B', label: 'Borrador' },
  sent:      { bg: '#FEFCE8', fg: '#CA8A04', label: 'Enviado a firmar' },
  delivered: { bg: '#EFF6FF', fg: '#2563EB', label: 'Recibido por el firmante' },
  completed: { bg: '#ECFDF5', fg: '#16A34A', label: 'Firmado' },
  declined:  { bg: '#FEF2F2', fg: '#EF4444', label: 'Rechazado' },
  voided:    { bg: '#FEF2F2', fg: '#EF4444', label: 'Anulado' },
};

// Chip con el código Korex (copiable) para pegar en el contrato de DocuSign.
function KorexCodeChip({ code }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} title="Copiar código para el contrato de DocuSign"
      className="inline-flex items-center gap-1.5 py-1 px-2 rounded-md border border-[#E2E5EB] bg-[#FAFBFC] cursor-pointer hover:border-blue text-[11.5px] font-mono font-semibold"
      style={{ color: '#1A1D26' }}>
      {copied ? <Check size={11} className="text-green-600" /> : <Copy size={11} className="text-text3" />}
      {code}
    </button>
  );
}

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
};
const INVOICE_KIND = {
  ingreso: { bg: '#ECFDF5', fg: '#16A34A', label: 'Ingreso', icon: ArrowDownCircle },
  egreso:  { bg: '#FEF2F2', fg: '#EF4444', label: 'Egreso',  icon: ArrowUpCircle },
};
// Reparto de comisiones (mismas claves que se cargan en el formulario de venta).
const COMMISSION_LABELS = {
  setup_conector: 'Setup · Conector',
  crm_cliente: 'CRM · Cliente',
  crm_afiliados: 'CRM · Afiliados',
  crm_conector: 'CRM · Conector',
  publicidad_cliente: 'Publicidad · Cliente',
  publicidad_conector: 'Publicidad · Conector',
};
const CLIENT_TYPE_LABEL = { empresa: 'Empresa', lider: 'Líder' };

// Estado de un contrato manual (PDF) — lo elige el usuario.
const MANUAL_STATUS = {
  vigente:   { bg: '#ECFDF5', fg: '#16A34A', label: 'Vigente' },
  pendiente: { bg: '#FEFCE8', fg: '#CA8A04', label: 'Pendiente de firma' },
  vencido:   { bg: '#FEF2F2', fg: '#EF4444', label: 'Vencido' },
};

// Aviso de renovación: rojo si vencido, naranja si faltan ≤30 días.
function renewalWarn(date) {
  if (!date) return null;
  const diff = daysBetween(today(), date);
  if (diff == null) return null;
  if (diff < 0) return { color: '#EF4444', text: `Vencido hace ${-diff} día${diff === -1 ? '' : 's'}` };
  if (diff <= 30) return { color: '#F97316', text: `Renueva en ${diff} día${diff === 1 ? '' : 's'}` };
  return null;
}

// Una fila de contrato (DocuSign o manual).
function ContractRow({ ct, onEdit, onDelete }) {
  const isManual = ct.source === 'manual';
  const badge = isManual ? (MANUAL_STATUS[ct.status] || MANUAL_STATUS.vigente) : (CONTRACT_STATUS[ct.status] || { bg: '#F1F5F9', fg: '#94A3B8', label: ct.status });
  const title = isManual ? (ct.title || 'Contrato') : (ct.subject || 'Contrato (DocuSign)');
  const signed = isManual ? ct.signed_date : (ct.completed_at ? ct.completed_at.slice(0, 10) : null);
  const warn = renewalWarn(ct.renewal_date);

  return (
    <div className="border border-[#E2E5EB] rounded-lg p-2.5 group">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md inline-flex items-center justify-center shrink-0" style={{ background: isManual ? '#F5F3FF' : '#EEF2FF' }}>
          {isManual ? <FileText size={14} className="text-purple" /> : <FileSignature size={14} className="text-blue" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold truncate" style={{ color: '#1A1D26' }}>{title}</div>
          <div className="text-[10.5px] flex items-center gap-2 flex-wrap" style={{ color: '#9CA3AF' }}>
            <span>{isManual ? 'PDF cargado' : 'DocuSign'}</span>
            {signed && <span>· firmado {fmtDate(signed)}</span>}
            {ct.renewal_date && <span>· renueva {fmtDate(ct.renewal_date)}</span>}
          </div>
        </div>
        <span className="inline-flex items-center py-[3px] px-[9px] rounded-full text-[10px] font-bold shrink-0" style={{ background: badge.bg, color: badge.fg }}>{badge.label}</span>
        {isManual && (
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button className="w-6 h-6 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center" onClick={() => onEdit(ct)} title="Editar"><Pencil size={11} /></button>
            <button className="w-6 h-6 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => { if (window.confirm('¿Borrar este contrato?')) onDelete(ct.id); }} title="Eliminar"><Trash2 size={11} /></button>
          </div>
        )}
      </div>
      {(ct.pdf_url || warn) && (
        <div className="flex items-center justify-between gap-2 mt-2 pl-[42px] flex-wrap">
          {ct.pdf_url ? (
            <a href={ct.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-blue font-medium no-underline hover:underline">
              <ExternalLink size={11} /> Ver PDF
            </a>
          ) : <span />}
          {warn && (
            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold" style={{ color: warn.color }}>
              <AlertTriangle size={11} /> {warn.text}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function LegalCard({ c, clientContracts, onAdd, onEditManual, onDeleteManual, onEditData }) {
  // Orden: más nuevo arriba (por fecha de firma/renovación/creación).
  const sorted = [...clientContracts].sort((a, b) => {
    const ka = a.signed_date || a.completed_at || a.created_at || '';
    const kb = b.signed_date || b.completed_at || b.created_at || '';
    return kb.localeCompare(ka);
  });

  return (
    <div className="bg-white border border-[#E2E5EB] rounded-xl shadow-sm p-[18px]">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="inline-flex items-center gap-2 font-bold text-[14px]" style={{ color: '#1A1D26' }}>
          <Scale size={16} className="text-text2" /> Legal · Contratos
        </div>
        <div className="inline-flex items-center gap-2">
          <KorexCodeChip code={c.korexCode} />
          <button className="inline-flex items-center gap-1 text-[11.5px] py-1 px-2 rounded-md border-none bg-blue text-white cursor-pointer hover:bg-blue-dark font-semibold" onClick={onAdd}>
            <Plus size={11} /> Agregar
          </button>
        </div>
      </div>

      {/* Lista de contratos (DocuSign + PDFs manuales). */}
      {sorted.length === 0 ? (
        <div className="text-center text-[12px] py-4" style={{ color: '#9CA3AF' }}>
          Sin contratos. Se vinculan solos desde DocuSign, o tocá <b>Agregar</b> para subir un PDF.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map(ct => (
            <ContractRow key={ct.id} ct={ct} onEdit={onEditManual} onDelete={onDeleteManual} />
          ))}
        </div>
      )}

      {/* Datos para el contrato (texto que copiamos al armarlo). */}
      <div className="mt-3 pt-3 border-t border-[#F0F2F5]">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Datos para el contrato</div>
          <button className="inline-flex items-center gap-1 text-[10.5px] cursor-pointer bg-transparent border-none hover:text-blue" style={{ color: '#9CA3AF' }} onClick={onEditData}>
            <Pencil size={10} /> Editar
          </button>
        </div>
        {c.contractData ? (
          <pre className="text-[11.5px] font-mono whitespace-pre-wrap py-2 px-2.5 rounded-md border border-[#F0F2F5] m-0 leading-relaxed" style={{ background: '#FAFBFC', color: '#1A1D26' }}>{c.contractData}</pre>
        ) : (
          <div className="text-[11px] italic" style={{ color: '#C0C4CC' }}>Sin datos cargados.</div>
        )}
      </div>
    </div>
  );
}

// Alta / edición de un contrato MANUAL (PDF de Drive u otra plataforma).
function ContractModal({ open, onClose, clientId, initial, addContract, updateContract }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(() => ({
    title: initial?.title || 'Contrato',
    pdf_url: initial?.pdf_url || '',
    status: initial?.status || 'vigente',
    signed_date: initial?.signed_date || '',
    renewal_date: initial?.renewal_date || '',
  }));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim() || 'Contrato',
        pdf_url: form.pdf_url.trim() || null,
        status: form.status,
        signed_date: form.signed_date || null,
        renewal_date: form.renewal_date || null,
      };
      if (isEdit) await updateContract(initial.id, payload);
      else await addContract(clientId, payload);
      onClose();
    } catch (e) {
      console.warn('save contract error', e);
      alert('Error al guardar el contrato');
    } finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar contrato' : 'Agregar contrato'} maxWidth={500}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cancelar</button>
          <button className="text-[12.5px] py-2 px-4 rounded-lg border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark disabled:opacity-50" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      }
    >
      <div className="grid gap-3 p-1">
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Nombre del contrato</label>
          <input type="text" value={form.title} onChange={e => set('title', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white" placeholder="Contrato de servicios — 2026" autoFocus />
        </div>
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>URL del PDF (Drive u otra plataforma)</label>
          <input type="url" value={form.pdf_url} onChange={e => set('pdf_url', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white" placeholder="https://drive.google.com/..." />
          <span className="text-[10.5px]" style={{ color: '#9CA3AF' }}>Subí el PDF a Drive y pegá el link.</span>
        </div>
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Estado</label>
          <div className="flex gap-1.5">
            {Object.entries(MANUAL_STATUS).map(([k, v]) => (
              <button key={k} type="button" className={`text-[11.5px] py-1.5 px-3 rounded-lg border cursor-pointer font-medium ${form.status === k ? 'border-2' : 'bg-white'}`} style={form.status === k ? { borderColor: v.fg, background: v.bg, color: v.fg } : { borderColor: '#E2E5EB', color: '#6B7280' }} onClick={() => set('status', k)}>{v.label}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="grid gap-1">
            <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Fecha de firma</label>
            <input type="date" value={form.signed_date} onChange={e => set('signed_date', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white" />
          </div>
          <div className="grid gap-1">
            <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Vence / renueva</label>
            <input type="date" value={form.renewal_date} onChange={e => set('renewal_date', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white" />
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Editar solo los "Datos para el contrato" (texto del cliente).
function ContractDataModal({ open, onClose, client, updateClient }) {
  const [val, setVal] = useState(client.contractData || '');
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Datos para el contrato" maxWidth={500}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cancelar</button>
          <button className="text-[12.5px] py-2 px-4 rounded-lg border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark" onClick={() => { updateClient(client.id, { contractData: val.trim() || null }); onClose(); }}>Guardar</button>
        </div>
      }
    >
      <div className="grid gap-1 p-1">
        <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Datos para el contrato</label>
        <textarea value={val} onChange={e => setVal(e.target.value)} className="text-[12.5px] font-mono py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white resize-y min-h-[140px] leading-relaxed" placeholder={'Razón social: ...\nNIF / RFC / CUIT: ...\nDirección fiscal: ...\nRepresentante legal: ...'} autoFocus />
        <span className="text-[10.5px]" style={{ color: '#9CA3AF' }}>Info que copiamos al armar el contrato.</span>
      </div>
    </Modal>
  );
}

function BillingSummary({ c, onEdit }) {
  const bs = BILLING_STATUS[c.billingStatus || 'al_dia'];
  const sym = CURR_SYMBOL[c.billingCurrency || 'EUR'] || '€';

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
        {c.cashCollect != null && (<>
          <span className="font-medium" style={{ color: '#9CA3AF' }}>Cobrado (CashCollect)</span>
          <span className="text-right" style={{ color: '#16A34A' }}>{sym}{Number(c.cashCollect).toLocaleString()}</span>
        </>)}
        {c.remainingToCollect != null && (<>
          <span className="font-medium" style={{ color: '#9CA3AF' }}>Restante por cobrar</span>
          <span className="font-semibold text-right" style={{ color: c.remainingToCollect > 0 ? '#CA8A04' : '#16A34A' }}>{sym}{Number(c.remainingToCollect).toLocaleString()}</span>
        </>)}
        <span className="font-medium" style={{ color: '#9CA3AF' }}>Pago</span>
        <span className="text-right" style={{ color: '#1A1D26' }}>{c.billingInstallments > 1 ? `${c.billingInstallments} cuotas` : 'Pago único'}</span>
        {c.billingInstallments > 1 && (<>
          <span className="font-medium" style={{ color: '#9CA3AF' }}>Próximo cobro</span>
          <span className="text-right" style={{ color: '#1A1D26' }}>{c.nextChargeDate ? fmtDate(c.nextChargeDate) : '—'}</span>
        </>)}
        <span className="font-medium" style={{ color: '#9CA3AF' }}>Método</span>
        <span className="text-right" style={{ color: '#1A1D26' }}>{c.paymentMethod || '—'}</span>
        {c.clientType && (<>
          <span className="font-medium" style={{ color: '#9CA3AF' }}>Tipo</span>
          <span className="text-right" style={{ color: '#1A1D26' }}>{CLIENT_TYPE_LABEL[c.clientType] || c.clientType}</span>
        </>)}
        <span className="font-medium" style={{ color: '#9CA3AF' }}>Estado</span>
        <span className="text-right">
          <span className="inline-flex items-center py-[3px] px-[9px] rounded-full text-[10px] font-bold" style={{ background: bs.bg, color: bs.fg }}>{bs.label}</span>
        </span>
      </div>

      {/* Grabación de la llamada (cargada desde el formulario de venta) */}
      {c.callRecordingUrl && (
        <div className="mt-3 pt-3 border-t border-[#F0F2F5]">
          <a href={c.callRecordingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11.5px] text-blue font-medium no-underline hover:underline">
            <ExternalLink size={11} /> Grabación de la llamada
          </a>
        </div>
      )}

      {/* Carpeta de Drive del cliente (creada al cargar la venta) */}
      {c.driveFolderUrl && (
        <div className="mt-3 pt-3 border-t border-[#F0F2F5]">
          <a href={c.driveFolderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11.5px] text-blue font-medium no-underline hover:underline">
            <ExternalLink size={11} /> 📁 Carpeta de Drive
          </a>
        </div>
      )}

      {/* Reparto de comisiones */}
      {c.commissionSplit && Object.values(c.commissionSplit).some((v) => Number(v) > 0) && (
        <div className="mt-3 pt-3 border-t border-[#F0F2F5]">
          <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#9CA3AF' }}>Reparto de comisiones</div>
          <div className="grid gap-y-1 gap-x-3 text-[12px]" style={{ gridTemplateColumns: 'auto 1fr' }}>
            {Object.entries(c.commissionSplit).filter(([, v]) => Number(v) > 0).map(([k, v]) => (
              <div key={k} className="contents">
                <span style={{ color: '#6B7280' }}>{COMMISSION_LABELS[k] || k}</span>
                <span className="text-right font-medium" style={{ color: '#1A1D26' }}>{Number(v)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceItem({ inv, onEdit, onDelete }) {
  const st = INVOICE_STATUS[inv.status] || INVOICE_STATUS.pendiente;
  const kind = INVOICE_KIND[inv.kind] || INVOICE_KIND.ingreso;
  const KIcon = kind.icon;
  const sym = CURR_SYMBOL[inv.currency] || inv.currency;
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 border-b border-[#F0F2F5] last:border-b-0 hover:bg-[#F7F9FC] group">
      <span className="w-8 h-8 rounded-md inline-flex items-center justify-center shrink-0" style={{ background: kind.bg }}>
        <KIcon size={14} style={{ color: kind.fg }} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold truncate" style={{ color: '#1A1D26' }}>Factura #{inv.number}</div>
        <div className="text-[10.5px]" style={{ color: '#9CA3AF' }}>{fmtDate(inv.issue_date)} · {sym}{Number(inv.amount).toLocaleString()}{inv.concept ? ' · ' + inv.concept : ''}</div>
      </div>
      <span className="inline-flex items-center py-[3px] px-[9px] rounded-full text-[10px] font-bold shrink-0" style={{ background: kind.bg, color: kind.fg }}>{kind.label}</span>
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
    kind: initial.kind || 'ingreso',
    payment_method: initial.payment_method || '',
    pdf_url: initial.pdf_url || '',
  } : {
    number: '',
    issue_date: today(),
    amount: '',
    currency: defaultCurrency || 'EUR',
    concept: '',
    status: 'pendiente',
    kind: 'ingreso',
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
          kind: form.kind,
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
          kind: form.kind,
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
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Tipo</label>
          <div className="flex gap-1.5">
            {Object.entries(INVOICE_KIND).map(([k, v]) => {
              const KIcon = v.icon;
              const active = form.kind === k;
              return (
                <button key={k} type="button" className={`text-[11.5px] py-1.5 px-3 rounded-lg border cursor-pointer font-medium inline-flex items-center gap-1.5 ${active ? 'border-2' : 'bg-white'}`} style={active ? { borderColor: v.fg, background: v.bg, color: v.fg } : { borderColor: '#E2E5EB', color: '#6B7280' }} onClick={() => set('kind', k)}>
                  <KIcon size={12} /> {v.label}
                </button>
              );
            })}
          </div>
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
  const { invoices, addInvoice, updateInvoice, deleteInvoice, updateClient, contracts, addContract, updateContract, deleteContract } = useApp();
  // Todos los contratos de este cliente (DocuSign + PDFs manuales).
  const clientContracts = useMemo(
    () => (contracts || []).filter(ct => ct.client_id === client.id),
    [contracts, client.id]
  );
  const [invoiceModal, setInvoiceModal] = useState(null); // null | 'new' | invoice obj
  const [billingModal, setBillingModal] = useState(false);
  const [contractModal, setContractModal] = useState(null); // null | 'new' | contract obj
  const [dataModal, setDataModal] = useState(false);

  const myInvoices = useMemo(
    () => invoices.filter(i => i.client_id === client.id).sort((a, b) => (b.issue_date || '').localeCompare(a.issue_date || '')),
    [invoices, client.id]
  );

  return (
    <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: '330px 1fr' }}>
      <div className="flex flex-col gap-4">
        <BillingSummary c={client} onEdit={() => setBillingModal(true)} />
        <LegalCard
          c={client}
          clientContracts={clientContracts}
          onAdd={() => setContractModal('new')}
          onEditManual={(ct) => setContractModal(ct)}
          onDeleteManual={deleteContract}
          onEditData={() => setDataModal(true)}
        />
      </div>

      <div className="flex flex-col gap-4">
        {/* Comprobantes de pago — prueba de pago del cliente (NO son facturas) */}
        <div className="bg-white border border-[#E2E5EB] rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between py-3 px-4 border-b border-[#F0F2F5]">
            <div className="inline-flex items-center gap-2 font-bold text-[14px]" style={{ color: '#1A1D26' }}>
              <FileText size={16} className="text-text2" /> Comprobantes de pago
            </div>
          </div>
          {client.paymentReceiptUrl ? (
            <div className="flex items-center gap-3 py-2.5 px-4">
              <span className="w-8 h-8 rounded-md inline-flex items-center justify-center shrink-0" style={{ background: '#ECFDF5' }}>
                <FileText size={14} style={{ color: '#16A34A' }} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold" style={{ color: '#1A1D26' }}>Comprobante del cliente</div>
                <div className="text-[10.5px]" style={{ color: '#9CA3AF' }}>Prueba de pago adjuntada en la carga de la venta</div>
              </div>
              <a href={client.paymentReceiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[11px] text-blue font-medium no-underline hover:underline shrink-0">Ver <ExternalLink size={11} /></a>
            </div>
          ) : (
            <div className="text-center text-text3 text-[12px] py-7">Sin comprobantes de pago.</div>
          )}
        </div>

        {/* Facturas — emitidas por nosotros (ingreso) o por el cliente (egreso) */}
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
      {contractModal && (
        <ContractModal
          open={!!contractModal}
          onClose={() => setContractModal(null)}
          clientId={client.id}
          initial={contractModal === 'new' ? null : contractModal}
          addContract={addContract}
          updateContract={updateContract}
        />
      )}
      {dataModal && (
        <ContractDataModal open={dataModal} onClose={() => setDataModal(false)} client={client} updateClient={updateClient} />
      )}
    </div>
  );
}
