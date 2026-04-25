import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X, Trash2, MoreHorizontal, Tag } from 'lucide-react';
import { supabase } from '@korex/db';
import ContactModal from '../components/ContactModal.jsx';

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
const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id;
const catShort = (id) => CATEGORIES.find((c) => c.id === id)?.short || id;
const catColor = (id) => CATEGORIES.find((c) => c.id === id)?.color || '#9CA3AF';

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterCats, setFilterCats] = useState([]);
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error: e } = await supabase.from('contacts').select('*').order('updated_at', { ascending: false });
    if (e) { setError(e.message); setLoading(false); return; }
    setContacts(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Update optimista de un contacto.
  const patchContact = async (id, patch) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error: e } = await supabase.from('contacts').update(patch).eq('id', id);
    if (e) {
      alert(e.message);
      await load();
    }
  };

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
        const hay = [c.first_name, c.last_name, c.phone, c.email, c.company, c.notes]
          .some((v) => v && String(v).toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
  }, [contacts, search, filterCats]);

  const toggleCat = (id) => setFilterCats((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleSave = async (form) => {
    const payload = {
      first_name: form.first_name?.trim() || '',
      last_name: form.last_name?.trim() || '',
      phone: form.phone?.trim() || null,
      email: form.email?.trim() || null,
      company: form.company?.trim() || null,
      notes: form.notes?.trim() || null,
      categories: form.categories || [],
    };
    if (!payload.first_name && !payload.last_name) { alert('Falta nombre.'); return; }
    if (editing?.id) {
      const { error: e } = await supabase.from('contacts').update(payload).eq('id', editing.id);
      if (e) { alert(e.message); return; }
    } else {
      const { error: e } = await supabase.from('contacts').insert(payload);
      if (e) { alert(e.message); return; }
    }
    setModalOpen(false);
    setEditing(null);
    await load();
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este contacto? Si tiene leads vinculados, se eliminarán.')) return;
    const { error: e } = await supabase.from('contacts').delete().eq('id', id);
    if (e) { alert(e.message); return; }
    await load();
  };

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openDetail = (c) => { setEditing(c); setModalOpen(true); };

  // Toggle de categoria en una card.
  const toggleContactCat = (contact, catId) => {
    const set = new Set(contact.categories || []);
    if (set.has(catId)) set.delete(catId); else set.add(catId);
    patchContact(contact.id, { categories: [...set] });
  };

  if (loading) return <div className="text-text3 text-center py-20">Cargando contactos...</div>;
  if (error) return <div className="text-red text-center py-20">Error: {error}</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 space-y-2 mb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">Contactos</h1>
            <p className="text-[11px] text-text3 mt-0.5">{counts.total} contactos en la base · editá inline</p>
          </div>
          <button onClick={openNew}
                  className="py-2 px-3 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark flex items-center gap-1.5">
            <Plus size={14} /> Nuevo contacto
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
                   placeholder="Buscar nombre, teléfono, email, empresa…"
                   className="w-full pl-7 pr-2 py-1.5 text-[12px] bg-bg border border-border rounded-md outline-none focus:border-blue" />
          </div>
          {(search || filterCats.length > 0) && (
            <button onClick={() => { setSearch(''); setFilterCats([]); }}
                    className="text-text3 hover:text-red bg-transparent border-0 p-1 cursor-pointer flex items-center gap-1 text-[11px]">
              <X size={12} /> Limpiar
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {CATEGORIES.map((c) => {
            const active = filterCats.includes(c.id);
            const n = counts[c.id] || 0;
            return (
              <button key={c.id} onClick={() => toggleCat(c.id)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] border transition-colors ${active ? 'border-transparent text-white' : 'border-border bg-white text-text2 hover:bg-surface2'}`}
                      style={active ? { background: c.color } : undefined}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? '#fff' : c.color }} />
                {c.label}
                <span className={active ? 'opacity-90' : 'text-text3'}>({n})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabla con edición inline */}
      <div className="flex-1 min-h-0 bg-white border border-border rounded-lg overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-[12px] min-w-[1000px]">
            <thead className="bg-surface2 border-b border-border text-text2 text-[10px] uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="text-left py-2 px-3 font-semibold w-[150px]">Nombre</th>
                <th className="text-left py-2 px-2 font-semibold w-[110px]">Apellido</th>
                <th className="text-left py-2 px-2 font-semibold">Empresa</th>
                <th className="text-left py-2 px-2 font-semibold w-[140px]">Teléfono</th>
                <th className="text-left py-2 px-2 font-semibold">Email</th>
                <th className="text-left py-2 px-2 font-semibold w-[260px]">Categorías</th>
                <th className="w-[80px]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-text3 py-8 text-[12px]">Sin resultados</td></tr>
              ) : filtered.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-b-0 hover:bg-surface2/30 group">
                  <Cell value={c.first_name} onSave={(v) => patchContact(c.id, { first_name: v })}
                        className="font-semibold" placeholder="Nombre" />
                  <Cell value={c.last_name} onSave={(v) => patchContact(c.id, { last_name: v })}
                        placeholder="Apellido" />
                  <Cell value={c.company} onSave={(v) => patchContact(c.id, { company: v || null })}
                        placeholder="—" />
                  <Cell value={c.phone} onSave={(v) => patchContact(c.id, { phone: v || null })}
                        placeholder="—" />
                  <Cell value={c.email} onSave={(v) => patchContact(c.id, { email: v || null })}
                        placeholder="—" type="email" />
                  <td className="px-2 py-1">
                    <CategoryEditor contact={c} categories={CATEGORIES}
                                    onToggle={(catId) => toggleContactCat(c, catId)} />
                  </td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    <button onClick={() => openDetail(c)} title="Detalle (notas + linked)"
                            className="opacity-0 group-hover:opacity-100 text-text3 hover:text-text bg-transparent border-0 p-1 cursor-pointer transition-opacity">
                      <MoreHorizontal size={14} />
                    </button>
                    <button onClick={() => handleDelete(c.id)} title="Eliminar"
                            className="opacity-0 group-hover:opacity-100 text-text3 hover:text-red bg-transparent border-0 p-1 cursor-pointer transition-opacity">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ContactModal
        open={modalOpen}
        contact={editing}
        categories={CATEGORIES}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
      />
    </div>
  );
}

// Editor de categorías inline: chips activas con X para sacar, "+ agregar" abre dropdown.
function CategoryEditor({ contact, categories, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const active = contact.categories || [];
  const available = categories.filter((c) => !active.includes(c.id));

  return (
    <div ref={ref} className="relative flex flex-wrap gap-1 items-center min-h-[24px]">
      {active.map((catId) => {
        const cat = categories.find((c) => c.id === catId);
        const color = cat?.color || '#9CA3AF';
        return (
          <span key={catId}
                className="inline-flex items-center gap-1 text-[9px] font-semibold pl-1.5 pr-1 py-0.5 rounded uppercase tracking-wider"
                style={{ background: color + '22', color }}>
            {cat?.short || catId}
            <button onClick={() => onToggle(catId)}
                    className="bg-transparent border-0 p-0 cursor-pointer hover:opacity-70"
                    style={{ color }} title="Quitar">
              <X size={10} />
            </button>
          </span>
        );
      })}
      {available.length > 0 && (
        <button onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded border border-dashed border-border text-text3 hover:bg-surface2 cursor-pointer"
                title="Agregar categoría">
          <Plus size={10} /> agregar
        </button>
      )}
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-border rounded-md shadow-lg py-1 z-20 min-w-[180px]">
          {available.map((cat) => (
            <button key={cat.id} type="button"
                    onClick={() => { onToggle(cat.id); setOpen(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] hover:bg-surface2 bg-transparent border-0 cursor-pointer text-left">
              <span className="w-2 h-2 rounded-full" style={{ background: cat.color }} />
              {cat.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Celda editable inline. Persiste en blur o Enter, descarta con Escape.
function Cell({ value, onSave, placeholder = '—', className = '', type = 'text' }) {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  const persist = () => {
    const next = (v ?? '').trim();
    if (next !== (value || '')) onSave(next);
  };
  return (
    <td className="px-2 py-1">
      <input type={type} value={v}
             onChange={(e) => setV(e.target.value)}
             onBlur={persist}
             onKeyDown={(e) => {
               if (e.key === 'Enter') e.currentTarget.blur();
               if (e.key === 'Escape') { setV(value || ''); e.currentTarget.blur(); }
             }}
             placeholder={placeholder}
             className={`w-full bg-transparent border border-transparent hover:border-border focus:border-blue rounded px-1.5 py-1 text-[12px] outline-none ${className}`} />
    </td>
  );
}
