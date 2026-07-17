// Barra de contexto del panel Agentes: Cliente → Estrategia → Funnel → Avatar (cascada).
// Reusa los datos de useApp() (clients / strategies / strategyPages), igual que FunnelsView.
import { useMemo } from 'react';
import { UserCircle2, Layers, Filter, User, ChevronDown, Check } from 'lucide-react';
import useDropdown from './useDropdown';
import DropdownPanel from './DropdownPanel';

// Un slot del contexto. Deshabilitado mientras no esté elegido el nivel anterior.
function ContextPicker(props) {
  const { Icon, label, value, options, placeholder, disabled, onSelect } = props;
  const { open, toggle, close, ref } = useDropdown();
  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative flex-1 min-w-0 max-md:flex-[0_0_auto] max-md:w-[180px]">
      <button
        onClick={() => !disabled && toggle()}
        disabled={disabled}
        title={disabled ? 'Elegí primero el nivel anterior' : label}
        className="flex items-center gap-2.5 w-full min-w-0 text-left py-1.5 px-2.5 rounded-lg border transition-colors enabled:cursor-pointer enabled:hover:border-blue-light disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ background: '#fff', borderColor: open ? 'var(--color-blue)' : 'var(--color-border)' }}
      >
        <Icon size={16} className="text-text3 shrink-0" />
        <span className="flex-1 min-w-0 grid">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-text3">{label}</span>
          <span className="text-[12px] font-semibold truncate" style={{ color: current ? 'var(--color-text)' : 'var(--color-text3)' }}>
            {current?.label || placeholder}
          </span>
        </span>
        <ChevronDown size={14} className="text-text3 shrink-0 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && !disabled && (
        <DropdownPanel width={260} className="p-1.5 max-h-[300px] overflow-y-auto">
          {options.length === 0 ? (
            <div className="text-[12px] text-text3 py-2.5 px-2">Sin opciones.</div>
          ) : options.map((o) => {
            const isActive = o.value === value;
            return (
              <button
                key={o.value}
                onClick={() => { onSelect(o.value); close(); }}
                className="flex items-center gap-2 w-full text-left py-2 px-2.5 rounded-lg text-[12.5px] cursor-pointer border-none transition-colors hover:bg-surface2"
                style={isActive ? { background: 'var(--color-blue-bg)', color: '#2E69E0', fontWeight: 600 } : { background: 'transparent', color: 'var(--color-text2)' }}
              >
                <span className="flex-1 min-w-0 truncate">{o.label}</span>
                {isActive && <Check size={13} strokeWidth={3} className="text-blue shrink-0" />}
              </button>
            );
          })}
        </DropdownPanel>
      )}
    </div>
  );
}

export default function ContextBar({ clients, strategies, strategyPages, sel, onChange }) {
  const clientOpts = useMemo(
    () => (clients || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((c) => ({ value: c.id, label: c.name || c.id })),
    [clients],
  );
  const strategyOpts = useMemo(
    () => (strategies || []).filter((s) => s.client_id === sel.clientId).sort((a, b) => (a.position || 0) - (b.position || 0)).map((s) => ({ value: s.id, label: s.name || s.id })),
    [strategies, sel.clientId],
  );
  const funnelOpts = useMemo(
    () => (strategyPages || []).filter((p) => p.strategy_id === sel.strategyId).sort((a, b) => (a.position || 0) - (b.position || 0)).map((p) => ({ value: p.id, label: p.name || p.id })),
    [strategyPages, sel.strategyId],
  );
  const avatarOpts = useMemo(() => {
    const f = (strategyPages || []).find((p) => p.id === sel.funnelId);
    return (Array.isArray(f?.avatars) ? f.avatars : []).map((a) => ({ value: a.id, label: a.name || 'Avatar' }));
  }, [strategyPages, sel.funnelId]);

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2 bg-bg border border-border rounded-[11px] p-1 max-md:overflow-x-auto">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-text3 pl-2.5 pr-1.5 whitespace-nowrap shrink-0">Contexto</span>
        <ContextPicker Icon={UserCircle2} label="Cliente" value={sel.clientId} options={clientOpts} placeholder="Elegí un cliente…"
          onSelect={(v) => onChange({ clientId: v, strategyId: '', funnelId: '', avatarId: '' })} />
        <ContextPicker Icon={Layers} label="Estrategia" value={sel.strategyId} options={strategyOpts} placeholder={sel.clientId ? 'Elegí una estrategia…' : '—'} disabled={!sel.clientId}
          onSelect={(v) => onChange({ strategyId: v, funnelId: '', avatarId: '' })} />
        <ContextPicker Icon={Filter} label="Funnel" value={sel.funnelId} options={funnelOpts} placeholder={sel.strategyId ? 'Elegí un funnel…' : '—'} disabled={!sel.strategyId}
          onSelect={(v) => onChange({ funnelId: v, avatarId: '' })} />
        <ContextPicker Icon={User} label="Avatar" value={sel.avatarId} options={avatarOpts} placeholder={sel.funnelId ? (avatarOpts.length ? 'Elegí un avatar…' : 'Sin avatares') : '—'} disabled={!sel.funnelId || !avatarOpts.length}
          onSelect={(v) => onChange({ avatarId: v })} />
      </div>

      {sel.funnelId && !avatarOpts.length && (
        <div className="text-[11.5px] text-[#B45309] bg-[#FFFBEB] border border-[#F5E4B8] rounded-lg py-2 px-3">
          Este funnel todavía no tiene avatares. Generalos desde la ficha del cliente (Funnels → “Generar avatares del DEL”) antes de crear anuncios.
        </div>
      )}
    </div>
  );
}
