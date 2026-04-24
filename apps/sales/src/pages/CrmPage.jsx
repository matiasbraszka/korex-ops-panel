import { useMemo, useState } from 'react';
import {
  DndContext, PointerSensor, useSensor, useSensors,
  DragOverlay, pointerWithin, rectIntersection,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, Settings as SettingsIcon, LayoutGrid, Rows3 } from 'lucide-react';
import { useAuth } from '@korex/auth';
import { useCrm } from '../hooks/useCrm.js';
import KanbanColumn from '../components/KanbanColumn.jsx';
import LeadCard from '../components/LeadCard.jsx';
import LeadsTable from '../components/LeadsTable.jsx';
import LeadModal from '../components/LeadModal.jsx';
import StagesEditorModal from '../components/StagesEditorModal.jsx';

export default function CrmPage() {
  const { isAdmin } = useAuth();
  const {
    pipelineId, stages, leads, salesTeam, me, loading, error,
    addStage, updateStage, deleteStage, reorderStages,
    createLead, updateLead, deleteLead, moveLead,
  } = useCrm();

  const [view, setView] = useState('kanban'); // 'kanban' | 'table'
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [activeLead, setActiveLead] = useState(null);
  const [stagesEditorOpen, setStagesEditorOpen] = useState(false);
  const [draggingLead, setDraggingLead] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const ownersByUserId = useMemo(() => {
    const m = {};
    salesTeam.forEach((tm) => { m[tm.user_id] = tm; });
    return m;
  }, [salesTeam]);

  const leadsByStage = useMemo(() => {
    const map = {};
    stages.forEach((s) => { map[s.id] = []; });
    [...leads]
      .sort((a, b) => a.position - b.position)
      .forEach((l) => { if (map[l.stage_id]) map[l.stage_id].push(l); });
    return map;
  }, [stages, leads]);

  const allLeadIds = useMemo(() => {
    return stages.flatMap((s) => (leadsByStage[s.id] || []).map((l) => l.id));
  }, [stages, leadsByStage]);

  // Para vista de tabla: leads en orden de stage + position.
  const orderedLeads = useMemo(() => {
    const stageIdx = Object.fromEntries(stages.map((s, i) => [s.id, i]));
    return [...leads].sort((a, b) => {
      const sa = stageIdx[a.stage_id] ?? 999;
      const sb = stageIdx[b.stage_id] ?? 999;
      if (sa !== sb) return sa - sb;
      return (a.position || 0) - (b.position || 0);
    });
  }, [leads, stages]);

  const openNewLead = () => { setActiveLead(null); setLeadModalOpen(true); };
  const openEditLead = (lead) => { setActiveLead(lead); setLeadModalOpen(true); };

  const handleDeleteWithConfirm = (id) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    if (!confirm(`¿Eliminar a "${lead.full_name}"? No se puede deshacer.`)) return;
    deleteLead(id);
  };

  const handleDragStart = (e) => {
    const lead = leads.find((l) => l.id === e.active.id);
    setDraggingLead(lead || null);
  };

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
    const lead = leads.find((l) => l.id === activeId);
    if (!lead) return;
    const overData = over.data.current;
    let toStageId, toPosition;
    if (overData?.type === 'stage') {
      toStageId = overId;
      toPosition = (leadsByStage[toStageId] || []).length;
    } else if (overData?.type === 'lead') {
      const overLead = leads.find((l) => l.id === overId);
      if (!overLead) return;
      toStageId = overLead.stage_id;
      const list = leadsByStage[toStageId] || [];
      toPosition = list.findIndex((l) => l.id === overId);
      if (toPosition < 0) toPosition = list.length;
    } else { return; }
    if (lead.stage_id === toStageId && lead.position === toPosition) return;
    moveLead(activeId, toStageId, toPosition);
  };

  if (loading) return <div className="text-text3 text-center py-20">Cargando CRM...</div>;
  if (error) return <div className="text-red text-center py-20">Error: {error}</div>;

  return (
    <div className="flex flex-col h-[calc(100dvh-110px)] max-md:h-[calc(100dvh-90px)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold">CRM</h1>
          <p className="text-xs text-text3 mt-0.5">
            {leads.length} {leads.length === 1 ? 'lead' : 'leads'} · {stages.length} {stages.length === 1 ? 'etapa' : 'etapas'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle vista */}
          <div className="flex items-center bg-surface2 rounded-md p-0.5 border border-border">
            <button onClick={() => setView('kanban')} title="Kanban"
                    className={`p-1.5 rounded ${view === 'kanban' ? 'bg-white shadow-sm text-text' : 'text-text3 hover:text-text'}`}>
              <LayoutGrid size={14} />
            </button>
            <button onClick={() => setView('table')} title="Tabla"
                    className={`p-1.5 rounded ${view === 'table' ? 'bg-white shadow-sm text-text' : 'text-text3 hover:text-text'}`}>
              <Rows3 size={14} />
            </button>
          </div>

          {isAdmin && (
            <button onClick={() => setStagesEditorOpen(true)}
                    className="py-2 px-3 rounded-md border border-border bg-white text-text2 text-[13px] hover:bg-surface2 flex items-center gap-1.5">
              <SettingsIcon size={14} /> Columnas
            </button>
          )}
          <button onClick={openNewLead}
                  className="py-2 px-3 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark flex items-center gap-1.5">
            <Plus size={14} /> Nuevo lead
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {stages.length === 0 ? (
          <div className="rounded-lg border border-border bg-white p-8 text-center">
            <p className="text-sm text-text2 mb-4">El pipeline no tiene columnas. Pedile al admin que las configure.</p>
            {isAdmin && (
              <button onClick={() => setStagesEditorOpen(true)}
                      className="py-2 px-4 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark">
                Configurar columnas
              </button>
            )}
          </div>
        ) : view === 'kanban' ? (
          <DndContext sensors={sensors} collisionDetection={collisionDetection}
                      onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <SortableContext items={allLeadIds} strategy={verticalListSortingStrategy}>
              <div className="flex gap-3 overflow-x-scroll overflow-y-hidden h-full pb-1" style={{ scrollbarGutter: 'stable' }}>
                {stages.map((stage) => (
                  <KanbanColumn
                    key={stage.id}
                    stage={stage}
                    leads={leadsByStage[stage.id] || []}
                    ownersByUserId={ownersByUserId}
                    salesTeam={salesTeam}
                    canEditOwners={isAdmin}
                    onCardDetail={openEditLead}
                    onPatchLead={updateLead}
                    onDeleteLead={handleDeleteWithConfirm}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {draggingLead && <LeadCard lead={draggingLead}
                                          owner={ownersByUserId[draggingLead.owner_id]}
                                          setter={ownersByUserId[draggingLead.setter_id]} />}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="h-full overflow-auto">
            <LeadsTable
              leads={orderedLeads}
              stages={stages}
              salesTeam={salesTeam}
              ownersByUserId={ownersByUserId}
              canEditOwners={isAdmin}
              onPatchLead={updateLead}
              onDeleteLead={(id) => handleDeleteWithConfirm(id)}
              onDetail={openEditLead}
            />
          </div>
        )}
      </div>

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
