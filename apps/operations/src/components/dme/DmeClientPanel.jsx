import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useDmeData } from '../../hooks/useDmeData.js';
import { SECTIONS } from '../../lib/dme/registry.js';
import { monthBounds, yearBounds, columnsByDay, columnsByWeek, columnsByMonth, flattenBag } from '../../lib/dme/aggregate.js';
import { resolveDmeConfig } from '../../lib/dme/color.js';
import DmeMetricTable from './DmeMetricTable.jsx';
import DmeDayModal from './DmeDayModal.jsx';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const VIEWS = [{ id: 'diario', label: 'Diario' }, { id: 'semanal', label: 'Semanal' }, { id: 'mensual', label: 'Mensual' }];

// Vista DME embebida dentro del detalle de un cliente. Misma maquinaria que la
// seccion DME pero con el cliente fijado y sin selector.
export default function DmeClientPanel({ clientId, clientName }) {
  const { currentUser, appSettings, updateAppSettings } = useApp();
  const isAdmin = !!currentUser?.isAdmin;
  const sections = isAdmin ? SECTIONS : SECTIONS.filter((s) => !s.adminOnly);
  const today = new Date();
  const funnelLinks = appSettings?.dme_funnel_links?.[clientId] || {};
  const onEditFunnelLink = (funnelId) => {
    const label = funnelId === 'embudo1' ? 'Embudo 1' : 'Embudo 2';
    const url = window.prompt(`Pegá el link del ${label} de ${clientName || 'este cliente'}:`, funnelLinks[funnelId] || '');
    if (url === null) return;
    const all = { ...(appSettings?.dme_funnel_links || {}) };
    all[clientId] = { ...(all[clientId] || {}), [funnelId]: url.trim() };
    updateAppSettings({ dme_funnel_links: all });
  };
  const [viewMode, setViewMode] = useState('diario');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editDate, setEditDate] = useState(null);

  const byYear = viewMode === 'mensual';
  const { from, to } = byYear ? yearBounds(year) : monthBounds(year, month);
  const { rows, loading, error, reload, saveDay, deleteDay } = useDmeData(clientId, from, to, currentUser?.id);
  const dmeConfig = useMemo(() => resolveDmeConfig(appSettings), [appSettings]);

  const { columns, totalCol } = useMemo(() => {
    let cols = [];
    if (viewMode === 'semanal') cols = columnsByWeek(rows, year, month);
    else if (viewMode === 'mensual') cols = columnsByMonth(rows, year);
    else cols = columnsByDay(rows, year, month);
    return {
      columns: cols.map((c) => ({ ...c, bag: flattenBag(c.rows) })),
      totalCol: { key: '__total__', label: byYear ? 'Año' : 'Total', bag: flattenBag(rows) },
    };
  }, [rows, viewMode, year, month, byYear]);

  const shiftMonth = (delta) => {
    let m = month + delta, y = year;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    setMonth(m); setYear(y);
  };

  const onCellClick = viewMode === 'diario' ? (key) => { setEditDate(key); setModalOpen(true); } : undefined;

  return (
    <div className="flex flex-col gap-3 mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-0.5 bg-surface2 rounded-lg p-0.5">
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => setViewMode(v.id)}
                    className={`text-[12px] font-semibold px-2.5 py-1.5 rounded-md cursor-pointer ${viewMode === v.id ? 'bg-white text-text shadow-sm' : 'text-text3 hover:text-text'}`}>
              {v.label}
            </button>
          ))}
        </div>
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
        <button onClick={() => { setEditDate(null); setModalOpen(true); }}
                className="inline-flex items-center gap-1.5 py-2 px-3 rounded-lg bg-blue text-white text-[12.5px] font-bold hover:bg-blue-dark shadow-sm cursor-pointer">
          <Plus size={14} /> Cargar día
        </button>
      </div>

      {error && <div className="bg-red-bg border border-red/30 text-red text-[12px] rounded-lg p-3">Error: {error}</div>}
      {loading && rows.length === 0 ? (
        <div className="text-text3 text-center py-10 text-[12px]">Cargando DME…</div>
      ) : (
        <DmeMetricTable sections={sections} columns={columns} totalCol={totalCol} config={dmeConfig} onCellClick={onCellClick} funnelLinks={funnelLinks} onEditFunnelLink={onEditFunnelLink} />
      )}

      <DmeDayModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditDate(null); }}
        onSaved={reload}
        saveDay={saveDay}
        onDelete={deleteDay}
        rows={rows}
        clientId={clientId}
        clientName={clientName}
        config={dmeConfig}
        initialDate={editDate}
        isAdmin={isAdmin}
      />
    </div>
  );
}
