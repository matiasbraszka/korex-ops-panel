import { useEffect, useState, useMemo, useCallback, Fragment } from 'react';
import { sbFetch } from '@korex/db';
import PersonDrawer from '../components/PersonDrawer.jsx';
import Combo from '../components/Combo.jsx';
import { Search, Msg } from '../components/bits.jsx';
import { useDirectoryResolver } from '../lib/directory.js';
import { money, ROLE, ROLE_LABEL } from '../lib/format.js';

// Deuda (diseño Claude Design): 5 vistas — Por rol, Afiliados, Cliente→Korex,
// Fondos Mercury y Especiales. Cada una con tarjetas resumen + tabla.
const VIEWS = [['cuadre', 'Cuadre'], ['rol', 'Por rol'], ['afiliado', 'Afiliados'], ['cliente', 'Cliente → Korex'], ['fondos', 'Fondos Mercury'], ['especiales', 'Especiales']];
const ROLES = ['cliente', 'conector', 'consultor', 'marketing', 'afiliado'];
const red = (v) => v > 1 ? '#dc2626' : v < -1 ? '#059669' : '#94a3b8';

// Nombres ÚNICOS para los dos conceptos del afiliado — se usan igual en TODO el
// apartado de Deuda (Cuadre, Por rol, Fondos) para no confundir.
const LBL_AFILIADO = 'Afiliado anotado (a pagar)';
const LBL_RESERVA = 'Reserva sin afiliado asignado';

export default function DeudaPage() {
  const [rol, setRol] = useState(null);
  const [afi, setAfi] = useState(null);
  const [cli, setCli] = useState(null);
  const [esp, setEsp] = useState(null);
  const [fondos, setFondos] = useState(null);
  const [resCom, setResCom] = useState(null);
  const [resPub, setResPub] = useState(null);
  const [cuadreCli, setCuadreCli] = useState(null);
  const [afiCli, setAfiCli] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('cuadre');
  const [q, setQ] = useState('');
  const [hover, setHover] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [roster, setRoster] = useState([]);   // Base de datos: a quién le debemos / quién nos debe
  const resolve = useDirectoryResolver();

  useEffect(() => {
    sbFetch('fin_directory?select=nombre&order=nombre.asc&limit=3000')
      .then((d) => setRoster(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);
  const partyOpts = useMemo(() => [...new Set(
    roster.map((p) => String(p.nombre || '').trim()).filter(Boolean),
  )].sort((a, b) => a.localeCompare(b)), [roster]);

  // Carga (re-ejecutable). Las fuentes son vistas LIVE en Postgres, así que cada
  // fetch trae los números actuales (no hay filtro de fecha que los congele).
  const load = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      sbFetch('fin_deuda_cliente_rol?select=cliente,role_key,generado,reservado,pagado,deuda&limit=3000'),
      sbFetch('fin_deuda_afiliado?select=persona,generado_total,generado_korex,pagado,deuda&order=deuda.desc.nullslast&limit=3000'),
      sbFetch('fin_cliente_debe_korex?select=cliente,debe_korex,transferido,saldo&order=saldo.desc.nullslast&limit=3000'),
      sbFetch('fin_special_debts?select=id,direction,party,amount,currency,reason,detail,notes,debt_date,status,settled_date&order=debt_date.desc.nullslast&limit=200'),
      sbFetch('fin_fondo_vs_deuda?select=cliente,generado,pagado,deuda,reservado,debe_apartar,fondo_comisiones,diff,tiene_fondo&limit=500'),
      sbFetch('fin_resumen_comisiones?select=role_key,generado,reservado,pagado,deuda&limit=20'),
      sbFetch('fin_resumen_publicidad?select=fondo,neto,gastado&limit=1'),
      sbFetch('fin_cuadre_cliente?select=k,cliente,com_fondo,com_generado,com_reservado,com_pagado,com_deuda,pub_fondo,pub_neto,pub_gastado&limit=500'),
      sbFetch('fin_deuda_afiliado_cliente?select=cliente,persona,generado,pagado,deuda&order=cliente.asc&limit=5000'),
    ])
      .then(([r, a, c, s, f, rc, rp, cc, ac]) => { setRol(r || []); setAfi(a || []); setCli(c || []); setEsp(s || []); setFondos(f || []); setResCom(rc || []); setResPub((Array.isArray(rp) ? rp[0] : rp) || {}); setCuadreCli(cc || []); setAfiCli(ac || []); setError(''); })
      .catch((e) => setError(String(e)))
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  // Refresca al volver a la pestaña/ventana: los datos quedan siempre frescos
  // sin recargar la página (igual que se arregló el dashboard).
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState !== 'hidden') load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [load]);

  const rolByClient = useMemo(() => {
    if (!rol) return null;
    const map = new Map(); let reservado = 0;
    rol.forEach((r) => {
      const k = r.cliente || '—';
      if (!map.has(k)) map.set(k, { cliente: k, byRole: {}, deuda: 0, gen: 0, pag: 0, reservado: 0 });
      const c = map.get(k); c.byRole[r.role_key] = +r.deuda; c.deuda += +r.deuda; c.gen += +r.generado; c.pag += +r.pagado;
      const res = +r.reservado || 0; c.reservado += res; reservado += res;
    });
    return { list: [...map.values()].sort((a, b) => b.deuda - a.deuda), reservado };
  }, [rol]);

  const vm = useMemo(() => {
    if (view === 'cuadre' || view === 'afiliado' || view === 'especiales') return null; // tienen render propio
    if (!rolByClient || !afi || !cli || !esp || !fondos) return null;
    const qq = q.trim().toLowerCase();

    if (view === 'rol') {
      const list = rolByClient.list.filter((c) => !qq || c.cliente.toLowerCase().includes(qq));
      const t = { gen: 0, pag: 0, deuda: 0, byRole: {} }; ROLES.forEach((r) => (t.byRole[r] = 0));
      list.forEach((c) => { t.gen += c.gen; t.pag += c.pag; t.deuda += c.deuda; ROLES.forEach((r) => (t.byRole[r] += c.byRole[r] || 0)); });
      const resTot = list.reduce((a, c) => a + (+c.reservado || 0), 0);
      return {
        cards: [['Generado a repartir', money(t.gen)], ['Pagado', money(t.pag)], ['Deuda (Korex debe)', money(t.deuda), 'red'], ...(rolByClient.reservado > 1 ? [[LBL_RESERVA, money(rolByClient.reservado), 'amber']] : [])],
        // Afiliado segmentado: la columna del rol afiliado es "Afiliado anotado (a
        // pagar)" y se agrega una columna aparte "Reserva sin afiliado asignado".
        cols: [{ label: 'Cliente' }, ...ROLES.map((r) => ({ label: r === 'afiliado' ? LBL_AFILIADO : ROLE_LABEL[r], color: ROLE[r] })), { label: LBL_RESERVA, color: '#b45309' }, { label: 'Total' }],
        rows: list.map((c) => ({ name: c.cliente, cells: [...ROLES.map((r) => ({ v: money(c.byRole[r] || 0), color: red(c.byRole[r] || 0) })), { v: money(c.reservado || 0), color: '#b45309' }, { v: money(c.deuda), color: c.deuda > 1 ? '#dc2626' : '#94a3b8', bold: true }] })),
        totals: [...ROLES.map((r) => ({ v: money(t.byRole[r]), color: '#dc2626' })), { v: money(resTot), color: '#b45309' }, { v: money(t.deuda), color: '#dc2626' }],
        note: 'Lo que Korex debe pagar a cada rol (Generado − Pagado). "Afiliado anotado (a pagar)" = comisión de un afiliado ya asignado; "Reserva sin afiliado asignado" = comisión apartada que todavía no tiene afiliado. Verde/negativo = pagado de más.', count: list.length,
      };
    }
    if (view === 'afiliado') {
      const list = afi.filter((r) => r.persona && (!qq || r.persona.toLowerCase().includes(qq)));
      const t = list.reduce((a, r) => ({ g: a.g + (+r.generado_korex || 0), p: a.p + (+r.pagado || 0), d: a.d + (+r.deuda || 0) }), { g: 0, p: 0, d: 0 });
      return {
        cards: [['Generado (Korex debe)', money(t.g)], ['Pagado', money(t.p)], ['Deuda a afiliados', money(t.d), 'red']],
        cols: [{ label: 'Afiliado' }, { label: 'Generado' }, { label: 'Pagado' }, { label: 'Deuda' }],
        rows: list.map((r) => ({ name: r.persona, cells: [{ v: money(r.generado_korex) }, { v: money(r.pagado) }, { v: money(r.deuda), color: red(+r.deuda), bold: +r.deuda > 1 }] })),
        totals: [{ v: money(t.g) }, { v: money(t.p) }, { v: money(t.d), color: '#dc2626' }],
        note: 'Cuánto generó en comisiones cada afiliado y cuánto le pagó Korex. Generado = lo que Korex le debe (solo de ingresos que cobró Korex).', count: list.length,
      };
    }
    if (view === 'cliente') {
      const list = cli.filter((r) => (!qq || (r.cliente || '').toLowerCase().includes(qq)) && (Math.abs(+r.debe_korex) > 0.5 || Math.abs(+r.saldo) > 0.5));
      const t = list.reduce((a, r) => ({ debe: a.debe + (+r.debe_korex || 0), tr: a.tr + (+r.transferido || 0), s: a.s + (+r.saldo || 0) }), { debe: 0, tr: 0, s: 0 });
      return {
        cards: [['Deben a Korex', money(t.debe)], ['Ya transfirieron', money(t.tr), 'green'], ['Saldo a cobrar', money(t.s), 'red']],
        cols: [{ label: 'Cliente' }, { label: 'Debe a Korex' }, { label: 'Transferido' }, { label: 'Saldo a cobrar' }],
        rows: list.map((r) => ({ name: r.cliente, cells: [{ v: money(r.debe_korex) }, { v: money(r.transferido), color: '#059669' }, { v: money(r.saldo), color: red(+r.saldo), bold: +r.saldo > 1 }] })),
        totals: [{ v: money(t.debe) }, { v: money(t.tr), color: '#059669' }, { v: money(t.s), color: '#dc2626' }],
        note: 'Ingresos que cobró el cliente en su cuenta: nos debe el % de Korex + conector + consultor + marketing. Transferido = lo que ya nos pasó.', count: list.length,
      };
    }
    if (view === 'fondos') {
      const list = fondos.filter((r) => (!qq || (r.cliente || '').toLowerCase().includes(qq)) && (Math.abs(+r.debe_apartar) > 1 || Math.abs(+r.fondo_comisiones) > 1 || Math.abs(+r.generado) > 1)).sort((a, b) => (+a.diff) - (+b.diff));
      const t = list.reduce((a, r) => ({ gen: a.gen + (+r.generado || 0), pag: a.pag + (+r.pagado || 0), deuda: a.deuda + (+r.deuda || 0), res: a.res + (+r.reservado || 0), debe: a.debe + (+r.debe_apartar || 0), fondo: a.fondo + (+r.fondo_comisiones || 0), diff: a.diff + (+r.diff || 0) }), { gen: 0, pag: 0, deuda: 0, res: 0, debe: 0, fondo: 0, diff: 0 });
      return {
        cards: [['Generado', money(t.gen)], ['Pagado', money(t.pag), 'green'], ['Debe apartar', money(t.debe)], ['En fondos Mercury', money(t.fondo), 'sky'], ['Diferencia total', money(t.diff), t.diff < -1 ? 'red' : 'green']],
        cols: [{ label: 'Cliente' }, { label: 'Generado' }, { label: 'Pagado' }, { label: 'Deuda pend.' }, { label: LBL_RESERVA }, { label: 'Debe apartar' }, { label: 'Fondo Mercury' }, { label: 'Diferencia' }],
        rows: list.map((r) => ({ name: r.cliente, cells: [{ v: money(r.generado) }, { v: money(r.pagado), color: '#059669' }, { v: money(r.deuda) }, { v: money(r.reservado), color: '#b45309' }, { v: money(r.debe_apartar), bold: true }, { v: r.tiene_fondo ? money(r.fondo_comisiones) : 'sin fondo', color: r.tiene_fondo ? '#0369a1' : '#cbd5e1' }, { v: money(r.diff), color: red(+r.diff), bold: true }] })),
        totals: [{ v: money(t.gen) }, { v: money(t.pag), color: '#059669' }, { v: money(t.deuda) }, { v: money(t.res), color: '#b45309' }, { v: money(t.debe) }, { v: money(t.fondo), color: '#0369a1' }, { v: money(t.diff), color: t.diff < -1 ? '#dc2626' : '#059669' }],
        note: 'Foto completa por cliente: lo que generó en comisiones, lo que ya se le pagó, lo que queda pendiente (Deuda = Generado − Pagado), la reserva de afiliado, lo que se debería tener apartado (Debe apartar = Deuda pend. + Reserva) y el saldo real de su cuenta "… Comisiones" en Mercury. Diferencia = Fondo − Debe apartar; rojo/negativo = falta plata en el fondo.', count: list.length,
      };
    }
    // especiales — la pinta Especiales(), acá no se arma nada.
    return null;
  }, [view, q, rolByClient, afi, cli, esp, fondos]);

  if (error) return <Msg>Error cargando deuda: {error}</Msg>;
  const ready = rolByClient && afi && cli && esp && fondos && resCom && resPub && cuadreCli && afiCli;
  if (!ready) return <Msg>Calculando deuda…</Msg>;
  const fondoCom = (fondos || []).reduce((a, r) => a + (+r.fondo_comisiones || 0), 0);

  const cardBg = { red: ['#FFF1F2', '#FBC9CF', '#e11d48', '#be123c'], green: ['#F0FDF4', '#B6E8C5', '#16a34a', '#15803d'], amber: ['#FFFBEB', '#FDE68A', '#b45309', '#b45309'], sky: ['#F0F9FF', '#BAE6FD', '#0369a1', '#0369a1'], plain: ['#fff', '#E2E5EB', '#8A93A2', '#0D1117'] };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '16px 22px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 3, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 10, padding: 3 }}>
          {VIEWS.map(([v, label]) => (
            <button key={v} onClick={() => { setView(v); setQ(''); }} style={{ border: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: view === v ? 700 : 500, padding: '6px 13px', borderRadius: 7, background: view === v ? '#0EA5A4' : 'transparent', color: view === v ? '#fff' : '#475569' }}>{label}</button>
          ))}
        </div>
        <Search value={q} onChange={setQ} placeholder="Buscar…" width={200} />
        <button onClick={load} disabled={refreshing} title="Volver a traer los números actuales"
          style={{ border: '1px solid #E2E5EB', background: '#fff', borderRadius: 9, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, color: refreshing ? '#9AA4B2' : '#0EA5A4', cursor: refreshing ? 'default' : 'pointer' }}>
          {refreshing ? 'Actualizando…' : '↻ Actualizar'}
        </button>
      </div>

      {view === 'cuadre' ? (
        <Cuadre globalCom={resCom} globalPub={resPub} fondoComGlobal={fondoCom} perCliente={cuadreCli} rolRows={rol} />
      ) : view === 'afiliado' ? (
        <AfiliadosCli data={afiCli} q={q} onOpen={setOpenId} resolve={resolve} />
      ) : view === 'especiales' ? (
        <Especiales data={esp} q={q} onOpen={setOpenId} resolve={resolve} partyOpts={partyOpts} reload={load} />
      ) : (
      <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        {vm.cards.map(([label, value, accent], i) => { const [bg, bd, lc, vc] = cardBg[accent || 'plain']; return (
          <div key={i} style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 12, padding: '11px 16px', minWidth: 175 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: lc }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 3, color: vc }}>{value}</div>
          </div>
        ); })}
      </div>

      <div style={{ fontSize: 11.5, color: '#8A93A2', lineHeight: 1.45, marginBottom: 10, flexShrink: 0 }}>{vm.note}</div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, boxShadow: '0 1px 3px rgba(13,17,23,.04)' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 12.5, whiteSpace: 'nowrap' }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748B' }}>
            {vm.cols.map((c, i) => <th key={i} style={{ position: 'sticky', top: 0, background: '#F8FAFC', borderBottom: '1px solid #E2E5EB', padding: '10px 14px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'left', color: c.color || '#64748B' }}>{c.label}</th>)}
          </tr></thead>
          <tbody>
            {vm.rows.map((r, ri) => { const hov = hover === ri; return (
              <tr key={ri} onMouseEnter={() => setHover(ri)} onMouseLeave={() => setHover(null)} style={{ background: hov ? '#F6FBFB' : '#fff' }}>
                <td style={{ padding: '9px 14px', borderBottom: '1px solid #EEF1F5', borderRight: '1px solid #F4F6F9', fontWeight: 600 }}>
                  <Clickable name={r.name} id={resolve(r.name)} onOpen={setOpenId} />
                </td>
                {r.cells.map((c, ci) => <td key={ci} style={{ padding: '9px 14px', borderBottom: '1px solid #EEF1F5', borderRight: '1px solid #F4F6F9', color: c.color, fontWeight: c.bold ? 700 : 400, whiteSpace: 'normal' }}>{c.v}</td>)}
              </tr>
            ); })}
            {!vm.rows.length && <tr><td colSpan={vm.cols.length} style={{ padding: 30, textAlign: 'center', color: '#9AA4B2' }}>Sin datos.</td></tr>}
          </tbody>
          {vm.totals && (
            <tfoot><tr style={{ fontWeight: 800, fontSize: 11.5 }}>
              <td style={foot}>TOTAL · {vm.count}</td>
              {vm.totals.map((c, i) => <td key={i} style={{ ...foot, color: c.color }}>{c.v}</td>)}
            </tr></tfoot>
          )}
        </table>
      </div>
      <div style={{ height: 14, flexShrink: 0 }} />
      </>
      )}

      {openId && <PersonDrawer personId={openId} onClose={() => setOpenId(null)} onOpenPerson={setOpenId} />}
    </div>
  );
}

const foot = { position: 'sticky', bottom: 0, padding: '10px 14px', borderTop: '2px solid #CBD5E1', background: '#F1F5F9', textAlign: 'left' };
function Clickable({ name, id, onOpen }) {
  if (!name) return <span style={{ color: '#9AA4B2' }}>—</span>;
  if (!id) return <span>{name}</span>;
  return <span onClick={() => onOpen(id)} style={{ cursor: 'pointer', borderBottom: '1px dashed #C4CCD6' }}>{name}</span>;
}

/* ---------- Deudas especiales (la ÚNICA vista de Deuda que se edita) ----------
   Las demás vistas son cálculo vivo del motor (deuda = generado − pagado): ahí
   saldar es cargar un pago en Pagos. Estas son obligaciones sueltas cargadas a
   mano — reembolsos, ajustes, transferencias fallidas — así que sí se editan. */
const espMoney = (n, cur) => (cur === 'EUR' ? '€ ' : 'US$ ') + Math.round(Number(n) || 0).toLocaleString('es-AR');
const hoyStr = () => new Date().toISOString().slice(0, 10);
const numD = (x) => { const n = parseFloat(String(x).replace(',', '.')); return isFinite(n) ? n : null; };
// Antigüedad de la deuda, con el mismo criterio de semáforo que Seguimiento de pagos.
const espDias = (iso) => {
  if (!iso) return null;
  return Math.round((Date.now() - new Date(`${iso}T00:00:00`).getTime()) / 86400000);
};

function Especiales({ data, q, onOpen, resolve, partyOpts, reload }) {
  const [modal, setModal] = useState(null);
  const [verSaldadas, setVerSaldadas] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const qq = (q || '').trim().toLowerCase();

  const list = useMemo(() => (data || [])
    .filter((r) => (verSaldadas ? true : r.status !== 'saldada'))
    .filter((r) => !qq || [r.party, r.reason, r.detail, r.notes].some((x) => (x || '').toLowerCase().includes(qq))),
  [data, qq, verSaldadas]);

  // Los totales cuentan SOLO lo pendiente: una deuda saldada ya no se debe.
  const pend = list.filter((r) => r.status !== 'saldada');
  const we = pend.filter((r) => r.direction === 'we_owe').reduce((a, r) => a + (+r.amount || 0), 0);
  const they = pend.filter((r) => r.direction === 'client_owes').reduce((a, r) => a + (+r.amount || 0), 0);
  const nSaldadas = (data || []).filter((r) => r.status === 'saldada').length;

  const toggleSaldada = async (r) => {
    if (busyId) return;
    setBusyId(r.id);
    const saldada = r.status === 'saldada';
    try {
      await sbFetch(`fin_special_debts?id=eq.${r.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, throwOnError: true,
        body: JSON.stringify(saldada ? { status: 'pendiente', settled_date: null } : { status: 'saldada', settled_date: hoyStr() }),
      });
      reload();
    } catch { /* el error ya se ve porque la fila no cambia */ }
    setBusyId(null);
  };

  const card = (label, val, color) => (
    <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 12, padding: '11px 16px', minWidth: 170 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: color || '#8A93A2' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 3, color: color || '#0D1117' }}>{val}</div>
    </div>
  );
  const th = { position: 'sticky', top: 0, background: '#F8FAFC', borderBottom: '1px solid #E2E5EB', padding: '10px 14px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'left' };
  const td = { padding: '9px 14px', borderBottom: '1px solid #EEF1F5', borderRight: '1px solid #F4F6F9' };

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {card('Debemos nosotros', espMoney(we, 'USD'), '#e11d48')}
        {card('Nos deben', espMoney(they, 'USD'), '#0369a1')}
        <button onClick={() => setModal({ mode: 'new', direction: 'we_owe', party: '', amount: '', currency: 'USD', reason: '', detail: '', notes: '', debt_date: hoyStr(), status: 'pendiente' })}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#fff', border: 0, borderRadius: 9, padding: '9px 14px', cursor: 'pointer', background: '#0EA5A4' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M12 5v14" /></svg> Nueva deuda
        </button>
        {nSaldadas > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#64748B', cursor: 'pointer' }}>
            <input type="checkbox" checked={verSaldadas} onChange={(e) => setVerSaldadas(e.target.checked)} style={{ cursor: 'pointer', accentColor: '#0EA5A4' }} />
            Ver saldadas ({nSaldadas})
          </label>
        )}
      </div>

      <div style={{ fontSize: 11.5, color: '#8A93A2', lineHeight: 1.45, marginBottom: 10, flexShrink: 0 }}>
        Deudas especiales/manuales: obligaciones excepcionales fuera del reparto de comisiones — reembolsos, ajustes, transferencias fallidas.
        Los totales cuentan solo las pendientes. Las otras pestañas de Deuda no se editan acá: salen del motor y se saldan registrando un pago en Pagos.
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, boxShadow: '0 1px 3px rgba(13,17,23,.04)' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 12.5, whiteSpace: 'nowrap' }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748B' }}>
            {['A quién / Cliente', 'Fecha', 'Dirección', 'Monto', 'Por qué', 'Notas', 'Estado', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {list.map((r) => {
              const saldada = r.status === 'saldada';
              const dias = espDias(r.debt_date);
              return (
                <tr key={r.id} style={{ background: saldada ? '#F8FAFC' : '#fff', opacity: saldada ? 0.6 : 1 }}>
                  <td style={{ ...td, fontWeight: 600 }}><Clickable name={r.party} id={resolve(r.party)} onOpen={onOpen} /></td>
                  <td style={{ ...td, color: '#64748B' }}>
                    {r.debt_date || <span style={{ color: '#cbd5e1' }}>—</span>}
                    {!saldada && dias != null && dias > 30 && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#b45309' }}>{dias}d</span>}
                  </td>
                  <td style={{ ...td, color: r.direction === 'we_owe' ? '#dc2626' : '#0369a1', fontWeight: 700 }}>{r.direction === 'we_owe' ? 'Debemos' : 'Nos deben'}</td>
                  <td style={{ ...td, fontWeight: 700, color: r.direction === 'we_owe' ? '#dc2626' : '#1e293b', textDecoration: saldada ? 'line-through' : 'none' }}>{espMoney(r.amount, r.currency)}</td>
                  <td style={{ ...td, color: '#475569', whiteSpace: 'normal' }}>{r.reason || '—'}</td>
                  <td style={{ ...td, color: '#94a3b8', whiteSpace: 'normal' }}>{r.notes || '—'}</td>
                  <td style={td}>
                    <button onClick={() => toggleSaldada(r)} disabled={busyId === r.id}
                      title={saldada ? `Saldada el ${r.settled_date || '—'} · clic para reabrir` : 'Marcar como saldada'}
                      style={{ border: `1px solid ${saldada ? '#B6E8C5' : '#E2E5EB'}`, background: saldada ? '#F0FDF4' : '#fff', color: saldada ? '#15803d' : '#64748B', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: busyId === r.id ? 'default' : 'pointer' }}>
                      {busyId === r.id ? '…' : saldada ? `✓ Saldada${r.settled_date ? ` · ${r.settled_date}` : ''}` : 'Pendiente'}
                    </button>
                  </td>
                  <td style={{ ...td, borderRight: 0 }}>
                    <button onClick={() => setModal({ mode: 'edit', ...r, amount: r.amount == null ? '' : String(r.amount), debt_date: r.debt_date || '' })}
                      title="Editar deuda" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#B6BFCC', padding: 0, display: 'flex' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    </button>
                  </td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#9AA4B2' }}>Sin deudas especiales{verSaldadas ? '' : ' pendientes'}.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ height: 14, flexShrink: 0 }} />

      {modal && <EspecialModal form={modal} setForm={setModal} partyOpts={partyOpts} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
    </>
  );
}

function EspecialModal({ form, setForm, partyOpts, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState('');
  const isEdit = form.mode === 'edit';
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const ok = (form.party || '').trim() && numD(form.amount) != null;

  const body = () => JSON.stringify({
    direction: form.direction, party: (form.party || '').trim(),
    amount: numD(form.amount), currency: form.currency || 'USD',
    reason: (form.reason || '').trim() || null, detail: (form.detail || '').trim() || null,
    notes: (form.notes || '').trim() || null,
    debt_date: form.debt_date || null, status: form.status || 'pendiente',
  });

  const save = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr('');
    try {
      if (isEdit) await sbFetch(`fin_special_debts?id=eq.${form.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, throwOnError: true, body: body() });
      else await sbFetch('fin_special_debts', { method: 'POST', headers: { Prefer: 'return=minimal' }, throwOnError: true, body: body() });
      onDone();
    } catch (e) { setErr(String(e)); setBusy(false); }
  };
  const del = async () => {
    if (!isEdit || busy) return;
    setBusy(true); setErr('');
    try {
      await sbFetch(`fin_special_debts?id=eq.${form.id}`, { method: 'DELETE', throwOnError: true });
      onDone();
    } catch (e) { setErr(String(e)); setBusy(false); }
  };

  const lab = { fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5 };
  const inp = { width: '100%', border: '1px solid #E2E5EB', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,17,23,.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 540, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(13,17,23,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #EEF1F5' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{isEdit ? 'Editar deuda especial' : 'Nueva deuda especial'}</div>
            <div style={{ fontSize: 12, color: '#9AA4B2', marginTop: 2 }}>Obligación fuera del reparto de comisiones</div>
          </div>
          <button onClick={onClose} style={{ border: 0, background: '#F1F5F9', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: '#64748B', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><label style={lab}>Fecha de la deuda</label><input type="date" value={form.debt_date || ''} onChange={(e) => set('debt_date', e.target.value)} style={inp} /></div>
          <div>
            <label style={lab}>Dirección</label>
            <select value={form.direction} onChange={(e) => set('direction', e.target.value)} style={inp}>
              <option value="we_owe">Debemos nosotros</option>
              <option value="client_owes">Nos deben</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lab}>A quién / Cliente <span style={{ color: '#e11d48' }}>*</span> <span style={{ color: '#9AA4B2', fontWeight: 400 }}>· de la Base de datos</span></label>
            <Combo value={form.party} onChange={(v) => set('party', v)} options={partyOpts} placeholder="elegir persona…" empty="No está en la base. Agregalo primero." />
          </div>
          <div><label style={lab}>Monto <span style={{ color: '#e11d48' }}>*</span></label><input inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" style={inp} /></div>
          <div>
            <label style={lab}>Divisa</label>
            <select value={form.currency || 'USD'} onChange={(e) => set('currency', e.target.value)} style={inp}><option value="USD">USD</option><option value="EUR">EUR</option></select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lab}>Por qué</label><input value={form.reason || ''} onChange={(e) => set('reason', e.target.value)} placeholder="ej. Reembolso, Transferencia fallida, Ajuste…" style={inp} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lab}>Notas</label><input value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="(opcional)" style={inp} /></div>
          <label style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 12.5, color: '#475569' }}>
            <input type="checkbox" checked={form.status === 'saldada'} onChange={(e) => set('status', e.target.checked ? 'saldada' : 'pendiente')} style={{ cursor: 'pointer', accentColor: '#16a34a' }} />
            Ya está saldada{form.status === 'saldada' && form.settled_date ? ` · ${form.settled_date}` : ''}
          </label>
          {err && <div style={{ gridColumn: '1 / -1', color: '#dc2626', fontSize: 12 }}>Error: {err}</div>}
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid #EEF1F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 30 }}>
            {isEdit && (confirmDel
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#be123c' }}>¿Borrar deuda?
                  <button onClick={del} disabled={busy} style={{ border: 0, background: '#e11d48', color: '#fff', fontSize: 12, fontWeight: 700, padding: '6px 11px', borderRadius: 8, cursor: 'pointer' }}>Sí, borrar</button>
                  <button onClick={() => setConfirmDel(false)} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 8, cursor: 'pointer' }}>No</button>
                </span>
              : <button onClick={() => setConfirmDel(true)} style={{ border: '1px solid #FBC9CF', background: '#fff', color: '#be123c', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 9, cursor: 'pointer' }}>Eliminar</button>
            )}
            {!confirmDel && <span style={{ fontSize: 11.5, color: ok ? '#16a34a' : '#e11d48' }}>{ok ? 'Listo para guardar' : 'Faltan la persona y el monto'}</span>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 9, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={save} disabled={!ok || busy} style={{ border: 0, background: '#0EA5A4', color: '#fff', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 9, cursor: 'pointer', opacity: (!ok || busy) ? 0.6 : 1 }}>{busy ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Guardar deuda')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Afiliados agrupados por cliente ---------- */
const afCellR = (w) => ({ padding: '9px 14px', borderBottom: '1px solid #E6ECF1', borderRight: '1px solid #EEF1F5', textAlign: 'left', fontWeight: w });
const afCellSub = () => ({ padding: '8px 14px', borderBottom: '1px solid #F4F6F9', borderRight: '1px solid #F4F6F9', color: '#64748B' });
function AfiliadosCli({ data, q, onOpen, resolve }) {
  const [hover, setHover] = useState(null);
  const qq = (q || '').trim().toLowerCase();
  const groups = useMemo(() => {
    const m = new Map();
    (data || []).forEach((r) => {
      if (qq && !(`${r.cliente} ${r.persona}`).toLowerCase().includes(qq)) return;
      const k = r.cliente || '—';
      if (!m.has(k)) m.set(k, { cliente: k, gen: 0, pag: 0, deuda: 0, afi: [] });
      const g = m.get(k); g.gen += +r.generado || 0; g.pag += +r.pagado || 0; g.deuda += +r.deuda || 0; g.afi.push(r);
    });
    return [...m.values()].map((g) => ({ ...g, afi: g.afi.slice().sort((a, b) => (+b.deuda) - (+a.deuda)) })).sort((a, b) => b.deuda - a.deuda);
  }, [data, qq]);
  const t = groups.reduce((a, g) => ({ gen: a.gen + g.gen, pag: a.pag + g.pag, deuda: a.deuda + g.deuda }), { gen: 0, pag: 0, deuda: 0 });
  const card = (label, val, color) => (
    <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 12, padding: '11px 16px', minWidth: 160 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: color || '#8A93A2' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 3, color: color || '#0D1117' }}>{val}</div>
    </div>
  );
  const th = { position: 'sticky', top: 0, background: '#F8FAFC', borderBottom: '1px solid #E2E5EB', padding: '10px 14px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'left' };
  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        {card('Generado (Korex debe)', money(t.gen))}
        {card('Pagado', money(t.pag), '#16a34a')}
        {card('Deuda a afiliados', money(t.deuda), '#e11d48')}
      </div>
      <div style={{ fontSize: 11.5, color: '#8A93A2', lineHeight: 1.45, marginBottom: 10, flexShrink: 0 }}>Afiliados agrupados por cliente: cuánto generó cada afiliado (solo de ingresos que cobró Korex), cuánto se le pagó y cuánto se le debe.</div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, boxShadow: '0 1px 3px rgba(13,17,23,.04)' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 12.5, whiteSpace: 'nowrap' }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748B' }}>
            {['Cliente / Afiliado', 'Generado', 'Pagado', 'Deuda'].map((h, i) => <th key={i} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.cliente}>
                <tr style={{ background: '#F6FBFB' }}>
                  <td style={afCellR(700)}>{g.cliente} <span style={{ color: '#9AA4B2', fontWeight: 500 }}>· {g.afi.length}</span></td>
                  <td style={afCellR(700)}>{money(g.gen)}</td>
                  <td style={{ ...afCellR(700), color: '#16a34a' }}>{money(g.pag)}</td>
                  <td style={{ ...afCellR(700), color: g.deuda > 1 ? '#dc2626' : '#94a3b8', borderRight: 0 }}>{money(g.deuda)}</td>
                </tr>
                {g.afi.map((r, i) => { const hk = `${g.cliente}:${i}`; return (
                  <tr key={i} onMouseEnter={() => setHover(hk)} onMouseLeave={() => setHover(null)} style={{ background: hover === hk ? '#F6FBFB' : '#fff' }}>
                    <td style={{ padding: '8px 14px 8px 32px', borderBottom: '1px solid #F4F6F9', borderRight: '1px solid #F4F6F9', color: '#475569' }}><Clickable name={r.persona} id={resolve(r.persona)} onOpen={onOpen} dashed /></td>
                    <td style={afCellSub()}>{money(r.generado)}</td>
                    <td style={{ ...afCellSub(), color: '#16a34a' }}>{money(r.pagado)}</td>
                    <td style={{ ...afCellSub(), color: (+r.deuda) > 1 ? '#dc2626' : '#94a3b8', fontWeight: 600, borderRight: 0 }}>{money(r.deuda)}</td>
                  </tr>
                ); })}
              </Fragment>
            ))}
            {!groups.length && <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: '#9AA4B2' }}>Sin afiliados.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ height: 14, flexShrink: 0 }} />
    </>
  );
}

/* ---------- Cuadre: trazabilidad de fondos por cliente (comisiones + publicidad) ---------- */
function Cuadre({ globalCom, globalPub, fondoComGlobal, perCliente, rolRows }) {
  const [exp, setExp] = useState({});
  const [selCli, setSelCli] = useState('');
  const m = (n) => money(n);
  const ROLES5 = ['conector', 'cliente', 'afiliado', 'consultor', 'marketing'];
  const opts = useMemo(() => [...(perCliente || [])].sort((a, b) => (a.cliente || '').localeCompare(b.cliente || '')), [perCliente]);

  let comRows, fondoCom, pub;
  if (!selCli) {
    comRows = globalCom || []; fondoCom = fondoComGlobal; pub = globalPub || {};
  } else {
    comRows = (rolRows || []).filter((x) => x.cliente === selCli);
    const c = (perCliente || []).find((x) => x.cliente === selCli) || {};
    fondoCom = +c.com_fondo || 0;
    pub = { fondo: +c.pub_fondo || 0, neto: +c.pub_neto || 0, gastado: +c.pub_gastado || 0 };
  }

  const byRole = {}; comRows.forEach((x) => { byRole[x.role_key] = x; });
  const r = (k) => byRole[k] || {};
  const partner = ROLES5.map((k) => byRole[k]).filter(Boolean);
  const S = (f) => partner.reduce((a, x) => a + (+x[f] || 0), 0);
  const generado = S('generado'), reserva = S('reservado'), pagado = S('pagado'), deudaNeta = S('deuda');
  const adeudado = deudaNeta + reserva;
  const dif = fondoCom - adeudado;
  const korexGen = +(byRole.korex || {}).generado || 0;

  const bdGen = [...ROLES5.flatMap((k) => k === 'afiliado'
    ? [{ label: LBL_AFILIADO, value: m(+r(k).generado || 0) },
       { label: LBL_RESERVA, value: m(+r(k).reservado || 0) }]
    : [{ label: ROLE_LABEL[k], value: m(+r(k).generado || 0) }]), ...(byRole.korex ? [{ label: 'Korex', value: m(korexGen), muted: true }] : [])];
  const bdPag = ROLES5.map((k) => ({ label: ROLE_LABEL[k], value: m(+r(k).pagado || 0) }));
  const bdAde = ROLES5.flatMap((k) => k === 'afiliado'
    ? [{ label: LBL_AFILIADO, value: m(+r(k).deuda || 0) },
       { label: LBL_RESERVA, value: m(+r(k).reservado || 0) }]
    : [{ label: ROLE_LABEL[k], value: m(+r(k).deuda || 0) }]);

  const pf = +pub.fondo || 0, pn = +pub.neto || 0, pg = +pub.gastado || 0;
  const deberia = pn - pg, pdif = pf - deberia;

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>Cliente:</span>
        <select value={selCli} onChange={(e) => { setSelCli(e.target.value); setExp({}); }}
          style={{ border: '1px solid #E2E5EB', borderRadius: 9, padding: '8px 12px', fontSize: 13, fontWeight: 600, background: '#fff', minWidth: 260, outline: 'none' }}>
          <option value="">Todos los clientes (total)</option>
          {opts.map((c) => <option key={c.k || c.cliente} value={c.cliente}>{c.cliente}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Panel title="Comisiones" subtitle={selCli ? `Fondo de comisiones de ${selCli} vs lo adeudado a sus partners` : 'Total: lo que debería estar apartado para partners vs los fondos de comisiones'} tint="#0EA5A4">
          <MetricRow label="En el fondo de Mercury (ahora)" value={m(fondoCom)} color="#0369a1" />
          <MetricRow label="Comisiones generadas" value={m(generado + reserva)} kk="g" exp={exp} setExp={setExp} breakdown={bdGen} />
          <MetricRow label={`— de eso, ${LBL_RESERVA}`} value={m(reserva)} muted />
          <MetricRow label="Comisiones pagadas" value={m(pagado)} color="#059669" kk="p" exp={exp} setExp={setExp} breakdown={bdPag} />
          <MetricRow label="Adeudado (debería estar apartado)" value={m(adeudado)} bold kk="a" exp={exp} setExp={setExp} breakdown={bdAde} />
          <MetricRow label="Diferencia (fondo − adeudado)" value={m(dif)} bold color={dif < -1 ? '#dc2626' : '#059669'} hint={dif < -1 ? 'falta plata en el fondo' : 'ok'} />
        </Panel>

        <Panel title="Publicidad" subtitle={selCli ? `Fondo de publicidad de ${selCli}: lo que entró menos lo gastado` : 'Total: lo que entró para ads menos lo gastado debería igualar el fondo'} tint="#b45309">
          <MetricRow label="En el fondo de Mercury (ahora)" value={m(pf)} color="#0369a1" />
          <MetricRow label="Publicidad neta total (entró para ads)" value={m(pn)} />
          <MetricRow label="Publicidad gastada (Meta, real)" value={m(pg)} color="#dc2626" />
          <MetricRow label="Debería quedar (neto − gastado)" value={m(deberia)} bold />
          <MetricRow label="Diferencia (fondo − debería)" value={m(pdif)} bold color={pdif < -1 ? '#dc2626' : pdif > 1 ? '#b45309' : '#059669'} hint={pdif < -1 ? 'fuga: falta plata' : pdif > 1 ? 'hay de más: revisar de dónde salió' : 'cuadra'} />
        </Panel>
      </div>
    </div>
  );
}
function Panel({ title, subtitle, tint, children }) {
  return (
    <div style={{ flex: '1 1 380px', minWidth: 320, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, overflow: 'hidden', boxShadow: '0 1px 3px rgba(13,17,23,.04)' }}>
      <div style={{ padding: '13px 16px', borderBottom: '1px solid #EEF1F5', borderTop: `3px solid ${tint}` }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: '#9AA4B2', marginTop: 2 }}>{subtitle}</div>
      </div>
      {children}
    </div>
  );
}
function MetricRow({ label, value, color, bold, muted, hint, kk, exp, setExp, breakdown }) {
  const open = exp && kk && exp[kk];
  const clickable = !!breakdown;
  return (
    <>
      <div onClick={clickable ? () => setExp((s) => ({ ...s, [kk]: !s[kk] })) : undefined}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: muted ? '5px 16px 5px 26px' : '11px 16px', borderTop: '1px solid #F1F5F9', cursor: clickable ? 'pointer' : 'default' }}>
        <span style={{ fontSize: muted ? 11.5 : 13, fontWeight: bold ? 700 : muted ? 400 : 500, color: muted ? '#9AA4B2' : '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
          {clickable && <span style={{ color: '#94a3b8', fontSize: 9 }}>{open ? '▼' : '▶'}</span>}{label}
        </span>
        <span style={{ fontSize: bold ? 17 : muted ? 12 : 14, fontWeight: bold ? 800 : 600, color: color || (muted ? '#9AA4B2' : '#0D1117'), whiteSpace: 'nowrap' }}>
          {value}{hint && <span style={{ fontSize: 10, fontWeight: 500, color: '#9AA4B2', marginLeft: 6 }}>· {hint}</span>}
        </span>
      </div>
      {clickable && open && (
        <div style={{ background: '#F8FAFC', padding: '6px 16px 8px 34px' }}>
          {breakdown.map((b, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
              <span style={{ color: b.muted ? '#b0b8c4' : '#64748B' }}>{b.label}{b.muted ? ' · va a cuenta principal, no al fondo' : ''}</span>
              <span style={{ fontWeight: 600, color: b.muted ? '#b0b8c4' : '#475569' }}>{b.value}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
