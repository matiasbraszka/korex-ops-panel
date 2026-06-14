// Card KPI liviana para el Dashboard del DME (local a operations).
export default function DmeKpiCard({ label, value, sub, tone }) {
  return (
    <div className="bg-white border border-border rounded-xl p-4"
         style={tone ? { borderLeftWidth: 4, borderLeftColor: tone.fg } : undefined}>
      <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3">{label}</div>
      <div className="text-[22px] font-bold tabular-nums mt-1 leading-tight tracking-tight"
           style={tone ? { color: tone.fg } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[10.5px] text-text3 mt-1 truncate">{sub}</div>}
    </div>
  );
}
