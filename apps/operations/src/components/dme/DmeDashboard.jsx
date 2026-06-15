import { fmtMoney, fmtInt, fmtPct } from '../../lib/dme/format.js';

// Dashboard del DME (vista "Todos combinados" o un cliente filtrado). Diseño
// fiel a la spec de Matias: hero CashCollect + % invirtiendo, fila Gasto/Leads/CPL,
// resultados, leaderboard de clientes y comparación de embudos. Sin dependencias.
//
// Props:
//  - bag: totales+derivados del rango (combinado o de un cliente)
//  - dailyColumns: columnas diarias [{ bag, rows }] para el sparkline acumulado
//  - perClient: [{ id, name, bag }] -> filas del leaderboard
//  - periodLabel, footerLabel, isCombined, onSelectClient

const num = (x) => Number(x) || 0;
const fin = (x) => Number.isFinite(Number(x));
// Suma de dos métricas; null si ninguna tiene dato (no muestra 0).
const sum2 = (b, a, c) => (b?.[a] == null && b?.[c] == null ? null : num(b?.[a]) + num(b?.[c]));
const cplStr = (v) => (fin(v) ? '$ ' + Number(v).toFixed(2) : '—');

const PALETTE = ['#5B7CF5', '#8B5CF6', '#06B6D4', '#F97316', '#22C55E', '#EF4444', '#EAB308', '#EC4899'];
const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const medalFor = (rank) =>
  rank === 1 ? { bg: '#FEF3C7', fg: '#B45309', t: '1' }
  : rank === 2 ? { bg: '#EEF1F5', fg: '#64748B', t: '2' }
  : rank === 3 ? { bg: '#FFEDD5', fg: '#C2410C', t: '3' }
  : rank ? { bg: '#F2F4F7', fg: '#9AA3B2', t: String(rank) }
  : { bg: '#F4F6F9', fg: '#C7CDD6', t: '—' };

const cplTone = (v) =>
  !fin(v) ? { bg: '#F2F4F7', fg: '#9AA3B2' }
  : v <= 5 ? { bg: '#ECFDF5', fg: '#16A34A' }
  : v <= 10 ? { bg: '#FEFCE8', fg: '#CA8A04' }
  : { bg: '#FEF2F2', fg: '#DC2626' };

// Sparkline (polyline) a partir de una serie de números.
function sparkPoints(vals, w = 200, h = 50) {
  const min = Math.min(...vals), max = Math.max(...vals), r = (max - min) || 1, n = vals.length;
  const line = vals.map((v, i) => `${(n === 1 ? 0 : (i / (n - 1)) * w).toFixed(1)},${(h - ((v - min) / r) * (h - 6) - 3).toFixed(1)}`).join(' ');
  return { line, area: `0,${h} ${line} ${w},${h}` };
}

const ICONS = {
  up: <path d="M12 15V4M8 8l4-4 4 4M5 20h14" strokeLinecap="round" strokeLinejoin="round" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  pulse: <path d="M3 12h4l3 8 4-16 3 8h4" strokeLinecap="round" strokeLinejoin="round" />,
};

const FUNNELS = [{ key: 'embudo1', name: 'Embudo 1' }, { key: 'embudo2', name: 'Embudo 2' }];
const FUNNEL_ROWS = [
  { l: 'Visitas a la landing', s: 'visitas_landing', k: 'int' },
  { l: 'Leads registrados', s: 'leads_registrados', k: 'int' },
  { l: '% de registro', s: 'pct_registro', k: 'pct' },
  { l: '% mira VSL completo', s: 'pct_vsl', k: 'pct' },
  { l: '% termina quiz', s: 'pct_quiz', k: 'pct' },
  { l: '% WhatsApp (sobre leads)', s: 'pct_whatsapp_leads', k: 'pct' },
  { l: 'Cierres', s: 'cierres', k: 'int' },
  { l: '% de cierre', s: 'pct_cierres', k: 'pct' },
];
const fcell = (k, v) => {
  if (k === 'int') return fmtInt(v);
  if (!fin(v)) return '—';
  const p = Number(v) * 100;
  return (p < 10 ? p.toFixed(1) : p.toFixed(0)) + '%';
};

const LB_COLS = '26px 1.35fr 0.8fr 0.65fr 0.8fr 0.85fr 0.5fr 0.8fr 0.7fr 0.6fr 0.85fr';

export default function DmeDashboard({ bag = {}, dailyColumns = [], perClient = [], periodLabel = '', footerLabel = '', isCombined = false, onSelectClient }) {
  const g = (k) => bag[k];

  // ── Hero: CashCollect + actividad ──
  const ccTotal = sum2(bag, 'cashcollect_pub', 'cashcollect_setups');
  const gastoMeta = sum2(bag, 'embudo1_total_gastado', 'embudo2_total_gastado');

  // Sparkline: CashCollect acumulado por día (hasta el último día con datos).
  const daily = dailyColumns.map((c) => ({ has: (c.rows?.length || 0) > 0, cc: num(c.bag?.cashcollect_pub) + num(c.bag?.cashcollect_setups) }));
  let lastIdx = -1; daily.forEach((d, i) => { if (d.has) lastIdx = i; });
  const series = []; let run = 0;
  for (let i = 0; i <= lastIdx; i++) { run += daily[i].cc; series.push(run); }
  const spark = series.length >= 2 ? sparkPoints(series) : null;

  const actividad = [
    { l: 'Usuarios nuevos', v: fmtInt(g('nuevos_usuarios')), color: '#22C55E' },
    { l: 'Cargas en publicidad', v: fmtInt(g('cargas_totales_pub')), color: '#06B6D4' },
    { l: 'AVG inversión', v: fmtMoney(g('avg_inversion_usuario')), color: '#8B5CF6' },
  ];

  // ── % usuarios invirtiendo (último día) ──
  const pctInv = g('pct_activos_con_pub');
  const pctNo = g('pct_activos_sin_pub');
  const pInv = fin(pctInv) ? Math.round(pctInv * 100) : null;
  const pNo = fin(pctNo) ? Math.round(pctNo * 100) : (pInv != null ? 100 - pInv : null);

  // ── Fila Gasto / Leads / CPL ──
  const inversion = [
    { l: 'Gasto en Meta Ads', v: fmtMoney(gastoMeta), icon: 'up', bg: '#EEF2FF', stroke: '#5B7CF5' },
    { l: 'Leads totales', v: fmtInt(g('leads_obtenidos')), icon: 'target', bg: '#E0F2FE', stroke: '#0EA5E9' },
    { l: 'CPL promedio', v: cplStr(g('cpl')), icon: 'pulse', bg: '#ECFDF5', stroke: '#22C55E' },
  ];

  // ── Resultados ──
  const resultados = [
    { l: 'Nuevos testimonios', v: fmtInt(g('nuevos_testimonios')), color: '#5B7CF5' },
    { l: 'Networkers cerraron', v: fmtInt(g('networkers_cerraron')), color: '#22C55E' },
    { l: 'Primer cierre', v: fmtInt(g('networkers_primer_cierre')), color: '#EAB308' },
    { l: 'Total cierres (1+2)', v: fmtInt(g('cierres_total')), color: '#F97316' },
  ];

  // ── Leaderboard de clientes ──
  const rows = perClient.map((c, i) => {
    const b = c.bag || {};
    return {
      id: c.id, name: c.name, color: PALETTE[i % PALETTE.length], ini: initials(c.name),
      ccPub: b.cashcollect_pub, ccSet: b.cashcollect_setups,
      ccTot: sum2(b, 'cashcollect_pub', 'cashcollect_setups'),
      gasto: sum2(b, 'embudo1_total_gastado', 'embudo2_total_gastado'),
      leads: b.leads_obtenidos, cpl: b.cpl, nuevos: b.nuevos_usuarios,
      cargas: b.cargas_totales_pub, avg: b.avg_inversion_usuario,
    };
  });
  rows.sort((a, b) => {
    const ha = a.ccTot != null && a.ccTot > 0, hb = b.ccTot != null && b.ccTot > 0;
    if (ha && hb) return b.ccTot - a.ccTot;
    if (ha) return -1; if (hb) return 1;
    return num(b.gasto) - num(a.gasto);
  });
  let rk = 0; rows.forEach((r) => { r.rank = (r.ccTot != null && r.ccTot > 0) ? ++rk : null; });
  const ccGrand = rows.reduce((s, r) => s + num(r.ccTot), 0);

  // ── Comparación de embudos ──
  const funnelData = FUNNEL_ROWS.map((r) => {
    const vals = FUNNELS.map((f) => bag[`${f.key}_${r.s}`]);
    const fins = vals.map((v) => (fin(v) ? Number(v) : null));
    const cnt = fins.filter((v) => v != null).length;
    let best = null;
    if (cnt >= 2) { let bv = -Infinity; fins.forEach((v, i) => { if (v != null && v > bv) { bv = v; best = i; } }); }
    return { ...r, vals, best };
  });
  const funnelHasData = FUNNELS.map((f) => FUNNEL_ROWS.some((r) => fin(bag[`${f.key}_${r.s}`])));
  const fGrid = `1.7fr repeat(${FUNNELS.length}, 1fr)`;
  const lblUpper = { fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#9AA3B2' };

  return (
    <div style={{ color: '#1A1D26' }}>
      <style>{`
        .dme-gl{gap:0!important;align-items:stretch!important;}
        .dme-gl>div{display:flex;align-items:center;padding:0 11px;min-width:0;white-space:nowrap;}
        .dme-gl>div:first-child{padding-left:0;}
        .dme-gl>div:last-child{padding-right:0;}
        .dme-gl>div+div{border-left:1px solid #EDEFF3;}
        .dme-rank{overflow-x:auto;}
        .dme-rankrow{min-width:920px;}
        .dme-funnelrow{min-width:560px;}
        .dme-lbrow:hover{background:#F7FAFF;}
        @media (max-width:900px){.dme-hero{flex-direction:column!important;}.dme-res4{grid-template-columns:repeat(2,1fr)!important;}.dme-res3{grid-template-columns:1fr!important;}}
        @media (max-width:640px){.dme-bigmetrics{grid-template-columns:repeat(2,1fr)!important;}}
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* HERO BAND */}
        <div className="dme-hero" style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
          {/* CashCollect */}
          <div style={{ flex: 1.9, background: '#fff', border: '1px solid #E8EBF0', borderRadius: 16, padding: '20px 22px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={lblUpper}>CashCollect · {periodLabel}</span>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, marginTop: 8 }}>
              <div>
                <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1, color: '#1A1D26' }}>{fmtMoney(ccTotal)}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9AA3B2', marginTop: 5 }}>CashCollect total</div>
              </div>
              {spark && (
                <div style={{ flex: 1, maxWidth: 200 }}>
                  <svg viewBox="0 0 200 50" preserveAspectRatio="none" style={{ width: '100%', height: 46 }}>
                    <polyline points={spark.area} fill="rgba(34,197,94,0.10)" stroke="none" />
                    <polyline points={spark.line} fill="none" stroke="#22C55E" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
                  </svg>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <div style={{ flex: 1, background: '#F7FBF8', border: '1px solid #E5F0E9', borderRadius: 11, padding: '11px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: '#22C55E' }} /><span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#16A34A' }}>CashCollect Publicidad</span></div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 5, color: '#15803D' }}>{fmtMoney(g('cashcollect_pub'))}</div>
              </div>
              <div style={{ flex: 1, background: '#F8FAFC', border: '1px solid #EEF0F4', borderRadius: 11, padding: '11px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: '#D7DCE5' }} /><span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9AA3B2' }}>CashCollect Setup</span></div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 5, color: fin(g('cashcollect_setups')) ? '#15803D' : '#C2C8D2' }}>{fmtMoney(g('cashcollect_setups'))}</div>
              </div>
            </div>
            <div className="dme-bigmetrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, marginTop: 18, background: '#EEF0F4', border: '1px solid #EEF0F4', borderRadius: 11, overflow: 'hidden' }}>
              {actividad.map((m) => (
                <div key={m.l} style={{ background: '#fff', padding: '12px 13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: m.color }} /><span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9AA3B2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.l}</span></div>
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', marginTop: 5, color: '#1A1D26' }}>{m.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* % usuarios invirtiendo */}
          <div style={{ flex: 1, background: '#fff', border: '1px solid #E8EBF0', borderRadius: 16, padding: '20px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
            <span style={lblUpper}>Usuarios invirtiendo en publicidad</span>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, background: '#ECFDF5', borderRadius: 11, padding: '13px 14px' }}>
                <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color: '#16A34A' }}>{pInv != null ? pInv + '%' : '—'}</span>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#16A34A', marginTop: 7 }}>Invierten</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#15803D', marginTop: 1 }}>{fmtInt(g('usuarios_activos_con_pub'))} usuarios</div>
              </div>
              <div style={{ flex: 1, background: '#F4F6F9', borderRadius: 11, padding: '13px 14px' }}>
                <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color: '#525968' }}>{pNo != null ? pNo + '%' : '—'}</span>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9AA3B2', marginTop: 7 }}>No invierten</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#525968', marginTop: 1 }}>{fmtInt(g('usuarios_activos_sin_pub'))} usuarios</div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', height: 9, borderRadius: 99, overflow: 'hidden', background: '#F1F3F7' }}>
                <div style={{ width: (pInv || 0) + '%', background: '#22C55E' }} />
                <div style={{ width: (pNo || 0) + '%', background: '#D7DCE5' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontWeight: 600, color: '#9AA3B2', marginTop: 6 }}><span>{fmtInt(g('usuarios_total'))} usuarios activos</span><span>último día</span></div>
            </div>
          </div>
        </div>

        {/* FILA Gasto / Leads / CPL */}
        <div className="dme-res3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {inversion.map((c) => (
            <div key={c.l} style={{ background: '#fff', border: '1px solid #E8EBF0', borderRadius: 14, padding: '15px 16px', display: 'flex', alignItems: 'center', gap: 13 }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.stroke} strokeWidth="1.9">{ICONS[c.icon]}</svg>
              </span>
              <div><div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color: '#1A1D26' }}>{c.v}</div><div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9AA3B2', marginTop: 5 }}>{c.l}</div></div>
            </div>
          ))}
        </div>

        {/* RESULTADOS */}
        <div className="dme-res4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {resultados.map((c) => (
            <div key={c.l} style={{ background: '#fff', border: '1px solid #E8EBF0', borderRadius: 14, padding: 15, display: 'flex', alignItems: 'center', gap: 13 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: c.color, flexShrink: 0 }} />
              <div><div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color: '#1A1D26' }}>{c.v}</div><div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9AA3B2', marginTop: 5 }}>{c.l}</div></div>
            </div>
          ))}
        </div>

        {/* LEADERBOARD */}
        <section className="dme-rank" style={{ background: '#fff', border: '1px solid #E8EBF0', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid #F0F2F5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Leaderboard de clientes</div>
              <div style={{ fontSize: 11, color: '#9AA3B2', marginTop: 2 }}>Ordenado por CashCollect Total · tocá un cliente para abrir su DME</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#16A34A', background: '#ECFDF5', padding: '5px 10px', borderRadius: 99 }}>Total {fmtMoney(ccGrand)}</span>
          </div>
          <div className="dme-rankrow dme-gl" style={{ display: 'grid', gridTemplateColumns: LB_COLS, padding: '9px 18px', background: '#FAFBFC', borderBottom: '1px solid #F0F2F5', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#9AA3B2' }}>
            <div>#</div><div>Cliente</div><div>CC Public.</div><div>CC Setup</div><div style={{ color: '#16A34A' }}>CC Total</div><div>Gasto Meta</div><div>Leads</div><div>CPL</div><div>Nuevos</div><div>Cargas</div><div>AVG inv.</div>
          </div>
          {rows.length === 0 && <div style={{ textAlign: 'center', color: '#9AA3B2', padding: 24, fontSize: 12 }}>Sin datos en el período.</div>}
          {rows.map((c) => {
            const m = medalFor(c.rank); const ct = cplTone(c.cpl);
            return (
              <div key={c.id} className="dme-lbrow dme-rankrow dme-gl" onClick={() => onSelectClient?.(c.id)}
                   style={{ display: 'grid', gridTemplateColumns: LB_COLS, alignItems: 'center', padding: '11px 18px', borderBottom: '1px solid #F4F6F9', cursor: 'pointer' }}>
                <div><span style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: m.bg, color: m.fg }}>{m.t}</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 99, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: c.color + '22', color: c.color }}>{c.ini}</span>
                  <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#525968' }}>{fmtMoney(c.ccPub)}</div>
                <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#C2C8D2' }}>{fmtMoney(c.ccSet)}</div>
                <div style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: c.ccTot != null ? '#16A34A' : '#C2C8D2' }}>{c.ccTot != null ? fmtMoney(c.ccTot) : '—'}</div>
                <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#525968' }}>{fmtMoney(c.gasto)}</div>
                <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#525968' }}>{fmtInt(c.leads)}</div>
                <div><span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', padding: '3px 8px', borderRadius: 99, background: ct.bg, color: ct.fg }}>{cplStr(c.cpl)}</span></div>
                <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#525968' }}>{fmtInt(c.nuevos)}</div>
                <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#525968' }}>{fmtInt(c.cargas)}</div>
                <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#525968' }}>{fmtMoney(c.avg)}</div>
              </div>
            );
          })}
        </section>

        {/* COMPARACIÓN DE EMBUDOS */}
        <section className="dme-rank" style={{ background: '#fff', border: '1px solid #E8EBF0', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid #F0F2F5' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1D26' }}>Comparación de embudos</div>
            <div style={{ fontSize: 11, color: '#9AA3B2', marginTop: 2 }}>Resultados por embudo · mejor valor por métrica resaltado</div>
          </div>
          <div className="dme-funnelrow dme-gl" style={{ display: 'grid', gridTemplateColumns: fGrid, padding: '11px 18px', background: '#FAFBFC', borderBottom: '1px solid #F0F2F5' }}>
            <div />
            {FUNNELS.map((f, i) => (
              <div key={f.key} style={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1D26' }}>{f.name}</div>
                <div style={{ fontSize: 9.5, fontWeight: 600, color: funnelHasData[i] ? '#16A34A' : '#C2C8D2', marginTop: 1 }}>{funnelHasData[i] ? 'Con datos' : 'Sin datos'}</div>
              </div>
            ))}
          </div>
          {funnelData.map((r) => (
            <div key={r.s} className="dme-funnelrow dme-gl" style={{ display: 'grid', gridTemplateColumns: fGrid, padding: '9px 18px', borderBottom: '1px solid #F4F6F9', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: '#1A1D26', fontWeight: 500 }}>{r.l}</div>
              {r.vals.map((v, i) => (
                <div key={i}>
                  <span style={r.best === i
                    ? { fontSize: 12.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#16A34A', background: '#ECFDF5', padding: '2px 9px', borderRadius: 99 }
                    : { fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#525968' }}>
                    {fcell(r.k, v)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </section>

        <div style={{ textAlign: 'center', fontSize: 10.5, color: '#C2C8D2', paddingTop: 8 }}>Korex · DME — {isCombined ? 'Todos combinados' : footerLabel}</div>
      </div>
    </div>
  );
}
