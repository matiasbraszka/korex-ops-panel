import { useMemo, useState } from 'react';
import {
  DndContext, PointerSensor, useSensor, useSensors,
  DragOverlay, pointerWithin, rectIntersection,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '@korex/auth';
import { useCrm } from '../hooks/useCrm.js';
import KanbanColumn from '../components/KanbanColumn.jsx';
import LeadCard from '../components/LeadCard.jsx';
import LeadModal from '../components/LeadModal.jsx';
import StagesEditorModal from '../components/StagesEditorModal.jsx';

export default function CrmPage() {
  const { isAdmin } = useAuth();
  const {
    pipelineId, stages, leads, salesTeam, me, loading, error,
    addStage, updateStage, deleteStage, reorderStages,
    createLead, updateLead, deleteLead, moveLead,
  } = useCrm();

  // Lookup rapido owner_id (uuid auth.users) -> team_member.
  const ownersByUserId = useMemo(() => {
    const m = {};
    salesTeam.forEach((tm) => { m[tm.user_id] = tm; });
    return m;
  }, [salesTeam]);

  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [activeLead, setActiveLead] = useState(null);
  const [stagesEditorOpen, setStagesEditorOpen] = useState(false);
  const [draggingLead, setDraggingLead] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Leads por stage, ordenados por position.
  const leadsByStage = useMemo(() => {
    const map = {};
    stages.forEach((s) => { map[s.id] = []; });
    [...leads]
      .sort((a, b) => a.position - b.position)
      .forEach((l) => { if (map[l.stage_id]) map[l.stage_id].push(l); });
    return map;
  }, [stages, leads]);

  // IDs de todos los leads en el orden en que aparecen en el board.
  // Necesario para el SortableContext global que habilita drag entre columnas.
  const allLeadIds = useMemo(() => {
    return stages.flatMap((s) => (leadsByStage[s.id] || []).map((l) => l.id));
  }, [stages, leadsByStage]);

  const openNewLead = () => { setActiveLead(null); setLeadModalOpen(true); };
  const openEditLead = (lead) => { setActiveLead(lead); setLeadModalOpen(true); };

  const handleDragStart = (e) => {
    const lead = leads.find((l) => l.id === e.active.id);
    setDraggingLead(lead || null);
  };

  // Estrategia de colisión: preferir pointerWithin (columna bajo el cursor),
  // caer a rectIntersection para cubrir casos de cards apiladas.
  const collisionDetection = (args) => {
    const pointer = pointerWithin(args);
    if (pointer.length) return pointer;
    return rectIntersection(args);
  };

  const handleDragEnd = (e) => {
    setDraggingLead(null);
    const { active, over } = e;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;
    if (activeId === overId) return;

    const activeLead = leads.find((l) => l.id === activeId);
    if (!activeLead) return;

    // over puede ser una columna (type 'stage') o una card (type 'lead').
    const overData = over.data.current;
    const isOverColumn = overData?.type === 'stage';
    const isOverCard = overData?.type === 'lead';

    let toStageId;
    let toPosition;

    if (isOverColumn) {
      toStageId = overId;
      const list = leadsByStage[toStageId] || [];
      toPosition = list.length;
    } else if (isOverCard) {
      const overLead = leads.find((l) => l.id === overId);
      if (!overLead) return;
      toStageId = overLead.stage_id;
      const list = leadsByStage[toStageId] || [];
      toPosition = list.findIndex((l) => l.id === overId);
      if (toPosition < 0) toPosition = list.length;
    } else {
      return;
    }

    if (activeLead.stage_id === toStageId && activeLead.position === toPosition) return;
    moveLead(activeId, toStageId, toPosition);
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
          {isAdmin && (
            <button onClick={() => setStagesEditorOpen(true)}
                    className="py-2 px-3 rounded-md border border-border bg-white text-text2 text-[13px] hover:bg-surface2 flex items-center gap-1.5">
              <SettingsIcon size={14} /> Editar columnas
            </button>
          )}
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
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={allLeadIds} strategy={verticalListSortingStrategy}>
            <div className="flex gap-3 overflow-x-auto pb-3">
              {stages.map((stage) => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  leads={leadsByStage[stage.id] || []}
                  ownersByUserId={ownersByUserId}
                  canEditOwners={isAdmin}
                  onCardDetail={openEditLead}
                  onPatchLead={updateLead}
                />
              ))}
            </div>
          </SortableContext>
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
        salesTeam={salesTeam}
        canEditOwners={isAdmin}
        currentUserId={me}
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
