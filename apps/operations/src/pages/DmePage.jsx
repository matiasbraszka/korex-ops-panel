import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Lock } from 'lucide-react';
import { supabase } from '@korex/db';
import { useApp } from '../context/AppContext';
import { useDmeData, useDmeAllClients, ALL_CLIENTS } from '../hooks/useDmeData.js';
import { SECTIONS } from '../lib/dme/registry.js';
import {
  monthBounds, yearBounds, columnsByDay, columnsByWeek, columnsByMonth, flattenBag,
} from '../lib/dme/aggregate.js';
import { resolveDmeConfig } from '../lib/dme/color.js';
import DmeMetricTable from '../components/dme/DmeMetricTable.jsx';
import DmeDayModal from '../components/dme/DmeDayModal.jsx';
import DmeDashboard from '../components/dme/DmeDashboard.jsx';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const VIEWS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'diario',    label: 'Diario' },
  { id: 'semanal',   label: 'Semanal' },
  { id: 'mensual',   label: 'Mensual' },
];

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
  // La pestaña Dashboard es solo para admins.
  const views = useMemo(() => (isAdmin ? VIEWS : VIEWS.filter((v) => v.id !== 'dashboard')), [isAdmin]);

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

  // Defensa: la pestaña Dashboard es admin-only; un no-admin cae a Diario.
  useEffect(() => {
    if (!isAdmin && viewMode === 'dashboard') setViewMode('diario');
  }, [isAdmin, viewMode]);

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

  // Datos por cliente para la comparativa del Dashboard. En Maestro = todos los
  // clientes; con un cliente seleccionado = solo ese (una fila).
  const showDashboard = viewMode === 'dashboard';
  const { byClient } = useDmeAllClients(from, to, showDashboard && isCombined);
  const perClient = useMemo(() => {
    if (!showDashboard) return [];
    const ids = isCombined ? Object.keys(byClient) : [clientId].filter(Boolean);
    return ids.map((cid) => ({
      id: cid,
      name: clients.find((c) => c.id === cid)?.name || '—',
      bag: isCombined ? flattenBag(byClient[cid] || []) : rangeBag,
    }));
  }, [showDashboard, isCombined, byClient, clientId, clients, rangeBag]);

  const shiftMonth = (delta) => {
    let m = month + delta, y = year;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    setMonth(m); setYear(y);
  };

  const clientName = isCombined ? 'Todos combinados' : (clients.find((c) => c.id === clientId)?.name || '—');

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
          {views.map((v) => (
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
        <DmeDashboard
          bag={rangeBag}
          dailyColumns={columns}
          perClient={perClient}
          periodLabel={byYear ? String(year) : `${MONTH_NAMES[month - 1]} ${year}`}
          footerLabel={clientName}
          isCombined={isCombined}
          onSelectClient={setClientId}
        />
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
