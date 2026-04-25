import { useState } from 'react';
import { Search, X, Flame, SlidersHorizontal } from 'lucide-react';

// Barra de filtros minimal: buscador siempre visible + botón "Filtros" que
// despliega un panel con los selects (etapa, asignado, score).
export default function CrmFilters({ filters, setFilters, stages, salesTeam, hideSearch = false, compact = false }) {
  const [open, setOpen] = useState(false);

  const activeCount =
    (filters.stageId ? 1 : 0) +
    (filters.assigneeId ? 1 : 0) +
    (filters.scores?.length ? 1 : 0);

  const hasAny = !!(filters.search || activeCount > 0);

  const toggleScore = (n) => {
    const set = new Set(filters.scores || []);
    if (set.has(n)) set.delete(n); else set.add(n);
    setFilters((f) => ({ ...f, scores: [...set] }));
  };

  const clear = () => setFilters({ search: '', stageId: '', assigneeId: '', scores: [] });

  return (
    <div className={compact ? 'relative' : 'space-y-2'}>
      {/* Fila principal: buscador + boton filtros */}
      <div className={`flex items-center gap-2 ${compact ? '' : 'flex-wrap'}`}>
        {!hideSearch && (
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3" />
            <input
              value={filters.search || ''}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Buscar nombre, empresa, email o teléfono…"
              className="w-full pl-7 pr-2 py-1.5 text-[12px] text-text bg-white border border-border rounded-md outline-none focus:border-blue placeholder:text-text3"
            />
          </div>
        )}

        <button onClick={() => setOpen((v) => !v)}
                className={`flex items-center gap-1.5 ${compact ? 'py-1 px-2.5 text-[10.5px] rounded-full' : 'py-1.5 px-3 text-[12px] rounded-md'} border ${activeCount > 0 ? 'border-blue text-blue bg-blue-bg' : 'border-border text-text2 bg-white hover:bg-surface2'}`}>
          <SlidersHorizontal size={12} />
          Filtros
          {activeCount > 0 && (
            <span className="bg-blue text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 inline-flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>

        {hasAny && (
          <button onClick={clear} title="Limpiar filtros"
                  className="text-text3 hover:text-red bg-transparent border-0 p-1 cursor-pointer flex items-center gap-1 text-[11px]">
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* Panel desplegado */}
      {open && (
        <div className={`bg-white border border-border rounded-md p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ${compact ? 'absolute right-0 mt-2 z-30 shadow-lg w-[480px] max-w-[90vw]' : ''}`}
             style={compact ? { position: 'absolute' } : undefined}>
          <Field label="Etapa">
            <select value={filters.stageId || ''}
                    onChange={(e) => setFilters((f) => ({ ...f, stageId: e.target.value }))}
                    className={selectCls}>
              <option value="">Todas</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>

          <Field label="Asignado a">
            <select value={filters.assigneeId || ''}
                    onChange={(e) => setFilters((f) => ({ ...f, assigneeId: e.target.value }))}
                    className={selectCls}>
              <option value="">Todos</option>
              {salesTeam.map((tm) => <option key={tm.user_id} value={tm.user_id}>{tm.name}</option>)}
            </select>
          </Field>

          <Field label="Probabilidad">
            <div className="flex items-center gap-1 px-1 py-1 bg-bg border border-border rounded-md w-fit">
              {[1, 2, 3].map((n) => {
                const active = filters.scores?.includes(n);
                return (
                  <button key={n} type="button" onClick={() => toggleScore(n)}
                          title={`${n}/3`}
                          className={`p-1 rounded ${active ? 'bg-orange-100' : 'hover:bg-surface2'}`}>
                    <Flame size={14}
                           fill={active ? '#F97316' : 'transparent'}
                           stroke={active ? '#F97316' : '#9CA3AF'}
                           strokeWidth={1.75} />
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-text3 uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  );
}

// text-text explicito + appearance-none asegura que el <select> nativo no
// tome estilos del OS (en algunos Android/iOS el texto se renderiza blanco).
const selectCls = 'w-full text-[12px] text-text py-1.5 px-2 bg-white border border-border rounded-md outline-none focus:border-blue cursor-pointer appearance-none';
