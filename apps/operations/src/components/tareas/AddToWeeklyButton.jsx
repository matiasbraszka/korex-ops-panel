import { useState, useRef, useEffect } from 'react';
import { CalendarPlus, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { today } from '../../utils/helpers';

// Boton que agrega una tarea al "to-do list personal" (Mi Semana) en el dia que
// el usuario elija. Se monta sobre cualquier task row (lista/roadmap).
//
// Comportamiento:
//  - Hover/click muestra un popover con accesos rapidos (Hoy, Mañana, Lun
//    proximo, etc) + un date picker manual.
//  - Al elegir fecha, llama addWeeklyTodo y muestra checkmark verde 1.5s.
//  - Si la tarea ya esta en algun dia del usuario, el icono se pinta azul
//    para indicar "ya en tu semana".
//
// Props:
//   - taskId: id de la tarea
//   - size: tamaño del icono (default 13)
//   - className: clases extra del wrapper

const pad = (n) => String(n).padStart(2, '0');
const fmtIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function buildQuickDates() {
  const now = new Date();
  const todayIso = fmtIso(now);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const dow = now.getDay(); // 0=Dom
  const daysToMonday = (8 - (dow === 0 ? 7 : dow)) % 7 || 7;
  const nextMonday = new Date(now); nextMonday.setDate(nextMonday.getDate() + daysToMonday);
  return [
    { key: 'today',    label: 'Hoy',          iso: todayIso },
    { key: 'tomorrow', label: 'Mañana',       iso: fmtIso(tomorrow) },
    { key: 'monday',   label: 'Lunes próximo', iso: fmtIso(nextMonday) },
  ];
}

export default function AddToWeeklyButton({ taskId, size = 13, className = '' }) {
  const { currentUser, weeklyTodos, addWeeklyTodo, removeWeeklyTodo } = useApp();
  const [open, setOpen] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [customDate, setCustomDate] = useState(today());
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ¿La tarea ya está en mi semana? Lo usamos para pintar el icono distinto.
  const myExisting = (weeklyTodos || []).filter(
    (w) => w.taskId === taskId && w.userId === currentUser?.id && w.type !== 'note',
  );
  const alreadyIn = myExisting.length > 0;

  const handlePick = async (iso) => {
    if (!currentUser?.id) { alert('No se detectó usuario actual.'); return; }
    await addWeeklyTodo(currentUser.id, taskId, iso);
    setOpen(false);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  const handleRemoveAll = async () => {
    for (const w of myExisting) {
      // eslint-disable-next-line no-await-in-loop
      await removeWeeklyTodo(w.id);
    }
    setOpen(false);
  };

  const quick = buildQuickDates();

  return (
    <div ref={ref} className={`relative inline-block ${className}`} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        title={alreadyIn ? 'Ya está en tu semana — elegí otro día o quitala' : 'Agregar a Mi Semana'}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-center w-6 h-6 rounded bg-transparent border-none cursor-pointer transition-colors ${
          justAdded
            ? 'text-green-600'
            : alreadyIn
              ? 'text-blue-500 hover:bg-blue-50'
              : 'text-text3 hover:text-blue hover:bg-blue-50'
        }`}
      >
        {justAdded ? <Check size={size} strokeWidth={2.5} /> : <CalendarPlus size={size} strokeWidth={alreadyIn ? 2.25 : 1.75} />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-border rounded-lg shadow-xl min-w-[200px] overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-surface2/50">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-text3">Agregar a Mi Semana</div>
            {alreadyIn && (
              <div className="text-[10px] text-blue-600 mt-0.5">
                Ya en tu semana ({myExisting.length} {myExisting.length === 1 ? 'día' : 'días'})
              </div>
            )}
          </div>
          <div className="flex flex-col py-1">
            {quick.map((q) => (
              <button
                key={q.key}
                type="button"
                onClick={() => handlePick(q.iso)}
                className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-blue-50 cursor-pointer bg-transparent border-none text-left text-[12px] font-sans"
              >
                <span className="font-medium text-text">{q.label}</span>
                <span className="text-[10px] text-text3">{q.iso.slice(5)}</span>
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-border">
            <label className="block text-[10px] font-semibold text-text3 mb-1">Otro día</label>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="flex-1 border border-border rounded py-1 px-1.5 text-[11px] font-sans outline-none focus:border-blue"
              />
              <button
                type="button"
                onClick={() => customDate && handlePick(customDate)}
                disabled={!customDate}
                className="text-[11px] py-1 px-2 rounded bg-blue text-white font-semibold hover:bg-blue-dark cursor-pointer border-none disabled:opacity-50"
              >
                +
              </button>
            </div>
          </div>
          {alreadyIn && (
            <button
              type="button"
              onClick={handleRemoveAll}
              className="w-full text-[11px] py-1.5 px-3 text-red-500 hover:bg-red-50 cursor-pointer bg-transparent border-0 border-t border-border font-sans"
            >
              Quitar de Mi Semana
            </button>
          )}
        </div>
      )}
    </div>
  );
}
