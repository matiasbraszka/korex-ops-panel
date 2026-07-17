// Historial de chats (agent_chats) en el header: todos los clientes, agrupados por fecha,
// con buscador, "Nuevo chat" y borrado por fila.
import { useState, useMemo } from 'react';
import { ChevronDown, History, Search, Plus, Trash2 } from 'lucide-react';
import useDropdown from './useDropdown';
import DropdownPanel from './DropdownPanel';
import { agentMeta } from './agentMeta';

// Agrupa por Hoy / Ayer / Anteriores según updated_at.
function groupOf(iso) {
  if (!iso) return 'Anteriores';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Hoy';
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (sameDay(d, yest)) return 'Ayer';
  return 'Anteriores';
}
const GROUP_ORDER = ['Hoy', 'Ayer', 'Anteriores'];

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return groupOf(iso) === 'Hoy'
    ? d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

export default function ChatHistoryMenu({ chats, activeChatId, chatLabel, onOpen, onDelete, onNew }) {
  const { open, toggle, close, ref } = useDropdown();
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const filtered = t ? chats.filter((c) => `${c.title || ''} ${chatLabel(c)}`.toLowerCase().includes(t)) : chats;
    return GROUP_ORDER
      .map((label) => ({ label, items: filtered.filter((c) => groupOf(c.updated_at) === label) }))
      .filter((g) => g.items.length);
  }, [chats, q, chatLabel]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={toggle}
        title="Historial de chats"
        className="flex items-center gap-2.5 text-left py-2 px-3 rounded-xl border cursor-pointer transition-colors"
        style={{ background: open ? 'var(--color-blue-bg)' : '#fff', borderColor: open ? 'var(--color-blue)' : 'var(--color-border)' }}
      >
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-[10px] bg-surface2 text-text2 shrink-0"><History size={19} strokeWidth={1.85} /></span>
        <span className="hidden md:grid gap-px">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-text3">Historial</span>
          <span className="text-[15px] font-bold tracking-[-0.01em] text-text whitespace-nowrap">{chats.length} chats</span>
        </span>
        <ChevronDown size={18} className="hidden md:block text-text3 shrink-0 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <DropdownPanel width={380} className="flex flex-col max-h-[70vh]">
          <div className="p-3.5 pb-2.5 shrink-0 grid gap-2.5 border-b border-[#E5E7EB]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-text3">Historial de chats</span>
              <button onClick={() => { onNew(); close(); }} className="inline-flex items-center gap-1.5 bg-blue hover:bg-blue-dark text-white border-none rounded-lg py-[5px] px-2.5 text-[11px] font-semibold cursor-pointer" style={{ boxShadow: '0 1px 3px rgba(91,124,245,.3)' }}>
                <Plus size={12} strokeWidth={2.2} /> Nuevo
              </button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en el historial…"
                className="w-full bg-bg border border-border rounded-[9px] py-[7px] pl-8 pr-3 text-[12px] text-text outline-none focus:border-blue focus:bg-white" />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto py-2 px-2.5 pb-3">
            {groups.length === 0 ? (
              <div className="text-[12px] text-text3 py-3 px-2">{chats.length === 0 ? 'Todavía no hay chats guardados. Empezá uno nuevo.' : 'Ningún chat coincide con la búsqueda.'}</div>
            ) : groups.map((g) => (
              <div key={g.label} className="mb-2.5">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text3 pt-1.5 px-2 pb-1">{g.label}</div>
                {g.items.map((c) => {
                  const isActive = c.id === activeChatId;
                  const { Icon } = agentMeta(c.subagent_key);
                  return (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => { onOpen(c); close(); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { onOpen(c); close(); } }}
                      title={c.title}
                      className="group flex items-stretch gap-2.5 w-full text-left py-2.5 pl-2 pr-2.5 rounded-[9px] cursor-pointer transition-colors hover:bg-surface2"
                      style={isActive ? { background: 'var(--color-blue-bg2)' } : undefined}
                    >
                      <span className="w-[3px] rounded-full shrink-0" style={{ background: isActive ? 'var(--color-blue)' : 'transparent' }} />
                      <span className="flex-1 min-w-0 grid gap-0.5">
                        <span className="text-[12.5px] font-semibold text-text truncate">{c.title || 'Chat'}</span>
                        <span className="inline-flex items-center gap-1.5 text-[10.5px] text-text3 truncate">
                          <Icon size={12} className="text-text2 shrink-0" />{chatLabel(c) || '—'}
                        </span>
                      </span>
                      <span className="flex items-start gap-1 shrink-0">
                        <span className="text-[10px] text-text3 whitespace-nowrap mt-0.5">{fmtTime(c.updated_at)}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          title="Borrar chat"
                          onClick={(e) => onDelete(e, c.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter') onDelete(e, c.id); }}
                          className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-6 h-6 rounded text-red hover:bg-red-bg cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </DropdownPanel>
      )}
    </div>
  );
}
