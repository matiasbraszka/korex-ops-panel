import { useEffect, useState, useMemo } from 'react';
import { sbFetch } from '@korex/db';

const ROLE_LABEL = {
  conector: 'Conector', consultor: 'Consultor', marketing: 'Marketing',
  afiliado: 'Afiliado', cliente: 'Cliente', korex: 'Korex',
};
const ROLE_ORDER = ['conector', 'consultor', 'marketing', 'afiliado', 'cliente', 'korex'];

const money = (n) => 'US$ ' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function ComisionesPage() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    sbFetch('fin_commission_entries?select=role_key,amount,status,notes&limit=20000')
      .then((d) => setEntries(Array.isArray(d) ? d : []))
      .catch((e) => setError(String(e)));
  }, []);

  const summary = useMemo(() => {
    if (!entries) return null;
    const byRole = {};
    let reservado = 0;
    entries.forEach((e) => {
      const amt = Number(e.amount) || 0;
      byRole[e.role_key] = (byRole[e.role_key] || 0) + amt;
      if (e.role_key === 'afiliado' && e.notes && /reserv/i.test(e.notes)) reservado += amt;
    });
    return { byRole, reservado, total: Object.values(byRole).reduce((a, b) => a + b, 0) };
  }, [entries]);

  if (error) return <div className="text-red text-sm">Error cargando comisiones: {error}</div>;
  if (!entries) return <div className="text-text3 text-center py-20">Cargando comisiones…</div>;
  if (!entries.length) {
    return (
      <div className="text-center py-20">
        <p className="text-text2 text-sm">Todavía no hay comisiones calculadas.</p>
        <p className="text-text3 text-xs mt-1">Se generan al importar los ingresos y correr el motor de reparto.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-[11px] text-text3">
        Total histórico repartido por rol (motor corregido). El "Afiliado" incluye lo reservado en fondos de clientes cuando no hay afiliado asignado.
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {ROLE_ORDER.filter((r) => summary.byRole[r] != null).map((r) => (
          <div key={r} className={`border rounded-lg p-4 ${r === 'korex' ? 'border-green-200 bg-green-50' : 'border-border bg-white'}`}>
            <div className="text-[11px] uppercase tracking-wide text-text3 font-semibold">{ROLE_LABEL[r] || r}</div>
            <div className={`text-[20px] font-bold mt-1 ${r === 'korex' ? 'text-green-700' : 'text-text'}`}>{money(summary.byRole[r])}</div>
            {r === 'afiliado' && summary.reservado > 0 && (
              <div className="text-[10px] text-amber-600 mt-1">de los cuales {money(summary.reservado)} están reservados (sin afiliado)</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
