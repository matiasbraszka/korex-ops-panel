import { useState, useEffect } from 'react';
import { Gauge, AlertTriangle, Clock } from 'lucide-react';
import { sbFetch } from '@korex/db';
import { satGeneral, satDotColor, satChipColor, satLabel } from '../../utils/satisfaccion';

// Pestaña "Satisfacción" del cliente (Operaciones). Muestra la misma lectura que
// Soporte › Resumen de grupos, pero para un solo cliente: puntuación general +
// los 4 canales (grupo usuarios, grupo cliente, 1-a-1 cliente, 1-a-1 usuarios) con
// su puntaje y su resumen. La data actual viene del RPC ops_wa_satisfaction
// (context.satByClient); el "último dato conocido" por canal (cuando no hubo
// actividad esta semana) viene del RPC ops_wa_channel_latest.
//
// Los puntajes/resúmenes los genera la rutina de IA de Soporte los domingos (o al
// invocarla a mano); acá es solo lectura.

// Chip de score 0-100 con color. `muted` = dato viejo (histórico), se ve más tenue.
function Chip({ v, muted }) {
  if (v === null || v === undefined) return <span className="text-text3 text-[12px]">—</span>;
  const c = satChipColor(v);
  return (
    <span className="text-[12px] font-bold px-1.5 py-0.5 rounded-md"
      style={{ background: c.bg, color: c.fg, opacity: muted ? 0.6 : 1 }}>{v}</span>
  );
}

// week_start (YYYY-MM-DD) → "sem. del DD/MM".
const fmtSemana = (d) => {
  if (!d) return '';
  const [, m, day] = String(d).slice(0, 10).split('-');
  return `sem. del ${day}/${m}`;
};

// Lunes de la semana actual (para saber si un dato es de esta semana o anterior).
const MONDAY_THIS_WEEK = (() => {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7; // 0 = lunes
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
})();

const CANALES = [
  { icon: '👥', label: 'Grupo de usuarios', score: 'sat_usuarios', resumen: 'resumen_usuarios', scope: 'usuarios' },
  { icon: '💬', label: 'Grupo con el cliente', score: 'sat_cliente_grupo', resumen: 'resumen_cliente_grupo', scope: 'cliente_grupo' },
  { icon: '📩', label: '1-a-1 con el cliente', score: 'sat_privado_cliente', resumen: 'resumen_privado_cliente', scope: 'privado_cliente' },
  { icon: '🧑‍🤝‍🧑', label: '1-a-1 con los usuarios', score: 'sat_privado_usuarios', resumen: 'resumen_privado_usuarios', scope: 'privado_usuarios' },
];

export default function SatisfaccionTab({ sat, clientId }) {
  const g = satGeneral(sat);
  const [hist, setHist] = useState(null); // { scope: {score,label,notas,week_start} }

  // Último dato conocido por canal (para "lo último que sabemos" cuando no hay
  // actividad esta semana).
  useEffect(() => {
    if (!clientId) return;
    let cancel = false;
    sbFetch('rpc/ops_wa_channel_latest', {
      method: 'POST', body: JSON.stringify({ p_client_id: clientId }),
      headers: { Prefer: 'return=representation' },
    }).then((rows) => {
      if (cancel || !Array.isArray(rows)) return;
      const m = {};
      for (const r of rows) m[r.scope] = r;
      setHist(m);
    }).catch(() => {});
    return () => { cancel = true; };
  }, [clientId]);

  if (!sat) {
    return (
      <div className="text-center py-16 px-6">
        <Gauge size={26} className="mx-auto text-text3 mb-2" />
        <div className="text-[13.5px] font-semibold text-text2">Todavía no hay análisis de satisfacción</div>
        <div className="text-[12px] text-text3 mt-1">El informe automático de Soporte corre los domingos y completa esta vista.</div>
      </div>
    );
  }

  return (
    <div className="mb-4 max-w-[720px]">
      {/* Puntuación general */}
      <div className="flex items-center justify-between gap-3 bg-white border border-[#E2E5EB] rounded-xl shadow-sm p-4 mb-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: satDotColor(g.pct) }} />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-text3">Satisfacción general</div>
            <div className="text-[13px] font-semibold text-text2">{satLabel(g.pct)}</div>
          </div>
        </div>
        <div className="text-[26px] font-bold leading-none" style={{ color: satDotColor(g.pct) }}>
          {g.sum === null ? '—' : <>{g.sum}<span className="text-[15px] text-text3 font-semibold">/{g.max}</span></>}
        </div>
      </div>

      {/* Canales: puntaje + resumen (o lo último conocido con su fecha) */}
      <div className="flex flex-col gap-2.5">
        {CANALES.map((ch) => {
          const fresh = sat[ch.resumen];            // resumen de esta semana
          const h = hist?.[ch.scope];               // último dato histórico conocido
          // "Último dato" solo si NO hay resumen fresco y el histórico es de una semana anterior.
          const isStale = !fresh && !!(h && h.notas) && String(h.week_start).slice(0, 10) < MONDAY_THIS_WEEK;
          const texto = fresh || (h && h.notas) || null;
          const scoreShown = fresh ? sat[ch.score] : (sat[ch.score] ?? h?.score ?? null);
          return (
            <div key={ch.score} className="bg-white border border-[#E2E5EB] rounded-xl shadow-sm p-3.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-[13px] font-semibold text-text">{ch.icon} {ch.label}</div>
                <Chip v={scoreShown} muted={isStale} />
              </div>
              {isStale && (
                <div className="inline-flex items-center gap-1 text-[10.5px] text-text3 mb-1">
                  <Clock size={11} /> Sin actividad esta semana · último dato {fmtSemana(h.week_start)}
                </div>
              )}
              <div className="text-[12.5px] text-text2 leading-snug">
                {texto || <span className="text-text3">Sin datos todavía en este canal.</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Estado general + riesgos */}
      {sat.estado && (
        <div className="bg-white border border-[#E2E5EB] rounded-xl shadow-sm p-3.5 mt-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text3 mb-1">Estado general</div>
          <div className="text-[12.5px] text-text2 leading-snug">{sat.estado}</div>
          {sat.riesgos && (
            <div className="flex items-start gap-1.5 mt-2 text-[12px] text-[#DC2626] leading-snug">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>{sat.riesgos}</span>
            </div>
          )}
        </div>
      )}

      {sat.updated_at && (
        <div className="text-[10.5px] text-text3 mt-2.5">Actualizado: {String(sat.updated_at).slice(0, 10)}</div>
      )}
    </div>
  );
}
