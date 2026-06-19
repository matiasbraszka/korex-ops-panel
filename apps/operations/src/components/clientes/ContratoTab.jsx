import { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import Modal from '../Modal';
import { ExternalLink, Plus, Pencil, Trash2, Scale, AlertTriangle, Copy, Check, FileSignature, FileText } from 'lucide-react';
import { fmtDate, today, daysBetween } from '../../utils/helpers';

// Pestaña "Contrato" del cliente (Operaciones). Antes era "Facturación"; lo financiero
// (importe, cuotas, comprobantes, facturas) ahora vive en el área de Finanzas, así que
// acá queda SOLO la gestión de contratos: DocuSign + PDFs manuales + datos del contrato.

// Estado del contrato en DocuSign (lo manda el webhook a la tabla contracts).
const CONTRACT_STATUS = {
  created:   { bg: '#F1F5F9', fg: '#64748B', label: 'Borrador' },
  sent:      { bg: '#FEFCE8', fg: '#CA8A04', label: 'Enviado a firmar' },
  delivered: { bg: '#EFF6FF', fg: '#2563EB', label: 'Recibido por el firmante' },
  completed: { bg: '#ECFDF5', fg: '#16A34A', label: 'Firmado' },
  declined:  { bg: '#FEF2F2', fg: '#EF4444', label: 'Rechazado' },
  voided:    { bg: '#FEF2F2', fg: '#EF4444', label: 'Anulado' },
};

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

export default function ContratoTab({ client }) {
  const { contracts, addContract, updateContract, deleteContract, updateClient } = useApp();
  const clientContracts = useMemo(
    () => (contracts || []).filter(ct => ct.client_id === client.id),
    [contracts, client.id]
  );
  const [contractModal, setContractModal] = useState(null); // null | 'new' | contract obj
  const [dataModal, setDataModal] = useState(false);

  return (
    <div className="mb-4" style={{ maxWidth: 640 }}>
      <LegalCard
        c={client}
        clientContracts={clientContracts}
        onAdd={() => setContractModal('new')}
        onEditManual={(ct) => setContractModal(ct)}
        onDeleteManual={deleteContract}
        onEditData={() => setDataModal(true)}
      />

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
