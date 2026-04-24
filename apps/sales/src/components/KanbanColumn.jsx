import { useDroppable } from '@dnd-kit/core';
import LeadCard from './LeadCard.jsx';

// Columna del Kanban: solo droppable. El SortableContext es global a nivel
// del board (ver CrmPage) para permitir arrastrar entre columnas.
export default function KanbanColumn({ stage, leads, onCardClick }) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: 'stage', stage_id: stage.id },
  });

  return (
    <div className="flex flex-col w-[280px] shrink-0">
      <div className="flex items-center gap-2 px-2 pb-2 border-b-2" style={{ borderColor: stage.color }}>
        <span className="text-[13px] font-semibold text-text">{stage.name}</span>
        <span className="text-[11px] text-text3">{leads.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 p-2 rounded-b-lg min-h-[200px] transition-colors ${isOver ? 'bg-blue-bg2' : 'bg-surface2'}`}
      >
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onClick={() => onCardClick(lead)} />
        ))}
        {leads.length === 0 && (
          <div className="text-center text-[11px] text-text3 py-8 pointer-events-none">Sin leads</div>
        )}
      </div>
    </div>
  );
}
