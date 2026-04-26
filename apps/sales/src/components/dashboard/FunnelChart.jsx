import { fmtMoney } from './format.js';

// Funnel: barra horizontal por etapa con su monto y count reales.
// Sin probabilidad ponderada — los multiplicadores no estan en la base.
export default function FunnelChart({ funnel = [] }) {
  const totalCount = funnel.reduce((a, b) => a + Number(b.cnt || 0), 0);
  const totalAmount = funnel.reduce((a, b) => a + Number(b.amount || 0), 0);
  const useAmount = totalAmount > 0;
  const max = useAmount
    ? Math.max(...funnel.map((p) => Number(p.amount) || 0), 1)
    : Math.max(...funnel.map((p) => Number(p.cnt) || 0), 1);

  return (
    <div className="bg-white border border-border rounded-xl">
      <div className="px-3.5 pt-3 pb-2.5 border-b border-border">
        <div className="text-[13px] font-bold text-text">Pipeline por etapa</div>
        <div className="text-[10.5px] text-text3 mt-0.5">Cantidad y monto por etapa</div>
      </div>
      <div className="px-3.5 py-3">
        {funnel.length === 0 ? (
          <div className="text-[12px] text-text3 text-center py-4">Sin etapas para mostrar.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {funnel.map((p) => {
              const basis = useAmount ? Number(p.amount || 0) : Number(p.cnt || 0);
              const pct = (basis / max) * 100;
              const color = p.color || '#5B7CF5';
              return (
                <div key={p.name}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                    <span className="text-[12px] font-semibold flex-1 truncate">{p.name}</span>
                    <span className="text-[10.5px] text-text3 tabular-nums">{p.cnt}</span>
                    <span className="text-[11.5px] font-bold tabular-nums min-w-[58px] text-right">
                      {fmtMoney(p.amount)}
                    </span>
                  </div>
                  <div className="relative h-[12px] bg-surface2 rounded overflow-hidden">
                    <div className="absolute inset-y-0 left-0 rounded transition-[width] duration-500 ease-out"
                         style={{ width: Math.max(pct, p.cnt > 0 ? 4 : 0) + '%', background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-2.5 pt-2.5 border-t border-border grid grid-cols-2 gap-2">
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3">Leads totales</div>
            <div className="text-[14px] font-bold tabular-nums mt-0.5">{totalCount}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3">Pipeline total</div>
            <div className="text-[14px] font-bold tabular-nums mt-0.5 text-blue">{fmtMoney(totalAmount)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
