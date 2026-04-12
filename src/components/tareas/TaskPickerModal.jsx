import { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { TASK_STATUS } from '../../utils/constants';
import Modal from '../Modal';

/**
 * Modal para elegir tareas pendientes del usuario actual y vincularlas a un dia.
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   onSelect: (taskId) => void  — llamado al seleccionar una tarea
 *   excludeTaskIds: Set<string> — tareas ya vinculadas a este dia (para tildar)
 *   date: string (YYYY-MM-DD) — el dia al que se agrega
 */
export default function TaskPickerModal({ open, onClose, onSelect, excludeTaskIds = new Set(), date }) {
  const { tasks, clients, currentUser } = useApp();
  const [search, setSearch] = useState('');

  // Tareas del usuario actual (asignadas a el, no completadas)
  const myTasks = useMemo(() => {
    if (!currentUser) return [];
    const userName = currentUser.name?.toLowerCase() || '';
    return tasks.filter(t => {
      if (t.status === 'done') return false;
      if (!t.assignee) return false;
      const parts = t.assignee.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      return parts.includes(userName);
    });
  }, [tasks, currentUser]);

  // Filtrar por busqueda
  const filtered = useMemo(() => {
    if (!search.trim()) return myTasks;
    const q = search.toLowerCase();
    return myTasks.filter(t =>
      t.title?.toLowerCase().includes(q) ||
      clients.find(c => c.id === t.clientId)?.name?.toLowerCase().includes(q)
    );
  }, [myTasks, search, clients]);

  const clientName = (clientId) => clients.find(c => c.id === clientId)?.name || '';

  const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const dateLabel = (() => {
    if (!date) return '';
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return `${DAY_NAMES[dt.getDay()]} ${d}`;
  })();

  return (
    <Modal
      open={open}
      onClose={() => { onClose(); setSearch(''); }}
      title={`Agregar tarea — ${dateLabel}`}
      maxWidth={520}
      footer={<button className="py-2 px-4 rounded-lg border border-gray-200 bg-white text-gray-600 text-[13px] cursor-pointer font-sans hover:bg-gray-50" onClick={() => { onClose(); setSearch(''); }}>Cerrar</button>}
    >
      <div className="mb-3">
        <input
          type="text"
          placeholder="Buscar tarea por nombre o cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400 bg-gray-50"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-8">
          {myTasks.length === 0
            ? 'No tenés tareas pendientes asignadas.'
            : `Sin resultados para "${search}"`}
        </div>
      ) : (
        <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50">
          {filtered.map(t => {
            const isLinked = excludeTaskIds.has(t.id);
            const st = TASK_STATUS[t.status];
            const cName = clientName(t.clientId);
            return (
              <button
                key={t.id}
                type="button"
                disabled={isLinked}
                className={`w-full text-left flex items-start gap-2.5 py-2.5 px-3 cursor-pointer border-none font-sans transition-colors ${
                  isLinked
                    ? 'bg-blue-50/50 opacity-60 cursor-not-allowed'
                    : 'bg-transparent hover:bg-gray-50'
                }`}
                onClick={() => { if (!isLinked) { onSelect(t.id); } }}
              >
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] shrink-0 mt-0.5"
                  style={{ background: (st?.color || '#9CA3AF') + '15', color: st?.color || '#9CA3AF', border: `1.5px solid ${st?.color || '#9CA3AF'}` }}
                >
                  {st?.icon || '\u25CB'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-gray-800 leading-snug">{t.title}</div>
                  {t.description && (
                    <div className="text-[11px] text-gray-400 truncate mt-0.5">{t.description}</div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {cName && <span className="text-[10px] text-gray-400">{cName}</span>}
                    <span className="text-[9px] font-semibold uppercase" style={{ color: st?.color || '#9CA3AF' }}>{st?.label || t.status}</span>
                  </div>
                </div>
                {isLinked && <span className="text-[10px] text-blue-500 font-semibold shrink-0 mt-1">Vinculada</span>}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
