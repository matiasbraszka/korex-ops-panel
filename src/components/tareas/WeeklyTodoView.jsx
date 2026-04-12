import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { TASK_STATUS } from '../../utils/constants';
import { today } from '../../utils/helpers';
import Dropdown from '../Dropdown';
import TaskPickerModal from './TaskPickerModal';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const pad = (n) => String(n).padStart(2, '0');
const fmtIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Lunes de la semana que contiene `date`
function getMonday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay(); // 0=Dom
  const diff = (day + 6) % 7; // 0=Lun, 6=Dom
  dt.setDate(dt.getDate() - diff);
  return fmtIso(dt);
}

// Array de 7 fechas (Lun-Dom) a partir de un lunes
function weekDates(mondayStr) {
  const [y, m, d] = mondayStr.split('-').map(Number);
  const mon = new Date(y, m - 1, d);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(mon);
    dt.setDate(dt.getDate() + i);
    return fmtIso(dt);
  });
}

// Label del tipo "Semana del 14 al 20 de abril 2026"
function weekLabel(dates) {
  const first = dates[0];
  const last = dates[6];
  const [fy, fm, fd] = first.split('-').map(Number);
  const [, , ld] = last.split('-').map(Number);
  const dt = new Date(fy, fm - 1, fd);
  const month = dt.toLocaleDateString('es-AR', { month: 'long' });
  return `Semana del ${fd} al ${ld} de ${month} ${fy}`;
}

export default function WeeklyTodoView() {
  const { tasks, clients, currentUser, weeklyTodos, loadWeeklyTodos, addWeeklyTodo, removeWeeklyTodo, updateTask } = useApp();

  const nowStr = today();
  const [mondayStr, setMondayStr] = useState(() => getMonday(nowStr));
  const [pickerDate, setPickerDate] = useState(null); // abre el modal para ese dia
  const [openStatusDropdown, setOpenStatusDropdown] = useState(null);
  const statusRefs = useRef({});

  const dates = useMemo(() => weekDates(mondayStr), [mondayStr]);
  const sundayStr = dates[6];

  // Cargar todos de la semana actual al montar o cambiar de semana
  useEffect(() => {
    if (currentUser?.id) {
      loadWeeklyTodos(currentUser.id, dates[0], dates[6]);
    }
  }, [currentUser?.id, mondayStr, loadWeeklyTodos, dates]);

  // Navegacion
  const goWeek = (dir) => {
    const [y, m, d] = mondayStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + dir * 7);
    setMondayStr(fmtIso(dt));
  };
  const goToday = () => setMondayStr(getMonday(nowStr));

  // Todos agrupados por fecha
  const todosByDate = useMemo(() => {
    const map = {};
    dates.forEach(d => { map[d] = []; });
    weeklyTodos.forEach(wt => { if (map[wt.date]) map[wt.date].push(wt); });
    return map;
  }, [weeklyTodos, dates]);

  // Tareas ya vinculadas al dia del picker (para mostrar como tildadas)
  const linkedTaskIds = useMemo(() => {
    if (!pickerDate) return new Set();
    return new Set((todosByDate[pickerDate] || []).map(wt => wt.taskId));
  }, [pickerDate, todosByDate]);

  const handlePickTask = async (taskId) => {
    if (!currentUser?.id || !pickerDate) return;
    await addWeeklyTodo(currentUser.id, taskId, pickerDate);
  };

  const handleRemove = async (todoId) => {
    await removeWeeklyTodo(todoId);
  };

  const getStatusRef = useCallback((key) => {
    if (!statusRefs.current[key]) statusRefs.current[key] = { current: null };
    return statusRefs.current[key];
  }, []);

  const clientName = (clientId) => clients.find(c => c.id === clientId)?.name || '';

  const isCurrentWeek = mondayStr === getMonday(nowStr);

  return (
    <div>
      {/* Header: navegacion semanal */}
      <div className="flex items-center justify-between mb-4 bg-white border border-gray-200 rounded-xl py-3 px-4">
        <button
          className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-800 bg-transparent border border-gray-200 hover:border-gray-300 rounded-lg py-1.5 px-2.5 cursor-pointer font-sans transition-colors"
          onClick={() => goWeek(-1)}
        >
          <ChevronLeft size={14} /> Anterior
        </button>

        <div className="text-center">
          <div className="text-[14px] font-bold text-gray-800">{weekLabel(dates)}</div>
          {!isCurrentWeek && (
            <button
              className="text-[11px] text-blue-500 hover:text-blue-600 bg-transparent border-none cursor-pointer font-sans mt-0.5"
              onClick={goToday}
            >
              Ir a esta semana
            </button>
          )}
        </div>

        <button
          className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-800 bg-transparent border border-gray-200 hover:border-gray-300 rounded-lg py-1.5 px-2.5 cursor-pointer font-sans transition-colors"
          onClick={() => goWeek(1)}
        >
          Siguiente <ChevronRight size={14} />
        </button>
      </div>

      {/* Grid semanal: desktop 7 cols, mobile vertical */}
      <div className="grid grid-cols-7 gap-2 max-md:grid-cols-1">
        {dates.map((dateStr, dayIdx) => {
          const isToday = dateStr === nowStr;
          const isWeekend = dayIdx >= 5;
          const dayTodos = todosByDate[dateStr] || [];
          const [, , dayNum] = dateStr.split('-').map(Number);

          return (
            <div
              key={dateStr}
              className={`rounded-xl border min-h-[200px] flex flex-col transition-colors ${
                isToday
                  ? 'border-blue-400 bg-blue-50/30 shadow-sm'
                  : isWeekend
                    ? 'border-gray-100 bg-gray-50/50'
                    : 'border-gray-200 bg-white'
              }`}
            >
              {/* Day header */}
              <div className={`flex items-center justify-between px-3 py-2 border-b ${isToday ? 'border-blue-200' : 'border-gray-100'}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[13px] font-bold ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
                    {DAY_LABELS[dayIdx]}
                  </span>
                  <span className={`text-[13px] ${isToday ? 'text-blue-500 font-semibold' : 'text-gray-400'}`}>
                    {dayNum}
                  </span>
                </div>
                {isToday && (
                  <span className="text-[9px] font-bold text-blue-600 bg-blue-100 rounded-full px-1.5 py-[1px]">HOY</span>
                )}
              </div>

              {/* Tasks for this day */}
              <div className="flex-1 px-2 py-1.5 space-y-1.5">
                {dayTodos.map(wt => {
                  const task = tasks.find(t => t.id === wt.taskId);
                  if (!task) return null;
                  const st = TASK_STATUS[task.status];
                  const stRef = getStatusRef(wt.id);
                  const cName = clientName(task.clientId);
                  const isDone = task.status === 'done';

                  return (
                    <div
                      key={wt.id}
                      className={`group rounded-lg border px-2.5 py-2 transition-colors ${
                        isDone ? 'bg-green-50/50 border-green-200' : 'bg-white border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {/* Status dot — clickable */}
                        <span
                          ref={el => stRef.current = el}
                          className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] cursor-pointer shrink-0 mt-0.5"
                          style={{ background: (st?.color || '#9CA3AF') + '15', color: st?.color || '#9CA3AF', border: `1.5px solid ${st?.color || '#9CA3AF'}` }}
                          onClick={() => setOpenStatusDropdown(wt.id)}
                          title={st?.label || task.status}
                        >
                          {st?.icon || '\u25CB'}
                        </span>
                        <Dropdown
                          open={openStatusDropdown === wt.id}
                          onClose={() => setOpenStatusDropdown(null)}
                          anchorRef={stRef}
                          items={Object.entries(TASK_STATUS)
                            .filter(([k]) => k !== 'blocked' && k !== 'retrasadas')
                            .map(([k, v]) => ({
                              label: v.label,
                              icon: v.icon,
                              iconColor: v.color,
                              onClick: () => updateTask(task.id, { status: k }),
                            }))}
                        />

                        <div className="flex-1 min-w-0">
                          <div className={`text-[12px] font-medium leading-snug ${isDone ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                            {task.title}
                          </div>
                          {task.description && (
                            <div className="text-[10px] text-gray-400 truncate mt-0.5">{task.description}</div>
                          )}
                          {cName && (
                            <div className="text-[10px] text-gray-400 mt-0.5">{cName}</div>
                          )}
                        </div>

                        {/* Remove button */}
                        <button
                          className="bg-transparent border-none text-gray-300 hover:text-red-400 cursor-pointer p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => handleRemove(wt.id)}
                          title="Quitar del día"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add button */}
              <div className="px-2 pb-2">
                <button
                  className="w-full text-[11px] text-gray-400 hover:text-blue-500 bg-transparent border border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 rounded-lg py-1.5 cursor-pointer font-sans transition-colors"
                  onClick={() => setPickerDate(dateStr)}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Task picker modal */}
      <TaskPickerModal
        open={!!pickerDate}
        onClose={() => setPickerDate(null)}
        onSelect={handlePickTask}
        excludeTaskIds={linkedTaskIds}
        date={pickerDate}
      />
    </div>
  );
}
