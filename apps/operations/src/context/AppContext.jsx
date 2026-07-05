import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { sbFetch, supabase } from '@korex/db';
import { useCurrentUser, signOut } from '@korex/auth';
import { CLIENT_ADS_DATA, PRIO_CLIENT, TAREAS_LAYOUT } from '../utils/constants';
import { mkClient, mkTask, createDefaultTasks, today, isTimerRunning, daysBetween, migrateClientToRoadmap, hasRoadmapTasks, recomputeStartedDates, isTaskEnabled, ensureBulletIds, getActiveSprint, mondayOf, addDaysStr, sprintStubForMonday, upcomingSprintStubs, buildSprintSummary, userOwnsTask, userSeesTask, isReviewerOf, assigneeMatches } from '../utils/helpers';
import { extractMentions } from '../utils/mentions';
import { diffBulletsByTaskLink, bulletsToComplete } from '../utils/taskActivity';

// Recorre progress_by_client y rellena mentioned_ids en cada bullet.
function enrichBulletsWithMentions(progressByClient, teamMembers, excludeId) {
  if (!Array.isArray(progressByClient)) return progressByClient;
  return progressByClient.map(block => ({
    ...block,
    bullets: Array.isArray(block?.bullets)
      ? block.bullets.map(b => ({
          ...b,
          mentioned_ids: extractMentions(b?.text || '', teamMembers, { excludeId }),
        }))
      : block?.bullets,
  }));
}

// Las utilidades de fecha para sprints (addDaysStr, sprintStubForMonday,
// upcomingSprintStubs) viven en utils/helpers.js (fuente única del id de sprint).

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
  const [taskDepartment, setTaskDepartment] = useState('all'); // all | ventas | operaciones | programacion | marketing
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
  // Fallos de guardado de tareas que NO llegaron a la base. A diferencia de
  // syncStatus (guardado masivo debounced), esto rastrea cada POST puntual de
  // dbSaveTask: si falla, lo reintentamos con backoff y lo mostramos al usuario,
  // así un cambio nunca "se revierte solo" sin explicación. null = todo ok.
  const [saveError, setSaveError] = useState(null);
  // Aviso transitorio (info) para explicar acciones que sacan una tarea de la
  // vista/filtro actual (ej: reasignar la manda "fuera del filtro"), así no
  // parece que "desapareció". Se limpia solo a los pocos segundos.
  const [flashMessage, setFlashMessage] = useState(null);
  // Settings panel state (cargado desde Supabase)
  const [appSettings, setAppSettings] = useState(null); // { roadmap_template, services, priority_labels }
  const [teamMembers, setTeamMembers] = useState([]); // [{ id, name, role, ... }]
  // Weekly to-do list (personal por usuario)
  const [weeklyTodos, setWeeklyTodos] = useState([]); // [{ id, userId, taskId, date, position }]
  // Sprints (Kanban ágil) — semana de trabajo del equipo
  const [sprints, setSprints] = useState([]); // [{ id, number, name, startDate, endDate, goal, status }]
  const sprintsRef = useRef([]);
  sprintsRef.current = sprints;
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
  const [contracts, setContracts] = useState([]);
  // Panel lateral de actividad/comentarios: target abierto o null.
  // Forma: null | { kind: 'task', taskId } | { kind: 'bullet', reportId, bulletId }
  const [commentsTarget, setCommentsTarget] = useState(null);
  // Comentarios por bullet de informe (mirror del patron de task_comments)
  const [bulletComments, setBulletComments] = useState([]);
  // Comentarios sobre ideas y bloqueos (mismo patron)
  const [ideaComments, setIdeaComments] = useState([]);
  const [blockerComments, setBlockerComments] = useState([]);
  // Orden custom de tareas por usuario. Filas {task_id, user_id, position}.
  // Si una tarea no tiene fila para un user, ordena por tasks.position (fallback).
  const [taskUserPositions, setTaskUserPositions] = useState([]);
  // Orden custom de CLIENTES por usuario (vista Lista de tareas).
  // Filas {client_id, user_id, position}. Sin fila → fallback a clients.position.
  const [clientUserPositions, setClientUserPositions] = useState([]);
  // Lectura de comentarios por tarea (por usuario): taskId -> ISO de la última
  // vez que el usuario abrió los comentarios de esa tarea. Sirve para mostrar el
  // chip de comentarios como leído (gris) o no leído (azul). Solo localStorage.
  const [commentReads, setCommentReads] = useState({});

  const dbReady = useRef(false);
  const saveTimer = useRef(null);
  const lastPoll = useRef(0);
  // Foto del último estado sincronizado (id -> JSON) para escribir SOLO lo que cambió
  // en el guardado masivo y no pisar registros que cambiaron en la base por otro lado.
  const lastSyncedRef = useRef({ clients: {}, tasks: {} });
  const seededRef = useRef(false);
  const clientsRef = useRef(clients);
  const tasksRef = useRef(tasks);
  clientsRef.current = clients;
  tasksRef.current = tasks;
  // Id del usuario actual en un ref para usarlo dentro de callbacks memoizados
  // (dbSaveTask, dbSyncAll) sin recrearlos. Lo usan los triggers de la DB para
  // excluir auto-notificaciones (no notificarte por tu propia edición).
  const currentUserIdRef = useRef(null);
  currentUserIdRef.current = currentUser?.id || null;
  // Tareas escritas localmente hace poco (id -> timestamp). El poll NO las pisa
  // durante unos segundos, para evitar que un fetch viejo revierta un cambio
  // optimista (ej: agregar al sprint y que "se desagregue" un instante).
  const recentWriteRef = useRef(new Map());
  // Anti-bucle: último payload escrito por tarea (id -> {hash, ts}). Si llega un
  // guardado IDÉNTICO a la misma tarea en <4s lo coalescemos (no lo mandamos).
  // Un re-render en loop manda siempre el mismo payload → se corta solo; una
  // edición real cambia el payload (hash distinto) → sí se guarda.
  const lastTaskWriteRef = useRef(new Map());
  // Cola de reintento: tareas cuyo POST falló (id -> {payload, title, hash, attempts}).
  // Un loop con backoff las reintenta; guardamos SIEMPRE el último payload por id,
  // así un reintento nunca pisa una edición más nueva. El aviso (saveError) se
  // limpia solo cuando la cola queda vacía.
  const failedWritesRef = useRef(new Map());
  // El backfill de started_date al cargar corre UNA sola vez por sesión, para
  // que un re-login/re-entrada no re-dispare decenas de writes cada vez.
  const startedDateBackfilledRef = useRef(false);
  const teamMembersRef = useRef([]);
  teamMembersRef.current = teamMembers;
  // Refs de usuario/filtro actuales para leerlos dentro de callbacks memoizados
  // (updateTask) sin recrearlos ni sumarlos a sus deps.
  const currentUserRef = useRef(null);
  currentUserRef.current = currentUser;
  const taskAssigneeRef = useRef('all');
  taskAssigneeRef.current = taskAssignee;
  // Timer del aviso transitorio (flash) para poder reiniciarlo.
  const flashTimerRef = useRef(null);
  const taskCommentsRef = useRef([]);
  taskCommentsRef.current = taskComments;
  const bulletCommentsRef = useRef([]);
  bulletCommentsRef.current = bulletComments;
  const teamReportsRef = useRef([]);
  teamReportsRef.current = teamReports;
  // Ref para llamar recordTaskSystemEvents desde updateTask sin generar orden
  // de declaracion. Lo seteamos al final cuando la funcion ya existe.
  const recordTaskSystemEventsRef = useRef(null);
  // Refs para llamar addTaskComment y updateTask desde addTeamReport/updateTeamReport
  // sin disparar TDZ (estan declarados despues). Se setean al final del archivo.
  const addTaskCommentRef = useRef(null);
  const updateTaskRef = useRef(null);

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
        priority: c.priority, position: typeof c.position === 'number' ? c.position : 0, bottleneck: c.bottleneck, notes: c.notes,
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
        cash_collect: c.cashCollect ?? null,
        remaining_to_collect: c.remainingToCollect ?? null,
        call_recording_url: c.callRecordingUrl || null,
        payment_receipt_url: c.paymentReceiptUrl || null,
        commission_split: c.commissionSplit || {},
        client_type: c.clientType || null,
        drive_folder_url: c.driveFolderUrl || null,
      })
    });
  }, []);

  // Manda un POST de tarea detectando el error (throwOnError). En éxito marca el
  // write como confirmado y lo saca de la cola; en fallo guarda el payload MÁS
  // NUEVO por id para reintentar y muestra el aviso. No pasa por el coalescing
  // (recibe el payload ya resuelto) para que un reintento sí se reenvíe.
  const postTaskPayload = useCallback(async (id, payload, title, hash) => {
    try {
      await sbFetch('tasks', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' },
        body: JSON.stringify(payload),
        throwOnError: true,
      });
      const le = lastTaskWriteRef.current.get(id);
      if (le && le.hash === hash) le.state = 'ok';
      failedWritesRef.current.delete(id);
      if (failedWritesRef.current.size === 0) setSaveError(null);
      return true;
    } catch (err) {
      const prev = failedWritesRef.current.get(id);
      failedWritesRef.current.set(id, { payload, title: title || prev?.title || '', hash, attempts: prev?.attempts || 0 });
      const le = lastTaskWriteRef.current.get(id);
      if (le && le.hash === hash) le.state = 'failed';
      // Mantener vivo el guard optimista mientras reintentamos (que el poll no revierta).
      const rw = recentWriteRef.current.get(id);
      if (rw) rw.ts = Date.now();
      setSaveError({ count: failedWritesRef.current.size, title: title || prev?.title || '', paused: !!err?.paused });
      return false;
    }
  }, []);

  const dbSaveTask = useCallback(async (t) => {
    const payload = {
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
      sprint_id: t.sprintId || null,
      sprint_priority: t.sprintPriority != null ? t.sprintPriority : null,
      estimated_hours: t.estimatedHours != null ? t.estimatedHours : null,
      department: t.department || null,
      checklist: Array.isArray(t.checklist) ? t.checklist : [],
      definition_of_done: t.definitionOfDone || null,
      acceptance_criteria: Array.isArray(t.acceptanceCriteria) ? t.acceptanceCriteria : [],
      reviewer: t.reviewer || null,
      validated_by: t.validatedBy || null,
      validated_at: t.validatedAt || null,
      sprint_history: Array.isArray(t.sprintHistory) ? t.sprintHistory : [],
      sprint_events: Array.isArray(t.sprintEvents) ? t.sprintEvents : [],
      status_history: Array.isArray(t.statusHistory) ? t.statusHistory : [],
      last_actor_id: currentUserIdRef.current,
    };
    // Anti-bucle: si este MISMO payload ya se mandó para esta tarea hace <4s, lo
    // coalescemos (no reenviamos). Corta en seco cualquier re-render en loop sin
    // afectar ediciones reales (que cambian el payload → hash distinto).
    const hash = JSON.stringify(payload);
    const last = lastTaskWriteRef.current.get(t.id);
    // Coalescer SOLO si el mismo payload ya está en vuelo o se guardó OK hace <4s.
    // Si el último intento FALLÓ (state 'failed'), NO coalescemos: hay que reenviarlo
    // de verdad (antes esto tapaba el reintento y la tarea "se revertía sola").
    if (last && last.hash === hash && last.state !== 'failed' && Date.now() - last.ts < 4000) return;
    lastTaskWriteRef.current.set(t.id, { hash, ts: Date.now(), state: 'pending' });
    // Guardamos QUÉ escribimos (no solo cuándo): así el poll sabe distinguir un
    // remoto "viejo" (todavía no propagó nuestro cambio) de uno ya al día. Evita
    // el parpadeo "reaparece y vuelve a desaparecer" al completar/mover tareas.
    try {
      recentWriteRef.current.set(t.id, {
        ts: Date.now(),
        status: t.status,
        sprintId: t.sprintId || null,
        sprintPriority: t.sprintPriority != null ? Number(t.sprintPriority) : null,
        assignee: t.assignee,
        priority: t.priority,
        phase: t.phase || null,
        title: t.title,
        department: t.department || null,
      });
    } catch { /* ignore */ }
    return postTaskPayload(t.id, payload, t.title, hash);
  }, [postTaskPayload]);

  const dbSaveSprint = useCallback(async (s) => {
    if (!dbReady.current) return;
    return sbFetch('sprints', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify({
        id: s.id, number: s.number ?? null, name: s.name || null,
        start_date: s.startDate || null, end_date: s.endDate || null,
        goal: s.goal || null, status: s.status || 'active',
        monday_call_url: s.mondayCallUrl || null, friday_call_url: s.fridayCallUrl || null,
        conclusion: s.conclusion || null,
        worked_hours: s.workedHours && typeof s.workedHours === 'object' ? s.workedHours : {},
        daily_attendance: s.dailyAttendance && typeof s.dailyAttendance === 'object' ? s.dailyAttendance : {},
        close_screenshot_url: s.closeScreenshotUrl || null,
        summary: s.summary || null,
      }),
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
        priority: c.priority, position: typeof c.position === 'number' ? c.position : 0, bottleneck: c.bottleneck, notes: c.notes,
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
        sprint_id: t.sprintId || null,
        sprint_priority: t.sprintPriority != null ? t.sprintPriority : null,
        estimated_hours: t.estimatedHours != null ? t.estimatedHours : null,
        department: t.department || null,
        checklist: Array.isArray(t.checklist) ? t.checklist : [],
        definition_of_done: t.definitionOfDone || null,
        acceptance_criteria: Array.isArray(t.acceptanceCriteria) ? t.acceptanceCriteria : [],
        reviewer: t.reviewer || null,
        validated_by: t.validatedBy || null,
        validated_at: t.validatedAt || null,
        sprint_history: Array.isArray(t.sprintHistory) ? t.sprintHistory : [],
        sprint_events: Array.isArray(t.sprintEvents) ? t.sprintEvents : [],
        status_history: Array.isArray(t.statusHistory) ? t.statusHistory : [],
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
          // Primera corrida: tomamos foto del estado actual como "ya sincronizado"
          // (lo que cambi\u00f3 en esta edici\u00f3n ya se persisti\u00f3 con su dbSave puntual).
          if (!seededRef.current) {
            for (const client of c) lastSyncedRef.current.clients[client.id] = JSON.stringify(client);
            for (const task of t) lastSyncedRef.current.tasks[task.id] = JSON.stringify(task);
            seededRef.current = true;
            setSyncStatus('ok');
            return;
          }
          // Guardado masivo SELECTIVO: solo los registros que cambiaron desde la
          // \u00faltima sincronizaci\u00f3n. As\u00ed no pisamos clientes/tareas que toc\u00f3 otra
          // sesi\u00f3n o que se editaron directo en la base.
          const promises = [];
          for (const client of c) {
            const j = JSON.stringify(client);
            if (lastSyncedRef.current.clients[client.id] !== j) { promises.push(dbSaveClient(client)); lastSyncedRef.current.clients[client.id] = j; }
          }
          for (const task of t) {
            const j = JSON.stringify(task);
            if (lastSyncedRef.current.tasks[task.id] !== j) { promises.push(dbSaveTask(task)); lastSyncedRef.current.tasks[task.id] = j; }
          }
          await Promise.all(promises);
          setSyncStatus('ok');
        } catch (e) {
          console.warn('DB sync error:', e);
          setSyncStatus('error');
        }
      }, 1500);
    }
  }, [dbSaveClient, dbSaveTask]);

  // Limpiar el timer de guardado al desmontar para evitar un guardado fantasma
  // (setTimeout pendiente que dispara después de desmontar el provider).
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // Reintento con backoff de las escrituras de tarea que fallaron. Acotado (máx.
  // 6 intentos ≈ 60s, alineado con el guard del poll) y espaciado (cada 10s) para
  // NO generar un storm; durante la pausa del circuit-breaker sbFetch corta sin
  // tocar la red, así reintentar es barato. Usa SIEMPRE el payload más nuevo por id.
  const runRetryFailedSaves = useCallback(async (force = false) => {
    if (!dbReady.current || !failedWritesRef.current.size) return;
    const entries = [...failedWritesRef.current.entries()];
    for (const [id, e] of entries) {
      if (!force && (e.attempts || 0) >= 6) continue;
      e.attempts = (e.attempts || 0) + 1;
      await postTaskPayload(id, e.payload, e.title, e.hash);
    }
    setSaveError(failedWritesRef.current.size ? { count: failedWritesRef.current.size } : null);
  }, [postTaskPayload]);

  // Botón "Reintentar ahora": resetea el contador y fuerza una vuelta inmediata.
  const retryFailedSaves = useCallback(() => {
    failedWritesRef.current.forEach((e) => { e.attempts = 0; });
    runRetryFailedSaves(true);
  }, [runRetryFailedSaves]);

  useEffect(() => {
    const iv = setInterval(() => { runRetryFailedSaves(false); }, 10000);
    return () => clearInterval(iv);
  }, [runRetryFailedSaves]);

  // Aviso transitorio (info): se muestra unos segundos y se limpia solo.
  const flash = useCallback((message) => {
    if (!message) return;
    setFlashMessage({ message, ts: Date.now() });
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashMessage(null), 5000);
  }, []);
  useEffect(() => () => clearTimeout(flashTimerRef.current), []);

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

  // Recalcula position al arrastrar un cliente entre vecinos (similar a reorderNota).
  // prevPosition = position del cliente que queda DEBAJO (target). nextPosition = del que queda ARRIBA (above) o null.
  // newPriority opcional: si viene, se cambia la prioridad junto con la posicion.
  const reorderClient = useCallback(async (id, { prevPosition, nextPosition, newPriority } = {}) => {
    let newPos;
    if (typeof prevPosition === 'number' && typeof nextPosition === 'number') {
      newPos = (prevPosition + nextPosition) / 2;
    } else if (typeof prevPosition === 'number') {
      newPos = prevPosition - 0.5; // movido encima del primero de la seccion
    } else if (typeof nextPosition === 'number') {
      newPos = nextPosition + 0.5; // movido al final de la seccion
    } else {
      return; // nada que hacer
    }
    const patch = { position: newPos };
    if (typeof newPriority === 'number') patch.priority = newPriority;
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    save(clientsRef.current.map(c => c.id === id ? { ...c, ...patch } : c), tasksRef.current);
    if (dbReady.current) {
      try {
        await sbFetch('clients?id=eq.' + encodeURIComponent(id), {
          method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify(patch),
        });
      } catch (e) { console.warn('reorderClient persist', e); }
    }
  }, [save]);

  const updateClient = useCallback((id, updates) => {
    // Aplicamos el cambio al state local INMEDIATO (optimistic).
    let updated = null;
    setClients(prev => {
      const newClients = prev.map(c => c.id === id ? { ...c, ...updates } : c);
      save(newClients, tasksRef.current);
      updated = newClients.find(c => c.id === id);
      return newClients;
    });
    // Devolvemos la promesa de persistencia en Supabase para que quien llame
    // pueda hacer await y mostrar feedback (spinner / check / error). Además,
    // avisamos si el guardado no llegó a la base (dbSaveClient devuelve null),
    // para que un cambio de cliente no falle en silencio.
    if (updated && dbReady.current) {
      return dbSaveClient(updated).then(res => {
        if (res === null) flash('No se pudo guardar el cambio del cliente. Revisá tu conexión y volvé a intentar.');
        return res;
      });
    }
    return Promise.resolve();
  }, [save, dbSaveClient, flash]);

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
  const createTask = useCallback((title, clientId, assignee, priority, status, notes, stepIdx, phase) => {
    const t = mkTask(title, clientId, assignee, priority, status, notes, stepIdx);
    if (phase) t.phase = phase; // crear ya con su objetivo/fase (sin paso intermedio)
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
    // `updates` puede ser un OBJETO de cambios o una FUNCIÓN (task) => cambios.
    // La forma funcional se resuelve contra el estado MÁS NUEVO de la tarea DENTRO
    // de setTasks: así dos ediciones seguidas antes de re-renderizar (ej. agregar
    // varios ítems de checklist rápido) se acumulan y NO se pisan por un closure
    // viejo. IMPORTANTE: el updater debe ser PURO (React puede llamarlo más de una
    // vez) → precalculá ids/fechas afuera.
    const isFn = typeof updates === 'function';
    // Snapshot del estado previo para el historial automatico (system comments).
    const prevForHistory = tasksRef.current.find(t => t.id === id);
    // Resolución "de afuera": solo para los flags _skip* y el aviso de reasignación.
    const { _skipTimerRecalc, _skipRecomputeStarted, _skipHistory, ...cleanOuter } =
      isFn ? (updates(prevForHistory || {}) || {}) : updates;
    // Cuántas tareas dependientes se auto-promueven al marcar esta 'done' (para
    // avisar del cambio de estado "en cascada" y que no parezca que cambió solo).
    let promotedCount = 0;
    setTasks(prev => {
      // Resolución "de adentro": los cambios se calculan contra la tarea más nueva
      // de `prev` (no un closure viejo) → ediciones consecutivas se acumulan bien.
      const { _skipTimerRecalc: _si1, _skipRecomputeStarted: _si2, _skipHistory: _si3, ...cleanUpdates } =
        isFn ? (updates(prev.find(t => t.id === id) || {}) || {}) : updates;
      const mappedTasks = prev.map(t => {
        if (t.id !== id) return t;
        const merged = { ...t, ...cleanUpdates };
        // completedDate automático al pasar a done. startedDate lo gestiona recomputeStartedDates.
        if (cleanUpdates.status && cleanUpdates.status !== t.status && cleanUpdates.status === 'done') {
          merged.completedDate = today();
          merged.validatedBy = currentUserIdRef.current;   // auditoría: quién validó
          merged.validatedAt = new Date().toISOString();   // y cuándo
        }
        // Reabrir: si la tarea SALE de done, limpiamos el sello de validación.
        if (cleanUpdates.status && cleanUpdates.status !== 'done' && t.status === 'done') {
          merged.completedDate = null;
          merged.validatedBy = null;
          merged.validatedAt = null;
        }
        // Historial de sprints: dos registros al cambiar de sprint (incluye salir).
        //  · sprint_history (ids, append-if-absent) → alimenta el "lleva N sprints".
        //  · sprint_events (log con fecha `{sprint, at}`, incluye salir → sprint:null)
        //    → mide el tiempo real por sprint en el panel Actividad.
        if (cleanUpdates.sprintId !== undefined && cleanUpdates.sprintId !== t.sprintId) {
          if (cleanUpdates.sprintId) {
            const hist = Array.isArray(t.sprintHistory) ? t.sprintHistory : [];
            merged.sprintHistory = hist.includes(cleanUpdates.sprintId) ? hist : [...hist, cleanUpdates.sprintId];
          }
          const evs = Array.isArray(t.sprintEvents) ? t.sprintEvents : [];
          merged.sprintEvents = [...evs, { sprint: cleanUpdates.sprintId || null, at: new Date().toISOString() }];
        }
        // Historial de ESTADOS (append-only, desacoplado del feed de comentarios):
        // registra CUÁNDO entró a cada estado para que el panel "Tiempo por estado"
        // mida el tiempo real por etapa. Arranca a registrar desde el primer cambio
        // (las tareas viejas quedan sin historial hasta que se muevan).
        if (cleanUpdates.status && cleanUpdates.status !== t.status) {
          const sh = Array.isArray(t.statusHistory) ? t.statusHistory : [];
          merged.statusHistory = [...sh, { status: cleanUpdates.status, at: new Date().toISOString() }];
        }
        return merged;
      });
      // Historial: cuando la tarea cambia en uno de los campos relevantes, dejar
      // entradas system en task_comments. Se hace fire-and-forget via ref para
      // no introducir orden de definicion entre updateTask y addTaskComment.
      if (!_skipHistory && prevForHistory && recordTaskSystemEventsRef.current) {
        const after = mappedTasks.find(t => t.id === id);
        if (after) recordTaskSystemEventsRef.current(id, prevForHistory, after);
      }

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

      // Cascada de desbloqueo: si esta tarea pasó a 'done', las tareas del sprint
      // que dependían de ella y ya no tienen bloqueos pendientes saltan de
      // 'backlog' a 'priorizado' (la siguiente columna), listas para trabajarse.
      if (cleanUpdates.status === 'done') {
        const prevTasks = finalTasks;
        const promoted = [];
        const newTasks = prevTasks.map(t => {
          if (t.id === id) return t;
          if (!t.sprintId || t.status !== 'backlog') return t;
          if (!Array.isArray(t.dependsOn) || !t.dependsOn.includes(id)) return t;
          const stillBlocked = t.dependsOn.some(depId => {
            const dep = prevTasks.find(x => x.id === depId || x.templateId === depId);
            return dep && dep.status !== 'done';
          });
          if (stillBlocked) return t;
          const next = { ...t, status: 'priorizado' };
          promoted.push(next);
          return next;
        });
        if (promoted.length) {
          finalTasks = newTasks;
          promotedCount = promoted.length;
          if (dbReady.current) promoted.forEach(t => dbSaveTask(t));
        }
      }

      save(clientsRef.current, finalTasks);
      const updated = finalTasks.find(t => t.id === id);
      if (updated && dbReady.current) dbSaveTask(updated);
      return finalTasks;
    });
    // Feedback de cascada: avisar que al validar esta tarea se desbloquearon
    // otras (pasaron de backlog a priorizado). Así el cambio de estado de esas
    // tareas no se ve como que "cambió solo".
    if (promotedCount > 0) {
      flash(promotedCount === 1
        ? 'Se desbloqueó 1 tarea que dependía de esta (pasó a «Priorizado»).'
        : `Se desbloquearon ${promotedCount} tareas que dependían de esta (pasaron a «Priorizado»).`);
    }
    // Feedback "asigno y desaparece": si la reasignación saca la tarea de la
    // vista/filtro actual, avisamos que se MOVIÓ (no que desapareció). Solo se
    // dispara al cambiar el responsable; no toca la lógica del update.
    if (cleanOuter.assignee !== undefined && prevForHistory && !_skipHistory) {
      const merged = { ...prevForHistory, ...cleanOuter };
      const cu = currentUserRef.current;
      const restricted = !!cu && !cu.isAdmin;
      const stillMine = !restricted || userSeesTask(merged, cu, teamMembersRef.current);
      const stillInFilter = assigneeMatches(merged.assignee, taskAssigneeRef.current) || isReviewerOf(merged, taskAssigneeRef.current);
      if (!stillMine || !stillInFilter) {
        const who = (merged.assignee || '').trim();
        flash(who
          ? `«${merged.title}» quedó asignada a ${who} — fuera del filtro/vista actual.`
          : `«${merged.title}» quedó sin responsable — fuera de tu vista.`);
      }
    }
  }, [save, dbSaveTask, recalculateTimers, flash]);

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

  // ── Sprints (Kanban ágil) ───────────────────────────────────────────────────
  const activeSprint = useMemo(() => getActiveSprint(sprints), [sprints]);

  const mkSprintForMonday = useCallback((mondayStr, status = 'active') => sprintStubForMonday(mondayStr, status), []);

  // Refresca los sprints desde Supabase (lo usa el load inicial y el poll).
  const loadSprints = useCallback(async () => {
    if (!dbReady.current) return;
    try {
      const rows = await sbFetch('sprints?select=*&order=start_date.desc', { headers: { 'Prefer': 'return=representation' } });
      if (Array.isArray(rows)) {
        setSprints(rows.map(r => ({
          id: r.id, number: r.number, name: r.name,
          startDate: r.start_date, endDate: r.end_date,
          goal: r.goal, status: r.status,
          mondayCallUrl: r.monday_call_url || null, fridayCallUrl: r.friday_call_url || null,
          conclusion: r.conclusion || null,
          workedHours: r.worked_hours && typeof r.worked_hours === 'object' ? r.worked_hours : {},
          dailyAttendance: r.daily_attendance && typeof r.daily_attendance === 'object' ? r.daily_attendance : {},
          closeScreenshotUrl: r.close_screenshot_url || null,
          summary: r.summary || null,
        })));
      }
    } catch { /* silent */ }
  }, []);

  // Crea (o reusa) el sprint de la semana en curso y lo deja activo.
  const createSprint = useCallback((mondayStr) => {
    const monday = mondayStr || mondayOf(today());
    const existing = sprintsRef.current.find(s => s.startDate === monday);
    if (existing) {
      if (existing.status !== 'active') {
        const upd = { ...existing, status: 'active' };
        setSprints(prev => prev.map(s => s.id === existing.id ? upd : s));
        dbSaveSprint(upd);
      }
      return existing;
    }
    const sprint = mkSprintForMonday(monday);
    setSprints(prev => [sprint, ...prev]);
    dbSaveSprint(sprint);
    return sprint;
  }, [dbSaveSprint, mkSprintForMonday]);

  // Mantiene SIEMPRE abiertos los próximos `count` sprints (pre-abiertos como
  // 'planned') después del activo, para poder repartir tareas hacia adelante.
  // Idempotente por id: solo crea los que faltan (nunca re-escribe → sin
  // write-storm ni conflicto entre sesiones paralelas, porque dbSaveSprint hace
  // upsert por PK). No hace setState si no falta ninguno (evita loops).
  const ensureUpcomingSprints = useCallback((count = 2) => {
    if (!dbReady.current) return;
    const active = getActiveSprint(sprintsRef.current);
    if (!active) return;
    const faltan = upcomingSprintStubs(active, count)
      .filter(stub => !sprintsRef.current.some(s => s.id === stub.id));
    if (!faltan.length) return;
    setSprints(prev => {
      const have = new Set(prev.map(s => s.id));
      const toAdd = faltan.filter(s => !have.has(s.id));
      if (!toAdd.length) return prev;
      toAdd.forEach(s => dbSaveSprint(s));
      return [...toAdd, ...prev];
    });
  }, [dbSaveSprint]);

  // Dispara la apertura anticipada al cambiar el sprint activo: montaje inicial
  // (crea los 2 siguientes) y cierre de sprint (rellena hasta 2 adelante de nuevo).
  useEffect(() => {
    if (activeSprint?.id) ensureUpcomingSprints(2);
  }, [activeSprint?.id, ensureUpcomingSprints]);

  // Actualiza campos de un sprint (ej: goal, status).
  const updateSprint = useCallback((id, updates) => {
    setSprints(prev => {
      const next = prev.map(s => (s.id === id ? { ...s, ...updates } : s));
      const updated = next.find(s => s.id === id);
      if (updated) dbSaveSprint(updated);
      return next;
    });
  }, [dbSaveSprint]);

  // Mete una tarea al sprint activo (o al que se indique). Setea responsable,
  // prioridad y el estado de entrada (por defecto 'priorizado' si hay
  // responsable, 'backlog' si no). Reusa updateTask para persistir.
  const addTaskToSprint = useCallback((taskId, { sprintId, assignee, sprintPriority, status } = {}) => {
    const sid = sprintId || (getActiveSprint(sprintsRef.current)?.id);
    if (!sid) return;
    const updates = { sprintId: sid };
    if (assignee != null) updates.assignee = assignee;
    if (sprintPriority != null) updates.sprintPriority = sprintPriority;
    updates.status = status || (assignee ? 'priorizado' : 'backlog');
    updateTask(taskId, updates);
  }, [updateTask]);

  // Saca una tarea del sprint (vuelve a estar solo en Objetivos).
  const removeTaskFromSprint = useCallback((taskId) => {
    // Al salir del sprint, los estados de tablero (priorizado/en curso/en revisión)
    // ya no aplican: la tarea vuelve a "pendiente" (backlog) salvo que esté
    // terminada. Si no, quedaba con el puntito azul aunque ya no estuviera en el sprint.
    const t = tasksRef.current.find(x => x.id === taskId);
    const patch = { sprintId: null, sprintPriority: null };
    if (t && t.status !== 'done') patch.status = 'backlog';
    updateTask(taskId, patch);
  }, [updateTask]);

  // Mueve una tarea a OTRO sprint (relocación pura: no toca estado ni
  // responsable). La usa el selector de sprint de la ficha y la acción
  // "Mover al sprint actual" de un sprint cerrado. El "lleva N sprints" lo
  // gestiona updateTask al cambiar sprintId.
  const moveTaskToSprint = useCallback((taskId, sprintId) => {
    if (!sprintId) return;
    updateTask(taskId, { sprintId });
  }, [updateTask]);

  // Cierra el sprint activo: lo marca 'closed', crea el de la semana siguiente
  // y arrastra (carry-over) las tareas sin terminar al nuevo sprint. Las
  // validadas (done) quedan archivadas con el sprint cerrado.
  // Cierra el sprint activo. `extra` permite adjuntar campos (ej. conclusion).
  // Siempre guarda un snapshot del resumen (summary) para el historial.
  const closeSprint = useCallback((extra = {}) => {
    const active = getActiveSprint(sprintsRef.current);
    if (!active) return null;
    const summary = buildSprintSummary(tasksRef.current, teamMembersRef.current, active, teamReportsRef.current);
    const nextMonday = active.endDate ? addDaysStr(active.endDate, 1) : mondayOf(today());
    // Si el sprint de la semana siguiente ya está pre-abierto ('planned'), lo
    // ACTIVAMOS (no creamos un duplicado); si no existe, lo creamos activo.
    const existingNext = sprintsRef.current.find(s => s.startDate === nextMonday);
    const next = existingNext ? { ...existingNext, status: 'active' } : mkSprintForMonday(nextMonday);
    // 1) cerrar el sprint (con snapshot) + activar/crear el siguiente
    setSprints(prev => {
      const closed = { ...active, status: 'closed', summary, ...extra };
      const mapped = prev.map(s => (s.id === active.id ? closed : (s.id === next.id ? next : s)));
      const withNew = mapped.some(s => s.id === next.id) ? mapped : [next, ...mapped];
      dbSaveSprint(closed);
      dbSaveSprint(next);
      return withNew;
    });
    // 2) carry-over de tareas no terminadas
    const carry = tasksRef.current.filter(t => t.sprintId === active.id && t.status !== 'done');
    carry.forEach(t => updateTask(t.id, { sprintId: next.id, _skipHistory: true }));
    return next;
  }, [dbSaveSprint, mkSprintForMonday, updateTask]);

  // Finalizar sprint con la conclusión de la semana (botón de Rendimiento) y,
  // opcionalmente, la captura del estado de las tareas al cierre.
  const finalizeSprint = useCallback((conclusion, closeScreenshotUrl) => closeSprint({
    conclusion: conclusion || null,
    closeScreenshotUrl: closeScreenshotUrl || null,
  }), [closeSprint]);

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
        body: JSON.stringify({ value: merged, updated_at: new Date().toISOString() }),
        throwOnError: true,
      }).catch(e => { console.warn('updateAppSettings error', e); flash('No se pudo guardar la configuración. Revisá tu conexión y volvé a guardar.'); });
      return merged;
    });
  }, [flash]);

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
    if (fields.weekly_capacity !== undefined || fields.weeklyCapacity !== undefined) {
      dbFields.weekly_capacity = fields.weekly_capacity ?? fields.weeklyCapacity;
    }
    if (fields.slack_id !== undefined || fields.slackId !== undefined) {
      dbFields.slack_id = fields.slack_id ?? fields.slackId;
    }
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
      progress_by_client: enrichBulletsWithMentions(
        ensureBulletIds(data.progress_by_client || []),
        teamMembersRef.current || [],
        data.user_id,
      ),
      weekly_data: data.weekly_data || {},
    };
    await sbFetch('team_reports', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(row),
      throwOnError: true,
    });
    setTeamReports(prev => [{ ...row, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...prev]);

    // Side-effects: bullets vinculados a tareas. Por cada bullet con task_id:
    // - inserta comment kind='report' con el texto del bullet.
    // - completa la tarea SOLO si el usuario marcó complete_task (una tarea puede
    //   tener muchos entregables; no se cierra sola al primer entregable).
    try {
      const linkedBullets = diffBulletsByTaskLink([], row.progress_by_client);
      for (const b of linkedBullets) {
        if (addTaskCommentRef.current) {
          addTaskCommentRef.current({
            task_id: b.task_id,
            author_id: data.user_id,
            body: b.text || '',
            kind: 'report',
            event_meta: { report_id: id, bullet_id: b.id, category: b.category || null },
          }).catch(e => console.warn('addTeamReport linked bullet', e));
        }
      }
      for (const b of bulletsToComplete([], row.progress_by_client)) {
        if (updateTaskRef.current) updateTaskRef.current(b.task_id, { status: 'done' });
      }
    } catch (e) { console.warn('addTeamReport task links', e); }

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

    // Enviar a Slack: lo cargado de cada cliente va a su canal específico, con
    // las capturas adjuntas. Fire-and-forget: no bloquea ni rompe el guardado.
    try {
      supabase.functions.invoke('informe-slack', { body: { report_id: id } })
        .catch(e => console.warn('informe-slack', e));
    } catch (e) { console.warn('informe-slack invoke', e); }

    return row;
  }, []);

  const updateTeamReport = useCallback(async (id, fields) => {
    const patch = { ...fields };
    const before = (teamReportsRef.current || []).find(r => r.id === id);
    const author = before?.user_id;
    if (patch.progress_by_client) {
      patch.progress_by_client = enrichBulletsWithMentions(
        ensureBulletIds(patch.progress_by_client),
        teamMembersRef.current || [],
        author,
      );
    }
    await sbFetch('team_reports?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(patch),
      throwOnError: true,
    });
    setTeamReports(prev => prev.map(r => r.id === id ? { ...r, ...patch, updated_at: new Date().toISOString() } : r));

    // Side-effects: solo procesar bullets nuevos o con task_id distinto al
    // anterior, para no duplicar al editar el informe.
    if (patch.progress_by_client && author) {
      try {
        const linkedBullets = diffBulletsByTaskLink(before?.progress_by_client || [], patch.progress_by_client);
        for (const b of linkedBullets) {
          if (addTaskCommentRef.current) {
            addTaskCommentRef.current({
              task_id: b.task_id,
              author_id: author,
              body: b.text || '',
              kind: 'report',
              event_meta: { report_id: id, bullet_id: b.id, category: b.category || null },
            }).catch(e => console.warn('updateTeamReport linked bullet', e));
          }
        }
        // Completar tareas solo donde el usuario lo pidió explícitamente.
        for (const b of bulletsToComplete(before?.progress_by_client || [], patch.progress_by_client)) {
          if (updateTaskRef.current) updateTaskRef.current(b.task_id, { status: 'done' });
        }
      } catch (e) { console.warn('updateTeamReport task links', e); }

      // Slack: al editar solo mandamos los bullets NUEVOS (no repetir lo ya enviado).
      try {
        const beforeIds = new Set();
        (before?.progress_by_client || []).forEach(blk => (blk?.bullets || []).forEach(b => { if (b?.id) beforeIds.add(b.id); }));
        const newIds = [];
        (patch.progress_by_client || []).forEach(blk => (blk?.bullets || []).forEach(b => { if (b?.id && !beforeIds.has(b.id)) newIds.push(b.id); }));
        if (newIds.length) {
          supabase.functions.invoke('informe-slack', { body: { report_id: id, only_bullet_ids: newIds } })
            .catch(e => console.warn('informe-slack', e));
        }
      } catch (e) { console.warn('informe-slack update', e); }
    }
  }, []);

  const deleteTeamReport = useCallback(async (id) => {
    // Borrar los comentarios de tareas generados por este informe (kind='report'
    // con event_meta.report_id = id). Sus respuestas se borran por cascade en DB
    // (parent_id ON DELETE CASCADE). Así, al eliminar un informe se va también el
    // avance/entregable que ese informe dejó en cada tarea.
    try {
      await sbFetch('task_comments?kind=eq.report&event_meta->>report_id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    } catch (e) { console.warn('deleteTeamReport report-comments', e); }

    await sbFetch('team_reports?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    setTeamReports(prev => prev.filter(r => r.id !== id));
    // Los bloqueos vinculados se borran por CASCADE en DB; reflejamos local
    setTeamBlockers(prev => prev.filter(b => b.report_id !== id));
    // Reflejar local: quitar los comentarios del informe + sus respuestas.
    setTaskComments(prev => {
      const reportCommentIds = new Set(
        prev.filter(c => c.kind === 'report' && c.event_meta?.report_id === id).map(c => c.id),
      );
      if (reportCommentIds.size === 0) return prev;
      return prev.filter(c => !reportCommentIds.has(c.id) && !reportCommentIds.has(c.parent_id));
    });
  }, []);

  const resolveBlocker = useCallback(async (blockerId) => {
    const now = new Date().toISOString();
    const resolvedBy = currentUser?.id || null;
    setTeamBlockers(prev => prev.map(b => b.id === blockerId
      ? { ...b, resolved: true, resolved_at: now, resolved_by: resolvedBy }
      : b));
    try {
      await sbFetch('team_blockers?id=eq.' + encodeURIComponent(blockerId), {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ resolved: true, resolved_at: now, resolved_by: resolvedBy }),
        throwOnError: true,
      });
    } catch { flash('No se pudo marcar el bloqueo como resuelto. Volvé a intentar.'); }
  }, [currentUser, flash]);

  const unresolveBlocker = useCallback(async (blockerId) => {
    setTeamBlockers(prev => prev.map(b => b.id === blockerId
      ? { ...b, resolved: false, resolved_at: null, resolved_by: null }
      : b));
    try {
      await sbFetch('team_blockers?id=eq.' + encodeURIComponent(blockerId), {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ resolved: false, resolved_at: null, resolved_by: null }),
        throwOnError: true,
      });
    } catch { flash('No se pudo reabrir el bloqueo. Volvé a intentar.'); }
  }, [flash]);

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
    const nowIso = new Date().toISOString();
    setIdeas(prev => [{ ...row, created_at: nowIso, updated_at: nowIso }, ...prev]);
    try {
      await sbFetch('ideas', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify(row),
        throwOnError: true,
      });
    } catch { flash('No se pudo guardar la idea. Revisá tu conexión y volvé a intentar.'); }
    return row;
  }, [flash]);

  const updateIdea = useCallback(async (id, fields) => {
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, ...fields, updated_at: new Date().toISOString() } : i));
    try {
      await sbFetch('ideas?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify(fields),
        throwOnError: true,
      });
    } catch { flash('No se pudo guardar el cambio en la idea. Volvé a intentar.'); }
  }, [flash]);

  const deleteIdea = useCallback(async (id) => {
    setIdeas(prev => prev.filter(i => i.id !== id));
    try {
      await sbFetch('ideas?id=eq.' + encodeURIComponent(id), { method: 'DELETE', throwOnError: true });
    } catch { flash('No se pudo borrar la idea. Volvé a intentar.'); }
  }, [flash]);

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
      folders: Array.isArray(data.folders) ? data.folders : [],
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
    // Optimista primero (pin/desfijar y demás cambios se ven al instante).
    setStrategies(prev => prev.map(s => s.id === id
      ? { ...s, ...patch, updated_at: new Date().toISOString() }
      : s));
    await sbFetch('strategies?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(patch),
      throwOnError: true,
    });
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
      status: data.status || 'activa',
      ads_url: data.ads_url || null,
      conversion_events: Array.isArray(data.conversion_events) ? data.conversion_events : [],
      pixel_id: data.pixel_id || null,
      pixel_code: data.pixel_code || null,
      clarity_id: data.clarity_id || null,
      avatars: Array.isArray(data.avatars) ? data.avatars : [],
      visual_resources: Array.isArray(data.visual_resources) ? data.visual_resources : [],
      updated_at: new Date().toISOString(),
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
    const patch = { ...fields, updated_at: new Date().toISOString() };
    // Optimista PRIMERO: la pantalla refleja el cambio al instante (evita que se
    // "desordene" lo que se escribe mientras espera la respuesta de la red).
    setStrategyPages(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    await sbFetch('strategy_pages?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(patch),
      throwOnError: true,
    });
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

  // Vincular un contrato de DocuSign a un cliente a mano (desde la bandeja).
  // clientId = null para desvincular.
  const linkContract = useCallback(async (contractId, clientId) => {
    const patch = { client_id: clientId, match_method: clientId ? 'manual' : 'none' };
    await sbFetch('contracts?id=eq.' + encodeURIComponent(contractId), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(patch),
      throwOnError: true,
    });
    setContracts(prev => prev.map(c => c.id === contractId ? { ...c, ...patch } : c));
  }, []);

  // Alta de un contrato MANUAL (PDF de Drive u otra plataforma) en la ficha del cliente.
  const addContract = useCallback(async (clientId, fields) => {
    const id = `ctr_man_${Math.floor(Date.now() / 1000)}_${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    const row = {
      id, client_id: clientId, source: 'manual', envelope_id: null,
      title: fields.title || 'Contrato',
      pdf_url: fields.pdf_url || null,
      status: fields.status || 'vigente',
      signed_date: fields.signed_date || null,
      renewal_date: fields.renewal_date || null,
      created_at: nowIso, updated_at: nowIso,
    };
    await sbFetch('contracts', {
      method: 'POST', headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(row), throwOnError: true,
    });
    setContracts(prev => [row, ...prev]);
    return id;
  }, []);

  // Editar un contrato manual (título, PDF, estado, fechas).
  const updateContract = useCallback(async (contractId, fields) => {
    const patch = { ...fields, updated_at: new Date().toISOString() };
    await sbFetch('contracts?id=eq.' + encodeURIComponent(contractId), {
      method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(patch), throwOnError: true,
    });
    setContracts(prev => prev.map(c => c.id === contractId ? { ...c, ...patch } : c));
  }, []);

  // Borrar un contrato (manual). Los de DocuSign no se borran desde acá.
  const deleteContract = useCallback(async (contractId) => {
    await sbFetch('contracts?id=eq.' + encodeURIComponent(contractId), { method: 'DELETE' });
    setContracts(prev => prev.filter(c => c.id !== contractId));
  }, []);

  // ── CRUD: task_comments ──
  // Comentarios en tareas. Hilos de 1 nivel: parent_id NULL = raiz; si tiene
  // valor referencia al comentario padre. Cascade en DB borra hijos al borrar
  // padre y borra todo al borrar la tarea.
  const addTaskComment = useCallback(async (data) => {
    const id = 'tc_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).slice(2, 8);
    const body = String(data.body || '').trim();
    const kind = data.kind || 'user';
    // Solo extraemos menciones para comentarios de usuario; en system/report no
    // queremos notificar por @ ni interpretar texto crudo.
    const mentioned_ids = kind === 'user'
      ? extractMentions(body, teamMembersRef.current || [], { excludeId: data.author_id })
      : [];
    const row = {
      id,
      task_id: data.task_id,
      parent_id: data.parent_id || null,
      author_id: data.author_id,
      body,
      edited: false,
      mentioned_ids,
      kind,
      event_meta: data.event_meta || null,
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

  // ── Helpers: historial automatico de tareas ──
  // DESACTIVADO (pedido de Matias, 2026-06): el feed de comentarios queda SOLO
  // para comentarios de personas (e informes). Los "mínimos cambios" de la tarea
  // (estado/responsable/fase/fecha) ya no se registran como entradas kind='system'
  // ni notifican. Se deja como no-op para no tocar el call site de updateTask y
  // poder reactivarlo fácil si hiciera falta.
  const recordTaskSystemEvents = useCallback(() => {}, []);
  recordTaskSystemEventsRef.current = recordTaskSystemEvents;
  addTaskCommentRef.current = addTaskComment;
  updateTaskRef.current = updateTask;

  const updateTaskComment = useCallback(async (id, fields) => {
    const patch = { ...fields };
    if (patch.body !== undefined) {
      patch.body = String(patch.body).trim();
      const author = (taskCommentsRef.current || []).find(c => c.id === id)?.author_id;
      patch.mentioned_ids = extractMentions(patch.body, teamMembersRef.current || [], { excludeId: author });
    }
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
    const body = String(data.body || '').trim();
    const mentioned_ids = extractMentions(body, teamMembersRef.current || [], { excludeId: data.author_id });
    const row = {
      id,
      report_id: data.report_id,
      bullet_id: data.bullet_id,
      parent_id: data.parent_id || null,
      author_id: data.author_id,
      body,
      edited: false,
      mentioned_ids,
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
    if (patch.body !== undefined) {
      patch.body = String(patch.body).trim();
      const author = (bulletCommentsRef.current || []).find(c => c.id === id)?.author_id;
      patch.mentioned_ids = extractMentions(patch.body, teamMembersRef.current || [], { excludeId: author });
    }
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

  // ── CRUD: idea_comments y blocker_comments ──
  // Mismo patron que task_comments, apuntando a ideas o team_blockers.
  const ideaCommentsRef = useRef([]);
  ideaCommentsRef.current = ideaComments;
  const blockerCommentsRef = useRef([]);
  blockerCommentsRef.current = blockerComments;

  const addIdeaComment = useCallback(async (data) => {
    const id = 'ic_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).slice(2, 8);
    const body = String(data.body || '').trim();
    const mentioned_ids = extractMentions(body, teamMembersRef.current || [], { excludeId: data.author_id });
    const row = {
      id,
      idea_id: data.idea_id,
      parent_id: data.parent_id || null,
      author_id: data.author_id,
      body,
      edited: false,
      mentioned_ids,
    };
    await sbFetch('idea_comments', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify(row), throwOnError: true });
    const nowIso = new Date().toISOString();
    setIdeaComments(prev => [...prev, { ...row, created_at: nowIso, updated_at: nowIso }]);
    return id;
  }, []);

  const updateIdeaComment = useCallback(async (id, fields) => {
    const patch = { ...fields };
    if (patch.body !== undefined) {
      patch.body = String(patch.body).trim();
      const author = (ideaCommentsRef.current || []).find(c => c.id === id)?.author_id;
      patch.mentioned_ids = extractMentions(patch.body, teamMembersRef.current || [], { excludeId: author });
    }
    patch.edited = true;
    await sbFetch('idea_comments?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify(patch), throwOnError: true });
    setIdeaComments(prev => prev.map(c => c.id === id ? { ...c, ...patch, updated_at: new Date().toISOString() } : c));
  }, []);

  const deleteIdeaComment = useCallback(async (id) => {
    await sbFetch('idea_comments?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    setIdeaComments(prev => prev.filter(c => c.id !== id && c.parent_id !== id));
  }, []);

  const addBlockerComment = useCallback(async (data) => {
    const id = 'blkc_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).slice(2, 8);
    const body = String(data.body || '').trim();
    const mentioned_ids = extractMentions(body, teamMembersRef.current || [], { excludeId: data.author_id });
    const row = {
      id,
      blocker_id: data.blocker_id,
      parent_id: data.parent_id || null,
      author_id: data.author_id,
      body,
      edited: false,
      mentioned_ids,
    };
    await sbFetch('blocker_comments', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify(row), throwOnError: true });
    const nowIso = new Date().toISOString();
    setBlockerComments(prev => [...prev, { ...row, created_at: nowIso, updated_at: nowIso }]);
    return id;
  }, []);

  const updateBlockerComment = useCallback(async (id, fields) => {
    const patch = { ...fields };
    if (patch.body !== undefined) {
      patch.body = String(patch.body).trim();
      const author = (blockerCommentsRef.current || []).find(c => c.id === id)?.author_id;
      patch.mentioned_ids = extractMentions(patch.body, teamMembersRef.current || [], { excludeId: author });
    }
    patch.edited = true;
    await sbFetch('blocker_comments?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify(patch), throwOnError: true });
    setBlockerComments(prev => prev.map(c => c.id === id ? { ...c, ...patch, updated_at: new Date().toISOString() } : c));
  }, []);

  const deleteBlockerComment = useCallback(async (id) => {
    await sbFetch('blocker_comments?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    setBlockerComments(prev => prev.filter(c => c.id !== id && c.parent_id !== id));
  }, []);

  // ── Orden custom de tareas por usuario ──
  // Recalcula la position entre vecinos y upsertea en task_user_positions.
  // prevPosition = del que queda DEBAJO, nextPosition = del que queda ARRIBA.
  const reorderTaskForUser = useCallback(async (taskId, userId, { prevPosition, nextPosition } = {}) => {
    if (!taskId || !userId) return;
    let newPos;
    if (typeof prevPosition === 'number' && typeof nextPosition === 'number') {
      newPos = (prevPosition + nextPosition) / 2;
    } else if (typeof prevPosition === 'number') {
      newPos = prevPosition - 0.5;
    } else if (typeof nextPosition === 'number') {
      newPos = nextPosition + 0.5;
    } else {
      return;
    }
    const row = { task_id: taskId, user_id: userId, position: newPos };
    setTaskUserPositions(prev => {
      const exists = prev.find(r => r.task_id === taskId && r.user_id === userId);
      if (exists) return prev.map(r => r.task_id === taskId && r.user_id === userId ? { ...r, position: newPos } : r);
      return [...prev, { ...row, updated_at: new Date().toISOString() }];
    });
    try {
      await sbFetch('task_user_positions', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' },
        body: JSON.stringify(row),
      });
    } catch (e) { console.warn('reorderTaskForUser persist', e); }
  }, []);

  // ── Orden custom de CLIENTES por usuario (vista Lista de tareas) ──
  const reorderClientForUser = useCallback(async (clientId, userId, { prevPosition, nextPosition } = {}) => {
    if (!clientId || !userId) return;
    let newPos;
    if (typeof prevPosition === 'number' && typeof nextPosition === 'number') {
      newPos = (prevPosition + nextPosition) / 2;
    } else if (typeof prevPosition === 'number') {
      newPos = prevPosition - 0.5;
    } else if (typeof nextPosition === 'number') {
      newPos = nextPosition + 0.5;
    } else {
      return;
    }
    const row = { client_id: clientId, user_id: userId, position: newPos };
    setClientUserPositions(prev => {
      const exists = prev.find(r => r.client_id === clientId && r.user_id === userId);
      if (exists) return prev.map(r => r.client_id === clientId && r.user_id === userId ? { ...r, position: newPos } : r);
      return [...prev, { ...row, updated_at: new Date().toISOString() }];
    });
    try {
      await sbFetch('client_user_positions', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' },
        body: JSON.stringify(row),
      });
    } catch (e) { console.warn('reorderClientForUser persist', e); }
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
    try {
      await sbFetch('notas?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ position: newPos }),
        throwOnError: true,
      });
    } catch { flash('No se pudo guardar el nuevo orden de las notas. Volvé a intentar.'); }
  }, [flash]);

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
    setNotas(prev => prev.filter(n => n.id !== id));
    try {
      await sbFetch('notas?id=eq.' + encodeURIComponent(id), { method: 'DELETE', throwOnError: true });
    } catch { flash('No se pudo borrar la nota. Volvé a intentar.'); }
  }, [flash]);

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

  // Reporte accionable de reunión de equipo (edge function reunion-reporte).
  const prepareReunionReporte = useCallback(async (llamadaId) => {
    const { data, error } = await supabase.functions.invoke('reunion-reporte', {
      body: { action: 'prepare', llamada_id: llamadaId },
    });
    if (error) throw new Error(error.message || 'No se pudo preparar el reporte');
    if (data?.error) throw new Error(data.error);
    const payload = data.payload;
    setLlamadas(prev => prev.map(l => l.id === llamadaId ? { ...l, reporte_payload: payload, reporte_status: 'draft' } : l));
    return payload;
  }, []);

  const sendReunionReporte = useCallback(async (llamadaId) => {
    const { data, error } = await supabase.functions.invoke('reunion-reporte', {
      body: { action: 'send', llamada_id: llamadaId },
    });
    if (error) throw new Error(error.message || 'No se pudo enviar el reporte');
    if (data?.error) throw new Error(data.error);
    setLlamadas(prev => prev.map(l => l.id === llamadaId ? { ...l, reporte_status: 'sent', reporte_sent_at: new Date().toISOString() } : l));
    return data;
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
      const CLIENT_COLS = 'id,name,company,service,start_date,pm,color,status,priority,position,bottleneck,notes,steps,feedback,history,phone,avatar_url,slack_channel,slack_channel_id,meta_ads,custom_steps,custom_phases,client_feedbacks,step_name_overrides,phase_name_overrides,phase_deadlines,links,pending_resources,meta_metrics,billing_amount,billing_currency,billing_cycle,billing_installments,next_charge_date,payment_method,billing_status,visual_resources,niche,email,country,timezone,contract_url,contract_signed_date,contract_renewal_date,tier,conector,closer,contract_data,cash_collect,remaining_to_collect,call_recording_url,payment_receipt_url,commission_split,client_type,drive_folder_url,contract_signer_email,korex_code';
      const TASK_COLS = 'id,title,client_id,assignee,priority,status,notes,description,step_idx,created_date,started_date,completed_date,blocked_since,phase,depends_on,is_roadmap_task,template_id,estimated_days,is_client_task,days_from_unblock,due_date,accumulated_days,timer_started_at,enabled_date,position,sprint_id,sprint_priority,estimated_hours,department,checklist,definition_of_done,acceptance_criteria,reviewer,validated_by,validated_at,sprint_history,sprint_events,status_history';
      const [sbClients, sbTasks, briefings, feedbacks, proposals, alerts, sbSettings, sbTeam, sbSprints] = await Promise.all([
        sbFetch(`clients?select=${CLIENT_COLS}&order=position.asc`, { headers: { 'Prefer': 'return=representation' } }),
        // order=created_at.DESC: si algún día se supera el límite, se descartan
        // las MÁS VIEJAS (probablemente done/archivadas) y nunca las recién
        // creadas. Con asc + límite, una tarea nueva podía "desaparecer" al
        // recargar una vez pasado el tope. Límite amplio para no recortar.
        sbFetch(`tasks?select=${TASK_COLS}&order=created_at.desc&limit=10000`, { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('briefings?id=eq.latest&select=*', { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('report_feedback?select=*&order=created_at.desc&limit=20', { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('task_proposals?select=*&order=created_at.desc&limit=50', { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('dashboard_alerts?select=*&dismissed=eq.false&order=days_old.desc&limit=100', { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('app_settings?key=eq.global&select=*', { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('team_members?select=*&order=position.asc', { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('sprints?select=*&order=start_date.desc', { headers: { 'Prefer': 'return=representation' } }),
      ]);

      if (Array.isArray(sbSprints)) {
        setSprints(sbSprints.map(r => ({
          id: r.id, number: r.number, name: r.name,
          startDate: r.start_date, endDate: r.end_date,
          goal: r.goal, status: r.status,
          mondayCallUrl: r.monday_call_url || null, fridayCallUrl: r.friday_call_url || null,
          conclusion: r.conclusion || null,
          workedHours: r.worked_hours && typeof r.worked_hours === 'object' ? r.worked_hours : {},
          dailyAttendance: r.daily_attendance && typeof r.daily_attendance === 'object' ? r.daily_attendance : {},
          closeScreenshotUrl: r.close_screenshot_url || null,
          summary: r.summary || null,
        })));
      }

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
      } catch { /* silent */ }

      // Cargar llamadas procesadas
      try {
        const calls = await sbFetch('llamadas?select=*&order=fecha.desc.nullslast&limit=300', { headers: { 'Prefer': 'return=representation' } }).then(r => Array.isArray(r) ? r.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0)) : r);
        if (calls && Array.isArray(calls)) setLlamadas(calls);
      } catch { /* silent */ }

      // Contar llamadas pendientes de procesar
      try {
        const pending = await sbFetch('llamadas_inbox?processed=eq.false&select=id', { headers: { 'Prefer': 'return=representation' } });
        if (pending && Array.isArray(pending)) setPendingCallsCount(pending.length);
      } catch { /* silent */ }

      // Informes del equipo (últimos 60 días)
      try {
        const sinceDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const reports = await sbFetch(
          'team_reports?select=*&order=report_date.desc&report_date=gte.' + sinceDate,
          { headers: { 'Prefer': 'return=representation' } }
        );
        if (reports && Array.isArray(reports)) setTeamReports(reports);
      } catch { /* silent */ }

      // Bloqueos: todos los abiertos + últimos 30 días resueltos
      try {
        const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const blockers = await sbFetch(
          'team_blockers?select=*&order=created_at.desc&or=(resolved.eq.false,resolved_at.gte.' + sinceDate + ')',
          { headers: { 'Prefer': 'return=representation' } }
        );
        if (blockers && Array.isArray(blockers)) setTeamBlockers(blockers);
      } catch { /* silent */ }

      // Cajón de ideas
      try {
        const allIdeas = await sbFetch('ideas?select=*&order=created_at.desc&limit=200', { headers: { 'Prefer': 'return=representation' } });
        if (allIdeas && Array.isArray(allIdeas)) setIdeas(allIdeas);
      } catch { /* silent */ }

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

      // Comentarios sobre ideas y bloqueos
      try {
        const allIdeaComments = await sbFetch('idea_comments?select=*&order=created_at.asc&limit=2000', { headers: { 'Prefer': 'return=representation' } });
        if (allIdeaComments && Array.isArray(allIdeaComments)) setIdeaComments(allIdeaComments);
      } catch (e) { console.warn('loadIdeaComments error', e); }

      // Orden custom de tareas/clientes por usuario. SOLO lo consume la vista
      // Lista/TasksPage del layout LEGACY. En el layout 'sprint' (producción)
      // nadie lo usa → nos ahorramos 2 fetches (hasta 5000 filas c/u) en CADA
      // carga. Si se vuelve al layout legacy, se cargan de nuevo.
      if (TAREAS_LAYOUT !== 'sprint') {
        try {
          const tup = await sbFetch('task_user_positions?select=*&limit=5000', { headers: { 'Prefer': 'return=representation' } });
          if (tup && Array.isArray(tup)) setTaskUserPositions(tup);
        } catch (e) { console.warn('loadTaskUserPositions error', e); }
        try {
          const cup = await sbFetch('client_user_positions?select=*&limit=5000', { headers: { 'Prefer': 'return=representation' } });
          if (cup && Array.isArray(cup)) setClientUserPositions(cup);
        } catch (e) { console.warn('loadClientUserPositions error', e); }
      }
      try {
        const allBlockerComments = await sbFetch('blocker_comments?select=*&order=created_at.asc&limit=2000', { headers: { 'Prefer': 'return=representation' } });
        if (allBlockerComments && Array.isArray(allBlockerComments)) setBlockerComments(allBlockerComments);
      } catch (e) { console.warn('loadBlockerComments error', e); }

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

      // Contratos de DocuSign (vinculados o sin vincular) por cliente.
      try {
        const allContracts = await sbFetch('contracts?select=*&order=updated_at.desc&limit=2000', { headers: { 'Prefer': 'return=representation' } });
        if (allContracts && Array.isArray(allContracts)) setContracts(allContracts);
      } catch (e) { console.warn('loadContracts error', e); }

      if (sbClients && sbClients.length > 0) {
        const mappedClients = sbClients.map(c => ({
          id: c.id, name: c.name, company: c.company, service: c.service,
          startDate: c.start_date, pm: c.pm, color: c.color, status: c.status,
          priority: normalizePriority(c.priority),
          position: typeof c.position === 'number' ? c.position : (Number(c.position) || 0),
          bottleneck: c.bottleneck, notes: c.notes,
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
          contractSignerEmail: c.contract_signer_email || '',
          korexCode: c.korex_code || '',
          tier: c.tier || null,
          conector: c.conector || '',
          closer: c.closer || '',
          contractData: c.contract_data || '',
          cashCollect: c.cash_collect != null ? Number(c.cash_collect) : null,
          remainingToCollect: c.remaining_to_collect != null ? Number(c.remaining_to_collect) : null,
          callRecordingUrl: c.call_recording_url || '',
          paymentReceiptUrl: c.payment_receipt_url || '',
          commissionSplit: c.commission_split || {},
          clientType: c.client_type || null,
          driveFolderUrl: c.drive_folder_url || '',
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
          position: t.position ?? 0,
          sprintId: t.sprint_id || null,
          sprintPriority: t.sprint_priority != null ? Number(t.sprint_priority) : null,
          estimatedHours: t.estimated_hours != null ? Number(t.estimated_hours) : null,
          department: t.department || null,
          checklist: Array.isArray(t.checklist) ? t.checklist : [],
          definitionOfDone: t.definition_of_done || '',
          acceptanceCriteria: Array.isArray(t.acceptance_criteria) ? t.acceptance_criteria : [],
          reviewer: t.reviewer || null,
          validatedBy: t.validated_by || null,
          validatedAt: t.validated_at || null,
          sprintHistory: Array.isArray(t.sprint_history) ? t.sprint_history : [],
          sprintEvents: Array.isArray(t.sprint_events) ? t.sprint_events : [],
          statusHistory: Array.isArray(t.status_history) ? t.status_history : [],
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

        // Persistir en Supabase las tareas que cambiaron por el backfill.
        // Corre UNA sola vez por sesión (anti-bucle ante re-login/re-entradas).
        if (!startedDateBackfilledRef.current) {
          startedDateBackfilledRef.current = true;
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
        }
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

      // Check tasks. Traemos TODAS las columnas (no solo un subset) para que las
      // tareas nuevas detectadas por el poll lleguen completas (con phase,
      // depends_on, due_date, etc.). Si solo trajéramos un subset, una tarea
      // nueva se agregaría sin fase y caería en "Sin fase" en el roadmap.
      const POLL_TASK_COLS = 'id,title,client_id,assignee,priority,status,notes,description,step_idx,created_date,started_date,completed_date,blocked_since,phase,depends_on,is_roadmap_task,template_id,estimated_days,is_client_task,days_from_unblock,due_date,accumulated_days,timer_started_at,enabled_date,position,sprint_id,sprint_priority,estimated_hours,department,checklist,definition_of_done,acceptance_criteria,reviewer,validated_by,validated_at,sprint_history,sprint_events,status_history,updated_at';
      const remoteTasks = await sbFetch('tasks?select=' + POLL_TASK_COLS + '&order=updated_at.desc&limit=50', { headers: { 'Prefer': 'return=representation' } });
      // Refrescar sprints en el mismo poll (livianito: lista corta).
      loadSprints();
      if (!remoteTasks || !remoteTasks.length) return;

      const mapPollTask = (t) => ({
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
        position: t.position ?? 0,
        sprintId: t.sprint_id || null,
        sprintPriority: t.sprint_priority != null ? Number(t.sprint_priority) : null,
        estimatedHours: t.estimated_hours != null ? Number(t.estimated_hours) : null,
        department: t.department || null,
        checklist: Array.isArray(t.checklist) ? t.checklist : [],
        definitionOfDone: t.definition_of_done || '',
        acceptanceCriteria: Array.isArray(t.acceptance_criteria) ? t.acceptance_criteria : [],
        reviewer: t.reviewer || null,
        validatedBy: t.validated_by || null,
        validatedAt: t.validated_at || null,
        sprintHistory: Array.isArray(t.sprint_history) ? t.sprint_history : [],
        sprintEvents: Array.isArray(t.sprint_events) ? t.sprint_events : [],
        statusHistory: Array.isArray(t.status_history) ? t.status_history : [],
      });

      setTasks(prev => {
        let changed = false;
        const newTasks = [...prev];
        remoteTasks.forEach(t => {
          const existingIdx = newTasks.findIndex(x => x.id === t.id);
          if (existingIdx >= 0) {
            const existing = newTasks[existingIdx];
            const sid = t.sprint_id || null;
            const sprio = t.sprint_priority != null ? Number(t.sprint_priority) : null;
            const dept = t.department || null;
            // No pisar una tarea recién escrita localmente con un remoto VIEJO.
            // El guard anterior era solo por tiempo (15s) y fallaba si la réplica
            // de Supabase tardaba más en propagar: el poll leía el valor viejo y
            // la tarea "reaparecía" para luego volver a desaparecer en el próximo
            // poll. Ahora comparamos contra lo que escribimos: si el remoto YA
            // refleja nuestro cambio, soltamos el guard; si todavía viene viejo,
            // lo ignoramos hasta 60s (válvula de seguridad por si la escritura falló).
            const rw = recentWriteRef.current.get(t.id);
            if (rw) {
              const remoteMatchesOurWrite =
                t.status === rw.status &&
                sid === rw.sprintId &&
                sprio === rw.sprintPriority &&
                t.assignee === rw.assignee &&
                t.priority === rw.priority &&
                (t.phase || null) === rw.phase &&
                t.title === rw.title &&
                dept === rw.department;
              if (remoteMatchesOurWrite) {
                recentWriteRef.current.delete(t.id); // la DB ya está al día
              } else if (Date.now() - rw.ts < 60000) {
                return; // remoto viejo: no revertir el cambio optimista
              } else {
                recentWriteRef.current.delete(t.id); // 60s sin confirmar: aceptar remoto
              }
            }
            if (t.title !== existing.title || t.status !== existing.status || t.assignee !== existing.assignee || t.priority !== existing.priority || (t.phase || null) !== (existing.phase || null) || sid !== (existing.sprintId || null) || sprio !== (existing.sprintPriority ?? null) || dept !== (existing.department || null)) {
              newTasks[existingIdx] = {
                ...existing,
                title: t.title, status: t.status, assignee: t.assignee,
                priority: t.priority, notes: t.notes, phase: t.phase || null,
                sprintId: sid, sprintPriority: sprio, department: dept,
                // Que la validación / movimiento de sprint de otra sesión se vea sin recargar.
                validatedBy: t.validated_by || null,
                validatedAt: t.validated_at || null,
                sprintHistory: Array.isArray(t.sprint_history) ? t.sprint_history : (existing.sprintHistory || []),
                sprintEvents: Array.isArray(t.sprint_events) ? t.sprint_events : (existing.sprintEvents || []),
                statusHistory: Array.isArray(t.status_history) ? t.status_history : (existing.statusHistory || []),
              };
              changed = true;
            }
          } else {
            newTasks.push(mapPollTask(t));
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
    } catch {
      /* silent fail on poll */
    }
  }, [loadSprints]);

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
      } catch { /* ignore parse errors */ }
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

  // ── Lectura de comentarios por tarea (leído/no leído del chip) ──
  // Cargar el mapa de lecturas del usuario actual desde localStorage.
  useEffect(() => {
    const uid = currentUser?.id;
    if (!uid) return;
    try {
      const raw = localStorage.getItem('korex_comment_reads_' + uid);
      setCommentReads(raw ? JSON.parse(raw) : {});
    } catch { setCommentReads({}); }
  }, [currentUser?.id]);

  // Marca los comentarios de una tarea como leídos (ahora) y persiste.
  const markTaskCommentsRead = useCallback((taskId) => {
    const uid = currentUserIdRef.current;
    if (!uid || !taskId) return;
    setCommentReads(prev => {
      const next = { ...prev, [taskId]: new Date().toISOString() };
      try { localStorage.setItem('korex_comment_reads_' + uid, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Set de taskIds con al menos un comentario SIN LEER (más nuevo que la última
  // vez que abrí esa tarea). Mis propios comentarios no cuentan como no leídos.
  const unreadCommentTaskIds = useMemo(() => {
    const uid = currentUser?.id;
    const set = new Set();
    (taskComments || []).forEach(c => {
      if (!c.task_id || c.author_id === uid) return;
      if (c.kind && c.kind !== 'user') return; // ignorar entradas system/report
      const lastSeen = commentReads[c.task_id];
      if (!lastSeen || (c.created_at && c.created_at > lastSeen)) set.add(c.task_id);
    });
    return set;
  }, [taskComments, commentReads, currentUser?.id]);

  // ── Closures estables para el value memoizado ──
  // Antes vivian inline dentro del objeto value: cada render del provider
  // creaba funciones nuevas y recreaba el value entero, re-renderizando a
  // TODOS los consumidores de useApp() aunque nada hubiera cambiado.
  const dismissAlert = useCallback(async (alertId) => {
    setDashboardAlerts(prev => prev.filter(a => a.id !== alertId));
    try {
      await sbFetch('dashboard_alerts?id=eq.' + alertId, {
        method: 'PATCH',
        body: JSON.stringify({ dismissed: true, updated_at: new Date().toISOString() })
      });
    } catch (e) { console.error('Failed to dismiss alert', e); }
  }, []);
  // Side panel de comentarios (generico para task, bullet, idea o blocker).
  const openTaskComments = useCallback((taskId) => {
    if (taskId) markTaskCommentsRead(taskId);
    setCommentsTarget(taskId ? { kind: 'task', taskId } : null);
  }, [markTaskCommentsRead]);
  const openBulletComments = useCallback((reportId, bulletId) => setCommentsTarget({ kind: 'bullet', reportId, bulletId }), []);
  const openIdeaComments = useCallback((ideaId) => setCommentsTarget({ kind: 'idea', ideaId }), []);
  const openBlockerComments = useCallback((blockerId) => setCommentsTarget({ kind: 'blocker', blockerId }), []);
  const closeComments = useCallback(() => setCommentsTarget(null), []);
  // Helper unificado: lee priority labels de appSettings con fallback a PRIO_CLIENT
  const getPriorityLabel = useCallback((p) => {
    const fromDb = appSettings?.priority_labels?.[String(p)];
    return fromDb || PRIO_CLIENT[p];
  }, [appSettings]);
  const getAllPriorityLabels = useCallback(() => {
    const fromDb = appSettings?.priority_labels;
    if (fromDb && Object.keys(fromDb).length > 0) return fromDb;
    return PRIO_CLIENT;
  }, [appSettings]);

  const value = useMemo(() => ({
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
    taskDepartment, setTaskDepartment,
    currentUser,
    authUser,
    isAdmin,
    briefing, setBriefing,
    reportFeedbacks, setReportFeedbacks,
    taskProposals, setTaskProposals,
    dashboardAlerts, setDashboardAlerts,
    dismissAlert,
    hideCompleted, setHideCompleted,
    hideCompletedTasks, setHideCompletedTasks,
    hideBlockedTasks, setHideBlockedTasks,
    collapsedGroups, setCollapsedGroups,
    syncStatus, setSyncStatus,
    saveError, retryFailedSaves,
    flashMessage, flash,

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
    // Sprints (Kanban ágil)
    sprints,
    activeSprint,
    loadSprints,
    createSprint,
    updateSprint,
    addTaskToSprint,
    removeTaskFromSprint,
    moveTaskToSprint,
    closeSprint,
    finalizeSprint,
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
    prepareReunionReporte,
    sendReunionReporte,
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
    ideaComments,
    addIdeaComment,
    updateIdeaComment,
    deleteIdeaComment,
    blockerComments,
    addBlockerComment,
    updateBlockerComment,
    deleteBlockerComment,
    // Orden custom de tareas por usuario + reorder de clientes
    taskUserPositions,
    reorderTaskForUser,
    clientUserPositions,
    reorderClientForUser,
    reorderClient,
    // Side panel de comentarios (generico para task, bullet, idea o blocker).
    commentsTarget,
    openTaskComments,
    // Chip de comentarios leído/no leído
    unreadCommentTaskIds,
    markTaskCommentsRead,
    openBulletComments,
    openIdeaComments,
    openBlockerComments,
    closeComments,
    // Alias legacy para compat con el panel actual (devuelve el taskId si esta abierto en modo task).
    openCommentTaskId: commentsTarget?.kind === 'task' ? commentsTarget.taskId : null,
    closeTaskComments: closeComments,
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
    contracts,
    linkContract,
    addContract,
    updateContract,
    deleteContract,
    getPriorityLabel,
    getAllPriorityLabels,
  }), [
    // Estado (los setters de useState son estables y no necesitan estar aca)
    clients, tasks, view, setView, selectedId, phase, filter, taskFilter,
    taskAssignee, taskClientFilter, taskPriority, taskDueFilter, taskDepartment,
    currentUser, authUser, isAdmin, briefing, reportFeedbacks, taskProposals,
    dashboardAlerts, hideCompleted, hideCompletedTasks, hideBlockedTasks,
    collapsedGroups, syncStatus, saveError, flashMessage, appSettings, teamMembers, weeklyTodos,
    sprints, activeSprint,
    loomVideos, llamadas, pendingCallsCount, teamReports, teamBlockers,
    ideas, notas, taskComments, bulletComments, ideaComments, blockerComments,
    taskUserPositions, clientUserPositions, commentsTarget, unreadCommentTaskIds,
    notifications, unreadNotifCount, notifPanelOpen, notifToast,
    strategies, strategyPages, invoices, contracts,
    // Acciones (todas useCallback)
    dismissAlert, save, dbSaveClient, dbSaveTask, dbSyncAll, dbDeleteTask, retryFailedSaves, flash,
    createClient, updateClient, deleteClient, createTask, updateTask,
    deleteTask, reorderTask, doLogout, injectMetaMetrics, recalculateTimers,
    updateAppSettings, addTeamMember, updateTeamMember, deleteTeamMember,
    loadWeeklyTodos, addWeeklyTodo, addWeeklyNote, removeWeeklyTodo,
    updateWeeklyTodo, loadSprints, createSprint, updateSprint, addTaskToSprint,
    removeTaskFromSprint, moveTaskToSprint, closeSprint, finalizeSprint,
    addLoomVideo, updateLoomVideo, deleteLoomVideo,
    updateLlamada, deleteLlamada, addLlamadaInbox,
    prepareReunionReporte, sendReunionReporte, addTeamReport,
    updateTeamReport, deleteTeamReport, resolveBlocker, unresolveBlocker,
    addIdea, updateIdea, deleteIdea, addNota, updateNota, deleteNota,
    reorderNota, addTaskComment, updateTaskComment, deleteTaskComment,
    addBulletComment, updateBulletComment, deleteBulletComment,
    addIdeaComment, updateIdeaComment, deleteIdeaComment,
    addBlockerComment, updateBlockerComment, deleteBlockerComment,
    reorderTaskForUser, reorderClientForUser, reorderClient,
    openTaskComments, markTaskCommentsRead, openBulletComments,
    openIdeaComments, openBlockerComments, closeComments,
    openNotifications, closeNotifications, markNotificationRead,
    markAllNotificationsRead, dismissNotifToast,
    addStrategy, updateStrategy, deleteStrategy, addStrategyPage,
    updateStrategyPage, deleteStrategyPage, addInvoice, updateInvoice,
    deleteInvoice, linkContract, addContract, updateContract, deleteContract,
    getPriorityLabel, getAllPriorityLabels,
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}