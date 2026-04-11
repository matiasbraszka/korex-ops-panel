import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { PRIO_CLIENT } from '../../utils/constants';
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
    hideCompletedTasks,
    hideBlockedTasks,
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

  // Active clients (no Korex, no descartados salvo filtro explicito)
  let filteredClients = clients.filter(c => c.status !== 'completed' && !isKorexClient(c));

  if (taskClientFilter !== 'all') {
    filteredClients = filteredClients.filter(c => c.id === taskClientFilter);
  }

  if (taskPriority !== 'all') {
    filteredClients = filteredClients.filter(c => String(c.priority || 5) === taskPriority);
  } else {
    filteredClients = filteredClients.filter(c => (c.priority || 5) !== 6);
  }

  // Para filtro de encargado: mostrar solo clientes que tengan al menos una tarea del encargado
  if (taskAssignee !== 'all') {
    const matches = (t) => {
      if (!t.assignee) return false;
      const parts = t.assignee.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      return parts.includes(taskAssignee.toLowerCase());
    };
    filteredClients = filteredClients.filter(c => tasks.some(t => t.clientId === c.id && matches(t)));
  }

  const clientProgress = (c) => {
    const cTasks = tasks.filter(t => t.clientId === c.id);
    if (cTasks.length === 0) return 0;
    return Math.round(cTasks.filter(t => t.status === 'done').length / cTasks.length * 100);
  };

  // Orden: prioridad → progreso
  filteredClients = [...filteredClients].sort((a, b) => {
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
        const prio = PRIO_CLIENT[c.priority || 5];
        const isCompleted = pct === 100;

        return (
          <div
            key={c.id}
            className={`bg-white border rounded-xl overflow-hidden transition-all ${
              isCompleted ? 'opacity-60 border-gray-100' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            {/* Client header */}
            <div
              className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleExpand(c.id)}
            >
              <span className={`text-[10px] text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                {'\u25B6'}
              </span>

              {c.avatarUrl ? (
                <img src={c.avatarUrl} alt={c.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[11px] shrink-0"
                  style={{ background: c.color || '#5B7CF5' }}
                >
                  {c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-bold text-gray-800 truncate">{c.name}</span>
                  {prio && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0"
                      style={{ background: prio.color + '18', color: prio.color }}
                    >
                      {prio.label}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-gray-400 truncate">{c.company}</div>
              </div>

              <div className="shrink-0 flex items-center gap-2 max-md:hidden">
                <div className="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: pct === 100 ? '#22C55E' : '#5B7CF5' }}
                  />
                </div>
                <span className="text-[11px] font-semibold text-gray-600 w-8 text-right">{pct}%</span>
              </div>

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
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
