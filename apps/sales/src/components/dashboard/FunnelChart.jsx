import { fmtMoney } from './format.js';

// Funnel: barra horizontal por etapa, sin probabilidad ponderada.
export default function FunnelChart({ funnel = [] }) {
  const max = Math.max(...funnel.map((p) => Number(p.amount) || 0), 1);
  const totalCount = funnel.reduce((a, b) => a + Number(b.cnt || 0), 0);
  const totalAmount = funnel.reduce((a, b) => a + Number(b.amount || 0), 0);

  return (
    <div className="bg-white border border-border rounded-xl">
      <div className="px-4 pt-3.5 pb-3 border-b border-border">
        <div className="text-[13px] font-bold text-text">Pipeline por etapa</div>
        <div className="text-[10.5px] text-text3 mt-0.5">Cantidad y monto de leads abiertos por etapa</div>
      </div>
      <div className="p-4">
        {funnel.length === 0 ? (
          <div className="text-[12px] text-text3 text-center py-6">Sin etapas para mostrar.</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {funnel.map((p) => {
              const pct = (Number(p.amount || 0) / max) * 100;
              const color = p.color || '#5B7CF5';
              return (
                <div key={p.name}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                    <span className="text-[12px] font-semibold flex-1 truncate">{p.name}</span>
                    <span className="text-[10.5px] text-text3 tabular-nums">{p.cnt} leads</span>
                    <span className="text-[12px] font-bold tabular-nums min-w-[64px] text-right">
                      {fmtMoney(p.amount)}
                    </span>
                  </div>
                  <div className="relative h-[14px] bg-surface2 rounded-md overflow-hidden">
                    <div className="absolute inset-y-0 left-0 rounded-md"
                         style={{ width: pct + '%', background: color, opacity: 0.85 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3.5 pt-3 border-t border-border grid grid-cols-2 gap-3">
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3">Leads totales</div>
            <div className="text-[16px] font-bold tabular-nums mt-0.5">{totalCount}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3">Pipeline total</div>
            <div className="text-[16px] font-bold tabular-nums mt-0.5 text-blue">{fmtMoney(totalAmount)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
