import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Users, Phone, DollarSign, Target, TrendingUp, Percent } from 'lucide-react';
import { supabase } from '@korex/db';
import { useCrm } from '../hooks/useCrm.js';
import { useCloserScorecard } from '../hooks/useCloserScorecard.js';
import KpiCard from '../components/dashboard/KpiCard.jsx';
import StepFunnel from '../components/dashboard/StepFunnel.jsx';
import CloserDayModal from '../components/dashboard/CloserDayModal.jsx';
import { sumRows, computeRates, funnelStages, fmtMoney, fmtInt, fmtPct } from '../lib/closerKpis.js';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Columnas resumidas para la tabla (las mas accionables; la carga completa
// vive en el modal). El resto de campos se ven igual sumados en las cards.
const TABLE_COLS = [
  { key: 'contactos_contactados', label: 'Cont.',  kind: 'int' },
  { key: 'llamadas_agendadas',    label: 'Agend.', kind: 'int' },
  { key: 'llamadas_tuve',         label: 'Llam.',  kind: 'int' },
  { key: 'llamadas_calificadas',  label: 'Calif.', kind: 'int' },
  { key: 'ofertas',               label: 'Ofertas',kind: 'int' },
  { key: 'ventas',                label: 'Ventas', kind: 'int' },
  { key: 'facturacion',           label: 'Fact.',  kind: 'money' },
  { key: 'new_upfront_cash',      label: 'Cash',   kind: 'money' },
];

// "2026-06-09" -> "lun 09 jun" (sin corrimiento de zona horaria).
function fmtDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' });
}

function useIsAdmin() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !alive) return;
        const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
        if (alive) setAdmin((data || []).some((r) => r.role === 'admin'));
      } catch {}
    })();
    return () => { alive = false; };
  }, []);
  return admin;
}

export default function KpisPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [closer, setCloser] = useState('me'); // 'me' | 'all' | user_id
  const [modalOpen, setModalOpen] = useState(false);

  const { salesTeam, me } = useCrm();
  const isAdmin = useIsAdmin();

  // Closer efectivo para el query. Los no-admin solo ven lo suyo.
  const effectiveCloserId = useMemo(() => {
    if (!isAdmin) return me;
    if (closer === 'all') return null;
    if (closer === 'me') return me;
    return closer;
  }, [isAdmin, closer, me]);

  const { rows, loading, error, reload, saveDay } = useCloserScorecard(year, month, effectiveCloserId);

  const totals = useMemo(() => sumRows(rows), [rows]);
  const rates = useMemo(() => computeRates(totals), [totals]);
  const steps = useMemo(() => funnelStages(totals), [totals]);
  const teamById = useMemo(() => Object.fromEntries(salesTeam.map((s) => [s.user_id, s])), [salesTeam]);

  const isByCloser = isAdmin && closer === 'all';

  // Filas de la tabla: por closer (vista equipo) o por dia (closer unico).
  const dataRows = useMemo(() => {
    if (isByCloser) {
      const map = {};
      rows.forEach((r) => { (map[r.closer_id] ||= []).push(r); });
      return Object.entries(map)
        .map(([cid, rs]) => ({ key: cid, label: teamById[cid]?.name || '(sin perfil)', t: sumRows(rs) }))
        .sort((a, b) => b.t.ventas - a.t.ventas);
    }
    return [...rows]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((r) => ({ key: r.id, label: fmtDay(r.date), t: r }));
  }, [isByCloser, rows, teamById]);

  const shiftMonth = (delta) => {
    let m = month + delta, y = year;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    setMonth(m); setYear(y);
  };

  return (
    <div className="flex flex-col gap-3.5 max-md:gap-3 pb-4">
      {/* Controles */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-surface2 rounded-lg px-2 py-1.5">
          <button onClick={() => shiftMonth(-1)}
                  className="w-7 h-7 rounded-md bg-white border border-border text-text2 hover:text-text flex items-center justify-center cursor-pointer"><ChevronLeft size={14} /></button>
          <div className="text-[13px] font-bold text-text tabular-nums min-w-[130px] text-center">{MONTH_NAMES[month - 1]} {year}</div>
          <button onClick={() => shiftMonth(1)}
                  className="w-7 h-7 rounded-md bg-white border border-border text-text2 hover:text-text flex items-center justify-center cursor-pointer"><ChevronRight size={14} /></button>
        </div>
        {isAdmin && (
          <select value={closer} onChange={(e) => setCloser(e.target.value)}
                  className="text-[13px] border border-border rounded-lg px-2.5 py-2 outline-none focus:border-blue bg-white">
            <option value="all">Todo el equipo</option>
            <option value="me">Yo</option>
            {salesTeam.map((s) => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
          </select>
        )}
        <div className="flex-1" />
        <button onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-lg bg-blue text-white text-[13px] font-bold hover:bg-blue-dark shadow-sm cursor-pointer">
          <Plus size={15} /> Cargar día
        </button>
      </div>

      {error && (
        <div className="bg-red-bg border border-red/30 text-red text-[12px] rounded-lg p-3 flex items-center justify-between">
          <span>Error: {error}</span>
          <button onClick={reload} className="bg-white border border-red/30 rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer">Reintentar</button>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="text-text3 text-center py-12 text-[12px]">Cargando KPIs…</div>
      ) : (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3.5 max-md:gap-2.5">
            <KpiCard icon={Users}      tone="blue"   label="Contactos contactados" value={fmtInt(totals.contactos_contactados)} sub={`${fmtPct(rates.pct_agendamiento)} agendamiento`} />
            <KpiCard icon={Phone}      tone="purple" label="Llamadas que tuve"     value={fmtInt(totals.llamadas_tuve)}        sub={`${fmtPct(rates.pct_show_up)} show up`} />
            <KpiCard icon={Target}     tone="orange" label="Ofertas"               value={fmtInt(totals.ofertas)}              sub={`${fmtPct(rates.pct_oferta)} de calificadas`} />
            <KpiCard icon={TrendingUp} tone="green"  label="Ventas"                value={fmtInt(totals.ventas)}               sub={`${fmtPct(rates.pct_cierre)} cierre`} />
            <KpiCard icon={DollarSign} tone="green"  label="Facturación"           value={fmtMoney(totals.facturacion)}        sub={`Ticket ${fmtMoney(rates.ticket)}`} />
            <KpiCard icon={DollarSign} tone="blue"   label="New upfront cash"      value={fmtMoney(totals.new_upfront_cash)}   sub={`${fmtMoney(rates.cash_por_venta)} por venta`} />
            <KpiCard icon={Percent}    tone="orange" label="% Calificación"        value={fmtPct(rates.pct_calificacion)}      sub="calificadas / llamadas" />
            <KpiCard icon={Percent}    tone="purple" label="Depósitos"             value={fmtInt(totals.depositos)}            sub="señas del período" />
          </div>

          {/* Embudo + tabla */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-3.5 max-sm:gap-3">
            <StepFunnel title={`Embudo · ${MONTH_NAMES[month - 1]} ${year}`} steps={steps} />

            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="px-3.5 pt-3 pb-2.5 border-b border-border">
                <div className="text-[13px] font-bold text-text">{isByCloser ? 'Por closer' : 'Detalle diario'}</div>
                <div className="text-[10.5px] text-text3 mt-0.5">{isByCloser ? 'Totales del mes por persona' : 'Cada día cargado del mes'}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr className="text-text3 text-[10px] uppercase tracking-wider">
                      <th className="text-left font-bold px-3 py-2 sticky left-0 bg-white">{isByCloser ? 'Closer' : 'Día'}</th>
                      {TABLE_COLS.map((c) => <th key={c.key} className="text-right font-bold px-3 py-2 whitespace-nowrap">{c.label}</th>)}
                      <th className="text-right font-bold px-3 py-2">% Cierre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.length === 0 ? (
                      <tr><td colSpan={TABLE_COLS.length + 2} className="text-center text-text3 py-8 text-[12px]">Sin datos cargados este mes.</td></tr>
                    ) : dataRows.map((row) => {
                      const r = computeRates(row.t);
                      return (
                        <tr key={row.key} className="border-t border-border hover:bg-surface2/60">
                          <td className="text-left px-3 py-2 font-semibold whitespace-nowrap sticky left-0 bg-white capitalize">{row.label}</td>
                          {TABLE_COLS.map((c) => (
                            <td key={c.key} className="text-right px-3 py-2 tabular-nums">
                              {c.kind === 'money' ? fmtMoney(row.t[c.key]) : fmtInt(row.t[c.key])}
                            </td>
                          ))}
                          <td className="text-right px-3 py-2 tabular-nums font-semibold">{fmtPct(r.pct_cierre)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="text-[10.5px] text-text3 text-center pt-2">Korex · KPIs de Ventas</div>
        </>
      )}

      <CloserDayModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={reload}
        saveDay={saveDay}
        rows={rows}
        closerOptions={salesTeam}
        meId={me}
        isAdmin={isAdmin}
      />
    </div>
  );
}
