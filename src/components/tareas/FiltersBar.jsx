import { useApp } from '../../context/AppContext';

export default function FiltersBar() {
  const {
    clients,
    taskClientFilter, setTaskClientFilter,
    taskAssignee, setTaskAssignee,
    taskPriority, setTaskPriority,
    taskDueFilter, setTaskDueFilter,
    teamMembers,
    hideCompletedTasks, setHideCompletedTasks,
    hideBlockedTasks, setHideBlockedTasks,
    getAllPriorityLabels,
  } = useApp();

  // Incluir Korex en el dropdown (aparece en roadmap/timeline con estilo distinto)
  const activeClients = clients.filter(c => c.status !== 'completed');

  const selectBase = 'text-[12px] py-1.5 px-2 rounded-md border border-gray-200 bg-white font-sans outline-none hover:border-gray-300 cursor-pointer max-md:flex-1';

  return (
    <div className="flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-lg p-2">
      <span className="text-[11px] font-semibold text-gray-500 px-1 shrink-0">Filtros:</span>

      <select
        value={taskClientFilter}
        onChange={(e) => setTaskClientFilter(e.target.value)}
        className={selectBase}
      >
        <option value="all">Todos los clientes</option>
        {activeClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      <select
        value={taskPriority}
        onChange={(e) => setTaskPriority(e.target.value)}
        className={selectBase}
      >
        <option value="all">Todas las prioridades</option>
        {Object.entries(getAllPriorityLabels()).map(([k, v]) => (
          <option key={k} value={k}>{v.label}</option>
        ))}
      </select>

      <select
        value={taskAssignee}
        onChange={(e) => setTaskAssignee(e.target.value)}
        className={selectBase}
      >
        <option value="all">Todos los encargados</option>
        {(teamMembers || []).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
      </select>

      <select
        value={taskDueFilter}
        onChange={(e) => setTaskDueFilter(e.target.value)}
        className={selectBase}
        title="Filtrar por fecha de entrega"
      >
        <option value="all">Entrega: todas</option>
        <option value="overdue">Entrega: vencidas</option>
        <option value="this-week">Entrega: esta semana</option>
        <option value="next-week">Entrega: prox. semana</option>
        <option value="this-month">Entrega: este mes</option>
      </select>

      <div className="flex items-center gap-3 ml-auto max-md:w-full max-md:ml-0 max-md:border-t max-md:border-gray-100 max-md:pt-2">
        <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideCompletedTasks}
            onChange={(e) => setHideCompletedTasks(e.target.checked)}
            className="w-3.5 h-3.5 cursor-pointer"
          />
          Ocultar completadas
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideBlockedTasks}
            onChange={(e) => setHideBlockedTasks(e.target.checked)}
            className="w-3.5 h-3.5 cursor-pointer"
          />
          Ocultar bloqueadas
        </label>
      </div>
    </div>
  );
}
