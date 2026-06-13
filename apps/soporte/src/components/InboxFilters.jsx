import { useEffect, useRef, useState } from 'react';
import { Search, X, PenSquare, Tag, Building2, ChevronDown, Settings2 } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import { fetchTeamMembers } from '../lib/api.js';
import TagManager from './TagManager.jsx';

// Filtros de la bandeja — Diseño A (WhatsApp + acento ámbar Soporte).
// Pills de scope estilo WhatsApp + fila de chips de etiquetas + búsqueda.
const TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'unread', label: 'No leídos' },
  { id: 'dm', label: 'Personas' },
  { id: 'groups', label: 'Grupos' },
  { id: 'archived', label: 'Archivo' },
];

export default function InboxFilters({ unreadCount = 0 }) {
  const { filters, setFilters, tagsCatalog, tagCounts, linkedClients } = useSoporte();
  const searchRef = useRef(null);
  const [team, setTeam] = useState([]);
  const [panel, setPanel] = useState(null); // 'tags' | 'clients' | null
  const [managerOpen, setManagerOpen] = useState(false);

  useEffect(() => {
    fetchTeamMembers().then(setTeam).catch(() => {});
  }, []);

  const activeTag = tagsCatalog.find((t) => t.id === filters.tagId);
  const activeClient = linkedClients.find((c) => c.id === filters.clientId);
  const pickTag = (id) => { setFilters((f) => ({ ...f, tagId: f.tagId === id ? null : id })); setPanel(null); };
  const pickClient = (id) => { setFilters((f) => ({ ...f, clientId: f.clientId === id ? null : id })); setPanel(null); };

  return (
    <div className="px-3.5 pt-3.5 pb-0 bg-white shrink-0 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-bold text-text">Bandeja WhatsApp</span>
        <button onClick={() => searchRef.current?.focus()} title="Buscar un chat"
                className="w-7 h-7 rounded-[9px] border border-border bg-white text-text2 hover:text-[#B45309] hover:border-[#F5D9A8] cursor-pointer flex items-center justify-center transition-colors duration-150">
          <PenSquare size={13} />
        </button>
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
        <input
          ref={searchRef}
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          placeholder="Buscar chat, teléfono, cliente…"
          className="w-full h-[34px] pl-8 pr-7 text-[12.5px] rounded-[10px] border border-border bg-surface2 outline-none focus:border-[#F59E0B] focus:bg-white transition-colors"
        />
        {filters.search && (
          <button onClick={() => setFilters((f) => ({ ...f, search: '' }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-0 text-text3 hover:text-text cursor-pointer p-0">
            <X size={13} />
          </button>
        )}
      </div>

      {/* Pills de scope (estilo WhatsApp, activa en ámbar) + filtro por asignado */}
      <div className="flex gap-1.5 flex-wrap items-center">
        {TABS.map(({ id, label }) => {
          const on = filters.scope === id;
          return (
            <button key={id}
                    onClick={() => setFilters((f) => ({ ...f, scope: id }))}
                    className={`px-3 py-[5px] rounded-full text-[12px] cursor-pointer transition-all duration-150 border ${
                      on
                        ? 'bg-[#FEF0D7] border-[#F5D9A8] text-[#B45309] font-semibold'
                        : 'bg-white border-border text-text2 font-medium hover:bg-surface2 hover:border-[#D0D5DD]'
                    }`}>
              {label}
              {id === 'unread' && unreadCount > 0 && (
                <b className="ml-1 text-[#B45309]">{unreadCount > 99 ? '99+' : unreadCount}</b>
              )}
            </button>
          );
        })}
        {team.length > 0 && (
          <select
            value={filters.assigneeId || ''}
            onChange={(e) => setFilters((f) => ({ ...f, assigneeId: e.target.value || null }))}
            title="Filtrar por persona asignada"
            className={`px-2.5 py-[5px] rounded-full text-[12px] cursor-pointer outline-none transition-all duration-150 border max-w-[130px] ${
              filters.assigneeId
                ? 'bg-[#FEF0D7] border-[#F5D9A8] text-[#B45309] font-semibold'
                : 'bg-white border-border text-text2 font-medium hover:bg-surface2'
            }`}>
            <option value="">👤 Asignado…</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>

      {/* Etiquetas + Cliente: botones que abren un panel (como WhatsApp) */}
      <div className="flex gap-1.5 items-center flex-wrap pb-3 border-b border-surface2 relative">
        <button onClick={() => setPanel(panel === 'tags' ? null : 'tags')}
                className={`text-[12px] font-medium px-3 py-[5px] rounded-full cursor-pointer border flex items-center gap-1.5 transition-all duration-150 ${
                  filters.tagId ? 'bg-[#FEF0D7] border-[#F5D9A8] text-[#B45309] font-semibold' : 'bg-white border-border text-text2 hover:bg-surface2'}`}>
          <Tag size={12} />
          {activeTag ? (
            <span className="flex items-center gap-1">
              {activeTag.label}
              <X size={12} onClick={(e) => { e.stopPropagation(); setFilters((f) => ({ ...f, tagId: null })); }} className="hover:text-[#DC2626]" />
            </span>
          ) : 'Etiquetas'}
          <ChevronDown size={12} className="opacity-60" />
        </button>

        {linkedClients.length > 0 && (
          <button onClick={() => setPanel(panel === 'clients' ? null : 'clients')}
                  className={`text-[12px] font-medium px-3 py-[5px] rounded-full cursor-pointer border flex items-center gap-1.5 transition-all duration-150 ${
                    filters.clientId ? 'bg-[#EEF2FF] border-[#C8D6FF] text-[#4A67D8] font-semibold' : 'bg-white border-border text-text2 hover:bg-surface2'}`}>
            <Building2 size={12} />
            {activeClient ? (
              <span className="flex items-center gap-1 max-w-[140px] truncate">
                {activeClient.name}
                <X size={12} onClick={(e) => { e.stopPropagation(); setFilters((f) => ({ ...f, clientId: null })); }} className="hover:text-[#DC2626] shrink-0" />
              </span>
            ) : 'Cliente'}
            <ChevronDown size={12} className="opacity-60" />
          </button>
        )}

        {/* Panel desplegable */}
        {panel && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setPanel(null)} />
            <div className="absolute top-full left-0 mt-1 z-30 w-[240px] max-h-[300px] overflow-y-auto bg-white border border-border rounded-xl shadow-[0_8px_24px_rgba(10,22,40,0.12)] p-1.5">
              {panel === 'tags' && (
                <>
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-[10px] font-bold tracking-widest text-text3 uppercase">Etiquetas</span>
                    <button onClick={() => { setManagerOpen(true); setPanel(null); }}
                            className="text-[10.5px] font-semibold text-[#B45309] bg-transparent border-0 cursor-pointer flex items-center gap-1 hover:underline p-0">
                      <Settings2 size={11} /> Administrar
                    </button>
                  </div>
                  {tagsCatalog.length === 0 ? (
                    <div className="text-[11.5px] text-text3 px-2 py-3 text-center">Todavía no creaste etiquetas.</div>
                  ) : tagsCatalog.map((t) => (
                    <button key={t.id} onClick={() => pickTag(t.id)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer border-0 text-left transition-colors duration-150 ${
                              filters.tagId === t.id ? 'bg-[#FFFBF2]' : 'bg-transparent hover:bg-surface2'}`}>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.color }} />
                      <span className="flex-1 text-[12.5px] font-medium truncate">{t.label}</span>
                      <span className="text-[11px] font-semibold text-text3">{tagCounts[t.id] || 0}</span>
                    </button>
                  ))}
                </>
              )}
              {panel === 'clients' && (
                <>
                  <div className="px-2 py-1 text-[10px] font-bold tracking-widest text-text3 uppercase">Clientes vinculados</div>
                  {linkedClients.map((c) => (
                    <button key={c.id} onClick={() => pickClient(c.id)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer border-0 text-left transition-colors duration-150 ${
                              filters.clientId === c.id ? 'bg-[#EEF2FF]' : 'bg-transparent hover:bg-surface2'}`}>
                      <Building2 size={12} className="text-[#4A67D8] shrink-0" />
                      <span className="flex-1 text-[12.5px] font-medium truncate">{c.name}</span>
                      <span className="text-[11px] font-semibold text-text3">{c.count}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <TagManager open={managerOpen} onClose={() => setManagerOpen(false)} />
    </div>
  );
}
