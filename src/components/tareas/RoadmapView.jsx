import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { PHASES, PRIO_CLIENT, TEAM, TASK_STATUS } from '../../utils/constants';
import { getAllPhases, fmtDate, today } from '../../utils/helpers';
import TeamAvatar from '../TeamAvatar';

const EXPANDED_KEY = 'tareas_roadmap_expanded';

export default function RoadmapView() {
  const { clients, tasks, updateTask, updateClient, setView, setSelectedId } = useApp();

  // Filters
  const [filterClient, setFilterClient] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterPM, setFilterPM] = useState('all');

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

  // Inline editing state
  const [editingDeadline, setEditingDeadline] = useState(null); // `${clientId}_${phaseKey}`
  const [editingTaskDue, setEditingTaskDue] = useState(null); // taskId

  const now = today();

  // Filter Korex internal client
  const isKorexClient = (c) => /empresa|korex/i.test(c.name);

  // Active clients (not completed, not Korex)
  const activeClients = clients
    .filter(c => c.status !== 'completed' && !isKorexClient(c));

  // Apply filters
  let filteredClients = activeClients;
  if (filterClient !== 'all') {
    filteredClients = filteredClients.filter(c => c.id === filterClient);
  }
  if (filterPriority !== 'all') {
    filteredClients = filteredClients.filter(c => String(c.priority) === filterPriority);
  }
  if (filterPM !== 'all') {
    filteredClients = filteredClients.filter(c => (c.pm || '').toLowerCase() === filterPM.toLowerCase());
  }

  // Compute progress per client
  const clientProgress = (c) => {
    const cTasks = tasks.filter(t => t.clientId === c.id);
    if (cTasks.length === 0) return 0;
    return Math.round(cTasks.filter(t => t.status === 'done').length / cTasks.length * 100);
  };

  // Sort: by priority asc, then by progress asc (less progress first)
  filteredClients = [...filteredClients].sort((a, b) => {
    const pa = a.priority || 4;
    const pb = b.priority || 4;
    if (pa !== pb) return pa - pb;
    return clientProgress(a) - clientProgress(b);
  });

  // Auto-expand first Super Prioritario on first load if nothing expanded
  useEffect(() => {
    if (Object.keys(expanded).length === 0 && activeClients.length > 0) {
      const first = activeClients.find(c => c.priority === 1) || activeClients[0];
      if (first) setExpanded({ [first.id]: true });
    }
    // eslint-disable-next-line
  }, []);

  // When filtering to a single client, force expand
  const isForceExpanded = filterClient !== 'all';

  const toggleExpand = (clientId) => {
    setExpanded(prev => ({ ...prev, [clientId]: !prev[clientId] }));
  };

  const handleDeadlineChange = (clientId, phaseKey, value) => {
    const c = clients.find(x => x.id === clientId);
    if (!c) return;
    const deadlines = { ...(c.phaseDeadlines || {}), [phaseKey]: value };
    updateClient(clientId, { phaseDeadlines: deadlines });
    setEditingDeadline(null);
  };

  const handleTaskDueChange = (taskId, value) => {
    updateTask(taskId, { dueDate: value });
    setEditingTaskDue(null);
  };

  const cycleTaskStatus = (t) => {
    const order = ['backlog', 'in-progress', 'en-revision', 'done'];
    const cur = order.indexOf(t.status);
    const next = order[(cur + 1) % order.length];
    const updates = { status: next };
    if (next === 'done') updates.completedDate = now;
    if (next === 'in-progress' && !t.startedDate) updates.startedDate = now;
    updateTask(t.id, updates);
  };

  const openInClientDetail = (clientId) => {
    setSelectedId(clientId);
    setView('clients');
  };

  // PM options from clients
  const pmOptions = [...new Set(activeClients.map(c => c.pm).filter(Boolean))];

  return (
    <div className="space-y-3">
      {/* Filters bar */}
      <div className="flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-lg p-2 sticky top-0 z-10">
        <span className="text-[11px] font-semibold text-gray-500 px-1">Filtrar:</span>
        <select
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          className="text-[12px] py-1 px-2 rounded-md border border-gray-200 bg-white font-sans outline-none hover:border-gray-300 cursor-pointer"
        >
          <option value="all">Todos los clientes</option>
          {activeClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="text-[12px] py-1 px-2 rounded-md border border-gray-200 bg-white font-sans outline-none hover:border-gray-300 cursor-pointer"
        >
          <option value="all">Todas las prioridades</option>
          {Object.entries(PRIO_CLIENT).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={filterPM}
          onChange={(e) => setFilterPM(e.target.value)}
          className="text-[12px] py-1 px-2 rounded-md border border-gray-200 bg-white font-sans outline-none hover:border-gray-300 cursor-pointer"
        >
          <option value="all">Todos los PM</option>
          {pmOptions.map(pm => <option key={pm} value={pm}>{pm}</option>)}
        </select>
        <div className="ml-auto text-[11px] text-gray-400">
          {filteredClients.length} cliente{filteredClients.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Client cards */}
      {filteredClients.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          No hay clientes que coincidan con los filtros
        </div>
      ) : filteredClients.map(c => {
        const isExpanded = isForceExpanded || !!expanded[c.id];
        const progress = clientProgress(c);
        const prio = PRIO_CLIENT[c.priority || 4];
        const clientTasks = tasks.filter(t => t.clientId === c.id);
        const allPh = getAllPhases(c);
        const deadlines = c.phaseDeadlines || {};

        // Group tasks by phase
        const resolvePhase = (t) => t.phase || '_unphased';
        const phaseKeys = [...Object.keys(allPh)];
        const phaseGroups = phaseKeys.map(phaseKey => {
          const phInfo = allPh[phaseKey] || { label: phaseKey, color: '#9CA3AF' };
          const phaseTasks = clientTasks.filter(t => resolvePhase(t) === phaseKey);
          const totalCount = phaseTasks.length;
          const doneCount = phaseTasks.filter(t => t.status === 'done').length;
          const allDone = totalCount > 0 && doneCount === totalCount;
          const deadline = deadlines[phaseKey];
          const isOverdue = deadline && deadline < now && !allDone;
          return { phaseKey, phInfo, phaseTasks, totalCount, doneCount, allDone, deadline, isOverdue };
        }).filter(g => g.totalCount > 0);

        const isCompleted = progress === 100;

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
              {/* Expand arrow */}
              <span
                className={`text-[10px] text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              >
                {'\u25B6'}
              </span>

              {/* Avatar */}
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

              {/* Name + company */}
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
                <div className="text-[10px] text-gray-400 truncate">
                  {c.company} {c.pm ? `\u00b7 PM: ${c.pm}` : ''}
                </div>
              </div>

              {/* Progress */}
              <div className="shrink-0 flex items-center gap-2 max-md:hidden">
                <div className="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${progress}%`, background: progress === 100 ? '#22C55E' : '#5B7CF5' }}
                  />
                </div>
                <span className="text-[11px] font-semibold text-gray-600 w-8 text-right">{progress}%</span>
              </div>

              {/* Open in detail button */}
              <button
                className="text-[10px] text-gray-400 hover:text-blue-500 px-2 py-1 rounded hover:bg-blue-50 font-sans shrink-0"
                onClick={(e) => { e.stopPropagation(); openInClientDetail(c.id); }}
                title="Abrir perfil del cliente"
              >
                {'\u2197'}
              </button>
            </div>

            {/* Expanded body */}
            {isExpanded && (
              <div className="border-t border-gray-100 bg-gray-50/30">
                {phaseGroups.length === 0 ? (
                  <div className="text-center text-gray-400 text-[11px] py-6">Sin tareas asignadas</div>
                ) : phaseGroups.map(g => (
                  <div key={g.phaseKey} className="border-b border-gray-100 last:border-b-0">
                    {/* Phase header */}
                    <div className="flex items-center gap-2 px-4 py-2 bg-white">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: g.phInfo.color }} />
                      <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: g.phInfo.color }}>
                        {g.phInfo.label}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {g.doneCount}/{g.totalCount}
                      </span>
                      {g.allDone && <span className="text-[10px] text-green-500">{'\u2713'}</span>}

                      {/* Phase deadline */}
                      <div className="ml-auto">
                        {editingDeadline === `${c.id}_${g.phaseKey}` ? (
                          <input
                            type="date"
                            className="border border-blue-300 rounded text-[10px] px-1 outline-none w-[115px]"
                            defaultValue={g.deadline || ''}
                            autoFocus
                            onChange={(e) => e.target.value && handleDeadlineChange(c.id, g.phaseKey, e.target.value)}
                            onBlur={() => setEditingDeadline(null)}
                          />
                        ) : g.deadline ? (
                          <button
                            className={`text-[10px] font-semibold hover:underline font-sans ${g.isOverdue ? 'text-red-500' : 'text-gray-500'}`}
                            onClick={() => setEditingDeadline(`${c.id}_${g.phaseKey}`)}
                          >
                            {'\uD83D\uDCC5'} {fmtDate(g.deadline)}
                          </button>
                        ) : (
                          <button
                            className="text-[10px] text-blue-400 hover:text-blue-600 font-sans"
                            onClick={() => setEditingDeadline(`${c.id}_${g.phaseKey}`)}
                          >
                            + deadline
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Phase tasks */}
                    <div className="divide-y divide-gray-100">
                      {g.phaseTasks.map(t => {
                        const members = (t.assignee ? t.assignee.split(',').map(s => s.trim()).filter(Boolean) : [])
                          .map(name => TEAM.find(m => m.name.toLowerCase() === name.toLowerCase() || m.id === name))
                          .filter(Boolean);
                        const taskStatus = TASK_STATUS[t.status];
                        const isOverdue = t.dueDate && t.status !== 'done' && t.dueDate < now;

                        return (
                          <div
                            key={t.id}
                            className={`flex items-center gap-2 px-4 py-2 hover:bg-white ${t.status === 'done' ? 'opacity-60' : ''}`}
                          >
                            {/* Status icon (click to cycle) */}
                            <button
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 cursor-pointer"
                              style={{
                                background: (taskStatus?.color || '#9CA3AF') + '15',
                                color: taskStatus?.color || '#9CA3AF',
                                border: `1.5px solid ${taskStatus?.color || '#9CA3AF'}`,
                              }}
                              title={taskStatus?.label}
                              onClick={() => cycleTaskStatus(t)}
                            >
                              {taskStatus?.icon || '\u25CB'}
                            </button>

                            {/* Title */}
                            <span
                              className={`text-[12px] flex-1 min-w-0 ${
                                t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700'
                              }`}
                            >
                              {t.title}
                            </span>

                            {/* Assignees */}
                            {members.length > 0 && (
                              <div className="flex -space-x-1 shrink-0">
                                {members.slice(0, 3).map(m => (
                                  <TeamAvatar key={m.id} member={m} size={18} className="ring-2 ring-white" />
                                ))}
                                {members.length > 3 && (
                                  <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-bold bg-gray-200 text-gray-600 ring-2 ring-white">
                                    +{members.length - 3}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Due date */}
                            <div className="shrink-0 w-[105px] text-right">
                              {editingTaskDue === t.id ? (
                                <input
                                  type="date"
                                  className="border border-blue-300 rounded text-[10px] px-1 outline-none w-[100px]"
                                  defaultValue={t.dueDate || ''}
                                  autoFocus
                                  onChange={(e) => e.target.value && handleTaskDueChange(t.id, e.target.value)}
                                  onBlur={() => setEditingTaskDue(null)}
                                />
                              ) : t.dueDate ? (
                                <button
                                  className={`text-[10px] font-semibold hover:underline font-sans ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}
                                  onClick={() => setEditingTaskDue(t.id)}
                                >
                                  {fmtDate(t.dueDate)}
                                </button>
                              ) : (
                                <button
                                  className="text-[10px] text-blue-300 hover:text-blue-500 font-sans opacity-0 group-hover:opacity-100"
                                  onClick={() => setEditingTaskDue(t.id)}
                                >
                                  {'\uD83D\uDCC5'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
