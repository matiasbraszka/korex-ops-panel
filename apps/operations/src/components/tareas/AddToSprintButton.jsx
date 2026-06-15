import { Zap, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

// "al sprint": manda la tarea directo al sprint activo (sin popup). La prioridad
// la marca el orden/posición en el Kanban. Si no tiene responsable, se asigna
// en el tablero. "En sprint": al clickearla, la saca del sprint.
//
// Props:
//   - task: objeto tarea completo
export default function AddToSprintButton({ task }) {
  const { activeSprint, addTaskToSprint, createSprint, removeTaskFromSprint } = useApp();
  const inSprint = !!activeSprint && task?.sprintId === activeSprint.id;

  if (inSprint) {
    return (
      <span
        onClick={(e) => { e.stopPropagation(); removeTaskFromSprint(task.id); }}
        title="Quitar del sprint"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#fff', background: '#5B7CF5', borderRadius: 7, padding: '5px 10px', whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer' }}
      >
        <Zap size={13} fill="currentColor" stroke="none" /> En sprint <X size={12} strokeWidth={2.5} />
      </span>
    );
  }

  const handleAdd = (e) => {
    e.stopPropagation();
    if (!activeSprint) createSprint();
    const hasAssignee = !!String(task?.assignee || '').trim();
    addTaskToSprint(task.id, { status: hasAssignee ? 'priorizado' : 'backlog' });
  };

  return (
    <span
      onClick={handleAdd}
      title="Enviar al sprint en curso"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#5B7CF5', background: '#EEF2FF', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
    >
      <Zap size={13} fill="currentColor" stroke="none" /> al sprint
    </span>
  );
}
