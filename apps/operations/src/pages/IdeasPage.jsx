import { useState, useMemo } from 'react';
import { Lightbulb, Plus, Search, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import KpiRow from '../components/KpiRow';
import TeamAvatar from '../components/TeamAvatar';
import CrearIdeaModal from '../components/ideas/CrearIdeaModal';

const DEPARTMENTS = {
  marketing:   { label: 'Marketing',    color: '#5B7CF5', bg: '#EEF2FF' },
  operaciones: { label: 'Operaciones',  color: '#22C55E', bg: '#ECFDF5' },
  ventas:      { label: 'Ventas',       color: '#F97316', bg: '#FFF7ED' },
  finanzas:    { label: 'Finanzas',     color: '#EAB308', bg: '#FEFCE8' },
  legalidad:   { label: 'Legalidad',    color: '#8B5CF6', bg: '#F5F3FF' },
};

const STATUSES = {
  pending:       { label: 'Pendiente',           color: '#9CA3AF', bg: '#F3F4F6' },
  'in-progress': { label: 'En proceso',          color: '#5B7CF5', bg: '#EEF2FF' },
  future:        { label: 'Futura implementación', color: '#EAB308', bg: '#FEFCE8' },
  implemented:   { label: 'Implementada',        color: '#22C55E', bg: '#ECFDF5' },
  discarded:     { label: 'Descartada',          color: '#EF4444', bg: '#FEF2F2' },
};
const STATUS_KEYS = ['pending', 'in-progress', 'future', 'implemented', 'discarded'];

function fmtRelative(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'hoy';
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays} días`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

export default function IdeasPage() {
  const { ideas, teamMembers, currentUser, addIdea, updateIdea, deleteIdea } = useApp();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
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

  const kpis = useMemo(() => {
    const total = (ideas || []).length;
    const pending = (ideas || []).filter(i => i.status === 'pending').length;
    const inProgress = (ideas || []).filter(i => i.status === 'in-progress').length;
    const implemented = (ideas || []).filter(i => i.status === 'implemented').length;
    return [
      { label: 'Total', value: total, color: '#6B7280' },
      { label: 'Pendientes', value: pending, color: '#9CA3AF' },
      { label: 'En proceso', value: inProgress, color: '#5B7CF5' },
      { label: 'Implementadas', value: implemented, color: '#22C55E' },
    ];
  }, [ideas]);

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta idea?')) return;
    await deleteIdea(id);
    if (expandedId === id) setExpandedId(null);
  };

  const canEditOrDelete = (idea) => {
    return isAdmin || idea.author_id === currentUser?.id;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-gray-800 flex items-center gap-2">
            <Lightbulb size={20} className="text-yellow-500" /> Cajón de ideas
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Ideas del equipo etiquetadas por departamento. {(ideas || []).length} ideas registradas.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setCreating(true); }}
          className="flex items-center gap-1.5 text-[12px] text-white bg-blue-500 hover:bg-blue-600 border-none rounded-lg py-2 px-3 cursor-pointer font-sans font-semibold transition-colors"
        >
          <Plus size={14} /> Nueva idea
        </button>
      </div>

      <KpiRow items={kpis} />

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Departamento */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
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

        {/* Estado */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-[11px] border border-gray-200 rounded-lg py-1.5 px-2.5 font-sans outline-none focus:border-blue-400 bg-white text-gray-700"
        >
          <option value="all">Todos los estados</option>
          {STATUS_KEYS.map(k => (
            <option key={k} value={k}>{STATUSES[k].label}</option>
          ))}
        </select>

        {/* Search */}
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="text-[11px] border border-gray-200 rounded-lg py-1.5 pl-7 pr-3 font-sans outline-none focus:border-blue-400 bg-white text-gray-700 w-[180px]"
          />
        </div>
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
          const status = STATUSES[idea.status] || STATUSES.pending;
          const author = memberById[idea.author_id];
          const expanded = expandedId === idea.id;
          const editingThisStatus = editingStatusId === idea.id;

          return (
            <div key={idea.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                onClick={() => setExpandedId(expanded ? null : idea.id)}
              >
                {/* Pill departamento */}
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
                    <span className="text-[10px] text-gray-400">{fmtRelative(idea.created_at)}</span>
                  </div>
                </div>

                {/* Estado: dropdown si admin/COO, pill read-only si no */}
                <div className="shrink-0" onClick={e => e.stopPropagation()}>
                  {isAdmin && editingThisStatus ? (
                    <div className="flex flex-col gap-0.5">
                      {STATUS_KEYS.map(k => (
                        <button
                          key={k}
                          onClick={() => {
                            updateIdea(idea.id, { status: k });
                            setEditingStatusId(null);
                          }}
                          className={`text-[9px] font-bold rounded-full px-2 py-0.5 border-none cursor-pointer font-sans uppercase tracking-wide transition-colors text-left ${
                            k === idea.status ? 'ring-1 ring-offset-1 ring-gray-400' : 'opacity-70 hover:opacity-100'
                          }`}
                          style={{ background: STATUSES[k].bg, color: STATUSES[k].color }}
                        >{STATUSES[k].label}</button>
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
                      onClick={() => { setEditing(idea); setCreating(true); }}
                      className="mt-3 text-[11px] text-blue-600 hover:underline bg-transparent border-none cursor-pointer p-0"
                    >Editar idea</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <CrearIdeaModal
        open={creating}
        onClose={() => { setCreating(false); setEditing(null); }}
        idea={editing}
      />
    </div>
  );
}
