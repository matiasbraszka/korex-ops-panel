import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Lock } from 'lucide-react';
import { supabase } from '@korex/db';
import { useApp } from '../context/AppContext';
import { useDmeData, ALL_CLIENTS } from '../hooks/useDmeData.js';
import { SECTIONS, ADMIN_ONLY_KEYS } from '../lib/dme/registry.js';
import {
  monthBounds, yearBounds, columnsByDay, columnsByWeek, columnsByMonth, flattenBag,
} from '../lib/dme/aggregate.js';
import { resolveDmeConfig, metricTone } from '../lib/dme/color.js';
import { fmtMetric } from '../lib/dme/format.js';
import DmeMetricTable from '../components/dme/DmeMetricTable.jsx';
import DmeDayModal from '../components/dme/DmeDayModal.jsx';
import DmeKpiCard from '../components/dme/DmeKpiCard.jsx';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const VIEWS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'diario',    label: 'Diario' },
  { id: 'semanal',   label: 'Semanal' },
  { id: 'mensual',   label: 'Mensual' },
];
const num = (x) => Number(x || 0);
const div = (a, b) => (num(b) > 0 ? num(a) / num(b) : NaN);

// Filas del comparativo de embudos (Dashboard). d=true -> derivada (se recalcula).
const CMP = [
  { label: 'Inversión',            suffix: 'total_gastado',     kind: 'money', d: false },
  { label: 'Total de leads',       suffix: 'total_leads',       kind: 'int',   d: false },
  { label: 'CPL',                  suffix: 'cpl',               kind: 'cpl',   d: true },
  { label: 'Leads curiosos',       suffix: 'leads_curiosos',    kind: 'int',   d: false },
  { label: 'Leads interesados',    suffix: 'leads_interesados', kind: 'int',   d: false },
  { label: 'Leads calificados',    suffix: 'leads_calificados', kind: 'int',   d: false },
  { label: 'Visitas a la landing', suffix: 'visitas_landing',   kind: 'int',   d: false },
  { label: 'Leads registrados',    suffix: 'leads_registrados', kind: 'int',   d: false },
  { label: '% de registro',        suffix: 'pct_registro',      kind: 'pct',   d: true },
  { label: 'Miran VSL completo',   suffix: 'miran_vsl',         kind: 'int',   d: false },
  { label: '% mira VSL completo',  suffix: 'pct_vsl',           kind: 'pct',   d: true },
  { label: 'Quiz iniciado',        suffix: 'quiz_iniciado',     kind: 'int',   d: false },
  { label: 'Quiz terminado',       suffix: 'quiz_terminado',    kind: 'int',   d: false },
  { label: '% termina quiz',       suffix: 'pct_quiz',          kind: 'pct',   d: true },
  { label: 'WhatsApp enviado',     suffix: 'whatsapp',          kind: 'int',   d: false },
  { label: '% WhatsApp enviado',   suffix: 'pct_whatsapp',      kind: 'pct',   d: true },
  { label: 'Cierres',              suffix: 'cierres',           kind: 'int',   d: false },
  { label: '% de cierres',         suffix: 'pct_cierres',       kind: 'pct',   d: true },
];

// Recalcula los derivados del embudo combinado (Embudo 1 + 2) a partir de los inputs sumados.
function combinedDerived(ci) {
  return {
    cpl:          div(ci.total_gastado, ci.total_leads),
    pct_registro: div(ci.leads_registrados, ci.visitas_landing),
    pct_vsl:      div(ci.miran_vsl, ci.leads_registrados),
    pct_quiz:     div(ci.quiz_terminado, ci.quiz_iniciado),
    pct_whatsapp: div(ci.whatsapp, ci.quiz_terminado),
    pct_cierres:  div(ci.cierres, ci.leads_registrados),
    roi:          div(ci.facturado - ci.total_gastado, ci.total_gastado),
  };
}

export default function DmePage() {
  const { clients, currentUser, selectedId, appSettings, updateAppSettings } = useApp();
  const isAdmin = !!currentUser?.isAdmin;
  const today = new Date();

  const [clientId, setClientId] = useState('');
  const [viewMode, setViewMode] = useState('diario');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editDate, setEditDate] = useState(null);
  const [activeIds, setActiveIds] = useState(() => new Set());

  // Bloques General/Finanzas solo para admins.
  const sections = useMemo(() => (isAdmin ? SECTIONS : SECTIONS.filter((s) => !s.adminOnly)), [isAdmin]);

  // Clientes "DME activo": con datos cargados en los ultimos 5 dias.
  useEffect(() => {
    (async () => {
      const d = new Date(); d.setDate(d.getDate() - 5);
      const pad = (n) => String(n).padStart(2, '0');
      const cutoff = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const { data } = await supabase.from('dme_daily').select('client_id').gte('date', cutoff);
      setActiveIds(new Set((data || []).map((r) => r.client_id)));
    })();
  }, []);

  // Cliente por defecto: el seleccionado en el contexto o el primero de la lista.
  useEffect(() => {
    if (clientId) return;
    if (selectedId && clients.some((c) => c.id === selectedId)) setClientId(selectedId);
    else if (clients.length) setClientId(clients[0].id);
  }, [clients, selectedId, clientId]);

  // Defensa: si un no-admin quedara en el Maestro, volver al primer cliente.
  useEffect(() => {
    if (clientId === ALL_CLIENTS && !isAdmin && clients.length) setClientId(clients[0].id);
  }, [clientId, isAdmin, clients]);

  const isCombined = clientId === ALL_CLIENTS;
  const byYear = viewMode === 'mensual';
  const { from, to } = byYear ? yearBounds(year) : monthBounds(year, month);

  const { rows, loading, error, reload, saveDay, deleteDay } = useDmeData(clientId, from, to, currentUser?.id);

  const dmeConfig = useMemo(() => resolveDmeConfig(appSettings), [appSettings]);

  // Columnas + bags segun la vista.
  const { columns, totalCol } = useMemo(() => {
    let cols = [];
    if (viewMode === 'semanal') cols = columnsByWeek(rows, year, month);
    else if (viewMode === 'mensual') cols = columnsByMonth(rows, year);
    else cols = columnsByDay(rows, year, month); // diario (y base del dashboard)
    const withBags = cols.map((c) => ({ ...c, bag: flattenBag(c.rows) }));
    const total = { key: '__total__', label: byYear ? 'Año' : 'Total', bag: flattenBag(rows) };
    return { columns: withBags, totalCol: total };
  }, [rows, viewMode, year, month, byYear]);

  // Bag del rango completo (para Dashboard).
  const rangeBag = useMemo(() => flattenBag(rows), [rows]);

  const shiftMonth = (delta) => {
    let m = month + delta, y = year;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    setMonth(m); setYear(y);
  };

  const clientName = isCombined ? 'Todos combinados' : (clients.find((c) => c.id === clientId)?.name || '—');
  const tone = (key, val) => metricTone(key, val, dmeConfig);

  // Links de embudo por cliente (guardados en app_settings.dme_funnel_links).
  const funnelLinks = isCombined ? {} : (appSettings?.dme_funnel_links?.[clientId] || {});
  const onEditFunnelLink = isCombined ? undefined : (funnelId) => {
    const label = funnelId === 'embudo1' ? 'Embudo 1' : 'Embudo 2';
    const url = window.prompt(`Pegá el link del ${label} de ${clientName}:`, funnelLinks[funnelId] || '');
    if (url === null) return;
    const all = { ...(appSettings?.dme_funnel_links || {}) };
    all[clientId] = { ...(all[clientId] || {}), [funnelId]: url.trim() };
    updateAppSettings({ dme_funnel_links: all });
  };

  // Click en una celda-dia (solo Diario, cliente real) -> editar ese dia.
  const onCellClick = (!isCombined && viewMode === 'diario')
    ? (columnKey) => { setEditDate(columnKey); setModalOpen(true); }
    : undefined;

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      {/* Controles */}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={clientId} onChange={(e) => setClientId(e.target.value)}
                className="text-[13px] border border-border rounded-lg px-2.5 py-2 outline-none focus:border-blue bg-white max-w-[240px]">
          {isAdmin && <option value={ALL_CLIENTS}>★ Todos combinados (Maestro)</option>}
          {clients.map((c) => <option key={c.id} value={c.id}>{(activeIds.has(c.id) ? '🟢 ' : '◦ ')}{c.name}</option>)}
        </select>

        <div className="flex items-center gap-0.5 bg-surface2 rounded-lg p-0.5">
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => setViewMode(v.id)}
                    className={`text-[12.5px] font-semibold px-2.5 py-1.5 rounded-md cursor-pointer ${viewMode === v.id ? 'bg-white text-text shadow-sm' : 'text-text3 hover:text-text'}`}>
              {v.label}
            </button>
          ))}
        </div>

        {/* Navegacion de periodo: mes (diario/semanal/dashboard) o año (mensual) */}
        {byYear ? (
          <div className="flex items-center gap-2 bg-surface2 rounded-lg px-2 py-1.5">
            <button onClick={() => setYear((y) => y - 1)} className="w-7 h-7 rounded-md bg-white border border-border text-text2 hover:text-text flex items-center justify-center cursor-pointer"><ChevronLeft size={14} /></button>
            <div className="text-[13px] font-bold text-text tabular-nums min-w-[56px] text-center">{year}</div>
            <button onClick={() => setYear((y) => y + 1)} className="w-7 h-7 rounded-md bg-white border border-border text-text2 hover:text-text flex items-center justify-center cursor-pointer"><ChevronRight size={14} /></button>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-surface2 rounded-lg px-2 py-1.5">
            <button onClick={() => shiftMonth(-1)} className="w-7 h-7 rounded-md bg-white border border-border text-text2 hover:text-text flex items-center justify-center cursor-pointer"><ChevronLeft size={14} /></button>
            <div className="text-[13px] font-bold text-text tabular-nums min-w-[120px] text-center">{MONTH_NAMES[month - 1]} {year}</div>
            <button onClick={() => shiftMonth(1)} className="w-7 h-7 rounded-md bg-white border border-border text-text2 hover:text-text flex items-center justify-center cursor-pointer"><ChevronRight size={14} /></button>
          </div>
        )}

        <div className="flex-1" />

        {isCombined ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-text2 bg-purple-bg text-purple px-2.5 py-1.5 rounded-lg font-semibold">
            <Lock size={13} /> Maestro · solo lectura
          </span>
        ) : (
          <button onClick={() => { setEditDate(null); setModalOpen(true); }}
                  className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-lg bg-blue text-white text-[13px] font-bold hover:bg-blue-dark shadow-sm cursor-pointer">
            <Plus size={15} /> Cargar día
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-bg border border-red/30 text-red text-[12px] rounded-lg p-3 flex items-center justify-between">
          <span>Error: {error}</span>
          <button onClick={reload} className="bg-white border border-red/30 rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer">Reintentar</button>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="text-text3 text-center py-12 text-[12px]">Cargando DME…</div>
      ) : viewMode === 'dashboard' ? (
        <DashboardView bag={rangeBag} tone={tone} periodLabel={`${MONTH_NAMES[month - 1]} ${year}`} isAdmin={isAdmin} />
      ) : (
        <DmeMetricTable
          sections={sections}
          columns={columns}
          totalCol={totalCol}
          config={dmeConfig}
          onCellClick={onCellClick}
          funnelLinks={funnelLinks}
          onEditFunnelLink={onEditFunnelLink}
        />
      )}

      <div className="text-[10.5px] text-text3 text-center pt-1">
        Korex · DME — {clientName}{!isCombined && viewMode === 'diario' ? ' · tocá una celda para cargar ese día' : ''}
      </div>

      {!isCombined && (
        <DmeDayModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditDate(null); }}
          onSaved={reload}
          saveDay={saveDay}
          onDelete={deleteDay}
          rows={rows}
          clientName={clientName}
          config={dmeConfig}
          initialDate={editDate}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

// ── Dashboard (resumen del rango) ────────────────────────────────────────────
function DashboardView({ bag, tone, periodLabel, isAdmin }) {
  const g = (k) => bag[k];

  const cards = [
    { key: 'facturacion_setups', label: 'Facturación SETUPS', kind: 'money' },
    { key: 'cashcollect_setups', label: 'CashCollect SETUPs', kind: 'money' },
    { key: 'nuevos_usuarios',    label: 'Nuevos usuarios',     kind: 'int' },
    { key: 'invertido_pub',      label: 'Inversión en publicidad', kind: 'money' },
    { key: 'cashcollect_pub',    label: 'CashCollect Publicidad', kind: 'money' },
    { key: 'leads_obtenidos',    label: 'Leads Obtenidos (Meta)', kind: 'int' },
    { key: 'cpl',                label: 'CPL promedio',        kind: 'cpl' },
    { key: 'pct_renovaciones',   label: '% Renovaciones',      kind: 'pct' },
  ].filter((c) => isAdmin || !ADMIN_ONLY_KEYS.has(c.key));
  const results = [
    { key: 'nuevos_testimonios',       label: 'Nuevos testimonios',     kind: 'int' },
    { key: 'networkers_cerraron',      label: 'Networkers que cerraron', kind: 'int' },
    { key: 'networkers_primer_cierre', label: 'Networkers con primer cierre', kind: 'int' },
    { key: 'cierres_total',            label: 'Total cierres (Emb. 1 + 2)', kind: 'int' },
  ];

  // Comparativo de embudos.
  const ci = {};
  CMP.filter((r) => !r.d).forEach((r) => { ci[r.suffix] = num(g(`embudo1_${r.suffix}`)) + num(g(`embudo2_${r.suffix}`)); });
  const cd = combinedDerived(ci);
  const cmpRows = CMP.map((r) => {
    const e1 = g(`embudo1_${r.suffix}`);
    const e2 = g(`embudo2_${r.suffix}`);
    const total = r.d ? cd[r.suffix] : ci[r.suffix];
    const diff = num(e1) - num(e2);
    return { ...r, e1, e2, total, diff };
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-text3 mb-2">Resumen principal · {periodLabel}</div>
        <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3">
          {cards.map((c) => <DmeKpiCard key={c.key} label={c.label} value={fmtMetric(c.kind, g(c.key))} tone={tone(c.key, g(c.key))} />)}
        </div>
      </div>

      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-text3 mb-2">Resultados</div>
        <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3">
          {results.map((c) => <DmeKpiCard key={c.key} label={c.label} value={fmtMetric(c.kind, g(c.key))} tone={tone(c.key, g(c.key))} />)}
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="px-4 pt-3.5 pb-3 border-b border-border">
          <div className="text-[13px] font-bold text-text">Embudo comparativo al detalle</div>
          <div className="text-[10.5px] text-text3 mt-0.5">Embudo 1 vs Embudo 2 · TOTAL · Diferencia</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="text-text3 text-[10px] uppercase tracking-wider">
                <th className="text-left font-bold px-3 py-2">Métrica</th>
                <th className="text-left font-bold px-3 py-2">Embudo 1</th>
                <th className="text-left font-bold px-3 py-2">Embudo 2</th>
                <th className="text-left font-bold px-3 py-2">TOTAL</th>
                <th className="text-left font-bold px-3 py-2">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {cmpRows.map((r) => (
                <tr key={r.suffix} className="border-t border-[#F1F3F7]">
                  <td className="text-left px-3 py-1.5 text-text whitespace-nowrap">{r.label}</td>
                  <td className="text-left px-3 py-1.5 tabular-nums">{fmtMetric(r.kind, r.e1)}</td>
                  <td className="text-left px-3 py-1.5 tabular-nums">{fmtMetric(r.kind, r.e2)}</td>
                  <td className="text-left px-3 py-1.5 tabular-nums font-bold">{fmtMetric(r.kind, r.total)}</td>
                  <td className="text-left px-3 py-1.5 tabular-nums text-text3">{r.d ? '—' : fmtMetric(r.kind, r.diff)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
