import { useEffect, useState, useMemo } from 'react';
import { sbFetch } from '@korex/db';
import PersonDrawer from '../components/PersonDrawer.jsx';
import { Search, Msg } from '../components/bits.jsx';
import { useDirectoryResolver } from '../lib/directory.js';
import { money, ROLE, ROLE_LABEL } from '../lib/format.js';

// Deuda (diseño Claude Design): 5 vistas — Por rol, Afiliados, Cliente→Korex,
// Fondos Mercury y Especiales. Cada una con tarjetas resumen + tabla.
const VIEWS = [['rol', 'Por rol'], ['afiliado', 'Afiliados'], ['cliente', 'Cliente → Korex'], ['fondos', 'Fondos Mercury'], ['especiales', 'Especiales']];
const ROLES = ['cliente', 'conector', 'consultor', 'marketing', 'afiliado'];
const red = (v) => v > 1 ? '#dc2626' : v < -1 ? '#059669' : '#94a3b8';

export default function DeudaPage() {
  const [rol, setRol] = useState(null);
  const [afi, setAfi] = useState(null);
  const [cli, setCli] = useState(null);
  const [esp, setEsp] = useState(null);
  const [fondos, setFondos] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('rol');
  const [q, setQ] = useState('');
  const [hover, setHover] = useState(null);
  const [openId, setOpenId] = useState(null);
  const resolve = useDirectoryResolver();

  useEffect(() => {
    Promise.all([
      sbFetch('fin_deuda_cliente_rol?select=cliente,role_key,generado,reservado,pagado,deuda&limit=3000'),
      sbFetch('fin_deuda_afiliado?select=persona,generado_total,generado_korex,pagado,deuda&order=deuda.desc.nullslast&limit=3000'),
      sbFetch('fin_cliente_debe_korex?select=cliente,debe_korex,transferido,saldo&order=saldo.desc.nullslast&limit=3000'),
      sbFetch('fin_special_debts?select=direction,party,amount,currency,reason,detail,notes&order=amount.desc.nullslast&limit=200'),
      sbFetch('fin_fondo_vs_deuda?select=cliente,generado,pagado,deuda,reservado,debe_apartar,fondo_comisiones,diff,tiene_fondo&limit=500'),
    ])
      .then(([r, a, c, s, f]) => { setRol(r || []); setAfi(a || []); setCli(c || []); setEsp(s || []); setFondos(f || []); })
      .catch((e) => setError(String(e)));
  }, []);

  const rolByClient = useMemo(() => {
    if (!rol) return null;
    const map = new Map(); let reservado = 0;
    rol.forEach((r) => {
      const k = r.cliente || '—';
      if (!map.has(k)) map.set(k, { cliente: k, byRole: {}, deuda: 0, gen: 0, pag: 0 });
      const c = map.get(k); c.byRole[r.role_key] = +r.deuda; c.deuda += +r.deuda; c.gen += +r.generado; c.pag += +r.pagado; reservado += +r.reservado || 0;
    });
    return { list: [...map.values()].sort((a, b) => b.deuda - a.deuda), reservado };
  }, [rol]);

  const vm = useMemo(() => {
    if (!rolByClient || !afi || !cli || !esp || !fondos) return null;
    const qq = q.trim().toLowerCase();
    const m = (n, cur) => (cur === 'EUR' ? '€ ' : 'US$ ') + Math.round(Number(n) || 0).toLocaleString('es-AR');

    if (view === 'rol') {
      const list = rolByClient.list.filter((c) => !qq || c.cliente.toLowerCase().includes(qq));
      const t = { gen: 0, pag: 0, deuda: 0, byRole: {} }; ROLES.forEach((r) => (t.byRole[r] = 0));
      list.forEach((c) => { t.gen += c.gen; t.pag += c.pag; t.deuda += c.deuda; ROLES.forEach((r) => (t.byRole[r] += c.byRole[r] || 0)); });
      return {
        cards: [['Generado a repartir', money(t.gen)], ['Pagado', money(t.pag)], ['Deuda (Korex debe)', money(t.deuda), 'red'], ...(rolByClient.reservado > 1 ? [['Reservado afiliado', money(rolByClient.reservado), 'amber']] : [])],
        cols: [{ label: 'Cliente' }, ...ROLES.map((r) => ({ label: ROLE_LABEL[r], color: ROLE[r] })), { label: 'Total' }],
        rows: list.map((c) => ({ name: c.cliente, cells: [...ROLES.map((r) => ({ v: money(c.byRole[r] || 0), color: red(c.byRole[r] || 0) })), { v: money(c.deuda), color: c.deuda > 1 ? '#dc2626' : '#94a3b8', bold: true }] })),
        totals: [...ROLES.map((r) => ({ v: money(t.byRole[r]), color: '#dc2626' })), { v: money(t.deuda), color: '#dc2626' }],
        note: 'Lo que Korex debe pagar a cada rol (Generado − Pagado). Si cobró el cliente, eso va en Cliente → Korex. Verde/negativo = pagado de más.', count: list.length,
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
        cols: [{ label: 'Cliente' }, { label: 'Generado' }, { label: 'Pagado' }, { label: 'Deuda pend.' }, { label: 'Reserva afi.' }, { label: 'Debe apartar' }, { label: 'Fondo Mercury' }, { label: 'Diferencia' }],
        rows: list.map((r) => ({ name: r.cliente, cells: [{ v: money(r.generado) }, { v: money(r.pagado), color: '#059669' }, { v: money(r.deuda) }, { v: money(r.reservado), color: '#b45309' }, { v: money(r.debe_apartar), bold: true }, { v: r.tiene_fondo ? money(r.fondo_comisiones) : 'sin fondo', color: r.tiene_fondo ? '#0369a1' : '#cbd5e1' }, { v: money(r.diff), color: red(+r.diff), bold: true }] })),
        totals: [{ v: money(t.gen) }, { v: money(t.pag), color: '#059669' }, { v: money(t.deuda) }, { v: money(t.res), color: '#b45309' }, { v: money(t.debe) }, { v: money(t.fondo), color: '#0369a1' }, { v: money(t.diff), color: t.diff < -1 ? '#dc2626' : '#059669' }],
        note: 'Foto completa por cliente: lo que generó en comisiones, lo que ya se le pagó, lo que queda pendiente (Deuda = Generado − Pagado), la reserva de afiliado, lo que se debería tener apartado (Debe apartar = Deuda pend. + Reserva) y el saldo real de su cuenta "… Comisiones" en Mercury. Diferencia = Fondo − Debe apartar; rojo/negativo = falta plata en el fondo.', count: list.length,
      };
    }
    // especiales
    const list = esp.filter((r) => !qq || [r.party, r.reason, r.detail, r.notes].some((x) => (x || '').toLowerCase().includes(qq)));
    const we = list.filter((r) => r.direction === 'we_owe').reduce((a, r) => a + (+r.amount || 0), 0);
    const they = list.filter((r) => r.direction === 'client_owes').reduce((a, r) => a + (+r.amount || 0), 0);
    return {
      cards: [['Debemos nosotros', money(we), 'red'], ['Nos deben clientes', money(they)]],
      cols: [{ label: 'A quién / Cliente' }, { label: 'Dirección' }, { label: 'Monto' }, { label: 'Por qué' }, { label: 'Notas' }],
      rows: list.map((r) => ({ name: r.party, cells: [{ v: r.direction === 'we_owe' ? 'Debemos' : 'Nos deben', color: r.direction === 'we_owe' ? '#dc2626' : '#0369a1', bold: true }, { v: m(r.amount, r.currency), color: r.direction === 'we_owe' ? '#dc2626' : '#1e293b', bold: true }, { v: r.reason || '—', color: '#475569' }, { v: r.notes || '—', color: '#94a3b8' }] })),
      totals: null,
      note: 'Deudas especiales/manuales: obligaciones excepcionales fuera del reparto de comisiones — reembolsos, ajustes, transferencias fallidas.', count: list.length,
    };
  }, [view, q, rolByClient, afi, cli, esp, fondos]);

  if (error) return <Msg>Error cargando deuda: {error}</Msg>;
  if (!vm) return <Msg>Calculando deuda…</Msg>;

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
      </div>

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
