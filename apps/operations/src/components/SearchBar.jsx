import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { PHASES } from '../utils/constants';
import { currentTask, isTaskEnabled } from '../utils/helpers';

/**
 * Buscador global. Busca:
 *  - Clientes (por nombre / empresa / servicio / canal de Slack)
 *  - Tareas (por título / notas / descripción / asignee)
 *  - Fases (por label, default + customPhases de cualquier cliente)
 *
 * Cmd+K (o Ctrl+K) lo abre desde cualquier página.
 * - Click en cliente → abre el detalle del cliente
 * - Click en tarea → filtra tareas por cliente y va a Tareas
 * - Click en fase → filtra clientes por fase actual y va a Clientes
 */
export default function SearchBar() {
  const { clients, tasks, setView, setSelectedId, setTaskClientFilter, setPhase } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
        setQuery('');
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Catálogo de fases combinado: default PHASES + customPhases de todos los clientes (dedup por id)
  const allPhases = useMemo(() => {
    const map = {};
    Object.entries(PHASES).forEach(([id, v]) => {
      map[id] = { id, label: v.label, color: v.color };
    });
    (clients || []).forEach(c => {
      (c.customPhases || []).forEach(p => {
        if (!map[p.id]) map[p.id] = { id: p.id, label: p.label, color: p.color };
      });
    });
    return Object.values(map);
  }, [clients]);

  // Cuántos clientes activos están en cada fase ahora mismo (para mostrar contador)
  const clientsByPhase = useMemo(() => {
    const counts = {};
    (clients || []).forEach(c => {
      if (c.status !== 'active') return;
      const ph = currentTask(c, tasks)?.phase;
      if (!ph) return;
      counts[ph] = (counts[ph] || 0) + 1;
    });
    return counts;
  }, [clients, tasks]);

  // Estados de tarea que NO se consideran "activas" (las ocultamos del buscador):
  // - 'done' / 'blocked' / 'retrasadas' por status explícito
  // - Tareas no habilitadas por dependencias pendientes (isTaskEnabled === false)
  const INACTIVE_STATUSES = new Set(['done', 'blocked', 'retrasadas']);

  const results = useMemo(() => {
    if (!query.trim()) return { clients: [], tasks: [], phases: [] };
    const q = query.toLowerCase();
    const matches = (s) => (s || '').toLowerCase().includes(q);

    const matchedTasks = (tasks || [])
      .filter(t => matches(t.title) || matches(t.notes) || matches(t.description) || matches(t.assignee))
      // Solo tareas activas: ni done/blocked/retrasadas, ni bloqueadas por dependencias
      .filter(t => !INACTIVE_STATUSES.has(t.status) && isTaskEnabled(t, tasks))
      .slice(0, 6);

    // Solo fases que tienen al menos un cliente activo en ellas (no fases vacías)
    const matchedPhases = allPhases
      .filter(p => matches(p.label) && (clientsByPhase[p.id] || 0) > 0)
      .slice(0, 5);

    return {
      clients: (clients || [])
        .filter(c => matches(c.name) || matches(c.company) || matches(c.service) || matches(c.slackChannel))
        .slice(0, 5),
      tasks: matchedTasks,
      phases: matchedPhases,
    };
  }, [query, clients, tasks, allPhases, clientsByPhase]);

  const allResults = [
    ...results.phases.map(p => ({ type: 'phase', data: p })),
    ...results.clients.map(c => ({ type: 'client', data: c })),
    ...results.tasks.map(t => ({ type: 'task', data: t })),
  ];
  const hasResults = allResults.length > 0;
  const showDropdown = open && query.trim().length > 0;

  const handleSelect = (item) => {
    if (item.type === 'client') {
      setSelectedId(item.data.id);
      setView('clients');
      navigate('/operations/clients');
    } else if (item.type === 'task') {
      setTaskClientFilter(item.data.clientId);
      setView('tasks');
      navigate('/operations/tasks');
    } else if (item.type === 'phase') {
      // Filtrar clientes activos por fase actual
      setPhase(item.data.id);
      setSelectedId(null);
      setView('clients');
      navigate('/operations/clients');
    }
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || !hasResults) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(prev => Math.min(prev + 1, allResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(allResults[highlightIdx]);
    }
  };

  // Reset highlight on query change
  useEffect(() => { setHighlightIdx(0); }, [query]);

  // Lookup helpers
  const clientName = (clientId) => {
    const c = (clients || []).find(x => x.id === clientId);
    return c ? c.name : '';
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Search input */}
      <div className={`flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-1.5 transition-all ${open ? 'border-blue-400 shadow-sm w-[320px] max-md:w-full' : 'border-gray-200 w-[200px] max-md:w-10'} max-md:${open ? 'absolute right-0 top-0 z-50 bg-white w-[calc(100vw-40px)]' : ''}`}>
        <Search size={14} className="text-gray-400 shrink-0 cursor-pointer" onClick={() => { setOpen(true); inputRef.current?.focus(); }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar clientes, tareas o fases…"
          className={`bg-transparent border-none outline-none text-[12px] font-sans text-gray-800 flex-1 min-w-0 ${open ? '' : 'max-md:hidden'}`}
        />
        {!open && (
          <span className="text-[10px] text-gray-400 bg-gray-100 border border-gray-200 rounded px-1 py-[1px] font-mono shrink-0 max-md:hidden">
            {navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}K
          </span>
        )}
        {open && query && (
          <button
            type="button"
            className="bg-transparent border-none text-gray-400 hover:text-gray-700 cursor-pointer p-0.5"
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden max-h-[440px] overflow-y-auto">
          {!hasResults && (
            <div className="text-xs text-gray-400 text-center py-6">Sin resultados para "{query}"</div>
          )}

          {/* Fases */}
          {results.phases.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-gray-400 uppercase px-3 pt-2.5 pb-1">Fases</div>
              {results.phases.map((p, i) => {
                const globalIdx = i;
                const count = clientsByPhase[p.id] || 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`w-full text-left flex items-center gap-2.5 py-2 px-3 text-[12px] cursor-pointer border-none font-sans transition-colors ${highlightIdx === globalIdx ? 'bg-blue-50 text-blue-700' : 'bg-transparent text-gray-800 hover:bg-gray-50'}`}
                    onClick={() => handleSelect({ type: 'phase', data: p })}
                    onMouseEnter={() => setHighlightIdx(globalIdx)}
                  >
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: (p.color || '#6B7280') + '20', color: p.color || '#6B7280' }}
                    >
                      <Layers size={12} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{p.label}</div>
                      <div className="text-[10px] text-gray-400">
                        {count} cliente{count !== 1 ? 's' : ''} activo{count !== 1 ? 's' : ''} en esta fase
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Clientes */}
          {results.clients.length > 0 && (
            <div className={results.phases.length > 0 ? 'border-t border-gray-100' : ''}>
              <div className="text-[10px] font-semibold text-gray-400 uppercase px-3 pt-2.5 pb-1">Clientes</div>
              {results.clients.map((c, i) => {
                const globalIdx = results.phases.length + i;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`w-full text-left flex items-center gap-2.5 py-2 px-3 text-[12px] cursor-pointer border-none font-sans transition-colors ${highlightIdx === globalIdx ? 'bg-blue-50 text-blue-700' : 'bg-transparent text-gray-800 hover:bg-gray-50'}`}
                    onClick={() => handleSelect({ type: 'client', data: c })}
                    onMouseEnter={() => setHighlightIdx(globalIdx)}
                  >
                    {c.avatarUrl ? (
                      <img src={c.avatarUrl} alt={c.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ background: c.color || '#5B7CF5' }}>
                        {c.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{c.name}</div>
                      {(c.company || c.service) && (
                        <div className="text-[10px] text-gray-400 truncate">
                          {c.company}{c.company && c.service ? ' · ' : ''}{c.service}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Tareas */}
          {results.tasks.length > 0 && (
            <div className={(results.phases.length + results.clients.length) > 0 ? 'border-t border-gray-100' : ''}>
              <div className="text-[10px] font-semibold text-gray-400 uppercase px-3 pt-2.5 pb-1">Tareas</div>
              {results.tasks.map((t, i) => {
                const globalIdx = results.phases.length + results.clients.length + i;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`w-full text-left flex items-center gap-2.5 py-2 px-3 text-[12px] cursor-pointer border-none font-sans transition-colors ${highlightIdx === globalIdx ? 'bg-blue-50 text-blue-700' : 'bg-transparent text-gray-800 hover:bg-gray-50'}`}
                    onClick={() => handleSelect({ type: 'task', data: t })}
                    onMouseEnter={() => setHighlightIdx(globalIdx)}
                  >
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 text-[11px] bg-gray-100 shrink-0">{'🗒'}</span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t.title}</div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {clientName(t.clientId)}{t.assignee ? ` · ${t.assignee}` : ''}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
