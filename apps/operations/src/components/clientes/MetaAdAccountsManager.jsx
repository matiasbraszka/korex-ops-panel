import { useState } from 'react';
import Modal from '../Modal';
import { Plus, Pencil, Trash2, Copy, Check, Megaphone } from 'lucide-react';

const STATUS_OPTIONS = [
  { k: 'activa',   label: 'Activa',    bg: '#ECFDF5', fg: '#16A34A' },
  { k: 'pausada',  label: 'Pausada',   bg: '#FEFCE8', fg: '#CA8A04' },
  { k: 'interna',  label: 'Interna',   bg: '#F0F2F5', fg: '#6B7280' },
];
const CURRENCY_OPTIONS = [
  { k: 'USD', symbol: '$' },
  { k: 'EUR', symbol: '€' },
  { k: 'ARS', symbol: 'AR$' },
  { k: 'MXN', symbol: 'MX$' },
];

function CopyId({ value }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}
      className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue shrink-0"
      title={done ? 'Copiado' : 'Copiar ID'}
    >
      {done ? <Check size={11} className="text-[#16A34A]" strokeWidth={3} /> : <Copy size={11} />}
    </button>
  );
}

function AccountModal({ open, onClose, initial, onSave }) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name: initial?.name || '',
    account_id: initial?.account_id || '',
    currency: initial?.currency || 'USD',
    status: initial?.status || 'activa',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = () => {
    if (!form.name.trim() || !form.account_id.trim()) return;
    onSave({
      name: form.name.trim(),
      account_id: form.account_id.trim().replace(/^act_/, ''),
      currency: form.currency,
      status: form.status,
    });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Editar cuenta · ${initial?.name}` : 'Nueva cuenta publicitaria'} maxWidth={500}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cancelar</button>
          <button className="text-[12.5px] py-2 px-4 rounded-lg border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark disabled:opacity-50" disabled={!form.name.trim() || !form.account_id.trim()} onClick={save}>{isEdit ? 'Guardar' : 'Agregar cuenta'}</button>
        </div>
      }
    >
      <div className="grid gap-3 p-1">
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Nombre de la cuenta *</label>
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white" placeholder="MARTA TORRICO - BBC" autoFocus />
        </div>
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Identificador (ID) *</label>
          <input type="text" value={form.account_id} onChange={e => set('account_id', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white font-mono" placeholder="1483609086283424" />
          <span className="text-[10.5px]" style={{ color: '#9CA3AF' }}>Sin el prefijo act_. Lo encontrás en Meta Ads → Configuración de la cuenta.</span>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="grid gap-1">
            <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Divisa</label>
            <select value={form.currency} onChange={e => set('currency', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white">
              {CURRENCY_OPTIONS.map(c => <option key={c.k} value={c.k}>{c.k} ({c.symbol})</option>)}
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Estado</label>
            <div className="flex gap-1">
              {STATUS_OPTIONS.map(s => {
                const active = form.status === s.k;
                return (
                  <button key={s.k} type="button" onClick={() => set('status', s.k)}
                    className={`flex-1 text-[11px] py-2 px-1 rounded-lg border cursor-pointer font-semibold ${active ? 'border-2' : 'bg-white'}`}
                    style={active ? { borderColor: s.fg, background: s.bg, color: s.fg } : { borderColor: '#E2E5EB', color: '#6B7280' }}
                  >{s.label}</button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function MetaAdAccountsManager({ client, updateClient }) {
  const accounts = Array.isArray(client.metaAds) ? client.metaAds : [];
  const [modal, setModal] = useState(null); // null | 'new' | account obj

  const persist = (next) => updateClient(client.id, { metaAds: next });

  const handleSave = (data) => {
    if (modal && modal !== 'new') {
      // Edit
      persist(accounts.map(a => a.account_id === modal.account_id ? { ...a, ...data } : a));
    } else {
      // New
      if (accounts.some(a => a.account_id === data.account_id)) {
        alert('Ya existe una cuenta con ese ID');
        return;
      }
      persist([...accounts, data]);
    }
  };

  const handleDelete = (acc) => {
    if (!window.confirm(`¿Quitar la cuenta "${acc.name}"?`)) return;
    persist(accounts.filter(a => a.account_id !== acc.account_id));
  };

  return (
    <div className="bg-white border border-[#E2E5EB] rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between py-3 px-4 border-b border-[#F0F2F5] flex-wrap gap-2">
        <div className="inline-flex items-center gap-2 font-bold text-[14px]" style={{ color: '#1A1D26' }}>
          <Megaphone size={15} className="text-text2" /> Cuentas publicitarias ({accounts.length})
        </div>
        <button onClick={() => setModal('new')} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold py-1.5 px-3 rounded-lg bg-blue text-white border-none cursor-pointer hover:bg-blue-dark">
          <Plus size={12} /> Agregar cuenta
        </button>
      </div>
      {accounts.length === 0 ? (
        <div className="text-center text-[12px] py-8" style={{ color: '#9CA3AF' }}>
          Sin cuentas cargadas. Tocá <b>Agregar cuenta</b> para vincular la primera.
        </div>
      ) : (
        <div>
          {/* Header desktop */}
          <div className="hidden md:grid items-center py-2 px-4 text-[10px] font-bold uppercase tracking-wider border-b border-[#F0F2F5]" style={{ gridTemplateColumns: '1.6fr 1.4fr 0.8fr 0.9fr 80px', color: '#9CA3AF', gap: 12 }}>
            <div>Nombre</div>
            <div>ID</div>
            <div>Divisa</div>
            <div>Estado</div>
            <div />
          </div>
          {accounts.map((a, i) => {
            const st = STATUS_OPTIONS.find(s => s.k === a.status) || STATUS_OPTIONS[0];
            const cur = CURRENCY_OPTIONS.find(c => c.k === a.currency) || CURRENCY_OPTIONS[0];
            return (
              <div key={a.account_id || i}>
                {/* Desktop row */}
                <div className="hidden md:grid items-center py-2.5 px-4 border-b border-[#F0F2F5] last:border-b-0 hover:bg-[#F7F9FC] group" style={{ gridTemplateColumns: '1.6fr 1.4fr 0.8fr 0.9fr 80px', gap: 12 }}>
                  <div className="text-[12.5px] font-semibold truncate" style={{ color: '#1A1D26' }}>{a.name}</div>
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-[12px] font-mono truncate" style={{ color: '#6B7280' }} title={a.account_id}>{a.account_id}</span>
                    <CopyId value={a.account_id} />
                  </div>
                  <div className="text-[12px] font-semibold" style={{ color: '#1A1D26' }}>{cur.k} <span className="text-text3 font-normal">{cur.symbol}</span></div>
                  <div><span className="inline-flex items-center py-[3px] px-[9px] rounded-full text-[10px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span></div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                    <button className="w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center" onClick={() => setModal(a)} title="Editar"><Pencil size={11} /></button>
                    <button className="w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => handleDelete(a)} title="Eliminar"><Trash2 size={11} /></button>
                  </div>
                </div>
                {/* Mobile card */}
                <div className="md:hidden py-3 px-4 border-b border-[#F0F2F5] last:border-b-0 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-[13px] font-semibold truncate" style={{ color: '#1A1D26' }}>{a.name}</span>
                    <span className="inline-flex items-center py-[2px] px-2 rounded-full text-[9.5px] font-bold shrink-0" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                    <button className="w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center" onClick={() => setModal(a)} title="Editar"><Pencil size={12} /></button>
                    <button className="w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => handleDelete(a)} title="Eliminar"><Trash2 size={12} /></button>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]" style={{ color: '#6B7280' }}>
                    <span className="font-mono truncate flex-1" title={a.account_id}>{a.account_id}</span>
                    <CopyId value={a.account_id} />
                    <span className="font-semibold shrink-0" style={{ color: '#1A1D26' }}>{cur.k} {cur.symbol}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {modal && (
        <AccountModal open={!!modal} onClose={() => setModal(null)} initial={modal === 'new' ? null : modal} onSave={handleSave} />
      )}
    </div>
  );
}
