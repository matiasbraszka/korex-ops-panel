import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export default function LeadCard({ lead, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { type: 'lead', stage_id: lead.stage_id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="bg-white border border-border rounded-lg p-3 mb-2 cursor-grab active:cursor-grabbing hover:border-blue transition-colors"
    >
      <div className="text-[13px] font-semibold text-text truncate">{lead.full_name}</div>
      {lead.company_multinivel && (
        <div className="text-[11px] text-text2 truncate mt-0.5">{lead.company_multinivel}</div>
      )}
      {lead.proposal && (
        <div className="text-[11px] text-text3 mt-1.5 line-clamp-2">{lead.proposal}</div>
      )}
      <div className="flex items-center gap-2 mt-2">
        {lead.phone && <span className="text-[10px] text-text3">📞 {lead.phone}</span>}
        {lead.email && <span className="text-[10px] text-text3 truncate">✉ {lead.email}</span>}
      </div>
      {lead.origin === 'llamada_auto' && (
        <div className="text-[9px] text-blue mt-1 uppercase tracking-wider">Desde llamada</div>
      )}
    </div>
  );
}
