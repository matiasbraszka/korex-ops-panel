import { useState, useMemo } from 'react';
import { FileText, Plus, AlertCircle, Calendar, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { today } from '../utils/helpers';
import KpiRow from '../components/KpiRow';
import TeamAvatar from '../components/TeamAvatar';
import CrearInformeModal from '../components/informes/CrearInformeModal';
import SemanaTracker from '../components/informes/SemanaTracker';
import BloqueosList from '../components/informes/BloqueosList';

function fmtDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return dateStr; }
}

function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default function InformesPage() {
  const { teamReports, teamBlockers, teamMembers, clients, currentUser, deleteTeamReport } = useApp();
  const [tab, setTab] = useState('daily'); // daily | weekly | bloqueos
  const [creating, setCreating] = useState(false);
  const [createType, setCreateType] = useState('daily');
  const [expandedId, setExpandedId] = useState(null);
  const [userFilter, setUserFilter] = useState('all');

  const memberById = useMemo(() => {
    const map = {};
    (teamMembers || []).forEach(m => { map[m.id] = m; });
    return map;
  }, [teamMembers]);

  const clientById = useMemo(() => {
    const map = {};
    (clients || []).forEach(c => { map[c.id] = c; });
    return map;
  }, [clients]);

  const todayStr = today();
  const monday = mondayOf(todayStr);

  // KPIs por tab
  const kpis = useMemo(() => {
    if (tab === 'daily') {
      const dailyReports = (teamReports || []).filter(r => r.report_type === 'daily');
      const today_count = dailyReports.filter(r => r.report_date === todayStr).length;
      const teamCount = (teamMembers || []).length;
      const fault_today = Math.max(0, teamCount - today_count);
      const this_week = dailyReports.filter(r => r.report_date >= monday).length;
      const open_blockers = (teamBlockers || []).filter(b => !b.resolved).length;
      return [
        { label: 'Subidos hoy', value: today_count, color: '#22C55E' },
        { label: 'Faltan hoy', value: fault_today, color: fault_today > 0 ? '#EF4444' : '#9CA3AF' },
        { label: 'Esta semana', value: this_week, color: '#5B7CF5' },
        { label: 'Bloqueos abiertos', value: open_blockers, color: open_blockers > 0 ? '#F97316' : '#9CA3AF' },
      ];
    }
    if (tab === 'weekly') {
      const weekly = (teamReports || []).filter(r => r.report_type === 'weekly');
      const thisWeek = weekly.filter(r => r.report_date === monday).length;
      const teamCount = (teamMembers || []).length;
      const lastWeekDate = (() => {
        const d = new Date(monday + 'T00:00:00'); d.setDate(d.getDate() - 7);
        return d.toISOString().slice(0, 10);
      })();
      const lastWeek = weekly.filter(r => r.report_date === lastWeekDate).length;
      const monthAgo = (() => {
        const d = new Date(monday + 'T00:00:00'); d.setDate(d.getDate() - 28);
        return d.toISOString().slice(0, 10);
      })();
      const lastMonthCount = weekly.filter(r => r.report_date >= monthAgo).length;
      return [
        { label: 'Esta semana', value: thisWeek, sub: `de ${teamCount}`, color: '#22C55E' },
        { label: 'Semana pasada', value: lastWeek, sub: `de ${teamCount}`, color: '#5B7CF5' },
        { label: 'Último mes', value: lastMonthCount, color: '#9CA3AF' },
        { label: 'Pendientes', value: Math.max(0, teamCount - thisWeek), color: thisWeek < teamCount ? '#EF4444' : '#9CA3AF' },
      ];
    }
    // bloqueos
    const open = (teamBlockers || []).filter(b => !b.resolved);
    const resolvedThisWeek = (teamBlockers || []).filter(b => b.resolved && b.resolved_at && new Date(b.resolved_at).toISOString().slice(0, 10) >= monday).length;
    const oldest = open.length > 0 ? open.reduce((a, b) => (a.created_at < b.created_at ? a : b)) : null;
    const oldestDays = oldest ? Math.floor((Date.now() - new Date(oldest.created_at).getTime()) / (24 * 60 * 60 * 1000)) : 0;
    const byClient = {};
    open.forEach(b => { if (b.client_id) byClient[b.client_id] = (byClient[b.client_id] || 0) + 1; });
    const topClient = Object.entries(byClient).sort(([, a], [, b]) => b - a)[0];
    return [
      { label: 'Abiertos', value: open.length, color: open.length > 0 ? '#EF4444' : '#9CA3AF' },
      { label: 'Resueltos esta semana', value: resolvedThisWeek, color: '#22C55E' },
      { label: 'Más antiguo', value: oldest ? `${oldestDays}d` : '—', color: oldestDays > 7 ? '#F97316' : '#9CA3AF' },
      { label: 'Cliente top', value: topClient ? (clientById[topClient[0]]?.name || '—').slice(0, 14) : '—', sub: topClient ? `${topClient[1]} bloqueos` : '', color: '#5B7CF5' },
    ];
  }, [tab, teamReports, teamBlockers, teamMembers, todayStr, monday, clientById]);

  // Reports filtrados por tab activa
  const filteredReports = useMemo(() => {
    if (tab === 'bloqueos') return [];
    let list = (teamReports || []).filter(r => r.report_type === tab);
    if (userFilter !== 'all') list = list.filter(r => r.user_id === userFilter);
    return list.sort((a, b) => (b.report_date || '').localeCompare(a.report_date || '') ||
      (b.created_at || '').localeCompare(a.created_at || ''));
  }, [teamReports, tab, userFilter]);

  // Bloqueos por report (para badge en lista)
  const blockersByReport = useMemo(() => {
    const map = {};
    (teamBlockers || []).forEach(b => {
      if (!map[b.report_id]) map[b.report_id] = [];
      map[b.report_id].push(b);
    });
    return map;
  }, [teamBlockers]);

  const usersWithReports = useMemo(() => {
    const set = new Set((teamReports || []).map(r => r.user_id));
    return (teamMembers || []).filter(m => set.has(m.id));
  }, [teamReports, teamMembers]);

  const openCreate = (type) => {
    setCreateType(type);
    setCreating(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este informe? También se borrarán los bloqueos asociados.')) return;
    await deleteTeamReport(id);
    if (expandedId === id) setExpandedId(null);
  };

  const canDelete = (report) => {
    return currentUser?.id === report.user_id || currentUser?.isAdmin || currentUser?.role === 'COO';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-gray-800 flex items-center gap-2">
            <FileText size={20} className="text-blue-500" /> Informes del equipo
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Cada persona sube su informe diario y semanal. {(teamReports || []).length} informes registrados.
          </p>
        </div>
        <button
          onClick={() => openCreate(tab === 'weekly' ? 'weekly' : 'daily')}
          className="flex items-center gap-1.5 text-[12px] text-white bg-blue-500 hover:bg-blue-600 border-none rounded-lg py-2 px-3 cursor-pointer font-sans font-semibold transition-colors"
        >
          <Plus size={14} /> Crear informe
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5 w-fit">
        {[
          { key: 'daily', label: 'Diarios' },
          { key: 'weekly', label: 'Semanales' },
          { key: 'bloqueos', label: 'Bloqueos' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-md border-none cursor-pointer font-sans transition-colors ${
              tab === t.key ? 'bg-blue-500 text-white' : 'bg-transparent text-gray-500 hover:bg-gray-100'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* KPIs */}
      <KpiRow items={kpis} />

      {/* Tab: bloqueos */}
      {tab === 'bloqueos' && <BloqueosList />}

      {/* Tab: daily/weekly */}
      {tab !== 'bloqueos' && (
        <>
          {/* SemanaTracker */}
          <SemanaTracker
            teamMembers={teamMembers}
            teamReports={teamReports}
            mode={tab}
            onClickCell={({ user, date, type, report }) => {
              if (report) {
                setExpandedId(report.id);
                // Scroll a la card luego (opcional)
              } else if (user.id === currentUser?.id) {
                openCreate(type);
              }
            }}
          />

          {/* Filtros */}
          {usersWithReports.length > 1 && (
            <div className="flex items-center gap-2">
              <select
                value={userFilter}
                onChange={e => setUserFilter(e.target.value)}
                className="text-[11px] border border-gray-200 rounded-lg py-1.5 px-2.5 font-sans outline-none focus:border-blue-400 bg-white text-gray-700"
              >
                <option value="all">Todos los usuarios</option>
                {usersWithReports.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Lista de informes */}
          {filteredReports.length === 0 && (
            <div className="text-center py-12 bg-white border border-gray-200 rounded-xl">
              <Calendar size={32} className="text-gray-300 mx-auto mb-2" />
              <div className="text-[13px] text-gray-500 font-medium">Sin informes {tab === 'daily' ? 'diarios' : 'semanales'} todavía.</div>
              <div className="text-[11px] text-gray-400 mt-1">Sé el primero en subir uno.</div>
            </div>
          )}

          <div className="space-y-2">
            {filteredReports.map(r => {
              const author = memberById[r.user_id];
              const expanded = expandedId === r.id;
              const blockers = blockersByReport[r.id] || [];
              const reportClients = (r.client_ids || []).map(id => clientById[id]).filter(Boolean);

              return (
                <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div
                    className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                    onClick={() => setExpandedId(expanded ? null : r.id)}
                  >
                    {author && (
                      <TeamAvatar
                        member={{ ...author, avatar: author.avatar_url || author.avatar }}
                        size={32}
                        className="shrink-0 mt-0.5"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-gray-800">{author?.name || r.user_id}</span>
                        <span className="text-[11px] text-gray-400">· {fmtDate(r.report_date)}</span>
                        {r.report_type === 'weekly' && (
                          <span className="text-[9px] font-bold rounded-full px-2 py-0.5 bg-purple-100 text-purple-700 uppercase tracking-wide">
                            Semanal
                          </span>
                        )}
                        {blockers.length > 0 && (
                          <span className="text-[9px] font-bold rounded-full px-2 py-0.5 bg-red-100 text-red-700 inline-flex items-center gap-1">
                            <AlertCircle size={10} /> {blockers.length} bloqueo{blockers.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {/* Preview */}
                      <div className="text-[12px] text-gray-600 mt-1 truncate">
                        {r.report_type === 'daily'
                          ? (r.progress_today || '—')
                          : (r.weekly_data?.achievements || r.weekly_data?.next_week || '—')}
                      </div>
                      {/* Chips de cliente */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {reportClients.map(c => (
                          <span key={c.id} className="text-[10px] text-blue-600 bg-blue-50 rounded-full px-1.5 py-0.5 font-medium">
                            {c.name}
                          </span>
                        ))}
                        {r.worked_internal && (
                          <span className="text-[10px] text-purple-600 bg-purple-50 rounded-full px-1.5 py-0.5 font-medium">
                            Korex – Interno
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {canDelete(r) && (
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(r.id); }}
                          className="p-1.5 text-gray-400 hover:text-white hover:bg-red-500 bg-transparent border-none cursor-pointer rounded-md transition-colors"
                          title="Eliminar"
                        ><Trash2 size={14} /></button>
                      )}
                      {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </div>
                  </div>

                  {/* Expandido */}
                  {expanded && (
                    <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/30 space-y-3">
                      {r.report_type === 'daily' ? (
                        <>
                          <div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Qué avanzó</div>
                            <div className="text-[13px] text-gray-700 whitespace-pre-wrap">{r.progress_today || '—'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Qué va a avanzar mañana</div>
                            <div className="text-[13px] text-gray-700 whitespace-pre-wrap">{r.next_day || '—'}</div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Logros</div>
                            <div className="text-[13px] text-gray-700 whitespace-pre-wrap">{r.weekly_data?.achievements || '—'}</div>
                          </div>
                          {r.weekly_data?.retro && (
                            <div>
                              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Retro / aprendizajes</div>
                              <div className="text-[13px] text-gray-700 whitespace-pre-wrap">{r.weekly_data.retro}</div>
                            </div>
                          )}
                          <div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Próxima semana</div>
                            <div className="text-[13px] text-gray-700 whitespace-pre-wrap">{r.weekly_data?.next_week || '—'}</div>
                          </div>
                        </>
                      )}
                      {blockers.length > 0 && (
                        <div>
                          <div className="text-[10px] font-bold text-red-700 uppercase tracking-wide mb-1.5">Bloqueos</div>
                          <div className="space-y-1.5">
                            {blockers.map(b => (
                              <div key={b.id} className="bg-white border border-red-100 rounded-md p-2 text-[12px]">
                                <div className={`font-semibold text-gray-800 ${b.resolved ? 'line-through text-gray-500' : ''}`}>
                                  {b.description}
                                </div>
                                <div className="text-gray-600 mt-0.5">
                                  <span className="font-semibold">Necesita:</span> {b.needs}
                                </div>
                                {b.resolved && (
                                  <div className="text-[10px] text-green-600 mt-0.5">✓ Resuelto</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <CrearInformeModal
        open={creating}
        onClose={() => setCreating(false)}
        defaultType={createType}
      />
    </div>
  );
}
