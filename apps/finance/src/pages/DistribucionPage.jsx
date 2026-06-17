import { useEffect, useState, useMemo, useCallback } from 'react';
import { sbFetch } from '@korex/db';
import { money, fdate, ini, avatarColor, TYPE_BG, TYPE_FG } from '../lib/format.js';

// Distribución del dinero que llegó a Mercury (de Stripe) a los fondos de cada cliente.
// Junta los ingresos cobrados por Korex que ya llegaron a Mercury y todavía NO están
// "organizados en finanzas" (Fin). Por cliente dice cuánto mover al fondo de comisiones
// y al de publicidad; lo que queda es de Korex (cuenta principal). Al transferir, se
// marca "Fin" (organizado_finanzas) en cada ingreso, de a uno o por cliente.
const isAdBudget = (e) => e.role_key === 'cliente' && /publicidad/i.test(e.notes || '');
const splitOf = (r) => {
  let comis = 0, publi = 0;
  (r.fin_commission_entries || []).forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (isAdBudget(e)) { publi += amt; return; }
    if (e.role_key === 'korex') return;
    comis += amt;
  });
  return { comis, publi, korex: Number(r.korex_real) || 0 };
};

export default function DistribucionPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({});   // cliente expandido
  // El reparto con este sistema arrancó en abril 2026: lo anterior queda fuera de scope.
  const [desde, setDesde] = useState(() => { try { return localStorage.getItem('fin_dist_desde') || '2026-04-01'; } catch { return '2026-04-01'; } });
  useEffect(() => { try { localStorage.setItem('fin_dist_desde', desde || ''); } catch { /* noop */ } }, [desde]);

  const load = useCallback(() => {
    sbFetch('fin_incomes?select=id,income_date,client_name_sheet,payer_name,income_type,effective_type,amount_usd,net_usd,korex_real,collected_by,llego_mercury,organizado_finanzas,fin_commission_entries(role_key,amount,notes)&llego_mercury=eq.true&organizado_finanzas=eq.false&order=income_date.desc.nullslast&limit=6000')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Marca "Fin" (organizado_finanzas) en un set de ingresos y los saca de la lista.
  const markFin = async (ids) => {
    if (!ids.length || busy) return;
    setBusy(true);
    setRows((rs) => (rs || []).filter((r) => !ids.includes(r.id)));   // optimista
    try {
      const inList = ids.map((x) => `"${x}"`).join(',');
      await sbFetch(`fin_incomes?id=in.(${inList})`, { method: 'PATCH', body: JSON.stringify({ organizado_finanzas: true }), throwOnError: true });
    } catch {
      load();   // si falla, recargamos al estado real
    } finally {
      setBusy(false);
    }
  };

  const agg = useMemo(() => {
    if (!rows) return null;
    const pend = rows.filter((r) => (r.income_date || '') >= desde);
    const cl = {};
    let comis = 0, publi = 0, korex = 0;
    pend.forEach((r) => {
      const s = splitOf(r);
      comis += s.comis; publi += s.publi; korex += s.korex;
      const k = r.client_name_sheet || '—';
      const g = cl[k] || (cl[k] = { name: k, comis: 0, publi: 0, korex: 0, n: 0, ids: [], incomes: [] });
      g.comis += s.comis; g.publi += s.publi; g.korex += s.korex; g.n += 1; g.ids.push(r.id);
      g.incomes.push({ ...r, ...s });
    });
    const list = Object.values(cl).sort((a, b) => (b.comis + b.publi + b.korex) - (a.comis + a.publi + a.korex));
    return { list, comis, publi, korex, total: comis + publi + korex, n: pend.length, allIds: pend.map((r) => r.id) };
  }, [rows, desde]);

  if (error) return <Msg>Error cargando distribución: {error}</Msg>;
  if (!agg) return <Msg>Cargando distribución…</Msg>;

  const kpis = [
    { label: 'A mover a fondos', value: money(agg.comis + agg.publi), accent: '#0EA5A4', color: '#0D1117', hint: `${agg.n} ingresos · ${agg.list.length} clientes` },
    { label: 'A fondos de comisiones', value: money(agg.comis), accent: '#6366f1', color: '#4338ca', hint: 'de todos los clientes' },
    { label: 'A fondos de publicidad', value: money(agg.publi), accent: '#f59e0b', color: '#b45309', hint: 'publicidad neta → Meta' },
    { label: 'Queda en Korex', value: money(agg.korex), accent: '#16a34a', color: '#15803d', hint: 'cuenta principal · no se mueve' },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-.02em' }}>Distribución a fondos</h1>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#6B7585' }}>Plata que llegó a Mercury y falta repartir · mové a cada fondo y marcá <b>Fin</b></p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 10, padding: '6px 10px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8A93A2', textTransform: 'uppercase', letterSpacing: '.06em' }}>Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ border: '1px solid #E2E5EB', borderRadius: 7, padding: '5px 8px', fontSize: 12, outline: 'none', color: '#3B4453' }} />
          </div>
          {agg.n > 0 && (
            <button onClick={() => markFin(agg.allIds)} disabled={busy} style={{ border: 0, background: '#0EA5A4', color: '#fff', fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 10, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Marcando…' : `Marcar todo repartido (${agg.n})`}
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #E2E5EB', borderTop: `3px solid ${k.accent}`, borderRadius: 13, padding: '13px 14px 12px', boxShadow: '0 1px 2px rgba(13,17,23,.04)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8A93A2' }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', marginTop: 5, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9AA4B2', marginTop: 5 }}>{k.hint}</div>
          </div>
        ))}
      </div>

      {agg.n === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>Todo repartido</div>
          <div style={{ fontSize: 12.5, color: '#6B7585', marginTop: 4 }}>No hay plata pendiente de distribuir a fondos.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {agg.list.map((g) => {
            const [bg, fg] = avatarColor(g.name);
            const isOpen = !!open[g.name];
            return (
              <div key={g.name} style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, overflow: 'hidden', boxShadow: '0 1px 2px rgba(13,17,23,.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 180, flex: 1 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{ini(g.name)}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{g.name}</div>
                      <button onClick={() => setOpen((o) => ({ ...o, [g.name]: !o[g.name] }))} style={{ border: 0, background: 'transparent', color: '#0EA5A4', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>{g.n} ingreso{g.n === 1 ? '' : 's'} · {isOpen ? 'ocultar' : 'ver detalle'}</button>
                    </div>
                  </div>
                  <Dest label="→ Fondo comisiones" value={money(g.comis)} color="#4338ca" bg="#EEF0FF" dim={g.comis < 0.005} />
                  <Dest label="→ Fondo publicidad" value={money(g.publi)} color="#b45309" bg="#FEF8EC" dim={g.publi < 0.005} />
                  <Dest label="Korex (principal)" value={money(g.korex)} color="#15803d" bg="#F0FDF4" dim={g.korex < 0.005} />
                  <button onClick={() => markFin(g.ids)} disabled={busy} style={{ border: '1px solid #0EA5A4', background: '#fff', color: '#0c8584', fontSize: 12.5, fontWeight: 700, padding: '8px 14px', borderRadius: 9, cursor: 'pointer', whiteSpace: 'nowrap', opacity: busy ? 0.6 : 1 }}>
                    Marcar Fin ({g.n})
                  </button>
                </div>
                {isOpen && (
                  <div style={{ borderTop: '1px solid #EEF1F5', background: '#FBFCFE' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#9AA4B2', borderBottom: '1px solid #EEF1F5' }}>
                      <span style={{ width: 64 }}>Fecha</span>
                      <span style={{ flex: 1, minWidth: 0 }}>Pagador</span>
                      <span style={{ width: 84 }}>Tipo</span>
                      <span style={{ width: 76, textAlign: 'right', color: '#0c8584' }}>Bruto US$</span>
                      <span style={{ width: 80, textAlign: 'right', color: '#4338ca' }}>Comis.</span>
                      <span style={{ width: 80, textAlign: 'right', color: '#b45309' }}>Publi.</span>
                      <span style={{ width: 80, textAlign: 'right', color: '#15803d' }}>Korex</span>
                      <span style={{ width: 24, flexShrink: 0 }} />
                    </div>
                    {g.incomes.map((r) => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: '1px solid #F4F6F9', fontSize: 12 }}>
                        <span style={{ width: 64, color: '#9AA4B2' }}>{fdate(r.income_date)}</span>
                        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.payer_name || '—'}</span>
                        <span style={{ width: 84 }}><span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: TYPE_BG[r.effective_type] || '#f1f5f9', color: TYPE_FG[r.effective_type] || '#64748B' }}>{r.effective_type || '—'}</span></span>
                        <span style={{ width: 76, textAlign: 'right', color: '#0c8584', fontWeight: 600 }} title="Bruto US$ (lo que pagó)">{money(r.amount_usd)}</span>
                        <span style={{ width: 80, textAlign: 'right', color: '#4338ca' }} title="a comisiones">{r.comis ? money(r.comis) : '—'}</span>
                        <span style={{ width: 80, textAlign: 'right', color: '#b45309' }} title="a publicidad">{r.publi ? money(r.publi) : '—'}</span>
                        <span style={{ width: 80, textAlign: 'right', color: '#15803d', fontWeight: 600 }} title="Korex">{money(r.korex)}</span>
                        <button onClick={() => markFin([r.id])} disabled={busy} title="Marcar este ingreso como repartido (Fin)" style={{ border: 0, background: '#16a34a', color: '#fff', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>✓</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Dest({ label, value, color, bg, dim }) {
  return (
    <div style={{ minWidth: 120, background: dim ? '#F8FAFC' : bg, borderRadius: 9, padding: '7px 11px' }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: dim ? '#cbd5e1' : color }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2, color: dim ? '#cbd5e1' : color }}>{value}</div>
    </div>
  );
}
const Msg = ({ children }) => <div style={{ color: '#9AA4B2', textAlign: 'center', padding: '80px 0' }}>{children}</div>;
