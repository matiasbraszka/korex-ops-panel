import { useState } from 'react';
import { KeyRound, Eye, EyeOff, Copy, Check, Plus, Trash2, ExternalLink } from 'lucide-react';
import Modal from '../Modal';
import { useApp } from '../../context/AppContext';
import { copyText } from './recursosShared';

// Accesos a plataformas del CLIENTE (CRM Korex, marca blanca, Gmail, etc.). Viven en
// clients.links con category:'acceso' (label/url/email/password/notes). Se editan acá y se
// guardan con updateClient. Los links que NO son 'acceso' se conservan intactos.
const blank = () => ({ label: '', url: '', email: '', password: '', notes: '', category: 'acceso' });

function CopyBtn({ value }) {
  const [ok, setOk] = useState(false);
  if (!value) return null;
  return (
    <button type="button" onClick={() => { copyText(value); setOk(true); setTimeout(() => setOk(false), 1200); }}
      title="Copiar" className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white border border-[#E2E8FA] cursor-pointer text-[#9CA3AF] hover:bg-[#F5F7FF] hover:text-[#2E69E0] shrink-0">
      {ok ? <Check size={12} className="text-[#16A34A]" strokeWidth={3} /> : <Copy size={12} />}
    </button>
  );
}

export default function ClientAccessModal({ client, onClose }) {
  const { updateClient } = useApp();
  const allLinks = Array.isArray(client?.links) ? client.links : [];
  const otros = allLinks.filter(l => (l?.category || '') !== 'acceso');
  const [rows, setRows] = useState(() => {
    const acc = allLinks.filter(l => (l?.category || '') === 'acceso').map(l => ({ ...blank(), ...l, category: 'acceso' }));
    return acc.length ? acc : [blank()];
  });
  const [show, setShow] = useState({});   // índice -> mostrar contraseña
  const [saved, setSaved] = useState(false);

  const setRow = (i, patch) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));
  const addRow = () => setRows(rs => [...rs, blank()]);
  const removeRow = (i) => setRows(rs => rs.filter((_, j) => j !== i));

  const guardar = () => {
    // Conserva sólo las filas con algún dato; reescribe los links = otros + accesos.
    const limpias = rows
      .map(r => ({ label: (r.label || '').trim(), url: (r.url || '').trim(), email: (r.email || '').trim(), password: r.password || '', notes: (r.notes || '').trim(), category: 'acceso' }))
      .filter(r => r.label || r.url || r.email || r.password || r.notes);
    updateClient(client.id, { links: [...otros, ...limpias] });
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose?.(); }, 700);
  };

  return (
    <Modal open onClose={onClose} title={`Accesos de ${client?.name || 'este cliente'}`} maxWidth={720}
      footer={<div className="flex justify-between items-center gap-2 w-full">
        <span className="text-[11px] text-[#9098A4] inline-flex items-center gap-1.5"><KeyRound size={13} />Se guardan en el sistema, junto al cliente.</span>
        <div className="flex gap-2">
          <button className="text-[13px] py-2.5 px-4 rounded-[9px] border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cerrar</button>
          <button className="text-[13px] py-2.5 px-4 rounded-[9px] border-none text-white font-semibold cursor-pointer inline-flex items-center gap-1.5" style={{ background: saved ? '#16A34A' : '#2E69E0' }} onClick={guardar}>{saved ? <><Check size={14} />Guardado</> : 'Guardar accesos'}</button>
        </div>
      </div>}>
      <div className="flex flex-col gap-3 p-1">
        {rows.map((r, i) => (
          <div key={i} className="rounded-xl border border-[#E7EAF0] bg-[#FBFCFE] p-3">
            <div className="flex items-center gap-2 mb-2">
              <input value={r.label} onChange={e => setRow(i, { label: e.target.value })} placeholder="Plataforma (ej. CRM Korex | Producción)"
                className="flex-1 py-2 px-3 border border-[#E2E5EB] rounded-[9px] text-[13px] font-semibold text-[#1A1D26] bg-white outline-none focus:border-blue" />
              <button type="button" onClick={() => removeRow(i)} title="Quitar" className="inline-flex items-center justify-center w-8 h-8 border border-[#E2E5EB] rounded-lg bg-white text-[#C3C9D4] cursor-pointer hover:bg-[#FEF2F2] hover:border-[#FECACA] hover:text-[#EF4444] shrink-0"><Trash2 size={13} /></button>
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="flex items-center gap-1.5">
                <input value={r.url} onChange={e => setRow(i, { url: e.target.value })} placeholder="URL"
                  className="flex-1 min-w-0 py-2 px-3 border border-[#E2E5EB] rounded-[9px] text-[12.5px] text-[#1A1D26] bg-white outline-none focus:border-blue" />
                {r.url && <a href={/^https?:\/\//.test(r.url) ? r.url : 'https://' + r.url} target="_blank" rel="noreferrer" title="Abrir" className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white border border-[#E2E8FA] text-[#9CA3AF] hover:text-[#2E69E0] shrink-0"><ExternalLink size={12} /></a>}
                <CopyBtn value={r.url} />
              </div>
              <div className="flex items-center gap-1.5">
                <input value={r.email} onChange={e => setRow(i, { email: e.target.value })} placeholder="Usuario / email"
                  className="flex-1 min-w-0 py-2 px-3 border border-[#E2E5EB] rounded-[9px] text-[12.5px] text-[#1A1D26] bg-white outline-none focus:border-blue" />
                <CopyBtn value={r.email} />
              </div>
              <div className="flex items-center gap-1.5">
                <input value={r.password} onChange={e => setRow(i, { password: e.target.value })} placeholder="Contraseña" type={show[i] ? 'text' : 'password'}
                  className="flex-1 min-w-0 py-2 px-3 border border-[#E2E5EB] rounded-[9px] text-[12.5px] text-[#1A1D26] bg-white outline-none focus:border-blue font-mono" />
                <button type="button" onClick={() => setShow(s => ({ ...s, [i]: !s[i] }))} title={show[i] ? 'Ocultar' : 'Mostrar'} className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white border border-[#E2E8FA] text-[#9CA3AF] hover:text-[#2E69E0] shrink-0">{show[i] ? <EyeOff size={12} /> : <Eye size={12} />}</button>
                <CopyBtn value={r.password} />
              </div>
              <input value={r.notes} onChange={e => setRow(i, { notes: e.target.value })} placeholder="Notas (opcional)"
                className="py-2 px-3 border border-[#E2E5EB] rounded-[9px] text-[12.5px] text-[#6B7280] bg-white outline-none focus:border-blue" />
            </div>
          </div>
        ))}
        <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 py-2 px-3 rounded-lg border border-dashed border-[#D0D5DD] text-[12px] font-semibold text-[#9098A4] cursor-pointer hover:border-[#2E69E0] hover:text-[#2E69E0] bg-white self-start"><Plus size={13} />Agregar acceso</button>
      </div>
    </Modal>
  );
}
