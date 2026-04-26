import { Flame } from 'lucide-react';
import { fmtMoney, scoreProb } from './format.js';

const META = [
  { score: 3, label: 'Caliente', color: '#EF4444' },
  { score: 2, label: 'Tibio',    color: '#F97316' },
  { score: 1, label: 'Frío',     color: '#9CA3AF' },
  { score: 0, label: 'Sin score', color: '#D1D5DB' },
];

// Iconito de score: N llamas pintadas + (3-N) llamas grises.
function ScoreFlames({ n, color }) {
  return (
    <span className="inline-flex items-center gap-px">
      {[1, 2, 3].map((i) => (
        <Flame key={i} size={11}
               fill={i <= n ? color : 'transparent'}
               stroke={i <= n ? color : '#D1D5DB'}
               strokeWidth={2} />
      ))}
    </span>
  );
}

export default function HeatChart({ heat = [] }) {
  const byScore = Object.fromEntries(heat.map((h) => [h.score, h]));
  const items = META.map((m) => {
    const row = byScore[m.score] || { cnt: 0, amount: 0 };
    return { ...m, cnt: Number(row.cnt) || 0, amount: Number(row.amount) || 0, prob: scoreProb(m.score) };
  });
  const total = items.reduce((a, b) => a + b.cnt, 0) || 0;
  const totalAmount = items.reduce((a, b) => a + b.amount, 0);
  const totalWeighted = items.reduce((a, b) => a + b.amount * b.prob, 0);
  const tasaGlobal = totalAmount > 0 ? totalWeighted / totalAmount : 0;

  // Donut
  const r = 56, c = 2 * Math.PI * r, gap = 2;
  let offset = 0;
  const segs = items.filter((h) => h.cnt > 0).map((h) => {
    const len = (h.cnt / Math.max(total, 1)) * c - gap;
    const seg = { color: h.color, len: Math.max(0, len), offset };
    offset += seg.len + gap;
    return seg;
  });

  return (
    <div className="bg-white border border-border rounded-xl">
      <div className="px-4 pt-3.5 pb-3 border-b border-border">
        <div className="text-[13px] font-bold text-text">Proyección por calentura</div>
        <div className="text-[10.5px] text-text3 mt-0.5">Score del lead — caliente, tibio, frío</div>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-4 max-md:flex-col max-md:items-stretch max-md:gap-3">
          <div className="relative w-[140px] h-[140px] shrink-0 mx-auto">
            <svg width="140" height="140" viewBox="0 0 140 140">
              <g transform="translate(70,70) rotate(-90)">
                <circle r={r} fill="none" stroke="#F0F2F5" strokeWidth="14" />
                {segs.map((s, i) => (
                  <circle key={i} r={r} fill="none"
                    stroke={s.color} strokeWidth="14"
                    strokeDasharray={`${s.len} ${c}`}
                    strokeDashoffset={-s.offset} />
                ))}
              </g>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3">Leads</div>
              <div className="text-[24px] font-bold tabular-nums leading-none">{total}</div>
              <div className="text-[10px] text-text3 mt-0.5">activos</div>
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-2 w-full">
            {items.filter((h) => h.score > 0 || h.cnt > 0).map((h) => {
              const weighted = Math.round(h.amount * h.prob);
              return (
                <div key={h.score} className="bg-white border border-border rounded-lg px-2.5 py-2">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <ScoreFlames n={h.score} color={h.color} />
                    <span className="text-[12px] font-bold">{h.label}</span>
                    <span className="text-[9.5px] font-bold tabular-nums px-1.5 py-px rounded bg-surface2 text-text3">
                      ×{Math.round(h.prob * 100)}%
                    </span>
                    <span className="flex-1" />
                    <span className="text-[11px] text-text3 font-semibold tabular-nums">
                      {h.cnt} leads · {fmtMoney(h.amount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-[5px] bg-surface2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full"
                           style={{ width: ((h.cnt / Math.max(total, 1)) * 100) + '%', background: h.color }} />
                    </div>
                    <span className="text-[10.5px] font-bold tabular-nums whitespace-nowrap min-w-[90px] text-right"
                          style={{ color: h.color }}>
                      → {fmtMoney(weighted)} esp.
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-3.5 pt-3 border-t border-border flex items-center justify-between gap-3">
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3">Pipeline total</div>
            <div className="text-[14px] font-bold tabular-nums mt-0.5">{fmtMoney(totalAmount)}</div>
          </div>
          <div className="h-[30px] w-px bg-border" />
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3">Cierre esperado</div>
            <div className="text-[14px] font-bold tabular-nums mt-0.5 text-blue">{fmtMoney(totalWeighted)}</div>
          </div>
          <div className="h-[30px] w-px bg-border" />
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3">Tasa global</div>
            <div className="text-[14px] font-bold tabular-nums mt-0.5">{Math.round(tasaGlobal * 100)}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
