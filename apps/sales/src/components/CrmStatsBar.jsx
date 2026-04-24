// Tira minimalista con totales del CRM y suma de proyecciones por stage.
export default function CrmStatsBar({ leads, stages }) {
  const totalCount = leads.length;
  const totalValue = leads.reduce((acc, l) => acc + (Number(l.estimated_value) || 0), 0);

  const byStage = stages.map((s) => {
    const items = leads.filter((l) => l.stage_id === s.id);
    const sum = items.reduce((acc, l) => acc + (Number(l.estimated_value) || 0), 0);
    return { stage: s, count: items.length, sum };
  });

  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] text-text2 py-1">
      <span><strong className="text-text">{totalCount}</strong> contactos · proyección total <strong className="text-text">{fmt(totalValue)}</strong></span>
      <span className="text-text3">·</span>
      <div className="flex items-center gap-2 flex-wrap">
        {byStage.map(({ stage, count, sum }) => (
          <span key={stage.id} className="inline-flex items-center gap-1.5"
                title={`${stage.name}: ${count} leads · ${fmt(sum)}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: stage.color }} />
            <span className="text-text2">{stage.name}</span>
            <span className="text-text3">{count} · {fmt(sum, true)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function fmt(n, compact = false) {
  if (!n) return '$0';
  if (compact && n >= 1000) {
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
    return '$' + (n / 1000).toFixed(1) + 'K';
  }
  return '$' + Math.round(n).toLocaleString('en-US');
}
