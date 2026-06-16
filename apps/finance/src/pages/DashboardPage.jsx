import { useEffect, useState, useMemo } from 'react';
import { sbFetch } from '@korex/db';
import { money, kfmt, mlabel, ini, fdate, avatarColor, ROLE, ROLE_LABEL, catChip, catColor, isRetiro, isAdBudget } from '../lib/format.js';

// Dashboard de Finanzas (diseño Claude Design): KPIs, P&L mensual, evolución,
// donut por producto, egresos al detalle, por cliente y rankings. Todo deriva
// del motor del panel (fin_incomes + fin_commission_entries + fin_expenses).
const DONUT_COLOR = { CRM: '#3b82f6', PUBLICIDAD: '#f59e0b', SETUP: '#94a3b8' };

export default function DashboardPage() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [cli, setCli] = useState('');
  // Filtro de período: arranca en enero 2026 y se recuerda (no se resetea al volver a entrar).
  const [dStart, setDStart] = useState(() => { try { return localStorage.getItem('fin_dash_dStart') || '2026-01-01'; } catch { return '2026-01-01'; } });
  const [dEnd, setDEnd] = useState(() => { try { return localStorage.getItem('fin_dash_dEnd') || ''; } catch { return ''; } });
  const [egCat, setEgCat] = useState('');
  const [pcHover, setPcHover] = useState(null);
  useEffect(() => { try { localStorage.setItem('fin_dash_dStart', dStart || ''); } catch { /* noop */ } }, [dStart]);
  useEffect(() => { try { localStorage.setItem('fin_dash_dEnd', dEnd || ''); } catch { /* noop */ } }, [dEnd]);

  useEffect(() => {
    Promise.all([
      sbFetch('fin_incomes?select=id,income_date,client_name_sheet,payer_name,conector_name_sheet,collected_by,income_type,net_usd,amount_usd,korex_real,fin_commission_entries(role_key,amount,notes)&order=income_date.desc.nullslast&limit=6000'),
      sbFetch('fin_expenses?select=expense_date,amount,category,reason,detail,project,paid_by&order=expense_date.desc.nullslast&limit=6000'),
      sbFetch('fin_fondo_vs_deuda?select=cliente,diff,debe_apartar,fondo_comisiones,tiene_fondo&limit=500'),
    ])
      .then(([inc, exp, fvd]) => {
        setD({ inc: inc || [], exp: exp || [], fvd: fvd || [] });
        // dStart queda fijo en enero 2026 (o lo último guardado). dEnd: si no hay uno
        // recordado, lo poblamos con la última fecha con datos (acotado y el input lleno).
        if (!dEnd) { const ds = (inc || []).map((r) => r.income_date).filter(Boolean).sort(); if (ds.length) setDEnd(ds[ds.length - 1]); }
      })
      .catch((e) => setError(String(e)));
  }, []);

  const commOf = (r) => {
    const comm = {}; let ad = 0;
    (r.fin_commission_entries || []).forEach((e) => {
      const amt = Number(e.amount) || 0;
      if (isAdBudget(e)) { ad += amt; return; }
      if (e.role_key === 'korex') return;
      comm[e.role_key] = (comm[e.role_key] || 0) + amt;
    });
    return { comm, ad };
  };

  const cliOpts = useMemo(() => (d ? [...new Set(d.inc.map((r) => r.client_name_sheet).filter(Boolean))].sort() : []), [d]);

  const agg = useMemo(() => {
    if (!d) return null;
    const inRange = (date) => date && (!dStart || date >= dStart) && (!dEnd || date <= dEnd);
    const inc = d.inc.filter((r) => inRange(r.income_date) && (!cli || r.client_name_sheet === cli));
    const exp = d.exp.filter((r) => inRange(r.expense_date) && (!cli || r.project === cli));

    // ---- agregación por mes ----
    const blank = (k) => ({ m: k, fact: 0, cash: 0, comis: 0, meta: 0, egTot: 0, egEmp: 0, retiro: 0, ganancia: 0, dejo: 0 });
    const mm = new Map();
    const touch = (k) => { if (!mm.has(k)) mm.set(k, blank(k)); return mm.get(k); };
    inc.forEach((r) => {
      const k = (r.income_date || '').slice(0, 7); if (!k) return;
      const o = touch(k); const { comm } = commOf(r);
      const commTotal = Object.values(comm).reduce((a, b) => a + b, 0);
      o.fact += Number(r.net_usd) || 0;          // Facturación = neto (definición del Sheet)
      o.cash += Number(r.korex_real) || 0;        // CashCollect = korex_real (definición del Sheet)
      o.comis += commTotal;
      // Se fue a meta = facturación publicidad − comisiones de esos ingresos − ganancia Korex.
      // Es lo que realmente se fue a Meta de la inversión del cliente (solo ingresos de Publicidad).
      if ((r.income_type || '').toUpperCase() === 'PUBLICIDAD')
        o.meta += (Number(r.amount_usd) || Number(r.net_usd) || 0) - commTotal - (Number(r.korex_real) || 0);
    });
    exp.forEach((e) => {
      const k = (e.expense_date || '').slice(0, 7); if (!k) return;
      const o = touch(k); const a = Number(e.amount) || 0;
      o.egTot += a; if (isRetiro(e.category)) o.retiro += a; else o.egEmp += a;
    });
    // Ganancia = CashCollect − egresos empresa (sin retiros) · Se dejó = CashCollect − todos los egresos.
    const months = [...mm.values()].sort((a, b) => a.m.localeCompare(b.m)).map((o) => {
      o.ganancia = o.cash - o.egEmp; o.dejo = o.ganancia - o.retiro; return o;
    });
    const safeMonths = months.length ? months : [blank('—')];
    const sum = (key) => months.reduce((a, m) => a + m[key], 0);
    const totFact = sum('fact'), totCash = sum('cash'), totComis = sum('comis');
    const totEgTot = sum('egTot'), totGan = sum('ganancia'), totDejo = sum('dejo');

    const spark = (key) => {
      const vals = safeMonths.map((m) => m[key]); const mn = Math.min(...vals, 0), mx = Math.max(...vals, 0);
      return vals.map((v, i) => { const x = vals.length > 1 ? (i / (vals.length - 1)) * 62 : 31; const y = 20 - ((v - mn) / ((mx - mn) || 1)) * 18 + 1; return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
    };
    const kpis = [
      { label: 'Facturación', value: money(totFact), accent: '#0EA5A4', valColor: '#0D1117', delta: 'neto del período', deltaColor: '#64748B', spark: spark('fact') },
      { label: 'CashCollect', value: money(totCash), accent: '#16a34a', valColor: '#15803d', delta: 'lo que le queda a Korex', deltaColor: '#15803d', spark: spark('cash') },
      { label: 'Comisiones', value: money(totComis), accent: '#6366f1', valColor: '#4338ca', delta: 'repartidas', deltaColor: '#64748B', spark: spark('comis') },
      { label: 'Egresos totales', value: money(totEgTot), accent: '#e11d48', valColor: '#be123c', delta: 'operativos + retiros', deltaColor: '#be123c', spark: spark('egTot') },
      { label: 'Ganancia', value: money(totGan), accent: totGan >= 0 ? '#0ea5e9' : '#e11d48', valColor: totGan >= 0 ? '#0369a1' : '#be123c', delta: 'del período', deltaColor: '#64748B', spark: spark('ganancia') },
      { label: 'Se dejó en empresa', value: money(totDejo), accent: '#f59e0b', valColor: totDejo >= 0 ? '#b45309' : '#be123c', delta: 'tras retiros', deltaColor: '#64748B', spark: spark('dejo') },
    ];

    // ---- tabla P&L ----
    const pcolsM = [
      { key: 'fact', hbg: '#ECFDF3', hfg: '#15803d', cbg: '#F4FCF6', bl: '1px solid #F1F5F9' },
      { key: 'cash', hbg: '#EAFCFA', hfg: '#0d9488', cbg: '#F2FCFB', bl: '1px solid #F1F5F9' },
      { key: 'comis', hbg: '#EEF0FF', hfg: '#4f46e5', cbg: '#F5F6FF', bl: '1px solid #F1F5F9' },
      { key: 'meta', hbg: '#FEF8EC', hfg: '#b45309', cbg: '#FEFBF3', bl: '1px solid #F1F5F9' },
      { key: 'ganancia', hbg: '#E7FBF0', hfg: '#047857', cbg: '#F1FCF6', bl: '1px solid #F1F5F9' },
      { key: 'egTot', hbg: '#FEECEE', hfg: '#be123c', cbg: '#FFF6F7', bl: '2px solid #E2E5EB' },
      { key: 'egEmp', hbg: '#FEECEE', hfg: '#e11d48', cbg: '#FFF6F7', bl: '1px solid #F1F5F9' },
      { key: 'retiro', hbg: '#FEECEE', hfg: '#9f1239', cbg: '#FFF6F7', bl: '1px solid #F1F5F9' },
      { key: 'dejo', hbg: '#EAF6FE', hfg: '#0369a1', cbg: '#F4FAFE', bl: '2px solid #E2E5EB' },
    ];
    const plabel = { fact: 'Facturación', cash: 'CashCollect', comis: 'Comisiones', meta: 'Se fue a meta', ganancia: 'Ganancia', egTot: 'Egr. totales', egEmp: 'Egr. empresa', retiro: 'Retiro dueños', dejo: 'Se dejó' };
    const cellColor = (key, v) => key === 'ganancia' ? (v >= 0 ? '#047857' : '#dc2626') : key === 'dejo' ? (v >= 0 ? '#0369a1' : '#dc2626') : (key === 'egTot' || key === 'egEmp' || key === 'retiro') ? '#be123c' : '#1e293b';
    const cellW = (key) => (key === 'ganancia' || key === 'dejo') ? 700 : 500;
    const mHeads = [{ label: 'Mes', bg: '#F8FAFC', fg: '#64748B', bl: 'none' }, ...pcolsM.map((c) => ({ label: plabel[c.key], bg: c.hbg, fg: c.hfg, bl: c.bl }))];
    const mRows = months.map((m) => ({ label: mlabel(m.m), cells: pcolsM.map((c) => ({ v: money(m[c.key]), bg: c.cbg, color: cellColor(c.key, m[c.key]), weight: cellW(c.key), bl: c.bl })) }));
    const mTotals = pcolsM.map((c) => { const tv = sum(c.key); return { v: money(tv), color: cellColor(c.key, tv), bl: c.bl }; });

    // ---- evolución (barras + línea egresos) ----
    const maxBar = Math.max(1, ...safeMonths.map((m) => Math.max(m.fact, m.cash)));
    const evoMonths = safeMonths.map((m) => ({ label: mlabel(m.m), netoStr: money(m.fact), korexStr: money(m.cash), netoH: Math.round(m.fact / maxBar * 178), korexH: Math.round(m.cash / maxBar * 178) }));
    const maxEg = Math.max(1, ...safeMonths.map((m) => m.egTot));
    const egresoLine = safeMonths.map((m, i) => { const x = safeMonths.length > 1 ? i / (safeMonths.length - 1) * 100 : 50; const y = 100 - (m.egTot / maxEg) * 78; return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');

    // ---- donut por producto (facturación bruta por tipo) ----
    const tipoTot = {}; inc.forEach((r) => { const t = (r.income_type || 'OTRO').toUpperCase(); tipoTot[t] = (tipoTot[t] || 0) + (Number(r.net_usd) || 0); });
    const tipoEntries = Object.entries(tipoTot).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const donutTotal = tipoEntries.reduce((a, [, v]) => a + v, 0) || 1;
    const C = 2 * Math.PI * 54; let acc = 0;
    const donut = tipoEntries.map(([key, v]) => { const frac = v / donutTotal; const len = frac * C; const seg = { label: key === 'PUBLICIDAD' ? 'Publicidad' : key.charAt(0) + key.slice(1).toLowerCase(), color: DONUT_COLOR[key] || '#cbd5e1', dash: `${len.toFixed(1)} ${(C - len).toFixed(1)}`, off: (-acc * C).toFixed(1), pct: Math.round(frac * 100) }; acc += frac; return seg; });

    // ---- por cliente ----
    const clMap = {};
    inc.forEach((r) => {
      const o = clMap[r.client_name_sheet || '—'] || (clMap[r.client_name_sheet || '—'] = { fact: 0, cash: 0, crm: 0, publi: 0, con: 0, clt: 0, afi: 0, cons: 0, mkt: 0 });
      const { comm } = commOf(r); const net = Number(r.net_usd) || 0;
      o.fact += net; o.cash += Number(r.korex_real) || 0;
      // CashCollect (korex_real) desglosado por producto: lo que le quedó a Korex de CRM y de Publicidad.
      if ((r.income_type || '').toUpperCase() === 'CRM') o.crm += Number(r.korex_real) || 0;
      if ((r.income_type || '').toUpperCase() === 'PUBLICIDAD') o.publi += Number(r.korex_real) || 0;
      o.con += comm.conector || 0; o.clt += comm.cliente || 0; o.afi += comm.afiliado || 0; o.cons += comm.consultor || 0; o.mkt += comm.marketing || 0;
    });
    const pcCols = [
      { key: 'fact', hbg: '#ECFDF3', hfg: '#15803d', cbg: '#F4FCF6', bl: '1px solid #F1F5F9', green: false },
      { key: 'cash', hbg: '#EAFCFA', hfg: '#0d9488', cbg: '#F2FCFB', bl: '1px solid #F1F5F9', green: true },
      { key: 'crm', hbg: '#EAF1FE', hfg: '#1d4ed8', cbg: '#F5F8FE', bl: '2px solid #E2E5EB', green: true },
      { key: 'publi', hbg: '#FEF8EC', hfg: '#b45309', cbg: '#FEFBF3', bl: '1px solid #F1F5F9', green: true },
      { key: 'con', hbg: '#EAF6FE', hfg: '#0369a1', cbg: '#F4FAFE', bl: '2px solid #E2E5EB', green: false },
      { key: 'clt', hbg: '#EAF1FE', hfg: '#1d4ed8', cbg: '#F5F8FE', bl: '1px solid #F1F5F9', green: false },
      { key: 'afi', hbg: '#FEF8EC', hfg: '#b45309', cbg: '#FEFBF3', bl: '1px solid #F1F5F9', green: false },
      { key: 'cons', hbg: '#EDE9FE', hfg: '#6d28d9', cbg: '#F6F4FE', bl: '1px solid #F1F5F9', green: false },
      { key: 'mkt', hbg: '#FDF0F6', hfg: '#be185d', cbg: '#FEF6FA', bl: '1px solid #F1F5F9', green: false },
    ];
    const pcLabel = { fact: 'Facturación', cash: 'CashCollect', crm: 'CashColl. CRM', publi: 'CashColl. Publi', con: 'Com. Conector', clt: 'Com. Cliente', afi: 'Com. Afiliado', cons: 'Com. Consultor', mkt: 'Com. Marketing' };
    const pcList = Object.entries(clMap).map(([name, o]) => ({ name, ...o })).sort((a, b) => b.fact - a.fact);
    const pcHeads = [{ label: 'Cliente', bg: '#F8FAFC', fg: '#64748B', bl: 'none' }, ...pcCols.map((c) => ({ label: pcLabel[c.key], bg: c.hbg, fg: c.hfg, bl: c.bl }))];
    const pcT = {}; pcCols.forEach((c) => (pcT[c.key] = pcList.reduce((a, o) => a + o[c.key], 0)));

    // ---- rankings ----
    const topMax = Math.max(1, ...pcList.slice(0, 6).map((o) => o.fact));
    const topClientes = pcList.slice(0, 6).map((o) => { const [bg, fg] = avatarColor(o.name); return { label: o.name, ini: ini(o.name), avBg: bg, avFg: fg, barW: Math.round(o.fact / topMax * 100), val: kfmt(o.fact) }; });
    const conMap = {};
    inc.forEach((r) => { const n = r.conector_name_sheet; if (!n) return; const { comm } = commOf(r); const o = conMap[n] || (conMap[n] = { ventas: 0, cash: 0, com: 0 }); o.ventas++; o.cash += Number(r.korex_real) || 0; o.com += comm.conector || 0; });
    const topConectores = Object.entries(conMap).map(([label, o]) => ({ label, ...o })).sort((a, b) => b.cash - a.cash).slice(0, 5).map((c) => { const [bg, fg] = avatarColor(c.label); return { label: c.label, ini: ini(c.label), avBg: bg, avFg: fg, ventas: c.ventas, cash: kfmt(c.cash) }; });
    const usrMap = {};
    inc.forEach((r) => { if ((r.income_type || '').toUpperCase() !== 'PUBLICIDAD') return; const n = r.payer_name || '—'; const o = usrMap[n] || (usrMap[n] = { inv: 0, cash: 0 }); o.inv += Number(r.amount_usd) || 0; o.cash += Number(r.korex_real) || 0; });
    const topUsuarios = Object.entries(usrMap).map(([label, o]) => ({ label, ...o })).sort((a, b) => b.inv - a.inv).slice(0, 5).map((u) => { const [bg, fg] = avatarColor(u.label); return { label: u.label, ini: ini(u.label), avBg: bg, avFg: fg, inv: kfmt(u.inv), cash: kfmt(u.cash) }; });

    // comisiones por rol
    const rolTot = {};
    inc.forEach((r) => { const { comm } = commOf(r); Object.entries(comm).forEach(([k, v]) => (rolTot[k] = (rolTot[k] || 0) + v)); });
    const rolMax = Math.max(1, ...Object.values(rolTot));
    const porRol = Object.entries(rolTot).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: ROLE_LABEL[k] || k, color: ROLE[k] || '#64748B', barW: Math.round(v / rolMax * 100), val: money(v) }));
    // Donut de comisiones por rol (mismo estilo que el donut de producto).
    const comTotalRaw = Object.values(rolTot).reduce((a, b) => a + b, 0) || 1;
    let accR = 0;
    const comDonut = Object.entries(rolTot).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0).map(([k, v]) => { const frac = v / comTotalRaw; const len = frac * C; const seg = { label: ROLE_LABEL[k] || k, color: ROLE[k] || '#64748B', dash: `${len.toFixed(1)} ${(C - len).toFixed(1)}`, off: (-accR * C).toFixed(1), pct: Math.round(frac * 100), val: money(v) }; accR += frac; return seg; });

    // egresos al detalle
    let egTotal = 0; const byCatMap = {};
    exp.forEach((e) => { egTotal += Number(e.amount) || 0; if (e.category) byCatMap[e.category] = (byCatMap[e.category] || 0) + (Number(e.amount) || 0); });
    const byCatMax = Math.max(1, ...Object.values(byCatMap));
    const egByCat = Object.entries(byCatMap).sort((a, b) => b[1] - a[1]).map(([k, v]) => { const [, fg] = catChip(k); return { label: k, val: money(v), barW: Math.round(v / byCatMax * 100), color: catColor(k), fg }; });
    const egCats = Object.keys(byCatMap).sort((a, b) => byCatMap[b] - byCatMap[a]);
    const egMotivos = exp.filter((e) => !egCat || e.category === egCat).sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)).slice(0, 60)
      .map((e, i) => ({ reason: e.reason || '—', cat: e.category || '—', project: e.project || '—', date: fdate(e.expense_date), amt: money(e.amount), color: catColor(e.category), bg: i % 2 ? '#FBFCFE' : '#fff' }));

    // alertas (reales)
    const alerts = [];
    const neg = months.filter((m) => m.ganancia < -1).sort((a, b) => a.ganancia - b.ganancia)[0];
    if (neg) alerts.push({ title: `${mlabel(neg.m)} en negativo`, body: `Ganancia ${money(neg.ganancia)}: egresos (${money(neg.egTot)}) superaron al CashCollect.`, dot: '#e11d48', bg: '#FFF1F2', bd: '#FBC9CF', fg: '#be123c' });
    if (months.length >= 2) { const first = months[0], last = months[months.length - 1]; if (last.fact < first.fact * 0.7) alerts.push({ title: 'Caída de facturación', body: `De ${money(first.fact)} (${mlabel(first.m)}) a ${money(last.fact)} (${mlabel(last.m)}). Revisar pipeline.`, dot: '#f59e0b', bg: '#FFFBEB', bd: '#FDE68A', fg: '#b45309' }); }
    const faltan = d.fvd.filter((f) => Number(f.diff) < -1).sort((a, b) => Number(a.diff) - Number(b.diff))[0];
    if (faltan) alerts.push({ title: `Fondo de ${faltan.cliente} no alcanza`, body: `Faltan ${money(Math.abs(Number(faltan.diff)))} apartados vs la deuda a partners.`, dot: '#0ea5e9', bg: '#F0F9FF', bd: '#BAE6FD', fg: '#0369a1' });
    if (!alerts.length) alerts.push({ title: 'Todo en orden', body: 'Sin meses en negativo ni fondos en falta en el período.', dot: '#16a34a', bg: '#F0FDF4', bd: '#BBF7D0', fg: '#15803d' });

    return {
      kpis, monthly: { heads: mHeads, rows: mRows, totals: mTotals },
      evoMonths, egresoLine, donut, donutTotal: kfmt(donutTotal),
      porCliente: { heads: pcHeads, cols: pcCols, list: pcList, totals: pcCols.map((c) => ({ v: money(pcT[c.key]), color: c.green ? '#15803d' : '#1e293b', bl: c.bl })) },
      topClientes, topConectores, topUsuarios, porRol, comDonut, comTotal: kfmt(comTotalRaw), alerts,
      eg: { total: money(egTotal), byCat: egByCat, cats: egCats, motivos: egMotivos },
    };
  }, [d, cli, dStart, dEnd, egCat]);

  if (error) return <div style={{ color: '#dc2626', fontSize: 13, padding: 20 }}>Error cargando dashboard: {error}</div>;
  if (!agg) return <div style={{ color: '#9AA4B2', textAlign: 'center', padding: '80px 0' }}>Cargando dashboard…</div>;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 40px' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-.02em' }}>Resumen financiero</h1>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#6B7585' }}>Vista panorámica del período · todo deriva del motor del panel</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${cli ? '#99E6E3' : '#E2E5EB'}`, borderRadius: 10, padding: '6px 10px', boxShadow: cli ? '0 1px 3px rgba(14,165,164,.15)' : 'none' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0EA5A4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>
            <select value={cli} onChange={(e) => setCli(e.target.value)} style={{ border: 0, outline: 'none', background: 'transparent', fontSize: 12.5, fontWeight: 600, color: '#0c8584', cursor: 'pointer', maxWidth: 180 }}>
              <option value="">Todos los clientes</option>
              {cliOpts.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 10, padding: '6px 10px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8A93A2', textTransform: 'uppercase', letterSpacing: '.06em' }}>Período</span>
            <input type="date" value={dStart} onChange={(e) => setDStart(e.target.value)} style={{ border: '1px solid #E2E5EB', borderRadius: 7, padding: '5px 8px', fontSize: 12, outline: 'none', color: '#3B4453' }} />
            <span style={{ color: '#CBD2DC' }}>→</span>
            <input type="date" value={dEnd} onChange={(e) => setDEnd(e.target.value)} style={{ border: '1px solid #E2E5EB', borderRadius: 7, padding: '5px 8px', fontSize: 12, outline: 'none', color: '#3B4453' }} />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 14 }}>
        {agg.kpis.map((k) => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #E2E5EB', borderTop: `3px solid ${k.accent}`, borderRadius: 13, padding: '13px 14px 12px', boxShadow: '0 1px 2px rgba(13,17,23,.04)', minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8A93A2' }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', marginTop: 5, color: k.valColor }}>{k.value}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 7 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: k.deltaColor }}>{k.delta}</span>
              <svg width="62" height="22" viewBox="0 0 62 22" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                <polyline points={k.spark} fill="none" stroke={k.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              </svg>
            </div>
          </div>
        ))}
      </div>

      {/* P&L mensual */}
      <Card>
        <CardHead title="Vista mensual" hint="Facturación → CashCollect → Ganancia · negativos en rojo" />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 12, whiteSpace: 'nowrap' }}>
            <thead><tr>{agg.monthly.heads.map((h, i) => (
              <th key={i} style={{ position: 'sticky', top: 0, background: h.bg, borderBottom: '2px solid #E2E5EB', borderLeft: h.bl, padding: '9px 14px', textAlign: i === 0 ? 'left' : 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: h.fg }}>{h.label}</th>
            ))}</tr></thead>
            <tbody>{agg.monthly.rows.map((r, ri) => (
              <tr key={ri}>
                <td style={{ padding: '9px 14px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, color: '#1e293b' }}>{r.label}</td>
                {r.cells.map((c, ci) => <td key={ci} style={{ padding: '9px 14px', borderBottom: '1px solid #F1F5F9', borderLeft: c.bl, textAlign: 'left', background: c.bg, color: c.color, fontWeight: c.weight }}>{c.v}</td>)}
              </tr>
            ))}</tbody>
            <tfoot><tr style={{ fontWeight: 800, fontSize: 11.5 }}>
              <td style={{ padding: '11px 14px', borderTop: '2px solid #CBD5E1', background: '#F1F5F9' }}>TOTAL</td>
              {agg.monthly.totals.map((c, ci) => <td key={ci} style={{ padding: '11px 14px', borderTop: '2px solid #CBD5E1', borderLeft: c.bl, textAlign: 'left', background: '#F1F5F9', color: c.color }}>{c.v}</td>)}
            </tr></tfoot>
          </table>
        </div>
      </Card>

      {/* evolución + donut */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, padding: '16px 18px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Evolución mensual</h3>
            <div style={{ display: 'flex', gap: 14 }}>
              <Legend color="#0EA5A4" label="Facturación" /><Legend color="#16a34a" label="CashCollect" /><Legend color="#e11d48" label="Egresos" line />
            </div>
          </div>
          <div style={{ position: 'relative', height: 200, display: 'flex', alignItems: 'flex-end', gap: 18, padding: '0 4px' }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: '0 0 22px', width: '100%', height: 178, pointerEvents: 'none' }}>
              <polyline points={agg.egresoLine} fill="none" stroke="#e11d48" strokeWidth="0.9" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {agg.evoMonths.map((m, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 5, height: 178 }}>
                  <div title={`Facturación ${m.netoStr}`} style={{ width: '40%', maxWidth: 22, height: m.netoH, background: 'linear-gradient(#15c0bf,#0EA5A4)', borderRadius: '5px 5px 0 0' }} />
                  <div title={`CashCollect ${m.korexStr}`} style={{ width: '40%', maxWidth: 22, height: m.korexH, background: 'linear-gradient(#22c55e,#16a34a)', borderRadius: '5px 5px 0 0' }} />
                </div>
                <span style={{ fontSize: 10.5, color: '#8A93A2', fontWeight: 600 }}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, padding: '16px 18px' }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 13.5, fontWeight: 700 }}>Facturación por producto</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 8 }}>
            <svg width="128" height="128" viewBox="0 0 128 128" style={{ flexShrink: 0 }}>
              {agg.donut.map((s, i) => <circle key={i} cx="64" cy="64" r="54" fill="none" stroke={s.color} strokeWidth="20" strokeDasharray={s.dash} strokeDashoffset={s.off} transform="rotate(-90 64 64)" />)}
              <text x="64" y="59" textAnchor="middle" fontSize="13" fontWeight="800" fill="#0D1117">{agg.donutTotal}</text>
              <text x="64" y="74" textAnchor="middle" fontSize="9" fontWeight="600" fill="#8A93A2">facturación</text>
            </svg>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {agg.donut.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#3B4453', flex: 1 }}>{s.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{s.pct}%</span>
                </div>
              ))}
              {!agg.donut.length && <span style={{ fontSize: 12, color: '#9AA4B2' }}>Sin datos</span>}
            </div>
          </div>
        </div>
      </div>

      {/* egresos al detalle */}
      <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, padding: '16px 18px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Egresos al detalle <span style={{ fontWeight: 500, color: '#9AA4B2', fontSize: 11 }}>· total {agg.eg.total}</span></h3>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {[['', 'Todas'], ...agg.eg.cats.map((c) => [c, c])].map(([v, label]) => {
              const sel = egCat === v; const [cbg, cfg] = catChip(v);
              return <button key={v || 'all'} onClick={() => setEgCat(v)} style={{ border: `1px solid ${sel ? 'transparent' : '#E2E5EB'}`, background: sel ? (v ? cbg : '#0EA5A4') : '#fff', color: sel ? (v ? cfg : '#fff') : '#475569', fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>;
            })}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#8A93A2' }}>Por categoría</div>
            {agg.eg.byCat.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 96, fontSize: 11.5, fontWeight: 600, color: b.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.label}</span>
                <div style={{ flex: 1, height: 12, background: '#EEF1F5', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${b.barW}%`, background: b.color, borderRadius: 4 }} /></div>
                <span style={{ fontSize: 11.5, fontWeight: 700, width: 74, textAlign: 'left' }}>{b.val}</span>
              </div>
            ))}
            {!agg.eg.byCat.length && <span style={{ fontSize: 12, color: '#9AA4B2' }}>Sin egresos</span>}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#8A93A2', marginBottom: 8 }}>Por motivo {egCat ? '· ' + egCat : ''}</div>
            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #F1F5F9', borderRadius: 10, overflowY: 'auto', maxHeight: 264 }}>
              {agg.eg.motivos.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: m.bg, borderBottom: '1px solid #F4F6F9' }}>
                  <span style={{ width: 3, height: 24, borderRadius: 2, background: m.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.reason}</div><div style={{ fontSize: 10.5, color: '#9AA4B2' }}>{m.cat} · {m.project}</div></div>
                  <span style={{ fontSize: 10.5, color: '#9AA4B2', whiteSpace: 'nowrap' }}>{m.date}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#be123c', width: 78, textAlign: 'left' }}>{m.amt}</span>
                </div>
              ))}
              {!agg.eg.motivos.length && <div style={{ padding: 14, fontSize: 12, color: '#9AA4B2' }}>Sin egresos</div>}
            </div>
          </div>
        </div>
      </div>

      {/* por cliente */}
      <Card>
        <CardHead title="Por cliente" hint="Facturación · CashCollect · por producto · comisiones repartidas" />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 12, whiteSpace: 'nowrap' }}>
            <thead><tr>{agg.porCliente.heads.map((h, i) => (
              <th key={i} style={{ position: 'sticky', top: 0, background: h.bg, borderBottom: '2px solid #E2E5EB', borderLeft: h.bl, padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: h.fg }}>{h.label}</th>
            ))}</tr></thead>
            <tbody>{agg.porCliente.list.map((o, ri) => { const [avBg, avFg] = avatarColor(o.name); const hov = pcHover === ri;
              return (
                <tr key={ri} onMouseEnter={() => setPcHover(ri)} onMouseLeave={() => setPcHover(null)} style={{ background: hov ? '#F6FBFB' : '#fff' }}>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid #F1F5F9', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 22, height: 22, borderRadius: 6, background: avBg, color: avFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700, flexShrink: 0 }}>{ini(o.name)}</div>{o.name}</div>
                  </td>
                  {agg.porCliente.cols.map((c, ci) => <td key={ci} style={{ padding: '9px 14px', borderBottom: '1px solid #F1F5F9', borderLeft: c.bl, textAlign: 'left', color: c.green ? '#15803d' : '#1e293b', fontWeight: c.green ? 700 : 500 }}>{money(o[c.key])}</td>)}
                </tr>
              );
            })}</tbody>
            <tfoot><tr style={{ fontWeight: 800, fontSize: 11.5 }}>
              <td style={{ padding: '11px 14px', borderTop: '2px solid #CBD5E1', background: '#F1F5F9' }}>TOTAL · {agg.porCliente.list.length}</td>
              {agg.porCliente.totals.map((c, ci) => <td key={ci} style={{ padding: '11px 14px', borderTop: '2px solid #CBD5E1', borderLeft: c.bl, textAlign: 'left', background: '#F1F5F9', color: c.color }}>{c.v}</td>)}
            </tr></tfoot>
          </table>
        </div>
      </Card>

      {/* rankings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, padding: '16px 18px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 13.5, fontWeight: 700 }}>Top clientes <span style={{ fontWeight: 500, color: '#9AA4B2', fontSize: 11 }}>· facturación</span></h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {agg.topClientes.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 24, height: 24, borderRadius: 7, background: c.avBg, color: c.avFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{c.ini}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</div>
                  <div style={{ height: 5, background: '#EEF1F5', borderRadius: 3, marginTop: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${c.barW}%`, background: '#0EA5A4', borderRadius: 3 }} /></div>
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#3B4453' }}>{c.val}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, padding: '16px 18px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 13.5, fontWeight: 700 }}>Top conectores</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {agg.topConectores.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, paddingBottom: 8, borderBottom: '1px solid #F4F6F9' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: c.avBg, color: c.avFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{c.ini}</div>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</div><div style={{ fontSize: 10, color: '#9AA4B2' }}>{c.ventas} ventas</div></div>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#0369a1' }}>{c.cash}</span>
              </div>
            ))}
            {!agg.topConectores.length && <span style={{ fontSize: 12, color: '#9AA4B2' }}>Sin datos</span>}
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, padding: '16px 18px' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 700 }}>Top usuarios en publicidad</h3>
          <div style={{ fontSize: 10, color: '#9AA4B2', marginBottom: 10, display: 'flex', justifyContent: 'flex-end', gap: 14 }}><span>invirtió</span><span style={{ color: '#16a34a' }}>cashcollect</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {agg.topUsuarios.map((u, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, paddingBottom: 8, borderBottom: '1px solid #F4F6F9' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: u.avBg, color: u.avFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{u.ini}</div>
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.label}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#b45309', width: 62, textAlign: 'left' }}>{u.inv}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#16a34a', width: 62, textAlign: 'left' }}>{u.cash}</span>
              </div>
            ))}
            {!agg.topUsuarios.length && <span style={{ fontSize: 12, color: '#9AA4B2' }}>Sin datos</span>}
          </div>
        </div>
      </div>

      {/* comisiones por rol + alertas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, padding: '16px 18px' }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 13.5, fontWeight: 700 }}>Comisiones por rol</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 8 }}>
            <svg width="128" height="128" viewBox="0 0 128 128" style={{ flexShrink: 0 }}>
              {agg.comDonut.map((s, i) => <circle key={i} cx="64" cy="64" r="54" fill="none" stroke={s.color} strokeWidth="20" strokeDasharray={s.dash} strokeDashoffset={s.off} transform="rotate(-90 64 64)" />)}
              <text x="64" y="59" textAnchor="middle" fontSize="13" fontWeight="800" fill="#0D1117">{agg.comTotal}</text>
              <text x="64" y="74" textAnchor="middle" fontSize="9" fontWeight="600" fill="#8A93A2">comisiones</text>
            </svg>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {agg.comDonut.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#3B4453', flex: 1 }}>{s.label}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#3B4453' }}>{s.val}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#9AA4B2', width: 34, textAlign: 'right' }}>{s.pct}%</span>
                </div>
              ))}
              {!agg.comDonut.length && <span style={{ fontSize: 12, color: '#9AA4B2' }}>Sin comisiones</span>}
            </div>
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, padding: '16px 18px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 13.5, fontWeight: 700 }}>Alertas <span style={{ fontWeight: 500, color: '#9AA4B2', fontSize: 11 }}>· cuellos de botella</span></h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {agg.alerts.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 11px', borderRadius: 10, background: a.bg, border: `1px solid ${a.bd}` }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.dot, marginTop: 5, flexShrink: 0 }} />
                <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700, color: a.fg }}>{a.title}</div><div style={{ fontSize: 11, color: '#6B7585', marginTop: 1, lineHeight: 1.35 }}>{a.body}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ children }) {
  return <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, overflow: 'hidden', marginBottom: 14 }}>{children}</div>;
}
function CardHead({ title, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px' }}>
      <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>{title}</h3>
      <span style={{ fontSize: 11, color: '#9AA4B2' }}>{hint}</span>
    </div>
  );
}
function Legend({ color, label, line }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6B7585' }}>
      <span style={{ width: line ? 16 : 9, height: line ? 3 : 9, borderRadius: 2, background: color }} />{label}
    </span>
  );
}
