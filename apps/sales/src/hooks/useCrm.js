import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@korex/db';

// Hook centralizado del CRM. Tras la unificacion de contactos:
//  - Cada lead apunta a un contact (tabla contacts).
//  - El UI sigue trabajando con campos planos (full_name, phone, email,
//    company_multinivel) — los exponemos como virtuales sobre el lead y
//    enrutamos los patches al recurso correcto.

const CONTACT_FIELDS = new Set(['full_name', 'phone', 'email', 'company_multinivel', 'first_name', 'last_name']);

function fullName(c) {
  if (!c) return '';
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
    company_multinivel: c.company || '',
    contact_categories: c.categories || [],
  };
}

export function useCrm() {
  const [pipelineId, setPipelineId] = useState(null);
  const [stages, setStages] = useState([]);
  const [leads, setLeads] = useState([]);
  const [salesTeam, setSalesTeam] = useState([]);
  const [me, setMe] = useState(null);
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
      supabase.from('sales_leads').select('*, contact:contacts(*)').eq('pipeline_id', pId).order('position'),
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
    setLeads((leadsData || []).map(flattenLead));
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

  // ── Stages CRUD ──
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
      p_default_category: 'prospect',
      p_source: 'manual',
    });
    if (rpcErr) { console.error(rpcErr); return null; }
    if (!contactId) { alert('Falta nombre, telefono o email para crear el contacto.'); return null; }

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
      if (e.code === '23505') { alert('Ya existe un lead para ese contacto en este pipeline.'); return null; }
      console.error(e); return null;
    }
    const flat = flattenLead(data);
    setLeads((prev) => [...prev, flat]);
    return flat;
  }, [pipelineId, stages, leads]);

  // Actualizar lead: separa campos del contacto vs del lead.
  const updateLead = useCallback(async (id, patch) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;

    const contactPatch = {};
    const leadPatch = {};
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'full_name') {
        const parts = (v || '').trim().split(/\s+/);
        contactPatch.first_name = parts[0] || '';
        contactPatch.last_name = parts.slice(1).join(' ');
      } else if (k === 'company_multinivel') {
        contactPatch.company = v;
      } else if (CONTACT_FIELDS.has(k)) {
        contactPatch[k] = v;
      } else {
        leadPatch[k] = v;
      }
    }

    setLeads((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const newContact = { ...(l.contact || {}), ...contactPatch };
      return flattenLead({ ...l, ...leadPatch, contact: newContact });
    }));

    const tasks = [];
    if (Object.keys(leadPatch).length > 0) {
      tasks.push(supabase.from('sales_leads').update(leadPatch).eq('id', id));
    }
    if (Object.keys(contactPatch).length > 0 && lead.contact_id) {
      tasks.push(supabase.from('contacts').update(contactPatch).eq('id', lead.contact_id));
    }
    const results = await Promise.all(tasks);
    if (results.some((r) => r.error)) {
      console.error('updateLead error', results);
      await loadAll(pipelineId);
    }
  }, [leads, loadAll, pipelineId]);

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
