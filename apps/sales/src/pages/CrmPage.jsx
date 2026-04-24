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
import CrmFilters from '../components/CrmFilters.jsx';

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
  const [filters, setFilters] = useState({ search: '', stageId: '', assigneeId: '', scores: [] });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const ownersByUserId = useMemo(() => {
    const m = {};
    salesTeam.forEach((tm) => { m[tm.user_id] = tm; });
    return m;
  }, [salesTeam]);

  // Aplicar filtros + busqueda al universo total de leads.
  // 'assigneeId' filtra leads donde la persona es owner O setter.
  const filteredLeads = useMemo(() => {
    const q = (filters.search || '').trim().toLowerCase();
    return leads.filter((l) => {
      if (filters.stageId && l.stage_id !== filters.stageId) return false;
      if (filters.assigneeId && l.owner_id !== filters.assigneeId && l.setter_id !== filters.assigneeId) return false;
      if (filters.scores?.length && !filters.scores.includes(l.score)) return false;
      if (q) {
        const hay = (l.full_name || '').toLowerCase().includes(q)
                 || (l.company_multinivel || '').toLowerCase().includes(q)
                 || (l.email || '').toLowerCase().includes(q)
                 || (l.phone || '').toLowerCase().includes(q);
        if (!hay) return false;
      }
      return true;
    });
  }, [leads, filters]);

  // Orden compuesto: score desc (3 → 2 → 1 → null), luego position manual.
  const sortLeads = (arr) => [...arr].sort((a, b) => {
    const sa = a.score ?? 0;
    const sb = b.score ?? 0;
    if (sb !== sa) return sb - sa;
    return (a.position || 0) - (b.position || 0);
  });

  const leadsByStage = useMemo(() => {
    const map = {};
    stages.forEach((s) => { map[s.id] = []; });
    filteredLeads.forEach((l) => { if (map[l.stage_id]) map[l.stage_id].push(l); });
    Object.keys(map).forEach((k) => { map[k] = sortLeads(map[k]); });
    return map;
  }, [stages, filteredLeads]);

  const allLeadIds = useMemo(() => {
    return stages.flatMap((s) => (leadsByStage[s.id] || []).map((l) => l.id));
  }, [stages, leadsByStage]);

  // Tabla: orden por stage primero, dentro por score desc + position.
  const orderedLeads = useMemo(() => {
    const stageIdx = Object.fromEntries(stages.map((s, i) => [s.id, i]));
    return [...filteredLeads].sort((a, b) => {
      const sa = stageIdx[a.stage_id] ?? 999;
      const sb = stageIdx[b.stage_id] ?? 999;
      if (sa !== sb) return sa - sb;
      const scA = a.score ?? 0;
      const scB = b.score ?? 0;
      if (scB !== scA) return scB - scA;
      return (a.position || 0) - (b.position || 0);
    });
  }, [filteredLeads, stages]);

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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header: titulo + acciones + filtros + stats */}
      <div className="shrink-0 space-y-2 mb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-bold">CRM</h1>
          <div className="flex items-center gap-2">
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
                      title="Editar columnas"
                      className="py-2 px-3 max-md:px-2 rounded-md border border-border bg-white text-text2 text-[13px] hover:bg-surface2 flex items-center gap-1.5">
                <SettingsIcon size={14} /> <span className="max-md:hidden">Columnas</span>
              </button>
            )}
            <button onClick={openNewLead}
                    title="Nuevo lead"
                    className="py-2 px-3 max-md:px-2 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark flex items-center gap-1.5">
              <Plus size={14} /> <span className="max-md:hidden">Nuevo lead</span>
            </button>
          </div>
        </div>

        <CrmFilters filters={filters} setFilters={setFilters} stages={stages} salesTeam={salesTeam} />
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
              <div className="flex gap-2 overflow-x-auto overflow-y-hidden h-full -mx-1 px-1">
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
