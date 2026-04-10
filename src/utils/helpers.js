import { PROCESS_STEPS, DEFAULT_TASKS_TEMPLATE, PHASES } from './constants';

export function today() {
  return new Date().toISOString().substr(0, 10);
}

export function initials(n) {
  return n.split(' ').map(x => x[0]).join('').toUpperCase().substr(0, 2);
}

export function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / 864e5);
}

export function daysAgo(d) {
  return d ? daysBetween(d, today()) : 0;
}

export function fmtDate(d) {
  if (!d) return '\u2014';
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

/**
 * Returns roadmap tasks for a client.
 */
export function getRoadmapTasks(clientId, tasks) {
  return tasks.filter(t => t.clientId === clientId && t.isRoadmapTask);
}

/**
 * Returns true if the client has roadmap tasks (new system).
 */
export function hasRoadmapTasks(clientId, tasks) {
  return tasks.some(t => t.clientId === clientId && t.isRoadmapTask);
}

/**
 * Progress: % of completed roadmap tasks (or steps for backward compat).
 */
export function progress(c, tasks) {
  // Use ALL client tasks if any exist
  if (tasks) {
    const clientTasks = tasks.filter(t => t.clientId === c.id);
    if (clientTasks.length > 0) {
      return Math.round(clientTasks.filter(t => t.status === 'done').length / clientTasks.length * 100);
    }
  }
  // Fallback to steps
  if (!c.steps || c.steps.length === 0) return 0;
  const validSteps = c.steps.filter(s => s && s.status);
  if (validSteps.length === 0) return 0;
  return Math.round(validSteps.filter(s => s.status === 'completed').length / validSteps.length * 100);
}

/**
 * currentStep (backward compat) — finds first non-completed step.
 */
export function currentStep(c) {
  if (!c.steps) return null;
  for (let i = 0; i < c.steps.length; i++) {
    if (c.steps[i].status !== 'completed') {
      return { def: PROCESS_STEPS[i], cs: c.steps[i], idx: i };
    }
  }
  return null;
}

/**
 * currentTask — finds the first non-completed roadmap task.
 */
export function currentTask(c, tasks) {
  if (tasks && hasRoadmapTasks(c.id, tasks)) {
    const rt = getRoadmapTasks(c.id, tasks);
    const notDone = rt.find(t => t.status !== 'done');
    return notDone || null;
  }
  // Fallback: use currentStep
  const cs = currentStep(c);
  if (!cs) return null;
  return { title: cs.def.name, phase: cs.def.phase };
}

export function getStepName(task, clients) {
  if (task.stepIdx === null || task.stepIdx === undefined) return '';
  if (task.stepIdx < PROCESS_STEPS.length) return PROCESS_STEPS[task.stepIdx].name;
  const c = clients.find(x => x.id === task.clientId);
  if (c && c.customSteps && c.customSteps[task.stepIdx - PROCESS_STEPS.length]) {
    return c.customSteps[task.stepIdx - PROCESS_STEPS.length].name;
  }
  return '';
}

export function getStepNameForClient(c, stepIdx) {
  if (c && c.stepNameOverrides && c.stepNameOverrides[stepIdx]) return c.stepNameOverrides[stepIdx];
  return PROCESS_STEPS[stepIdx].name;
}

export function getAllPhases(c) {
  const merged = {};
  Object.entries(PHASES).forEach(([k, v]) => {
    merged[k] = {
      label: (c && c.phaseNameOverrides && c.phaseNameOverrides[k]) || v.label,
      color: v.color
    };
  });
  if (c && c.customPhases) {
    c.customPhases.forEach(p => {
      merged[p.id] = { label: p.label, color: p.color };
    });
  }
  return merged;
}

/**
 * getBottleneck: uses tasks if available, else falls back to steps.
 */
export function getBottleneck(c, tasks) {
  if (c.bottleneck) return c.bottleneck;

  if (tasks && hasRoadmapTasks(c.id, tasks)) {
    const rt = getRoadmapTasks(c.id, tasks);
    // Check blocked tasks
    const blocked = rt.find(t => t.status === 'blocked');
    if (blocked) return `Bloqueado en: ${blocked.title}${blocked.assignee ? ' \u2014 ' + blocked.assignee : ''}`;
    // Check overdue in-progress
    for (const t of rt) {
      if (t.status === 'in-progress' && t.startedDate) {
        const d = daysAgo(t.startedDate);
        const est = t.estimatedDays || 7;
        if (d > est) {
          return `${t.title} con retraso (${d}d de ${est}d)${t.assignee ? ' \u2014 ' + t.assignee : ''}`;
        }
      }
    }
    // Current task
    const cur = rt.find(t => t.status !== 'done');
    if (cur && cur.assignee) return `${cur.title} \u2014 ${cur.assignee}`;
    if (cur) return cur.title;
    return '';
  }

  // Fallback to steps
  for (let i = 0; i < c.steps.length; i++) {
    if (c.steps[i].status === 'blocked') {
      return `Bloqueado en: ${PROCESS_STEPS[i].name}${c.steps[i].responsible ? ' \u2014 ' + c.steps[i].responsible : ''}`;
    }
  }
  for (let i = 0; i < c.steps.length; i++) {
    if (c.steps[i].status === 'waiting-client') {
      return `Esperando cliente: ${PROCESS_STEPS[i].name}`;
    }
  }
  for (let i = 0; i < c.steps.length; i++) {
    if (c.steps[i].status === 'in-progress' && c.steps[i].startDate) {
      const d = daysAgo(c.steps[i].startDate);
      if (d > PROCESS_STEPS[i].days) {
        return `${PROCESS_STEPS[i].name} con retraso (${d}d de ${PROCESS_STEPS[i].days}d)${c.steps[i].responsible ? ' \u2014 ' + c.steps[i].responsible : ''}`;
      }
    }
  }
  const cur = currentStep(c);
  if (cur && cur.cs.responsible) return `${cur.def.name} \u2014 ${cur.cs.responsible}`;
  if (cur) return cur.def.name;
  return '';
}

/**
 * getPhaseTimings: uses tasks if available, else steps.
 */
export function getPhaseTimings(c, tasks) {
  if (tasks && hasRoadmapTasks(c.id, tasks)) {
    const rt = getRoadmapTasks(c.id, tasks);
    const timings = {};
    Object.keys(PHASES).forEach(phase => {
      const tasksInPhase = rt.filter(t => t.phase === phase);
      let firstStart = null, lastEnd = null, totalDays = 0, expectedDays = 0;
      tasksInPhase.forEach(t => {
        expectedDays += t.estimatedDays || 0;
        if (t.startedDate && (!firstStart || t.startedDate < firstStart)) firstStart = t.startedDate;
        if (t.completedDate && (!lastEnd || t.completedDate > lastEnd)) lastEnd = t.completedDate;
        if (t.startedDate && t.status === 'done' && t.completedDate) totalDays += daysBetween(t.startedDate, t.completedDate);
        else if (t.startedDate && t.status !== 'backlog') totalDays += daysAgo(t.startedDate);
      });
      const allDone = tasksInPhase.length > 0 && tasksInPhase.every(t => t.status === 'done');
      const actualDays = firstStart && lastEnd ? daysBetween(firstStart, lastEnd) : (firstStart ? daysAgo(firstStart) : null);
      timings[phase] = { expectedDays, actualDays, firstStart, lastEnd, allDone, totalDays };
    });
    return timings;
  }

  // Fallback to steps
  const timings = {};
  Object.keys(PHASES).forEach(phase => {
    const stepsInPhase = PROCESS_STEPS.map((s, i) => ({ s, i, cs: c.steps[i] })).filter(x => x.s.phase === phase);
    let firstStart = null, lastEnd = null, totalDays = 0, expectedDays = 0;
    stepsInPhase.forEach(({ s, cs }) => {
      expectedDays += s.days;
      if (cs.startDate && (!firstStart || cs.startDate < firstStart)) firstStart = cs.startDate;
      if (cs.endDate && (!lastEnd || cs.endDate > lastEnd)) lastEnd = cs.endDate;
      if (cs.startDate && cs.status === 'completed' && cs.endDate) totalDays += daysBetween(cs.startDate, cs.endDate);
      else if (cs.startDate && cs.status !== 'pending') totalDays += daysAgo(cs.startDate);
    });
    const allDone = stepsInPhase.every(x => x.cs.status === 'completed');
    const actualDays = firstStart && lastEnd ? daysBetween(firstStart, lastEnd) : (firstStart ? daysAgo(firstStart) : null);
    timings[phase] = { expectedDays, actualDays, firstStart, lastEnd, allDone, totalDays };
  });
  return timings;
}

/**
 * clientPill: pill status for the client list.
 */
export function clientPill(c, tasks) {
  if (tasks && hasRoadmapTasks(c.id, tasks)) {
    const rt = getRoadmapTasks(c.id, tasks);
    if (rt.every(t => t.status === 'done')) return { text: '\u2713 Completado', pillClass: 'pill-green' };
    if (rt.some(t => t.status === 'blocked')) return { text: 'Bloqueado', pillClass: 'pill-red' };
    if (rt.some(t => t.status === 'in-progress')) return { text: 'En progreso', pillClass: 'pill-blue' };
    return { text: 'Pendiente', pillClass: 'pill-gray' };
  }
  // Fallback
  if (!currentStep(c)) return { text: '\u2713 Completado', pillClass: 'pill-green' };
  if (c.steps.some(s => s.status === 'blocked')) return { text: 'Bloqueado', pillClass: 'pill-red' };
  if (c.steps.some(s => s.status === 'waiting-client')) return { text: 'Esp. cliente', pillClass: 'pill-yellow' };
  if (c.steps.some(s => s.status === 'in-progress')) return { text: 'En progreso', pillClass: 'pill-blue' };
  return { text: 'Pendiente', pillClass: 'pill-gray' };
}

export function mkClient(name, company, service, start, pm, clientCount = 0, { phone, slackChannel, avatarUrl } = {}) {
  return {
    id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    name, company, service, startDate: start, pm,
    color: ['#5B7CF5', '#22C55E', '#EAB308', '#F97316', '#8B5CF6', '#06B6D4', '#EC4899'][clientCount % 7],
    status: 'active', priority: 5, bottleneck: '', notes: '',
    phone: phone || '', avatarUrl: avatarUrl || '',
    slackChannel: slackChannel || '', slackChannelId: '', metaAds: [], metaMetrics: null,
    customSteps: [], customPhases: [], clientFeedbacks: [],
    stepNameOverrides: {}, phaseNameOverrides: {},
    steps: PROCESS_STEPS.map((ps, idx) => ({ status: 'pending', startDate: '', endDate: '', responsible: '', notes: '', dependsOn: ps.dependsOn ? [...ps.dependsOn] : [] })),
    feedback: [],
    history: [{ text: 'Cliente creado', date: start || today(), color: '#5B7CF5' }]
  };
}

/**
 * Creates 19 default roadmap tasks from DEFAULT_TASKS_TEMPLATE for a new client.
 */
export function createDefaultTasks(clientId) {
  return DEFAULT_TASKS_TEMPLATE.map(tpl => ({
    id: 't_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '_' + tpl.id,
    title: tpl.name,
    clientId,
    phase: tpl.phase,
    status: 'backlog',
    assignee: tpl.assignee || '',
    priority: 'normal',
    stepIdx: null,
    dependsOn: [...tpl.dependsOn],
    isRoadmapTask: true,
    templateId: tpl.id,
    estimatedDays: tpl.days,
    isClientTask: tpl.client,
    notes: '',
    description: '',
    createdDate: today(),
    startedDate: null,
    completedDate: null,
    blockedSince: null,
    dueDate: null,
    accumulatedDays: 0,
    timerStartedAt: null,
    enabledDate: null,
  }));
}

export function mkTask(title, clientId, assignee, priority, status, notes, stepIdx) {
  return {
    id: 't_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    title, clientId, assignee: assignee || '', priority: priority || 'normal',
    stepIdx: stepIdx !== undefined && stepIdx !== null && stepIdx !== '' ? parseInt(stepIdx) : null,
    status: status || 'backlog', notes: notes || '', description: '', createdDate: today(),
    startedDate: null, completedDate: null, blockedSince: null, dueDate: null
  };
}

export function effectiveTime(task, client) {
  if (!task.startedDate) return null;
  const end = task.completedDate || today();
  const total = daysBetween(task.startedDate, end);
  return total;
}

/**
 * Check if a task's timer should be running.
 */
export function isTimerRunning(task, allClientTasks) {
  if (task.status === 'done' || task.status === 'blocked') return false;
  if (task.dependsOn && task.dependsOn.length > 0) {
    const hasUnmet = task.dependsOn.some(depId => {
      const dep = allClientTasks.find(t => t.id === depId || t.templateId === depId);
      return dep && dep.status !== 'done';
    });
    if (hasUnmet) return false;
  }
  return true;
}

/**
 * Get total elapsed days for a task (accumulated + current running period).
 */
export function getElapsedDays(task, allClientTasks) {
  let total = task.accumulatedDays || 0;
  if (task.timerStartedAt && isTimerRunning(task, allClientTasks)) {
    const extra = daysBetween(task.timerStartedAt, today());
    if (extra > 0) total += extra;
  }
  return Math.round(total * 10) / 10;
}

/**
 * Migration: convert old client steps to new roadmap tasks.
 */
export function migrateClientToRoadmap(client, existingTasks) {
  const DEFAULT_TASKS = DEFAULT_TASKS_TEMPLATE;
  const oldSteps = client.steps || [];

  return DEFAULT_TASKS.map((tpl, idx) => {
    const oldStep = idx < oldSteps.length ? oldSteps[idx] : null;

    let status = 'backlog';
    let startedDate = null;
    let completedDate = null;

    // cargar-saldo is index 16, new task with no old step mapping
    if (tpl.id === 'cargar-saldo') {
      status = 'backlog';
    } else if (oldStep) {
      if (oldStep.status === 'completed') {
        status = 'done';
        completedDate = today();
      } else if (oldStep.status === 'in-progress') {
        status = 'in-progress';
        startedDate = client.startDate || today();
      } else if (oldStep.status === 'waiting-client') {
        status = 'backlog';
      } else if (oldStep.status === 'blocked') {
        status = 'blocked';
      } else {
        status = 'backlog';
      }
    }

    const assignee = oldStep?.responsible || '';
    const notes = oldStep?.notes || '';

    return {
      id: 't_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '_mig_' + tpl.id,
      title: tpl.name,
      clientId: client.id,
      phase: tpl.phase,
      status,
      assignee,
      priority: 'normal',
      stepIdx: null,
      dependsOn: [...tpl.dependsOn],
      isRoadmapTask: true,
      templateId: tpl.id,
      estimatedDays: tpl.days,
      isClientTask: tpl.client,
      notes,
      description: '',
      createdDate: today(),
      startedDate,
      completedDate,
      blockedSince: null,
      dueDate: null,
      accumulatedDays: 0,
      timerStartedAt: null,
      enabledDate: null,
    };
  });
}