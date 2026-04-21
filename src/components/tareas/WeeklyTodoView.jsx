import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { TASK_STATUS } from '../../utils/constants';
import { today } from '../../utils/helpers';
import Dropdown from '../Dropdown';
import TaskPickerModal from './TaskPickerModal';
import { ChevronLeft, ChevronRight, X, GripVertical, StickyNote, ListChecks, Pencil } from 'lucide-react';

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
  const { tasks, clients, currentUser, weeklyTodos, loadWeeklyTodos, addWeeklyTodo, addWeeklyNote, removeWeeklyTodo, updateWeeklyTodo, updateTask } = useApp();

  const nowStr = today();
  const [subView, setSubView] = useState('3dias'); // '3dias' | 'diaria'
  const [threeDayStart, setThreeDayStart] = useState(nowStr); // primer dia de la vista 3 dias
  const [mondayStr, setMondayStr] = useState(() => getMonday(nowStr));
  const [selectedDate, setSelectedDate] = useState(nowStr); // para vista diaria
  const [pickerDate, setPickerDate] = useState(null);
  const [noteDate, setNoteDate] = useState(null); // fecha para agregar apunte
  const [noteText, setNoteText] = useState('');
  const [noteClientId, setNoteClientId] = useState('');
  const [addMenuDate, setAddMenuDate] = useState(null); // menú de agregar (tarea o apunte)
  const [openStatusDropdown, setOpenStatusDropdown] = useState(null);
  const statusRefs = useRef({});

  // Editor inline de tarea/apunte (por wt.id)
  const [editingItem, setEditingItem] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editNoteClientId, setEditNoteClientId] = useState('');

  // Drag state
  const [dragId, setDragId] = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const dates = useMemo(() => weekDates(mondayStr), [mondayStr]);

  // Vista 3 dias: array de 3 fechas a partir de threeDayStart
  const threeDays = useMemo(() => {
    const [y, m, d] = threeDayStart.split('-').map(Number);
    return Array.from({ length: 3 }, (_, i) => {
      const dt = new Date(y, m - 1, d + i);
      return fmtIso(dt);
    });
  }, [threeDayStart]);

  // Label para vista 3 dias
  const threeDayLabel = useMemo(() => {
    const [, , d1] = threeDays[0].split('-').map(Number);
    const [y3, m3, d3] = threeDays[2].split('-').map(Number);
    const dt = new Date(y3, m3 - 1, d3);
    const month = dt.toLocaleDateString('es-AR', { month: 'long' });
    return `${d1} al ${d3} de ${month} ${y3}`;
  }, [threeDays]);

  // Cargar datos segun la vista activa
  useEffect(() => {
    if (!currentUser?.id) return;
    if (subView === '3dias') {
      loadWeeklyTodos(currentUser.id, threeDays[0], threeDays[2]);
    } else {
      loadWeeklyTodos(currentUser.id, selectedDate, selectedDate);
    }
  }, [currentUser?.id, threeDayStart, selectedDate, subView, loadWeeklyTodos, threeDays]);

  // Navegacion 3 dias
  const goThreeDays = (dir) => {
    const [y, m, d] = threeDayStart.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + dir * 3);
    setThreeDayStart(fmtIso(dt));
  };
  const goToday = () => {
    setThreeDayStart(nowStr);
    setSelectedDate(nowStr);
    setMondayStr(getMonday(nowStr));
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

  const activeDates = subView === '3dias' ? threeDays : [selectedDate];

  const todosByDate = useMemo(() => {
    const map = {};
    activeDates.forEach(d => { map[d] = []; });
    weeklyTodos.forEach(wt => { if (map[wt.date]) map[wt.date].push(wt); });
    Object.values(map).forEach(arr => arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
    return map;
  }, [weeklyTodos, activeDates]);

  const linkedTaskIds = useMemo(() => {
    if (!pickerDate) return new Set();
    return new Set((todosByDate[pickerDate] || []).map(wt => wt.taskId));
  }, [pickerDate, todosByDate]);

  const handlePickTask = async (taskId) => {
    if (!currentUser?.id || !pickerDate) return;
    await addWeeklyTodo(currentUser.id, taskId, pickerDate);
  };

  const openEditor = (wt) => {
    setEditingItem(wt);
    if (wt.type === 'note') {
      setEditTitle(wt.noteText || '');
      setEditDescription('');
      setEditNoteClientId(wt.noteClientId || '');
    } else {
      const task = tasks.find(t => t.id === wt.taskId);
      setEditTitle(task?.title || '');
      setEditDescription(task?.description || '');
      setEditNoteClientId('');
    }
  };

  const closeEditor = () => {
    setEditingItem(null);
    setEditTitle('');
    setEditDescription('');
    setEditNoteClientId('');
  };

  const saveEditor = async () => {
    if (!editingItem) return;
    const title = editTitle.trim();
    if (!title) { closeEditor(); return; }
    if (editingItem.type === 'note') {
      await updateWeeklyTodo(editingItem.id, {
        note_text: title,
        note_client_id: editNoteClientId || null,
      });
    } else {
      updateTask(editingItem.taskId, {
        title,
        description: editDescription,
      });
    }
    closeEditor();
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
    // Mover al primer dia del bloque anterior/siguiente
    const [y, m, d] = threeDayStart.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + (edge === 'prev' ? -3 : 3));
    const targetStart = fmtIso(dt);
    await updateWeeklyTodo(todo.id, { date: targetStart });
    setThreeDayStart(targetStart);
    setDragId(null);
    setDragOverEdge(null);
    setDragOverDay(null);
  };

  // ── Auto-scroll during drag ──
  const scrollInterval = useRef(null);
  const startAutoScroll = (e) => {
    const threshold = 80;
    const speed = 12;
    const y = e.clientY;
    const h = window.innerHeight;
    if (y < threshold) {
      if (!scrollInterval.current) scrollInterval.current = setInterval(() => window.scrollBy(0, -speed), 16);
    } else if (y > h - threshold) {
      if (!scrollInterval.current) scrollInterval.current = setInterval(() => window.scrollBy(0, speed), 16);
    } else {
      if (scrollInterval.current) { clearInterval(scrollInterval.current); scrollInterval.current = null; }
    }
  };
  const stopAutoScroll = () => { if (scrollInterval.current) { clearInterval(scrollInterval.current); scrollInterval.current = null; } };

  // ── Drag & drop handlers ──
  const handleDragStart = (e, todoId) => {
    setDragId(todoId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', todoId);
    setTimeout(() => e.currentTarget.classList.add('opacity-40'), 0);
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('opacity-40');
    setDragId(null);
    setDragOverDay(null);
    setDragOverIdx(null);
    stopAutoScroll();
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
    startAutoScroll(e);
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
          onClick={() => subView === '3dias' ? goThreeDays(-1) : goDay(-1)}
        >
          <ChevronLeft size={14} /> {subView === '3dias' ? 'Anterior' : 'Ayer'}
        </button>

        {/* Centro: titulo + sub-toggle */}
        <div className="text-center flex-1">
          <div className="text-[14px] font-bold text-gray-800">
            {subView === '3dias' ? threeDayLabel : dayLabel}
          </div>
          <div className="flex items-center justify-center gap-1 mt-1.5">
            {['3dias', 'diaria'].map(v => (
              <button
                key={v}
                onClick={() => { setSubView(v); if (v === 'diaria') setSelectedDate(nowStr); if (v === '3dias') setThreeDayStart(nowStr); }}
                className={`text-[11px] font-semibold py-1 px-3 rounded-full border cursor-pointer font-sans transition-colors ${
                  subView === v ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {v === '3dias' ? '3 dias' : 'Diaria'}
              </button>
            ))}
            {((subView === '3dias' && threeDayStart !== nowStr) || (subView === 'diaria' && !isToday)) && (
              <button className="text-[11px] text-blue-500 hover:text-blue-600 bg-transparent border-none cursor-pointer font-sans ml-1" onClick={goToday}>
                Hoy
              </button>
            )}
          </div>
        </div>

        {/* Nav derecha */}
        <button
          className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-800 bg-transparent border border-gray-200 hover:border-gray-300 rounded-lg py-1.5 px-2.5 cursor-pointer font-sans transition-colors"
          onClick={() => subView === '3dias' ? goThreeDays(1) : goDay(1)}
        >
          {subView === '3dias' ? 'Siguiente' : 'Mañana'} <ChevronRight size={14} />
        </button>
      </div>

      {/* ═══ Vista 3 DIAS ═══ */}
      {subView === '3dias' && (
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

      <div className="flex-1 grid grid-cols-3 gap-3 max-md:grid-cols-1">
        {threeDays.map((dateStr) => {
          const [dy, dm, dayNum] = dateStr.split('-').map(Number);
          const dtObj = new Date(dy, dm - 1, dayNum);
          const dayIdx = (dtObj.getDay() + 6) % 7; // 0=Lun..6=Dom
          const isTodayCol = dateStr === nowStr;
          const isWeekend = dtObj.getDay() === 0 || dtObj.getDay() === 6;
          const dayTodos = todosByDate[dateStr] || [];
          const isDragTarget = dragOverDay === dateStr && dragId;
          const fullDayName = DAY_FULL[dtObj.getDay()];

          return (
            <div
              key={dateStr}
              className={`rounded-xl border min-h-[200px] flex flex-col transition-all ${
                isDragTarget
                  ? 'border-blue-400 bg-blue-50/40 shadow-md ring-2 ring-blue-200'
                  : isTodayCol
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
              <div className={`flex items-center justify-between px-3 py-2.5 border-b ${isTodayCol ? 'border-blue-200' : 'border-gray-100'}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[14px] font-bold ${isTodayCol ? 'text-blue-600' : 'text-gray-700'}`}>{fullDayName}</span>
                  <span className={`text-[14px] ${isTodayCol ? 'text-blue-500 font-semibold' : 'text-gray-400'}`}>{dayNum}</span>
                </div>
                {isTodayCol && <span className="text-[9px] font-bold text-blue-600 bg-blue-100 rounded-full px-1.5 py-[1px]">HOY</span>}
                {dayTodos.length > 0 && <span className="text-[10px] text-gray-400 font-semibold">{dayTodos.length}</span>}
              </div>

              {/* Tasks + Notes */}
              <div className="flex-1 px-2 py-1.5 space-y-1.5">
                {dayTodos.map(wt => {
                  // ── Apunte (vista 3 dias) ──
                  if (wt.type === 'note') {
                    const noteCName = wt.noteClientId ? clientName(wt.noteClientId) : null;
                    const isBeingDragged = dragId === wt.id;
                    const isDragOverCard = dragOverIdx === wt.id && dragId !== wt.id;
                    return (
                      <div key={wt.id}>
                        {isDragOverCard && <div className="h-0.5 bg-amber-400 rounded-full my-1" />}
                        <div className={`group rounded-lg border-l-2 border-amber-300 border border-amber-100 bg-amber-50/40 px-2.5 py-2 transition-all cursor-grab active:cursor-grabbing ${isBeingDragged ? 'opacity-40 scale-95' : 'hover:shadow-sm'}`}
                          draggable onDragStart={(e) => handleDragStart(e, wt.id)} onDragEnd={handleDragEnd}
                          onDragOver={(e) => handleCardDragOver(e, wt.id, dateStr)} onDrop={(e) => handleCardDrop(e, wt.id, dateStr)}>
                          <div className="flex items-start gap-1.5">
                            <GripVertical size={12} className="text-amber-300 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <span
                              className={`w-4 h-4 rounded border-2 shrink-0 mt-0.5 cursor-pointer flex items-center justify-center text-[9px] transition-colors ${wt.noteDone ? 'bg-amber-400 border-amber-400 text-white' : 'border-amber-300 bg-white hover:border-amber-400'}`}
                              onClick={(e) => { e.stopPropagation(); updateWeeklyTodo(wt.id, { note_done: !wt.noteDone }); }}
                            >{wt.noteDone ? '✓' : ''}</span>
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEditor(wt)} title="Click para editar">
                              <div className={`text-[11px] leading-snug ${wt.noteDone ? 'text-gray-400 line-through' : 'text-gray-600'}`}>{wt.noteText}</div>
                              {noteCName && <div className="text-[9px] text-amber-500 mt-0.5 truncate">{noteCName}</div>}
                            </div>
                            <button className="bg-transparent border-none text-gray-300 hover:text-amber-500 cursor-pointer p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              onClick={(e) => { e.stopPropagation(); openEditor(wt); }} title="Editar"><Pencil size={11} /></button>
                            <button className="bg-transparent border-none text-gray-300 hover:text-red-400 cursor-pointer p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              onClick={() => removeWeeklyTodo(wt.id)}><X size={12} /></button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // ── Tarea real (vista 3 dias) ──
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

                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEditor(wt)} title="Click para editar">
                            <div className={`text-[12px] font-medium leading-snug ${isDone ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                              {task.title}
                            </div>
                            {cName && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{cName}</div>}
                          </div>

                          <button
                            className="bg-transparent border-none text-gray-300 hover:text-blue-500 cursor-pointer p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            onClick={(e) => { e.stopPropagation(); openEditor(wt); }}
                            title="Editar"
                          >
                            <Pencil size={11} />
                          </button>
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

              {/* Add button with menu */}
              <div className="px-2 pb-2 relative">
                {addMenuDate === dateStr ? (
                  <div className="flex gap-1">
                    <button className="flex-1 flex items-center justify-center gap-1 text-[10px] text-blue-600 bg-blue-50 border border-blue-200 rounded-lg py-1.5 cursor-pointer font-sans font-medium hover:bg-blue-100 transition-colors"
                      onClick={() => { setPickerDate(dateStr); setAddMenuDate(null); }}>
                      <ListChecks size={12} /> Tarea
                    </button>
                    <button className="flex-1 flex items-center justify-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg py-1.5 cursor-pointer font-sans font-medium hover:bg-amber-100 transition-colors"
                      onClick={() => { setNoteDate(dateStr); setAddMenuDate(null); }}>
                      <StickyNote size={12} /> Apunte
                    </button>
                    <button className="text-[10px] text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer px-1"
                      onClick={() => setAddMenuDate(null)}>
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    className="w-full text-[11px] text-gray-400 hover:text-blue-500 bg-transparent border border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 rounded-lg py-1.5 cursor-pointer font-sans transition-colors"
                    onClick={() => setAddMenuDate(dateStr)}
                  >
                    +
                  </button>
                )}
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
              <div className="text-center text-gray-400 text-xs py-12">Sin items para este dia. Usa el boton de abajo para agregar.</div>
            )}
            {dailyTodos.map(wt => {
              // ── Apunte personal ──
              if (wt.type === 'note') {
                const noteCName = wt.noteClientId ? clientName(wt.noteClientId) : null;
                const isBeingDragged = dragId === wt.id;
                const isDragOverCard = dragOverIdx === wt.id && dragId !== wt.id;
                return (
                  <div key={wt.id}>
                    {isDragOverCard && <div className="h-0.5 bg-amber-400 rounded-full my-1" />}
                    <div
                      className={`group rounded-xl border-l-[3px] border-amber-300 border border-amber-100 bg-amber-50/40 px-4 py-3 transition-all cursor-grab active:cursor-grabbing ${isBeingDragged ? 'opacity-40 scale-[0.98]' : 'hover:shadow-sm'}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, wt.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleCardDragOver(e, wt.id, selectedDate)}
                      onDrop={(e) => handleCardDrop(e, wt.id, selectedDate)}
                    >
                      <div className="flex items-start gap-3">
                        <GripVertical size={14} className="text-amber-300 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span
                          className={`w-5 h-5 rounded border-2 shrink-0 mt-0.5 cursor-pointer flex items-center justify-center text-[10px] transition-colors ${wt.noteDone ? 'bg-amber-400 border-amber-400 text-white' : 'border-amber-300 bg-white hover:border-amber-400'}`}
                          onClick={(e) => { e.stopPropagation(); updateWeeklyTodo(wt.id, { note_done: !wt.noteDone }); }}
                        >{wt.noteDone ? '✓' : ''}</span>
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEditor(wt)} title="Click para editar">
                          <div className={`text-[13px] ${wt.noteDone ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{wt.noteText}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] font-bold text-amber-500 bg-amber-100 rounded-full px-1.5 py-0.5 uppercase">Apunte</span>
                            {noteCName && <span className="text-[11px] text-gray-400">{noteCName}</span>}
                          </div>
                        </div>
                        <button
                          className="bg-transparent border-none text-gray-300 hover:text-amber-500 cursor-pointer p-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={(e) => { e.stopPropagation(); openEditor(wt); }}
                          title="Editar"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          className="bg-transparent border-none text-gray-300 hover:text-red-400 cursor-pointer p-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => removeWeeklyTodo(wt.id)}
                          title="Quitar apunte"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              // ── Tarea real ──
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

                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEditor(wt)} title="Click para editar">
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
                        className="bg-transparent border-none text-gray-300 hover:text-blue-500 cursor-pointer p-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={(e) => { e.stopPropagation(); openEditor(wt); }}
                        title="Editar"
                      >
                        <Pencil size={12} />
                      </button>
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

          {/* Add buttons */}
          <div className="px-4 pb-4">
            {addMenuDate === selectedDate ? (
              <div className="flex gap-2">
                <button className="flex-1 flex items-center justify-center gap-1.5 text-[11px] text-blue-600 bg-blue-50 border border-blue-200 rounded-lg py-2.5 cursor-pointer font-sans font-medium hover:bg-blue-100 transition-colors"
                  onClick={() => { setPickerDate(selectedDate); setAddMenuDate(null); }}>
                  <ListChecks size={13} /> Tarea real
                </button>
                <button className="flex-1 flex items-center justify-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg py-2.5 cursor-pointer font-sans font-medium hover:bg-amber-100 transition-colors"
                  onClick={() => { setNoteDate(selectedDate); setAddMenuDate(null); }}>
                  <StickyNote size={13} /> Apunte personal
                </button>
                <button className="text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer px-2"
                  onClick={() => setAddMenuDate(null)}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                className="w-full text-[12px] text-gray-400 hover:text-blue-500 bg-transparent border border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 rounded-lg py-2.5 cursor-pointer font-sans transition-colors"
                onClick={() => setAddMenuDate(selectedDate)}
              >
                + Agregar
              </button>
            )}
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

      {/* Note modal */}
      {noteDate && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => { setNoteDate(null); setNoteText(''); setNoteClientId(''); }}>
          <div className="bg-white rounded-xl border border-gray-200 p-5 w-full max-w-[420px] shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <StickyNote size={16} className="text-amber-500" />
              <h3 className="text-[14px] font-bold text-gray-800">Agregar apunte personal</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Apunte</label>
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Ej: Revisar propuesta de Melany, llamar a Victor..."
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-amber-400 resize-none"
                  rows={3}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Cliente (opcional)</label>
                <select
                  value={noteClientId}
                  onChange={e => setNoteClientId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-amber-400"
                >
                  <option value="">Sin cliente</option>
                  {(clients || []).filter(c => c.status === 'active').sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => { setNoteDate(null); setNoteText(''); setNoteClientId(''); }}
                  className="py-2 px-4 bg-transparent border border-gray-200 text-gray-600 text-[13px] rounded-lg cursor-pointer font-sans hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  disabled={!noteText.trim()}
                  onClick={async () => {
                    if (!noteText.trim() || !currentUser?.id) return;
                    await addWeeklyNote(currentUser.id, noteDate, noteText.trim(), noteClientId || null);
                    setNoteDate(null); setNoteText(''); setNoteClientId('');
                  }}
                  className="py-2 px-4 bg-amber-500 hover:bg-amber-600 text-white text-[13px] font-semibold rounded-lg border-none cursor-pointer font-sans disabled:opacity-40">
                  Agregar apunte
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal (tarea o apunte) */}
      {editingItem && (() => {
        const isNote = editingItem.type === 'note';
        const task = !isNote ? tasks.find(t => t.id === editingItem.taskId) : null;
        const focusBorder = isNote ? 'focus:border-amber-400' : 'focus:border-blue-400';
        return (
          <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={closeEditor}>
            <div className="bg-white rounded-xl border border-gray-200 p-5 w-full max-w-[460px] shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-4">
                {isNote ? <StickyNote size={16} className="text-amber-500" /> : <ListChecks size={16} className="text-blue-500" />}
                <h3 className="text-[14px] font-bold text-gray-800">{isNote ? 'Editar apunte' : 'Editar tarea'}</h3>
                {task && (
                  <span className="text-[10px] text-gray-400 truncate max-w-[160px] ml-1">{clientName(task.clientId)}</span>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">{isNote ? 'Apunte' : 'Titulo'}</label>
                  {isNote ? (
                    <textarea
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className={`w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none ${focusBorder} resize-none`}
                      rows={3}
                      autoFocus
                    />
                  ) : (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className={`w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none ${focusBorder}`}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveEditor(); if (e.key === 'Escape') closeEditor(); }}
                      autoFocus
                    />
                  )}
                </div>
                {!isNote && (
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">Descripcion</label>
                    <textarea
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      placeholder="Detalles, contexto, links..."
                      className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400 resize-y min-h-[80px]"
                      rows={4}
                    />
                  </div>
                )}
                {isNote && (
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">Cliente (opcional)</label>
                    <select
                      value={editNoteClientId}
                      onChange={e => setEditNoteClientId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-amber-400"
                    >
                      <option value="">Sin cliente</option>
                      {(clients || []).filter(c => c.status === 'active').sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={closeEditor}
                    className="py-2 px-4 bg-transparent border border-gray-200 text-gray-600 text-[13px] rounded-lg cursor-pointer font-sans hover:bg-gray-50">
                    Cancelar
                  </button>
                  <button
                    disabled={!editTitle.trim()}
                    onClick={saveEditor}
                    className={`py-2 px-4 ${isNote ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-500 hover:bg-blue-600'} text-white text-[13px] font-semibold rounded-lg border-none cursor-pointer font-sans disabled:opacity-40`}>
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
