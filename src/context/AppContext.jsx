import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { sbFetch } from '../utils/supabase';
import { USERS, CLIENT_ADS_DATA } from '../utils/constants';
import { mkClient, mkTask, createDefaultTasks, today } from '../utils/helpers';

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }) {
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState('clients');
  const [selectedId, setSelectedId] = useState(null);
  const [phase, setPhase] = useState('all');
  const [filter, setFilter] = useState('all');
  const [taskFilter, setTaskFilter] = useState('all');
  const [taskAssignee, setTaskAssignee] = useState('all');
  const [currentUser, setCurrentUser] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [reportFeedbacks, setReportFeedbacks] = useState([]);
  const [taskProposals, setTaskProposals] = useState([]);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [hideCompletedTasks, setHideCompletedTasks] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [syncStatus, setSyncStatus] = useState('ok');

  const dbReady = useRef(false);
  const saveTimer = useRef(null);
  const lastPoll = useRef(0);
  const clientsRef = useRef(clients);
  const tasksRef = useRef(tasks);
  clientsRef.current = clients;
  tasksRef.current = tasks;

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
        slack_channel: c.slackChannel || '', slack_channel_id: c.slackChannelId || '',
        meta_ads: c.metaAds || [], custom_steps: c.customSteps || [],
        custom_phases: c.customPhases || [], client_feedbacks: c.clientFeedbacks || [],
        step_name_overrides: c.stepNameOverrides || {}, phase_name_overrides: c.phaseNameOverrides || {},
        meta_metrics: c.metaMetrics || null
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
        template_id: t.templateId || null, estimated_days: t.estimatedDays || null, is_client_task: t.isClientTask || false
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
        slack_channel: c.slackChannel || '', slack_channel_id: c.slackChannelId || '',
        meta_ads: c.metaAds || [], custom_steps: c.customSteps || [],
        custom_phases: c.customPhases || [], client_feedbacks: c.clientFeedbacks || [],
        step_name_overrides: c.stepNameOverrides || {}, phase_name_overrides: c.phaseNameOverrides || {},
        meta_metrics: c.metaMetrics || null
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
        template_id: t.templateId || null, estimated_days: t.estimatedDays || null, is_client_task: t.isClientTask || false
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
  const createClient = useCallback((name, company, service, start, pm) => {
    const c = mkClient(name, company, service, start, pm, clientsRef.current.length);
    const newClients = [...clientsRef.current, c];
    const injected = injectMetaMetrics(newClients);
    setClients(injected);
    // Create default roadmap tasks for the new client
    const defaultTasks = createDefaultTasks(c.id);
    const newTasks = [...tasksRef.current, ...defaultTasks];
    setTasks(newTasks);
    save(injected, newTasks);
    if (dbReady.current) {
      dbSaveClient(c);
      defaultTasks.forEach(t => dbSaveTask(t));
    }
    return c;
  }, [save, dbSaveClient, dbSaveTask, injectMetaMetrics]);

  const updateClient = useCallback((id, updates) => {
    setClients(prev => {
      const newClients = prev.map(c => c.id === id ? { ...c, ...updates } : c);
      save(newClients, tasksRef.current);
      const updated = newClients.find(c => c.id === id);
      if (updated && dbReady.current) dbSaveClient(updated);
      return newClients;
    });
  }, [save, dbSaveClient]);

  // ── CRUD: Tasks ──
  const createTask = useCallback((title, clientId, assignee, priority, status, notes, stepIdx) => {
    const t = mkTask(title, clientId, assignee, priority, status, notes, stepIdx);
    const newTasks = [...tasksRef.current, t];
    setTasks(newTasks);
    save(clientsRef.current, newTasks);
    if (dbReady.current) dbSaveTask(t);
    return t;
  }, [save, dbSaveTask]);

  const updateTask = useCallback((id, updates) => {
    setTasks(prev => {
      const newTasks = prev.map(t => {
        if (t.id !== id) return t;
        const merged = { ...t, ...updates };
        // Auto-set timing dates on status changes
        if (updates.status && updates.status !== t.status) {
          if (updates.status === 'in-progress' && !merged.startedDate) {
            merged.startedDate = today();
          }
          if (updates.status === 'done') {
            merged.completedDate = today();
          }
        }
        return merged;
      });
      save(clientsRef.current, newTasks);
      const updated = newTasks.find(t => t.id === id);
      if (updated && dbReady.current) dbSaveTask(updated);
      return newTasks;
    });
  }, [save, dbSaveTask]);

  const deleteTask = useCallback((id) => {
    setTasks(prev => {
      const newTasks = prev.filter(t => t.id !== id);
      save(clientsRef.current, newTasks);
      dbDeleteTask(id);
      return newTasks;
    });
  }, [save, dbDeleteTask]);

  // ── Auth ──
  const doLogin = useCallback((username, password) => {
    const u = username.trim().toLowerCase().replace(/@.*$/, '');
    if (USERS[u] && USERS[u].pass === password) {
      const user = { ...USERS[u], id: u };
      setCurrentUser(user);
      localStorage.setItem('korex_user', u);
      return true;
    }
    return false;
  }, []);

  const doLogout = useCallback(() => {
    localStorage.removeItem('korex_user');
    setCurrentUser(null);
  }, []);

  // ── Load from Supabase ──
  const loadFromSupabase = useCallback(async () => {
    try {
      const [sbClients, sbTasks, briefings, feedbacks, proposals] = await Promise.all([
        sbFetch('clients?select=*&order=priority.asc', { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('tasks?select=*&order=created_at.asc', { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('briefings?id=eq.latest&select=*', { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('report_feedback?select=*&order=created_at.desc&limit=20', { headers: { 'Prefer': 'return=representation' } }),
        sbFetch('task_proposals?select=*&order=created_at.desc&limit=50', { headers: { 'Prefer': 'return=representation' } }),
      ]);

      if (briefings && briefings.length) setBriefing(briefings[0]);
      if (feedbacks && feedbacks.length) setReportFeedbacks(feedbacks);
      if (proposals && proposals.length) setTaskProposals(proposals);

      if (sbClients && sbClients.length > 0) {
        const mappedClients = sbClients.map(c => ({
          id: c.id, name: c.name, company: c.company, service: c.service,
          startDate: c.start_date, pm: c.pm, color: c.color, status: c.status,
          priority: c.priority, bottleneck: c.bottleneck, notes: c.notes,
          steps: c.steps || [], feedback: c.feedback || [], history: c.history || [],
          slackChannel: c.slack_channel || '', slackChannelId: c.slack_channel_id || '',
          metaAds: c.meta_ads || [], customSteps: c.custom_steps || [],
          customPhases: c.custom_phases || [], clientFeedbacks: c.client_feedbacks || [],
          stepNameOverrides: c.step_name_overrides || {}, phaseNameOverrides: c.phase_name_overrides || {},
          metaMetrics: c.meta_metrics || null
        }));
        const mappedTasks = (sbTasks || []).map(t => ({
          id: t.id, title: t.title, clientId: t.client_id, assignee: t.assignee,
          priority: t.priority, status: t.status, notes: t.notes,
          description: t.description || '', stepIdx: t.step_idx, createdDate: t.created_date,
          startedDate: t.started_date || null, completedDate: t.completed_date || null, blockedSince: t.blocked_since || null,
          phase: t.phase || null, dependsOn: t.depends_on || null, isRoadmapTask: t.is_roadmap_task || false,
          templateId: t.template_id || null, estimatedDays: t.estimated_days || null, isClientTask: t.is_client_task || false
        }));

        const injected = injectMetaMetrics(mappedClients);
        setClients(injected);
        setTasks(mappedTasks);
        localStorage.setItem('korex_v6', JSON.stringify({ clients: injected, tasks: mappedTasks }));
        dbReady.current = true;
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

  // ── Init on mount ──
  useEffect(() => {
    // 1. Load from localStorage first (instant)
    const raw = localStorage.getItem('korex_v6');
    let localClients = [];
    let localTasks = [];
    if (raw) {
      try {
        const p = JSON.parse(raw);
        localClients = p.clients || [];
        localTasks = p.tasks || [];
      } catch (e) { /* ignore parse errors */ }
    }
    const injected = injectMetaMetrics(localClients);
    setClients(injected);
    setTasks(localTasks);

    // Restore user session
    const u = localStorage.getItem('korex_user');
    if (u && USERS[u]) {
      setCurrentUser({ ...USERS[u], id: u });
    }

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
    });

    // 3. Poll for external changes every 30s
    const pollInterval = setInterval(pollSupabase, 30000);
    return () => clearInterval(pollInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    currentUser, setCurrentUser,
    briefing, setBriefing,
    reportFeedbacks, setReportFeedbacks,
    taskProposals, setTaskProposals,
    hideCompleted, setHideCompleted,
    hideCompletedTasks, setHideCompletedTasks,
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
    createTask,
    updateTask,
    deleteTask,
    doLogin,
    doLogout,
    injectMetaMetrics,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}