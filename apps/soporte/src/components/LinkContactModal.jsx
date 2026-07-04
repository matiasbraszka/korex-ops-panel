import { useEffect, useState } from 'react';
import { Link2, X, Building2 } from 'lucide-react';
import { searchContacts, searchClients, searchFinPeople } from '../lib/api.js';
import { useSoporte } from '../context/SoporteContext.jsx';
import Modal from './Modal.jsx';

// Vincular la conversación a una persona del Directorio de Finanzas (base
// general) — deriva el cliente automáticamente — o, como respaldo, a un
// contacto/cliente del CRM. Búsqueda server-side.
export default function LinkContactModal({ open, onClose, conv }) {
  const { linkContact, linkByFinance } = useSoporte();
  const [tab, setTab] = useState('finanzas');
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [linkingId, setLinkingId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) { setQ(''); setResults([]); setError(''); }
    else { setTab(conv?.is_group ? 'clients' : 'finanzas'); }
  }, [open, conv?.is_group]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const rows = tab === 'finanzas' ? await searchFinPeople(term)
          : tab === 'contacts' ? await searchContacts(term)
          : await searchClients(term);
        setResults(rows);
      } catch (e) {
        console.error('search', e);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, tab, open]);

  const pick = async (row) => {
    setError('');
    try {
      if (tab === 'finanzas') {
        setLinkingId(row.directory_id);
        await linkByFinance(conv.id, row.directory_id);
      } else if (tab === 'contacts') {
        await linkContact(conv.id, { contactId: row.id, contact: { id: row.id, full_name: row.full_name, phone: row.phone, email: row.email } });
      } else {
        await linkContact(conv.id, { clientId: row.id, client: { id: row.id, name: row.name } });
      }
      onClose();
    } catch (e) {
      console.error('link', e);
      const m = String(e?.message || '');
      setError(/person_not_found/.test(m) ? 'No se pudo resolver esa persona.' : 'No se pudo vincular. Probá de nuevo.');
    } finally {
      setLinkingId(null);
    }
  };

  const unlink = async (kind) => {
    if (kind === 'contact') await linkContact(conv.id, { contactId: null, contact: null });
    else await linkContact(conv.id, { clientId: null, client: null });
  };

  // Un grupo se vincula solo a un Cliente (no a una persona/contacto).
  const TABS = conv.is_group
    ? [['clients', 'Cliente']]
    : [['finanzas', 'Finanzas'], ['contacts', 'Contactos'], ['clients', 'Clientes']];
  const placeholder = tab === 'clients' ? 'Buscar cliente por nombre…' : 'Buscar por nombre, teléfono o email…';

  return (
    <Modal open={open} onClose={onClose} title={conv.is_group ? 'Vincular grupo a un cliente' : 'Vincular conversación'} maxWidth={460}>
      <div className="flex flex-col gap-3">
        {(conv.contact || conv.client) && (
          <div className="flex flex-col gap-1.5">
            {conv.contact && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#ECFDF5] text-[12.5px]">
                <Link2 size={13} className="text-[#16A34A] shrink-0" />
                <span className="flex-1 truncate">Persona: <b>{conv.contact.full_name}</b></span>
                <button onClick={() => unlink('contact')} className="bg-transparent border-0 text-text3 hover:text-text cursor-pointer p-0.5"><X size={13} /></button>
              </div>
            )}
            {conv.client && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#EEF2FF] text-[12.5px]">
                <Building2 size={13} className="text-[#4A67D8] shrink-0" />
                <span className="flex-1 truncate">Cliente: <b>{conv.client.name}</b></span>
                <button onClick={() => unlink('client')} className="bg-transparent border-0 text-text3 hover:text-text cursor-pointer p-0.5"><X size={13} /></button>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-1">
          {TABS.map(([id, lbl]) => (
            <button key={id} onClick={() => { setTab(id); setResults([]); setError(''); }}
                    className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${tab === id ? 'bg-[#F59E0B] border-[#F59E0B] text-white' : 'bg-white border-border text-text2'}`}>
              {lbl}
            </button>
          ))}
        </div>
        {tab === 'finanzas' && (
          <div className="text-[11px] text-text3 -mt-1">
            Base general de Finanzas. Al vincular, el cliente se completa solo.
          </div>
        )}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          autoFocus
          className="w-full px-3 py-2 text-[13px] rounded-lg border border-border outline-none focus:border-[#F59E0B]"
        />
        {error && <div className="text-[11.5px] font-medium text-[#DC2626] -mt-1">{error}</div>}
        <div className="min-h-[120px] max-h-[260px] overflow-y-auto flex flex-col gap-1">
          {searching ? (
            <div className="text-[12px] text-text3 text-center py-6">Buscando…</div>
          ) : results.length === 0 ? (
            <div className="text-[12px] text-text3 text-center py-6">
              {q.trim().length < 2 ? 'Escribí al menos 2 letras.' : 'Sin resultados.'}
            </div>
          ) : tab === 'finanzas' ? (
            results.map((r) => (
              <button key={r.directory_id} onClick={() => pick(r)} disabled={linkingId === r.directory_id}
                      className="text-left px-3 py-2 rounded-lg border border-border bg-white hover:border-[#F59E0B]/60 hover:bg-[#FFFBEB] cursor-pointer transition-colors disabled:opacity-60">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold truncate flex-1">{r.nombre}</span>
                  {r.client_name
                    ? <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#EEF2FF] text-[#4A67D8]">{r.client_name}</span>
                    : <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surface2 text-text3">sin cliente</span>}
                </div>
                <div className="text-[11px] text-text3 truncate">{[r.tipo, r.telefono].filter(Boolean).join(' · ')}{linkingId === r.directory_id ? ' · vinculando…' : ''}</div>
              </button>
            ))
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
