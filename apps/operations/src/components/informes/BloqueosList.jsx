import { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import TeamAvatar from '../TeamAvatar';
import { Check, RotateCcw, AlertCircle, Search } from 'lucide-react';

function fmtRelative(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'hoy';
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays} días`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function fmtAbsolute(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' });
  } catch { return ''; }
}

export default function BloqueosList() {
  const { teamBlockers, teamMembers, resolveBlocker, unresolveBlocker } = useApp();
  const [statusFilter, setStatusFilter] = useState('open'); // open | resolved | all
  const [userFilter, setUserFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = [...(teamBlockers || [])];
    if (statusFilter === 'open') list = list.filter(b => !b.resolved);
    if (statusFilter === 'resolved') list = list.filter(b => b.resolved);
    if (userFilter !== 'all') list = list.filter(b => b.user_id === userFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        (b.description || '').toLowerCase().includes(q) ||
        (b.needs || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [teamBlockers, statusFilter, userFilter, search]);

  const memberById = useMemo(() => {
    const map = {};
    (teamMembers || []).forEach(m => { map[m.id] = m; });
    return map;
  }, [teamMembers]);

  const usersWithBlockers = useMemo(() => {
    const set = new Set((teamBlockers || []).map(b => b.user_id));
    return (teamMembers || []).filter(m => set.has(m.id));
  }, [teamBlockers, teamMembers]);

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
          {[
            { key: 'open', label: 'Abiertos', color: '#EF4444' },
            { key: 'resolved', label: 'Resueltos', color: '#16A34A' },
            { key: 'all', label: 'Todos', color: '#6B7280' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border-none cursor-pointer font-sans transition-colors ${
                statusFilter === f.key ? 'text-white' : 'bg-transparent text-gray-500 hover:bg-gray-100'
              }`}
              style={statusFilter === f.key ? { background: f.color } : {}}
            >{f.label}</button>
          ))}
        </div>

        {usersWithBlockers.length > 0 && (
          <select
            value={userFilter}
            onChange={e => setUserFilter(e.target.value)}
            className="text-[11px] border border-gray-200 rounded-lg py-1.5 px-2.5 font-sans outline-none focus:border-blue-400 bg-white text-gray-700"
          >
            <option value="all">Todos los usuarios</option>
            {usersWithBlockers.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}

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
          <AlertCircle size={32} className="text-gray-300 mx-auto mb-2" />
          <div className="text-[13px] text-gray-500 font-medium">
            {statusFilter === 'open' ? '¡No hay bloqueos abiertos!' : 'Sin resultados'}
          </div>
          {statusFilter === 'open' && (
            <div className="text-[11px] text-gray-400 mt-1">El equipo está fluyendo bien.</div>
          )}
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {filtered.map(b => {
          const author = memberById[b.user_id];
          return (
            <div
              key={b.id}
              className={`bg-white border rounded-xl px-4 py-3 ${
                b.resolved ? 'border-green-200 bg-green-50/30' : 'border-red-200'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Toggle resuelto */}
                <button
                  type="button"
                  onClick={() => b.resolved ? unresolveBlocker(b.id) : resolveBlocker(b.id)}
                  className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center cursor-pointer transition-colors mt-0.5 ${
                    b.resolved ? 'bg-green-500 border-green-500 hover:bg-green-600 hover:border-green-600'
                      : 'bg-white border-gray-300 hover:border-green-400'
                  }`}
                  title={b.resolved ? 'Marcar como abierto' : 'Marcar como resuelto'}
                >
                  {b.resolved && <Check size={14} className="text-white" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] font-semibold text-gray-800 ${b.resolved ? 'line-through text-gray-500' : ''}`}>
                    {b.description}
                  </div>
                  <div className="text-[12px] text-gray-600 mt-1">
                    <span className="font-semibold">Propuesta de mejora: </span>{b.needs}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {author && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                        <TeamAvatar member={{ ...author, avatar: author.avatar_url || author.avatar }} size={14} />
                        {author.name}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400" title={fmtAbsolute(b.created_at)}>
                      cargado {fmtRelative(b.created_at)}
                    </span>
                    {b.resolved && b.resolved_at && (
                      <span className="text-[10px] text-green-600">
                        ✓ resuelto {fmtRelative(b.resolved_at)}
                      </span>
                    )}
                  </div>
                </div>

                {b.resolved && (
                  <button
                    type="button"
                    onClick={() => unresolveBlocker(b.id)}
                    className="shrink-0 text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer"
                    title="Reabrir"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
