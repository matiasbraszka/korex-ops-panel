// Selector en cascada del panel Agentes: Cliente → Estrategia → Funnel → Avatar.
// Reusa los datos de useApp() (clients / strategies / strategyPages), igual que FunnelsView.
import { useMemo } from 'react';
import { Users, Layers, Filter, UserCircle2 } from 'lucide-react';

const PINK = '#EC4899';

function Select({ Icon, label, value, onChange, options, placeholder, disabled }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0 flex-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9098A4] flex items-center gap-1.5"><Icon size={12} />{label}</span>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full py-2.5 px-3 text-[13px] border border-[#E2E5EB] rounded-xl bg-white outline-none focus:border-[#EC4899] disabled:bg-[#F4F5F7] disabled:text-[#AEB4BF] cursor-pointer disabled:cursor-not-allowed"
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export default function AgentSelector({ clients, strategies, strategyPages, sel, onChange }) {
  const clientOpts = useMemo(
    () => (clients || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => ({ value: c.id, label: c.name || c.id })),
    [clients],
  );
  const strategyOpts = useMemo(
    () => (strategies || []).filter(s => s.client_id === sel.clientId).sort((a, b) => (a.position || 0) - (b.position || 0)).map(s => ({ value: s.id, label: s.name || s.id })),
    [strategies, sel.clientId],
  );
  const funnelOpts = useMemo(
    () => (strategyPages || []).filter(p => p.strategy_id === sel.strategyId).sort((a, b) => (a.position || 0) - (b.position || 0)).map(p => ({ value: p.id, label: p.name || p.id })),
    [strategyPages, sel.strategyId],
  );
  const avatars = useMemo(() => {
    const f = (strategyPages || []).find(p => p.id === sel.funnelId);
    return Array.isArray(f?.avatars) ? f.avatars : [];
  }, [strategyPages, sel.funnelId]);
  const avatarOpts = avatars.map(a => ({ value: a.id, label: a.name || 'Avatar' }));

  return (
    <div className="bg-white rounded-2xl p-4 border border-[#E7EAF0]" style={{ boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9098A4]">Sobre qué trabajamos</span>
      </div>
      <div className="flex gap-3 flex-wrap">
        <Select Icon={Users} label="Cliente" value={sel.clientId} placeholder="Elegí un cliente…" options={clientOpts}
          onChange={v => onChange({ clientId: v, strategyId: '', funnelId: '', avatarId: '' })} />
        <Select Icon={Layers} label="Estrategia" value={sel.strategyId} placeholder={sel.clientId ? 'Elegí una estrategia…' : '—'} options={strategyOpts} disabled={!sel.clientId}
          onChange={v => onChange({ strategyId: v, funnelId: '', avatarId: '' })} />
        <Select Icon={Filter} label="Funnel" value={sel.funnelId} placeholder={sel.strategyId ? 'Elegí un funnel…' : '—'} options={funnelOpts} disabled={!sel.strategyId}
          onChange={v => onChange({ funnelId: v, avatarId: '' })} />
        <Select Icon={UserCircle2} label="Avatar" value={sel.avatarId} placeholder={sel.funnelId ? (avatarOpts.length ? 'Elegí un avatar…' : 'Sin avatares') : '—'} options={avatarOpts} disabled={!sel.funnelId || !avatarOpts.length}
          onChange={v => onChange({ avatarId: v })} />
      </div>
      {sel.funnelId && !avatarOpts.length && (
        <div className="text-[11.5px] text-[#B45309] mt-2.5 bg-[#FFFBEB] border border-[#F5E4B8] rounded-lg py-2 px-3">
          Este funnel todavía no tiene avatares. Generalos desde la ficha del cliente (Funnels → “Generar avatares del DEL”) antes de crear anuncios.
        </div>
      )}
      <div className="mt-3 pt-3 border-t border-[#F1F3F7] flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-[11px] font-bold" style={{ background: '#FDF2F8', color: PINK }}>Agente: Anuncios</span>
        <span className="text-[11px] text-[#AEB4BF]">Especialista en creativos de Meta. Pronto: VSL, Landing, Formularios.</span>
      </div>
    </div>
  );
}
