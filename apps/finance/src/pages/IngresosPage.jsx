import { useEffect, useState, useMemo } from 'react';
import { sbFetch } from '@korex/db';

// Roles que cobran comisión (lo "a repartir"). El cliente cobra comisión solo en CRM;
// el saldo de publicidad NO es comisión (es plata del cliente para ads) y se muestra aparte.
const COMM_ROLES = [
  { key: 'cliente',   label: 'Cliente' },
  { key: 'conector',  label: 'Conector' },
  { key: 'afiliado',  label: 'Afiliado' },
  { key: 'consultor', label: 'Consultor' },
  { key: 'marketing', label: 'Marketing' },
];

const money = (n, cur = 'US$') => {
  const v = Number(n);
  if (!isFinite(v) || v === 0) return '—';
  return cur + ' ' + v.toLocaleString('es-AR', { maximumFractionDigits: 2 });
};
const fmtDate = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('es-AR') : '—');
const isAdBudget = (e) => e.role_key === 'cliente' && /publicidad/i.test(e.notes || '');
const isReservado = (e) => e.role_key === 'afiliado' && /reserv/i.test(e.notes || '');

// Acorta el método de pago largo del Sheet ("Stripe (Tarjeta) - Empresa" → "Stripe").
function shortPago(g) {
  const s = String(g || '').toLowerCase();
  if (!s) return '—';
  if (s.includes('stripe')) return 'Stripe';
  if (s.includes('mercury')) return 'Mercury';
  if (s.includes('usdt') || s.includes('safepal')) return 'USDT';
  return g;
}

const TYPE_BADGE = {
  CRM: 'bg-blue-100 text-blue-700',
  PUBLICIDAD: 'bg-amber-100 text-amber-700',
  SETUP: 'bg-gray-100 text-gray-600',
};

export default function IngresosPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    sbFetch('fin_incomes?select=id,income_date,client_name_sheet,income_type,effective_type,payment_method,amount_eur,amount_usd,net_usd,korex_real,fin_commission_entries(role_key,amount,notes)&order=income_date.desc.nullslast&limit=3000')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch((e) => setError(String(e)));
  }, []);

  // Pivot: por ingreso, separa comisión-cliente real del saldo de publicidad.
  const data = useMemo(() => {
    if (!rows) return null;
    return rows.map((r) => {
      const ent = r.fin_commission_entries || [];
      const comm = {};
      let adBudget = 0, reservadoAfi = false;
      ent.forEach((e) => {
        const amt = Number(e.amount) || 0;
        if (isAdBudget(e)) { adBudget += amt; return; }   // saldo publi: NO es comisión
        comm[e.role_key] = (comm[e.role_key] || 0) + amt;
        if (isReservado(e)) reservadoAfi = true;
      });
      return { ...r, comm, adBudget, reservadoAfi };
    });
  }, [rows]);

  const totals = useMemo(() => {
    if (!data) return null;
    const t = { n: data.length, eur: 0, usd: 0, net: 0, korex: 0, comm: 0, ad: 0 };
    data.forEach((r) => {
      t.eur += Number(r.amount_eur) || 0;
      t.usd += Number(r.amount_usd) || 0;
      t.net += Number(r.net_usd) || 0;
      t.korex += Number(r.korex_real) || 0;
      t.ad += r.adBudget;
      COMM_ROLES.forEach((c) => { t.comm += r.comm[c.key] || 0; });
    });
    return t;
  }, [data]);

  if (error) return <div className="text-red text-sm">Error cargando ingresos: {error}</div>;
  if (!data) return <div className="text-text3 text-center py-20">Cargando ingresos…</div>;
  if (!data.length) {
    return (
      <div className="text-center py-20">
        <p className="text-text2 text-sm">Todavía no hay ingresos importados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Ingresos" value={totals.n} />
        <Kpi label="Bruto US$" value={money(totals.usd)} />
        <Kpi label="Neto (post-fees)" value={money(totals.net)} />
        <Kpi label="Comisiones a repartir" value={money(totals.comm)} />
        <Kpi label="Ingreso real Korex" value={money(totals.korex)} accent />
      </div>

      {/* Leyenda Tipo vs Efectivo */}
      <div className="text-[11px] text-text3 bg-surface2 rounded-lg px-3 py-2 leading-relaxed">
        <b>Tipo</b> = cómo se cargó la venta. <b>Efectivo</b> = cómo se reparte realmente: un pago
        <b> CRM cuenta como SETUP</b> hasta que el cliente supera el <b>umbral base</b>; recién ahí pasa a CRM (reparto completo).
        En <b>Publicidad</b>, Korex retiene 15% y el resto es <b>saldo del cliente para ads</b> (no es comisión).
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-[12px] border-collapse whitespace-nowrap">
          <thead>
            {/* fila de grupos */}
            <tr className="text-[10px] uppercase tracking-wide text-text3 bg-surface2">
              <th colSpan={5} className="py-1.5 px-2.5 text-left font-semibold border-b border-border">Venta</th>
              <th colSpan={3} className="py-1.5 px-2.5 text-right font-semibold border-b border-l border-border">Montos</th>
              <th colSpan={5} className="py-1.5 px-2.5 text-center font-bold border-b border-l border-border bg-indigo-50 text-indigo-700">Comisiones a repartir</th>
              <th colSpan={1} className="py-1.5 px-2.5 text-right font-semibold border-b border-l border-border bg-green-50 text-green-700">Korex</th>
            </tr>
            {/* fila de columnas */}
            <tr className="bg-surface2 text-text2 text-left">
              <Th>Fecha</Th>
              <Th>Cliente</Th>
              <Th>Método pago</Th>
              <Th>Tipo</Th>
              <Th>Efectivo</Th>
              <Th right bl>Bruto €</Th>
              <Th right>Bruto US$</Th>
              <Th right>Neto US$</Th>
              {COMM_ROLES.map((c, i) => <Th key={c.key} right bl={i === 0} comm>{c.label}</Th>)}
              <Th right bl>Real</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-surface2/50">
                <Td>{fmtDate(r.income_date)}</Td>
                <Td className="font-medium">{r.client_name_sheet || '—'}</Td>
                <Td className="text-text2" title={r.payment_method || ''}>{shortPago(r.payment_method)}</Td>
                <Td className="text-text2">{r.income_type || '—'}</Td>
                <Td><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TYPE_BADGE[r.effective_type] || 'bg-gray-100 text-gray-500'}`}>{r.effective_type || '—'}</span></Td>
                <Td right bl className="text-text2">{money(r.amount_eur, '€')}</Td>
                <Td right className="text-text2">{money(r.amount_usd)}</Td>
                <Td right className="font-semibold">{money(r.net_usd)}</Td>
                {COMM_ROLES.map((c, i) => (
                  <Td key={c.key} right comm bl={i === 0}
                      className={c.key === 'afiliado' && r.reservadoAfi ? 'text-amber-600' : ''}>
                    {money(r.comm[c.key])}{c.key === 'afiliado' && r.reservadoAfi ? ' *' : ''}
                  </Td>
                ))}
                <Td right bl className="font-bold text-green-700">{money(r.korex_real)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] text-text3 space-y-0.5">
        <div>* <b>Afiliado reservado</b>: no hay afiliado asignado; ese % queda guardado en el fondo de comisiones del cliente (no es de Korex).</div>
        <div>En Publicidad, las columnas no suman el Neto: la diferencia es el <b>saldo publicitario del cliente</b> (US$ {totals.ad.toLocaleString('es-AR', { maximumFractionDigits: 0 })} en total).</div>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }) {
  return (
    <div className={`border rounded-lg p-3 ${accent ? 'border-green-200 bg-green-50' : 'border-border bg-white'}`}>
      <div className="text-[10px] uppercase tracking-wide text-text3 font-semibold">{label}</div>
      <div className={`text-[16px] font-bold mt-0.5 ${accent ? 'text-green-700' : 'text-text'}`}>{value}</div>
    </div>
  );
}
const Th = ({ children, right, bl, comm }) => (
  <th className={`py-2 px-2.5 font-semibold ${right ? 'text-right' : 'text-left'} ${bl ? 'border-l border-border' : ''} ${comm ? 'bg-indigo-50/40' : ''}`}>{children}</th>
);
const Td = ({ children, right, bl, comm, className = '', title }) => (
  <td title={title} className={`py-1.5 px-2.5 ${right ? 'text-right tabular-nums' : ''} ${bl ? 'border-l border-border' : ''} ${comm ? 'bg-indigo-50/30' : ''} ${className}`}>{children}</td>
);
