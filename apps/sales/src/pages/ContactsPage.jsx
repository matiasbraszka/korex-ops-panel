import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X, Trash2, SlidersHorizontal } from 'lucide-react';
import { supabase } from '@korex/db';
import { useConfirm, useToast } from '../components/ConfirmDialog.jsx';

const CATEGORIES = [
  { id: 'prospect',     label: 'Potencial cliente', short: 'Pot. cliente', color: '#5B7CF5' },
  { id: 'client',       label: 'Cliente',           short: 'Cliente',      color: '#22C55E' },
  { id: 'mentor',       label: 'Mentor',            short: 'Mentor',       color: '#A855F7' },
  { id: 'partner',      label: 'Socio',             short: 'Socio',        color: '#EAB308' },
  { id: 'team',         label: 'Equipo',            short: 'Equipo',       color: '#06B6D4' },
  { id: 'client_team',  label: 'Equipo del cliente', short: 'Eq. cliente', color: '#F97316' },
  { id: 'usuario',      label: 'Usuario / red',     short: 'Usuario',      color: '#EC4899' },
  { id: 'other',        label: 'Otro',              short: 'Otro',         color: '#9CA3AF' },
];
const catColor = (id) => CATEGORIES.find((c) => c.id === id)?.color || '#9CA3AF';
const catShort = (id) => CATEGORIES.find((c) => c.id === id)?.short || id;

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterCats, setFilterCats] = useState([]);
  const { confirm, dialog } = useConfirm();
  const { showToast, toasts } = useToast();
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error: e } = await supabase.from('contacts').select('*').order('updated_at', { ascending: false });
    if (e) { setError(e.message); setLoading(false); return; }
    setContacts(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const m = { total: contacts.length };
    CATEGORIES.forEach((c) => { m[c.id] = 0; });
    contacts.forEach((c) => (c.categories || []).forEach((cat) => { m[cat] = (m[cat] || 0) + 1; }));
    return m;
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (filterCats.length > 0) {
        const has = (c.categories || []).some((cat) => filterCats.includes(cat));
        if (!has) return false;
      }
      if (q) {
        const hay = [c.full_name, c.first_name, c.last_name, c.phone, c.email, c.company, c.notes]
          .some((v) => v && String(v).toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
  }, [contacts, search, filterCats]);

  const toggleCat = (id) => setFilterCats((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  // Patch un campo de un contacto. Persiste en DB y actualiza estado local.
  const patchContact = async (id, patch) => {
    setContacts((cs) => cs.map((c) => c.id === id ? { ...c, ...patch } : c));
    const { error: e } = await supabase.from('contacts').update(patch).eq('id', id);
    if (e) { showToast('No se pudo guardar: ' + e.message, 'error'); await load(); }
  };

  const toggleContactCategory = async (id, catId) => {
    const c = contacts.find((x) => x.id === id);
    if (!c) return;
    const cur = c.categories || [];
    const nextCats = cur.includes(catId) ? cur.filter((x) => x !== catId) : [...cur, catId];
    await patchContact(id, { categories: nextCats });
  };

  const createContact = async () => {
    const { data, error: e } = await supabase.from('contacts')
      .insert({ full_name: '', categories: [] })
      .select().single();
    if (e) { showToast('No se pudo crear: ' + e.message, 'error'); return; }
    setContacts((cs) => [data, ...cs]);
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: '¿Eliminar este contacto?',
      message: 'Si tiene leads vinculados, se eliminarán también.',
      danger: true,
    });
    if (!ok) return;
    const { error: e } = await supabase.from('contacts').delete().eq('id', id);
    if (e) { showToast('Error: ' + e.message, 'error'); return; }
    await load();
    showToast('Contacto eliminado', 'success');
  };

  if (loading) return <div className="text-text3 text-center py-20">Cargando contactos...</div>;
  if (error) return <div className="text-red text-center py-20">Error: {error}</div>;

  return (
    <div className="flex flex-col">
      {/* TOPBAR alineado al CRM (bloque blanco border shadow rounded) */}
      {!isMobile && (
        <div className="bg-white border border-border rounded-xl shadow-sm p-3 mb-2.5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="min-w-[140px]">
              <h1 className="text-[17px] font-bold leading-tight">Contactos</h1>
              <p className="text-[11.5px] text-text3 mt-0.5">{counts.total} contactos · edición inline</p>
            </div>

            <div className="flex items-center gap-2 flex-1 min-w-[220px] bg-bg border border-border rounded-lg px-3 py-2">
              <Search size={15} className="text-text3 shrink-0" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                     placeholder="Buscar nombre, teléfono, email o empresa…"
                     className="flex-1 min-w-0 text-[12.5px] text-text bg-transparent border-0 outline-none placeholder:text-text3" />
              {search && (
                <button type="button" onClick={() => setSearch('')}
                        className="text-text3 hover:text-text bg-transparent border-0 p-0.5 cursor-pointer">×</button>
              )}
            </div>

            {/* Boton Filtros (categorias) tipo CRM */}
            <FiltersDropdown filterCats={filterCats} setFilterCats={setFilterCats} counts={counts} />

            {(search || filterCats.length > 0) && (
              <button onClick={() => { setSearch(''); setFilterCats([]); }}
                      className="py-2 px-2.5 rounded-lg border border-border bg-white text-text3 hover:text-red text-[11px] flex items-center gap-1 shrink-0">
                <X size={12} /> Limpiar
              </button>
            )}

            <button onClick={createContact}
                    className="py-2 px-3.5 rounded-lg bg-blue text-white text-[12px] font-semibold hover:bg-blue-dark flex items-center gap-1.5 shrink-0">
              <Plus size={14} /> Nuevo contacto
            </button>
          </div>
        </div>
      )}

      {isMobile && (
        <div className="mb-2.5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h1 className="text-[15px] font-bold leading-tight">Contactos</h1>
              <p className="text-[10.5px] text-text3 mt-0.5">{counts.total}</p>
            </div>
            <button onClick={createContact}
                    className="py-1.5 px-2.5 rounded-md bg-blue text-white text-[11.5px] font-semibold flex items-center gap-1">
              <Plus size={13} /> Nuevo
            </button>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
                   placeholder="Buscar nombre, teléfono, email o empresa…"
                   className="w-full pl-7 pr-2 py-1.5 text-[12px] text-text bg-white border border-border rounded-md outline-none focus:border-blue" />
          </div>
        </div>
      )}

      {/* Tabla con edición inline. Una sola columna 'Nombre completo' */}
      <div className="bg-white border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-surface2 border-b border-border text-text2 text-[10px] uppercase tracking-wider">
            <tr>
              <th className="text-left py-2 px-3 font-semibold">Nombre completo</th>
              <th className="text-left py-2 px-2 font-semibold">Empresa</th>
              <th className="text-left py-2 px-2 font-semibold">Teléfono</th>
              <th className="text-left py-2 px-2 font-semibold">Email</th>
              <th className="text-left py-2 px-2 font-semibold">Categorías</th>
              <th className="text-left py-2 px-2 font-semibold">Notas</th>
              <th className="w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-text3 py-8 text-[12px]">Sin resultados</td></tr>
            ) : filtered.map((c) => (
              <ContactRow key={c.id} contact={c}
                          onPatch={(patch) => patchContact(c.id, patch)}
                          onToggleCat={(catId) => toggleContactCategory(c.id, catId)}
                          onDelete={() => handleDelete(c.id)} />
            ))}
          </tbody>
        </table>
      </div>

      {dialog}
      {toasts}
    </div>
  );
}

// Boton "Filtros" tipo CRM con dropdown que muestra checkboxes por categoria.
// Cuenta de cada cat al lado. Click para toggle. Cierra al click afuera.
function FiltersDropdown({ filterCats, setFilterCats, counts }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const toggle = (id) => setFilterCats((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const activeCount = filterCats.length;
  return (
    <div className="relative shrink-0" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)}
              className={`flex items-center gap-1.5 py-2 px-3 rounded-lg border text-[12px] font-medium ${
                activeCount > 0 ? 'border-blue text-blue bg-blue-bg' : 'border-border text-text2 bg-white hover:bg-surface2'
              }`}>
        <SlidersHorizontal size={13} /> Filtros
        {activeCount > 0 && (
          <span className="bg-blue text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 inline-flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-border rounded-lg shadow-xl p-1.5 min-w-[220px]">
          <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3 px-2 py-1.5">Categorías</div>
          {CATEGORIES.map((c) => {
            const on = filterCats.includes(c.id);
            const n = counts[c.id] || 0;
            return (
              <button key={c.id} type="button" onClick={() => toggle(c.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-left rounded hover:bg-surface2 text-[12px] ${on ? 'font-semibold' : ''}`}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                <span className="flex-1">{c.label}</span>
                <span className="text-text3 text-[10px]">{n}</span>
                {on && <span className="text-[10px]" style={{ color: c.color }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Fila editable inline. Cada campo es input editable. Categorías abren picker en click.
// IMPORTANTE: el popover de categorias usa position FIXED con coords del trigger
// (calculadas con getBoundingClientRect) para escapar el stacking context de la
// tabla — sin esto el popover queda detras de los chips de otras filas.
function ContactRow({ contact, onPatch, onToggleCat, onDelete }) {
  const [catOpen, setCatOpen] = useState(false);
  const [popupPos, setPopupPos] = useState(null);
  const triggerRef = useRef(null);
  const openCatPicker = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopupPos({ left: rect.left, top: rect.bottom + 4, width: Math.max(220, rect.width) });
    }
    setCatOpen(true);
  };
  const persist = (key, current) => {
    const v = (current ?? '').trim();
    const original = contact[key] || '';
    if (v !== original) onPatch({ [key]: v || null });
  };
  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-surface2/40 group align-top">
      <td className="px-3 py-1">
        <input defaultValue={contact.full_name || ''} placeholder="Nombre completo"
               onBlur={(e) => persist('full_name', e.target.value)}
               className={inlineInput + ' font-semibold'} />
      </td>
      <td className="px-2 py-1">
        <input defaultValue={contact.company || ''} placeholder="Empresa"
               onBlur={(e) => persist('company', e.target.value)}
               className={inlineInput} />
      </td>
      <td className="px-2 py-1">
        <input defaultValue={contact.phone || ''} placeholder="+54..."
               onBlur={(e) => persist('phone', e.target.value)}
               className={inlineInput} />
      </td>
      <td className="px-2 py-1">
        <input defaultValue={contact.email || ''} placeholder="email@..."
               onBlur={(e) => persist('email', e.target.value)}
               className={inlineInput} />
      </td>
      <td className="px-2 py-1.5">
        <button ref={triggerRef} type="button" onClick={openCatPicker}
                className="flex flex-wrap gap-1 w-full min-h-[28px] items-center px-1 py-0.5 rounded border border-transparent hover:border-border cursor-pointer text-left">
          {(contact.categories || []).length === 0 && (
            <span className="text-text3 text-[10px] italic">+ agregar</span>
          )}
          {(contact.categories || []).map((cat) => (
            <span key={cat} className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
                  style={{ background: catColor(cat) + '22', color: catColor(cat) }}>
              {catShort(cat)}
            </span>
          ))}
        </button>
        {catOpen && popupPos && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setCatOpen(false)} />
            <div style={{ position: 'fixed', left: popupPos.left, top: popupPos.top, width: popupPos.width, zIndex: 50, background: '#FFFFFF' }}
                 className="border border-border rounded-lg shadow-xl p-1.5 max-h-[320px] overflow-y-auto">
              <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3 px-2 py-1">Categorías</div>
              {CATEGORIES.map((cat) => {
                const on = (contact.categories || []).includes(cat.id);
                return (
                  <button key={cat.id} type="button"
                          onClick={() => onToggleCat(cat.id)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 text-left rounded hover:bg-surface2 text-[12px] ${on ? 'font-semibold' : ''}`}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cat.color }} />
                    <span className="flex-1">{cat.label}</span>
                    {on && <span className="text-[10px]" style={{ color: cat.color }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </td>
      <td className="px-2 py-1">
        <input defaultValue={contact.notes || ''} placeholder="Notas…"
               onBlur={(e) => persist('notes', e.target.value)}
               className={inlineInput} />
      </td>
      <td className="px-2 py-1.5 text-right">
        <button onClick={onDelete} title="Eliminar"
                className="opacity-0 group-hover:opacity-100 text-text3 hover:text-red bg-transparent border-0 p-1 cursor-pointer transition-opacity">
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

const inlineInput = 'w-full text-[12px] text-text bg-transparent border border-transparent hover:border-border focus:border-blue rounded px-1.5 py-1 outline-none placeholder:text-text3';
