import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@korex/db';
import { useApp } from '../context/AppContext';
import { Plus, Search, LayoutGrid, List, ExternalLink, FileText } from 'lucide-react';
import KpiRow from '../components/KpiRow';
import StatusPill from '../components/StatusPill';
import TicketModal from '../components/cambios/TicketModal';
import TicketDetail from '../components/cambios/TicketDetail';
import TestsTab from '../components/cambios/TestsTab';
import AprendizajesTab from '../components/cambios/AprendizajesTab';
import {
  CATEGORIAS, FASES, URGENCIAS, ESTADOS, estadoPill, urgenciaColor, fmtFecha, MKT_ACCENT,
} from '../components/cambios/constants';

const ALL = '__all__';
const th = 'text-left py-2 px-2.5 bg-surface2 border border-border text-[10px] uppercase tracking-[0.5px] text-text3 font-semibold whitespace-nowrap';
const td = 'py-2 px-2.5 border border-border text-[12px] align-top';
const selCls = 'bg-white border border-border rounded-lg py-1.5 px-2.5 text-[12px] text-text2 font-sans outline-none focus:border-blue cursor-pointer';

function FilterSelect({ value, onChange, label, options }) {
  return (
    <select className={selCls} value={value} onChange={e => onChange(e.target.value)}>
      <option value={ALL}>{label}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function TicketsTab({ clients }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [fEstado, setFEstado] = useState(ALL);
  const [fUrg, setFUrg] = useState(ALL);
  const [fCli, setFCli] = useState(ALL);
  const [fCat, setFCat] = useState(ALL);
  const [fFase, setFFase] = useState(ALL);
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'board'
  const [editing, setEditing] = useState(null);   // null | {} (nuevo) | ticket
  const [detail, setDetail] = useState(null);      // ticket en lectura

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.from('landing_tickets').select('*').order('seq', { ascending: false });
      if (!active) return;
      if (error) setErr(error.message); else setRows(data || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const onSaved = (row, action) => {
    setRows(prev => {
      if (action === 'delete') return prev.filter(r => r.id !== row.id);
      if (action === 'update') return prev.map(r => r.id === row.id ? row : r);
      return [row, ...prev].sort((a, b) => b.seq - a.seq);
    });
    setDetail(null);
  };

  const clientNames = useMemo(
    () => [...new Set(rows.map(r => r.client_name).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter(r => {
      if (fEstado !== ALL && r.estado !== fEstado) return false;
      if (fUrg !== ALL && r.urgencia !== fUrg) return false;
      if (fCli !== ALL && r.client_name !== fCli) return false;
      if (fCat !== ALL && r.categoria !== fCat) return false;
      if (fFase !== ALL && r.fase !== fFase) return false;
      if (ql) {
        const hay = [r.code, r.client_name, r.cambio_solicitado, r.landing_url, r.encargado, r.comentarios]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [rows, q, fEstado, fUrg, fCli, fCat, fFase]);

  const kpis = useMemo(() => {
    const by = (s) => rows.filter(r => r.estado === s).length;
    const total = rows.length;
    const done = by('Terminado');
    return [
      { label: 'Total', value: total, color: 'var(--color-blue)' },
      { label: 'Pendientes', value: by('Pendiente'), color: 'var(--color-text3)' },
      { label: 'En progreso', value: by('En progreso'), color: 'var(--color-blue)' },
      { label: 'Terminados', value: done, color: 'var(--color-green)' },
      { label: '% completado', value: total ? Math.round((done / total) * 100) + '%' : '0%', color: 'var(--color-purple)' },
    ];
  }, [rows]);

  if (loading) return <div className="text-text3 text-center py-20 text-sm">Cargando tickets…</div>;
  if (err) return <div className="text-red text-center py-20 text-sm">Error: {err}</div>;

  return (
    <div>
      <KpiRow items={kpis} />

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…"
            className="bg-white border border-border rounded-lg py-1.5 pl-8 pr-3 text-[12px] text-text font-sans outline-none focus:border-blue w-44" />
        </div>
        <FilterSelect value={fEstado} onChange={setFEstado} label="Estado" options={ESTADOS} />
        <FilterSelect value={fUrg} onChange={setFUrg} label="Urgencia" options={URGENCIAS} />
        <FilterSelect value={fCli} onChange={setFCli} label="Cliente" options={clientNames} />
        <FilterSelect value={fCat} onChange={setFCat} label="Categoría" options={CATEGORIAS} />
        <FilterSelect value={fFase} onChange={setFFase} label="Fase" options={FASES} />

        <div className="flex items-center bg-white border border-border rounded-lg overflow-hidden ml-auto">
          <button onClick={() => setViewMode('table')} title="Tabla"
            className="p-1.5 cursor-pointer border-none" style={{ background: viewMode === 'table' ? MKT_ACCENT : 'transparent', color: viewMode === 'table' ? '#fff' : 'var(--color-text3)' }}>
            <List size={15} />
          </button>
          <button onClick={() => setViewMode('board')} title="Tablero"
            className="p-1.5 cursor-pointer border-none" style={{ background: viewMode === 'board' ? MKT_ACCENT : 'transparent', color: viewMode === 'board' ? '#fff' : 'var(--color-text3)' }}>
            <LayoutGrid size={15} />
          </button>
        </div>
        <button onClick={() => setEditing({})}
          className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg border-none text-white text-[12px] font-semibold cursor-pointer shrink-0" style={{ background: MKT_ACCENT }}>
          <Plus size={14} /> Nuevo cambio
        </button>
      </div>

      <div className="text-[11px] text-text3 mb-2">{filtered.length} de {rows.length} tickets</div>

      {viewMode === 'table' ? (
        <div className="bg-white border border-border rounded-xl p-3 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr>
              <th className={th}>ID</th><th className={th}>Cliente</th><th className={th}>Cambio</th>
              <th className={th}>Categoría</th><th className={th}>Fase</th><th className={th}>Sec.</th>
              <th className={th}>Urg.</th><th className={th}>Encargado</th><th className={th}>Estado</th>
              <th className={th}>Entrega</th><th className={th}>Links</th>
            </tr></thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="cursor-pointer hover:bg-blue-bg2" onClick={() => setDetail(t)}>
                  <td className={td + ' font-semibold whitespace-nowrap'}>{t.code}</td>
                  <td className={td + ' whitespace-nowrap font-medium'}>{t.client_name || '—'}</td>
                  <td className={td} style={{ minWidth: 240, maxWidth: 360 }}>
                    <div className="line-clamp-2">{t.cambio_solicitado || '—'}</div>
                  </td>
                  <td className={td + ' whitespace-nowrap'}>{t.categoria || '—'}</td>
                  <td className={td + ' whitespace-nowrap'}>{t.fase || '—'}</td>
                  <td className={td + ' whitespace-nowrap text-center'}>{t.seccion || '—'}</td>
                  <td className={td + ' whitespace-nowrap'}>
                    {t.urgencia ? <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: urgenciaColor(t.urgencia) }} />{t.urgencia}</span> : '—'}
                  </td>
                  <td className={td + ' whitespace-nowrap'}>{t.encargado || '—'}</td>
                  <td className={td}><StatusPill text={t.estado} pillClass={estadoPill(t.estado)} /></td>
                  <td className={td + ' whitespace-nowrap'}>{fmtFecha(t.fecha_entrega) || '—'}</td>
                  <td className={td} onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      {t.landing_url && /^https?:/.test(t.landing_url) && <a href={t.landing_url} target="_blank" rel="noopener noreferrer" title="Landing" className="text-blue"><ExternalLink size={13} /></a>}
                      {t.referencia && /^https?:/.test(t.referencia) && <a href={t.referencia} target="_blank" rel="noopener noreferrer" title="Referencia" className="text-purple"><FileText size={13} /></a>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td className={td + ' text-center text-text3 py-8'} colSpan={11}>No hay tickets con estos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${ESTADOS.length}, minmax(220px, 1fr))` }}>
          {ESTADOS.map(estado => {
            const col = filtered.filter(t => t.estado === estado);
            return (
              <div key={estado} className="bg-surface2 rounded-xl p-2.5 min-w-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <StatusPill text={estado} pillClass={estadoPill(estado)} />
                  <span className="text-[11px] text-text3 font-semibold">{col.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {col.map(t => (
                    <div key={t.id} onClick={() => setDetail(t)}
                      className="bg-white border border-border rounded-lg p-2.5 cursor-pointer hover:border-blue hover:shadow-sm transition-all"
                      style={{ borderLeft: `3px solid ${urgenciaColor(t.urgencia)}` }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-text3">{t.code}</span>
                        {t.fase && <span className="text-[9px] text-text3">{t.fase}</span>}
                      </div>
                      <div className="text-[12px] font-semibold mb-1 truncate">{t.client_name || '—'}</div>
                      <div className="text-[11px] text-text2 line-clamp-3">{t.cambio_solicitado || '—'}</div>
                      {t.encargado && <div className="text-[10px] text-text3 mt-1.5">{t.encargado}</div>}
                    </div>
                  ))}
                  {col.length === 0 && <div className="text-[11px] text-text3 text-center py-4">Vacío</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TicketModal open={!!editing} onClose={() => setEditing(null)} ticket={editing?.id ? editing : null} clients={clients} onSaved={onSaved} />
      <TicketDetail ticket={detail} onClose={() => setDetail(null)} onEdit={(t) => { setDetail(null); setEditing(t); }} />
    </div>
  );
}

const TABS = [
  { id: 'tickets', label: 'Tickets de cambios' },
  { id: 'tests', label: 'Tests A/B' },
  { id: 'aprendizajes', label: 'Aprendizajes' },
];

export default function CambiosPage() {
  const { clients, setView } = useApp();
  const [tab, setTab] = useState('tickets');

  useEffect(() => { setView?.('cambios'); }, [setView]);

  return (
    <div>
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="py-2 px-3.5 text-[13px] font-semibold cursor-pointer bg-transparent border-none border-b-2 -mb-px transition-colors"
            style={{
              color: tab === t.id ? MKT_ACCENT : 'var(--color-text3)',
              borderBottomColor: tab === t.id ? MKT_ACCENT : 'transparent',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tickets' && <TicketsTab clients={clients} />}
      {tab === 'tests' && <TestsTab clients={clients} />}
      {tab === 'aprendizajes' && <AprendizajesTab />}
    </div>
  );
}
