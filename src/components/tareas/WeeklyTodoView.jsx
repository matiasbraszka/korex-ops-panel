import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { TASK_STATUS } from '../../utils/constants';
import { today } from '../../utils/helpers';
import Dropdown from '../Dropdown';
import TaskPickerModal from './TaskPickerModal';
import { ChevronLeft, ChevronRight, X, GripVertical } from 'lucide-react';

const DAY_LABELS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const DAY_FULL = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const pad = (n) => String(n).padStart(2, '0');
const fmtIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function getMonday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  const diff = (day + 6) % 7;
  dt.setDate(dt.getDate() - diff);
  return fmtIso(dt);
}

function weekDates(mondayStr) {
  const [y, m, d] = mondayStr.split('-').map(Number);
  const mon = new Date(y, m - 1, d);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(mon);
    dt.setDate(dt.getDate() + i);
    return fmtIso(dt);
  });
}

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
  const { tasks, clients, currentUser, weeklyTodos, loadWeeklyTodos, addWeeklyTodo, removeWeeklyTodo, updateWeeklyTodo, updateTask } = useApp();

  const nowStr = today();
  const [subView, setSubView] = useState('semanal'); // 'semanal' | 'diaria'
  const [mondayStr, setMondayStr] = useState(() => getMonday(nowStr));
  const [selectedDate, setSelectedDate] = useState(nowStr); // para vista diaria
  const [pickerDate, setPickerDate] = useState(null);
  const [openStatusDropdown, setOpenStatusDropdown] = useState(null);
  const statusRefs = useRef({});

  // Drag state
  const [dragId, setDragId] = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const dates = useMemo(() => weekDates(mondayStr), [mondayStr]);

  // Cargar datos: en semanal carga la semana, en diaria carga solo el dia seleccionado
  useEffect(() => {
    if (!currentUser?.id) return;
    if (subView === 'semanal') {
      loadWeeklyTodos(currentUser.id, dates[0], dates[6]);
    } else {
      loadWeeklyTodos(currentUser.id, selectedDate, selectedDate);
    }
  }, [currentUser?.id, mondayStr, selectedDate, subView, loadWeeklyTodos, dates]);

  // Navegacion semanal
  const goWeek = (dir) => {
    const [y, m, d] = mondayStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + dir * 7);
    setMondayStr(fmtIso(dt));
  };
  const goToday = () => {
    setMondayStr(getMonday(nowStr));
    setSelectedDate(nowStr);
  };

  // Navegacion diaria
  const goDay = (dir) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + dir);
    const newDate = fmtIso(dt);
    setSelectedDate(newDate);
    setMondayStr(getMonday(newDate));
  };

  // Label del dia para vista diaria
  const dayLabel = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dayName = DAY_FULL[dt.getDay()];
    const monthName = dt.toLocaleDateString('es-AR', { month: 'long' });
    return `${dayName} ${d} de ${monthName} ${y}`;
  }, [selectedDate]);

  // Todos del dia seleccionado (para vista diaria)
  const dailyTodos = useMemo(() => {
    return weeklyTodos
      .filter(wt => wt.date === selectedDate)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [weeklyTodos, selectedDate]);

  const dailyLinkedIds = useMemo(() => new Set(dailyTodos.map(wt => wt.taskId)), [dailyTodos]);

  const todosByDate = useMemo(() => {
    const map = {};
    dates.forEach(d => { map[d] = []; });
    weeklyTodos.forEach(wt => { if (map[wt.date]) map[wt.date].push(wt); });
    // Ordenar por position dentro de cada dia
    Object.values(map).forEach(arr => arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
    return map;
  }, [weeklyTodos, dates]);

  const linkedTaskIds = useMemo(() => {
    if (!pickerDate) return new Set();
    return new Set((todosByDate[pickerDate] || []).map(wt => wt.taskId));
  }, [pickerDate, todosByDate]);

  const handlePickTask = async (taskId) => {
    if (!currentUser?.id || !pickerDate) return;
    await addWeeklyTodo(currentUser.id, taskId, pickerDate);
  };

  const getStatusRef = useCallback((key) => {
    if (!statusRefs.current[key]) statusRefs.current[key] = { current: null };
    return statusRefs.current[key];
  }, []);

  const clientName = (clientId) => clients.find(c => c.id === clientId)?.name || '';
  const isCurrentWeek = mondayStr === getMonday(nowStr);

  // ── Navegacion por drag (zonas laterales) ──
  const [dragOverEdge, setDragOverEdge] = useState(null); // 'prev' | 'next'

  const handleEdgeDragOver = (e, edge) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverEdge(edge);
  };

  const handleEdgeDragLeave = () => {
    setDragOverEdge(null);
  };

  const handleEdgeDrop = async (e, edge) => {
    e.preventDefault();
    if (!dragId) return;
    const todo = weeklyTodos.find(t => t.id === dragId);
    if (!todo) { setDragId(null); setDragOverEdge(null); return; }
    // Calcular lunes de la semana destino
    const [y, m, d] = mondayStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + (edge === 'prev' ? -7 : 7));
    const targetMonday = fmtIso(dt);
    await updateWeeklyTodo(todo.id, { date: targetMonday });
    setMondayStr(targetMonday);
    setDragId(null);
    setDragOverEdge(null);
    setDragOverDay(null);
  };

  // ── Drag & drop handlers ──
  const handleDragStart = (e, todoId) => {
    setDragId(todoId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', todoId);
    // Slight delay for visual ghost
    setTimeout(() => e.currentTarget.classList.add('opacity-40'), 0);
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('opacity-40');
    setDragId(null);
    setDragOverDay(null);
    setDragOverIdx(null);
  };

  const handleDayDragOver = (e, dateStr) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDay(dateStr);
  };

  const handleDayDragLeave = (e, dateStr) => {
    // Solo limpiar si realmente sale del day container
    if (!e.currentTarget.contains(e.relatedTarget)) {
      if (dragOverDay === dateStr) setDragOverDay(null);
    }
  };

  const handleDayDrop = async (e, targetDateStr) => {
    e.preventDefault();
    if (!dragId) return;
    const todo = weeklyTodos.find(t => t.id === dragId);
    if (!todo) { setDragId(null); setDragOverDay(null); return; }

    if (todo.date !== targetDateStr) {
      // Mover a otro dia
      await updateWeeklyTodo(todo.id, { date: targetDateStr });
    }

    setDragId(null);
    setDragOverDay(null);
    setDragOverIdx(null);
  };

  // Drag sobre una card especifica (para reorder dentro del dia)
  const handleCardDragOver = (e, todoId, dateStr) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDay(dateStr);
    setDragOverIdx(todoId);
  };

  const handleCardDrop = async (e, targetTodoId, dateStr) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragId || dragId === targetTodoId) { setDragId(null); setDragOverDay(null); setDragOverIdx(null); return; }

    const todo = weeklyTodos.find(t => t.id === dragId);
    if (!todo) { setDragId(null); return; }

    // Mover al dia del target + reordenar
    const dayTodos = [...(todosByDate[dateStr] || [])];
    // Quitar el dragged del array si ya estaba en este dia
    const filtered = dayTodos.filter(t => t.id !== dragId);
    // Insertar antes del target
    const targetIdx = filtered.findIndex(t => t.id === targetTodoId);
    const insertIdx = targetIdx >= 0 ? targetIdx : filtered.length;
    filtered.splice(insertIdx, 0, { ...todo, date: dateStr });

    // Persistir cambio de dia + posiciones
    for (let i = 0; i < filtered.length; i++) {
      const wt = filtered[i];
      const changes = {};
      if (wt.id === dragId && wt.date !== dateStr) changes.date = dateStr;
      if (wt.position !== i) changes.position = i;
      if (wt.id === dragId) changes.date = dateStr;
      if (Object.keys(changes).length > 0 || wt.id === dragId) {
        await updateWeeklyTodo(wt.id, { date: dateStr, position: i });
      }
    }

    setDragId(null);
    setDragOverDay(null);
    setDragOverIdx(null);
  };

  const isToday = selectedDate === nowStr;

  return (
    <div>
      {/* Header con sub-toggle + navegacion */}
      <div className="flex items-center justify-between mb-4 bg-white border border-gray-200 rounded-xl py-3 px-4 gap-3 flex-wrap">
        {/* Nav izquierda */}
        <button
          className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-800 bg-transparent border border-gray-200 hover:border-gray-300 rounded-lg py-1.5 px-2.5 cursor-pointer font-sans transition-colors"
          onClick={() => subView === 'semanal' ? goWeek(-1) : goDay(-1)}
        >
          <ChevronLeft size={14} /> {subView === 'semanal' ? 'Anterior' : 'Ayer'}
        </button>

        {/* Centro: titulo + sub-toggle */}
        <div className="text-center flex-1">
          <div className="text-[14px] font-bold text-gray-800">
            {subView === 'semanal' ? weekLabel(dates) : dayLabel}
          </div>
          <div className="flex items-center justify-center gap-1 mt-1.5">
            {['semanal', 'diaria'].map(v => (
              <button
                key={v}
                onClick={() => { setSubView(v); if (v === 'diaria') setSelectedDate(nowStr); }}
                className={`text-[11px] font-semibold py-1 px-3 rounded-full border cursor-pointer font-sans transition-colors ${
                  subView === v ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {v === 'semanal' ? 'Semanal' : 'Diaria'}
              </button>
            ))}
            {((subView === 'semanal' && !isCurrentWeek) || (subView === 'diaria' && !isToday)) && (
              <button className="text-[11px] text-blue-500 hover:text-blue-600 bg-transparent border-none cursor-pointer font-sans ml-1" onClick={goToday}>
                Hoy
              </button>
            )}
          </div>
        </div>

        {/* Nav derecha */}
        <button
          className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-800 bg-transparent border border-gray-200 hover:border-gray-300 rounded-lg py-1.5 px-2.5 cursor-pointer font-sans transition-colors"
          onClick={() => subView === 'semanal' ? goWeek(1) : goDay(1)}
        >
          {subView === 'semanal' ? 'Siguiente' : 'Mañana'} <ChevronRight size={14} />
        </button>
      </div>

      {/* ═══ Vista SEMANAL ═══ */}
      {subView === 'semanal' && (
      <div className="flex gap-2">
        {/* Zona izquierda: semana anterior */}
        <div
          className={`w-8 shrink-0 rounded-xl border-2 border-dashed flex items-center justify-center transition-all ${
            dragId
              ? dragOverEdge === 'prev' ? 'border-blue-400 bg-blue-50 text-blue-600 opacity-100' : 'border-gray-300 text-gray-400 opacity-100'
              : 'border-transparent text-transparent opacity-0 pointer-events-none'
          }`}
          onDragOver={(e) => handleEdgeDragOver(e, 'prev')}
          onDragLeave={handleEdgeDragLeave}
          onDrop={(e) => handleEdgeDrop(e, 'prev')}
          title="Soltar para mover a semana anterior"
        >
          <ChevronLeft size={16} />
        </div>

      <div className="flex-1 grid grid-cols-7 gap-2 max-md:grid-cols-1">
        {dates.map((dateStr, dayIdx) => {
          const isToday = dateStr === nowStr;
          const isWeekend = dayIdx >= 5;
          const dayTodos = todosByDate[dateStr] || [];
          const [, , dayNum] = dateStr.split('-').map(Number);
          const isDragTarget = dragOverDay === dateStr && dragId;

          return (
            <div
              key={dateStr}
              className={`rounded-xl border min-h-[200px] flex flex-col transition-all ${
                isDragTarget
                  ? 'border-blue-400 bg-blue-50/40 shadow-md ring-2 ring-blue-200'
                  : isToday
                    ? 'border-blue-400 bg-blue-50/30 shadow-sm'
                    : isWeekend
                      ? 'border-gray-100 bg-gray-50/50'
                      : 'border-gray-200 bg-white'
              }`}
              onDragOver={(e) => handleDayDragOver(e, dateStr)}
              onDragLeave={(e) => handleDayDragLeave(e, dateStr)}
              onDrop={(e) => handleDayDrop(e, dateStr)}
            >
              {/* Day header */}
              <div className={`flex items-center justify-between px-3 py-2 border-b ${isToday ? 'border-blue-200' : 'border-gray-100'}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[13px] font-bold ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>{DAY_LABELS[dayIdx]}</span>
                  <span className={`text-[13px] ${isToday ? 'text-blue-500 font-semibold' : 'text-gray-400'}`}>{dayNum}</span>
                </div>
                {isToday && <span className="text-[9px] font-bold text-blue-600 bg-blue-100 rounded-full px-1.5 py-[1px]">HOY</span>}
                {dayTodos.length > 0 && <span className="text-[10px] text-gray-400 font-semibold">{dayTodos.length}</span>}
              </div>

              {/* Tasks */}
              <div className="flex-1 px-2 py-1.5 space-y-1.5">
                {dayTodos.map(wt => {
                  const task = tasks.find(t => t.id === wt.taskId);
                  if (!task) return null;
                  const st = TASK_STATUS[task.status];
                  const stRef = getStatusRef(wt.id);
                  const cName = clientName(task.clientId);
                  const isDone = task.status === 'done';
                  const isBeingDragged = dragId === wt.id;
                  const isDragOverCard = dragOverIdx === wt.id && dragId !== wt.id;

                  return (
                    <div key={wt.id}>
                      {isDragOverCard && <div className="h-0.5 bg-blue-400 rounded-full my-1" />}
                      <div
                        className={`group rounded-lg border px-2.5 py-2 transition-all cursor-grab active:cursor-grabbing ${
                          isBeingDragged
                            ? 'opacity-40 scale-95'
                            : isDone
                              ? 'bg-green-50/50 border-green-200'
                              : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
                        }`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, wt.id)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleCardDragOver(e, wt.id, dateStr)}
                        onDrop={(e) => handleCardDrop(e, wt.id, dateStr)}
                      >
                        <div className="flex items-start gap-1.5">
                          {/* Grip handle */}
                          <GripVertical size={12} className="text-gray-300 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />

                          {/* Status dot */}
                          <span
                            ref={el => stRef.current = el}
                            className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] cursor-pointer shrink-0 mt-0.5"
                            style={{ background: (st?.color || '#9CA3AF') + '15', color: st?.color || '#9CA3AF', border: `1.5px solid ${st?.color || '#9CA3AF'}` }}
                            onClick={(e) => { e.stopPropagation(); setOpenStatusDropdown(wt.id); }}
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
                            <div className={`text-[11px] font-medium leading-snug line-clamp-2 ${isDone ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                              {task.title}
                            </div>
                            {cName && <div className="text-[9px] text-gray-400 mt-0.5 truncate">{cName}</div>}
                          </div>

                          <button
                            className="bg-transparent border-none text-gray-300 hover:text-red-400 cursor-pointer p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            onClick={() => removeWeeklyTodo(wt.id)}
                            title="Quitar del dia"
                          >
                            <X size={12} />
                          </button>
                        </div>
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

        {/* Zona derecha: semana siguiente */}
        <div
          className={`w-8 shrink-0 rounded-xl border-2 border-dashed flex items-center justify-center transition-all ${
            dragId
              ? dragOverEdge === 'next' ? 'border-blue-400 bg-blue-50 text-blue-600 opacity-100' : 'border-gray-300 text-gray-400 opacity-100'
              : 'border-transparent text-transparent opacity-0 pointer-events-none'
          }`}
          onDragOver={(e) => handleEdgeDragOver(e, 'next')}
          onDragLeave={handleEdgeDragLeave}
          onDrop={(e) => handleEdgeDrop(e, 'next')}
          title="Soltar para mover a semana siguiente"
        >
          <ChevronRight size={16} />
        </div>
      </div>
      )}

      {/* ═══ Vista DIARIA ═══ */}
      {subView === 'diaria' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-[700px] mx-auto">
          {/* Day header */}
          <div className={`flex items-center justify-between px-5 py-3 border-b ${selectedDate === nowStr ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100'}`}>
            <div className="flex items-center gap-2">
              <span className={`text-[16px] font-bold ${selectedDate === nowStr ? 'text-blue-600' : 'text-gray-800'}`}>
                {dayLabel}
              </span>
              {selectedDate === nowStr && <span className="text-[10px] font-bold text-blue-600 bg-blue-100 rounded-full px-2 py-[2px]">HOY</span>}
            </div>
            <span className="text-[12px] text-gray-400">{dailyTodos.length} tarea{dailyTodos.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Tasks del dia — con drag & drop para reordenar */}
          <div className="px-4 py-3 space-y-2 min-h-[300px]">
            {dailyTodos.length === 0 && (
              <div className="text-center text-gray-400 text-xs py-12">Sin tareas para este dia. Usa el boton de abajo para agregar.</div>
            )}
            {dailyTodos.map(wt => {
              const task = tasks.find(t => t.id === wt.taskId);
              if (!task) return null;
              const st = TASK_STATUS[task.status];
              const stRef = getStatusRef('daily_' + wt.id);
              const cName = clientName(task.clientId);
              const isDone = task.status === 'done';
              const isBeingDragged = dragId === wt.id;
              const isDragOverCard = dragOverIdx === wt.id && dragId !== wt.id;

              return (
                <div key={wt.id}>
                  {isDragOverCard && <div className="h-0.5 bg-blue-400 rounded-full my-1" />}
                  <div
                    className={`group rounded-xl border px-4 py-3 transition-all cursor-grab active:cursor-grabbing ${
                      isBeingDragged
                        ? 'opacity-40 scale-[0.98]'
                        : isDone
                          ? 'bg-green-50/50 border-green-200'
                          : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
                    }`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, wt.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleCardDragOver(e, wt.id, selectedDate)}
                    onDrop={(e) => handleCardDrop(e, wt.id, selectedDate)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Grip handle */}
                      <GripVertical size={14} className="text-gray-300 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />

                      {/* Status dot */}
                      <span
                        ref={el => stRef.current = el}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] cursor-pointer shrink-0 mt-0.5"
                        style={{ background: (st?.color || '#9CA3AF') + '15', color: st?.color || '#9CA3AF', border: `1.5px solid ${st?.color || '#9CA3AF'}` }}
                        onClick={(e) => { e.stopPropagation(); setOpenStatusDropdown('daily_' + wt.id); }}
                        title={st?.label || task.status}
                      >
                        {st?.icon || '\u25CB'}
                      </span>
                      <Dropdown
                        open={openStatusDropdown === 'daily_' + wt.id}
                        onClose={() => setOpenStatusDropdown(null)}
                        anchorRef={stRef}
                        items={Object.entries(TASK_STATUS)
                          .filter(([k]) => k !== 'blocked' && k !== 'retrasadas')
                          .map(([k, v]) => ({
                            label: v.label, icon: v.icon, iconColor: v.color,
                            onClick: () => updateTask(task.id, { status: k }),
                          }))}
                      />

                      <div className="flex-1 min-w-0">
                        <div className={`text-[14px] font-medium leading-snug ${isDone ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                          {task.title}
                        </div>
                        {task.description && (
                          <div className="text-[12px] text-gray-400 mt-1 line-clamp-2">{task.description}</div>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          {cName && <span className="text-[11px] text-gray-400">{cName}</span>}
                          <span className="text-[10px] font-semibold uppercase" style={{ color: st?.color || '#9CA3AF' }}>{st?.label || task.status}</span>
                        </div>
                      </div>

                      <button
                        className="bg-transparent border-none text-gray-300 hover:text-red-400 cursor-pointer p-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={() => removeWeeklyTodo(wt.id)}
                        title="Quitar del dia"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add task button */}
          <div className="px-4 pb-4">
            <button
              className="w-full text-[12px] text-gray-400 hover:text-blue-500 bg-transparent border border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 rounded-lg py-2.5 cursor-pointer font-sans transition-colors"
              onClick={() => setPickerDate(selectedDate)}
            >
              + Agregar tarea
            </button>
          </div>
        </div>
      )}

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
