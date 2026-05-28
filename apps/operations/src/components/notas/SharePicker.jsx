import { useMemo, useRef, useState, useEffect } from 'react';
import { Check, Search, ChevronDown, X, Users } from 'lucide-react';
import TeamAvatar from '../TeamAvatar';

// Multi-select de personas del equipo para compartir una nota.
// El autor se asume incluido implicitamente; no aparece como opcion.
//
// Props:
//   selectedIds: string[]   ids de team_members con quien se comparte
//   onChange: (ids: string[]) => void
//   teamMembers: array completo del equipo
//   excludeIds: string[]    ids a ocultar del listado (ej: el autor)
//   placeholder: string

export default function SharePicker({ selectedIds = [], onChange, teamMembers = [], excludeIds = [], placeholder = 'Compartir con…' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const memberById = useMemo(() => {
    const map = {};
    teamMembers.forEach((m) => { map[m.id] = m; });
    return map;
  }, [teamMembers]);

  const available = useMemo(() => {
    const exclude = new Set(excludeIds);
    let list = teamMembers.filter((m) => !exclude.has(m.id));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) => (m.name || '').toLowerCase().includes(q));
    }
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [teamMembers, excludeIds, search]);

  const toggle = (id) => {
    if (selectedIds.includes(id)) onChange?.(selectedIds.filter((x) => x !== id));
    else onChange?.([...selectedIds, id]);
  };

  const removeOne = (id) => onChange?.(selectedIds.filter((x) => x !== id));

  const selectAll = () => onChange?.(available.map((m) => m.id));
  const clearAll = () => onChange?.([]);

  const selectedMembers = selectedIds.map((id) => memberById[id]).filter(Boolean);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans bg-white text-left flex items-center gap-2 hover:border-gray-300 cursor-pointer"
      >
        <Users size={14} className="text-gray-400 shrink-0" />
        {selectedMembers.length === 0 ? (
          <span className="text-gray-400">{placeholder}</span>
        ) : (
          <div className="flex-1 flex flex-wrap gap-1 min-w-0">
            {selectedMembers.slice(0, 4).map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[11px] font-medium rounded-full py-0.5 pl-1 pr-1.5">
                <TeamAvatar member={{ ...m, avatar: m.avatar_url || m.avatar }} size={14} />
                {m.name.split(' ')[0]}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeOne(m.id); }}
                  className="hover:bg-blue-100 rounded-full text-blue-500 bg-transparent border-none cursor-pointer p-0.5"
                  aria-label={`Quitar ${m.name}`}
                ><X size={10} /></button>
              </span>
            ))}
            {selectedMembers.length > 4 && (
              <span className="text-[11px] text-gray-500 self-center">+{selectedMembers.length - 4}</span>
            )}
          </div>
        )}
        <ChevronDown size={14} className="text-gray-400 shrink-0 ml-auto" />
      </button>

      {open && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100 flex items-center gap-1.5">
            <Search size={13} className="text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar persona…"
              autoFocus
              className="flex-1 text-[12px] font-sans outline-none bg-transparent"
            />
            <button
              type="button"
              onClick={selectedIds.length ? clearAll : selectAll}
              className="text-[10px] text-gray-500 hover:text-blue-600 bg-transparent border-none cursor-pointer font-sans whitespace-nowrap"
            >{selectedIds.length ? 'Limpiar' : 'Todos'}</button>
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            {available.length === 0 ? (
              <div className="text-center text-[12px] text-gray-400 py-6">Sin resultados</div>
            ) : available.map((m) => {
              const isOn = selectedIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer border-none font-sans transition-colors ${isOn ? 'bg-blue-50/60 hover:bg-blue-50' : 'bg-transparent hover:bg-gray-50'}`}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isOn ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 bg-white'}`}>
                    {isOn && <Check size={10} strokeWidth={3} />}
                  </span>
                  <TeamAvatar member={{ ...m, avatar: m.avatar_url || m.avatar }} size={20} />
                  <span className="text-[12.5px] text-gray-800 flex-1 truncate">{m.name}</span>
                  {m.role && <span className="text-[10px] text-gray-400 shrink-0">{m.role}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
