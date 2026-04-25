import { useMemo, useState, useEffect } from 'react';
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
    createLead, updateLead, deleteLead, moveLead, convertLeadToClient,
  } = useCrm();

  const [view, setView] = useState('kanban'); // 'kanban' | 'table'
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [activeLead, setActiveLead] = useState(null);
  const [stagesEditorOpen, setStagesEditorOpen] = useState(false);
  const [draggingLead, setDraggingLead] = useState(null);
  const [filters, setFilters] = useState({ search: '', stageId: '', assigneeId: '', scores: [] });
  // Tab activo en vista mobile (1 etapa a la vez)
  const [mobileStageId, setMobileStageId] = useState(null);
  // Quick filters chip activo: '' | 'mine' | 'stale' | 'closing'
  const [quickFilter, setQuickFilter] = useState('');
  // Detectar mobile en runtime para render condicional (no doble-registrar
  // los mismos IDs en dnd-kit como pasaba con `hidden md:flex` + `md:hidden`).
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const ownersByUserId = useMemo(() => {
    const m = {};
    salesTeam.forEach((tm) => { m[tm.user_id] = tm; });
    return m;
  }, [salesTeam]);

  const filteredLeads = useMemo(() => {
    const q = (filters.search || '').trim().toLowerCase();
    const now = Date.now();
    return leads.filter((l) => {
      if (filters.stageId && l.stage_id !== filters.stageId) return false;
      if (filters.assigneeId && l.owner_id !== filters.assigneeId && l.setter_id !== filters.assigneeId) return false;
      if (filters.scores?.length && !filters.scores.includes(l.score)) return false;
      if (quickFilter === 'mine' && l.owner_id !== me && l.setter_id !== me) return false;
      if (quickFilter === 'stale') {
        const updated = l.updated_at ? new Date(l.updated_at).getTime() : 0;
        if (!updated || (now - updated) < 7 * 86400_000) return false;
      }
      if (quickFilter === 'closing') {
        if (!(l.score === 3)) return false;
      }
      if (q) {
        const hay = (l.full_name || '').toLowerCase().includes(q)
                 || (l.company_multinivel || '').toLowerCase().includes(q)
                 || (l.email || '').toLowerCase().includes(q)
                 || (l.phone || '').toLowerCase().includes(q);
        if (!hay) return false;
      }
      return true;
    });
  }, [leads, filters, quickFilter, me]);

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

  // KPIs del topbar
  const totalActive = filteredLeads.length;
  const totalProjected = filteredLeads.reduce((s, l) => s + (Number(l.estimated_value) || 0), 0);
  const myCount = leads.filter((l) => l.owner_id === me || l.setter_id === me).length;

  // Etapa activa en mobile (default: primera etapa con leads)
  const activeMobileStage = mobileStageId || stages[0]?.id;
  const mobileLeads = activeMobileStage ? (leadsByStage[activeMobileStage] || []) : [];
  const mobileStage = stages.find((s) => s.id === activeMobileStage);
  const mobileTotal = mobileLeads.reduce((s, l) => s + (Number(l.estimated_value) || 0), 0);

  const openNewLead = (stageId) => {
    setActiveLead(stageId ? { stage_id: stageId } : null);
    setLeadModalOpen(true);
  };
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
    <div className="flex flex-col">
      {/* Header: titulo + KPIs + acciones */}
      <div className="space-y-2.5 mb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight">CRM</h1>
            <p className="text-[11.5px] text-text3 mt-0.5">
              Pipeline · {totalActive} {totalActive === 1 ? 'lead' : 'leads'}
              {totalProjected > 0 && <> · {fmtMoney(totalProjected)} proyectado</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-surface2 rounded-md p-0.5 border border-border max-md:hidden">
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
            <button onClick={() => openNewLead()}
                    title="Nuevo lead"
                    className="py-2 px-3 max-md:px-2 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark flex items-center gap-1.5">
              <Plus size={14} /> <span className="max-md:hidden">Nuevo lead</span>
            </button>
          </div>
        </div>

        <CrmFilters filters={filters} setFilters={setFilters} stages={stages} salesTeam={salesTeam} />

        {/* Quick filter chips · solo desktop */}
        <div className="flex items-center gap-1.5 flex-wrap max-md:hidden">
          <Chip active={quickFilter === 'mine'} onClick={() => setQuickFilter(quickFilter === 'mine' ? '' : 'mine')}
                tone="blue">Míos · {myCount}</Chip>
          <Chip active={quickFilter === ''} onClick={() => setQuickFilter('')}>
            Todos · {leads.length}
          </Chip>
          <Chip active={quickFilter === 'stale'} onClick={() => setQuickFilter(quickFilter === 'stale' ? '' : 'stale')}
                tone="yellow">Sin actividad 7d</Chip>
          <Chip active={quickFilter === 'closing'} onClick={() => setQuickFilter(quickFilter === 'closing' ? '' : 'closing')}
                tone="green">Cerrando 🔥🔥🔥</Chip>
        </div>
      </div>

      {/* Body */}
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
      ) : view === 'table' ? (
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
      ) : (
        <DndContext sensors={sensors} collisionDetection={collisionDetection}
                    onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext items={isMobile ? mobileLeads.map((l) => l.id) : allLeadIds}
                           strategy={verticalListSortingStrategy}>
            {!isMobile ? (
              /* DESKTOP · kanban horizontal */
              <div className="flex gap-3 overflow-x-auto overflow-y-hidden -mx-1 px-1 pb-2 crm-kanban-desktop">
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
                    onNewLead={openNewLead}
                  />
                ))}
              </div>
            ) : (
              /* MOBILE · tabs por etapa + lista vertical */
              <div className="flex flex-col gap-2.5">
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                  {stages.map((s) => {
                    const n = (leadsByStage[s.id] || []).length;
                    const isOn = s.id === activeMobileStage;
                    return (
                      <button key={s.id} onClick={() => setMobileStageId(s.id)}
                              className={`px-3 py-1.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all border ${
                                isOn ? 'bg-text text-white border-text' : 'bg-white text-text2 border-border hover:bg-surface2'
                              }`}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                        {s.name}
                        <span className={`text-[10px] px-1.5 py-px rounded-full font-bold ${
                          isOn ? 'bg-white/20 text-white' : 'bg-surface3 text-text3'
                        }`}>{n}</span>
                      </button>
                    );
                  })}
                </div>

                {mobileStage && (
                  <div className="flex items-end justify-between px-1">
                    <div>
                      <div className="text-[15px] font-bold leading-tight">{mobileStage.name}</div>
                      <div className="text-[10.5px] text-text3 mt-0.5">
                        {mobileLeads.length} {mobileLeads.length === 1 ? 'lead' : 'leads'}
                        {mobileTotal > 0 && <> · {fmtMoney(mobileTotal)} proyectado</>}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  {mobileLeads.length === 0 ? (
                    <div className="text-center text-[12px] text-text3 py-10 border border-dashed border-border-light rounded-lg">
                      No hay leads en esta etapa
                    </div>
                  ) : (
                    mobileLeads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        owner={ownersByUserId?.[lead.owner_id]}
                        setter={ownersByUserId?.[lead.setter_id]}
                        salesTeam={salesTeam}
                        canEditOwners={isAdmin}
                        onDetail={() => openEditLead(lead)}
                        onPatch={(patch) => updateLead(lead.id, patch)}
                        onDelete={() => handleDeleteWithConfirm(lead.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </SortableContext>
          <DragOverlay>
            {draggingLead && <LeadCard lead={draggingLead}
                                        owner={ownersByUserId[draggingLead.owner_id]}
                                        setter={ownersByUserId[draggingLead.setter_id]} />}
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
        onConvertToClient={convertLeadToClient}
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

function Chip({ active, onClick, tone = 'gray', children }) {
  const tones = {
    gray:   active ? 'bg-text text-white border-text'              : 'bg-white text-text2 border-border hover:bg-surface2',
    blue:   active ? 'bg-blue-bg text-blue border-blue/30'         : 'bg-white text-text2 border-border hover:bg-blue-bg/40',
    yellow: active ? 'bg-yellow-bg text-yellow-700 border-yellow/30': 'bg-white text-text2 border-border hover:bg-yellow-bg/40',
    green:  active ? 'bg-green-bg text-green-700 border-green/30'  : 'bg-white text-text2 border-border hover:bg-green-bg/40',
  };
  return (
    <button onClick={onClick}
            className={`px-2.5 py-1 rounded-full border text-[10.5px] font-semibold transition-all ${tones[tone]}`}>
      {children}
    </button>
  );
}

function fmtMoney(n) {
  if (!n) return 'US$ 0';
  if (n >= 1000) return `US$ ${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `US$ ${Math.round(n)}`;
}
