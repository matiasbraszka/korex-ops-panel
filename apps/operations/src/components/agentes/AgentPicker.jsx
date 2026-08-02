// Selector de agente del header: botón con el agente activo + grilla de agentes con buscador.
// Los agentes que todavía no responden se muestran con el cartel "Pronto" y no se pueden abrir.
import { useState, useMemo } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import useDropdown from './useDropdown';
import DropdownPanel from './DropdownPanel';
import { chatAgents, agentMeta } from './agentMeta';

export default function AgentPicker({ subagents, agentKey, onChange }) {
  const { open, toggle, close, ref } = useDropdown();
  const [q, setQ] = useState('');

  const agents = useMemo(() => chatAgents(subagents), [subagents]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return agents;
    return agents.filter((a) => `${a.name} ${a.desc}`.toLowerCase().includes(t));
  }, [agents, q]);

  const active = agents.find((a) => a.key === agentKey);
  const ActiveIcon = (active || agentMeta(agentKey)).Icon;

  return (
    <div ref={ref} className="relative flex-1 min-w-0 max-w-[380px]">
      <button
        onClick={toggle}
        className="flex items-center gap-3 w-full min-w-0 text-left py-2 px-3 rounded-xl border cursor-pointer transition-colors"
        style={{ background: open ? 'var(--color-blue-bg)' : 'var(--color-bg)', borderColor: open ? 'var(--color-blue)' : 'var(--color-border)' }}
      >
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-[10px] bg-blue text-white shrink-0" style={{ boxShadow: '0 3px 10px rgba(91,124,245,.32)' }}>
          <ActiveIcon size={20} strokeWidth={1.9} />
        </span>
        <span className="flex-1 min-w-0 grid gap-px">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-text3">Agentes</span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-[15px] font-bold tracking-[-0.01em] text-text truncate">{active?.name || 'Elegí un agente'}</span>
            <span className="hidden md:inline-flex items-center gap-1 text-[9.5px] font-semibold text-green bg-green-bg py-0.5 px-[7px] rounded-full shrink-0">
              <span className="w-[5px] h-[5px] rounded-full bg-green" />Activo
            </span>
          </span>
        </span>
        <ChevronDown size={18} className="text-text3 shrink-0 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <DropdownPanel width={600} className="p-3.5 max-h-[72vh] overflow-y-auto">
          <div className="flex items-center justify-between gap-3 pb-3 px-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-text3 whitespace-nowrap">Elegí un agente · {agents.length}</span>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…"
                className="w-[150px] max-md:w-[110px] bg-bg border border-border rounded-lg py-[5px] pl-7 pr-2.5 text-[11.5px] text-text outline-none focus:border-blue focus:bg-white" />
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {shown.map((a) => {
              const isActive = a.key === agentKey;
              const { Icon } = a;
              return (
                <button
                  key={a.key}
                  disabled={!a.live}
                  onClick={() => { onChange(a.key); close(); }}
                  title={a.live ? a.desc : 'Todavía no está disponible'}
                  className="flex items-center gap-2.5 w-full text-left py-2.5 px-3 rounded-xl border transition-colors enabled:cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed enabled:hover:border-blue-light"
                  style={isActive ? { background: 'var(--color-blue-bg)', borderColor: 'var(--color-blue)' } : { background: '#fff', borderColor: 'var(--color-border)' }}
                >
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-[9px] shrink-0"
                    style={isActive ? { background: 'var(--color-blue)', color: '#fff', boxShadow: '0 2px 8px rgba(91,124,245,.3)' } : { background: 'var(--color-surface2)', color: 'var(--color-text2)' }}>
                    <Icon size={18} strokeWidth={isActive ? 2 : 1.75} />
                  </span>
                  <span className="flex-1 min-w-0 grid gap-px">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[13px] font-semibold truncate" style={{ color: isActive ? '#2E69E0' : 'var(--color-text)' }}>{a.name}</span>
                      {!a.live && <span className="text-[9px] font-bold uppercase tracking-[0.06em] text-text3 bg-surface2 py-0.5 px-1.5 rounded-full shrink-0">Pronto</span>}
                    </span>
                    <span className="text-[11px] text-text3 truncate">{a.desc}</span>
                  </span>
                  {isActive && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue text-white shrink-0"><Check size={12} strokeWidth={3} /></span>
                  )}
                </button>
              );
            })}
            {shown.length === 0 && <div className="text-[12px] text-text3 py-3 px-1.5">Ningún agente coincide con la búsqueda.</div>}
          </div>
        </DropdownPanel>
      )}
    </div>
  );
}
