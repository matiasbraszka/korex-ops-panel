import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Users, Check, Settings2 } from 'lucide-react';
import { initials } from './format.js';

function VendorFilter({ vendor, onVendor, sellers }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const current = vendor === 'all' ? null : sellers.find((s) => s.user_id === vendor);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
              className="bg-white border border-border rounded-lg px-2.5 py-1.5 inline-flex items-center gap-2 text-[12px] cursor-pointer hover:bg-surface2 min-w-[180px]">
        {current ? (
          <>
            {current.avatar_url
              ? <img src={current.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
              : <span className="w-5 h-5 rounded-full inline-flex items-center justify-center font-bold text-[9px] text-white"
                      style={{ background: current.color || '#5B7CF5' }}>{initials(current.name)}</span>}
            <span className="font-semibold text-text truncate">{current.name}</span>
          </>
        ) : (
          <>
            <span className="w-5 h-5 rounded-full bg-surface2 text-text2 inline-flex items-center justify-center">
              <Users size={11} />
            </span>
            <span className="font-semibold text-text">Todos los vendedores</span>
          </>
        )}
        <span className="flex-1" />
        <ChevronDown size={11} className="text-text3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 min-w-[260px] bg-white border border-border rounded-lg shadow-xl p-1 z-50 max-h-[360px] overflow-y-auto">
          <button onClick={() => { onVendor('all'); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-[12.5px] font-semibold cursor-pointer hover:bg-surface2"
                  style={{ background: vendor === 'all' ? 'var(--color-blue-bg)' : 'transparent', color: vendor === 'all' ? 'var(--color-blue)' : 'var(--color-text)' }}>
            <span className="w-6 h-6 rounded-md bg-surface2 text-text2 inline-flex items-center justify-center">
              <Users size={12} />
            </span>
            <span className="flex-1">Todos los vendedores</span>
            {vendor === 'all' && <Check size={13} />}
          </button>
          <div className="h-px bg-border my-1 mx-1" />
          {sellers.length === 0 && (
            <div className="px-3 py-3 text-[11px] text-text3 text-center">Sin vendedores cargados.</div>
          )}
          {sellers.map((s) => {
            const on = vendor === s.user_id;
            return (
              <button key={s.user_id}
                      onClick={() => { onVendor(s.user_id); setOpen(false); }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-[12.5px] font-semibold cursor-pointer hover:bg-surface2"
                      style={{ background: on ? 'var(--color-blue-bg)' : 'transparent', color: on ? 'var(--color-blue)' : 'var(--color-text)' }}>
                {s.avatar_url
                  ? <img src={s.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                  : <span className="w-6 h-6 rounded-full inline-flex items-center justify-center font-bold text-[10px] text-white"
                          style={{ background: s.color || '#5B7CF5' }}>{s.initials || initials(s.name)}</span>}
                <div className="flex-1 min-w-0">
                  <div className="truncate">{s.name}</div>
                  <div className="text-[10px] text-text3 font-medium truncate">{s.role || 'Vendedor'}</div>
                </div>
                {on && <Check size={13} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardFilters({ vendor, setVendor, range, setRange, sellers, isAdmin, onEditTargets, generatedAt }) {
  // Tiempo legible "hace Xm"
  let timeText = 'recién';
  if (generatedAt) {
    const diffMs = Date.now() - new Date(generatedAt).getTime();
    const min = Math.max(0, Math.round(diffMs / 60000));
    timeText = min === 0 ? 'recién actualizado' : `hace ${min} min`;
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-bg text-blue">
            Ventas
          </span>
          <div className="text-[17px] font-bold leading-tight">Dashboard</div>
        </div>
        <div className="text-[11px] text-text3 mt-0.5">Métricas en tiempo real · {timeText}</div>
      </div>
      <span className="flex-1" />

      <VendorFilter vendor={vendor} onVendor={setVendor} sellers={sellers} />

      <div className="inline-flex bg-surface2 rounded-lg p-0.5 gap-0.5">
        <button onClick={() => setRange('month')}
                className="px-3 py-1 text-[11.5px] font-semibold rounded-md cursor-pointer border-0"
                style={{
                  background: range === 'month' ? 'white' : 'transparent',
                  color: range === 'month' ? 'var(--color-text)' : 'var(--color-text2)',
                  boxShadow: range === 'month' ? '0 1px 2px rgba(26,29,38,.06)' : 'none',
                }}>
          Mes actual
        </button>
        <button onClick={() => setRange('max')}
                className="px-3 py-1 text-[11.5px] font-semibold rounded-md cursor-pointer border-0"
                style={{
                  background: range === 'max' ? 'white' : 'transparent',
                  color: range === 'max' ? 'var(--color-text)' : 'var(--color-text2)',
                  boxShadow: range === 'max' ? '0 1px 2px rgba(26,29,38,.06)' : 'none',
                }}>
          Máximo
        </button>
      </div>

      {isAdmin && (
        <button onClick={onEditTargets}
                className="bg-white border border-border rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-text2 cursor-pointer hover:bg-surface2">
          <Settings2 size={13} /> Metas
        </button>
      )}
    </div>
  );
}
