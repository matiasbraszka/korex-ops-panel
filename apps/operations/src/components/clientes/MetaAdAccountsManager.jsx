import { useState } from 'react';
import Modal from '../Modal';
import { Plus, Pencil, Trash2, Copy, Check } from 'lucide-react';

const STATUS_OPTIONS = [
  { k: 'activa',   label: 'Activa',    fg: '#16A34A', dot: '#16A34A' },
  { k: 'pausada',  label: 'Pausada',   fg: '#CA8A04', dot: '#CA8A04' },
  { k: 'interna',  label: 'Interna',   fg: '#6B7280', dot: '#9CA3AF' },
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
      className="inline-flex items-center justify-center w-5 h-5 rounded bg-transparent border-none cursor-pointer text-text3 hover:text-blue shrink-0"
      title={done ? 'Copiado' : 'Copiar ID'}
    >
      {done ? <Check size={10} className="text-[#16A34A]" strokeWidth={3} /> : <Copy size={10} />}
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
    <Modal open={open} onClose={onClose} title={isEdit ? `Editar cuenta · ${initial?.name}` : 'Nueva cuenta publicitaria'} maxWidth={460}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cancelar</button>
          <button className="text-[12.5px] py-2 px-4 rounded-lg border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark disabled:opacity-50" disabled={!form.name.trim() || !form.account_id.trim()} onClick={save}>{isEdit ? 'Guardar' : 'Agregar'}</button>
        </div>
      }
    >
      <div className="grid gap-3 p-1">
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Nombre *</label>
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white" placeholder="MARTA TORRICO - BBC" autoFocus />
        </div>
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>ID *</label>
          <input type="text" value={form.account_id} onChange={e => set('account_id', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white font-mono" placeholder="1483609086283424" />
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
            <select value={form.status} onChange={e => set('status', e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white">
              {STATUS_OPTIONS.map(s => <option key={s.k} value={s.k}>{s.label}</option>)}
            </select>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function MetaAdAccountsManager({ client, updateClient }) {
  const accounts = Array.isArray(client.metaAds) ? client.metaAds : [];
  const [modal, setModal] = useState(null);

  const persist = (next) => updateClient(client.id, { metaAds: next });
  const handleSave = (data) => {
    if (modal && modal !== 'new') {
      persist(accounts.map(a => a.account_id === modal.account_id ? { ...a, ...data } : a));
    } else {
      if (accounts.some(a => a.account_id === data.account_id)) { alert('Ya existe una cuenta con ese ID'); return; }
      persist([...accounts, data]);
    }
  };
  const handleDelete = (acc) => {
    if (!window.confirm(`¿Quitar la cuenta "${acc.name}"?`)) return;
    persist(accounts.filter(a => a.account_id !== acc.account_id));
  };

  return (
    <div className="border-t border-[#F0F2F5] pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>
          Cuentas publicitarias
          {accounts.length > 0 && <span className="text-text3">· {accounts.length}</span>}
        </div>
        <button onClick={() => setModal('new')} className="inline-flex items-center gap-1 text-[10.5px] font-medium py-1 px-2 rounded-md text-text3 hover:text-blue hover:bg-blue-bg2 border-none cursor-pointer bg-transparent">
          <Plus size={11} /> Agregar
        </button>
      </div>
      {accounts.length === 0 ? (
        <div className="text-[11px] italic" style={{ color: '#9CA3AF' }}>Sin cuentas cargadas.</div>
      ) : (
        <div className="flex flex-col">
          {accounts.map((a, i) => {
            const st = STATUS_OPTIONS.find(s => s.k === a.status) || STATUS_OPTIONS[0];
            const cur = CURRENCY_OPTIONS.find(c => c.k === a.currency) || CURRENCY_OPTIONS[0];
            return (
              <div key={a.account_id || i} className="group flex items-center gap-2 py-1.5 text-[11.5px] border-b border-[#F7F9FC] last:border-b-0">
                <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: st.dot }} title={st.label} />
                <span className="font-medium truncate shrink min-w-0" style={{ color: '#1A1D26' }}>{a.name}</span>
                <span className="text-[10.5px] font-mono truncate shrink-0" style={{ color: '#9CA3AF' }} title={a.account_id}>{a.account_id}</span>
                <CopyId value={a.account_id} />
                <span className="text-[10.5px] font-semibold shrink-0 ml-auto" style={{ color: '#6B7280' }}>{cur.k}</span>
                <button className="w-5 h-5 rounded bg-transparent border-none cursor-pointer text-text3 hover:text-blue inline-flex items-center justify-center opacity-0 group-hover:opacity-100 shrink-0" onClick={() => setModal(a)} title="Editar"><Pencil size={10} /></button>
                <button className="w-5 h-5 rounded bg-transparent border-none cursor-pointer text-text3 hover:text-red-500 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 shrink-0" onClick={() => handleDelete(a)} title="Eliminar"><Trash2 size={10} /></button>
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
