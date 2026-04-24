import { Search, X, Flame } from 'lucide-react';

// Barra de filtros del CRM. Estado controlado por el padre.
export default function CrmFilters({ filters, setFilters, stages, salesTeam }) {
  const hasActive = !!(
    filters.search ||
    filters.stageId ||
    filters.ownerId ||
    filters.setterId ||
    (filters.scores && filters.scores.length)
  );

  const toggleScore = (n) => {
    const set = new Set(filters.scores || []);
    if (set.has(n)) set.delete(n); else set.add(n);
    setFilters((f) => ({ ...f, scores: [...set] }));
  };

  const clear = () => setFilters({ search: '', stageId: '', ownerId: '', setterId: '', scores: [] });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Buscador */}
      <div className="relative flex-1 min-w-[200px] max-w-[280px]">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3" />
        <input
          value={filters.search || ''}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          placeholder="Buscar nombre o empresa…"
          className="w-full pl-7 pr-2 py-1.5 text-[12px] bg-bg border border-border rounded-md outline-none focus:border-blue"
        />
      </div>

      {/* Stage */}
      <select value={filters.stageId || ''}
              onChange={(e) => setFilters((f) => ({ ...f, stageId: e.target.value }))}
              className={selectCls}>
        <option value="">Todas las etapas</option>
        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      {/* Owner */}
      <select value={filters.ownerId || ''}
              onChange={(e) => setFilters((f) => ({ ...f, ownerId: e.target.value }))}
              className={selectCls}>
        <option value="">Todos los dueños</option>
        {salesTeam.map((tm) => <option key={tm.user_id} value={tm.user_id}>{tm.name}</option>)}
      </select>

      {/* Setter */}
      <select value={filters.setterId || ''}
              onChange={(e) => setFilters((f) => ({ ...f, setterId: e.target.value }))}
              className={selectCls}>
        <option value="">Todos los setters</option>
        {salesTeam.map((tm) => <option key={tm.user_id} value={tm.user_id}>{tm.name}</option>)}
      </select>

      {/* Score (multi) */}
      <div className="flex items-center gap-0.5 px-1 py-0.5 bg-bg border border-border rounded-md">
        {[1, 2, 3].map((n) => {
          const active = filters.scores?.includes(n);
          return (
            <button key={n} type="button" onClick={() => toggleScore(n)}
                    title={`${n}/3`}
                    className={`p-1 rounded ${active ? 'bg-orange-100' : 'hover:bg-surface2'}`}>
              <Flame size={12}
                     fill={active ? '#F97316' : 'transparent'}
                     stroke={active ? '#F97316' : '#9CA3AF'}
                     strokeWidth={1.75} />
            </button>
          );
        })}
      </div>

      {hasActive && (
        <button onClick={clear} title="Limpiar filtros"
                className="text-text3 hover:text-red bg-transparent border-0 p-1 cursor-pointer flex items-center gap-1 text-[11px]">
          <X size={12} /> Limpiar
        </button>
      )}
    </div>
  );
}

const selectCls = 'text-[12px] py-1.5 px-2 bg-bg border border-border rounded-md outline-none focus:border-blue cursor-pointer';
