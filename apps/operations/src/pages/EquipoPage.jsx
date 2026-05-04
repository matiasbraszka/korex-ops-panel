import { useState, useMemo } from 'react';
import { Sparkles, Plus, AlertCircle, Calendar, Trash2, ChevronDown, ChevronUp, Lightbulb, Search, FileText } from 'lucide-react';
import { useApp } from '../context/AppContext';
import TeamAvatar from '../components/TeamAvatar';
import CrearInformeModal from '../components/informes/CrearInformeModal';
import BloqueosList from '../components/informes/BloqueosList';
import CrearIdeaModal from '../components/ideas/CrearIdeaModal';

// ── helpers de fecha ──────────────────────────────────────────────────────
function fmtReportDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return dateStr; }
}

function fmtRelative(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'hoy';
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays} días`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function fmtAbsolute(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleString('es-AR', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// ── catálogos ─────────────────────────────────────────────────────────────
const DEPARTMENTS = {
  marketing:   { label: 'Marketing',    color: '#5B7CF5', bg: '#EEF2FF' },
  operaciones: { label: 'Operaciones',  color: '#22C55E', bg: '#ECFDF5' },
  ventas:      { label: 'Ventas',       color: '#F97316', bg: '#FFF7ED' },
  finanzas:    { label: 'Finanzas',     color: '#EAB308', bg: '#FEFCE8' },
  legalidad:   { label: 'Legalidad',    color: '#8B5CF6', bg: '#F5F3FF' },
};

const IDEA_STATUSES = {
  pending:       { label: 'Pendiente',           color: '#9CA3AF', bg: '#F3F4F6' },
  'in-progress': { label: 'En proceso',          color: '#5B7CF5', bg: '#EEF2FF' },
  future:        { label: 'Futura implementación', color: '#EAB308', bg: '#FEFCE8' },
  implemented:   { label: 'Implementada',        color: '#22C55E', bg: '#ECFDF5' },
  discarded:     { label: 'Descartada',          color: '#EF4444', bg: '#FEF2F2' },
};
const IDEA_STATUS_KEYS = ['pending', 'in-progress', 'future', 'implemented', 'discarded'];

// ── sub-vista: Informes ───────────────────────────────────────────────────
function InformesView({ openCreateInforme }) {
  const { teamReports, teamBlockers, teamMembers, clients, currentUser, deleteTeamReport } = useApp();
  const [reportType, setReportType] = useState('daily'); // daily | weekly
  const [userFilter, setUserFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

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

  const blockersByReport = useMemo(() => {
    const map = {};
    (teamBlockers || []).forEach(b => {
      if (!map[b.report_id]) map[b.report_id] = [];
      map[b.report_id].push(b);
    });
    return map;
  }, [teamBlockers]);

  const filteredReports = useMemo(() => {
    let list = (teamReports || []).filter(r => r.report_type === reportType);
    if (userFilter !== 'all') list = list.filter(r => r.user_id === userFilter);
    return list.sort((a, b) =>
      (b.report_date || '').localeCompare(a.report_date || '') ||
      (b.created_at || '').localeCompare(a.created_at || '')
    );
  }, [teamReports, reportType, userFilter]);

  const usersWithReports = useMemo(() => {
    const set = new Set((teamReports || []).map(r => r.user_id));
    return (teamMembers || []).filter(m => set.has(m.id));
  }, [teamReports, teamMembers]);

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este informe? También se borrarán los bloqueos asociados.')) return;
    await deleteTeamReport(id);
    if (expandedId === id) setExpandedId(null);
  };

  const canDelete = (report) =>
    currentUser?.id === report.user_id || currentUser?.isAdmin || currentUser?.role === 'COO';

  return (
    <div className="space-y-3">
      {/* Sub-filtros: tipo + usuario + crear */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
          {[
            { key: 'daily', label: 'Diarios' },
            { key: 'weekly', label: 'Semanales' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setReportType(t.key)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border-none cursor-pointer font-sans transition-colors ${
                reportType === t.key ? 'bg-blue-500 text-white' : 'bg-transparent text-gray-500 hover:bg-gray-100'
              }`}
            >{t.label}</button>
          ))}
        </div>

        {usersWithReports.length > 1 && (
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
        )}

        <button
          onClick={() => openCreateInforme(reportType)}
          className="ml-auto flex items-center gap-1.5 text-[11px] text-white bg-blue-500 hover:bg-blue-600 border-none rounded-lg py-1.5 px-2.5 cursor-pointer font-sans font-semibold transition-colors"
        >
          <Plus size={12} /> Crear informe {reportType === 'daily' ? 'diario' : 'semanal'}
        </button>
      </div>

      {/* Empty */}
      {filteredReports.length === 0 && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-xl">
          <Calendar size={32} className="text-gray-300 mx-auto mb-2" />
          <div className="text-[13px] text-gray-500 font-medium">
            Sin informes {reportType === 'daily' ? 'diarios' : 'semanales'} todavía.
          </div>
          <div className="text-[11px] text-gray-400 mt-1">Sé el primero en subir uno.</div>
        </div>
      )}

      {/* Cards */}
      <div className="space-y-2">
        {filteredReports.map(r => {
          const author = memberById[r.user_id];
          const expanded = expandedId === r.id;
          const blockers = blockersByReport[r.id] || [];
          const items = Array.isArray(r.progress_by_client) ? r.progress_by_client : [];

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
                    <span className="text-[11px] text-gray-400">· {fmtReportDate(r.report_date)}</span>
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
                    {(() => {
                      const total = items.reduce((acc, p) => acc + (parseInt(p.minutes, 10) || 0), 0);
                      if (!total) return null;
                      const label = total < 60 ? `${total} min` : `${Math.floor(total / 60)}h${total % 60 ? ` ${total % 60}m` : ''}`;
                      return (
                        <span className="text-[9px] font-semibold rounded-full px-2 py-0.5 bg-gray-100 text-gray-600 inline-flex items-center gap-1">
                          ⏱ {label}
                        </span>
                      );
                    })()}
                  </div>
                  {/* Preview: primer avance */}
                  <div className="text-[12px] text-gray-600 mt-1 truncate">
                    {items.length > 0 ? (items[0].text || '—') : (r.progress_today || '—')}
                  </div>
                  {/* Chips de cliente */}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {items.map((p, i) => {
                      if (p.client_id === null) {
                        return (
                          <span key={'i_' + i} className="text-[10px] text-purple-600 bg-purple-50 rounded-full px-1.5 py-0.5 font-medium">
                            Korex – Interno
                          </span>
                        );
                      }
                      const c = clientById[p.client_id];
                      if (!c) return null;
                      return (
                        <span key={p.client_id} className="text-[10px] text-blue-600 bg-blue-50 rounded-full px-1.5 py-0.5 font-medium">
                          {c.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className="text-[10px] text-gray-400 whitespace-nowrap"
                    title={fmtAbsolute(r.created_at)}
                  >
                    cargado {fmtRelative(r.created_at)}
                  </span>
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

              {expanded && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/30 space-y-3">
                  {/* Avances por cliente (formato nuevo) */}
                  {items.length > 0 && (() => {
                    const fmtMin = (m) => {
                      const n = parseInt(m, 10) || 0;
                      if (!n) return null;
                      if (n < 60) return `${n} min`;
                      const h = Math.floor(n / 60);
                      const r = n % 60;
                      return r === 0 ? `${h}h` : `${h}h ${r}m`;
                    };
                    const total = items.reduce((acc, p) => acc + (parseInt(p.minutes, 10) || 0), 0);
                    return (
                      <div className="space-y-2">
                        {items.map((p, i) => {
                          const isInternal = p.client_id === null;
                          const c = isInternal ? null : clientById[p.client_id];
                          const label = isInternal ? 'Korex – Interno' : (c?.name || 'Cliente desconocido');
                          const minLabel = fmtMin(p.minutes);
                          return (
                            <div key={i} className="bg-white border border-gray-100 rounded-md p-2.5">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className={`text-[10px] font-bold uppercase tracking-wide ${isInternal ? 'text-purple-700' : 'text-blue-700'}`}>
                                  {label}
                                </div>
                                {minLabel && (
                                  <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 whitespace-nowrap">
                                    ⏱ {minLabel}
                                  </span>
                                )}
                              </div>
                              <div className="text-[13px] text-gray-700 whitespace-pre-wrap">{p.text || '—'}</div>
                            </div>
                          );
                        })}
                        {total > 0 && (
                          <div className="flex items-center justify-end gap-2 pt-1">
                            <span className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Tiempo total</span>
                            <span className="text-[12px] font-bold text-gray-700">{fmtMin(total)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Fallback legacy: si no hay progress_by_client pero sí progress_today, mostrarlo */}
                  {items.length === 0 && r.progress_today && (
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Qué avanzó</div>
                      <div className="text-[13px] text-gray-700 whitespace-pre-wrap">{r.progress_today}</div>
                    </div>
                  )}

                  {/* Mañana (solo daily) */}
                  {r.report_type === 'daily' && r.next_day && (
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Qué va a avanzar mañana</div>
                      <div className="text-[13px] text-gray-700 whitespace-pre-wrap">{r.next_day}</div>
                    </div>
                  )}

                  {/* Bloqueos */}
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
                              <span className="font-semibold">Propuesta de mejora:</span> {b.needs}
                            </div>
                            {b.resolved && <div className="text-[10px] text-green-600 mt-0.5">✓ Resuelto</div>}
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
    </div>
  );
}

// ── sub-vista: Ideas ──────────────────────────────────────────────────────
function IdeasView({ openCreateIdea, openEditIdea }) {
  const { ideas, teamMembers, currentUser, updateIdea, deleteIdea } = useApp();
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [editingStatusId, setEditingStatusId] = useState(null);

  const isAdmin = !!(currentUser?.isAdmin || currentUser?.role === 'COO');

  const memberById = useMemo(() => {
    const map = {};
    (teamMembers || []).forEach(m => { map[m.id] = m; });
    return map;
  }, [teamMembers]);

  const filtered = useMemo(() => {
    let list = [...(ideas || [])];
    if (departmentFilter !== 'all') list = list.filter(i => i.department === departmentFilter);
    if (statusFilter !== 'all') list = list.filter(i => i.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [ideas, departmentFilter, statusFilter, search]);

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta idea?')) return;
    await deleteIdea(id);
    if (expandedId === id) setExpandedId(null);
  };

  const canEditOrDelete = (idea) => isAdmin || idea.author_id === currentUser?.id;

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5 flex-wrap">
          <button
            onClick={() => setDepartmentFilter('all')}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border-none cursor-pointer font-sans transition-colors ${
              departmentFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-transparent text-gray-500 hover:bg-gray-100'
            }`}
          >Todos</button>
          {Object.entries(DEPARTMENTS).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setDepartmentFilter(departmentFilter === key ? 'all' : key)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border-none cursor-pointer font-sans transition-colors ${
                departmentFilter === key ? 'text-white' : 'bg-transparent hover:bg-gray-100'
              }`}
              style={departmentFilter === key ? { background: cfg.color, color: 'white' } : { color: cfg.color }}
            >{cfg.label}</button>
          ))}
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-[11px] border border-gray-200 rounded-lg py-1.5 px-2.5 font-sans outline-none focus:border-blue-400 bg-white text-gray-700"
        >
          <option value="all">Todos los estados</option>
          {IDEA_STATUS_KEYS.map(k => (
            <option key={k} value={k}>{IDEA_STATUSES[k].label}</option>
          ))}
        </select>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="text-[11px] border border-gray-200 rounded-lg py-1.5 pl-7 pr-3 font-sans outline-none focus:border-blue-400 bg-white text-gray-700 w-[160px]"
          />
        </div>

        <button
          onClick={() => openCreateIdea()}
          className="ml-auto flex items-center gap-1.5 text-[11px] text-white bg-blue-500 hover:bg-blue-600 border-none rounded-lg py-1.5 px-2.5 cursor-pointer font-sans font-semibold transition-colors"
        >
          <Plus size={12} /> Nueva idea
        </button>
      </div>

      {/* Empty */}
      {filtered.length === 0 && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-xl">
          <Lightbulb size={32} className="text-gray-300 mx-auto mb-2" />
          <div className="text-[13px] text-gray-500 font-medium">
            {(ideas || []).length === 0 ? 'Sin ideas todavía.' : 'Sin resultados para estos filtros.'}
          </div>
          {(ideas || []).length === 0 && (
            <div className="text-[11px] text-gray-400 mt-1">Compartí la primera idea con el equipo.</div>
          )}
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {filtered.map(idea => {
          const dept = DEPARTMENTS[idea.department] || DEPARTMENTS.operaciones;
          const status = IDEA_STATUSES[idea.status] || IDEA_STATUSES.pending;
          const author = memberById[idea.author_id];
          const expanded = expandedId === idea.id;
          const editingThisStatus = editingStatusId === idea.id;

          return (
            <div key={idea.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                onClick={() => setExpandedId(expanded ? null : idea.id)}
              >
                <span
                  className="text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0 mt-0.5 uppercase tracking-wide"
                  style={{ background: dept.bg, color: dept.color }}
                >{dept.label}</span>

                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-gray-800">{idea.title}</div>
                  {idea.description && !expanded && (
                    <div className="text-[12px] text-gray-500 mt-0.5 truncate">{idea.description}</div>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {author && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                        <TeamAvatar member={{ ...author, avatar: author.avatar_url || author.avatar }} size={14} />
                        {author.name}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400" title={fmtAbsolute(idea.created_at)}>
                      cargado {fmtRelative(idea.created_at)}
                    </span>
                  </div>
                </div>

                <div className="shrink-0" onClick={e => e.stopPropagation()}>
                  {isAdmin && editingThisStatus ? (
                    <div className="flex flex-col gap-0.5">
                      {IDEA_STATUS_KEYS.map(k => (
                        <button
                          key={k}
                          onClick={() => { updateIdea(idea.id, { status: k }); setEditingStatusId(null); }}
                          className={`text-[9px] font-bold rounded-full px-2 py-0.5 border-none cursor-pointer font-sans uppercase tracking-wide transition-colors text-left ${
                            k === idea.status ? 'ring-1 ring-offset-1 ring-gray-400' : 'opacity-70 hover:opacity-100'
                          }`}
                          style={{ background: IDEA_STATUSES[k].bg, color: IDEA_STATUSES[k].color }}
                        >{IDEA_STATUSES[k].label}</button>
                      ))}
                    </div>
                  ) : (
                    <span
                      className={`text-[10px] font-bold rounded-full px-2 py-0.5 uppercase tracking-wide ${isAdmin ? 'cursor-pointer hover:ring-1 hover:ring-gray-300' : ''}`}
                      style={{ background: status.bg, color: status.color }}
                      onClick={isAdmin ? (e) => { e.stopPropagation(); setEditingStatusId(idea.id); } : undefined}
                      title={isAdmin ? 'Click para cambiar estado' : 'Solo admin/COO puede cambiar el estado'}
                    >{status.label}</span>
                  )}
                </div>

                {canEditOrDelete(idea) && (
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(idea.id); }}
                    className="shrink-0 p-1.5 text-gray-400 hover:text-white hover:bg-red-500 bg-transparent border-none cursor-pointer rounded-md transition-colors"
                    title="Eliminar"
                  ><Trash2 size={14} /></button>
                )}
                {expanded ? <ChevronUp size={16} className="text-gray-400 shrink-0 mt-1" /> : <ChevronDown size={16} className="text-gray-400 shrink-0 mt-1" />}
              </div>

              {expanded && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/30">
                  {idea.description ? (
                    <div className="text-[13px] text-gray-700 whitespace-pre-wrap">{idea.description}</div>
                  ) : (
                    <div className="text-[12px] text-gray-400 italic">Sin descripción.</div>
                  )}
                  {canEditOrDelete(idea) && (
                    <button
                      onClick={() => openEditIdea(idea)}
                      className="mt-3 text-[11px] text-blue-600 hover:underline bg-transparent border-none cursor-pointer p-0"
                    >Editar idea</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── EquipoPage ────────────────────────────────────────────────────────────
export default function EquipoPage() {
  const [tab, setTab] = useState('informes'); // informes | bloqueos | ideas
  const [creatingInforme, setCreatingInforme] = useState(false);
  const [createInformeType, setCreateInformeType] = useState('daily');
  const [creatingIdea, setCreatingIdea] = useState(false);
  const [editingIdea, setEditingIdea] = useState(null);

  const openCreateInforme = (type = 'daily') => {
    setCreateInformeType(type);
    setCreatingInforme(true);
  };

  const openCreateIdea = () => {
    setEditingIdea(null);
    setCreatingIdea(true);
  };

  const openEditIdea = (idea) => {
    setEditingIdea(idea);
    setCreatingIdea(true);
  };

  const closeIdea = () => {
    setCreatingIdea(false);
    setEditingIdea(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-bold text-gray-800 flex items-center gap-2">
          <Sparkles size={20} className="text-amber-500" /> Accountability
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Informes diarios y semanales, bloqueos abiertos e ideas para mejorar el negocio.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5 w-fit">
        {[
          { key: 'informes', label: 'Informes', Icon: FileText },
          { key: 'bloqueos', label: 'Bloqueos', Icon: AlertCircle },
          { key: 'ideas',    label: 'Ideas',    Icon: Lightbulb },
        ].map(t => {
          const Icon = t.Icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-[12px] font-semibold px-3 py-1.5 rounded-md border-none cursor-pointer font-sans transition-colors flex items-center gap-1.5 ${
                tab === t.key ? 'bg-blue-500 text-white' : 'bg-transparent text-gray-500 hover:bg-gray-100'
              }`}
            ><Icon size={13} /> {t.label}</button>
          );
        })}
      </div>

      {/* Body por tab */}
      {tab === 'informes' && <InformesView openCreateInforme={openCreateInforme} />}
      {tab === 'bloqueos' && <BloqueosList />}
      {tab === 'ideas' && <IdeasView openCreateIdea={openCreateIdea} openEditIdea={openEditIdea} />}

      {/* Modales globales */}
      <CrearInformeModal
        open={creatingInforme}
        onClose={() => setCreatingInforme(false)}
        defaultType={createInformeType}
      />
      <CrearIdeaModal
        open={creatingIdea}
        onClose={closeIdea}
        idea={editingIdea}
      />
    </div>
  );
}
