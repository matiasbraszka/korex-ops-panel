import { useEffect, useRef, useState } from 'react';
import { Search, X, PenSquare, Building2, Settings2, SlidersHorizontal, Check, UserCheck } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import { fetchTeamMembers } from '../lib/api.js';
import TagManager from './TagManager.jsx';

// Filtros de la bandeja — minimalista: un solo botón de "Filtros" que despliega
// un panel con todo (Ver / Asignado / Etiquetas / Cliente). Los filtros activos
// se muestran como chips debajo de la búsqueda para no perderlos de vista.
const SCOPES = [
  { id: 'all', label: 'Todos' },
  { id: 'unread', label: 'No leídos' },
  { id: 'dm', label: 'Personas' },
  { id: 'groups', label: 'Grupos' },
  { id: 'archived', label: 'Archivo' },
];

export default function InboxFilters({ unreadCount = 0 }) {
  const { filters, setFilters, tagsCatalog, tagCounts, linkedClients, assigneeCounts } = useSoporte();
  const searchRef = useRef(null);
  const [team, setTeam] = useState([]);
  const [open, setOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);

  useEffect(() => {
    fetchTeamMembers().then(setTeam).catch(() => {});
  }, []);

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  const activeTag = tagsCatalog.find((t) => t.id === filters.tagId);
  const activeClient = linkedClients.find((c) => c.id === filters.clientId);
  const activeMember = team.find((m) => m.id === filters.assigneeId);
  const activeScope = SCOPES.find((s) => s.id === filters.scope);
  // Personas que tienen al menos un chat asignado, ordenadas por cantidad (desc).
  const assigneeMembers = team
    .filter((m) => assigneeCounts[m.id])
    .sort((a, b) => (assigneeCounts[b.id] || 0) - (assigneeCounts[a.id] || 0));

  // Filtros no-por-defecto aplicados (scope 'all' no cuenta).
  const activeCount =
    (filters.scope && filters.scope !== 'all' ? 1 : 0) +
    (filters.assigneeId ? 1 : 0) +
    (filters.tagId ? 1 : 0) +
    (filters.clientId ? 1 : 0);

  const chips = [
    filters.scope && filters.scope !== 'all' && { key: 'scope', label: activeScope?.label, clear: () => set({ scope: 'all' }) },
    filters.assigneeId && { key: 'assignee', label: activeMember?.name || 'Asignado', clear: () => set({ assigneeId: null }) },
    filters.tagId && { key: 'tag', label: activeTag?.label || 'Etiqueta', clear: () => set({ tagId: null }) },
    filters.clientId && { key: 'client', label: activeClient?.name || 'Cliente', clear: () => set({ clientId: null }) },
  ].filter(Boolean);

  const clearAll = () => set({ scope: 'all', assigneeId: null, tagId: null, clientId: null });

  return (
    <div className="px-3.5 pt-3.5 pb-3 bg-white shrink-0 flex flex-col gap-2.5 border-b border-surface2">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-bold text-text">Bandeja WhatsApp</span>
        <button onClick={() => searchRef.current?.focus()} title="Buscar un chat"
                className="w-7 h-7 rounded-[9px] border border-border bg-white text-text2 hover:text-[#B45309] hover:border-[#F5D9A8] cursor-pointer flex items-center justify-center transition-colors duration-150">
          <PenSquare size={13} />
        </button>
      </div>

      {/* Búsqueda + botón único de Filtros */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
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

        <div className="relative shrink-0">
          <button onClick={() => setOpen((o) => !o)} title="Filtros"
                  className={`h-[34px] px-2.5 rounded-[10px] border cursor-pointer flex items-center gap-1 transition-colors duration-150 ${
                    activeCount || open ? 'bg-[#FEF0D7] border-[#F5D9A8] text-[#B45309]' : 'bg-white border-border text-text2 hover:bg-surface2'}`}>
            <SlidersHorizontal size={14} />
            {activeCount > 0 && (
              <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-[#F59E0B] text-white text-[10px] font-bold flex items-center justify-center">{activeCount}</span>
            )}
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
              <div className="absolute top-full right-0 mt-1.5 z-30 w-[262px] max-h-[72vh] overflow-y-auto bg-white border border-border rounded-xl shadow-[0_8px_24px_rgba(10,22,40,0.14)] p-2.5 flex flex-col gap-3">
                {/* Ver (scope) */}
                <div>
                  <div className="px-0.5 pb-1.5 text-[10px] font-bold tracking-widest text-text3 uppercase">Ver</div>
                  <div className="flex flex-wrap gap-1">
                    {SCOPES.map((s) => {
                      const on = filters.scope === s.id;
                      return (
                        <button key={s.id} onClick={() => set({ scope: s.id })}
                                className={`px-2.5 py-1 rounded-full text-[12px] border cursor-pointer transition-colors duration-150 ${
                                  on ? 'bg-[#FEF0D7] border-[#F5D9A8] text-[#B45309] font-semibold' : 'bg-white border-border text-text2 hover:bg-surface2'}`}>
                          {s.label}
                          {s.id === 'unread' && unreadCount > 0 && (
                            <b className="ml-1 text-[#B45309]">{unreadCount > 99 ? '99+' : unreadCount}</b>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Asignado a — cada persona con la cantidad de chats que tiene
                    asignados (múltiple: un chat puede estar en más de una). */}
                {assigneeMembers.length > 0 && (
                  <div>
                    <div className="px-0.5 pb-1.5 text-[10px] font-bold tracking-widest text-text3 uppercase">Asignado a</div>
                    <div className="max-h-[150px] overflow-y-auto flex flex-col gap-0.5">
                      {assigneeMembers.map((m) => (
                        <button key={m.id} onClick={() => set({ assigneeId: filters.assigneeId === m.id ? null : m.id })}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer border-0 text-left transition-colors duration-150 ${
                                  filters.assigneeId === m.id ? 'bg-[#FFFBF2]' : 'bg-transparent hover:bg-surface2'}`}>
                          <UserCheck size={12} className="text-[#B45309] shrink-0" />
                          <span className="flex-1 text-[12.5px] font-medium truncate">{m.name}</span>
                          {filters.assigneeId === m.id && <Check size={13} className="text-[#B45309] shrink-0" />}
                          <span className="text-[11px] font-semibold text-text3">{assigneeCounts[m.id] || 0}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Etiquetas */}
                <div>
                  <div className="flex items-center justify-between px-0.5 pb-1.5">
                    <span className="text-[10px] font-bold tracking-widest text-text3 uppercase">Etiquetas</span>
                    <button onClick={() => { setManagerOpen(true); setOpen(false); }}
                            className="text-[10.5px] font-semibold text-[#B45309] bg-transparent border-0 cursor-pointer flex items-center gap-1 hover:underline p-0">
                      <Settings2 size={11} /> Administrar
                    </button>
                  </div>
                  {tagsCatalog.length === 0 ? (
                    <div className="text-[11.5px] text-text3 px-2 py-2 text-center">Todavía no creaste etiquetas.</div>
                  ) : (
                    <div className="max-h-[150px] overflow-y-auto flex flex-col gap-0.5">
                      {tagsCatalog.map((t) => (
                        <button key={t.id} onClick={() => set({ tagId: filters.tagId === t.id ? null : t.id })}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer border-0 text-left transition-colors duration-150 ${
                                  filters.tagId === t.id ? 'bg-[#FFFBF2]' : 'bg-transparent hover:bg-surface2'}`}>
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.color }} />
                          <span className="flex-1 text-[12.5px] font-medium truncate">{t.label}</span>
                          {filters.tagId === t.id && <Check size={13} className="text-[#B45309] shrink-0" />}
                          <span className="text-[11px] font-semibold text-text3">{tagCounts[t.id] || 0}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cliente */}
                {linkedClients.length > 0 && (
                  <div>
                    <div className="px-0.5 pb-1.5 text-[10px] font-bold tracking-widest text-text3 uppercase">Cliente</div>
                    <div className="max-h-[150px] overflow-y-auto flex flex-col gap-0.5">
                      {linkedClients.map((c) => (
                        <button key={c.id} onClick={() => set({ clientId: filters.clientId === c.id ? null : c.id })}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer border-0 text-left transition-colors duration-150 ${
                                  filters.clientId === c.id ? 'bg-[#EEF2FF]' : 'bg-transparent hover:bg-surface2'}`}>
                          <Building2 size={12} className="text-[#4A67D8] shrink-0" />
                          <span className="flex-1 text-[12.5px] font-medium truncate">{c.name}</span>
                          {filters.clientId === c.id && <Check size={13} className="text-[#4A67D8] shrink-0" />}
                          <span className="text-[11px] font-semibold text-text3">{c.count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeCount > 0 && (
                  <button onClick={clearAll}
                          className="text-[11.5px] font-semibold text-text3 hover:text-[#DC2626] bg-transparent border-0 cursor-pointer py-0.5">
                    Limpiar filtros
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chips de filtros activos (para verlos sin abrir el panel) */}
      {chips.length > 0 && (
        <div className="flex gap-1.5 flex-wrap items-center">
          {chips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-[3px] rounded-full bg-[#FEF0D7] text-[#B45309] max-w-[150px]">
              <span className="truncate">{c.label}</span>
              <X size={11} className="cursor-pointer hover:text-[#DC2626] shrink-0" onClick={c.clear} />
            </span>
          ))}
          {chips.length > 1 && (
            <button onClick={clearAll} className="text-[11px] text-text3 hover:text-text bg-transparent border-0 cursor-pointer underline">
              Limpiar
            </button>
          )}
        </div>
      )}

      <TagManager open={managerOpen} onClose={() => setManagerOpen(false)} />
    </div>
  );
}
