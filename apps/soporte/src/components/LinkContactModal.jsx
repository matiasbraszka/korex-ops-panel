import { useEffect, useState } from 'react';
import { Link2, X } from 'lucide-react';
import { searchContacts, searchClients } from '../lib/api.js';
import { useSoporte } from '../context/SoporteContext.jsx';
import Modal from './Modal.jsx';

// Vincular la conversación a un contacto o cliente existente (búsqueda server-side).
export default function LinkContactModal({ open, onClose, conv }) {
  const { linkContact } = useSoporte();
  const [tab, setTab] = useState('contacts');
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) { setQ(''); setResults([]); return; }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const rows = tab === 'contacts' ? await searchContacts(term) : await searchClients(term);
      setResults(rows);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q, tab, open]);

  const pick = async (row) => {
    if (tab === 'contacts') {
      await linkContact(conv.id, { contactId: row.id, contact: { id: row.id, full_name: row.full_name, phone: row.phone, email: row.email } });
    } else {
      await linkContact(conv.id, { clientId: row.id, client: { id: row.id, name: row.name } });
    }
    onClose();
  };

  const unlink = async (kind) => {
    if (kind === 'contact') await linkContact(conv.id, { contactId: null, contact: null });
    else await linkContact(conv.id, { clientId: null, client: null });
  };

  return (
    <Modal open={open} onClose={onClose} title="Vincular conversación" maxWidth={440}>
      <div className="flex flex-col gap-3">
        {(conv.contact || conv.client) && (
          <div className="flex flex-col gap-1.5">
            {conv.contact && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#ECFDF5] text-[12.5px]">
                <Link2 size={13} className="text-[#16A34A] shrink-0" />
                <span className="flex-1 truncate">Contacto: <b>{conv.contact.full_name}</b></span>
                <button onClick={() => unlink('contact')} className="bg-transparent border-0 text-text3 hover:text-text cursor-pointer p-0.5"><X size={13} /></button>
              </div>
            )}
            {conv.client && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#EEF2FF] text-[12.5px]">
                <Link2 size={13} className="text-[#4A67D8] shrink-0" />
                <span className="flex-1 truncate">Cliente: <b>{conv.client.name}</b></span>
                <button onClick={() => unlink('client')} className="bg-transparent border-0 text-text3 hover:text-text cursor-pointer p-0.5"><X size={13} /></button>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-1">
          {[['contacts', 'Contactos'], ['clients', 'Clientes']].map(([id, lbl]) => (
            <button key={id} onClick={() => { setTab(id); setResults([]); }}
                    className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${tab === id ? 'bg-[#F59E0B] border-[#F59E0B] text-white' : 'bg-white border-border text-text2'}`}>
              {lbl}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === 'contacts' ? 'Buscar por nombre, teléfono o email…' : 'Buscar cliente por nombre…'}
          autoFocus
          className="w-full px-3 py-2 text-[13px] rounded-lg border border-border outline-none focus:border-[#F59E0B]"
        />
        <div className="min-h-[120px] max-h-[240px] overflow-y-auto flex flex-col gap-1">
          {searching ? (
            <div className="text-[12px] text-text3 text-center py-6">Buscando…</div>
          ) : results.length === 0 ? (
            <div className="text-[12px] text-text3 text-center py-6">
              {q.trim().length < 2 ? 'Escribí al menos 2 letras.' : 'Sin resultados.'}
            </div>
          ) : (
            results.map((r) => (
              <button key={r.id} onClick={() => pick(r)}
                      className="text-left px-3 py-2 rounded-lg border border-border bg-white hover:border-[#F59E0B]/60 hover:bg-[#FFFBEB] cursor-pointer transition-colors">
                <div className="text-[13px] font-semibold truncate">{tab === 'contacts' ? r.full_name : r.name}</div>
                {tab === 'contacts' && (
                  <div className="text-[11px] text-text3 truncate">{[r.phone, r.email].filter(Boolean).join(' · ')}</div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
