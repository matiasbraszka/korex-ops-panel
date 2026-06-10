// Embudo por pasos basado en CANTIDADES (no montos). Cada barra muestra el
// conteo y el % respecto del primer paso (tope del embudo).
export default function StepFunnel({ title = 'Embudo', subtitle = 'Conversión de contacto a venta', steps = [] }) {
  const top = Math.max(Number(steps[0]?.cnt || 0), 1);
  const max = Math.max(...steps.map((s) => Number(s.cnt) || 0), 1);
  return (
    <div className="bg-white border border-border rounded-xl">
      <div className="px-3.5 pt-3 pb-2.5 border-b border-border">
        <div className="text-[13px] font-bold text-text">{title}</div>
        <div className="text-[10.5px] text-text3 mt-0.5">{subtitle}</div>
      </div>
      <div className="px-3.5 py-3">
        {steps.length === 0 ? (
          <div className="text-[12px] text-text3 text-center py-4">Sin datos para mostrar.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {steps.map((s) => {
              const cnt = Number(s.cnt || 0);
              const pctTop = Math.round((cnt / top) * 100);
              const width = Math.max((cnt / max) * 100, cnt > 0 ? 4 : 0);
              const color = s.color || '#5B7CF5';
              return (
                <div key={s.name}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                    <span className="text-[12px] font-semibold flex-1 truncate">{s.name}</span>
                    <span className="text-[10.5px] text-text3 tabular-nums">{pctTop}%</span>
                    <span className="text-[12px] font-bold tabular-nums min-w-[40px] text-right">{cnt}</span>
                  </div>
                  <div className="relative h-[12px] bg-surface2 rounded overflow-hidden">
                    <div className="absolute inset-y-0 left-0 rounded transition-[width] duration-500 ease-out"
                         style={{ width: width + '%', background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
