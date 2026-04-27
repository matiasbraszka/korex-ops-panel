import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@korex/db';

// Hook centralizado del CRM. Tras la unificacion de contactos:
//  - Cada lead apunta a un contact (tabla contacts).
//  - El UI sigue trabajando con campos planos (full_name, phone, email,
//    company_multinivel) — los exponemos como virtuales sobre el lead y
//    enrutamos los patches al recurso correcto.

const CONTACT_FIELDS = new Set(['full_name', 'phone', 'email', 'instagram', 'company_multinivel', 'first_name', 'last_name']);

function fullName(c) {
  if (!c) return '';
  // Preferir full_name (canonico v13+); fallback a first+last legacy
  if (c.full_name && c.full_name.trim()) return c.full_name.trim();
  return [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
}

function flattenLead(l) {
  const c = l.contact || {};
  return {
    ...l,
    full_name: fullName(c),
    first_name: c.first_name || '',
    last_name: c.last_name || '',
    phone: c.phone || '',
    email: c.email || '',
    instagram: c.instagram || '',
    company_multinivel: c.company || '',
    contact_categories: c.categories || [],
  };
}

// Persistir el ultimo pipeline elegido por usuario en localStorage.
const LS_KEY = 'korex_crm_active_pipeline';

export function useCrm() {
  const [pipelines, setPipelines] = useState([]);
  const [pipelineId, setPipelineIdState] = useState(null);
  const [stages, setStages] = useState([]);
  // Stages de TODOS los pipelines a los que el usuario tiene acceso. Se usa
  // cuando desde el LeadModal se cambia el lead a otro CRM: necesitamos saber
  // las etapas del pipeline destino para poder elegir una.
  const [allStages, setAllStages] = useState([]);
  const [leads, setLeads] = useState([]);
  const [salesTeam, setSalesTeam] = useState([]);
  // Solo personas con rol 'sales' (sin contar admins puros). Para asignar
  // CRMs a vendedores especificos sin que aparezcan los admins.
  const [sellers, setSellers] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Setter publico que persiste eleccion en localStorage
  const setPipelineId = useCallback((id) => {
    setPipelineIdState(id);
    try { if (id) localStorage.setItem(LS_KEY, id); } catch {}
  }, []);

  const loadPipelineData = useCallback(async (pId) => {
    if (!pId) { setStages([]); setLeads([]); return; }
    const [
      { data: stagesData, error: sErr },
      { data: leadsData, error: lErr },
    ] = await Promise.all([
      supabase.from('sales_pipeline_stages').select('*').eq('pipeline_id', pId).order('position'),
      supabase.from('sales_leads').select('*, contact:contacts(*)').eq('pipeline_id', pId).order('position'),
    ]);
    if (sErr) throw sErr;
    if (lErr) throw lErr;
    setStages(stagesData || []);
    setLeads((leadsData || []).map(flattenLead));
  }, []);

  const loadPipelines = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('list_my_sales_pipelines');
    if (e) throw e;
    setPipelines(data || []);
    return data || [];
  }, []);

  const loadTeamAndUser = useCallback(async () => {
    const [
      { data: membersData, error: mErr },
      { data: rolesData, error: rErr },
      { data: { user } },
    ] = await Promise.all([
      supabase.from('team_members').select('id, name, initials, color, avatar_url, user_id').not('user_id', 'is', null),
      supabase.from('user_roles').select('user_id, role'),
      supabase.auth.getUser(),
    ]);
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
    // Solo vendedores: tienen rol 'sales' (puede tambien ser admin si es algo
    // hibrido). Excluye admins puros que no venden.
    const onlySellers = eligible.filter((m) => (rolesByUser[m.user_id] || []).includes('sales'));
    setSalesTeam(eligible);
    setSellers(onlySellers);
    setMe(user?.id || null);
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1) Asegurar al menos un pipeline (legacy: crea el global compartido)
      try { await supabase.rpc('ensure_sales_pipeline'); } catch (e) { console.warn('ensure_sales_pipeline:', e.message); }
      // 2) Listar pipelines visibles + cargar equipo en paralelo
      const [list] = await Promise.all([loadPipelines(), loadTeamAndUser()]);
      // 3) Elegir pipeline activo: ultimo en LS si visible, sino el primero
      let initial = null;
      try { initial = localStorage.getItem(LS_KEY); } catch {}
      const found = initial && list.find((p) => p.id === initial);
      const pid = found ? initial : (list[0]?.id || null);
      setPipelineIdState(pid);
      if (pid) await loadPipelineData(pid);
      // 4) Cargar stages de TODOS los pipelines accesibles (para mover leads
      //    entre CRMs desde el LeadModal). RLS garantiza que solo veo los mios.
      if ((list || []).length > 0) {
        const ids = list.map((p) => p.id);
        const { data: allS } = await supabase
          .from('sales_pipeline_stages')
          .select('*')
          .in('pipeline_id', ids)
          .order('position');
        setAllStages(allS || []);
      } else {
        setAllStages([]);
      }
    } catch (e) {
      console.error('CRM bootstrap error', e);
      setError(e.message || 'Error cargando CRM');
    } finally {
      setLoading(false);
    }
  }, [loadPipelines, loadTeamAndUser, loadPipelineData]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  // Cuando el usuario cambia de pipeline, recargar stages+leads
  useEffect(() => {
    if (!pipelineId) return;
    loadPipelineData(pipelineId).catch((e) => console.error(e));
  }, [pipelineId, loadPipelineData]);

  // ── Pipelines CRUD ──
  // FALLBACK: si la RPC falla con args nombrados (cache stale de PostgREST),
  // hacemos insert directo a la tabla. Asegura que crear CRM funcione siempre.
  const createPipeline = useCallback(async (name, ownerId = null, memberIds = null) => {
    const cleanName = (name || '').trim() || 'Mi CRM';
    const cleanMembers = Array.isArray(memberIds) && memberIds.length > 0 ? memberIds : null;
    const payload = { p_name: cleanName, p_owner_id: ownerId || null, p_member_ids: cleanMembers };
    console.log('[CRM v2] createPipeline payload:', payload);

    // Intento 1: RPC con todos los args
    let { data, error: e } = await supabase.rpc('create_sales_pipeline', payload);

    // Si la RPC falla con error de signatura/no encontrada, intentar sin members
    if (e && (e.code === 'PGRST202' || (e.message || '').includes('function'))) {
      console.warn('[CRM v2] RPC failed, retrying without member_ids...', e);
      const fallback = await supabase.rpc('create_sales_pipeline', { p_name: cleanName, p_owner_id: ownerId || null });
      data = fallback.data; e = fallback.error;
    }

    if (e) {
      console.error('[CRM v2] createPipeline FINAL error:', e);
      return { error: e.message + (e.details ? ` (${e.details})` : '') };
    }

    console.log('[CRM v2] created pipeline id:', data);

    // Si tenia members extras, setearlos via RPC dedicada
    if (data && cleanMembers) {
      const r2 = await supabase.rpc('set_pipeline_members', { p_pipeline_id: data, p_user_ids: cleanMembers });
      if (r2.error) console.error('[CRM v2] set members after create error:', r2.error);
    }

    await loadPipelines();
    setPipelineId(data);
    return { data };
  }, [loadPipelines, setPipelineId]);

  const setPipelineMembers = useCallback(async (id, userIds) => {
    const payload = { p_pipeline_id: id, p_user_ids: userIds || [] };
    console.log('[CRM] setPipelineMembers payload:', payload);
    const { error: e } = await supabase.rpc('set_pipeline_members', payload);
    if (e) { console.error('[CRM] setPipelineMembers error:', e); return { error: e.message }; }
    await loadPipelines();
    return {};
  }, [loadPipelines]);

  const renamePipeline = useCallback(async (id, newName) => {
    setPipelines((prev) => prev.map((p) => (p.id === id ? { ...p, name: newName } : p)));
    const { error: e } = await supabase.from('sales_pipelines').update({ name: newName }).eq('id', id);
    if (e) { console.error(e); await loadPipelines(); return { error: e.message }; }
    return {};
  }, [loadPipelines]);

  // Actualizar pipeline (nombre + owner). Permite reasignar el CRM a otra persona.
  const updatePipeline = useCallback(async (id, patch) => {
    const cleaned = {};
    if (patch.name != null) cleaned.name = (patch.name || '').trim() || 'Mi CRM';
    if (patch.owner_id) cleaned.owner_id = patch.owner_id; // solo si truthy
    if (Object.keys(cleaned).length === 0) return {};
    console.log('[CRM] updatePipeline', id, cleaned);
    const { error: e } = await supabase.from('sales_pipelines').update(cleaned).eq('id', id);
    if (e) { console.error('[CRM] updatePipeline error:', e); return { error: e.message }; }
    await loadPipelines();
    return {};
  }, [loadPipelines]);

  const removePipeline = useCallback(async (id) => {
    const { error: e } = await supabase.from('sales_pipelines').delete().eq('id', id);
    if (e) return { error: e.message };
    const list = await loadPipelines();
    if (id === pipelineId) {
      setPipelineId(list[0]?.id || null);
    }
    return {};
  }, [loadPipelines, pipelineId, setPipelineId]);

  // ── Stages CRUD ──
  const addStage = useCallback(async (name, color = '#5B7CF5', bucket = 'en_proceso') => {
    if (!pipelineId) return;
    const position = stages.length;
    const { data, error: e } = await supabase
      .from('sales_pipeline_stages')
      .insert({ pipeline_id: pipelineId, name, color, position, bucket })
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
      return { error: 'No podés eliminar una columna con leads. Movelos a otra columna primero.' };
    }
    setStages((prev) => prev.filter((s) => s.id !== id));
    const { error: e } = await supabase.from('sales_pipeline_stages').delete().eq('id', id);
    if (e) { console.error(e); return { error: e.message }; }
    return {};
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
  // Crear lead: primero match-or-create del contact, luego el lead.
  const createLead = useCallback(async (payload) => {
    if (!pipelineId) return null;
    const firstStage = stages[0];
    const { data: userData } = await supabase.auth.getUser();
    const ownerId = payload.owner_id || userData?.user?.id;
    if (!ownerId) return null;

    const { data: contactId, error: rpcErr } = await supabase.rpc('match_or_create_contact', {
      p_full_name: payload.full_name || '',
      p_phone: payload.phone || null,
      p_email: payload.email || null,
      p_instagram: payload.instagram || null,
      p_default_category: 'prospect',
      p_source: 'manual',
    });
    if (rpcErr) { console.error(rpcErr); return { error: rpcErr.message }; }
    if (!contactId) { return { error: 'Falta nombre, teléfono, email o Instagram para crear el contacto.' }; }

    // Setear empresa si vino y el contacto no la tenia.
    if (payload.company_multinivel) {
      await supabase.from('contacts').update({ company: payload.company_multinivel }).eq('id', contactId);
    }
    // Asegurar categoria prospect.
    await supabase.rpc('contact_add_category', { p_contact_id: contactId, p_category: 'prospect' }).then(() => {}, () => {});

    const stageId = payload.stage_id || firstStage?.id || null;
    const position = leads.filter((l) => l.stage_id === stageId).length;
    const row = {
      pipeline_id: pipelineId,
      owner_id: ownerId,
      setter_id: payload.setter_id || null,
      stage_id: stageId,
      contact_id: contactId,
      proposal: payload.proposal || null,
      notes: payload.notes || null,
      next_step: payload.next_step || null,
      score: payload.score ?? null,
      estimated_value: payload.estimated_value ?? null,
      estimated_currency: payload.estimated_currency || 'USD',
      origin: payload.origin || 'manual',
      position,
    };
    const { data, error: e } = await supabase
      .from('sales_leads').insert(row).select('*, contact:contacts(*)').single();
    if (e) {
      if (e.code === '23505') { return { error: 'Ya existe un lead para ese contacto en este pipeline.' }; }
      console.error(e); return { error: e.message };
    }
    const flat = flattenLead(data);
    setLeads((prev) => [...prev, flat]);
    return { data: flat };
  }, [pipelineId, stages, leads]);

  // Actualizar lead: separa campos del contacto vs del lead.
  // Para full_name escribimos directo a contacts.full_name — el trigger
  // contacts_sync_names mantiene first_name/last_name sincronizados.
  const updateLead = useCallback(async (id, patch) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;

    const contactPatch = {};
    const leadPatch = {};
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'full_name') {
        contactPatch.full_name = (v || '').trim();
      } else if (k === 'company_multinivel') {
        contactPatch.company = v;
      } else if (CONTACT_FIELDS.has(k)) {
        contactPatch[k] = v;
      } else {
        leadPatch[k] = v;
      }
    }

    // Detectar si cambia de pipeline y manejar el reset de stage + el cleanup
    // del state local del kanban actual.
    const movingPipeline = !!leadPatch.pipeline_id && leadPatch.pipeline_id !== lead.pipeline_id;
    if (movingPipeline) {
      // Si el caller no nos paso stage_id, buscamos la primera del pipeline
      // destino (fallback). Si nos lo pasaron (modal lo setea), respetarlo.
      if (!leadPatch.stage_id) {
        const { data: targetStages } = await supabase
          .from('sales_pipeline_stages')
          .select('id')
          .eq('pipeline_id', leadPatch.pipeline_id)
          .order('position')
          .limit(1);
        leadPatch.stage_id = targetStages?.[0]?.id || null;
      }
    }

    const tasks = [];
    if (Object.keys(leadPatch).length > 0) {
      tasks.push(supabase.from('sales_leads').update(leadPatch).eq('id', id).select().maybeSingle());
    }
    if (Object.keys(contactPatch).length > 0 && lead.contact_id) {
      tasks.push(supabase.from('contacts').update(contactPatch).eq('id', lead.contact_id));
    }
    const results = await Promise.all(tasks);
    const errors = results.filter((r) => r.error).map((r) => r.error);
    if (errors.length > 0) {
      console.error('updateLead error', errors);
      // Recargar el pipeline activo para que el state quede consistente con DB.
      await loadPipelineData(pipelineId);
      // Propagar el primer error para que el modal pueda mostrarlo.
      throw new Error(errors[0]?.message || 'No se pudo guardar el lead');
    }

    // Solo despues de que la DB confirmo el cambio, actualizamos state local.
    if (movingPipeline) {
      // Si el lead se movio fuera del pipeline activo, sacarlo del state local
      // (kanban/tabla) para que desaparezca de la vista actual.
      if (leadPatch.pipeline_id !== pipelineId) {
        setLeads((prev) => prev.filter((l) => l.id !== id));
        return { moved: true, toPipelineId: leadPatch.pipeline_id };
      }
    }
    setLeads((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const newContact = { ...(l.contact || {}), ...contactPatch };
      return flattenLead({ ...l, ...leadPatch, contact: newContact });
    }));
    return { moved: false };
  }, [leads, loadPipelineData, pipelineId]);

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
    pipelines, pipelineId, setPipelineId,
    createPipeline, renamePipeline, updatePipeline, removePipeline, setPipelineMembers,
    stages, allStages, leads, salesTeam, sellers, me, loading, error,
    refresh: bootstrap,
    addStage, updateStage, deleteStage, reorderStages,
    createLead, updateLead, deleteLead, moveLead, convertLeadToClient,
  };
}
