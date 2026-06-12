import { Search, X } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';

const SCOPES = [
  { id: 'all', label: 'Todos' },
  { id: 'unread', label: 'No leídos' },
  { id: 'dm', label: 'Personas' },
  { id: 'groups', label: 'Grupos' },
];

export default function InboxFilters() {
  const { filters, setFilters, tagsCatalog } = useSoporte();

  return (
    <div className="px-3 pt-3 pb-2 border-b border-border bg-white shrink-0">
      <div className="relative mb-2">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3" />
        <input
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          placeholder="Buscar chat, teléfono, cliente…"
          className="w-full pl-8 pr-7 py-1.5 text-[12.5px] rounded-lg border border-border bg-surface2 outline-none focus:border-[#F59E0B] focus:bg-white transition-colors"
        />
        {filters.search && (
          <button onClick={() => setFilters((f) => ({ ...f, search: '' }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-0 text-text3 hover:text-text cursor-pointer p-0">
            <X size={13} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {SCOPES.map((s) => (
          <button key={s.id}
                  onClick={() => setFilters((f) => ({ ...f, scope: s.id }))}
                  className={`text-[11px] font-semibold px-2 py-1 rounded-full border cursor-pointer transition-colors ${filters.scope === s.id ? 'bg-[#F59E0B] border-[#F59E0B] text-white' : 'bg-white border-border text-text2 hover:border-[#F59E0B]/50'}`}>
            {s.label}
          </button>
        ))}
        {tagsCatalog.length > 0 && (
          <select
            value={filters.tagId || ''}
            onChange={(e) => setFilters((f) => ({ ...f, tagId: e.target.value || null }))}
            className="text-[11px] font-semibold px-1.5 py-1 rounded-full border border-border bg-white text-text2 cursor-pointer outline-none max-w-[120px]"
          >
            <option value="">Etiqueta…</option>
            {tagsCatalog.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
