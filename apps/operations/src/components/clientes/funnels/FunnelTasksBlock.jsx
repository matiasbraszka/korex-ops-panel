import { useState, useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import { userSeesTask, getActiveSprint } from '../../../utils/helpers';
import { SPRINT_COLUMNS, DEPARTMENTS, TASK_PRIORITY } from '../../../utils/constants';
import TaskDetailDrawer from '../../tareas/TaskDetailDrawer';

// Las tareas de ESTE funnel, en las mismas 6 columnas del Tablero Sprint.
// No es un tablero nuevo: es el de siempre, filtrado por funnel. Una tarea sigue
// viviendo en Tareas; acá aparece además donde se trabaja.
//
// OJO PERMISOS: el RBAC de tareas es 100% de pantalla, la base no filtra nada.
// Cualquier lugar nuevo que liste tareas y se olvide de `userSeesTask` le muestra
// a un no-admin las tareas de todos. Por eso el filtro va PRIMERO, antes que nada.

const initialOf = (name) => (String(name || '').trim()[0] || '?').toUpperCase();

// Los responsables se guardan como texto separado por comas ("Flor, Nico").
const asigneesOf = (t) => String(t.assignee || '').split(',').map(s => s.trim()).filter(Boolean);

function Chip({ on, onClick, children, n }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-[11.5px] font-semibold cursor-pointer transition-colors"
      style={{
        border: `1px solid ${on ? '#2E69E0' : '#E2E5EB'}`,
        background: on ? '#2E69E0' : '#fff',
        color: on ? '#fff' : '#6B7280',
      }}
    >
      {children}
      {n != null && <span className="text-[9.5px] font-bold opacity-70">{n}</span>}
    </button>
  );
}

export default function FunnelTasksBlock({ funnelId }) {
  const { tasks, sprints, currentUser, teamMembers } = useApp();
  const [openTaskId, setOpenTaskId] = useState(null);
  const [asignee, setAsignee] = useState('all');
  const [soloSprint, setSoloSprint] = useState(false);

  const restricted = !!currentUser && !currentUser.isAdmin;
  const activeSprint = useMemo(() => getActiveSprint(sprints), [sprints]);

  // Las del funnel que este usuario tiene permitido ver. De acá salen los conteos
  // de los filtros, así que un chip nunca puede delatar una tarea que no ve.
  const mine = useMemo(() => (tasks || []).filter(t => {
    if (t.funnelId !== funnelId) return false;
    if (restricted && !userSeesTask(t, currentUser, teamMembers)) return false;
    return true;
  }), [tasks, funnelId, restricted, currentUser, teamMembers]);

  // Un chip por persona con tareas acá (no todo el equipo: sería una lista de
  // nombres que no tienen nada que ver con este funnel).
  const people = useMemo(() => {
    const m = new Map();
    mine.forEach(t => asigneesOf(t).forEach(n => m.set(n, (m.get(n) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [mine]);

  const shown = useMemo(() => mine.filter(t => {
    if (asignee !== 'all' && !asigneesOf(t).includes(asignee)) return false;
    if (soloSprint && (!activeSprint || t.sprintId !== activeSprint.id)) return false;
    return true;
  }), [mine, asignee, soloSprint, activeSprint]);

  const sprintN = useMemo(
    () => (activeSprint ? mine.filter(t => t.sprintId === activeSprint.id).length : 0),
    [mine, activeSprint],
  );

  if (!mine.length) {
    return (
      <div className="border border-[#E7EAF0] rounded-xl bg-white mb-3.5 py-5 px-4 text-center">
        <div className="text-[12.5px] text-[#6B7280] font-semibold">Este funnel todavía no tiene tareas</div>
        <div className="text-[11px] text-[#9098A4] mt-1">Al abrir una tarea en la pestaña Tareas podés elegir a qué funnel pertenece.</div>
      </div>
    );
  }

  return (
    <div className="border border-[#E7EAF0] rounded-xl bg-white mb-3.5 py-3 px-3.5">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.07em] text-[#C3C9D4] mr-0.5">Encargado</span>
        <Chip on={asignee === 'all'} onClick={() => setAsignee('all')} n={mine.length}>Todos</Chip>
        {people.map(([name, n]) => (
          <Chip key={name} on={asignee === name} onClick={() => setAsignee(name)} n={n}>{name}</Chip>
        ))}
        {activeSprint && (
          <>
            <span className="w-px h-4 bg-[#E7EAF0] mx-1" />
            <Chip on={soloSprint} onClick={() => setSoloSprint(v => !v)} n={sprintN}>Sólo del sprint</Chip>
          </>
        )}
      </div>

      <div className="grid gap-2 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
        {SPRINT_COLUMNS.map(col => {
          const list = shown.filter(t => t.status === col.status);
          return (
            <div key={col.status} className="rounded-[10px] overflow-hidden" style={{ background: '#F4F5F7' }}>
              <div className="flex items-center justify-between gap-1.5 py-[7px] px-2.5" style={{ background: col.bg, color: col.tx }}>
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.05em] truncate">{col.label}</span>
                <span className="text-[10px] opacity-65 font-bold shrink-0">{list.length}</span>
              </div>
              <div className="p-[7px] flex flex-col gap-1.5" style={{ minHeight: 44 }}>
                {!list.length && <div className="text-[11px] text-[#C3C9D4] text-center py-1.5">—</div>}
                {list.map(t => {
                  const dep = t.department ? DEPARTMENTS[t.department] : null;
                  const pri = t.priority ? TASK_PRIORITY[t.priority] : null;
                  const inSprint = activeSprint && t.sprintId === activeSprint.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setOpenTaskId(t.id)}
                      className="bg-white border border-[#E7EAF0] rounded-lg py-2 px-2.5 cursor-pointer hover:border-[#2E69E0] hover:shadow-sm transition-all"
                    >
                      <div className="text-[11.5px] font-semibold text-[#1A1D26] leading-[1.35] mb-1.5">{t.title}</div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {dep && <span className="text-[8.5px] font-extrabold uppercase tracking-[0.03em] py-0.5 px-1.5 rounded" style={{ background: dep.bg, color: dep.color }}>{dep.label}</span>}
                        {pri && <span className="text-[8.5px] font-extrabold uppercase tracking-[0.03em] py-0.5 px-1.5 rounded" style={{ background: pri.bg, color: pri.color }}>{pri.short}</span>}
                        {inSprint && <span className="text-[8.5px] font-extrabold uppercase tracking-[0.03em] py-0.5 px-1.5 rounded" style={{ background: '#EEF2FF', color: '#5B7CF5' }}>sprint</span>}
                        {t.assignee && (
                          <span title={t.assignee} className="ml-auto w-[18px] h-[18px] rounded-full inline-flex items-center justify-center text-[9px] font-extrabold shrink-0" style={{ background: '#E8EBF0', color: '#6B7280' }}>
                            {initialOf(t.assignee)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {openTaskId && <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </div>
  );
}
