import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { sbFetch, supabase } from '@korex/db';
import { useCurrentUser, signOut } from '@korex/auth';
import { CLIENT_ADS_DATA, PRIO_CLIENT } from '../utils/constants';
import { mkClient, mkTask, createDefaultTasks, today, isTimerRunning, daysBetween, migrateClientToRoadmap, hasRoadmapTasks, recomputeStartedDates, isTaskEnabled, ensureBulletIds } from '../utils/helpers';

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }) {
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  // view se deriva de la URL. Pathname esperado: /operations/<view>.
  // setView navega dentro del modulo Operaciones manteniendo el prefix.
  const location = useLocation();
  const navigate = useNavigate();
  const view = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    // /operations/<view> -> segmento [1]; fallback a 'clients'.
    return segments[1] || 'clients';
  }, [location.pathname]);
  const setView = useCallback((v) => {
    navigate('/operations/' + v);
  }, [navigate]);
  const [selectedId, setSelectedId] = useState(null);
  const [phase, setPhase] = useState('all');
  const [filter, setFilter] = useState('all');
  const [taskFilter, setTaskFilter] = useState('all');
  const [taskAssignee, setTaskAssignee] = useState('all');
  const [taskClientFilter, setTaskClientFilter] = useState('all');
  const [taskPriority, setTaskPriority] = useState('all');
  const [taskDueFilter, setTaskDueFilter] = useState('all'); // all | this-week | next-week | this-month
  // currentUser deriva de Supabase Auth + team_members (ver derivacion mas abajo).
  const { user: authUser, profile, isAdmin } = useCurrentUser();
  const currentUser = useMemo(() => {
    if (!profile) return null;
    return {
      id: profile.id,
      name: profile.name,
      role: profile.role,
      color: profile.color || '#5B7CF5',
      initials: profile.initials || (profile.name?.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase() || ''),
      avatar: profile.avatar_url || '',
      canAccessSettings: isAdmin || !!profile.can_access_settings,
      authId: authUser?.id || null,
      isAdmin,
    };
  }, [profile, isAdmin, authUser]);
  const [briefing, setBriefing] = useState(null);
  const [reportFeedbacks, setReportFeedbacks] = useState([]);
  const [taskProposals, setTaskProposals] = useState([]);
  const [dashboardAlerts, setDashboardAlerts] = useState([]);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [hideCompletedTasks, setHideCompletedTasks] = useState(true);
  const [hideBlockedTasks, setHideBlockedTasks] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [syncStatus, setSyncStatus] = useState('ok');
  // Settings panel state (cargado desde Supabase)
  const [appSettings, setAppSettings] = useState(null); // { roadmap_template, services, priority_labels }
  const [teamMembers, setTeamMembers] = useState([]); // [{ id, name, role, ... }]
  // Weekly to-do list (personal por usuario)
  const [weeklyTodos, setWeeklyTodos] = useState([]); // [{ id, userId, taskId, date, position }]
  // Loom videos (tutoriales y actualizaciones)
  const [loomVideos, setLoomVideos] = useState([]);
  // Llamadas procesadas (desde Fathom via /procesa-llamadas)
  const [llamadas, setLlamadas] = useState([]);
  // Llamadas pendientes de procesar (inbox)
  const [pendingCallsCount, setPendingCallsCount] = useState(0);
  // Informes diarios/semanales del equipo (v13)
  const [teamReports, setTeamReports] = useState([]);
  const [teamBlockers, setTeamBlockers] = useState([]);
  // Cajón de ideas (v13)
  const [ideas, setIdeas] = useState([]);
  // Notas del equipo (v15) — apuntes ricos compartibles con personas selectivas
  const [notas, setNotas] = useState([]);
  // Comentarios sobre tareas (v16) — hilos de 1 nivel (parent_id)
  const [taskComments, setTaskComments] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [strategyPages, setStrategyPages] = useState([]);
  const [invoices, setInvoices] = useState([]);
  // Panel lateral de actividad/comentarios: target abierto o null.
  // Forma: null | { kind: 'task', taskId } | { kind: 'bullet', reportId, bulletId }
  const [commentsTarget, setCommentsTarget] = useState(null);
  // Comentarios por bullet de informe (mirror del patron de task_comments)
  const [bulletComments, setBulletComments] = useState([]);

  const dbReady = useRef(false);
  const saveTimer = useRef(null);
  const lastPoll = useRef(0);
  const clientsRef = useRef(clients);
  const tasksRef = useRef(tasks);
  clientsRef.current = clients;
  tasksRef.current = tasks;
  // Id del usuario actual en un ref para usarlo dentro de callbacks memoizados
  // (dbSaveTask, dbSyncAll) sin recrearlos. Lo usan los triggers de la DB para
  // excluir auto-notificaciones (no notificarte por tu propia edición).
  const currentUserIdRef = useRef(null);
  currentUserIdRef.current = currentUser?.id || null;

  // ── Notificaciones (buzón) ──
  const [notifications, setNotifications] = useState([]);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  // Última notificación entrante para el toast flotante. La UI la limpia al cerrarse.
  const [notifToast, setNotifToast] = useState(null);

  // ── Inject Meta Metrics from CLIENT_ADS_DATA ──
  const injectMetaMetrics = useCallback((clientList) => {
    return clientList.map(c => {
      const data = CLIENT_ADS_DATA[c.name] || Object.entries(CLIENT_ADS_DATA).find(([k]) => c.name.startsWith(k))?.[1];
      if (!data) return c;
      const updated = { ...c };
      if (!updated.metaAds || !updated.metaAds.length) updated.metaAds = data.metaAds;
      if (!updated.metaMetrics) updated.metaMetrics = data.metaMetrics;
      return updated;
    });
  }, []);

  // ── DB Save Functions ──
  const dbSaveClient = useCallback(async (c) => {
    return sbFetch('clients', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify({
        id: c.id, name: c.name, company: c.company, service: c.service,
        start_date: c.startDate, pm: c.pm, color: c.color, status: c.status,
        priority: c.priority, bottleneck: c.bottleneck, notes: c.notes,
        steps: c.steps, feedback: c.feedback, history: c.history,
        phone: c.phone || '',
        avatar_url: c.avatarUrl || '',
        slack_channel: c.slackChannel || '', slack_channel_id: c.slackChannelId || '',
        meta_ads: c.metaAds || [], custom_steps: c.customSteps || [],
        custom_phases: c.customPhases || [], client_feedbacks: c.clientFeedbacks || [],
        step_name_overrides: c.stepNameOverrides || {}, phase_name_overrides: c.phaseNameOverrides || {},
        phase_deadlines: c.phaseDeadlines || {},
        links: c.links || [],
        pending_resources: c.pendingResources || [],
        meta_metrics: c.metaMetrics || null,
        billing_amount: c.billingAmount ?? null,
        billing_currency: c.billingCurrency || 'EUR',
        billing_cycle: c.billingCycle || 'mensual',
        billing_installments: c.billingInstallments ?? 1,
        next_charge_date: c.nextChargeDate || null,
        payment_method: c.paymentMethod || null,
        billing_status: c.billingStatus || 'al_dia',
        visual_resources: Array.isArray(c.visualResources) ? c.visualResources : [],
        niche: c.niche || null,
        email: c.email || null,
        country: c.country || null,
        timezone: c.timezone || null,
        contract_url: c.contractUrl || null,
        contract_signed_date: c.contractSignedDate || null,
        contract_renewal_date: c.contractRenewalDate || null,
        tier: c.tier || null,
        conector: c.conector || null,
        closer: c.closer || null,
        contract_data: c.contractData || null,
      })
    });
  }, []);

  const dbSaveTask = useCallback(async (t) => {
    return sbFetch('tasks', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify({
        id: t.id, title: t.title, client_id: t.clientId, assignee: t.assignee,
        priority: t.priority, status: t.status, notes: t.notes,
        description: t.description || '', step_idx: t.stepIdx, created_date: t.createdDate,
        started_date: t.startedDate || null, completed_date: t.completedDate || null, blocked_since: t.blockedSince || null,
        phase: t.phase || null, depends_on: t.dependsOn || null, is_roadmap_task: t.isRoadmapTask || false,
        template_id: t.templateId || null, estimated_days: t.estimatedDays || null, is_client_task: t.isClientTask || false,
        days_from_unblock: t.daysFromUnblock != null ? t.daysFromUnblock : null,
        due_date: t.dueDate || null,
        accumulated_days: t.accumulatedDays || 0,
        timer_started_at: t.timerStartedAt || null,
        enabled_date: t.enabledDate || null,
        position: t.position ?? 0,
        last_actor_id: currentUserIdRef.current,
      })
    });
  }, []);

  const dbDeleteTask = useCallback(async (taskId) => {
    if (!dbReady.current) return;
    return sbFetch('tasks?id=eq.' + taskId, { method: 'DELETE' });
  }, []);

  const dbSyncAll = useCallback(async (clientList, taskList) => {
    if (!dbReady.current) return;
    try {
      const clientRows = clientList.map(c => ({
        id: c.id, name: c.name, company: c.company, service: c.service,
        start_date: c.startDate, pm: c.pm, color: c.color, status: c.status,
        priority: c.priority, bottleneck: c.bottleneck, notes: c.notes,
        steps: c.steps, feedback: c.feedback, history: c.history,
        phone: c.phone || '',
        avatar_url: c.avatarUrl || '',
        slack_channel: c.slackChannel || '', slack_channel_id: c.slackChannelId || '',
        meta_ads: c.metaAds || [], custom_steps: c.customSteps || [],
        custom_phases: c.customPhases || [], client_feedbacks: c.clientFeedbacks || [],
        step_name_overrides: c.stepNameOverrides || {}, phase_name_overrides: c.phaseNameOverrides || {},
        phase_deadlines: c.phaseDeadlines || {},
        links: c.links || [],
        pending_resources: c.pendingResources || [],
        meta_metrics: c.metaMetrics || null,
        billing_amount: c.billingAmount ?? null,
        billing_currency: c.billingCurrency || 'EUR',
        billing_cycle: c.billingCycle || 'mensual',
        billing_installments: c.billingInstallments ?? 1,
        next_charge_date: c.nextChargeDate || null,
        payment_method: c.paymentMethod || null,
        billing_status: c.billingStatus || 'al_dia',
        visual_resources: Array.isArray(c.visualResources) ? c.visualResources : [],
        niche: c.niche || null,
        email: c.email || null,
        country: c.country || null,
        timezone: c.timezone || null,
        contract_url: c.contractUrl || null,
        contract_signed_date: c.contractSignedDate || null,
        contract_renewal_date: c.contractRenewalDate || null,
        tier: c.tier || null,
        conector: c.conector || null,
        closer: c.closer || null,
        contract_data: c.contractData || null,
      }));
      for (let i = 0; i < clientRows.length; i += 10) {
        const batch = clientRows.slice(i, i + 10);
        await sbFetch('clients', { method: 'POST', headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify(batch) });
      }
      const taskRows = taskList.map(t => ({
        id: t.id, title: t.title, client_id: t.clientId, assignee: t.assignee,
        priority: t.priority, status: t.status, notes: t.notes,
        description: t.description || '', step_idx: t.stepIdx, created_date: t.createdDate,
        started_date: t.startedDate || null, completed_date: t.completedDate || null, blocked_since: t.blockedSince || null,
        phase: t.phase || null, depends_on: t.dependsOn || null, is_roadmap_task: t.isRoadmapTask || false,
        template_id: t.templateId || null, estimated_days: t.estimatedDays || null, is_client_task: t.isClientTask || false,
        days_from_unblock: t.daysFromUnblock != null ? t.daysFromUnblock : null,
        due_date: t.dueDate || null,
        accumulated_days: t.accumulatedDays || 0,
        timer_started_at: t.timerStartedAt || null,
        enabled_date: t.enabledDate || null,
        position: t.position ?? 0,
        last_actor_id: currentUserIdRef.current,
      }));
      for (let i = 0; i < taskRows.length; i += 20) {
        const batch = taskRows.slice(i, i + 20);
        await sbFetch('tasks', { method: 'POST', headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify(batch) });
      }
      console.log('\u2713 Full sync to Supabase done');
    } catch (e) {
      console.warn('Full sync error:', e);
    }
  }, []);

  // ── Save (localStorage + debounced Supabase) ──
  const save = useCallback((newClients, newTasks) => {
    const c = newClients || clientsRef.current;
    const t = newTasks || tasksRef.current;
    localStorage.setItem('korex_v6', JSON.stringify({ clients: c, tasks: t }));
    if (dbReady.current) {
      setSyncStatus('syncing');
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          const promises = [];
          for (const client of c) promises.push(dbSaveClient(client));
          for (const task of t) promises.push(dbSaveTask(task));
          await Promise.all(promises);
          console.log('\u2713 Synced to Supabase');
          setSyncStatus('ok');
        } catch (e) {
          console.warn('DB sync error:', e);
          setSyncStatus('error');
        }
      }, 1500);
    }
  }, [dbSaveClient, dbSaveTask]);

  // ── CRUD: Clients ──
  const createClient = useCallback((name, company, service, start, pm, extraFields = {}) => {
    // Inyectamos la plantilla configurada de "recursos pendientes" desde
    // app_settings — asi el cliente nuevo arranca con el checklist listo.
    const c = mkClient(name, company, service, start, pm, clientsRef.current.length, {
      ...extraFields,
      pendingResourcesTemplate: appSettings?.pending_resources_template,
    });
    const newClients = [...clientsRef.current, c];
    const injected = injectMetaMetrics(newClients);
    setClients(injected);
    // Create default roadmap tasks for the new client (template viene de app_settings)
    const tplFromSettings = appSettings?.roadmap_template;
    const defaultTasks = createDefaultTasks(c.id, tplFromSettings);
    // Sembrar deadlines de fases si el template tiene daysFromUnblock por fase
    const phaseList = tplFromSettings?.phases || [];
    if (phaseList.some(p => p.daysFromUnblock != null && p.daysFromUnblock >= 0)) {
      const seededDeadlines = { ...(c.phaseDeadlines || {}) };
      // Calculo el deadline de fase = today + dias (solo para fases que tienen dias)
      // Lo dejo asi simple; despues recomputeStartedDates puede afinar por fase si hace falta.
      phaseList.forEach(p => {
        if (p.daysFromUnblock != null && p.daysFromUnblock >= 0 && !seededDeadlines[p.id]) {
          const dt = new Date();
          dt.setDate(dt.getDate() + Number(p.daysFromUnblock));
          const pad = (x) => String(x).padStart(2, '0');
          seededDeadlines[p.id] = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
        }
      });
      c.phaseDeadlines = seededDeadlines;
    }
    let newTasks = [...tasksRef.current, ...defaultTasks];
    const result = recalculateTimers(c.id, newTasks);
    newTasks = result.tasks;
    // Aplicar regla de startedDate a las tareas nuevas (las sin deps arrancan hoy)
    newTasks = recomputeStartedDates(newTasks);
    setTasks(newTasks);
    save(injected, newTasks);
    if (dbReady.current) {
      dbSaveClient(c);
      // Guardar las tareas ya con startedDate calculada
      const ids = new Set(defaultTasks.map(t => t.id));
      newTasks.filter(t => ids.has(t.id)).forEach(t => dbSaveTask(t));
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, dbSaveClient, dbSaveTask, injectMetaMetrics, appSettings]);

  const updateClient = useCallback((id, updates) => {
    setClients(prev => {
      const newClients = prev.map(c => c.id === id ? { ...c, ...updates } : c);
      save(newClients, tasksRef.current);
      const updated = newClients.find(c => c.id === id);
      if (updated && dbReady.current) dbSaveClient(updated);
      return newClients;
    });
  }, [save, dbSaveClient]);

  // Borra un cliente y TODAS sus tareas (incluido fases custom y deadlines).
  // Operacion irreversible. Persiste en Supabase y limpia el state local.
  const deleteClient = useCallback(async (id) => {
    const clientTasks = tasksRef.current.filter(t => t.clientId === id);
    // 1) Borrar tareas en DB (en paralelo)
    if (dbReady.current) {
      await Promise.all([
        ...clientTasks.map(t => sbFetch('tasks?id=eq.' + encodeURIComponent(t.id), { method: 'DELETE' })),
        sbFetch('clients?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }),
      ]).catch(e => console.warn('deleteClient error', e));
    }
    // 2) Limpiar state local
    const newClients = clientsRef.current.filter(c => c.id !== id);
    const newTasks = tasksRef.current.filter(t => t.clientId !== id);
    setClients(newClients);
    setTasks(newTasks);
    save(newClients, newTasks);
  }, [save]);

  // ── Timer recalculation (must be before CRUD) ──
  const recalculateTimers = useCallback((clientId, taskList) => {
    const clientTasks = taskList.filter(t => t.clientId === clientId);
    const updated = taskList.map(t => {
      if (t.clientId !== clientId) return t;
      const shouldRun = isTimerRunning(t, clientTasks);
      const isRunning = !!t.timerStartedAt;

      if (shouldRun && !isRunning) {
        const u = { ...t, timerStartedAt: today(), enabledDate: t.enabledDate || today() };
        if (dbReady.current) dbSaveTask(u);
        return u;
      } else if (!shouldRun && isRunning) {
        const elapsed = daysBetween(t.timerStartedAt, today()) || 0;
        const u = { ...t, accumulatedDays: (t.accumulatedDays || 0) + elapsed, timerStartedAt: null };
        if (dbReady.current) dbSaveTask(u);
        return u;
      }
      return t;
    });
    return { tasks: updated };
  }, [dbSaveTask]);

  // ── CRUD: Tasks ──
  const createTask = useCallback((title, clientId, assignee, priority, status, notes, stepIdx) => {
    const t = mkTask(title, clientId, assignee, priority, status, notes, stepIdx);
    // Assign position: max of sibling tasks + 1
    const siblings = tasksRef.current.filter(x => x.clientId === clientId);
    t.position = siblings.length > 0 ? Math.max(...siblings.map(x => x.position ?? 0)) + 1 : 0;
    let newTasks = [...tasksRef.current, t];
    const result = recalculateTimers(clientId, newTasks);
    newTasks = result.tasks;
    // Aplicar regla de startedDate: si la tarea queda habilitada, se setea hoy
    const beforeRecompute = newTasks;
    newTasks = recomputeStartedDates(newTasks);
    if (dbReady.current) {
      newTasks.forEach((x, i) => { if (x !== beforeRecompute[i]) dbSaveTask(x); });
    }
    setTasks(newTasks);
    save(clientsRef.current, newTasks);
    const saved = newTasks.find(x => x.id === t.id) || t;
    if (dbReady.current) dbSaveTask(saved);
    return saved;
  }, [save, dbSaveTask, recalculateTimers]);

  const updateTask = useCallback((id, updates) => {
    // Limpio flags privados (_skip*) antes de mergear para no inflar el objeto en memoria
    const { _skipTimerRecalc, _skipRecomputeStarted, ...cleanUpdates } = updates;
    setTasks(prev => {
      const mappedTasks = prev.map(t => {
        if (t.id !== id) return t;
        const merged = { ...t, ...cleanUpdates };
        // completedDate automático al pasar a done. startedDate lo gestiona recomputeStartedDates.
        if (cleanUpdates.status && cleanUpdates.status !== t.status && cleanUpdates.status === 'done') {
          merged.completedDate = today();
        }
        return merged;
      });

      // Recalculate timers unless flagged to skip
      let finalTasks = mappedTasks;
      if (!_skipTimerRecalc) {
        const task = mappedTasks.find(t => t.id === id);
        if (task) {
          const result = recalculateTimers(task.clientId, mappedTasks);
          finalTasks = result.tasks;
        }
      }

      // Recomputar startedDate según reglas del sistema (enabled/blocked/deps).
      // _skipRecomputeStarted lo usa el drag manual del timeline para que el
      // sistema no pise las fechas que el usuario movio a mano.
      if (!_skipRecomputeStarted) {
        const beforeRecompute = finalTasks;
        finalTasks = recomputeStartedDates(finalTasks);
        if (dbReady.current) {
          finalTasks.forEach((t, i) => {
            if (t !== beforeRecompute[i]) dbSaveTask(t);
          });
        }
      }

      save(clientsRef.current, finalTasks);
      const updated = finalTasks.find(t => t.id === id);
      if (updated && dbReady.current) dbSaveTask(updated);
      return finalTasks;
    });
  }, [save, dbSaveTask, recalculateTimers]);

  const deleteTask = useCallback((id) => {
    setTasks(prev => {
      const deleted = prev.find(t => t.id === id);
      let newTasks = prev.filter(t => t.id !== id);
      if (deleted) {
        const result = recalculateTimers(deleted.clientId, newTasks);
        newTasks = result.tasks;
      }
      // Recomputar startedDate: borrar una tarea puede desbloquear dependientes
      const beforeRecompute = newTasks;
      newTasks = recomputeStartedDates(newTasks);
      if (dbReady.current) {
        newTasks.forEach((t, i) => { if (t !== beforeRecompute[i]) dbSaveTask(t); });
      }
      save(clientsRef.current, newTasks);
      dbDeleteTask(id);
      return newTasks;
    });
  }, [save, dbSaveTask, dbDeleteTask, recalculateTimers]);

  // ── Reorder tasks (drag & drop) ──
  // reorderedGroup: the full group array in its new order
  const reorderTask = useCallback((reorderedGroup) => {
    if (!reorderedGroup || reorderedGroup.length === 0) return;
    setTasks(prev => {
      const newTasks = [...prev];
      reorderedGroup.forEach((t, i) => {
        const idx = newTasks.findIndex(x => x.id === t.id);
        if (idx >= 0) newTasks[idx] = { ...newTasks[idx], position: i };
      });
      save(clientsRef.current, newTasks);
      if (dbReady.current) {
        reorderedGroup.forEach((t, i) => {
          const updated = newTasks.find(x => x.id === t.id);
          if (updated) dbSaveTask(updated);
        });
      }
      return newTasks;
    });
  }, [save, dbSaveTask]);

  // ── Auth ──
  // doLogin vive ahora en @korex/auth (Supabase Auth).
  // AppContext solo expone doLogout para que el sidebar siga funcionando igual.
  const doLogout = useCallback(async () => {
    await signOut();
    localStorage.removeItem('korex_user'); // cleanup legacy
  }, []);

  // ── CRUD: app_settings (template, services, priority_labels) ──
  const updateAppSettings = useCallback(async (partial) => {
    setAppSettings(prev => {
      const merged = { ...(prev || {}), ...partial };
      // Persistir en background
      sbFetch('app_settings?key=eq.global', {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ value: merged, updated_at: new Date().toISOString() })
      }).catch(e => console.warn('updateAppSettings error', e));
      return merged;
    });
  }, []);

  // ── CRUD: team_members ──
  const addTeamMember = useCallback(async (member) => {
    // member: { id, name, role, color, initials, avatar_url, password, can_access_settings, position }
    const row = {
      id: member.id,
      name: member.name,
      role: member.role || '',
      color: member.color || '#5B7CF5',
      initials: member.initials || '',
      avatar_url: member.avatar_url || member.avatarUrl || null,
      password: member.password || 'korex2026',
      can_access_settings: !!member.can_access_settings,
      position: member.position ?? 999,
    };
    await sbFetch('team_members', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(row)
    });
    setTeamMembers(prev => [...prev, row]);
  }, []);

  const updateTeamMember = useCallback(async (id, fields) => {
    // Mapear camelCase → snake_case
    const dbFields = {};
    if (fields.name !== undefined) dbFields.name = fields.name;
    if (fields.role !== undefined) dbFields.role = fields.role;
    if (fields.color !== undefined) dbFields.color = fields.color;
    if (fields.initials !== undefined) dbFields.initials = fields.initials;
    if (fields.avatar_url !== undefined || fields.avatarUrl !== undefined) dbFields.avatar_url = fields.avatar_url ?? fields.avatarUrl;
    if (fields.password !== undefined) dbFields.password = fields.password;
    if (fields.can_access_settings !== undefined || fields.canAccessSettings !== undefined) {
      dbFields.can_access_settings = fields.can_access_settings ?? fields.canAccessSettings;
    }
    if (fields.position !== undefined) dbFields.position = fields.position;
    await sbFetch('team_members?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(dbFields)
    });
    setTeamMembers(prev => prev.map(m => m.id === id ? { ...m, ...dbFields } : m));
  }, []);

  const deleteTeamMember = useCallback(async (id) => {
    await sbFetch('team_members?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    setTeamMembers(prev => prev.filter(m => m.id !== id));
  }, []);

  // ── CRUD: weekly_todos (to-do semanal personal) ──
  const loadWeeklyTodos = useCallback(async (userId, startDate, endDate) => {
    if (!userId) return;
    try {
      const rows = await sbFetch(
        `weekly_todos?user_id=eq.${encodeURIComponent(userId)}&date=gte.${startDate}&date=lte.${endDate}&order=position.asc&select=*`,
        { headers: { 'Prefer': 'return=representation' } }
      );
      if (rows && Array.isArray(rows)) {
        setWeeklyTodos(rows.map(r => ({ id: r.id, userId: r.user_id, taskId: r.task_id, date: r.date, position: r.position ?? 0, type: r.type || 'task', noteText: r.note_text || null, noteClientId: r.note_client_id || null, noteDone: !!r.note_done, noteDescription: r.note_description || null })));
      }
    } catch (e) { console.warn('loadWeeklyTodos error', e); }
  }, []);

  const addWeeklyTodo = useCallback(async (userId, taskId, date) => {
    const id = 'wt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const row = { id, user_id: userId, task_id: taskId, date, position: 0, type: 'task' };
    await sbFetch('weekly_todos', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(row)
    });
    setWeeklyTodos(prev => [...prev, { id, userId, taskId, date, position: 0, type: 'task' }]);
  }, []);

  const addWeeklyNote = useCallback(async (userId, date, text, clientId, description) => {
    const id = 'wn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const row = { id, user_id: userId, task_id: null, date, position: 0, type: 'note', note_text: text, note_client_id: clientId || null, note_description: description || null };
    await sbFetch('weekly_todos', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(row)
    });
    setWeeklyTodos(prev => [...prev, { id, userId, taskId: null, date, position: 0, type: 'note', noteText: text, noteClientId: clientId || null, noteDescription: description || null, noteDone: false }]);
  }, []);

  const removeWeeklyTodo = useCallback(async (todoId) => {
    await sbFetch('weekly_todos?id=eq.' + encodeURIComponent(todoId), { method: 'DELETE' });
    setWeeklyTodos(prev => prev.filter(t => t.id !== todoId));
  }, []);

  // ── CRUD: loom_videos ──
  const addLoomVideo = useCallback(async (video) => {
    const id = 'lv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const row = { id, title: video.title, loom_url: video.loom_url, description: video.description || '', is_main: !!video.is_main, position: video.position ?? 999 };
    await sbFetch('loom_videos', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify(row) });
    setLoomVideos(prev => [...prev, row]);
    return row;
  }, []);

  const updateLoomVideo = useCallback(async (id, fields) => {
    await sbFetch('loom_videos?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify(fields) });
    setLoomVideos(prev => prev.map(v => v.id === id ? { ...v, ...fields } : v));
  }, []);

  const deleteLoomVideo = useCallback(async (id) => {
    await sbFetch('loom_videos?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    setLoomVideos(prev => prev.filter(v => v.id !== id));
  }, []);

  // ── CRUD: team_reports + team_blockers (informes del equipo) ──
  // Importante: pasamos throwOnError:true a sbFetch para que cualquier
  // fallo del INSERT/PATCH llegue al modal. Antes el fetch tragaba errores
  // (e.g. unique violation por intentar dos informes del mismo día) y el
  // panel mostraba la fila en estado local que luego desaparecía al recargar.
  const addTeamReport = useCallback(async (data) => {
    const id = 'tr_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).slice(2, 8);
    const row = {
      id,
      user_id: data.user_id,
      report_type: data.report_type, // 'daily' | 'weekly'
      report_date: data.report_date, // YYYY-MM-DD
      client_ids: data.client_ids || [],
      worked_internal: !!data.worked_internal,
      progress_today: data.progress_today || '',
      next_day: data.next_day || '',
      progress_by_client: ensureBulletIds(data.progress_by_client || []),
      weekly_data: data.weekly_data || {},
    };
    await sbFetch('team_reports', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(row),
      throwOnError: true,
    });
    setTeamReports(prev => [{ ...row, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...prev]);

    // Si vino bloqueo, lo persisto en team_blockers
    if (data.blocker && data.blocker.description && data.blocker.needs) {
      const blockerId = 'bl_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).slice(2, 8);
      const blockerRow = {
        id: blockerId,
        report_id: id,
        user_id: data.user_id,
        description: data.blocker.description,
        client_id: data.blocker.client_id || null,
        needs: data.blocker.needs,
        resolved: false,
      };
      await sbFetch('team_blockers', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify(blockerRow),
        throwOnError: true,
      });
      setTeamBlockers(prev => [{ ...blockerRow, created_at: new Date().toISOString() }, ...prev]);
    }
    return row;
  }, []);

  const updateTeamReport = useCallback(async (id, fields) => {
    const patch = { ...fields };
    if (patch.progress_by_client) patch.progress_by_client = ensureBulletIds(patch.progress_by_client);
    await sbFetch('team_reports?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(patch),
      throwOnError: true,
    });
    setTeamReports(prev => prev.map(r => r.id === id ? { ...r, ...patch, updated_at: new Date().toISOString() } : r));
  }, []);

  const deleteTeamReport = useCallback(async (id) => {
    await sbFetch('team_reports?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    setTeamReports(prev => prev.filter(r => r.id !== id));
    // Los bloqueos vinculados se borran por CASCADE en DB; reflejamos local
    setTeamBlockers(prev => prev.filter(b => b.report_id !== id));
  }, []);

  const resolveBlocker = useCallback(async (blockerId) => {
    const now = new Date().toISOString();
    const resolvedBy = currentUser?.id || null;
    await sbFetch('team_blockers?id=eq.' + encodeURIComponent(blockerId), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ resolved: true, resolved_at: now, resolved_by: resolvedBy }),
    });
    setTeamBlockers(prev => prev.map(b => b.id === blockerId
      ? { ...b, resolved: true, resolved_at: now, resolved_by: resolvedBy }
      : b));
  }, [currentUser]);

  const unresolveBlocker = useCallback(async (blockerId) => {
    await sbFetch('team_blockers?id=eq.' + encodeURIComponent(blockerId), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ resolved: false, resolved_at: null, resolved_by: null }),
    });
    setTeamBlockers(prev => prev.map(b => b.id === blockerId
      ? { ...b, resolved: false, resolved_at: null, resolved_by: null }
      : b));
  }, []);

  // ── CRUD: ideas (cajón de ideas) ──
  const addIdea = useCallback(async (data) => {
    const id = 'idea_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).slice(2, 8);
    const row = {
      id,
      title: data.title,
      description: data.description || '',
      department: data.department,
      status: data.status || 'pending',
      author_id: data.author_id,
    };
    await sbFetch('ideas', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(row),
    });
    setIdeas(prev => [{ ...row, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...prev]);
    return row;
  }, []);

  const updateIdea = useCallback(async (id, fields) => {
    await sbFetch('ideas?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(fields),
    });
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, ...fields, updated_at: new Date().toISOString() } : i));
  }, []);

  const deleteIdea = useCallback(async (id) => {
    await sbFetch('ideas?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    setIdeas(prev => prev.filter(i => i.id !== id));
  }, []);

  // ── CRUD: strategies + strategy_pages ──
  // Cada cliente puede tener varias estrategias (embudo de ventas). Cada
  // estrategia agrupa paginas (VSL, Landing, etc) con URLs de testing y
  // produccion. Cascade en DB borra paginas al borrar estrategia y borra
  // todo al borrar el cliente.
  const addStrategy = useCallback(async (data) => {
    const id = 'strat_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).slice(2, 8);
    const row = {
      id,
      client_id: data.client_id,
      position: data.position || 0,
      name: String(data.name || 'Nueva estrategia').trim(),
      status: data.status || 'borrador',
      version: data.version || 'v1',
      drive_url: data.drive_url || null,
      docs: Array.isArray(data.docs) ? data.docs : [],
      start_date: data.start_date || null,
    };
    await sbFetch('strategies', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(row),
      throwOnError: true,
    });
    const nowIso = new Date().toISOString();
    setStrategies(prev => [...prev, { ...row, created_at: nowIso, updated_at: nowIso }]);
    return id;
  }, []);

  const updateStrategy = useCallback(async (id, fields) => {
    const patch = { ...fields };
    await sbFetch('strategies?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(patch),
      throwOnError: true,
    });
    setStrategies(prev => prev.map(s => s.id === id
      ? { ...s, ...patch, updated_at: new Date().toISOString() }
      : s));
  }, []);

  const deleteStrategy = useCallback(async (id) => {
    await sbFetch('strategies?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    setStrategies(prev => prev.filter(s => s.id !== id));
    setStrategyPages(prev => prev.filter(p => p.strategy_id !== id));
  }, []);

  const addStrategyPage = useCallback(async (data) => {
    const id = 'spg_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).slice(2, 8);
    const row = {
      id,
      strategy_id: data.strategy_id,
      position: data.position || 0,
      name: String(data.name || 'Nueva página').trim(),
      testing_url: data.testing_url || null,
      prod_url: data.prod_url || null,
      is_live: !!data.is_live,
      ads_url: data.ads_url || null,
      conversion_events: Array.isArray(data.conversion_events) ? data.conversion_events : [],
      pixel_id: data.pixel_id || null,
      clarity_id: data.clarity_id || null,
    };
    await sbFetch('strategy_pages', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(row),
      throwOnError: true,
    });
    setStrategyPages(prev => [...prev, { ...row, created_at: new Date().toISOString() }]);
    return id;
  }, []);

  const updateStrategyPage = useCallback(async (id, fields) => {
    const patch = { ...fields };
    await sbFetch('strategy_pages?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(patch),
      throwOnError: true,
    });
    setStrategyPages(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }, []);

  const deleteStrategyPage = useCallback(async (id) => {
    await sbFetch('strategy_pages?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    setStrategyPages(prev => prev.filter(p => p.id !== id));
  }, []);

  // ── CRUD: invoices ──
  // Historial de facturas emitidas a cada cliente. Cascade en DB borra todas
  // las facturas al borrar el cliente.
  const addInvoice = useCallback(async (data) => {
    const id = 'inv_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).slice(2, 8);
    const row = {
      id,
      client_id: data.client_id,
      number: String(data.number || '').trim(),
      issue_date: data.issue_date,
      amount: Number(data.amount || 0),
      currency: data.currency || 'EUR',
      concept: data.concept || null,
      status: data.status || 'pendiente',
      kind: data.kind || 'ingreso',
      payment_method: data.payment_method || null,
      pdf_url: data.pdf_url || null,
    };
    await sbFetch('invoices', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(row),
      throwOnError: true,
    });
    const nowIso = new Date().toISOString();
    setInvoices(prev => [...prev, { ...row, created_at: nowIso, updated_at: nowIso }]);
    return id;
  }, []);

  const updateInvoice = useCallback(async (id, fields) => {
    const patch = { ...fields };
    await sbFetch('invoices?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(patch),
      throwOnError: true,
    });
    setInvoices(prev => prev.map(i => i.id === id
      ? { ...i, ...patch, updated_at: new Date().toISOString() }
      : i));
  }, []);

  const deleteInvoice = useCallback(async (id) => {
    await sbFetch('invoices?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    setInvoices(prev => prev.filter(i => i.id !== id));
  }, []);

  // ── CRUD: task_comments ──
  // Comentarios en tareas. Hilos de 1 nivel: parent_id NULL = raiz; si tiene
  // valor referencia al comentario padre. Cascade en DB borra hijos al borrar
  // padre y borra todo al borrar la tarea.
  const addTaskComment = useCallback(async (data) => {
    const id = 'tc_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).slice(2, 8);
    const row = {
      id,
      task_id: data.task_id,
      parent_id: data.parent_id || null,
      author_id: data.author_id,
      body: String(data.body || '').trim(),
      edited: false,
    };
    await sbFetch('task_comments', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(row),
      throwOnError: true,
    });
    const nowIso = new Date().toISOString();
    setTaskComments(prev => [...prev, { ...row, created_at: nowIso, updated_at: nowIso }]);
    return id;
  }, []);

  const updateTaskComment = useCallback(async (id, fields) => {
    const patch = { ...fields };
    if (patch.body !== undefined) patch.body = String(patch.body).trim();
    patch.edited = true;
    await sbFetch('task_comments?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(patch),
      throwOnError: true,
    });
    setTaskComments(prev => prev.map(c => c.id === id
      ? { ...c, ...patch, updated_at: new Date().toISOString() }
      : c));
  }, []);

  const deleteTaskComment = useCallback(async (id) => {
    await sbFetch('task_comments?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    // Borramos local: el comentario + sus respuestas (la DB cascadea, pero
    // limpiamos el estado optimista para no esperar al siguiente refresh).
    setTaskComments(prev => prev.filter(c => c.id !== id && c.parent_id !== id));
  }, []);

  // ── Notificaciones ──
  // Las filas las generan triggers de Postgres (ver migrations/notifications_v1.sql).
  // Acá solo leemos, marcamos como leído y abrimos/cerramos el buzón.
  const markNotificationRead = useCallback(async (id) => {
    setNotifications(prev => prev.map(n => n.id === id && !n.read_at
      ? { ...n, read_at: new Date().toISOString() } : n));
    await sbFetch('notifications?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ read_at: new Date().toISOString() }),
    });
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    const uid = currentUserIdRef.current;
    if (!uid) return;
    const nowIso = new Date().toISOString();
    setNotifications(prev => prev.map(n => n.read_at ? n : { ...n, read_at: nowIso }));
    await sbFetch(
      'notifications?recipient_id=eq.' + encodeURIComponent(uid) + '&read_at=is.null',
      { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ read_at: nowIso }) },
    );
  }, []);

  const openNotifications = useCallback(() => setNotifPanelOpen(true), []);
  const closeNotifications = useCallback(() => setNotifPanelOpen(false), []);
  const dismissNotifToast = useCallback(() => setNotifToast(null), []);

  const unreadNotifCount = useMemo(
    () => notifications.filter(n => !n.read_at).length,
    [notifications],
  );

  // Carga inicial + suscripción realtime cuando hay usuario. Filtra por
  // recipient_id para que cada persona reciba solo lo suyo (mismo id que
  // currentUser.id / team_members.id). Primer uso de realtime en el panel.
  useEffect(() => {
    const uid = currentUser?.id;
    if (!uid) { setNotifications([]); return; }
    let active = true;

    (async () => {
      const rows = await sbFetch(
        'notifications?recipient_id=eq.' + encodeURIComponent(uid) +
        '&order=created_at.desc&limit=100',
        { headers: { 'Prefer': 'return=representation' } },
      );
      if (active && Array.isArray(rows)) setNotifications(rows);
    })();

    const channel = supabase
      .channel('notifs_' + uid)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'recipient_id=eq.' + uid },
        (payload) => {
          const n = payload.new;
          setNotifications(prev => (prev.some(x => x.id === n.id) ? prev : [n, ...prev]));
          setNotifToast(n);
        })
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [currentUser?.id]);

  // ── CRUD: report_bullet_comments ──
  // Mismo patron que task_comments pero apunta a un bullet dentro de un informe.
  // bullet_id es un soft-link (no FK) contra el id que vive en progress_by_client.
  const addBulletComment = useCallback(async (data) => {
    const id = 'bc_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).slice(2, 8);
    const row = {
      id,
      report_id: data.report_id,
      bullet_id: data.bullet_id,
      parent_id: data.parent_id || null,
      author_id: data.author_id,
      body: String(data.body || '').trim(),
      edited: false,
    };
    await sbFetch('report_bullet_comments', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(row),
      throwOnError: true,
    });
    const nowIso = new Date().toISOString();
    setBulletComments(prev => [...prev, { ...row, created_at: nowIso, updated_at: nowIso }]);
    return id;
  }, []);

  const updateBulletComment = useCallback(async (id, fields) => {
    const patch = { ...fields };
    if (patch.body !== undefined) patch.body = String(patch.body).trim();
    patch.edited = true;
    await sbFetch('report_bullet_comments?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(patch),
      throwOnError: true,
    });
    setBulletComments(prev => prev.map(c => c.id === id
      ? { ...c, ...patch, updated_at: new Date().toISOString() }
      : c));
  }, []);

  const deleteBulletComment = useCallback(async (id) => {
    await sbFetch('report_bullet_comments?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    setBulletComments(prev => prev.filter(c => c.id !== id && c.parent_id !== id));
  }, []);

  // ── CRUD: notas ──
  // Tabla `notas` (notas_v1.sql). Mismo patron que ideas: optimistic UI +
  // POST/PATCH/DELETE contra Supabase. Toda la sanitizacion del body_html
  // ocurre en el frontend (DOMPurify) antes de llegar aca.
  const addNota = useCallback(async (data) => {
    const id = 'nota_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).slice(2, 8);
    // Posicion: insertamos al tope (mas alta que cualquier existente).
    // Usamos double precision asi reordenar entre 2 items se resuelve con el
    // promedio sin renumerar nada.
    const maxPos = (Array.isArray(data._allNotas) ? data._allNotas : []).reduce(
      (m, n) => Math.max(m, n.position || 0), 0,
    );
    const row = {
      id,
      title: data.title,
      body_html: data.body_html || '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      author_id: data.author_id,
      share_with_ids: Array.isArray(data.share_with_ids) ? data.share_with_ids : [],
      pinned: !!data.pinned,
      color: data.color || 'white',
      position: maxPos + 1,
    };
    await sbFetch('notas', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(row),
      throwOnError: true,
    });
    setNotas(prev => [{ ...row, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...prev]);
    return row;
  }, []);

  // Reordena una nota a una nueva posicion calculando un float entre los
  // vecinos. Si los dos vecinos tienen positions muy juntas (gap < 0.001)
  // renumeramos todo el grupo de a 1.0 para evitar perdida de precision.
  const reorderNota = useCallback(async (id, prevPosition, nextPosition) => {
    let newPos;
    if (prevPosition == null && nextPosition == null) newPos = 0;
    else if (prevPosition == null) newPos = nextPosition - 1;
    else if (nextPosition == null) newPos = prevPosition + 1;
    else newPos = (prevPosition + nextPosition) / 2;
    setNotas(prev => prev.map(n => n.id === id ? { ...n, position: newPos } : n));
    await sbFetch('notas?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ position: newPos }),
    });
  }, []);

  const updateNota = useCallback(async (id, fields) => {
    await sbFetch('notas?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(fields),
      throwOnError: true,
    });
    setNotas(prev => prev.map(n => n.id === id ? { ...n, ...fields, updated_at: new Date().toISOString() } : n));
  }, []);

  const deleteNota = useCallback(async (id) => {
    await sbFetch('notas?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    setNotas(prev => prev.filter(n => n.id !== id));
  }, []);

  // ── CRUD: llamadas ──
  const updateLlamada = useCallback(async (id, fields) => {
    await sbFetch('llamadas?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(fields)
    });
    setLlamadas(prev => prev.map(l => l.id === id ? { ...l, ...fields } : l));
  }, []);

  const deleteLlamada = useCallback(async (id) => {
    await sbFetch('llamadas?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    setLlamadas(prev => prev.filter(l => l.id !== id));
  }, []);

  const addLlamadaInbox = useCallback(async (data) => {
    const id = 'inb_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).slice(2, 10);
    const isLoom = (data.url || '').includes('loom.com');
    const isFathom = (data.url || '').includes('fathom.video');
    const source = isLoom ? 'loom' : isFathom ? 'fathom' : 'manual';
    const row = {
      id,
      fathom_id: id,
      recording_url: data.url,
      title_fathom: data.titulo || null,
      transcript: data.transcript || null,
      raw_payload: {
        source,
        categoria_hint: data.categoria || null,
        cliente_id_hint: data.clienteId || null,
        participantes_hint: data.participantes || null,
        contexto: data.contexto || null,
        manual: true,
      },
      processed: false,
    };
    await sbFetch('llamadas_inbox', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify(row) });
    setPendingCallsCount(prev => prev + 1);
    return row;
  }, []);

  const updateWeeklyTodo = useCallback(async (todoId, fields) => {
    const dbFields = {};
    if (fields.date !== undefined) dbFields.date = fields.date;
    if (fields.position !== undefined) dbFields.position = fields.position;
    if (fields.note_done !== undefined) dbFields.note_done = fields.note_done;
    if (fields.note_text !== undefined) dbFields.note_text = fields.note_text;
    if (fields.note_description !== undefined) dbFields.note_description = fields.note_description;
    if (fields.note_client_id !== undefined) dbFields.note_client_id = fields.note_client_id;
    const localFields = { ...fields };
    if (fields.note_done !== undefined) localFields.noteDone = fields.note_done;
    if (fields.note_text !== undefined) localFields.noteText = fields.note_text;
    if (fields.note_description !== undefined) localFields.noteDescription = fields.note_description;
    if (fields.note_client_id !== undefined) localFields.noteClientId = fields.note_client_id;
    // 1) Update local state INMEDIATAMENTE (optimista). Sin esperar al PATCH.
    setWeeklyTodos(prev => prev.map(t => t.id === todoId ? { ...t, ...localFields } : t));
    // 2) PATCH en background. Devuelve una promesa por si el caller la quiere awaitear.
    return sbFetch('weekly_todos?id=eq.' + encodeURIComponent(todoId), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(dbFields)
    }).catch(e => console.warn('updateWeeklyTodo DB error', e));
  }, []);

  // ── Normalize client priority (new 6-level scale) ──
  // 1: SUPER PRIORITARIO, 2: IMPORTANTES, 3: NORMAL, 4: POCO IMPORTANTES, 5: NUEVOS, 6: DESCARTADOS
  const normalizePriority = (p) => {
    if (p >= 1 && p <= 6) return p;
    return 5; // default to NUEVOS
  };

  // ── Load from Supabase ──
  const loadFromSupabase = useCallback(async () => {
    try {
      // Columnas explícitas para evitar traer payloads enormes (meta_ads, client_feedbacks, etc.).
      // Los arrays grandes (meta_ads, client_feedbacks) se cargan on-demand al abrir el detalle del cliente.
      const CLIENT_COLS = 'id,name,company,service,start_date,pm,color,status,priority,bottleneck,notes,steps,feedback,history,phone,avatar_url,slack_channel,slack_channel_id,meta_ads,custom_steps,custom_phases,client_feedbacks,step_name_overrides,phase_name_overrides,phase_deadlines,links,pending_resources,meta_metrics,billing_amount,billing_currency,billing_cycle,billing_installments,next_charge_date,payment_method,billing_status,visual_resources,niche,email,country,timezone,contract_url,contract_signed_date,contract_renewal_date,tier,conector,closer,contract_data';
      const TASK_COLS = 'id,title,client_id,assignee,priority,status,notes,description,step_idx,created_date,started_date,completed_date,blocked_since,phase,depends_on,is_roadmap_task,template_id,estimated_days,is_client_task,days_from_unblock,due_date,accumulated_days,timer_started_at,enabled_date,position';
      const [sbClients, sbTasks, briefings, feedbacks, proposals, alerts, sbSettings, sbTeam] = await Promise.all([
        sbFetch(`clients?select=${CLIENT_COLS}&order=priority.asc`, { headers: { 'Prefer': 'return=representation' } }),
        sbFetch(`tasks?select=${TASK_COLS}&order=created_at.asc&limit=2000`, { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('briefings?id=eq.latest&select=*', { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('report_feedback?select=*&order=created_at.desc&limit=20', { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('task_proposals?select=*&order=created_at.desc&limit=50', { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('dashboard_alerts?select=*&dismissed=eq.false&order=days_old.desc&limit=100', { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('app_settings?key=eq.global&select=*', { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('team_members?select=*&order=position.asc', { headers: { 'Prefer': 'return=representation' } }),
      ]);

      if (briefings && briefings.length) setBriefing(briefings[0]);
      if (feedbacks && feedbacks.length) setReportFeedbacks(feedbacks);
      if (proposals && proposals.length) setTaskProposals(proposals);
      if (alerts) setDashboardAlerts(alerts);
      if (sbSettings && sbSettings.length > 0) setAppSettings(sbSettings[0].value || null);
      if (sbTeam && sbTeam.length > 0) setTeamMembers(sbTeam.map(m => ({ ...m, avatar: m.avatar_url || m.avatar || null })));

      // Cargar loom videos
      try {
        const vids = await sbFetch('loom_videos?select=*&order=position.asc', { headers: { 'Prefer': 'return=representation' } });
        if (vids && Array.isArray(vids)) setLoomVideos(vids);
      } catch (e) { /* silent */ }

      // Cargar llamadas procesadas
      try {
        const calls = await sbFetch('llamadas?select=*&order=fecha.desc.nullslast&limit=300', { headers: { 'Prefer': 'return=representation' } }).then(r => Array.isArray(r) ? r.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0)) : r);
        if (calls && Array.isArray(calls)) setLlamadas(calls);
      } catch (e) { /* silent */ }

      // Contar llamadas pendientes de procesar
      try {
        const pending = await sbFetch('llamadas_inbox?processed=eq.false&select=id', { headers: { 'Prefer': 'return=representation' } });
        if (pending && Array.isArray(pending)) setPendingCallsCount(pending.length);
      } catch (e) { /* silent */ }

      // Informes del equipo (últimos 60 días)
      try {
        const sinceDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const reports = await sbFetch(
          'team_reports?select=*&order=report_date.desc&report_date=gte.' + sinceDate,
          { headers: { 'Prefer': 'return=representation' } }
        );
        if (reports && Array.isArray(reports)) setTeamReports(reports);
      } catch (e) { /* silent */ }

      // Bloqueos: todos los abiertos + últimos 30 días resueltos
      try {
        const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const blockers = await sbFetch(
          'team_blockers?select=*&order=created_at.desc&or=(resolved.eq.false,resolved_at.gte.' + sinceDate + ')',
          { headers: { 'Prefer': 'return=representation' } }
        );
        if (blockers && Array.isArray(blockers)) setTeamBlockers(blockers);
      } catch (e) { /* silent */ }

      // Cajón de ideas
      try {
        const allIdeas = await sbFetch('ideas?select=*&order=created_at.desc&limit=200', { headers: { 'Prefer': 'return=representation' } });
        if (allIdeas && Array.isArray(allIdeas)) setIdeas(allIdeas);
      } catch (e) { /* silent */ }

      // Notas del equipo (v15). Cargar todas las visibles; filtrado por
      // visibilidad ocurre en el frontend (NotasView). Log explicito de
      // errores para evitar el silent-fail historico que dificultaba
      // diagnosticar problemas de RLS.
      try {
        const allNotas = await sbFetch('notas?select=*&order=updated_at.desc&limit=500', { headers: { 'Prefer': 'return=representation' } });
        if (allNotas && Array.isArray(allNotas)) setNotas(allNotas);
      } catch (e) { console.warn('loadNotas error', e); }

      // Comentarios de tareas. Orden ascendente para que al armar hilos en el
      // frontend ya vengan en el orden cronologico correcto.
      try {
        const allComments = await sbFetch('task_comments?select=*&order=created_at.asc&limit=2000', { headers: { 'Prefer': 'return=representation' } });
        if (allComments && Array.isArray(allComments)) setTaskComments(allComments);
      } catch (e) { console.warn('loadTaskComments error', e); }

      // Comentarios por bullet de informe (mismo patron, tabla separada).
      try {
        const allBulletComments = await sbFetch('report_bullet_comments?select=*&order=created_at.asc&limit=2000', { headers: { 'Prefer': 'return=representation' } });
        if (allBulletComments && Array.isArray(allBulletComments)) setBulletComments(allBulletComments);
      } catch (e) { console.warn('loadBulletComments error', e); }

      // Estrategias y paginas por cliente (Fase 2 ficha cliente)
      try {
        const allStrats = await sbFetch('strategies?select=*&order=position.asc&limit=500', { headers: { 'Prefer': 'return=representation' } });
        if (allStrats && Array.isArray(allStrats)) setStrategies(allStrats);
        const allStratPages = await sbFetch('strategy_pages?select=*&order=position.asc&limit=2000', { headers: { 'Prefer': 'return=representation' } });
        if (allStratPages && Array.isArray(allStratPages)) setStrategyPages(allStratPages);
      } catch (e) { console.warn('loadStrategies error', e); }

      // Facturas por cliente (Fase 3 ficha cliente)
      try {
        const allInvoices = await sbFetch('invoices?select=*&order=issue_date.desc&limit=2000', { headers: { 'Prefer': 'return=representation' } });
        if (allInvoices && Array.isArray(allInvoices)) setInvoices(allInvoices);
      } catch (e) { console.warn('loadInvoices error', e); }

      if (sbClients && sbClients.length > 0) {
        const mappedClients = sbClients.map(c => ({
          id: c.id, name: c.name, company: c.company, service: c.service,
          startDate: c.start_date, pm: c.pm, color: c.color, status: c.status,
          priority: normalizePriority(c.priority), bottleneck: c.bottleneck, notes: c.notes,
          steps: c.steps || [], feedback: c.feedback || [], history: c.history || [],
          phone: c.phone || '', avatarUrl: c.avatar_url || '',
          slackChannel: c.slack_channel || '', slackChannelId: c.slack_channel_id || '',
          metaAds: c.meta_ads || [], customSteps: c.custom_steps || [],
          customPhases: c.custom_phases || [], clientFeedbacks: c.client_feedbacks || [],
          stepNameOverrides: c.step_name_overrides || {}, phaseNameOverrides: c.phase_name_overrides || {},
          phaseDeadlines: c.phase_deadlines || {},
          links: c.links || [],
          pendingResources: c.pending_resources || [],
          metaMetrics: c.meta_metrics || null,
          billingAmount: c.billing_amount != null ? Number(c.billing_amount) : null,
          billingCurrency: c.billing_currency || 'EUR',
          billingCycle: c.billing_cycle || 'mensual',
          billingInstallments: c.billing_installments || 1,
          nextChargeDate: c.next_charge_date || null,
          paymentMethod: c.payment_method || '',
          billingStatus: c.billing_status || 'al_dia',
          visualResources: Array.isArray(c.visual_resources) ? c.visual_resources : [],
          niche: c.niche || '',
          email: c.email || '',
          country: c.country || '',
          timezone: c.timezone || '',
          contractUrl: c.contract_url || '',
          contractSignedDate: c.contract_signed_date || null,
          contractRenewalDate: c.contract_renewal_date || null,
          tier: c.tier || null,
          conector: c.conector || '',
          closer: c.closer || '',
          contractData: c.contract_data || '',
        }));
        const rawMappedTasks = (sbTasks || []).map(t => ({
          id: t.id, title: t.title, clientId: t.client_id, assignee: t.assignee,
          priority: t.priority, status: t.status, notes: t.notes,
          description: t.description || '', stepIdx: t.step_idx, createdDate: t.created_date,
          startedDate: t.started_date || null, completedDate: t.completed_date || null, blockedSince: t.blocked_since || null,
          phase: t.phase || null, dependsOn: t.depends_on || null, isRoadmapTask: t.is_roadmap_task || false,
          templateId: t.template_id || null, estimatedDays: t.estimated_days || null, isClientTask: t.is_client_task || false,
          daysFromUnblock: t.days_from_unblock != null ? Number(t.days_from_unblock) : null,
          dueDate: t.due_date || null,
          accumulatedDays: t.accumulated_days || 0,
          timerStartedAt: t.timer_started_at || null,
          enabledDate: t.enabled_date || null,
          position: t.position ?? 0
        }));

        // Backfill: normalizar startedDate usando createdDate como aproximaci\u00f3n.
        // Las tareas habilitadas obtienen startedDate = createdDate (mejor aprox que today()
        // porque reflejan cuando la tarea existi\u00f3 por primera vez, no cuando cargamos la p\u00e1gina).
        // Las no habilitadas quedan sin fecha. Las done no se tocan.
        // Tambi\u00e9n corrige tareas cuyo startedDate es posterior al createdDate (backfill previo incorrecto).
        const mappedTasks = rawMappedTasks.map(t => {
          if (t.status === 'done') return t;
          const enabled = isTaskEnabled(t, rawMappedTasks);
          if (!enabled) {
            return t.startedDate ? { ...t, startedDate: null } : t;
          }
          const candidate = t.createdDate || today();
          if (!t.startedDate || t.startedDate > candidate) {
            return { ...t, startedDate: candidate };
          }
          return t;
        });

        const injected = injectMetaMetrics(mappedClients);
        setClients(injected);
        setTasks(mappedTasks);
        localStorage.setItem('korex_v6', JSON.stringify({ clients: injected, tasks: mappedTasks }));
        dbReady.current = true;

        // Persistir en Supabase las tareas que cambiaron por el backfill
        mappedTasks.forEach((t, i) => {
          if (t !== rawMappedTasks[i]) {
            sbFetch('tasks', {
              method: 'POST',
              headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' },
              body: JSON.stringify({
                id: t.id, title: t.title, client_id: t.clientId, assignee: t.assignee,
                priority: t.priority, status: t.status, notes: t.notes,
                description: t.description || '', step_idx: t.stepIdx, created_date: t.createdDate,
                started_date: t.startedDate || null, completed_date: t.completedDate || null, blocked_since: t.blockedSince || null,
                phase: t.phase || null, depends_on: t.dependsOn || null, is_roadmap_task: t.isRoadmapTask || false,
                template_id: t.templateId || null, estimated_days: t.estimatedDays || null, is_client_task: t.isClientTask || false,
                due_date: t.dueDate || null,
                accumulated_days: t.accumulatedDays || 0,
                timer_started_at: t.timerStartedAt || null,
                enabled_date: t.enabledDate || null,
                position: t.position ?? 0
              })
            });
          }
        });
        console.log('\u2713 Loaded from Supabase:', injected.length, 'clients,', mappedTasks.length, 'tasks');
        return true;
      }
    } catch (e) {
      console.warn('Supabase load failed, using localStorage:', e);
    }
    return false;
  }, [injectMetaMetrics]);

  // ── Poll Supabase for external updates ──
  const pollSupabase = useCallback(async () => {
    if (!dbReady.current || Date.now() - lastPoll.current < 25000) return;
    lastPoll.current = Date.now();
    try {
      // Check briefings
      const briefings = await sbFetch('briefings?id=eq.latest&select=*', { headers: { 'Prefer': 'return=representation' } });
      if (briefings && briefings.length) {
        setBriefing(prev => {
          if (JSON.stringify(briefings[0]) !== JSON.stringify(prev)) return briefings[0];
          return prev;
        });
      }

      // Check task proposals
      const proposals = await sbFetch('task_proposals?approval=eq.pending&select=*&order=created_at.desc', { headers: { 'Prefer': 'return=representation' } });
      if (proposals && proposals.length) {
        setTaskProposals(prev => {
          const newIds = proposals.map(p => p.id);
          const existingIds = prev.filter(p => p.approval === 'pending').map(p => p.id);
          if (JSON.stringify(newIds) !== JSON.stringify(existingIds)) {
            const merged = [...prev];
            proposals.forEach(p => {
              if (!merged.find(x => x.id === p.id)) merged.unshift(p);
            });
            return merged;
          }
          return prev;
        });
      }

      // Check tasks
      const remoteTasks = await sbFetch('tasks?select=id,title,client_id,assignee,priority,status,notes,step_idx,created_date,updated_at&order=updated_at.desc&limit=50', { headers: { 'Prefer': 'return=representation' } });
      if (!remoteTasks || !remoteTasks.length) return;

      setTasks(prev => {
        let changed = false;
        const newTasks = [...prev];
        remoteTasks.forEach(t => {
          const existingIdx = newTasks.findIndex(x => x.id === t.id);
          if (existingIdx >= 0) {
            const existing = newTasks[existingIdx];
            if (t.title !== existing.title || t.status !== existing.status || t.assignee !== existing.assignee || t.priority !== existing.priority) {
              newTasks[existingIdx] = {
                ...existing,
                title: t.title, status: t.status, assignee: t.assignee,
                priority: t.priority, notes: t.notes
              };
              changed = true;
            }
          } else {
            newTasks.push({
              id: t.id, title: t.title, clientId: t.client_id, assignee: t.assignee,
              priority: t.priority, status: t.status, notes: t.notes,
              stepIdx: t.step_idx, createdDate: t.created_date
            });
            changed = true;
          }
        });
        if (changed) {
          localStorage.setItem('korex_v6', JSON.stringify({ clients: clientsRef.current, tasks: newTasks }));
          console.log('\u2713 Pulled updates from Supabase');
          return newTasks;
        }
        return prev;
      });
    } catch (e) {
      /* silent fail on poll */
    }
  }, []);

  // ── Migrate old clients to roadmap tasks ──
  const migrateAllClients = useCallback(() => {
    const currentClients = clientsRef.current;
    const currentTasks = tasksRef.current;
    let newTasks = [...currentTasks];
    let migrated = false;

    currentClients.forEach(c => {
      // Only migrate if has steps and NO roadmap tasks
      if (c.steps && c.steps.length > 0 && !hasRoadmapTasks(c.id, newTasks)) {
        const roadmapTasks = migrateClientToRoadmap(c, newTasks);
        newTasks = [...newTasks, ...roadmapTasks];
        // Recalculate timers for this client
        const result = recalculateTimers(c.id, newTasks);
        newTasks = result.tasks;
        migrated = true;
        console.log('\u2713 Migrated client:', c.name, '— created', roadmapTasks.length, 'roadmap tasks');
      }
    });

    if (migrated) {
      setTasks(newTasks);
      save(currentClients, newTasks);
      if (dbReady.current) {
        // Save only the new roadmap tasks to Supabase
        const roadmapOnly = newTasks.filter(t => t.isRoadmapTask && !currentTasks.find(ct => ct.id === t.id));
        roadmapOnly.forEach(t => dbSaveTask(t));
      }
    }
  }, [save, dbSaveTask, recalculateTimers]);

  // ── Init on mount ──
  useEffect(() => {
    // Sin sesion no hacemos ningun fetch a Supabase: RLS bloquearia igual y
    // ensuciaria la consola con 401s antes del login.
    if (!authUser) return;

    // Cleanup de clave legacy (antes guardaba el slug del usuario en localStorage).
    localStorage.removeItem('korex_user');

    // 1. Load from localStorage first (instant)
    const raw = localStorage.getItem('korex_v6');
    let localClients = [];
    let localTasks = [];
    if (raw) {
      try {
        const p = JSON.parse(raw);
        localClients = (p.clients || []).map(c => ({ ...c, priority: normalizePriority(c.priority) }));
        localTasks = p.tasks || [];
      } catch (e) { /* ignore parse errors */ }
    }
    const injected = injectMetaMetrics(localClients);
    setClients(injected);
    setTasks(localTasks);

    // 2. Then try Supabase in background
    loadFromSupabase().then(loaded => {
      dbReady.current = true;
      if (!loaded && localClients.length > 0) {
        // No data in Supabase yet -- push local data up
        dbSyncAll(injected, localTasks).then(() => {
          console.log('\u2713 Initial data pushed to Supabase');
          setSyncStatus('ok');
        });
      } else if (loaded) {
        setSyncStatus('ok');
      }
      // Migration disabled — run manually if needed
      // migrateAllClients();
    });

    // 3. Poll for external changes every 30s
    const pollInterval = setInterval(pollSupabase, 30000);
    return () => clearInterval(pollInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  const value = {
    // State
    clients, setClients,
    tasks, setTasks,
    view, setView,
    selectedId, setSelectedId,
    phase, setPhase,
    filter, setFilter,
    taskFilter, setTaskFilter,
    taskAssignee, setTaskAssignee,
    taskClientFilter, setTaskClientFilter,
    taskPriority, setTaskPriority,
    taskDueFilter, setTaskDueFilter,
    currentUser,
    authUser,
    isAdmin,
    briefing, setBriefing,
    reportFeedbacks, setReportFeedbacks,
    taskProposals, setTaskProposals,
    dashboardAlerts, setDashboardAlerts,
    dismissAlert: async (alertId) => {
      setDashboardAlerts(prev => prev.filter(a => a.id !== alertId));
      try {
        await sbFetch('dashboard_alerts?id=eq.' + alertId, {
          method: 'PATCH',
          body: JSON.stringify({ dismissed: true, updated_at: new Date().toISOString() })
        });
      } catch (e) { console.error('Failed to dismiss alert', e); }
    },
    hideCompleted, setHideCompleted,
    hideCompletedTasks, setHideCompletedTasks,
    hideBlockedTasks, setHideBlockedTasks,
    collapsedGroups, setCollapsedGroups,
    syncStatus, setSyncStatus,

    // Actions
    save,
    dbSaveClient,
    dbSaveTask,
    dbSyncAll,
    dbDeleteTask,
    createClient,
    updateClient,
    deleteClient,
    createTask,
    updateTask,
    deleteTask,
    reorderTask,
    doLogout,
    injectMetaMetrics,
    recalculateTimers,
    // Settings panel
    appSettings,
    teamMembers,
    updateAppSettings,
    addTeamMember,
    updateTeamMember,
    deleteTeamMember,
    // Weekly to-do
    weeklyTodos,
    loadWeeklyTodos,
    addWeeklyTodo,
    addWeeklyNote,
    removeWeeklyTodo,
    updateWeeklyTodo,
    // Loom videos
    loomVideos,
    addLoomVideo,
    updateLoomVideo,
    deleteLoomVideo,
    // Llamadas procesadas
    llamadas,
    updateLlamada,
    deleteLlamada,
    addLlamadaInbox,
    pendingCallsCount,
    // Informes del equipo (v13)
    teamReports,
    teamBlockers,
    addTeamReport,
    updateTeamReport,
    deleteTeamReport,
    resolveBlocker,
    unresolveBlocker,
    // Cajón de ideas (v13)
    ideas,
    addIdea,
    updateIdea,
    deleteIdea,
    notas,
    addNota,
    updateNota,
    deleteNota,
    reorderNota,
    taskComments,
    addTaskComment,
    updateTaskComment,
    deleteTaskComment,
    bulletComments,
    addBulletComment,
    updateBulletComment,
    deleteBulletComment,
    // Side panel de comentarios (generico para task o bullet).
    commentsTarget,
    openTaskComments: (taskId) => setCommentsTarget(taskId ? { kind: 'task', taskId } : null),
    openBulletComments: (reportId, bulletId) => setCommentsTarget({ kind: 'bullet', reportId, bulletId }),
    closeComments: () => setCommentsTarget(null),
    // Alias legacy para compat con el panel actual (devuelve el taskId si esta abierto en modo task).
    openCommentTaskId: commentsTarget?.kind === 'task' ? commentsTarget.taskId : null,
    closeTaskComments: () => setCommentsTarget(null),
    // Notificaciones (buzón)
    notifications,
    unreadNotifCount,
    notifPanelOpen,
    openNotifications,
    closeNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    notifToast,
    dismissNotifToast,
    strategies,
    strategyPages,
    addStrategy,
    updateStrategy,
    deleteStrategy,
    addStrategyPage,
    updateStrategyPage,
    deleteStrategyPage,
    invoices,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    // Helper unificado: lee priority labels de appSettings con fallback a PRIO_CLIENT
    getPriorityLabel: (p) => {
      const fromDb = appSettings?.priority_labels?.[String(p)];
      return fromDb || PRIO_CLIENT[p];
    },
    getAllPriorityLabels: () => {
      const fromDb = appSettings?.priority_labels;
      if (fromDb && Object.keys(fromDb).length > 0) return fromDb;
      return PRIO_CLIENT;
    },
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}