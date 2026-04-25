import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@korex/db';

// Hook centralizado del CRM. Tras el cambio a pipeline compartido por el
// equipo de Ventas:
//  - stages = columnas globales (admin las edita).
//  - leads = los que el RLS deja ver (owner OR setter OR admin).
export function useCrm() {
  const [pipelineId, setPipelineId] = useState(null);
  const [stages, setStages] = useState([]);
  const [leads, setLeads] = useState([]);
  const [salesTeam, setSalesTeam] = useState([]);
  const [me, setMe] = useState(null); // user id de la sesion
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async (pId) => {
    const [
      { data: stagesData, error: sErr },
      { data: leadsData, error: lErr },
      { data: membersData, error: mErr },
      { data: rolesData, error: rErr },
      { data: { user } },
    ] = await Promise.all([
      supabase.from('sales_pipeline_stages').select('*').eq('pipeline_id', pId).order('position'),
      supabase.from('sales_leads').select('*').eq('pipeline_id', pId).order('position'),
      supabase.from('team_members').select('id, name, initials, color, avatar_url, user_id').not('user_id', 'is', null),
      supabase.from('user_roles').select('user_id, role'),
      supabase.auth.getUser(),
    ]);
    if (sErr) throw sErr;
    if (lErr) throw lErr;
    if (mErr) throw mErr;
    if (rErr) throw rErr;

    const rolesByUser = {};
    (rolesData || []).forEach((r) => {
      if (!rolesByUser[r.user_id]) rolesByUser[r.user_id] = [];
      rolesByUser[r.user_id].push(r.role);
    });
    const eligible = (membersData || []).filter((m) => {
      const roles = rolesByUser[m.user_id] || [];
      return roles.includes('sales') || roles.includes('admin');
    });

    setStages(stagesData || []);
    setLeads(leadsData || []);
    setSalesTeam(eligible);
    setMe(user?.id || null);
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

  // ── Stages CRUD (solo admin via RLS) ──
  const addStage = useCallback(async (name, color = '#5B7CF5') => {
    if (!pipelineId) return;
    const position = stages.length;
    const { data, error: e } = await supabase
      .from('sales_pipeline_stages')
      .insert({ pipeline_id: pipelineId, name, color, position })
      .select().single();
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
    setStages((prev) => {
      const byId = Object.fromEntries(prev.map((s) => [s.id, s]));
      return orderedIds.map((id, idx) => ({ ...byId[id], position: idx }));
    });
    await Promise.all(orderedIds.map((id, idx) =>
      supabase.from('sales_pipeline_stages').update({ position: idx }).eq('id', id),
    ));
  }, []);

  // ── Leads CRUD ──
  const createLead = useCallback(async (payload) => {
    if (!pipelineId) return null;
    const firstStage = stages[0];
    const { data: userData } = await supabase.auth.getUser();
    const ownerId = payload.owner_id || userData?.user?.id;
    if (!ownerId) return null;
    const stageId = payload.stage_id || firstStage?.id || null;
    const position = leads.filter((l) => l.stage_id === stageId).length;
    const row = {
      pipeline_id: pipelineId,
      owner_id: ownerId,
      setter_id: payload.setter_id || null,
      stage_id: stageId,
      full_name: payload.full_name,
      company_multinivel: payload.company_multinivel || null,
      proposal: payload.proposal || null,
      phone: payload.phone || null,
      email: payload.email || null,
      notes: payload.notes || null,
      next_step: payload.next_step || null,
      score: payload.score ?? null,
      estimated_value: payload.estimated_value ?? null,
      estimated_currency: payload.estimated_currency || 'USD',
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
    if (e) {
      console.error(e);
      // Si fallo (ej. trigger ownership), recargamos para revertir el optimistic.
      await loadAll(pipelineId);
    }
  }, [loadAll, pipelineId]);

  const deleteLead = useCallback(async (id) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    const { error: e } = await supabase.from('sales_leads').delete().eq('id', id);
    if (e) console.error(e);
  }, []);

  const moveLead = useCallback(async (leadId, toStageId, toPosition) => {
    setLeads((prev) => prev.map((l) =>
      l.id === leadId ? { ...l, stage_id: toStageId, position: toPosition } : l));
    await supabase.from('sales_leads')
      .update({ stage_id: toStageId, position: toPosition })
      .eq('id', leadId);
  }, []);

  const convertLeadToClient = useCallback(async (leadId) => {
    const { data, error: e } = await supabase.rpc('convert_lead_to_client', { p_lead_id: leadId });
    if (e) throw e;
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, client_id: data } : l)));
    return data;
  }, []);

  return {
    pipelineId, stages, leads, salesTeam, me, loading, error,
    refresh: bootstrap,
    addStage, updateStage, deleteStage, reorderStages,
    createLead, updateLead, deleteLead, moveLead, convertLeadToClient,
  };
}
