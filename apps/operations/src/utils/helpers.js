import { PROCESS_STEPS, DEFAULT_TASKS_TEMPLATE, PHASES, TASK_STATUS } from './constants';

export function today() {
  // Fecha local en formato YYYY-MM-DD (no UTC). toISOString devuelve UTC
  // y para zonas horarias este del meridiano a partir de las 22h locales
  // ya esta en el dia siguiente UTC. Esto causaba que el panel mostrara
  // "9 de abril" cuando el usuario en Espana ya estaba en el dia 10.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

// ── Helpers de fecha para informes semanales ──────────────────────────────
// Lunes ISO de la fecha pasada → YYYY-MM-DD (semana arranca en lunes).
// Reusado por CrearInformeModal y por las validaciones del flujo de informes.
export function mondayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

// Devuelve los 7 ISO de la semana cuya raiz es `monday` (Lun → Dom).
export function weekDatesOf(monday) {
  const [y, m, d] = monday.split('-').map(Number);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + i);
    const pad = (n) => String(n).padStart(2, '0');
    out.push(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`);
  }
  return out;
}

// ── Bullets categorizados para informes (entregable / avance) ──────────────
// getBullets(progressByClientItem) → siempre devuelve [{ text, category }].
// Si el item tiene `bullets`, los devuelve tal cual.
// Si solo tiene `text` (formato viejo), parsea cada linea como bullet sin
// categoria (category=null). Esto da retrocompatibilidad total: informes
// viejos se siguen mostrando como antes y se pueden migrar editandolos.
// fallbackBulletId — id deterministico de fallback para bullets sin id en runtime.
// Es solo un puente: cuando un informe se reabra/guarda, ensureBulletIds asigna
// los ids reales. Sirve para que el badge de comentarios no parpadee mientras
// llega el siguiente save.
function fallbackBulletId(item, idx, text) {
  const seed = `${item?.client_id || ''}::${idx}::${text}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return 'bx_' + Math.abs(h).toString(36);
}

export function getBullets(item) {
  if (!item) return [];
  if (Array.isArray(item.bullets) && item.bullets.length > 0) {
    return item.bullets.map((b, i) => {
      const text = String(b?.text || '').trim();
      return {
        text,
        category: b?.category === 'entregable' || b?.category === 'avance' ? b.category : null,
        id: b?.id || fallbackBulletId(item, i, text),
        ...(b?.task_id ? { task_id: b.task_id } : {}),
        ...(Array.isArray(b?.attachments) && b.attachments.length ? { attachments: b.attachments } : {}),
      };
    }).filter(b => b.text);
  }
  return String(item.text || '')
    .split('\n')
    .map(l => l.replace(/^[\s\-•·*]+/, '').trim())
    .filter(Boolean)
    .map((text, i) => ({ text, category: null, id: fallbackBulletId(item, i, text) }));
}

// ensureBulletIds — recorre progress_by_client y rellena `id` en cualquier
// bullet que no lo tenga, generando uno estable (b_<ts>_<rnd>). Llamar antes
// de persistir (addTeamReport / updateTeamReport) para que los comentarios
// puedan referenciar bullet_id de forma confiable.
export function ensureBulletIds(progressByClient) {
  if (!Array.isArray(progressByClient)) return progressByClient;
  const ts = Math.floor(Date.now() / 1000);
  const rnd = () => Math.random().toString(36).slice(2, 8);
  return progressByClient.map(item => {
    if (!item || !Array.isArray(item.bullets) || item.bullets.length === 0) return item;
    const bullets = item.bullets.map(b => {
      if (b && b.id) return b;
      return { ...(b || {}), id: 'b_' + ts + '_' + rnd() };
    });
    return { ...item, bullets };
  });
}

// Convierte un array de bullets [{text, category}] en el `text` legacy que
// algunos renderers viejos esperan. Se sigue escribiendo en cada save para
// que un informe del flujo nuevo se pueda leer aunque alguien apague el flag.
export function serializeBullets(bullets) {
  if (!Array.isArray(bullets)) return '';
  return bullets
    .map(b => String(b?.text || '').trim())
    .filter(Boolean)
    .map(t => `- ${t}`)
    .join('\n');
}

export function fmtDate(d) {
  if (!d) return '\u2014';
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

/**
 * Formato corto dia-semana + numero (ej: "Mar 13" para martes 13).
 * Pensado para etiquetas compactas en el timeline.
 */
export function fmtDayShort(d) {
  if (!d) return '';
  const date = new Date(d + 'T12:00:00');
  const days = ['Dom', 'Lun', 'Mar', 'Mi\u00e9', 'Jue', 'Vie', 'S\u00e1b'];
  return `${days[date.getDay()]} ${date.getDate()}`;
}

// Hora relativa amable de un timestamp (created_at): "rec\u00e9n", "hace X min",
// hora, "ayer", "hace N d\u00edas", o fecha corta. Usada en el buz\u00f3n de
// notificaciones y en el panel de comentarios (antes estaba duplicada).
export function fmtTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'reci\u00e9n';
  if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const diffDays = Math.floor(diffSec / 86400);
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays} d\u00edas`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

// Etiqueta de d\u00eda para agrupar feeds (Hoy / Ayer / fecha larga).
export function dayKey(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Hoy';
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (sameDay(d, yest)) return 'Ayer';
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
}

/**
 * Devuelve true si el dateStr (YYYY-MM-DD) cae dentro del rango del filtro.
 * range: 'all' | 'this-week' | 'next-week' | 'this-month' | 'overdue'
 * Semana empieza en lunes. Sin dateStr siempre devuelve false (salvo 'all').
 */
export function isInDueRange(dateStr, range) {
  if (range === 'all' || !range) return true;
  if (!dateStr) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  target.setHours(12, 0, 0, 0);
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  if (range === 'overdue') return target < today;

  // Lunes de esta semana (getDay: 0=Dom..6=Sab, convertir a Lun=0..Dom=6)
  const dayFromMonday = (today.getDay() + 6) % 7;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - dayFromMonday);
  const thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisMonday.getDate() + 6);

  if (range === 'this-week') return target >= thisMonday && target <= thisSunday;
  if (range === 'next-week') {
    const nextMonday = new Date(thisMonday);
    nextMonday.setDate(thisMonday.getDate() + 7);
    const nextSunday = new Date(thisSunday);
    nextSunday.setDate(thisSunday.getDate() + 7);
    return target >= nextMonday && target <= nextSunday;
  }
  if (range === 'this-month') {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return target >= firstDay && target <= lastDay;
  }
  return true;
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
    const override = c && c.phaseNameOverrides && c.phaseNameOverrides[k];
    // Sentinel "__HIDDEN__" = el cliente oculto esa fase global. La omitimos
    // del mapa para que no aparezca en pickers/dropdowns en ningun lado.
    if (override === '__HIDDEN__') return;
    merged[k] = {
      label: override || v.label,
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
 * isKorexClient: detecta el "cliente" interno de la empresa (Korex). Misma regex
 * que ya se usaba inline en varias vistas, centralizada para reusarla.
 */
export function isKorexClient(client) {
  return /empresa|korex/i.test(client?.name || '');
}

/**
 * normalizeName: minúsculas + sin acentos + espacios colapsados. Para comparar
 * nombres de responsables de forma robusta: "Matías" == "matias" == " Matias ".
 * Evita que una tarea "desaparezca" para su responsable por un acento o espacio.
 */
export function normalizeName(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * assigneeMatches: ¿el string de responsables (nombres separados por coma)
 * incluye al `filter` dado? Normaliza acentos/espacios en ambos lados. Filtro
 * 'all' o vacío matchea todo. Centraliza la lógica que estaba duplicada (con
 * bug de acentos) en cada vista de tareas.
 */
export function assigneeMatches(assignee, filter) {
  if (!filter || filter === 'all') return true;
  const target = normalizeName(filter);
  if (!target) return true;
  if (!assignee) return false;
  return assignee.split(',').map(s => normalizeName(s)).filter(Boolean).includes(target);
}

/**
 * userOwnsTask: ¿la tarea está asignada al usuario actual? Misma lógica que el
 * filtro "Mis tareas" de TasksPage y el isMine de BulletRows. `assignee` es un
 * texto con nombres separados por coma (nombre completo, nombre parcial o id).
 * Normaliza acentos/espacios para no dejar invisible una tarea por "Matías" vs
 * "Matias".
 */
export function userOwnsTask(task, currentUser, teamMembers = []) {
  if (!task?.assignee || !currentUser) return false;
  const names = [
    normalizeName(currentUser.name),
    normalizeName((currentUser.name || '').split(' ')[0]),
    normalizeName(currentUser.id),
  ].filter(Boolean);
  const me = (teamMembers || []).find(m => m.id === currentUser.id);
  if (me?.name) names.push(normalizeName(me.name));
  const parts = task.assignee.split(',').map(s => normalizeName(s)).filter(Boolean);
  return parts.some(p => names.includes(p));
}

/**
 * isReviewerOf: ¿la persona (filtro por nombre/id) es el REVISOR de la tarea y
 * la tarea está EN REVISIÓN? El revisor solo "ve" la tarea cuando llega a
 * `en-revision`, para poder revisarla y pasarla a Validado. En cualquier otro
 * estado la tarea no le aparece por ser revisor.
 */
export function isReviewerOf(task, filter) {
  if (task?.status !== 'en-revision' || !task?.reviewer) return false;
  if (!filter || filter === 'all') return false;
  return assigneeMatches(task.reviewer, filter);
}

/**
 * userSeesTask: ¿el usuario ve la tarea en su tablero? Es responsable, O es el
 * revisor y la tarea está en revisión (para poder validarla). Se usa donde la
 * visibilidad de un no-admin hoy usa `userOwnsTask` en el tablero de tareas, así
 * el revisor no-admin ve la tarea justo cuando le toca revisarla.
 */
export function userSeesTask(task, currentUser, teamMembers = []) {
  if (userOwnsTask(task, currentUser, teamMembers)) return true;
  if (task?.status === 'en-revision' && task?.reviewer) {
    return userOwnsTask({ assignee: task.reviewer }, currentUser, teamMembers);
  }
  return false;
}

/**
 * getBottleneck: "Pendiente para avanzar" es un texto MANUAL por cliente,
 * editado a mano desde la lista de clientes y guardado en Supabase (columna
 * `bottleneck`). El sistema NUNCA lo deriva ni lo pisa automaticamente.
 */
export function getBottleneck(c) {
  return c.bottleneck || '';
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

// Lista por defecto de "recursos pendientes" que el cliente nos debe enviar al
// arrancar. Sirve como fallback cuando el admin todavia no configuro la
// plantilla en Configuracion. Cada item: { id, label, description }.
export const DEFAULT_PENDING_RESOURCES = [
  { id: 'logo',          label: 'Logo en alta resolución',                                 description: 'Versión vectorial (.svg/.ai) o PNG transparente 2000px+.' },
  { id: 'palette',       label: 'Paleta de colores',                                       description: 'Si no tenés definida, decinos qué colores te gustan o representan tu marca.' },
  { id: 'typography',    label: 'Tipografía',                                              description: 'Fuente que usás en tu marca o referencias visuales que te gusten.' },
  { id: 'pro-photos',    label: 'Imágenes profesionales tuyas',                            description: 'Fotos de retrato, en cámara o producción profesional.' },
  { id: 'lifestyle',     label: 'Imágenes de estilo de vida, viajes, con la familia',     description: 'Fotos reales que muestren tu día a día, lugares y entorno.' },
  { id: 'corporate',     label: 'Imágenes y videos corporativos',                          description: 'Eventos, escenarios, premios, material general de autoridad.' },
  { id: 'testimonials',  label: 'Grabación horizontal de mínimo 3 testimonios',            description: 'Para la landing page (producto y/o oportunidad). Horizontales, buena luz y audio.' },
  { id: 'presentations', label: 'Presentaciones grabadas en YouTube u otra plataforma',    description: 'Charlas, masterclasses o talks tuyos disponibles online.' },
  { id: 'pdf-company',   label: 'PDF de la empresa, plan de compensación e info corporativa', description: 'Material oficial del producto u oportunidad que representás.' },
  { id: 'competitors',   label: 'Lista de competidores o referentes',                      description: 'Cuentas, marcas o personas que admires o que sigan tu mismo público.' },
  { id: 'meta-session',  label: 'Agendar sesión para configurar Meta de FB/IG',           description: 'Coordinar llamada con nuestro equipo para dejar el Business Manager listo.' },
];

// Crea los "recursos pendientes" iniciales para un cliente nuevo a partir de
// la plantilla configurada (app_settings.pending_resources_template). Si no
// hay plantilla, usa DEFAULT_PENDING_RESOURCES. Cada item arranca con
// done=false y un uid unico para que sea editable/borrable de forma estable.
export function buildInitialPendingResources(template) {
  const base = Array.isArray(template) && template.length > 0 ? template : DEFAULT_PENDING_RESOURCES;
  return base.map((it, i) => ({
    id: 'pr_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
    label: it.label || '',
    description: it.description || '',
    done: false,
  }));
}

export function mkClient(name, company, service, start, pm, clientCount = 0, { phone, slackChannel, avatarUrl, pendingResourcesTemplate, tier, conector, closer, contractData, niche, email, country, priority, status, notes, billingAmount, billingCurrency, billingCycle, billingInstallments, nextChargeDate, paymentMethod, billingStatus, driveFolderUrl } = {}) {
  return {
    id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    name, company, service, startDate: start, pm,
    color: ['#5B7CF5', '#22C55E', '#EAB308', '#F97316', '#8B5CF6', '#06B6D4', '#EC4899'][clientCount % 7],
    status: status || 'active', priority: priority || 5, bottleneck: '', notes: notes || '',
    tier: tier || 'starter',
    conector: conector || '', closer: closer || '', contractData: contractData || '',
    niche: niche || '', email: email || '', country: country || '',
    billingAmount: billingAmount ?? null,
    billingCurrency: billingCurrency || 'EUR',
    billingCycle: billingCycle || 'mensual',
    billingInstallments: billingInstallments || 1,
    nextChargeDate: nextChargeDate || null,
    paymentMethod: paymentMethod || '',
    billingStatus: billingStatus || 'al_dia',
    phone: phone || '', avatarUrl: avatarUrl || '',
    driveFolderUrl: driveFolderUrl || '',
    slackChannel: slackChannel || '', slackChannelId: '', metaAds: [], metaMetrics: null,
    customSteps: [], customPhases: [], clientFeedbacks: [],
    stepNameOverrides: {}, phaseNameOverrides: {},
    steps: PROCESS_STEPS.map((ps) => ({ status: 'pending', startDate: '', endDate: '', responsible: '', notes: '', dependsOn: ps.dependsOn ? [...ps.dependsOn] : [] })),
    feedback: [],
    links: [],
    pendingResources: buildInitialPendingResources(pendingResourcesTemplate),
    history: [{ text: 'Cliente creado', date: start || today(), color: '#5B7CF5' }]
  };
}

/**
 * Crea las tareas iniciales de un cliente nuevo a partir de un template.
 *
 * Acepta dos formas de template:
 *   - El nuevo (objeto con `phases` y `tasks`, viene de app_settings)
 *   - El viejo hardcodeado (array DEFAULT_TASKS_TEMPLATE como fallback)
 *
 * Cada tarea hereda `daysFromUnblock` (o el legacy `days`) que despues
 * usa recomputeStartedDates para calcular `dueDate` automaticamente cuando
 * la tarea queda habilitada.
 */
export function createDefaultTasks(clientId, template = null) {
  // Normalizar input: aceptar { phases, tasks } o array legacy
  let taskList;
  if (template && Array.isArray(template.tasks)) {
    taskList = template.tasks;
  } else if (Array.isArray(template)) {
    taskList = template;
  } else {
    taskList = DEFAULT_TASKS_TEMPLATE;
  }
  // Primera pasada: generar IDs y mapear templateId -> nuevo taskId
  // para poder remapear las dependencias en la segunda pasada.
  const tplIdToNewId = {};
  const prepared = taskList.map(tpl => {
    const newId = 't_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '_' + tpl.id;
    tplIdToNewId[tpl.id] = newId;
    return { tpl, newId };
  });
  return prepared.map(({ tpl, newId }) => {
    const phaseId = tpl.phaseId || tpl.phase;
    const isClientTask = tpl.isClientTask !== undefined ? tpl.isClientTask : !!tpl.client;
    const daysFromUnblock = tpl.daysFromUnblock !== undefined ? tpl.daysFromUnblock : tpl.days;
    // Remapear cada dep del template (templateId) al id real de la tarea del cliente.
    // Si por algun motivo la dep no esta en el template, la dejamos como viene (fallback).
    const remappedDeps = (tpl.dependsOn || []).map(depTplId => tplIdToNewId[depTplId] || depTplId);
    return {
      id: newId,
      title: tpl.name,
      clientId,
      phase: phaseId,
      status: 'backlog',
      assignee: tpl.assignee || '',
      priority: 'normal',
      stepIdx: null,
      dependsOn: remappedDeps,
      isRoadmapTask: true,
      templateId: tpl.id,
      estimatedDays: daysFromUnblock,
      daysFromUnblock: daysFromUnblock != null ? Number(daysFromUnblock) : null,
      isClientTask,
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
    };
  });
}

export function mkTask(title, clientId, assignee, priority, status, notes, stepIdx) {
  return {
    id: 't_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    title, clientId, assignee: assignee || '', priority: priority || 'normal',
    stepIdx: stepIdx !== undefined && stepIdx !== null && stepIdx !== '' ? parseInt(stepIdx) : null,
    status: status || 'backlog', notes: notes || '', description: '', createdDate: today(),
    startedDate: null, completedDate: null, blockedSince: null, dueDate: null,
    definitionOfDone: '', acceptanceCriteria: [], reviewer: null,
    validatedBy: null, validatedAt: null, sprintHistory: [], statusHistory: [],
  };
}

export function effectiveTime(task) {
  if (!task.startedDate) return null;
  const end = task.completedDate || today();
  const total = daysBetween(task.startedDate, end);
  return total;
}

/**
 * Check if a task's timer should be running.
 * - 'done' nunca corre (está congelado por completedDate).
 * - Cualquier estado con `pausesTimer: true` en TASK_STATUS pausa el contador
 *   (hoy: en-revision, paused, blocked).
 * - Si tiene dependencias sin terminar, tampoco corre.
 */
export function isTimerRunning(task, allClientTasks) {
  if (task.status === 'done') return false;
  const cfg = TASK_STATUS[task.status];
  if (cfg && cfg.pausesTimer) return false;
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
 * Get total elapsed days for a task.
 * - Done: usa startedDate → completedDate (tiempo real que tardo).
 * - Active con timer: accumulatedDays + extra desde timerStartedAt.
 * - Sin timer: accumulatedDays (congelado).
 */
export function getElapsedDays(task, allClientTasks) {
  // Tarea completada: calcular desde startedDate hasta completedDate (tiempo fijo)
  if (task.status === 'done') {
    if (task.startedDate && task.completedDate) {
      const d = daysBetween(task.startedDate, task.completedDate);
      return d != null && d >= 0 ? d : 0;
    }
    // Fallback: accumulatedDays (ya fue congelado al pasar a done)
    return task.accumulatedDays || 0;
  }
  // Tarea activa: accumulated + running period
  let total = task.accumulatedDays || 0;
  if (task.timerStartedAt && isTimerRunning(task, allClientTasks)) {
    const extra = daysBetween(task.timerStartedAt, today());
    if (extra > 0) total += extra;
  }
  return Math.round(total * 10) / 10;
}

/**
 * Una tarea está "habilitada" si no está bloqueada y todas sus dependencias
 * están en done. `done` tambien cuenta como habilitada (trabajo ya realizado).
 * dependsOn puede contener task.id o templateId.
 */
export function isTaskEnabled(task, allClientTasks) {
  if (task.status === 'blocked') return false;
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
 * Tareas que bloquean a `task` y todavía NO están validadas (status !== 'done').
 * "Bloqueada por" usa el mismo campo dependsOn (array de task.id) que el roadmap.
 * Devuelve los objetos tarea bloqueadores pendientes (vacío = la tarea está libre).
 */
export function blockingTasks(task, allTasks) {
  if (!task || !Array.isArray(task.dependsOn) || task.dependsOn.length === 0) return [];
  return task.dependsOn
    .map(depId => (allTasks || []).find(t => t.id === depId || t.templateId === depId))
    .filter(dep => dep && dep.status !== 'done');
}

/** ¿La tarea está bloqueada por otra tarea sin validar? */
export function isTaskBlocked(task, allTasks) {
  return blockingTasks(task, allTasks).length > 0;
}

/**
 * Aplica la regla del plan de fechas:
 * - done → no toca startedDate (congelado)
 * - habilitada y sin startedDate → startedDate = hoy
 * - no habilitada y con startedDate → limpiar (null)
 *
 * Devuelve un array nuevo con las tareas actualizadas (solo las que cambiaron
 * tienen objeto nuevo; el resto se mantiene por referencia).
 */
export function recomputeStartedDates(tasks) {
  const byClient = {};
  tasks.forEach(t => {
    if (!byClient[t.clientId]) byClient[t.clientId] = [];
    byClient[t.clientId].push(t);
  });
  const nowIso = today();
  // Helper local: sumar dias a una fecha YYYY-MM-DD respetando timezone local
  const addDaysToDate = (dateStr, n) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + Math.round(n));
    const pad = (x) => String(x).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  };
  return tasks.map(t => {
    if (t.status === 'done') return t;
    const clientTasks = byClient[t.clientId] || [];
    const enabled = isTaskEnabled(t, clientTasks);
    if (enabled && !t.startedDate) {
      // Tarea recien habilitada: setear startedDate y, si tiene daysFromUnblock
      // y NO tiene dueDate manual, calcularla automaticamente.
      const update = { ...t, startedDate: nowIso };
      if (!t.dueDate && t.daysFromUnblock != null && t.daysFromUnblock >= 0) {
        update.dueDate = addDaysToDate(nowIso, t.daysFromUnblock);
      }
      return update;
    }
    if (!enabled && t.startedDate) return { ...t, startedDate: null };
    return t;
  });
}

/**
 * Días estimados = dueDate - startedDate. Solo se calcula si hay dueDate.
 * El campo legacy `estimatedDays` del template ya NO se usa como fuente.
 */
export function getEstimatedDays(task) {
  if (!task || !task.dueDate) return null;
  const ref = task.startedDate || today();
  const d = daysBetween(ref, task.dueDate);
  if (d !== null && d >= 0) return d;
  return null;
}

/**
 * Migration: convert old client steps to new roadmap tasks.
 */
export function migrateClientToRoadmap(client) {
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

// ── Sprint (Kanban ágil) ─────────────────────────────────────────────────────

// El sprint "activo" es el que el equipo está corriendo ahora. Preferimos el
// que tenga status 'active'; si hubiera varios, el de fecha de inicio más
// reciente; si ninguno está 'active', el último por start_date.
export function getActiveSprint(sprints) {
  const list = Array.isArray(sprints) ? sprints : [];
  if (list.length === 0) return null;
  const byStart = (a, b) => String(b.startDate || '').localeCompare(String(a.startDate || ''));
  const actives = list.filter(s => s.status === 'active').sort(byStart);
  if (actives.length) return actives[0];
  return [...list].sort(byStart)[0] || null;
}

export function isInSprint(task, sprint) {
  if (!task || !sprint) return false;
  return task.sprintId === sprint.id;
}

// Tareas que pertenecen a un sprint dado.
export function sprintTasks(tasks, sprint) {
  if (!sprint) return [];
  return (tasks || []).filter(t => t.sprintId === sprint.id);
}

// Cuántas tareas del sprint están en una columna/estado (para el tope de WIP).
export function wipCount(tasks, sprint, status) {
  return sprintTasks(tasks, sprint).filter(t => t.status === status).length;
}

// Resumen del sprint para el panel de cabecera.
export function sprintProgress(tasks, sprint) {
  const list = sprintTasks(tasks, sprint);
  const total = list.length;
  const done = list.filter(t => t.status === 'done').length;
  const wip = list.filter(t => t.status === 'in-progress').length;
  // Bloqueos "actuales" del sprint: una tarea del sprint trabada por OTRA que
  // también está en el sprint y todavía sin validar. Así el contador refleja
  // bloqueos reales de la semana y NO las dependencias heredadas del roadmap
  // viejo (cuyas bloqueadoras suelen estar fuera del sprint).
  const sprintIds = new Set(list.map(t => t.id));
  const blocked = list.filter(t =>
    t.status !== 'done' && blockingTasks(t, tasks).some(b => sprintIds.has(b.id)),
  ).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, wip, blocked, pct };
}

// Días restantes del sprint (hasta end_date, inclusive).
export function sprintDaysLeft(sprint) {
  if (!sprint || !sprint.endDate) return null;
  const d = daysBetween(today(), sprint.endDate);
  return d == null ? null : Math.max(0, d);
}

// ── Tracking, validación, sprints (mejoras v5) ───────────────────────────────

// Tiempo por estado de una tarea, derivado de los eventos 'system' de status en
// task_comments (created_at). NO usa tabla nueva: reusa el historial que ya se
// graba en cada cambio de estado. Devuelve días (float) por estado, el estado
// actual y desde cuándo. Si la tarea no tiene historial (tareas viejas), atribuye
// todo el tiempo al estado actual (aproximación honesta).
export function computeStatusDurations(task, taskComments) {
  if (!task) return { byStatus: {}, current: null, total: 0, hasHistory: false };
  const MS_DAY = 864e5;
  const pick = (v) => {
    if (!v) return null;
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00' : v;
    const ms = new Date(iso).getTime();
    return Number.isNaN(ms) ? null : ms;
  };
  // Fin del cómputo: ahora, salvo done (usa validación/completado).
  let endMs = Date.now();
  if (task.status === 'done') {
    const e = pick(task.validatedAt) ?? pick(task.completedDate ? task.completedDate + 'T23:59:59' : null);
    if (e != null) endMs = e;
  }
  // Timeline de "entradas a cada estado" (ms). Fuente primaria: status_history
  // (desacoplado del feed de comentarios). Fallback: los eventos system viejos del
  // feed (tareas anteriores al cambio de junio). Si no hay ninguno → vacío.
  let timeline = [];
  if (Array.isArray(task.statusHistory) && task.statusHistory.length) {
    timeline = task.statusHistory
      .map(h => ({ status: h.status, ms: pick(h.at) }))
      .filter(e => e.status && e.ms != null)
      .sort((a, b) => a.ms - b.ms);
  } else {
    const evs = (taskComments || [])
      .filter(c => c.task_id === task.id && c.kind === 'system' && c.event_meta && c.event_meta.field === 'status' && c.created_at)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (evs.length) {
      const startMs = pick(task.createdDate) ?? new Date(evs[0].created_at).getTime();
      timeline.push({ status: evs[0].event_meta.from || 'backlog', ms: startMs });
      evs.forEach(e => timeline.push({ status: e.event_meta.to || task.status, ms: new Date(e.created_at).getTime() }));
    }
  }
  const byMs = {};
  const add = (status, ms) => { if (status && ms > 0) byMs[status] = (byMs[status] || 0) + ms; };
  const hasHistory = timeline.length > 0;
  let currentSinceMs;
  if (hasHistory) {
    for (let i = 0; i < timeline.length; i++) {
      const segEnd = i + 1 < timeline.length ? timeline[i + 1].ms : endMs;
      add(timeline[i].status, segEnd - timeline[i].ms);
    }
    currentSinceMs = timeline[timeline.length - 1].ms;
  } else {
    // Sin historial real: NO inventamos un desglose ni medimos desde la creación.
    // Anclamos el "estado actual" en el mejor campo guardado (aproximado honesto);
    // la ficha aclara que el seguimiento arranca desde el próximo cambio.
    if (task.status === 'blocked') currentSinceMs = pick(task.blockedSince);
    else if (task.status === 'in-progress' || task.status === 'en-revision' || task.status === 'priorizado') currentSinceMs = pick(task.startedDate);
    else if (task.status === 'done') currentSinceMs = pick(task.validatedAt) ?? pick(task.completedDate);
    else currentSinceMs = pick(task.createdDate);
    if (currentSinceMs == null) currentSinceMs = pick(task.createdDate) ?? Date.now();
  }
  const byStatus = {};
  let total = 0;
  Object.keys(byMs).forEach(k => { byStatus[k] = byMs[k] / MS_DAY; total += byMs[k]; });
  const current = { status: task.status, sinceISO: new Date(currentSinceMs).toISOString(), days: Math.max(0, (endMs - currentSinceMs) / MS_DAY) };
  return { byStatus, current, total: total / MS_DAY, hasHistory };
}

// Formato compacto de una duración en días → "3d" / "5h" / "12m" / "<1m".
export function fmtDuration(days) {
  if (days == null || Number.isNaN(days)) return '';
  if (days >= 1) return `${Math.round(days)}d`;
  const hours = days * 24;
  if (hours >= 1) return `${Math.round(hours)}h`;
  const mins = hours * 60;
  if (mins >= 1) return `${Math.round(mins)}m`;
  return '<1m';
}

// Criterios de aceptación obligatorios: la tarea solo se puede validar si TODOS
// están tildados. Sin criterios → no se gatea (compat con tareas existentes).
export function canValidate(task) {
  const ac = Array.isArray(task?.acceptanceCriteria) ? task.acceptanceCriteria : [];
  if (ac.length === 0) return true;
  return ac.every(c => c.done);
}

// Cantidad de criterios de aceptación sin completar.
export function pendingCriteria(task) {
  const ac = Array.isArray(task?.acceptanceCriteria) ? task.acceptanceCriteria : [];
  return ac.filter(c => !c.done).length;
}

// "Lleva N sprints": cantidad de sprints distintos por los que pasó la tarea.
// Deriva de sprintHistory + el sprint actual. Mínimo 1 si está en un sprint.
export function sprintCount(task) {
  const hist = Array.isArray(task?.sprintHistory) ? task.sprintHistory : [];
  const uniq = new Set(hist.filter(Boolean));
  if (task?.sprintId) uniq.add(task.sprintId);
  return Math.max(uniq.size, task?.sprintId ? 1 : 0);
}

// Un sprint cerrado bloquea el cambio de estado de sus tareas (solo se permite
// moverlas al sprint activo).
export function isSprintLocked(sprint) {
  return sprint?.status === 'closed';
}

// ¿La tarea está asignada a este miembro? assignee es texto CSV ("David, Matias").
export function isAssignedTo(task, member) {
  if (!task?.assignee || !member) return false;
  const parts = task.assignee.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const names = [member.name?.toLowerCase(), member.name?.toLowerCase().split(' ')[0], member.id?.toLowerCase()].filter(Boolean);
  return parts.some(p => names.includes(p));
}

// Equipo interno que se mide en el sprint (Rendimiento). El resto del equipo no
// entra en la tabla de asistencia/informes. Ids de team_members.
export const SPRINT_TEAM_IDS = ['cristian', 'marcos', 'zerillos', 'maria', 'david', 'zil', 'josem', 'matias'];
export const tracksSprint = (m) => SPRINT_TEAM_IDS.includes(m?.id);

// Resumen por persona del sprint (para la tabla en vivo y el snapshot al cerrar).
// Cumplimiento de informes de una persona en la semana del sprint:
// - daily: cuántos informes DIARIOS distintos cargó dentro del rango (máx 5).
// - weekly: si cargó el informe SEMANAL de esa semana.
export function memberReportCompliance(teamReports, memberId, sprint) {
  if (!sprint || !memberId) return { daily: 0, weekly: false };
  const start = sprint.startDate, end = sprint.endDate;
  const dailyDates = new Set();
  let weekly = false;
  (teamReports || []).forEach(r => {
    if (r.user_id !== memberId || !r.report_date) return;
    const inRange = (!start || r.report_date >= start) && (!end || r.report_date <= end);
    if (!inRange) return;
    if (r.report_type === 'daily') dailyDates.add(r.report_date);
    else if (r.report_type === 'weekly') weekly = true;
  });
  return { daily: dailyDates.size, weekly };
}

// Cantidad de dailys a las que asistió una persona (0-5) según el registro manual.
export function attendanceCount(sprint, memberId) {
  const arr = sprint?.dailyAttendance?.[memberId];
  return Array.isArray(arr) ? arr.filter(Boolean).length : 0;
}

// Horas trabajadas por una persona en la semana del sprint, automáticas desde los
// INFORMES DIARIOS: suma los minutos que cargó por cliente (progress_by_client[].minutes)
// en cada informe diario dentro del rango y los pasa a horas. Solo daily (el
// semanal es un resumen → evita doble conteo).
export function memberWorkedHours(teamReports, memberId, sprint) {
  if (!sprint || !memberId) return 0;
  const start = sprint.startDate, end = sprint.endDate;
  let mins = 0;
  (teamReports || []).forEach(r => {
    if (r.user_id !== memberId || r.report_type !== 'daily' || !r.report_date) return;
    if ((start && r.report_date < start) || (end && r.report_date > end)) return;
    (r.progress_by_client || []).forEach(p => { mins += Number(p?.minutes) || 0; });
  });
  return Math.round((mins / 60) * 100) / 100; // horas con 2 decimales
}

export function buildSprintSummary(tasks, teamMembers, sprint, teamReports = []) {
  const st = (tasks || []).filter(t => t.sprintId === sprint?.id);
  // Solo el equipo interno que se mide en el sprint, en el orden definido.
  const team = SPRINT_TEAM_IDS
    .map(id => (teamMembers || []).find(m => m.id === id))
    .filter(Boolean);
  const perPerson = team.map(m => {
    const mt = st.filter(t => isAssignedTo(t, m));
    const comp = memberReportCompliance(teamReports, m.id, sprint);
    return {
      memberId: m.id,
      name: m.name,
      assigned: mt.length,
      inProgress: mt.filter(t => t.status === 'in-progress').length,
      inReview: mt.filter(t => t.status === 'en-revision').length,
      done: mt.filter(t => t.status === 'done').length,
      loadedHours: mt.reduce((s, t) => s + (Number(t.estimatedHours) || 0), 0),
      workedHours: memberWorkedHours(teamReports, m.id, sprint),
      capacity: m.weekly_capacity != null ? Number(m.weekly_capacity) : null,
      // Cumplimiento de la semana (snapshot al cerrar):
      attendance: attendanceCount(sprint, m.id),
      dailyReports: comp.daily,
      weeklyReport: comp.weekly,
    };
  }).filter(Boolean);
  const proposed = st.length;
  const done = st.filter(t => t.status === 'done').length;
  const blockers = st.filter(t => t.status === 'blocked').map(t => t.title);
  return { proposed, done, perPerson, blockers };
}