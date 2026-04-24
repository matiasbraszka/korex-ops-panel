import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@korex/db';

// Hook centralizado para el CRM: pipeline activo + stages + leads del usuario.
// Maneja bootstrap (crea pipeline default si no existe) y expone CRUDs con
// actualizacion optimista para el Kanban.
export function useCrm() {
  const [pipelineId, setPipelineId] = useState(null);
  const [stages, setStages] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async (pId) => {
    const [{ data: stagesData, error: sErr }, { data: leadsData, error: lErr }] = await Promise.all([
      supabase.from('sales_pipeline_stages').select('*').eq('pipeline_id', pId).order('position'),
      supabase.from('sales_leads').select('*').eq('pipeline_id', pId).order('position'),
    ]);
    if (sErr) throw sErr;
    if (lErr) throw lErr;
    setStages(stagesData || []);
    setLeads(leadsData || []);
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: pId, error: rpcErr } = await supabase.rpc('ensure_sales_pipeline');
      if (rpcErr) throw rpcErr;
      setPipelineId(pId);
      await loadAll(pId);
    } catch (e) {
      console.error('CRM bootstrap error', e);
      setError(e.message || 'Error cargando CRM');
    } finally {
      setLoading(false);
    }
  }, [loadAll]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  // ── Stages CRUD ──
  const addStage = useCallback(async (name, color = '#5B7CF5') => {
    if (!pipelineId) return;
    const position = stages.length;
    const { data, error: e } = await supabase
      .from('sales_pipeline_stages')
      .insert({ pipeline_id: pipelineId, name, color, position })
      .select()
      .single();
    if (e) { console.error(e); return; }
    setStages((prev) => [...prev, data]);
  }, [pipelineId, stages.length]);

  const updateStage = useCallback(async (id, patch) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const { error: e } = await supabase.from('sales_pipeline_stages').update(patch).eq('id', id);
    if (e) console.error(e);
  }, []);

  const deleteStage = useCallback(async (id) => {
    if (leads.some((l) => l.stage_id === id)) {
      alert('No podés eliminar una columna con leads. Movelos a otra columna primero.');
      return;
    }
    setStages((prev) => prev.filter((s) => s.id !== id));
    const { error: e } = await supabase.from('sales_pipeline_stages').delete().eq('id', id);
    if (e) console.error(e);
  }, [leads]);

  const reorderStages = useCallback(async (orderedIds) => {
    // Actualiza posicion localmente y persiste.
    setStages((prev) => {
      const byId = Object.fromEntries(prev.map((s) => [s.id, s]));
      return orderedIds.map((id, idx) => ({ ...byId[id], position: idx }));
    });
    await Promise.all(
      orderedIds.map((id, idx) =>
        supabase.from('sales_pipeline_stages').update({ position: idx }).eq('id', id)
      )
    );
  }, []);

  // ── Leads CRUD ──
  const createLead = useCallback(async (payload) => {
    if (!pipelineId) return null;
    const firstStage = stages[0];
    const { data: userData } = await supabase.auth.getUser();
    const ownerId = userData?.user?.id;
    if (!ownerId) return null;
    const position = leads.filter((l) => l.stage_id === (payload.stage_id || firstStage?.id)).length;
    const row = {
      pipeline_id: pipelineId,
      owner_id: ownerId,
      stage_id: payload.stage_id || firstStage?.id || null,
      full_name: payload.full_name,
      company_multinivel: payload.company_multinivel || null,
      proposal: payload.proposal || null,
      phone: payload.phone || null,
      email: payload.email || null,
      notes: payload.notes || null,
      origin: payload.origin || 'manual',
      position,
    };
    const { data, error: e } = await supabase.from('sales_leads').insert(row).select().single();
    if (e) { console.error(e); return null; }
    setLeads((prev) => [...prev, data]);
    return data;
  }, [pipelineId, stages, leads]);

  const updateLead = useCallback(async (id, patch) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const { error: e } = await supabase.from('sales_leads').update(patch).eq('id', id);
    if (e) console.error(e);
  }, []);

  const deleteLead = useCallback(async (id) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    const { error: e } = await supabase.from('sales_leads').delete().eq('id', id);
    if (e) console.error(e);
  }, []);

  const moveLead = useCallback(async (leadId, toStageId, toPosition) => {
    // Actualiza local primero (optimistic), luego persiste.
    setLeads((prev) => {
      const next = prev.map((l) =>
        l.id === leadId ? { ...l, stage_id: toStageId, position: toPosition } : l
      );
      return next;
    });
    await supabase.from('sales_leads')
      .update({ stage_id: toStageId, position: toPosition })
      .eq('id', leadId);
  }, []);

  return {
    pipelineId,
    stages,
    leads,
    loading,
    error,
    refresh: bootstrap,
    addStage,
    updateStage,
    deleteStage,
    reorderStages,
    createLead,
    updateLead,
    deleteLead,
    moveLead,
  };
}
