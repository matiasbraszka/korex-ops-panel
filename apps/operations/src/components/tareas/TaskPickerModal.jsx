import { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { TASK_STATUS } from '../../utils/constants';
import { getAllPhases } from '../../utils/helpers';
import Modal from '../Modal';
import { Plus } from 'lucide-react';

/**
 * Modal para elegir tareas pendientes del usuario actual y vincularlas a un dia.
 * Tareas agrupadas por cliente, ordenadas por prioridad del cliente (mas urgente primero).
 */
export default function TaskPickerModal({ open, onClose, onSelect, excludeTaskIds = new Set(), date }) {
  const { tasks, clients, currentUser, getPriorityLabel, createTask, updateTask } = useApp();
  const [search, setSearch] = useState('');
  const [createMode, setCreateMode] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskClientId, setNewTaskClientId] = useState('');
  const [newTaskPhase, setNewTaskPhase] = useState(''); // '' = sin fase
  const [creating, setCreating] = useState(false);

  // Match flexible: "Matias" matchea "Matias Braszka" y viceversa
  const matchesUser = (assigneeStr) => {
    if (!currentUser?.name) return false;
    const userName = currentUser.name.toLowerCase();
    const firstName = userName.split(' ')[0];
    const parts = assigneeStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    return parts.some(p => p === userName || p === firstName || userName.startsWith(p) || p.startsWith(firstName));
  };

  // Tareas del usuario actual (asignadas a el o sin asignar, no completadas)
  const myTasks = useMemo(() => {
    if (!currentUser) return [];
    return tasks.filter(t => {
      if (t.status === 'done') return false;
      // Incluir tareas asignadas al usuario O sin asignar (disponibles para cualquiera)
      if (!t.assignee || t.assignee.trim() === '') return true;
      return matchesUser(t.assignee);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, currentUser]);

  // Aplicar búsqueda
  const filtered = useMemo(() => {
    let list = myTasks;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        clients.find(c => c.id === t.clientId)?.name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [myTasks, search, clients]);

  // Agrupar por cliente, ordenar por prioridad del cliente
  const groupedByClient = useMemo(() => {
    const map = {};
    filtered.forEach(t => {
      if (!map[t.clientId]) {
        const client = clients.find(c => c.id === t.clientId);
        map[t.clientId] = { client, tasks: [] };
      }
      map[t.clientId].tasks.push(t);
    });
    // Ordenar clientes por prioridad (1 = super prioritario)
    return Object.values(map).sort((a, b) => {
      const pa = a.client?.priority || 5;
      const pb = b.client?.priority || 5;
      return pa - pb;
    });
  }, [filtered, clients]);

  const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const dateLabel = (() => {
    if (!date) return '';
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return `${DAY_NAMES[dt.getDay()]} ${d}`;
  })();

  const handleClose = () => {
    onClose();
    setSearch('');
    setCreateMode(false);
    setNewTaskTitle('');
    setNewTaskClientId('');
    setNewTaskPhase('');
  };

  // Fases disponibles del cliente seleccionado (globales + custom).
  const phasesForNewClient = useMemo(() => {
    if (!newTaskClientId) return [];
    const c = clients.find(cc => cc.id === newTaskClientId);
    if (!c) return [];
    const map = getAllPhases(c);
    return Object.entries(map).map(([id, v]) => ({ id, label: v.label, color: v.color }));
  }, [newTaskClientId, clients]);

  const activeClients = useMemo(
    () => (clients || []).filter(c => c.status === 'active').sort((a, b) => a.name.localeCompare(b.name)),
    [clients]
  );

  const handleCreateTask = () => {
    const title = newTaskTitle.trim();
    if (!title || !newTaskClientId || creating) return;
    setCreating(true);
    // Asignada al usuario actual asi tambien aparece como suya en el sistema
    const assignee = currentUser?.name || '';
    const t = createTask(title, newTaskClientId, assignee, 'normal', 'backlog', '', null);
    // Si el usuario eligio una fase, la aplicamos. Si NO eligio ('Sin fase')
    // dejamos el default que pone createTask. Marcamos isRoadmapTask=true asi
    // aparece en el Roadmap del cliente bajo la fase elegida.
    if (t?.id && newTaskPhase) {
      updateTask(t.id, { phase: newTaskPhase, isRoadmapTask: true });
    }
    setCreating(false);
    setCreateMode(false);
    setNewTaskTitle('');
    setNewTaskClientId('');
    setNewTaskPhase('');
    if (t?.id) onSelect(t.id);
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Agregar tarea — ${dateLabel}`}
      maxWidth={560}
      footer={<button className="py-2 px-4 rounded-lg border border-gray-200 bg-white text-gray-600 text-[13px] cursor-pointer font-sans hover:bg-gray-50" onClick={handleClose}>Cerrar</button>}
    >
      {/* Crear tarea nueva (inline) */}
      {createMode ? (
        <div className="mb-3 border border-blue-300 rounded-lg p-3 bg-blue-50/30">
          <div className="flex items-center gap-2 mb-2.5">
            <Plus size={14} className="text-blue-600" />
            <span className="text-[12px] font-bold text-blue-700">Crear tarea nueva</span>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Titulo de la tarea..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTaskTitle.trim() && newTaskClientId) handleCreateTask();
                if (e.key === 'Escape') { setCreateMode(false); setNewTaskTitle(''); setNewTaskClientId(''); setNewTaskPhase(''); }
              }}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400 bg-white"
            />
            <select
              value={newTaskClientId}
              onChange={(e) => { setNewTaskClientId(e.target.value); setNewTaskPhase(''); }}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400 bg-white"
            >
              <option value="">Elegir cliente...</option>
              {activeClients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {/* Selector de fase: aparece solo cuando hay cliente elegido */}
            {newTaskClientId && phasesForNewClient.length > 0 && (
              <select
                value={newTaskPhase}
                onChange={(e) => setNewTaskPhase(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400 bg-white"
              >
                <option value="">Sin fase</option>
                {phasesForNewClient.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setCreateMode(false); setNewTaskTitle(''); setNewTaskClientId(''); setNewTaskPhase(''); }}
                className="py-1.5 px-3 bg-transparent border border-gray-200 text-gray-600 text-[12px] rounded-lg cursor-pointer font-sans hover:bg-gray-50"
              >Cancelar</button>
              <button
                type="button"
                disabled={!newTaskTitle.trim() || !newTaskClientId || creating}
                onClick={handleCreateTask}
                className="py-1.5 px-3 bg-blue-500 hover:bg-blue-600 text-white text-[12px] font-semibold rounded-lg border-none cursor-pointer font-sans disabled:opacity-40 disabled:cursor-not-allowed"
              >Crear y agregar al dia</button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreateMode(true)}
          className="w-full mb-2.5 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-blue-600 bg-blue-50 border border-dashed border-blue-300 rounded-lg py-2 cursor-pointer font-sans hover:bg-blue-100 transition-colors"
        >
          <Plus size={13} /> Crear tarea nueva para un cliente
        </button>
      )}

      {/* Search */}
      <div className="mb-2.5">
        <input
          type="text"
          placeholder="Buscar tarea por nombre o cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus={!createMode}
          className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400 bg-gray-50"
        />
      </div>

      {/* Results grouped by client */}
      {groupedByClient.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-8">
          {myTasks.length === 0
            ? 'No tenés tareas pendientes asignadas.'
            : `Sin resultados para los filtros aplicados`}
        </div>
      ) : (
        <div className="max-h-[400px] overflow-y-auto">
          {groupedByClient.map(({ client, tasks: cTasks }) => {
            const prio = getPriorityLabel(client?.priority || 5);
            return (
              <div key={client?.id || 'unknown'} className="mb-2">
                {/* Client header */}
                <div className="flex items-center gap-2 py-1.5 px-2 sticky top-0 bg-white z-[1] border-b border-gray-50">
                  {client?.avatarUrl ? (
                    <img src={client.avatarUrl} alt={client.name} className="w-5 h-5 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0" style={{ background: client?.color || '#5B7CF5' }}>
                      {client?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
                    </div>
                  )}
                  <span className="text-[12px] font-bold text-gray-700">{client?.name || 'Sin cliente'}</span>
                  {prio && (
                    <span className="text-[8px] font-bold px-1 py-[1px] rounded uppercase" style={{ background: prio.color + '18', color: prio.color }}>
                      {prio.label}
                    </span>
                  )}
                </div>

                {/* Tasks */}
                {cTasks.map(t => {
                  const isLinked = excludeTaskIds.has(t.id);
                  const st = TASK_STATUS[t.status];
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={isLinked}
                      className={`w-full text-left flex items-start gap-2.5 py-2 px-3 pl-9 cursor-pointer border-none font-sans transition-colors ${
                        isLinked
                          ? 'bg-blue-50/50 opacity-60 cursor-not-allowed'
                          : 'bg-transparent hover:bg-gray-50'
                      }`}
                      onClick={() => { if (!isLinked) onSelect(t.id); }}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] shrink-0 mt-0.5"
                        style={{ background: (st?.color || '#9CA3AF') + '15', color: st?.color || '#9CA3AF', border: `1.5px solid ${st?.color || '#9CA3AF'}` }}
                      >
                        {st?.icon || '\u25CB'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-gray-800 leading-snug">{t.title}</div>
                        {t.description && (
                          <div className="text-[10px] text-gray-400 truncate mt-0.5">{t.description}</div>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] font-semibold uppercase" style={{ color: st?.color || '#9CA3AF' }}>{st?.label || t.status}</span>
                        </div>
                      </div>
                      {isLinked && <span className="text-[10px] text-blue-500 font-semibold shrink-0 mt-1">Vinculada</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
