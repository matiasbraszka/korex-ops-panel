import { useState, useEffect, useRef } from 'react';
import { Users, Megaphone, MessageSquare, FileText, Pencil, Check, Loader2, GripVertical } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PRIO_CLIENT, PHASES } from '../utils/constants';
import { initials, progress, currentTask, getAllPhases, daysAgo, fmtDate, clientPill } from '../utils/helpers';
import KpiRow from '../components/KpiRow';
import ClientDetail from './ClientDetail';
import PublicidadPage from './PublicidadPage';
import FeedbackPage from './FeedbackPage';
import InformePage from './InformePage';

const CLIENTS_TAB_KEY = 'clientes_current_tab';
// 'informe' queda oculto del menu pero la ruta interna sigue funcionando.
const VALID_TABS = ['lista', 'publicidad'];

// Pildora de estado de publicidad. Lee metaMetrics.adsActive + pauseStatus.
// Estados de Meta differenciados:
//   - deuda_meta: UNSETTLED, Meta intentó cobrar y no pudo (urgente)
//   - cuenta_bloqueada: DISABLED por motivo distinto a pago (urgente)
//   - sin_tarjeta: has_payment_method=false (informativo, no urgente)
//   - mcp_pendiente: conector MCP no habilitado (informativo)
function AdsBadge({ client }) {
  const m = client.metaMetrics;
  if (!m) return <span className="text-[10px] text-text3">—</span>;
  const status = m.pauseStatus;
  if (status === 'mcp_pendiente') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-blue-50 text-blue-700" title={m.pauseReason || 'MCP pendiente'}>🔵 MCP</span>;
  }
  if (status === 'deuda_meta') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-red-50 text-red-700" title={m.pauseReason || 'Deuda con Meta — pago rechazado'}>💰 Deuda</span>;
  }
  if (status === 'cuenta_bloqueada') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-red-50 text-red-700" title={m.pauseReason || 'Bloqueada por Meta'}>🚫 Bloqueada</span>;
  }
  if (status === 'sin_tarjeta') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-amber-50 text-amber-700" title={m.pauseReason || 'Sin tarjeta vinculada'}>💳 Sin tarjeta</span>;
  }
  if (m.adsActive) {
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-green-50 text-green-700">● Activa</span>;
  }
  return <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-gray-100 text-gray-500" title={m.pauseReason || 'Sin gasto reciente'}>○ Inactiva</span>;
}

// Celda editable inline para "pendiente para avanzar". Click -> input,
// blur o Enter guarda. Esc cancela. Muestra spinner mientras persiste y un
// check verde fugaz cuando confirma el save.
function PendienteCell({ client, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(client.bottleneck || '');
  const [status, setStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  const inputRef = useRef(null);

  useEffect(() => { setValue(client.bottleneck || ''); }, [client.bottleneck]);
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = async () => {
    setEditing(false);
    const v = value.trim();
    const prev = (client.bottleneck || '').trim();
    if (v === prev) return;
    setStatus('saving');
    try {
      await onSave(v);
      setStatus('saved');
      setTimeout(() => setStatus(null), 1500);
    } catch (e) {
      console.warn('save bottleneck', e);
      setStatus('error');
      setTimeout(() => setStatus(null), 4000);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setValue(client.bottleneck || ''); setEditing(false); }
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder="¿Qué hace falta para avanzar?"
        className="w-full border border-blue-300 rounded-md py-1 px-2 text-[12px] outline-none focus:border-blue-500 bg-white"
      />
    );
  }

  const text = (client.bottleneck || '').trim();
  return (
    <div
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className="group/p flex items-center gap-1.5 cursor-text rounded-md py-1 px-2 -mx-2 hover:bg-gray-50"
      title={text || 'Click para escribir el pendiente'}
    >
      <span className={`flex-1 truncate text-[12px] ${text ? 'text-gray-700' : 'text-gray-400 italic'}`}>
        {text || '¿Qué hace falta para avanzar?'}
      </span>
      {status === 'saving' && <Loader2 size={11} className="text-blue-500 animate-spin shrink-0" />}
      {status === 'saved' && <Check size={11} className="text-green-600 shrink-0" />}
      {status === 'error' && <span className="text-[9px] text-red-500 font-semibold shrink-0" title="No se pudo guardar — reintenta">⚠ fallo</span>}
      {!status && <Pencil size={10} className="text-gray-300 opacity-0 group-hover/p:opacity-100 shrink-0" />}
    </div>
  );
}

export default function ClientsPage() {
  const { clients, tasks, filter, setFilter, selectedId, setSelectedId, setView, briefing, taskProposals, getPriorityLabel, phase, setPhase, updateClient, reorderClient, currentUser } = useApp();
  const isAdmin = !!(currentUser?.isAdmin || currentUser?.role === 'COO');

  // Drag&drop refs (solo se usan si isAdmin)
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [dragOverPrio, setDragOverPrio] = useState(null); // para divisores de seccion

  const [tab, setTab] = useState(() => {
    try {
      const saved = localStorage.getItem(CLIENTS_TAB_KEY);
      return VALID_TABS.includes(saved) ? saved : 'lista';
    } catch { return 'lista'; }
  });
  useEffect(() => {
    try { localStorage.setItem(CLIENTS_TAB_KEY, tab); } catch {}
  }, [tab]);

  if (selectedId) {
    const c = clients.find(x => x.id === selectedId);
    if (c) return <ClientDetail client={c} />;
  }

  const pendingProposals = taskProposals.filter(p => p.approval === 'pending').length;
  const stored = briefing;

  // Filter out Empresa (Korex) from the client list
  const isKorexClient = (c) => /empresa|korex/i.test(c.name);
  const visibleClients = clients.filter(c => !isKorexClient(c));

  let preview = 'Sin informe disponible. El agente de operaciones enviará el próximo informe automáticamente.';
  if (stored && stored.text) {
    const lines = stored.text.replace(/<[^>]+>/g, '').split('\n').filter(l => l.trim() && !l.startsWith('#'));
    preview = lines.slice(0, 2).join(' ').substring(0, 200);
    if (lines.join(' ').length > 200) preview += '...';
  }

  // Exclude descartados (6) from default active count / KPIs
  const activeForKpis = visibleClients.filter(c => (c.priority || 5) !== 6);
  const t = activeForKpis.length;
  const b = activeForKpis.filter(c => (c.priority || 5) === 1).length;
  const l = activeForKpis.filter(c => {
    // New system: check if lanzamiento roadmap task is done
    const launchTask = tasks.find(tk => tk.clientId === c.id && tk.isRoadmapTask && tk.templateId === 'lanzamiento');
    if (launchTask) return launchTask.status === 'done';
    // Fallback to steps
    return c.steps[17] && c.steps[17].status === 'completed';
  }).length;
  const n = activeForKpis.filter(c => (c.priority || 5) === 5).length;

  const filterDefs = [
    { key: 'all',         label: 'Todos' },
    { key: 'super',       label: 'Super prioritarios' },
    { key: 'important',   label: 'Importantes' },
    { key: 'normal',      label: 'Normal' },
    { key: 'poco',        label: 'Poco importantes' },
    { key: 'new',         label: 'Nuevos' },
    { key: 'descartados', label: 'Descartados' },
  ];

  // By default (filter === 'all'), hide descartados from the list
  // Orden: primero por priority asc (para que las secciones queden agrupadas), despues por position asc (orden manual dentro de la seccion).
  let cls = [...visibleClients].sort((a, bb) => {
    const pa = a.priority || 5, pb = bb.priority || 5;
    if (pa !== pb) return pa - pb;
    return (a.position ?? 0) - (bb.position ?? 0);
  });
  if (filter === 'all')         cls = cls.filter(c => (c.priority || 5) !== 6);
  if (filter === 'super')       cls = cls.filter(c => (c.priority || 5) === 1);
  if (filter === 'important')   cls = cls.filter(c => (c.priority || 5) === 2);
  if (filter === 'normal')      cls = cls.filter(c => (c.priority || 5) === 3);
  if (filter === 'poco')        cls = cls.filter(c => (c.priority || 5) === 4);
  if (filter === 'new')         cls = cls.filter(c => (c.priority || 5) === 5);
  if (filter === 'descartados') cls = cls.filter(c => (c.priority || 5) === 6);

  // Filtro por fase actual (set desde el buscador global). 'all' = sin filtro.
  if (phase && phase !== 'all') cls = cls.filter(c => currentTask(c, tasks)?.phase === phase);

  // Resolver label/color de la fase activa para el pill
  let phaseInfo = null;
  if (phase && phase !== 'all') {
    if (PHASES[phase]) {
      phaseInfo = { label: PHASES[phase].label, color: PHASES[phase].color };
    } else {
      // Buscar en customPhases de cualquier cliente
      for (const c of clients) {
        const p = (c.customPhases || []).find(x => x.id === phase);
        if (p) { phaseInfo = { label: p.label, color: p.color }; break; }
      }
    }
  }

  let lastPrio = null;

  // ── Drag&drop handlers (solo si isAdmin) ──
  const handleDragStart = (e, c) => {
    if (!isAdmin) { e.preventDefault(); return; }
    setDragId(c.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', c.id);
  };
  const handleDragOverRow = (e, c) => {
    if (!isAdmin || !dragId || dragId === c.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(c.id);
    setDragOverPrio(null);
  };
  const handleDragOverDivider = (e, prio) => {
    if (!isAdmin || !dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPrio(prio);
    setDragOverId(null);
  };
  const clearDrag = () => { setDragId(null); setDragOverId(null); setDragOverPrio(null); };
  const handleDropOnRow = async (e, targetClient) => {
    if (!isAdmin || !dragId || dragId === targetClient.id) { clearDrag(); return; }
    e.preventDefault();
    const dragged = visibleClients.find(c => c.id === dragId);
    if (!dragged) { clearDrag(); return; }
    // Insertar ARRIBA del target. Buscar el cliente que queda inmediatamente arriba del target en la lista ordenada.
    const idx = cls.findIndex(c => c.id === targetClient.id);
    const above = idx > 0 ? cls[idx - 1] : null;
    const prevPosition = targetClient.position ?? 0;
    const nextPosition = above && above.id !== dragId ? (above.position ?? 0) : null;
    const newPriority = targetClient.priority || 5;
    await reorderClient(dragId, { prevPosition, nextPosition, newPriority });
    clearDrag();
  };
  const handleDropOnDivider = async (e, prio) => {
    if (!isAdmin || !dragId) { clearDrag(); return; }
    e.preventDefault();
    // Soltar arriba de TODA la seccion prio: position justo encima del primero de esa seccion.
    const firstOfPrio = cls.find(c => (c.priority || 5) === prio && c.id !== dragId);
    if (firstOfPrio) {
      await reorderClient(dragId, { prevPosition: firstOfPrio.position ?? 0, newPriority: prio });
    } else {
      // seccion vacia: usar prio*100000 como base
      await reorderClient(dragId, { prevPosition: prio * 100000, newPriority: prio });
    }
    clearDrag();
  };

  return (
    <div>
      {/* Tabs: Lista / Publicidad (Informe oculto a pedido del user) */}
      <div className="inline-flex items-center p-1 bg-gray-100 rounded-lg gap-0.5 mb-4 max-md:w-full">
        {[
          { id: 'lista',      label: 'Lista',      Icon: Users },
          { id: 'publicidad', label: 'Publicidad', Icon: Megaphone },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[12px] font-semibold font-sans transition-all max-md:flex-1 max-md:justify-center ${
              tab === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.Icon size={14} strokeWidth={tab === t.id ? 2.25 : 1.75} className="shrink-0" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Publicidad tab — embed full PublicidadPage */}
      {tab === 'publicidad' && <PublicidadPage />}

      {/* Informe tab — embed full InformePage */}
      {tab === 'informe' && <InformePage />}

      {/* Lista tab — KPIs + filters + client list */}
      {tab === 'lista' && (<>
      <KpiRow items={[
        { label: 'Clientes activos', value: t, color: 'var(--color-blue)' },
        { label: 'Críticos / Urgentes', value: b, color: 'var(--color-red)' },
        { label: 'Ads lanzados', value: l, color: 'var(--color-green)' },
        { label: 'Nuevos', value: n, color: 'var(--color-purple)' },
      ]} />

      {/* Filters */}
      <div className="flex gap-1.5 items-center mb-4 flex-wrap max-md:gap-1 max-md:mb-3">
        {filterDefs.map(f => (
          <button
            key={f.key}
            className={`py-1.5 px-3.5 rounded-full border text-xs cursor-pointer font-sans transition-all duration-150 max-md:py-1 max-md:px-2.5 max-md:text-[11px] ${filter === f.key ? 'bg-blue text-white border-blue' : 'bg-white text-text2 border-border hover:border-blue hover:text-text'}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Pill de filtro por fase (activado desde el buscador global) */}
      {phaseInfo && (
        <div className="mb-3 -mt-1 flex items-center gap-2">
          <span className="text-[11px] text-text3">Filtrando por fase:</span>
          <button
            onClick={() => setPhase('all')}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide rounded-full px-2.5 py-1 cursor-pointer border-none font-sans hover:opacity-90 transition-opacity"
            style={{ background: phaseInfo.color + '20', color: phaseInfo.color }}
            title="Quitar filtro"
          >
            {phaseInfo.label}
            <span className="text-[14px] leading-none">×</span>
          </button>
        </div>
      )}

      {/* Client list */}
      {!cls.length && (
        <div className="text-center text-text3 text-xs py-[60px]">Sin resultados</div>
      )}
      {/* Header de columnas (solo desktop) */}
      {cls.length > 0 && (
        <div className="hidden md:grid items-center gap-3 py-2 px-4 mb-1 grid-cols-[36px_minmax(140px,1.4fr)_140px_minmax(200px,2fr)_110px_20px] text-[10px] font-bold uppercase tracking-wider text-text3">
          <span></span>
          <span>Cliente</span>
          <span>Fase</span>
          <span>Pendiente para avanzar</span>
          <span>Publicidad</span>
          <span></span>
        </div>
      )}
      {cls.map(c => {
        const p = c.priority || 5;
        const pcfg = getPriorityLabel(p);
        const cur = currentTask(c, tasks);
        const pct = progress(c, tasks);
        const days = daysAgo(c.startDate);
        const pill = clientPill(c, tasks);

        // Fase activa actual: la primera fase no completada (o "Lanzado" si todas est\u00E1n done).
        const allPhases = getAllPhases(c);
        const phaseKey = cur?.phase;
        const phaseCfg = phaseKey ? allPhases[phaseKey] : null;
        const phaseLabel = phaseCfg?.label || 'Lanzado';
        const phaseColor = phaseCfg?.color || '#9CA3AF';

        let prioLabel = null;
        if (p !== lastPrio) {
          lastPrio = p;
          const isHotDivider = isAdmin && dragOverPrio === p;
          prioLabel = (
            <div
              className={`text-[10px] font-bold uppercase tracking-[1.5px] py-2 pb-1.5 flex items-center gap-2 transition-colors rounded-md ${isHotDivider ? 'bg-blue-50 ring-2 ring-blue-300 px-2 -mx-2' : ''}`}
              style={{ color: pcfg.color }}
              onDragOver={(e) => handleDragOverDivider(e, p)}
              onDragLeave={() => setDragOverPrio(null)}
              onDrop={(e) => handleDropOnDivider(e, p)}
            >
              {pcfg.label}
              <span className="flex-1 h-px bg-border" />
            </div>
          );
        }

        return (
          <div key={c.id}>
            {prioLabel}
            <div
              draggable={isAdmin}
              onDragStart={(e) => handleDragStart(e, c)}
              onDragOver={(e) => handleDragOverRow(e, c)}
              onDragLeave={() => setDragOverId(prev => prev === c.id ? null : prev)}
              onDragEnd={clearDrag}
              onDrop={(e) => handleDropOnRow(e, c)}
              className={`group/row grid items-center gap-3 py-3 px-4 bg-white border rounded-xl mb-1.5 cursor-pointer transition-all duration-150 hover:border-blue hover:shadow-sm grid-cols-[36px_minmax(140px,1.4fr)_140px_minmax(200px,2fr)_110px_20px] max-md:gap-2 max-md:py-2.5 max-md:px-3 max-md:grid-cols-[30px_1fr_20px] ${
                dragId === c.id ? 'opacity-40 scale-[0.99] border-border' :
                dragOverId === c.id ? 'border-blue-400 -translate-y-px shadow-md' : 'border-border'
              }`}
              onClick={() => setSelectedId(c.id)}
            >
              {c.avatarUrl ? (
                <img
                  src={c.avatarUrl}
                  alt={c.name}
                  className="w-[34px] h-[34px] rounded-full object-cover max-md:w-[30px] max-md:h-[30px]"
                />
              ) : (
                <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center font-bold text-[11px] max-md:w-[30px] max-md:h-[30px] max-md:text-[10px]" style={{ background: c.color + '15', color: c.color }}>
                  {initials(c.name)}
                </div>
              )}
              {/* Col 1: nombre + empresa */}
              <div className="min-w-0 relative">
                {isAdmin && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute -left-3 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 opacity-0 group-hover/row:opacity-100 transition-opacity max-md:hidden"
                    title="Arrastrá para reordenar (solo admin)"
                  >
                    <GripVertical size={14} />
                  </div>
                )}
                <div className="font-semibold text-[13px] max-md:text-[12px] flex items-center gap-1 flex-wrap">
                  <span className="truncate">{c.name}</span> <span className="font-normal text-[11px] text-text3 max-md:text-[10px] truncate">{c.company}</span>
                </div>
                {/* Mobile-only: fase + ads inline */}
                <div className="hidden max-md:flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span
                    className="text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5"
                    style={{ background: phaseColor + '15', color: phaseColor }}
                  >{phaseLabel}</span>
                  <AdsBadge client={c} />
                </div>
              </div>
              {/* Col 2: fase */}
              <div className="max-md:hidden min-w-0 overflow-hidden">
                <span
                  className="inline-block max-w-full truncate align-middle text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5"
                  style={{ background: phaseColor + '15', color: phaseColor }}
                  title={phaseLabel}
                >{phaseLabel}</span>
              </div>
              {/* Col 3: pendiente editable */}
              <div className="max-md:hidden min-w-0">
                <PendienteCell client={c} onSave={(v) => updateClient(c.id, { bottleneck: v })} />
              </div>
              {/* Col 4: publicidad */}
              <div className="max-md:hidden flex justify-start">
                <AdsBadge client={c} />
              </div>
              <div className="text-text3 text-center max-md:self-center">&rsaquo;</div>
            </div>
          </div>
        );
      })}
      </>)}
    </div>
  );
}