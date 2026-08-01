// Barra de contexto del panel Agentes: Cliente → Funnel → Avatar (cascada).
// La capa "Estrategia" ya no existe como navegación (todo va por funnels y su DEL):
// al elegir el funnel, su strategy_id (la carpeta técnica) se completa solo, porque
// la edge fn del agente lo sigue usando para encontrar el DEL.
// Reusa los datos de useApp() (clients / strategyPages), igual que FunnelsView.
import { useMemo } from 'react';
import { UserCircle2, Filter, User, Mic, ChevronDown, Check } from 'lucide-react';
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

export default function ContextBar({ clients, strategyPages, collaborators, sel, onChange }) {
  const clientOpts = useMemo(
    () => (clients || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((c) => ({ value: c.id, label: c.name || c.id })),
    [clients],
  );
  // Funnels DIRECTO por cliente (sin pasar por la estrategia/carpeta).
  const funnelOpts = useMemo(
    () => (strategyPages || []).filter((p) => p.client_id === sel.clientId).sort((a, b) => (a.position || 0) - (b.position || 0)).map((p) => ({ value: p.id, label: p.name || p.id })),
    [strategyPages, sel.clientId],
  );
  const avatarOpts = useMemo(() => {
    const f = (strategyPages || []).find((p) => p.id === sel.funnelId);
    return (Array.isArray(f?.avatars) ? f.avatars : []).map((a) => ({ value: a.id, label: a.name || 'Avatar' }));
  }, [strategyPages, sel.funnelId]);
  // Encargados de grabación del cliente (los que se graban en cámara → su perfil alimenta a la IA).
  const collabOpts = useMemo(
    () => (collaborators || []).map((c) => ({ value: c.id, label: c.full_name || c.email || 'Encargado' })),
    [collaborators],
  );

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2 bg-bg border border-border rounded-[11px] p-1 max-md:overflow-x-auto">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-text3 pl-2.5 pr-1.5 whitespace-nowrap shrink-0">Contexto</span>
        <ContextPicker Icon={UserCircle2} label="Cliente" value={sel.clientId} options={clientOpts} placeholder="Elegí un cliente…"
          onSelect={(v) => onChange({ clientId: v, strategyId: '', funnelId: '', avatarId: '', collaboratorId: '' })} />
        <ContextPicker Icon={Filter} label="Funnel" value={sel.funnelId} options={funnelOpts} placeholder={sel.clientId ? 'Elegí un funnel…' : '—'} disabled={!sel.clientId}
          onSelect={(v) => {
            // strategyId viaja escondido: la edge fn lo usa para ubicar el DEL del funnel.
            const p = (strategyPages || []).find((x) => x.id === v);
            onChange({ funnelId: v, strategyId: p?.strategy_id || '', avatarId: '' });
          }} />
        <ContextPicker Icon={User} label="Avatar" value={sel.avatarId} options={avatarOpts} placeholder={sel.funnelId ? (avatarOpts.length ? 'Elegí un avatar…' : 'Sin avatares') : '—'} disabled={!sel.funnelId || !avatarOpts.length}
          onSelect={(v) => onChange({ avatarId: v })} />
        <ContextPicker Icon={Mic} label="Encargado" value={sel.collaboratorId} options={collabOpts}
          placeholder={sel.clientId ? (collabOpts.length ? 'Quién se graba…' : 'Sin encargados') : '—'} disabled={!sel.clientId || !collabOpts.length}
          onSelect={(v) => onChange({ collaboratorId: v === sel.collaboratorId ? '' : v })} />
      </div>

      {sel.funnelId && !avatarOpts.length && (
        <div className="text-[11.5px] text-[#B45309] bg-[#FFFBEB] border border-[#F5E4B8] rounded-lg py-2 px-3">
          Este funnel todavía no tiene avatares. Generalos desde la ficha del cliente (Funnels → “Generar avatares del DEL”) antes de crear anuncios.
        </div>
      )}
    </div>
  );
}
