import { useEffect, useState, useMemo } from 'react';
import { sbFetch } from '@korex/db';

const ROLE_LABEL = {
  conector: 'Conector', consultor: 'Consultor', marketing: 'Marketing',
  afiliado: 'Afiliado', cliente: 'Cliente', korex: 'Korex',
};
const ROLE_ORDER = ['conector', 'consultor', 'marketing', 'afiliado', 'cliente', 'korex'];

const money = (n) => 'US$ ' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });

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
    let reservado = 0, saldoPubli = 0;
    entries.forEach((e) => {
      const amt = Number(e.amount) || 0;
      // El saldo de publicidad NO es comisión (plata del cliente para ads).
      if (e.role_key === 'cliente' && /publicidad/i.test(e.notes || '')) { saldoPubli += amt; return; }
      byRole[e.role_key] = (byRole[e.role_key] || 0) + amt;
      if (e.role_key === 'afiliado' && /reserv/i.test(e.notes || '')) reservado += amt;
    });
    const comisiones = ROLE_ORDER.filter((r) => r !== 'korex').reduce((a, r) => a + (byRole[r] || 0), 0);
    return { byRole, reservado, saldoPubli, comisiones };
  }, [entries]);

  if (error) return <div className="text-red text-sm">Error cargando comisiones: {error}</div>;
  if (!entries) return <div className="text-text3 text-center py-20">Cargando comisiones…</div>;
  if (!entries.length) {
    return (
      <div className="text-center py-20">
        <p className="text-text2 text-sm">Todavía no hay comisiones calculadas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-[11px] text-text3">
        Total histórico repartido por rol (motor corregido). El <b>Afiliado</b> incluye lo reservado en
        fondos de clientes cuando no hay afiliado asignado. El <b>saldo de publicidad</b> es plata del
        cliente para ads (no es comisión) y va aparte.
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {ROLE_ORDER.filter((r) => summary.byRole[r] != null).map((r) => (
          <div key={r} className={`border rounded-lg p-4 ${r === 'korex' ? 'border-green-200 bg-green-50' : 'border-border bg-white'}`}>
            <div className="text-[11px] uppercase tracking-wide text-text3 font-semibold">{ROLE_LABEL[r] || r}{r === 'cliente' ? ' (comisión CRM)' : ''}</div>
            <div className={`text-[20px] font-bold mt-1 ${r === 'korex' ? 'text-green-700' : 'text-text'}`}>{money(summary.byRole[r])}</div>
            {r === 'afiliado' && summary.reservado > 0 && (
              <div className="text-[10px] text-amber-600 mt-1">de los cuales {money(summary.reservado)} están reservados (sin afiliado)</div>
            )}
          </div>
        ))}
        {summary.saldoPubli > 0 && (
          <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
            <div className="text-[11px] uppercase tracking-wide text-amber-700 font-semibold">Saldo publicidad (clientes)</div>
            <div className="text-[20px] font-bold mt-1 text-amber-700">{money(summary.saldoPubli)}</div>
            <div className="text-[10px] text-amber-600 mt-1">No es comisión — saldo para ads de los clientes</div>
          </div>
        )}
      </div>
      <div className="text-[12px] text-text2 border-t border-border pt-3">
        Total comisiones a repartir (sin Korex): <b>{money(summary.comisiones)}</b>
      </div>
    </div>
  );
}
