import { useMemo, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, closestCorners, DragOverlay } from '@dnd-kit/core';
import { Plus, Settings as SettingsIcon } from 'lucide-react';
import { useCrm } from '../hooks/useCrm.js';
import KanbanColumn from '../components/KanbanColumn.jsx';
import LeadCard from '../components/LeadCard.jsx';
import LeadModal from '../components/LeadModal.jsx';
import StagesEditorModal from '../components/StagesEditorModal.jsx';

export default function CrmPage() {
  const {
    pipelineId, stages, leads, loading, error,
    addStage, updateStage, deleteStage, reorderStages,
    createLead, updateLead, deleteLead, moveLead,
  } = useCrm();

  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [activeLead, setActiveLead] = useState(null);      // lead siendo editado
  const [stagesEditorOpen, setStagesEditorOpen] = useState(false);
  const [draggingLead, setDraggingLead] = useState(null);  // para DragOverlay

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const leadsByStage = useMemo(() => {
    const map = {};
    stages.forEach((s) => { map[s.id] = []; });
    [...leads]
      .sort((a, b) => a.position - b.position)
      .forEach((l) => { if (map[l.stage_id]) map[l.stage_id].push(l); });
    return map;
  }, [stages, leads]);

  const openNewLead = () => { setActiveLead(null); setLeadModalOpen(true); };
  const openEditLead = (lead) => { setActiveLead(lead); setLeadModalOpen(true); };

  const handleDragStart = (e) => {
    const lead = leads.find((l) => l.id === e.active.id);
    setDraggingLead(lead || null);
  };

  const handleDragEnd = (e) => {
    setDraggingLead(null);
    const { active, over } = e;
    if (!over) return;

    const leadId = active.id;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    // Determinar stage y posicion destino.
    const overData = over.data.current;
    let toStageId, toPosition;
    if (overData?.type === 'stage') {
      toStageId = over.id;
      toPosition = leadsByStage[toStageId]?.length ?? 0;
    } else if (overData?.type === 'lead') {
      toStageId = overData.stage_id;
      const list = leadsByStage[toStageId] || [];
      const overIndex = list.findIndex((l) => l.id === over.id);
      toPosition = overIndex >= 0 ? overIndex : list.length;
    } else {
      return;
    }

    if (lead.stage_id === toStageId && lead.position === toPosition) return;
    moveLead(leadId, toStageId, toPosition);
  };

  if (loading) return <div className="text-text3 text-center py-20">Cargando CRM...</div>;
  if (error) return <div className="text-red text-center py-20">Error: {error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">CRM</h1>
          <p className="text-xs text-text3 mt-0.5">
            {leads.length} {leads.length === 1 ? 'lead' : 'leads'} · {stages.length} {stages.length === 1 ? 'etapa' : 'etapas'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setStagesEditorOpen(true)}
                  className="py-2 px-3 rounded-md border border-border bg-white text-text2 text-[13px] hover:bg-surface2 flex items-center gap-1.5">
            <SettingsIcon size={14} /> Editar columnas
          </button>
          <button onClick={openNewLead}
                  className="py-2 px-3 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark flex items-center gap-1.5">
            <Plus size={14} /> Nuevo lead
          </button>
        </div>
      </div>

      {stages.length === 0 ? (
        <div className="rounded-lg border border-border bg-white p-8 text-center">
          <p className="text-sm text-text2 mb-4">Tu pipeline no tiene columnas. Agregá la primera para arrancar.</p>
          <button onClick={() => setStagesEditorOpen(true)}
                  className="py-2 px-4 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark">
            Configurar columnas
          </button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-3">
            {stages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                leads={leadsByStage[stage.id] || []}
                onCardClick={openEditLead}
              />
            ))}
          </div>
          <DragOverlay>
            {draggingLead && <LeadCard lead={draggingLead} />}
          </DragOverlay>
        </DndContext>
      )}

      <LeadModal
        open={leadModalOpen}
        onClose={() => setLeadModalOpen(false)}
        lead={activeLead}
        stages={stages}
        onCreate={createLead}
        onUpdate={updateLead}
        onDelete={deleteLead}
      />

      <StagesEditorModal
        open={stagesEditorOpen}
        onClose={() => setStagesEditorOpen(false)}
        stages={stages}
        onAdd={addStage}
        onUpdate={updateStage}
        onDelete={deleteStage}
        onReorder={reorderStages}
      />
    </div>
  );
}
