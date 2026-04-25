import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, X, Trash2 } from 'lucide-react';
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

  if (loading) return <div className="text-text3 text-center py-20">Cargando contactos...</div>;
  if (error) return <div className="text-red text-center py-20">Error: {error}</div>;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 space-y-2 mb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">Contactos</h1>
            <p className="text-[11px] text-text3 mt-0.5">{counts.total} contactos · click en una fila para editar</p>
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

      {/* Tabla 3 columnas. Click en fila → modal. */}
      <div className="flex-1 min-h-0 bg-white border border-border rounded-lg overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-[13px]">
            <thead className="bg-surface2 border-b border-border text-text2 text-[10px] uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="text-left py-2 px-3 font-semibold w-[35%]">Nombre completo</th>
                <th className="text-left py-2 px-2 font-semibold w-[30%]">Empresa</th>
                <th className="text-left py-2 px-2 font-semibold">Categorías</th>
                <th className="w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-text3 py-8 text-[12px]">Sin resultados</td></tr>
              ) : filtered.map((c) => (
                <tr key={c.id}
                    onClick={() => openDetail(c)}
                    className="border-b border-border last:border-b-0 hover:bg-surface2/40 cursor-pointer group">
                  <td className="px-3 py-2 font-semibold text-text">
                    {[c.first_name, c.last_name].filter(Boolean).join(' ') ||
                      <span className="text-text3 italic font-normal">Sin nombre</span>}
                  </td>
                  <td className="px-2 py-2 text-text2">{c.company || <span className="text-text3">—</span>}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(c.categories || []).map((cat) => (
                        <span key={cat} className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
                              style={{ background: catColor(cat) + '22', color: catColor(cat) }}>
                          {catShort(cat)}
                        </span>
                      ))}
                      {(c.categories || []).length === 0 && (
                        <span className="text-text3 text-[10px] italic">sin categoría</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                            title="Eliminar"
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
