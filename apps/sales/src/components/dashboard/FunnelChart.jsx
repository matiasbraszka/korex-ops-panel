import { fmtMoney, stageProb } from './format.js';

// Funnel hi-fi: barra horizontal con dos capas (total + ponderado), pill de
// probabilidad y label "ponderado" inline a la derecha. Footer 3 cols con
// totales: leads / pipeline / ponderado.
export default function FunnelChart({ funnel = [] }) {
  const total = funnel.length;
  const enriched = funnel.map((p, i) => ({
    ...p,
    prob: stageProb(p.position ?? i, total),
  }));

  const totalCount = enriched.reduce((a, b) => a + Number(b.cnt || 0), 0);
  const totalAmount = enriched.reduce((a, b) => a + Number(b.amount || 0), 0);
  const totalWeighted = enriched.reduce((a, b) => a + Number(b.amount || 0) * b.prob, 0);

  const useAmount = totalAmount > 0;
  const max = useAmount
    ? Math.max(...enriched.map((p) => Number(p.amount) || 0), 1)
    : Math.max(...enriched.map((p) => Number(p.cnt) || 0), 1);

  return (
    <div className="bg-white border border-border rounded-xl">
      <div className="px-4 pt-3.5 pb-3 border-b border-border">
        <div className="text-[13px] font-bold text-text">Pipeline por etapa</div>
        <div className="text-[10.5px] text-text3 mt-0.5">Cantidad y monto proyectado · todo el equipo</div>
      </div>
      <div className="p-4">
        {enriched.length === 0 ? (
          <div className="text-[12px] text-text3 text-center py-6">Sin etapas para mostrar.</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {enriched.map((p) => {
              const basis = useAmount ? Number(p.amount || 0) : Number(p.cnt || 0);
              const pct = (basis / max) * 100;
              const color = p.color || '#5B7CF5';
              const weighted = Math.round(Number(p.amount || 0) * p.prob);
              return (
                <div key={p.name}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                    <span className="text-[12px] font-semibold flex-1 truncate">{p.name}</span>
                    <span className="text-[10.5px] text-text3 tabular-nums">{p.cnt} leads</span>
                    <span className="text-[9.5px] text-text3 font-bold tabular-nums px-1.5 py-px rounded bg-surface2">
                      ×{Math.round(p.prob * 100)}%
                    </span>
                    <span className="text-[12px] font-bold tabular-nums min-w-[64px] text-right">
                      {fmtMoney(p.amount)}
                    </span>
                  </div>
                  <div className="relative h-[18px] bg-surface2 rounded-md overflow-hidden">
                    {/* Capa clara: total */}
                    <div className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-500 ease-out"
                         style={{ width: Math.max(pct, p.cnt > 0 ? 4 : 0) + '%', background: color, opacity: 0.22 }} />
                    {/* Capa oscura: ponderado */}
                    <div className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-500 ease-out"
                         style={{ width: Math.max(pct * p.prob, 0) + '%', background: color }} />
                    {/* Label inline */}
                    {weighted > 0 && (
                      <div className="absolute right-1.5 inset-y-0 flex items-center text-[9.5px] font-bold text-text3 tabular-nums">
                        ponderado {fmtMoney(weighted)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3.5 pt-3 border-t border-border grid grid-cols-3 gap-3">
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3">Leads totales</div>
            <div className="text-[16px] font-bold tabular-nums mt-0.5">{totalCount}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3">Pipeline total</div>
            <div className="text-[16px] font-bold tabular-nums mt-0.5">{fmtMoney(totalAmount)}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3">Ponderado</div>
            <div className="text-[16px] font-bold tabular-nums mt-0.5 text-blue">{fmtMoney(totalWeighted)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
