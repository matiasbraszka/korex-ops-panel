import { Search, X, Inbox, MailOpen, User, Users } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';

// Pestañas con ícono + contador (estilo team inbox) + búsqueda + etiqueta.
const TABS = [
  { id: 'unread', label: 'No leídos', Icon: MailOpen },
  { id: 'all', label: 'Todos', Icon: Inbox },
  { id: 'dm', label: 'Personas', Icon: User },
  { id: 'groups', label: 'Grupos', Icon: Users },
];

export default function InboxFilters({ unreadCount = 0 }) {
  const { filters, setFilters, tagsCatalog } = useSoporte();

  return (
    <div className="px-3 pt-3 pb-2 border-b border-border bg-white shrink-0">
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <span className="text-[14px] font-bold text-text">Bandeja WhatsApp</span>
        {tagsCatalog.length > 0 && (
          <select
            value={filters.tagId || ''}
            onChange={(e) => setFilters((f) => ({ ...f, tagId: e.target.value || null }))}
            className="text-[11px] font-semibold px-1.5 py-1 rounded-lg border border-border bg-white text-text2 cursor-pointer outline-none max-w-[120px]"
          >
            <option value="">Etiqueta…</option>
            {tagsCatalog.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-stretch gap-1 mb-2.5">
        {TABS.map(({ id, label, Icon }) => {
          const on = filters.scope === id;
          return (
            <button key={id}
                    onClick={() => setFilters((f) => ({ ...f, scope: id }))}
                    className={`flex-1 flex flex-col items-center gap-1 pt-2 pb-1.5 rounded-lg border-0 cursor-pointer transition-colors ${on ? 'bg-[#EEF2FF]' : 'bg-transparent hover:bg-surface2'}`}>
              <span className="relative">
                <Icon size={17} strokeWidth={on ? 2.25 : 1.75} className={on ? 'text-[#5B7CF5]' : 'text-text3'} />
                {id === 'unread' && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-3 min-w-[16px] h-[14px] px-1 rounded-full bg-[#5B7CF5] text-white text-[8.5px] font-bold flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-semibold ${on ? 'text-[#5B7CF5]' : 'text-text3'}`}>{label}</span>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3" />
        <input
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          placeholder="Buscar chat, teléfono, cliente…"
          className="w-full pl-8 pr-7 py-1.5 text-[12.5px] rounded-lg border border-border bg-surface2 outline-none focus:border-[#5B7CF5] focus:bg-white transition-colors"
        />
        {filters.search && (
          <button onClick={() => setFilters((f) => ({ ...f, search: '' }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-0 text-text3 hover:text-text cursor-pointer p-0">
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
