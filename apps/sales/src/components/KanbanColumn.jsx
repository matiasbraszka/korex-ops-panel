import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import LeadCard from './LeadCard.jsx';

export default function KanbanColumn({
  stage, leads, ownersByUserId, salesTeam,
  onCardDetail, onPatchLead, onDeleteLead, canEditOwners,
  onNewLead,
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id, data: { type: 'stage', stage_id: stage.id },
  });

  const total = leads.reduce((s, l) => s + (Number(l.estimated_value) || 0), 0);

  return (
    <div className="flex flex-col w-[236px] max-md:w-[78vw] shrink-0 max-h-full bg-surface2 rounded-xl">
      {/* Header con color-dot · nombre · count · total · btn + */}
      <div className="px-3 pt-3 pb-2 flex items-center gap-1.5 shrink-0">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.color }} />
        <span className="text-[12px] font-bold text-text">{stage.name}</span>
        <span className="text-[10.5px] text-text3 font-medium">{leads.length}</span>
        <div className="flex-1" />
        {total > 0 && (
          <span className="text-[10.5px] text-text3 font-semibold tabular-nums">{fmtMoney(total)}</span>
        )}
        {onNewLead && (
          <button onClick={() => onNewLead(stage.id)}
                  title={`Nuevo lead en ${stage.name}`}
                  className="bg-transparent border-0 text-text3 hover:text-text hover:bg-surface3 rounded w-[22px] h-[22px] flex items-center justify-center cursor-pointer transition-colors">
            <Plus size={13} />
          </button>
        )}
      </div>

      {/* Body con drop highlight */}
      <div ref={setNodeRef}
           className={`flex-1 min-h-0 overflow-y-auto px-2 pb-2.5 rounded-b-xl transition-all ${
             isOver ? 'bg-blue-bg2 shadow-[inset_0_0_0_2px_var(--color-blue)]' : ''
           }`}>
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            owner={ownersByUserId?.[lead.owner_id]}
            setter={ownersByUserId?.[lead.setter_id]}
            salesTeam={salesTeam}
            canEditOwners={canEditOwners}
            onDetail={() => onCardDetail(lead)}
            onPatch={(patch) => onPatchLead(lead.id, patch)}
            onDelete={() => onDeleteLead(lead.id)}
          />
        ))}
        {leads.length === 0 && (
          <div className="text-center text-[11px] text-text3 py-6 border border-dashed border-border-light rounded-md mt-1 pointer-events-none">
            Sin leads
          </div>
        )}
      </div>
    </div>
  );
}

function fmtMoney(n) {
  if (!n) return '';
  if (n >= 1000) return `US$ ${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `US$ ${Math.round(n)}`;
}
