import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { isInDueRange } from '../../utils/helpers';
import ClientRoadmapPanel from './ClientRoadmapPanel';

const EXPANDED_KEY = 'tareas_roadmap_expanded';

export default function RoadmapView() {
  const {
    clients,
    tasks,
    setView,
    setSelectedId,
    taskClientFilter,
    taskPriority,
    taskAssignee,
    taskDueFilter,
    hideCompletedTasks,
    hideBlockedTasks,
    getPriorityLabel,
  } = useApp();

  // Expanded state persisted
  const [expanded, setExpanded] = useState(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded)); } catch {}
  }, [expanded]);

  const isKorexClient = (c) => /empresa|korex/i.test(c.name);

  // Active clients (no descartados salvo filtro explicito). Korex se muestra con estilo distinto.
  let filteredClients = clients.filter(c => c.status !== 'completed');

  if (taskClientFilter !== 'all') {
    filteredClients = filteredClients.filter(c => c.id === taskClientFilter);
  }

  if (taskPriority !== 'all') {
    filteredClients = filteredClients.filter(c => String(c.priority || 5) === taskPriority);
  } else {
    filteredClients = filteredClients.filter(c => (c.priority || 5) !== 6);
  }

  // Filtro integral: ocultar clientes cuyas tareas NO sobrevivan a TODOS los filtros activos.
  // Si despues de aplicar assignee + hideCompleted + hideBlocked + dueFilter no queda ninguna
  // tarea visible, el cliente se esconde del roadmap (no se muestra la card vacia).
  {
    const matchesAssignee = (t) => {
      if (taskAssignee === 'all') return true;
      if (!t.assignee) return false;
      const parts = t.assignee.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      return parts.includes(taskAssignee.toLowerCase());
    };
    const isBlocked = (t) => {
      if (t.status === 'blocked') return true;
      if (t.dependsOn && t.dependsOn.length > 0) {
        return t.dependsOn.some(depId => {
          const dep = tasks.find(x => x.id === depId || x.templateId === depId);
          return dep && dep.status !== 'done';
        });
      }
      return false;
    };
    const anyFilterActive = taskAssignee !== 'all' || hideCompletedTasks || hideBlockedTasks || (taskDueFilter && taskDueFilter !== 'all');
    if (anyFilterActive) {
      filteredClients = filteredClients.filter(c => {
        const clientTasks = tasks.filter(t => t.clientId === c.id);
        return clientTasks.some(t => {
          if (!matchesAssignee(t)) return false;
          if (hideCompletedTasks && t.status === 'done') return false;
          if (hideBlockedTasks && isBlocked(t)) return false;
          if (taskDueFilter && taskDueFilter !== 'all') {
            if (!t.dueDate || !isInDueRange(t.dueDate, taskDueFilter)) return false;
          }
          return true;
        });
      });
    }
  }

  const clientProgress = (c) => {
    const cTasks = tasks.filter(t => t.clientId === c.id);
    if (cTasks.length === 0) return 0;
    return Math.round(cTasks.filter(t => t.status === 'done').length / cTasks.length * 100);
  };

  // Orden: Korex primero, luego prioridad → progreso
  filteredClients = [...filteredClients].sort((a, b) => {
    const ka = isKorexClient(a) ? 0 : 1;
    const kb = isKorexClient(b) ? 0 : 1;
    if (ka !== kb) return ka - kb;
    const pa = a.priority || 5;
    const pb = b.priority || 5;
    if (pa !== pb) return pa - pb;
    return clientProgress(a) - clientProgress(b);
  });

  // Auto-expandir primer Super Prioritario al entrar
  useEffect(() => {
    if (Object.keys(expanded).length === 0) {
      const active = clients.filter(c => c.status !== 'completed' && !isKorexClient(c));
      const first = active.find(c => c.priority === 1) || active[0];
      if (first) setExpanded({ [first.id]: true });
    }
    // eslint-disable-next-line
  }, []);

  // Si hay filtro de cliente, forzar expandido
  const isForceExpanded = taskClientFilter !== 'all';

  const toggleExpand = (clientId) => {
    setExpanded(prev => ({ ...prev, [clientId]: !prev[clientId] }));
  };

  const openInClientDetail = (clientId) => {
    setSelectedId(clientId);
    setView('clients');
  };

  if (filteredClients.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
        No hay clientes que coincidan con los filtros
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filteredClients.map(c => {
        const isExpanded = isForceExpanded || !!expanded[c.id];
        const pct = clientProgress(c);
        const prio = getPriorityLabel(c.priority || 5);
        const isCompleted = pct === 100;
        const isKorex = isKorexClient(c);

        return (
          <div
            key={c.id}
            className={`border rounded-xl overflow-hidden transition-all ${
              isKorex
                ? 'bg-slate-50 border-slate-300 hover:border-slate-400 border-l-[5px] border-l-slate-700'
                : isCompleted
                  ? 'bg-white opacity-60 border-gray-100'
                  : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            {/* Client header — grid para alinear badge column siempre en el mismo x */}
            <div
              className={`grid grid-cols-[14px_32px_minmax(0,1fr)_140px_auto_auto] items-center gap-3 p-3 cursor-pointer transition-colors ${isKorex ? 'hover:bg-slate-100' : 'hover:bg-gray-50'}`}
              onClick={() => toggleExpand(c.id)}
            >
              <span className={`text-[10px] text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                {'\u25B6'}
              </span>

              {isKorex ? (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[14px] shrink-0 bg-slate-700"
                  title="Empresa Korex"
                >{'\uD83C\uDFE2'}</div>
              ) : c.avatarUrl ? (
                <img src={c.avatarUrl} alt={c.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[11px] shrink-0"
                  style={{ background: c.color || '#5B7CF5' }}
                >
                  {c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              )}

              {/* Col 3: Name + company (flex-1) */}
              <div className="min-w-0">
                <div className={`text-[13px] font-bold truncate ${isKorex ? 'text-slate-800' : 'text-gray-800'}`}>{c.name}</div>
                <div className="text-[10px] text-gray-400 truncate">{c.company}</div>
              </div>

              {/* Col 4: Badge column — ancho fijo para alinear SIEMPRE en el mismo x */}
              <div className="flex items-center">
                {isKorex ? (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase whitespace-nowrap bg-slate-700 text-white">
                    {'\uD83C\uDFE2'} INTERNO
                  </span>
                ) : prio ? (
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase whitespace-nowrap"
                    style={{ background: prio.color + '18', color: prio.color }}
                  >
                    {prio.label}
                  </span>
                ) : null}
              </div>

              {/* Col 5: Progress bar */}
              <div className="flex items-center gap-2 max-md:hidden">
                <div className="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: pct === 100 ? '#22C55E' : (isKorex ? '#475569' : '#5B7CF5') }}
                  />
                </div>
                <span className="text-[11px] font-semibold text-gray-600 w-8 text-right">{pct}%</span>
              </div>

              {/* Col 6: Open button */}
              <button
                className="text-[11px] text-gray-400 hover:text-blue-500 px-2 py-1 rounded hover:bg-blue-50 font-sans shrink-0"
                onClick={(e) => { e.stopPropagation(); openInClientDetail(c.id); }}
                title="Abrir perfil del cliente"
              >
                {'\u2197'}
              </button>
            </div>

            {/* Expanded body — roadmap completo del cliente */}
            {isExpanded && (
              <div className="border-t border-gray-100 bg-gray-50/30">
                <ClientRoadmapPanel
                  client={c}
                  assigneeFilter={taskAssignee}
                  hideCompleted={hideCompletedTasks}
                  hideBlocked={hideBlockedTasks}
                  dueFilter={taskDueFilter}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
