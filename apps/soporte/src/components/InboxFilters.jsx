import { useEffect, useRef, useState } from 'react';
import { Search, X, PenSquare } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import { fetchTeamMembers } from '../lib/api.js';

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
  const { filters, setFilters, tagsCatalog } = useSoporte();
  const searchRef = useRef(null);
  const [team, setTeam] = useState([]);

  useEffect(() => {
    fetchTeamMembers().then(setTeam).catch(() => {});
  }, []);

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

      {/* Chips de etiquetas (filtro por tag) */}
      {tagsCatalog.length > 0 && (
        <div className="flex gap-1.5 items-center flex-wrap pb-3 border-b border-surface2">
          {tagsCatalog.slice(0, 4).map((t) => {
            const on = filters.tagId === t.id;
            return (
              <button key={t.id}
                      onClick={() => setFilters((f) => ({ ...f, tagId: on ? null : t.id }))}
                      className={`text-[11px] font-semibold px-2.5 py-[3px] rounded-full cursor-pointer border-0 flex items-center gap-1.5 transition-all duration-150 ${on ? 'ring-1 ring-current' : ''}`}
                      style={{ background: t.color + '1f', color: t.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />
                {t.label}
              </button>
            );
          })}
          {tagsCatalog.length > 4 && (
            <span className="text-[11px] font-semibold px-2.5 py-[3px] rounded-full border border-dashed border-[#D0D5DD] text-text3">
              + {tagsCatalog.length - 4}
            </span>
          )}
        </div>
      )}
      {tagsCatalog.length === 0 && <div className="pb-1" />}
    </div>
  );
}
