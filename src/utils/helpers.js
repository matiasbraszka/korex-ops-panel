import { PROCESS_STEPS, PHASES } from './constants';

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

export function progress(c) {
  return Math.round(c.steps.filter(s => s.status === 'completed').length / c.steps.length * 100);
}

export function currentStep(c) {
  for (let i = 0; i < c.steps.length; i++) {
    if (c.steps[i].status !== 'completed') {
      return { def: PROCESS_STEPS[i], cs: c.steps[i], idx: i };
    }
  }
  return null;
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

export function getBottleneck(c) {
  if (c.bottleneck) return c.bottleneck;
  // Check blocked steps
  for (let i = 0; i < c.steps.length; i++) {
    if (c.steps[i].status === 'blocked') {
      return `Bloqueado en: ${PROCESS_STEPS[i].name}${c.steps[i].responsible ? ' \u2014 ' + c.steps[i].responsible : ''}`;
    }
  }
  // Check waiting-client
  for (let i = 0; i < c.steps.length; i++) {
    if (c.steps[i].status === 'waiting-client') {
      return `Esperando cliente: ${PROCESS_STEPS[i].name}`;
    }
  }
  // Check overdue in-progress
  for (let i = 0; i < c.steps.length; i++) {
    if (c.steps[i].status === 'in-progress' && c.steps[i].startDate) {
      const d = daysAgo(c.steps[i].startDate);
      if (d > PROCESS_STEPS[i].days) {
        return `${PROCESS_STEPS[i].name} con retraso (${d}d de ${PROCESS_STEPS[i].days}d)${c.steps[i].responsible ? ' \u2014 ' + c.steps[i].responsible : ''}`;
      }
    }
  }
  // Current step
  const cur = currentStep(c);
  if (cur && cur.cs.responsible) return `${cur.def.name} \u2014 ${cur.cs.responsible}`;
  if (cur) return cur.def.name;
  return '';
}

export function getPhaseTimings(c) {
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
 * Returns an object describing the client's pill status (not HTML).
 * { text, pillClass }
 * pillClass is one of: 'pill-green', 'pill-red', 'pill-yellow', 'pill-blue', 'pill-gray'
 */
export function clientPill(c) {
  if (!currentStep(c)) return { text: '\u2713 Completado', pillClass: 'pill-green' };
  if (c.steps.some(s => s.status === 'blocked')) return { text: 'Bloqueado', pillClass: 'pill-red' };
  if (c.steps.some(s => s.status === 'waiting-client')) return { text: 'Esp. cliente', pillClass: 'pill-yellow' };
  if (c.steps.some(s => s.status === 'in-progress')) return { text: 'En progreso', pillClass: 'pill-blue' };
  return { text: 'Pendiente', pillClass: 'pill-gray' };
}

export function mkClient(name, company, service, start, pm, clientCount = 0) {
  return {
    id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    name, company, service, startDate: start, pm,
    color: ['#5B7CF5', '#22C55E', '#EAB308', '#F97316', '#8B5CF6', '#06B6D4', '#EC4899'][clientCount % 7],
    status: 'active', priority: 4, bottleneck: '', notes: '',
    slackChannel: '', slackChannelId: '', metaAds: [], metaMetrics: null,
    customSteps: [], customPhases: [], clientFeedbacks: [],
    stepNameOverrides: {}, phaseNameOverrides: {},
    steps: PROCESS_STEPS.map(() => ({ status: 'pending', startDate: '', endDate: '', responsible: '', notes: '' })),
    feedback: [],
    history: [{ text: 'Cliente creado', date: start || today(), color: '#5B7CF5' }]
  };
}

export function mkTask(title, clientId, assignee, priority, status, notes, stepIdx) {
  return {
    id: 't_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    title, clientId, assignee: assignee || '', priority: priority || 'normal',
    stepIdx: stepIdx !== undefined && stepIdx !== null && stepIdx !== '' ? parseInt(stepIdx) : null,
    status: status || 'backlog', notes: notes || '', description: '', createdDate: today(),
    startedDate: null, completedDate: null, blockedSince: null
  };
}

export function effectiveTime(task, client) {
  // Returns number of days the task has been actively worked on
  // Excludes time when dependencies were blocking
  if (!task.startedDate) return null;
  const end = task.completedDate || today();
  const total = daysBetween(task.startedDate, end);
  // For now, return total days (dependency blocking is complex to track historically)
  return total;
}