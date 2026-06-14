import { useEffect, useState, useMemo } from 'react';
import { sbFetch } from '@korex/db';

const ROLE_COLS = [
  { key: 'cliente',   label: 'Cliente' },
  { key: 'conector',  label: 'Conector' },
  { key: 'afiliado',  label: 'Afiliado' },
  { key: 'consultor', label: 'Consultor' },
  { key: 'marketing', label: 'Marketing' },
];

const money = (n) => {
  const v = Number(n);
  if (!isFinite(v) || v === 0) return '—';
  return 'US$ ' + v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};
const fmtDate = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('es-AR') : '—');

export default function IngresosPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    sbFetch('fin_incomes?select=id,income_date,client_name_sheet,income_type,effective_type,net_usd,korex_real,payment_method,status,fin_commission_entries(role_key,amount,notes)&order=income_date.desc.nullslast&limit=3000')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch((e) => setError(String(e)));
  }, []);

  const totals = useMemo(() => {
    if (!rows) return null;
    const t = { net: 0, korex: 0, n: rows.length, byRole: {} };
    rows.forEach((r) => {
      t.net += Number(r.net_usd) || 0;
      t.korex += Number(r.korex_real) || 0;
      (r.fin_commission_entries || []).forEach((e) => {
        t.byRole[e.role_key] = (t.byRole[e.role_key] || 0) + (Number(e.amount) || 0);
      });
    });
    return t;
  }, [rows]);

  if (error) return <div className="text-red text-sm">Error cargando ingresos: {error}</div>;
  if (!rows) return <div className="text-text3 text-center py-20">Cargando ingresos…</div>;
  if (!rows.length) {
    return (
      <div className="text-center py-20">
        <p className="text-text2 text-sm">Todavía no hay ingresos importados.</p>
        <p className="text-text3 text-xs mt-1">Se cargan desde el Sheet de finanzas en la fase de importación.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Ingresos" value={totals.n} />
        <Kpi label="Neto total (E)" value={money(totals.net)} />
        <Kpi label="Comisiones repartidas" value={money(Object.entries(totals.byRole).filter(([k]) => k !== 'korex').reduce((a, [, v]) => a + v, 0))} />
        <Kpi label="Ingreso real Korex" value={money(totals.korex)} accent />
      </div>

      <div className="text-[11px] text-text3">
        Vista de solo lectura — espejo validado del Sheet. El reparto usa el motor corregido (sin doble conteo de afiliado).
      </div>

      {/* Tabla tipo Sheet */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="bg-surface2 text-text2 text-left">
              <Th>Fecha</Th>
              <Th>Cliente</Th>
              <Th>Tipo</Th>
              <Th>Efectivo</Th>
              <Th right>Neto (E)</Th>
              {ROLE_COLS.map((c) => <Th key={c.key} right>{c.label}</Th>)}
              <Th right>Korex (F)</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const byRole = {};
              (r.fin_commission_entries || []).forEach((e) => { byRole[e.role_key] = (byRole[e.role_key] || 0) + (Number(e.amount) || 0); });
              const reservado = (r.fin_commission_entries || []).some((e) => e.role_key === 'afiliado' && e.notes && /reserv/i.test(e.notes));
              return (
                <tr key={r.id} className="border-t border-border hover:bg-surface2/50">
                  <Td>{fmtDate(r.income_date)}</Td>
                  <Td className="font-medium">{r.client_name_sheet || '—'}</Td>
                  <Td>{r.income_type || '—'}</Td>
                  <Td><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${r.effective_type === 'CRM' ? 'bg-blue-bg text-blue' : r.effective_type === 'PUBLICIDAD' ? 'bg-amber-100 text-amber-700' : 'bg-surface2 text-text2'}`}>{r.effective_type || '—'}</span></Td>
                  <Td right className="font-medium">{money(r.net_usd)}</Td>
                  {ROLE_COLS.map((c) => (
                    <Td key={c.key} right className={c.key === 'afiliado' && reservado ? 'text-amber-600' : ''}>
                      {money(byRole[c.key])}{c.key === 'afiliado' && reservado ? ' *' : ''}
                    </Td>
                  ))}
                  <Td right className="font-semibold text-green-700">{money(r.korex_real)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-text3">* Afiliado <b>reservado</b>: no hay afiliado asignado, ese % queda guardado en el fondo de comisiones del cliente (no es de Korex).</div>
    </div>
  );
}

function Kpi({ label, value, accent }) {
  return (
    <div className={`border rounded-lg p-3 ${accent ? 'border-green-200 bg-green-50' : 'border-border bg-white'}`}>
      <div className="text-[10px] uppercase tracking-wide text-text3 font-semibold">{label}</div>
      <div className={`text-[17px] font-bold mt-0.5 ${accent ? 'text-green-700' : 'text-text'}`}>{value}</div>
    </div>
  );
}
const Th = ({ children, right }) => <th className={`py-2 px-2.5 font-semibold whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
const Td = ({ children, right, className = '' }) => <td className={`py-1.5 px-2.5 whitespace-nowrap ${right ? 'text-right tabular-nums' : ''} ${className}`}>{children}</td>;
