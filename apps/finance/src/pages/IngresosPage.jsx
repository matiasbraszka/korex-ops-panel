import { useEffect, useState, useMemo, useCallback } from 'react';
import { sbFetch } from '@korex/db';
import PersonDrawer from '../components/PersonDrawer.jsx';
import FacturaModal from '../components/FacturaModal.jsx';
import { Search } from '../components/bits.jsx';
import { money, money2, fdate, pagoChip, TYPE_BG, TYPE_FG, TYPE_RAIL, ROLE } from '../lib/format.js';

// Ingresos (diseño Claude Design): tabla con columnas fijas (Fecha + Cliente),
// conciliación Banco (Stripe/Mercury), estados (dots), edición inline por fila y
// modal de alta. Todo dispara el motor (fin_recompute) y la conciliación (fin_recon_run).
const COMM_ORDER = ['cliente', 'conector', 'afiliado', 'consultor', 'marketing'];
const PAY_OPTS = ['Stripe (Tarjeta) - Empresa', 'Mercury (Transferencia) - Empresa', 'Kraken (USDT) - Empresa', 'Safepal (USDT) - Empresa', 'USDT - Cliente', 'Tarjeta - Cliente'];
const TIPO_OPTS = ['SETUP', 'CRM', 'PUBLICIDAD'];
// Etiqueta de pantalla unificada para el tipo (mismo formato en "Tipo" y "Efectivo"): Publicidad, no PUBLICIDAD.
const typeLabel = (t) => (t || '').toUpperCase() === 'PUBLICIDAD' ? 'Publicidad' : (t || '—');
const num = (x) => { const n = parseFloat(String(x).replace(',', '.')); return isFinite(n) ? n : null; };
const todayStr = () => new Date().toISOString().slice(0, 10);
const feePct = (g, n) => { const gg = Number(g), nn = Number(n); return (gg > 0 && nn > 0 && gg > nn) ? ((gg - nn) / gg) * 100 : null; };
const STRIPE_FEE = 0.045; // fee Stripe por defecto (4,5%, igual que crear-venta) para el neto baseline
const isAdBudget = (e) => e.role_key === 'cliente' && /publicidad/i.test(e.notes || '');
const isReservado = (e) => e.role_key === 'afiliado' && /reserv/i.test(e.notes || '');
// "Llegó a Mercury" automático: si lo cobró Korex por Stripe o Mercury (Empresa),
// el dinero termina depositado en Mercury. Se calcula solo, sin tilde manual.
const autoMercury = (method, collected) => (collected || 'Korex') === 'Korex' && /stripe|mercury/i.test(method || '');
// "Quién cobró" se deduce del método: los "- Cliente" los cobra el cliente; el resto, Korex.
const collectedFromMethod = (m) => /cliente/i.test(m || '') ? 'Cliente' : 'Korex';
const isStripeMethod = (m) => /stripe/i.test(m || '');

export default function IngresosPage() {
  const [rows, setRows] = useState(null);
  const [dirMap, setDirMap] = useState({});
  const [dir, setDir] = useState([]);          // roster del directorio para el desplegable de pagador
  const [conByClient, setConByClient] = useState({}); // cliente → conector (del acuerdo)
  const [reconMap, setReconMap] = useState({});
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [mes, setMes] = useState('');
  const [openId, setOpenId] = useState(null);
  const [shown, setShown] = useState(120);     // ventana de filas renderizadas (perf)
  const [modal, setModal] = useState(null);   // form de alta/edición (null = cerrado)
  const [busy, setBusy] = useState(false);
  const [factura, setFactura] = useState(null);  // ingreso a facturar (null = cerrado)

  const load = useCallback(() => {
    sbFetch('fin_incomes?select=id,income_date,client_id,client_name_sheet,payer_name,conector_name_sheet,afiliado_name,collected_by,income_type,effective_type,payment_method,net_usd,amount_eur,amount_usd,korex_real,facturado,organizado_finanzas,llego_mercury,invoice_id,invoices!fin_incomes_invoice_id_fkey(number,pdf_url,status),fin_commission_entries(role_key,amount,notes)&order=income_date.desc.nullslast&limit=6000')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch((e) => setError(String(e)));
    sbFetch('fin_incomes_enriched?select=id,payer_dir_id,payer_tipo,client_dir_id&limit=6000')
      .then((d) => { const m = {}; (Array.isArray(d) ? d : []).forEach((r) => { m[r.id] = r; }); setDirMap(m); }).catch(() => {});
    sbFetch('fin_income_recon?select=income_id,source,ref_id,amount,dt,who,receipt_url,confidence&limit=6000')
      .then((d) => { const m = {}; (Array.isArray(d) ? d : []).forEach((r) => { m[r.income_id] = r; }); setReconMap(m); }).catch(() => {});
    // Roster del directorio (para elegir el pagador) — dedup por nombre, preferimos el que tenga cliente_padre.
    sbFetch('fin_directory?select=nombre,tipo,cliente_padre,conector_e,conector,email,aliases&order=nombre.asc&limit=2000')
      .then((d) => {
        const seen = new Map();
        (Array.isArray(d) ? d : []).forEach((p) => {
          if (!p.nombre) return; const k = p.nombre.trim().toLowerCase(); const prev = seen.get(k);
          if (!prev || (!prev.cliente_padre && p.cliente_padre)) seen.set(k, p);
        });
        setDir([...seen.values()]);
      }).catch(() => {});
    // Mapa cliente → conector (del acuerdo) para autocompletar al elegir el pagador.
    sbFetch('fin_client_terms?select=sheet_client_name,conector_name&limit=2000')
      .then((d) => { const m = {}; (Array.isArray(d) ? d : []).forEach((t) => { if (t.sheet_client_name && t.conector_name) m[t.sheet_client_name.trim().toLowerCase()] = t.conector_name; }); setConByClient(m); }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  // Editar/togglear una fila existente.
  const patchIncome = async (id, body, { recompute = false, recon = false } = {}) => {
    setRows((rs) => (rs || []).map((r) => (r.id === id ? { ...r, ...body } : r)));
    try {
      await sbFetch(`fin_incomes?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(body), throwOnError: true });
      if (recompute) await sbFetch('rpc/fin_recompute', { method: 'POST', body: '{}' }).catch(() => {});
      if (recon) await sbFetch('rpc/fin_recon_run', { method: 'POST', body: '{}' }).catch(() => {});
      if (recompute || recon) load();
    } catch { load(); }
  };

  // Abrir el MISMO formulario para editar (no edición en la fila).
  const openEdit = (r) => {
    const usd = Number(r.amount_usd) || 0, eur = Number(r.amount_eur) || 0;
    const divisa = (usd || !eur) ? 'USD' : 'EUR';
    const implied = (usd > 0 && eur > 0) ? Math.round((usd / eur) * 10000) / 10000 : null;
    setModal({
      mode: 'edit', id: r.id,
      fx_rate: implied != null ? String(implied) : '', rateTouched: implied != null,
      income_date: r.income_date || '', income_type: r.income_type || 'CRM',
      payer_name: r.payer_name || '', client_name_sheet: r.client_name_sheet || '', conector_name: r.conector_name_sheet || '', afiliado_name: r.afiliado_name || '',
      payment_method: r.payment_method || PAY_OPTS[0], divisa,
      bruto: String(divisa === 'USD' ? (r.amount_usd ?? '') : (r.amount_eur ?? '')),
      amount_usd: r.amount_usd == null ? '' : String(r.amount_usd), amount_eur: r.amount_eur == null ? '' : String(r.amount_eur),
      net_usd: r.net_usd == null ? '' : String(r.net_usd), netTouched: true,
    });
  };

  const saveModal = async () => {
    const f = modal; const net = num(f.net_usd);
    if (!f.client_name_sheet.trim() || net == null) return;
    setBusy(true);
    try {
      const collected = collectedFromMethod(f.payment_method);
      const common = {
        income_date: f.income_date || null, month_date: f.income_date ? f.income_date.slice(0, 7) + '-01' : null,
        client_name_sheet: f.client_name_sheet.trim(), payer_name: (f.payer_name || '').trim() || f.client_name_sheet.trim(),
        conector_name_sheet: (f.conector_name || '').trim() || null, afiliado_name: (f.afiliado_name || '').trim() || null,
        collected_by: collected, income_type: f.income_type,
        amount_eur: num(f.amount_eur), amount_usd: num(f.amount_usd), net_usd: net, payment_method: f.payment_method || null,
        llego_mercury: autoMercury(f.payment_method, collected),
      };
      if (f.mode === 'edit') {
        await sbFetch(`fin_incomes?id=eq.${f.id}`, { method: 'PATCH', body: JSON.stringify(common), throwOnError: true });
      } else {
        const maxRows = await sbFetch('fin_incomes?select=sheet_row&order=sheet_row.desc.nullslast&limit=1');
        const nextRow = ((Array.isArray(maxRows) && maxRows[0]?.sheet_row) || 0) + 1;
        await sbFetch('fin_incomes', {
          method: 'POST', headers: { Prefer: 'return=minimal' }, throwOnError: true,
          body: JSON.stringify({ sheet_row: nextRow, ...common, facturado: false, organizado_finanzas: false }),
        });
      }
      await sbFetch('rpc/fin_recompute', { method: 'POST', body: '{}', throwOnError: true });
      await sbFetch('rpc/fin_recon_run', { method: 'POST', body: '{}' }).catch(() => {});
      setModal(null); setBusy(false); load();
    } catch { setBusy(false); }
  };

  // Borrar un ingreso (cascade borra sus comisiones y conciliación).
  const deleteModal = async () => {
    const f = modal;
    if (!f || f.mode !== 'edit' || !f.id || busy) return;
    setBusy(true);
    try {
      await sbFetch(`fin_incomes?id=eq.${f.id}`, { method: 'DELETE', throwOnError: true });
      setRows((rs) => (rs || []).filter((r) => r.id !== f.id));
      setModal(null); setBusy(false);
    } catch { setBusy(false); }
  };

  const data = useMemo(() => {
    if (!rows) return null;
    return rows.map((r) => {
      const comm = {}; let ad = 0, reservadoAfi = false;
      (r.fin_commission_entries || []).forEach((e) => {
        const amt = Number(e.amount) || 0;
        if (isAdBudget(e)) { ad += amt; return; }
        if (e.role_key === 'korex') return;
        comm[e.role_key] = (comm[e.role_key] || 0) + amt;
        if (isReservado(e)) reservadoAfi = true;
      });
      const dir = dirMap[r.id] || {};
      return { ...r, comm, ad, reservadoAfi, mes: (r.income_date || '').slice(0, 7), recon: reconMap[r.id], payer_dir_id: dir.payer_dir_id, client_dir_id: dir.client_dir_id };
    });
  }, [rows, dirMap, reconMap]);

  const meses = useMemo(() => (data ? [...new Set(data.map((r) => r.mes).filter(Boolean))].sort().reverse() : []), [data]);
  const cliOpts = useMemo(() => (data ? [...new Set(data.map((r) => r.client_name_sheet).filter(Boolean))].sort() : []), [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const qq = q.trim().toLowerCase();
    return data.filter((r) =>
      (!qq || (r.client_name_sheet || '').toLowerCase().includes(qq) || (r.payer_name || '').toLowerCase().includes(qq) || (r.conector_name_sheet || '').toLowerCase().includes(qq)) &&
      // El chip compara contra el tipo MOSTRADO (effective_type, siempre en mayúsculas);
      // income_type viene del Sheet con mayúsc/minúsc ("Publicidad") y rompía el filtro.
      (!tipo || (r.effective_type || r.income_type || '').toUpperCase() === tipo) && (!mes || r.mes === mes));
  }, [data, q, tipo, mes]);
  // Al cambiar el filtro, volver a la ventana inicial de filas (perf).
  useEffect(() => { setShown(120); }, [q, tipo, mes]);
  const visible = filtered.slice(0, shown);

  const totals = useMemo(() => {
    const t = { eur: 0, usd: 0, net: 0, korex: 0, ad: 0, comm: [0, 0, 0, 0, 0] };
    filtered.forEach((r) => {
      t.eur += Number(r.amount_eur) || 0; t.usd += Number(r.amount_usd) || 0; t.net += Number(r.net_usd) || 0;
      t.korex += Number(r.korex_real) || 0; t.ad += r.ad; COMM_ORDER.forEach((k, i) => (t.comm[i] += r.comm[k] || 0));
    });
    return t;
  }, [filtered]);

  if (error) return <Msg>Error cargando ingresos: {error}</Msg>;
  if (!data) return <Msg>Cargando ingresos…</Msg>;

  const summary = [
    { label: 'Ingreso neto', value: money(totals.net), accent: '#0EA5A4', color: '#0c8584' },
    { label: 'Korex real', value: money(totals.korex), accent: '#16a34a', color: '#15803d' },
    { label: 'Comisiones', value: money(totals.comm.reduce((a, b) => a + b, 0)), accent: '#6366f1', color: '#4338ca' },
    { label: 'Publicidad', value: money(totals.ad), accent: '#f59e0b', color: '#b45309' },
    { label: 'Bruto US$', value: money(totals.usd), accent: '#0ea5e9', color: '#0369a1' },
  ];
  const tipoChips = [['', 'Todos'], ['CRM', 'CRM'], ['PUBLICIDAD', 'Publicidad'], ['SETUP', 'Setup']].map(([v, label]) => {
    const sel = tipo === v; const base = v === 'CRM' ? '#3b82f6' : v === 'PUBLICIDAD' ? '#f59e0b' : v === 'SETUP' ? '#64748b' : '#0EA5A4';
    return { v, label, sel, base };
  });
  const cols = [
    ['Pagador', '#F8FAFC', '#64748B', '1px solid #EEF1F5'], ['Cobró', '#F8FAFC', '#64748B', '1px solid #EEF1F5'], ['Conector', '#F8FAFC', '#64748B', '1px solid #EEF1F5'],
    ['Afiliado', '#F8FAFC', '#64748B', '1px solid #EEF1F5'],
    ['Pago', '#F8FAFC', '#64748B', '1px solid #EEF1F5'], ['Banco', '#F8FAFC', '#64748B', '1px solid #EEF1F5'], ['Tipo', '#F8FAFC', '#64748B', '1px solid #EEF1F5'], ['Efectivo', '#F8FAFC', '#64748B', '2px solid #E2E5EB'],
    ['Fact.', '#F0F9FF', '#0369a1', '1px solid #EEF1F5'], ['Fin.', '#F0F9FF', '#0369a1', '1px solid #EEF1F5'], ['Merc.', '#F0F9FF', '#0369a1', '2px solid #E2E5EB'],
    ['Bruto €', '#F0FDFA', '#0c8584', '1px solid #EEF1F5'], ['Bruto US$', '#F0FDFA', '#0c8584', '1px solid #EEF1F5'], ['Neto US$', '#F0FDFA', '#0c8584', '2px solid #E2E5EB'],
    ['Cliente', '#EEF0FF', ROLE.cliente, '1px solid #EEF1F5'], ['Conector', '#EEF0FF', ROLE.conector, '1px solid #EEF1F5'], ['Afiliado', '#EEF0FF', ROLE.afiliado, '1px solid #EEF1F5'],
    ['Consultor', '#EEF0FF', ROLE.consultor, '1px solid #EEF1F5'], ['Marketing', '#EEF0FF', ROLE.marketing, '2px solid #E2E5EB'],
    ['Saldo', '#FFF7ED', '#c2410c', '1px solid #EEF1F5'], ['Real', '#F0FDF4', '#15803d', 'none'],
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '16px 22px 0' }}>
      {/* summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 12, flexShrink: 0 }}>
        {summary.map((s) => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #E2E5EB', borderLeft: `3px solid ${s.accent}`, borderRadius: 11, padding: '10px 13px' }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8A93A2' }}>{s.label}</div>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', marginTop: 3, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
        <button onClick={() => setModal({ mode: 'new', income_date: todayStr(), income_type: 'CRM', payer_name: '', client_name_sheet: '', conector_name: '', afiliado_name: '', payment_method: PAY_OPTS[0], divisa: 'USD', bruto: '', amount_eur: '', amount_usd: '', net_usd: '', netTouched: false, fx_rate: '', rateTouched: false })}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#fff', border: 0, borderRadius: 9, padding: '8px 13px', cursor: 'pointer', whiteSpace: 'nowrap', background: '#0EA5A4' }}>
          <Plus /> Nuevo ingreso
        </button>
        <Search value={q} onChange={setQ} placeholder="Buscar cliente, pagador o conector…" width={268} />
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          {tipoChips.map((c) => (
            <button key={c.v} onClick={() => setTipo(c.v)} style={{ border: `1px solid ${c.sel ? c.base : '#E2E5EB'}`, background: c.sel ? c.base : '#fff', color: c.sel ? '#fff' : '#475569', fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 20, cursor: 'pointer' }}>{c.label}</button>
          ))}
        </div>
        <select value={mes} onChange={(e) => setMes(e.target.value)} style={ctrlSel}>
          <option value="">Todos los meses</option>
          {meses.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#9AA4B2' }}>mostrando <b style={{ color: '#3B4453' }}>{Math.min(visible.length, filtered.length)}</b>{filtered.length > visible.length ? ` de ${filtered.length}` : ''} · {data.length} total</span>
      </div>

      {/* hover por CSS (sin re-render de toda la tabla) */}
      <style>{`.fin-ing tbody tr:hover td{background:#F6FBFB}.fin-ing tbody tr:hover td.fin-stick{background:#F6FBFB!important}`}</style>
      {/* table */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, boxShadow: '0 1px 3px rgba(13,17,23,.04)' }}>
        <table className="fin-ing" style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content', minWidth: '100%', fontSize: 12, whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              <th colSpan={2} style={{ position: 'sticky', left: 0, top: 0, zIndex: 6, background: '#F4FBFB', borderBottom: '1px solid #E2E5EB', borderRight: '1px solid #E2E5EB', textAlign: 'left', padding: '8px 12px', ...grpTh, color: '#0c8584' }}>Venta</th>
              <th colSpan={8} style={{ ...grpStick, background: '#F8FAFC', ...grpTh, color: '#64748B', borderRight: '2px solid #E2E5EB' }}>Detalle</th>
              <th colSpan={3} style={{ ...grpStick, background: '#F0F9FF', ...grpTh, color: '#0369a1', textAlign: 'center', borderRight: '2px solid #E2E5EB' }}>Estado</th>
              <th colSpan={3} style={{ ...grpStick, background: '#F0FDFA', ...grpTh, color: '#0c8584', borderRight: '2px solid #E2E5EB' }}>Montos</th>
              <th colSpan={5} style={{ ...grpStick, background: '#EEF0FF', ...grpTh, color: '#4f46e5', textAlign: 'center', borderRight: '2px solid #E2E5EB' }}>Comisiones a repartir</th>
              <th style={{ ...grpStick, background: '#FFF7ED', ...grpTh, color: '#c2410c', borderRight: '1px solid #E2E5EB' }}>Publi</th>
              <th style={{ ...grpStick, background: '#F0FDF4', ...grpTh, color: '#15803d' }}>Korex</th>
            </tr>
            <tr>
              <th style={{ position: 'sticky', left: 0, top: 33, zIndex: 6, background: '#F4FBFB', borderBottom: '1px solid #E2E5EB', textAlign: 'left', padding: '7px 12px', fontWeight: 600, color: '#64748B' }}>Fecha</th>
              <th style={{ position: 'sticky', left: 96, top: 33, zIndex: 6, background: '#F4FBFB', borderBottom: '1px solid #E2E5EB', borderRight: '1px solid #E2E5EB', textAlign: 'left', padding: '7px 12px', fontWeight: 600, color: '#64748B', boxShadow: '2px 0 4px -2px rgba(13,17,23,.12)' }}>Cliente</th>
              {cols.map(([label, bg, fg, br], i) => (
                <th key={i} style={{ position: 'sticky', top: 33, zIndex: 3, background: bg, borderBottom: '1px solid #E2E5EB', borderRight: br, textAlign: (i >= 8 && i <= 10) ? 'center' : 'left', padding: '7px 10px', fontWeight: 600, color: fg }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const [pago, pbg, pfg] = pagoChip(r.payment_method);
              const banco = bancoVisual(r.recon, r.payment_method);
              return (
                <tr key={r.id}>
                  <td className="fin-stick" style={{ position: 'sticky', left: 0, zIndex: 2, background: '#fff', borderBottom: '1px solid #EEF1F5', borderRight: '1px solid #F4F6F9', padding: 0, color: '#64748B' }}>
                    <div style={{ borderLeft: `3px solid ${TYPE_RAIL[r.effective_type] || '#cbd5e1'}`, padding: '8px 10px 8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span>{fdate(r.income_date)}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {r.collected_by !== 'Cliente' && (
                          <button onClick={() => setFactura(r)} title={r.facturado ? `Factura ${r.invoices?.number || 'emitida'} — ver / reimprimir / reenviar` : 'Generar factura'} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: r.facturado ? '#16a34a' : '#B6BFCC', padding: 0, display: 'flex' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></svg>
                          </button>
                        )}
                        {r.invoices?.pdf_url && (
                          <a href={r.invoices.pdf_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title={`Factura ${r.invoices.number || ''} — abrir PDF en Drive`} style={{ display: 'flex', color: '#0EA5A4' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
                          </a>
                        )}
                        <button onClick={() => openEdit(r)} title="Editar ingreso" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#B6BFCC', padding: 0, display: 'flex' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                        </button>
                      </span>
                    </div>
                  </td>
                  <td className="fin-stick" style={{ position: 'sticky', left: 96, zIndex: 2, background: '#fff', borderBottom: '1px solid #EEF1F5', borderRight: '1px solid #E2E5EB', padding: '8px 12px', fontWeight: 600, boxShadow: '2px 0 4px -2px rgba(13,17,23,.07)' }}>
                    <Clickable name={r.client_name_sheet} id={r.client_dir_id} onOpen={setOpenId} dashed />
                  </td>
                  <Td><Clickable name={r.payer_name} id={r.payer_dir_id} onOpen={setOpenId} dashed muted /></Td>
                  <Td><Chip bg={r.collected_by === 'Cliente' ? '#ffedd5' : '#f1f5f9'} fg={r.collected_by === 'Cliente' ? '#c2410c' : '#64748B'} round>{r.collected_by || 'Korex'}</Chip></Td>
                  <Td muted>{r.conector_name_sheet || '—'}</Td>
                  <Td muted>{r.afiliado_name || '—'}</Td>
                  <Td><Chip bg={pbg} fg={pfg}>{pago}</Chip></Td>
                  <Td center>{banco.link
                    ? <a href={banco.link} target="_blank" rel="noopener noreferrer" title={banco.title} style={{ display: 'inline-flex', cursor: 'pointer' }}><BancoIcon color={banco.color} /></a>
                    : <span title={banco.title} style={{ display: 'inline-flex', cursor: 'default' }}><BancoIcon color={banco.color} /></span>}</Td>
                  <Td><Chip bg={TYPE_BG[(r.income_type || '').toUpperCase()] || '#f1f5f9'} fg={TYPE_FG[(r.income_type || '').toUpperCase()] || '#64748B'}>{typeLabel(r.income_type)}</Chip></Td>
                  <Td br2><Chip bg={TYPE_BG[r.effective_type] || '#f1f5f9'} fg={TYPE_FG[r.effective_type] || '#64748B'}>{typeLabel(r.effective_type)}</Chip></Td>
                  <Td center><Dot on={r.facturado} title={`Facturado: ${r.facturado ? 'sí' : 'no'}`} onClick={() => patchIncome(r.id, { facturado: !r.facturado })} /></Td>
                  <Td center><Dot on={r.organizado_finanzas} title={`Organizado en finanzas: ${r.organizado_finanzas ? 'sí' : 'no'}`} onClick={() => patchIncome(r.id, { organizado_finanzas: !r.organizado_finanzas })} /></Td>
                  <Td center br2><Dot on={r.llego_mercury} title={`Llegó a Mercury: ${r.llego_mercury ? 'sí' : 'no'}`} onClick={() => patchIncome(r.id, { llego_mercury: !r.llego_mercury })} /></Td>
                  <Td muted>{money2(r.amount_eur, '€')}</Td>
                  <Td muted>{money(r.amount_usd)}</Td>
                  <Td br2 bold>{money(r.net_usd)}{feePct(r.amount_usd, r.net_usd) != null && <span style={{ fontWeight: 500, color: '#AEB7C4', fontSize: 10, marginLeft: 3 }}>−{feePct(r.amount_usd, r.net_usd).toFixed(1)}%</span>}</Td>
                  {COMM_ORDER.map((k) => {
                    const amt = r.comm[k] || 0; const reserved = k === 'afiliado' && r.reservadoAfi;
                    return <td key={k} style={{ padding: '8px 10px', borderBottom: '1px solid #EEF1F5', borderRight: '1px solid #F4F6F9', textAlign: 'left', background: '#FAFAFE' }}>
                      {amt ? <span style={{ color: reserved ? '#b45309' : '#1e293b', fontWeight: 600 }}>{money(amt)}<span style={{ color: '#AEB7C4', fontSize: 9.5, marginLeft: 2 }}>{Math.round(amt / (r.net_usd || 1) * 100)}%{reserved ? ' *' : ''}</span></span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>;
                  })}
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF1F5', borderRight: '1px solid #EEF1F5', textAlign: 'left', color: '#c2410c', background: '#FFFBF5' }}>{money(r.ad)}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #EEF1F5', textAlign: 'left', fontWeight: 800, color: '#15803d', background: '#F6FEF9' }}>{money(r.korex_real)}</td>
                </tr>
              );
            })}
            {filtered.length > visible.length && (
              <tr>
                <td colSpan={23} style={{ padding: '10px 12px', textAlign: 'center', background: '#fff', borderBottom: '1px solid #EEF1F5' }}>
                  <button onClick={() => setShown((n) => n + 300)} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#0c8584', fontSize: 12.5, fontWeight: 600, padding: '7px 16px', borderRadius: 9, cursor: 'pointer' }}>
                    Mostrar más · faltan {filtered.length - visible.length}
                  </button>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 800, fontSize: 11.5 }}>
              <td colSpan={2} style={{ position: 'sticky', left: 0, bottom: 0, zIndex: 5, background: '#F1F5F9', borderTop: '2px solid #CBD5E1', padding: '10px 12px' }}>TOTAL · {filtered.length}</td>
              <td colSpan={11} style={{ position: 'sticky', bottom: 0, zIndex: 3, background: '#F1F5F9', borderTop: '2px solid #CBD5E1', borderRight: '2px solid #E2E5EB' }} />
              <Foot>{money2(totals.eur, '€')}</Foot>
              <Foot>{money(totals.usd)}</Foot>
              <Foot br2>{money(totals.net)}</Foot>
              {totals.comm.map((c, i) => <Foot key={i} bg="#EEF0FF">{money(c)}</Foot>)}
              <Foot bg="#FFF7ED" color="#c2410c">{money(totals.ad)}</Foot>
              <Foot bg="#F0FDF4" color="#15803d">{money(totals.korex)}</Foot>
            </tr>
          </tfoot>
        </table>
      </div>
      <div style={{ height: 14, flexShrink: 0 }} />

      {modal && <IngresoModal form={modal} setForm={setModal} cliOpts={cliOpts} dir={dir} conByClient={conByClient} onSave={saveModal} onDelete={deleteModal} busy={busy} onClose={() => setModal(null)} />}
      {factura && <FacturaModal income={factura} onClose={() => { setFactura(null); load(); }} onDone={(id) => setRows((rs) => (rs || []).map((r) => (r.id === id ? { ...r, facturado: true } : r)))} />}
      {openId && <PersonDrawer personId={openId} onClose={() => setOpenId(null)} onOpenPerson={setOpenId} />}
    </div>
  );
}

/* ---------- modal de alta/edición (6 campos; el resto automático) ---------- */
function IngresoModal({ form, setForm, cliOpts, dir, conByClient, onSave, onDelete, busy, onClose }) {
  const [rate, setRate] = useState(null);   // cotización EUR → USD (en vivo)
  const [adv, setAdv] = useState(false);     // ajustar cliente/conector
  const [confirmDel, setConfirmDel] = useState(false);
  const isEdit = form.mode === 'edit';
  const RATE = rate || 1.08;                 // fallback si no carga la cotización
  const isStripe = isStripeMethod(form.payment_method);
  const collected = collectedFromMethod(form.payment_method);
  const merc = autoMercury(form.payment_method, collected);
  const r2 = (n) => Math.round(n * 100) / 100;

  useEffect(() => {
    let alive = true;
    fetch('https://api.frankfurter.app/latest?from=EUR&to=USD')
      .then((r) => r.json()).then((d) => { if (alive && d?.rates?.USD) setRate(d.rates.USD); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Recalcula ambos montos (USD/EUR) y el neto según divisa + bruto + método.
  const recompute = (s, rtFallback) => {
    const rt = num(s.fx_rate) || rtFallback;   // tipo de cambio editable; si no, el del momento
    const b = num(s.bruto);
    let usd = '', eur = '';
    if (b != null) {
      if (s.divisa === 'USD') { usd = b; eur = r2(b / rt); }
      else { eur = b; usd = r2(b * rt); }
    }
    const usdStr = usd === '' ? '' : String(usd);
    // Mercury/USDT no tienen comisión → neto = bruto USD. Stripe: si no tocaron el neto a mano,
    // baseline = bruto − fee (4,5%); el lookup de Stripe lo refina solo si hay un cargo cercano.
    const net = isStripeMethod(s.payment_method)
      ? (s.netTouched ? s.net_usd : (usd === '' ? '' : String(r2(usd * (1 - STRIPE_FEE)))))
      : usdStr;
    return { ...s, amount_usd: usdStr, amount_eur: eur === '' ? '' : String(eur), net_usd: net };
  };
  const setBruto = (v) => setForm((s) => recompute({ ...s, bruto: v }, RATE));
  const setDivisa = (d) => setForm((s) => recompute({ ...s, divisa: d }, RATE));
  const setMethod = (m) => setForm((s) => recompute({ ...s, payment_method: m }, RATE));
  const setFxRate = (v) => setForm((s) => recompute({ ...s, fx_rate: v, rateTouched: true }, RATE));
  // La cotización en vivo llena el tipo de cambio por defecto (salvo que se haya editado a mano).
  useEffect(() => { if (rate) setForm((s) => (s.rateTouched ? s : recompute({ ...s, fx_rate: String(rate) }, rate))); }, [rate]); // eslint-disable-line

  // Pagador → autocompleta cliente (cliente_padre) y conector (acuerdo del cliente).
  const pickPayer = (p) => setForm((s) => ({
    ...s, payer_name: p.nombre,
    client_name_sheet: p.cliente_padre || (p.tipo === 'Cliente' ? p.nombre : s.client_name_sheet),
    conector_name: conByClient[(p.cliente_padre || p.nombre || '').trim().toLowerCase()] || '',
    // El afiliado SIEMPRE sale de la Base de datos del usuario (no se edita por venta).
    afiliado_name: (p.tipo !== 'Cliente' && (p.conector_e || '').trim()) || '',
  }));

  // Stripe: refina el neto con el cargo REAL de Stripe, pero SOLO si hay un cargo cercano
  // al bruto (±12%). Si no, deja el baseline (bruto − fee). No pisa el neto si lo tocaron a mano.
  useEffect(() => {
    if (!isStripe || !form.payer_name || !num(form.amount_usd) || form.netTouched) return;
    let alive = true;
    const enc = encodeURIComponent(form.payer_name.trim());
    sbFetch(`stripe_charges?customer_name=ilike.${enc}&paid=eq.true&select=gross_usd,net_usd&order=created_at.desc&limit=10`)
      .then((cs) => {
        if (!alive || !Array.isArray(cs) || !cs.length) return;
        const target = num(form.amount_usd);
        const best = cs.map((c) => ({ g: Number(c.gross_usd) || null, n: c.net_usd != null ? Number(c.net_usd) : null }))
          .filter((x) => x.g && Math.abs(x.g - target) / target <= 0.12)   // solo cargos cercanos al bruto
          .sort((a, b) => Math.abs(a.g - target) - Math.abs(b.g - target))[0];
        const v = best ? (best.n != null ? best.n : best.g) : null;
        if (v != null) setForm((s) => (s.netTouched ? s : { ...s, net_usd: String(r2(v)) }));
      }).catch(() => {});
    return () => { alive = false; };
  }, [isStripe, form.payer_name, form.amount_usd, form.netTouched]); // eslint-disable-line

  const otherCur = form.divisa === 'USD'
    ? (form.amount_eur ? `≈ € ${form.amount_eur}` : '')
    : (form.amount_usd ? `≈ US$ ${form.amount_usd}` : '');
  const ok = form.client_name_sheet.trim() && (form.payer_name || '').trim() && num(form.net_usd) != null;
  const lab = { fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5 };
  const inp = { width: '100%', border: '1px solid #E2E5EB', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,17,23,.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 540, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(13,17,23,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #EEF1F5' }}>
          <div><div style={{ fontSize: 16, fontWeight: 800 }}>{isEdit ? 'Editar ingreso' : 'Nuevo ingreso'}</div><div style={{ fontSize: 12, color: '#9AA4B2', marginTop: 2 }}>Cargá lo básico; cliente, conector, conversión y neto se completan solos.</div></div>
          <button onClick={onClose} style={{ border: 0, background: '#F1F5F9', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: '#64748B', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><label style={lab}>Fecha</label><input type="date" value={form.income_date} onChange={(e) => setForm((s) => ({ ...s, income_date: e.target.value }))} style={inp} /></div>
          <div><label style={lab}>Tipo</label><select value={form.income_type} onChange={(e) => setForm((s) => ({ ...s, income_type: e.target.value }))} style={inp}>{TIPO_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lab}>Afiliado <span style={{ color: '#9AA4B2', fontWeight: 400 }}>· sale de la Base de datos del usuario · cobra comisión de Afiliados (solo CRM)</span></label>
            <input value={form.afiliado_name || '—'} readOnly title="Para cambiarlo, editá el afiliado del usuario en Base de datos" style={{ ...inp, background: '#F8FAFC', color: form.afiliado_name ? '#475569' : '#9AA4B2', cursor: 'not-allowed' }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lab}>Pagador <span style={{ color: '#e11d48' }}>*</span> <span style={{ color: '#9AA4B2', fontWeight: 400 }}>· del directorio</span></label>
            <PayerSelect value={form.payer_name} dir={dir} inp={inp} onPick={pickPayer} onType={(v) => setForm((s) => ({ ...s, payer_name: v }))} />
            <div style={{ marginTop: 7, fontSize: 11.5, color: '#6B7585', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>Cliente: <b style={{ color: form.client_name_sheet ? '#0c8584' : '#cbd5e1' }}>{form.client_name_sheet || 'sin asignar'}</b></span>
              <span>· Conector: <b style={{ color: form.conector_name ? '#0c8584' : '#cbd5e1' }}>{form.conector_name || '—'}</b></span>
              <button type="button" onClick={() => setAdv((a) => !a)} style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: '#0EA5A4', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>{adv ? 'listo' : 'ajustar'}</button>
            </div>
            {adv && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                <div><label style={lab}>Cliente <span style={{ color: '#e11d48' }}>*</span></label><input list="modal-cli-dl" value={form.client_name_sheet} onChange={(e) => setForm((s) => ({ ...s, client_name_sheet: e.target.value }))} placeholder="cliente del acuerdo" style={inp} /><datalist id="modal-cli-dl">{cliOpts.map((c) => <option key={c} value={c} />)}</datalist></div>
                <div><label style={lab}>Conector</label><input value={form.conector_name} onChange={(e) => setForm((s) => ({ ...s, conector_name: e.target.value }))} placeholder="(opcional)" style={inp} /></div>
              </div>
            )}
          </div>
          <div>
            <label style={lab}>Divisa</label>
            <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 8, padding: 3 }}>
              {['USD', 'EUR'].map((c) => (
                <button key={c} type="button" onClick={() => setDivisa(c)} style={{ flex: 1, border: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: form.divisa === c ? 700 : 500, padding: '7px 0', borderRadius: 6, background: form.divisa === c ? '#fff' : 'transparent', color: form.divisa === c ? '#0c8584' : '#64748B', boxShadow: form.divisa === c ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>{c}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={lab}>Monto bruto <span style={{ color: '#e11d48' }}>*</span></label>
            <input inputMode="decimal" value={form.bruto} onChange={(e) => setBruto(e.target.value)} placeholder="0" style={inp} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 10.5, color: '#9AA4B2', flexWrap: 'wrap' }}>
              <span>Cambio EUR→USD</span>
              <input inputMode="decimal" value={form.fx_rate} onChange={(e) => setFxRate(e.target.value)} placeholder={RATE.toFixed(4)} title="Tipo de cambio del momento; editable como el neto" style={{ width: 72, border: '1px solid #99E6E3', background: '#F0FDFA', borderRadius: 6, padding: '3px 7px', fontSize: 11, fontWeight: 700, color: '#0c8584', outline: 'none' }} />
              <span style={{ color: form.rateTouched ? '#b45309' : '#16a34a', fontWeight: 600 }}>{form.rateTouched ? 'editado' : 'en vivo'}</span>
              {otherCur && <span style={{ color: '#cbd5e1' }}>· {otherCur}</span>}
            </div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lab}>Cobro <span style={{ color: '#9AA4B2', fontWeight: 400 }}>· cómo entró el dinero</span></label><select value={form.payment_method} onChange={(e) => setMethod(e.target.value)} style={inp}>{PAY_OPTS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
          {isStripe ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lab}>Neto US$ <span style={{ color: '#9AA4B2', fontWeight: 400 }}>· lo que llegó de Stripe (descuenta comisión)</span></label>
              <input inputMode="decimal" value={form.net_usd} onChange={(e) => setForm((s) => ({ ...s, net_usd: e.target.value, netTouched: true }))} placeholder="baseline = bruto − 4,5%; ajustá si hace falta" style={{ ...inp, border: '1px solid #99E6E3', background: '#F0FDFA' }} />
            </div>
          ) : (
            <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: '#6B7585' }}>Neto US$: <b style={{ color: '#0c8584' }}>{form.net_usd ? `$ ${form.net_usd}` : '—'}</b> <span style={{ color: '#9AA4B2' }}>· sin comisión (= bruto)</span></div>
          )}
        </div>
        <div style={{ padding: '0 22px 6px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: '#6B7585', alignItems: 'center' }}>
          <span>Cobró: <b style={{ color: collected === 'Cliente' ? '#c2410c' : '#0c8584' }}>{collected}</b></span>
          <span>Mercury: <b style={{ color: merc ? '#16a34a' : '#9AA4B2' }}>{merc ? 'sí (auto)' : 'no'}</b></span>
          {!isEdit && <span style={{ color: '#9AA4B2' }}>Se guarda sin facturar.</span>}
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid #EEF1F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 30 }}>
            {isEdit && (confirmDel
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#be123c' }}>¿Borrar ingreso?
                  <button onClick={onDelete} disabled={busy} style={{ border: 0, background: '#e11d48', color: '#fff', fontSize: 12, fontWeight: 700, padding: '6px 11px', borderRadius: 8, cursor: 'pointer' }}>Sí, borrar</button>
                  <button onClick={() => setConfirmDel(false)} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 8, cursor: 'pointer' }}>No</button>
                </span>
              : <button onClick={() => setConfirmDel(true)} title="Eliminar este ingreso" style={{ border: '1px solid #FBC9CF', background: '#fff', color: '#be123c', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 9, cursor: 'pointer' }}>Eliminar</button>
            )}
            {!confirmDel && <span style={{ fontSize: 11.5, color: ok ? '#16a34a' : '#e11d48' }}>{ok ? 'Listo para guardar' : 'Pagador, cliente y monto son obligatorios'}</span>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 9, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={onSave} disabled={!ok || busy} style={{ border: 0, background: '#0EA5A4', color: '#fff', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 9, cursor: 'pointer', opacity: (!ok || busy) ? 0.6 : 1 }}>{busy ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Guardar ingreso')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Desplegable de búsqueda del pagador sobre el directorio (nombre + tipo · cliente).
function PayerSelect({ value, dir, onPick, onType, inp }) {
  const [open, setOpen] = useState(false);
  const [qq, setQq] = useState(value || '');
  useEffect(() => { setQq(value || ''); }, [value]);
  const list = useMemo(() => {
    const s = qq.trim().toLowerCase();
    return (dir || []).filter((p) => !s || (p.nombre || '').toLowerCase().includes(s) || (p.cliente_padre || '').toLowerCase().includes(s)).slice(0, 60);
  }, [qq, dir]);
  return (
    <div style={{ position: 'relative' }}>
      <input value={qq} onChange={(e) => { setQq(e.target.value); onType(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="Buscá la persona que pagó…" style={inp} />
      {open && (
        <div style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 10, maxHeight: 240, overflowY: 'auto', boxShadow: '0 10px 28px rgba(13,17,23,.16)' }}>
          {list.length === 0 ? <div style={{ padding: '10px 12px', fontSize: 12, color: '#9AA4B2' }}>Sin coincidencias — se usa el nombre escrito.</div>
            : list.map((p, i) => (
              <div key={i} onMouseDown={() => { onPick(p); setOpen(false); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #F4F6F9' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.nombre}</div>
                <div style={{ fontSize: 10.5, color: '#9AA4B2' }}>{p.tipo || '—'}{p.cliente_padre ? ' · ' + p.cliente_padre : ''}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/* ---------- conciliación visual (Banco) ---------- */
function bancoVisual(recon, method) {
  if (recon && recon.source) {
    const isStripe = recon.source === 'stripe';
    const label = isStripe ? 'Stripe' : 'Mercury';
    const color = recon.confidence === 'baja' ? '#f59e0b' : isStripe ? '#6366f1' : '#0ea5e9';
    const title = `${label}: ${recon.who || '—'} · ${recon.dt || ''} · US$ ${Math.round(Number(recon.amount) || 0).toLocaleString('es-AR')}`
      + (recon.confidence === 'baja' ? ' — revisar (solo monto+fecha)' : recon.confidence === 'media' ? ' (coincide neto)' : '')
      + (isStripe && recon.receipt_url ? ' · clic = recibo' : '');
    return { color, title, link: isStripe && recon.receipt_url ? recon.receipt_url : null };
  }
  if (/^\s*(stripe|mercury)/i.test(method || '')) return { color: '#d3d9e2', title: 'No se encontró la transacción en Stripe/Mercury', link: null };
  return { color: '#d3d9e2', title: 'Sin conciliación (cobró cliente / USDT / otro medio)', link: null };
}
const BancoIcon = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
);

/* ---------- bits ---------- */
const grpTh = { borderBottom: '1px solid #E2E5EB', fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' };
const grpStick = { position: 'sticky', top: 0, zIndex: 4, textAlign: 'left', padding: '8px 12px' };
const ctrlSel = { border: '1px solid #E2E5EB', borderRadius: 9, padding: '7px 10px', fontSize: 12.5, background: '#fff', outline: 'none', color: '#3B4453' };
const Plus = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M12 5v14" /></svg>;
const Td = ({ children, center, muted, bold, br2 }) => (
  <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF1F5', borderRight: br2 ? '2px solid #EEF1F5' : '1px solid #F4F6F9', textAlign: center ? 'center' : 'left', color: muted ? '#475569' : undefined, fontWeight: bold ? 700 : undefined }}>{children}</td>
);
const Foot = ({ children, br2, bg, color }) => (
  <td style={{ position: 'sticky', bottom: 0, zIndex: 3, background: bg || '#F1F5F9', borderTop: '2px solid #CBD5E1', borderRight: br2 ? '2px solid #E2E5EB' : undefined, textAlign: 'left', padding: 10, color }}>{children}</td>
);
const Chip = ({ children, bg, fg, round }) => <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: round ? 20 : 6, background: bg, color: fg }}>{children}</span>;
const Dot = ({ on, title, onClick }) => <button type="button" title={title} onClick={onClick} style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: on ? '#16a34a' : '#e2e8f0', border: 0, padding: 0, cursor: 'pointer' }} />;
function Clickable({ name, id, onOpen, dashed, muted }) {
  if (!name) return <span style={{ color: '#9AA4B2' }}>—</span>;
  if (!id) return <span style={{ color: muted ? '#475569' : undefined }}>{name}</span>;
  const bb = dashed ? ('1px dashed ' + (muted ? '#D6DCE4' : '#C4CCD6')) : undefined;
  return <span onClick={() => onOpen(id)} style={{ cursor: 'pointer', borderBottom: bb, color: muted ? '#475569' : undefined }}>{name}</span>;
}
const Msg = ({ children }) => <div style={{ color: '#9AA4B2', textAlign: 'center', padding: '80px 0' }}>{children}</div>;
