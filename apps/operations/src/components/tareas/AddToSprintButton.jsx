import { useState } from 'react';
import { Zap, X, ChevronDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';

// "al sprint": abre un menú para ELEGIR a qué sprint mandar la tarea — el sprint
// en curso ("actual") o los pre-abiertos de las próximas semanas ("próximo"). La
// prioridad la marca el orden/posición en el Kanban. "En {sprint}": al clickearla,
// saca la tarea de ese sprint. La tarea puede estar en cualquier sprint (no solo
// el activo), por eso el chip muestra el nombre real.
//
// Props:
//   - task: objeto tarea completo
const chipStyle = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, borderRadius: 7, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' };

export default function AddToSprintButton({ task }) {
  const { sprints, activeSprint, addTaskToSprint, createSprint, removeTaskFromSprint } = useApp();
  const [open, setOpen] = useState(false);

  // Sprint actual de la tarea (cualquiera, no solo el activo).
  const taskSprint = task?.sprintId ? (sprints || []).find(s => s.id === task.sprintId) : null;

  if (taskSprint) {
    return (
      <span
        onClick={(e) => { e.stopPropagation(); removeTaskFromSprint(task.id); }}
        title={`Quitar de ${taskSprint.name}`}
        style={{ ...chipStyle, color: '#fff', background: '#5B7CF5', flexShrink: 0 }}
      >
        <Zap size={13} fill="currentColor" stroke="none" /> En {taskSprint.name} <X size={12} strokeWidth={2.5} />
      </span>
    );
  }

  // Sprints elegibles: el activo + los pre-abiertos ('planned'). Nunca cerrados.
  const opciones = (sprints || [])
    .filter(s => s.status !== 'closed')
    .sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));

  const enviar = (sprintId) => {
    const hasAssignee = !!String(task?.assignee || '').trim();
    addTaskToSprint(task.id, { sprintId, status: hasAssignee ? 'priorizado' : 'backlog' });
    setOpen(false);
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (opciones.length === 0) { const s = createSprint(); if (s) enviar(s.id); return; } // sin sprints: crear el activo y mandar directo
    if (opciones.length === 1) { enviar(opciones[0].id); return; }                        // uno solo: atajo directo, sin menú
    setOpen(o => !o);
  };

  return (
    <span style={{ position: 'relative', flexShrink: 0 }}>
      <span onClick={handleClick} title="Enviar a un sprint" style={{ ...chipStyle, color: '#5B7CF5', background: '#EEF2FF' }}>
        <Zap size={13} fill="currentColor" stroke="none" /> al sprint <ChevronDown size={12} strokeWidth={2.5} />
      </span>
      {open && (
        <>
          {/* backdrop: cierra el menú al clickear afuera (sin abrir la ficha) */}
          <span onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 41, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 5, minWidth: 178 }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.3, padding: '5px 9px 3px' }}>Enviar al sprint</div>
            {opciones.map(s => {
              const esActual = s.id === activeSprint?.id;
              return (
                <button
                  key={s.id}
                  onClick={(e) => { e.stopPropagation(); enviar(s.id); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, color: '#1A1D26', padding: '7px 9px', borderRadius: 7, fontFamily: 'inherit', textAlign: 'left' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F3F4F6')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span>{s.name}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: esActual ? '#5B7CF5' : '#9CA3AF' }}>{esActual ? 'actual' : 'próximo'}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </span>
  );
}
