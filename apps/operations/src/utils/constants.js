export const DEFAULT_TASKS_TEMPLATE = [
  { id: 'registro',      name: 'Registro en finanzas',             phase: 'pre-onboarding',  days: 0.3, client: false, dependsOn: [],                                        assignee: 'Zil Oliveros' },
  { id: 'investigacion', name: 'Investigación Pre-onboarding',     phase: 'pre-onboarding',  days: 0.3, client: false, dependsOn: [],                                        assignee: 'Jose Martin' },
  { id: 'carpetas',      name: 'Armado de carpetas Drive',         phase: 'pre-onboarding',  days: 1,   client: false, dependsOn: [],                                        assignee: 'Zil Oliveros' },
  { id: 'onboarding',    name: 'Onboarding + Config Meta',         phase: 'onboarding',      days: 2,   client: true,  dependsOn: [],                                        assignee: 'Matias' },
  { id: 'estrategia',    name: 'Estrategia, Avatar, Puntos clave', phase: 'primera-entrega', days: 2,   client: false, dependsOn: ['onboarding'],                             assignee: 'Jose Martin' },
  { id: 'guiones-ads',   name: 'Guiones de anuncios',              phase: 'primera-entrega', days: 1,   client: false, dependsOn: ['estrategia'],                             assignee: 'Jose Martin' },
  { id: 'guion-vsl',     name: 'Guion VSL',                        phase: 'primera-entrega', days: 1,   client: false, dependsOn: ['estrategia'],                             assignee: 'Jose Martin' },
  { id: 'landing-texto', name: 'Pre-landing, landing, formulario', phase: 'primera-entrega', days: 1,   client: false, dependsOn: ['estrategia'],                             assignee: 'Jose Martin' },
  { id: 'revision',      name: 'REVISIÓN DEL CLIENTE',             phase: 'primera-entrega', days: 7,   client: true,  dependsOn: ['guiones-ads', 'guion-vsl', 'landing-texto'], assignee: '' },
  { id: 'correcciones',  name: 'Correcciones',                     phase: 'primera-entrega', days: 1,   client: false, dependsOn: ['revision'],                               assignee: 'Jose Martin' },
  { id: 'grabacion',     name: 'GRABACIÓN DEL CLIENTE',            phase: 'primera-entrega', days: 7,   client: true,  dependsOn: ['correcciones'],                           assignee: '' },
  { id: 'edicion',       name: 'Edición anuncios y VSL',           phase: 'primera-entrega', days: 4,   client: false, dependsOn: ['grabacion'],                              assignee: 'Matias' },
  { id: 'diseno',        name: 'Diseño de la landing',             phase: 'primera-entrega', days: 3,   client: false, dependsOn: ['landing-texto', 'revision'],              assignee: 'Jose Zerillo' },
  { id: 'revision-dis',  name: 'REVISIÓN DISEÑO',                  phase: 'primera-entrega', days: 3,   client: true,  dependsOn: ['diseno'],                                 assignee: '' },
  { id: 'codigo',        name: 'Pasar a código el funnel',         phase: 'primera-entrega', days: 4,   client: false, dependsOn: ['revision-dis'],                           assignee: 'Marcos' },
  { id: 'vincular',      name: 'Vincular cuenta y métricas',       phase: 'primera-entrega', days: 3,   client: false, dependsOn: [],                                        assignee: 'David Castañeda' },
  { id: 'cargar-saldo',  name: 'Cargar saldo al networker',        phase: 'primera-entrega', days: 1,   client: false, dependsOn: ['vincular'],                               assignee: 'Zil Oliveros' },
  { id: 'reunion',       name: 'REUNIÓN DE PRESENTACIÓN',          phase: 'primera-entrega', days: 1,   client: true,  dependsOn: ['codigo', 'cargar-saldo'],                 assignee: 'Matias' },
  { id: 'lanzamiento',   name: 'Lanzamiento de Ads',               phase: 'lanzamiento',     days: 1,   client: false, dependsOn: ['reunion'],                                assignee: 'David Castañeda' },
  { id: 'auditoria',     name: 'Auditoría y mejora continua',      phase: 'auditoria',       days: 30,  client: false, dependsOn: ['lanzamiento'],                            assignee: 'David Castañeda' },
];

// Backward compatibility alias
export const PROCESS_STEPS = DEFAULT_TASKS_TEMPLATE;

export const PHASES = {
  'pre-onboarding':  { label: 'Pre-Onboarding',  color: '#8B5CF6' },
  'onboarding':      { label: 'Onboarding',       color: '#5B7CF5' },
  'primera-entrega': { label: 'Primera Entrega',  color: '#EAB308' },
  'lanzamiento':     { label: 'Lanzamiento',      color: '#22C55E' },
  'auditoria':       { label: 'Auditoría',        color: '#06B6D4' },
};

export const PRIO_CLIENT = {
  1: { label: 'SUPER PRIORITARIO', color: '#EF4444' },
  2: { label: 'IMPORTANTES',       color: '#F97316' },
  3: { label: 'NORMAL',            color: '#22C55E' },
  4: { label: 'POCO IMPORTANTES',  color: '#9CA3AF' },
  5: { label: 'NUEVOS',            color: '#8B5CF6' },
  6: { label: 'DESCARTADOS',       color: '#6B7280' },
};

export const TASK_STATUS = {
  backlog:       { label: 'BACKLOG',      color: '#9CA3AF', bg: '#F3F4F6',  icon: '\u25CB' },
  priorizado:    { label: 'PRIORIZADO',   color: '#2563EB', bg: '#E6F1FB',  icon: '\u25CE' },
  'in-progress': { label: 'EN PROGRESO',  color: '#5B7CF5', bg: '#EEF2FF',  icon: '\u25C9' },
  'en-revision': { label: 'EN REVISIÓN',  color: '#EAB308', bg: '#FEFCE8',  icon: '\u25C8', pausesTimer: true },
  paused:        { label: 'PAUSADA',      color: '#A855F7', bg: '#F5F3FF',  icon: '\u23F8', pausesTimer: true },
  done:          { label: 'COMPLETADA',   color: '#22C55E', bg: '#ECFDF5',  icon: '\u2713' },
  blocked:       { label: 'BLOQUEADA',    color: '#EF4444', bg: '#FEF2F2',  icon: '\u2715', pausesTimer: true },
  retrasadas:    { label: 'RETRASADA',    color: '#EF4444', bg: '#FEF2F2',  icon: '\u2298' },
};

export const TASK_STATUS_ORDER = ['backlog', 'priorizado', 'in-progress', 'en-revision', 'paused', 'done', 'blocked', 'retrasadas'];

// ── Modelo Sprint (Kanban ágil) ──────────────────────────────────────────────
// Layout de la sección Tareas. 'sprint' = nuevo modelo (Objetivos + Tablero
// Sprint + To-Do). 'legacy' = vistas viejas (roadmap/timeline/lista/mi-semana).
// Sirve de backup reversible: con un solo valor se vuelve al estilo anterior.
export const TAREAS_LAYOUT = 'sprint';

// Columnas del Tablero Sprint, en orden. Cada una mapea a un `status` real de
// tasks. OJO: "Validado" es el estado `done` de siempre (solo cambia la
// etiqueta) → no se rompe nada de lo que ya cuenta `done`.
export const SPRINT_WIP_DEFAULT = null; // sin tope de "En curso" (antes 8)
export const SPRINT_COLUMNS = [
  { status: 'backlog',     label: 'Backlog',      bg: '#F0F2F5', tx: '#1A1D26' },
  { status: 'priorizado',  label: 'Priorizado',   bg: '#EEF2FF', tx: '#5B7CF5' },
  { status: 'in-progress', label: 'En curso',     bg: '#FFF7ED', tx: '#B45309', wip: SPRINT_WIP_DEFAULT },
  { status: 'en-revision', label: 'En revisión',  bg: '#FDF2F8', tx: '#BE185D' },
  { status: 'done',        label: 'Validado',     bg: '#ECFDF5', tx: '#15803D' },
  // Columna de bloqueos: tareas que no pueden avanzar (bloqueadas a mano o por
  // una dependencia sin validar). El tablero las manda acá automáticamente.
  { status: 'blocked',     label: 'Bloqueos',     bg: '#FEF2F2', tx: '#DC2626' },
];

// Áreas / departamento responsable de la tarea. Ícono SVG (path) + color, según
// el diseño. Se usa en Objetivos, Tablero Sprint y la ficha (selector de Área).
export const DEPARTMENTS = {
  ventas:       { label: 'Ventas',       color: '#16A34A', bg: '#ECFDF5', path: 'M3 17l7-7 4 4 7-7 M17 7h4v4' },
  marketing:    { label: 'Marketing',    color: '#DB2777', bg: '#FDF2F8', path: 'M3 11l16-5v12L3 14z M8 15v3a2 2 0 0 0 4 0v-1' },
  programacion: { label: 'Programación', color: '#2563EB', bg: '#EEF2FF', path: 'M9 8l-5 4 5 4 M15 8l5 4-5 4' },
  operaciones:  { label: 'Operaciones',  color: '#F59E0B', bg: '#FFF7ED', path: 'M12 3 2 8l10 5 10-5z M2 13l10 5 10-5' },
};
export const DEPARTMENT_ORDER = ['ventas', 'marketing', 'programacion', 'operaciones'];

// Prioridad de la tarea (super alta / alta / media / baja). Se guarda en la
// columna `tasks.priority` (texto) y se ve en Objetivos, Tablero Sprint y la
// ficha. Una tarea sin una de estas claves (ej 'normal' legacy o null) = sin
// prioridad → no muestra badge.
export const TASK_PRIORITY = {
  'super-alta': { label: 'Súper alta', short: 'Súper', color: '#DC2626', bg: '#FEF2F2', rank: 1 },
  'alta':       { label: 'Alta',       short: 'Alta',  color: '#F97316', bg: '#FFF7ED', rank: 2 },
  'media':      { label: 'Media',      short: 'Media', color: '#EAB308', bg: '#FEFCE8', rank: 3 },
  'baja':       { label: 'Baja',       short: 'Baja',  color: '#9CA3AF', bg: '#F3F4F6', rank: 4 },
};
export const TASK_PRIORITY_ORDER = ['super-alta', 'alta', 'media', 'baja'];

// Prioridad dentro del sprint (badge 1-5 en Priorizado).
export const SPRINT_PRIORITY = {
  1: { label: 'P1', color: '#EF4444', bg: '#FEF2F2' },
  2: { label: 'P2', color: '#F97316', bg: '#FFF7ED' },
  3: { label: 'P3', color: '#EAB308', bg: '#FEFCE8' },
  4: { label: 'P4', color: '#22C55E', bg: '#ECFDF5' },
  5: { label: 'P5', color: '#9CA3AF', bg: '#F3F4F6' },
};

export const TEAM = [
  { id: 'josem',     name: 'Jose Martin',          role: 'CMO',              color: '#EAB308', initials: 'JM', avatar: 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38c2ea7dcb4cff0d974ec.png' },
  { id: 'david',     name: 'David Castañeda',      role: 'Trafficker',       color: '#F97316', initials: 'DC', avatar: 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/68a4a3df7842793384dc77b7.png' },
  { id: 'marcos',    name: 'Marcos del Rey',        role: 'CTO',             color: '#22C55E', initials: 'MR', avatar: 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38c2e3d829c73b26a9deb.png' },
  { id: 'zil',       name: 'Zil Oliveros',         role: 'Coordinación',    color: '#8B5CF6', initials: 'ZO', avatar: 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38ef24cde4bbc2afcd13e.png' },
  { id: 'matias',    name: 'Matias Braszka',       role: 'COO',             color: '#5B7CF5', initials: 'MB', avatar: 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/684cd8d92809a925e80880c2.png' },
  { id: 'cris',      name: 'Cristian Fernandez',   role: 'CEO',             color: '#06B6D4', initials: 'CF', avatar: 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/68a4a3e0afed7575d4e87884.png' },
  { id: 'zerillos',  name: 'Jose Zerillo',         role: 'Diseño landings', color: '#EC4899', initials: 'JZ', avatar: 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38c8484c045c2748d2fc4.png' },
  { id: 'jordi',     name: 'Jordi Miró Nolla',     role: 'Project Manager', color: '#14B8A6', initials: 'JM' },
  { id: 'christian', name: 'Christian Uscanga',     role: 'Programador',     color: '#A855F7', initials: 'CU', avatar: 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38c8484c045c2748d2fc3.png' },
];

export const STATUS = {
  'pending':        { label: 'Pendiente',    color: '#9CA3AF', pill: 'pill-gray',   icon: '\u25CB' },
  'in-progress':    { label: 'En progreso',  color: '#5B7CF5', pill: 'pill-blue',   icon: '\u25C9' },
  'waiting-client': { label: 'Esp. cliente', color: '#EAB308', pill: 'pill-yellow', icon: '\u25C8' },
  'blocked':        { label: 'Bloqueado',    color: '#EF4444', pill: 'pill-red',    icon: '\u2715' },
  'completed':      { label: 'Completado',   color: '#22C55E', pill: 'pill-green',  icon: '\u2713' },
};

// Fallback data: used in AppContext.jsx injectMetaMetrics() ONLY when Supabase
// doesn't have metaAds/metaMetrics for a client. Once Supabase has the data,
// this map is not used for that client.
export const CLIENT_ADS_DATA = {
  'Sergio Canovas': {
    metaAds: [
      { id: 'act_1820092848871620', name: 'Sergio Canovas Publicidad 2', currency: 'USD', spent: '$5,958', status: 'activa' },
      { id: 'act_1433106604854315', name: 'Sergio Canovas Acc1', currency: 'USD', spent: '$0', status: 'activa' }
    ],
    metaMetrics: { adsActive: false, lastUpdated: '2026-04-04', currency: 'USD', conversionEvent: null, totalSpend7d: 0, totalConversions7d: 0, avgCpl7d: 0, spendYesterday: 0, conversionsYesterday: 0, impressions7d: 0, clicks7d: 0, ctr7d: 0, pauseReason: 'Ads pausados — nueva estrategia lista sin implementar' }
  },
  'Corina Grosu': {
    metaAds: [
      { id: 'act_1405888314437843', name: 'Corina travolium -korex', currency: 'EUR', spent: '\u20AC5,148', status: 'activa' },
      { id: 'act_5767932013250701', name: 'Corina Travorium', currency: 'USD', spent: '$3,652', status: 'activa' },
      { id: 'act_1977603009505248', name: 'Corina Grosu - Nueva Cuenta', currency: 'USD', spent: '$0', status: 'activa' }
    ],
    metaMetrics: { adsActive: true, lastUpdated: '2026-04-04', currency: 'EUR', conversionEvent: 'registro-prelanding', totalSpend7d: 1351.52, totalConversions7d: 729, avgCpl7d: 1.85, spendYesterday: 190.59, conversionsYesterday: 35, impressions7d: 86331, clicks7d: 8674, ctr7d: 10.05 }
  },
  'Jose Luis Rivas': {
    metaAds: [
      { id: 'act_1598435181456308', name: 'RIMAN - JOSE LUIS RIVAS', currency: 'USD', spent: '$147', status: 'activa' }
    ],
    metaMetrics: { adsActive: true, lastUpdated: '2026-04-04', currency: 'USD', conversionEvent: 'envio-whatsapp-skincare', totalSpend7d: 116.57, totalConversions7d: 13, avgCpl7d: 8.97, spendYesterday: 18.30, conversionsYesterday: 31, impressions7d: 9994, clicks7d: 1293, ctr7d: 12.94 }
  },
  'Jose Luis Rodriguez': {
    metaAds: [
      { id: 'act_831178396166416', name: 'Jose Luis Rodriguez', currency: 'EUR', spent: '\u20AC94', status: 'activa' },
      { id: 'act_965622209236640', name: 'Jos\u00e9 Luis Rodriguez - EEUU', currency: 'USD', spent: '$0', status: 'activa' }
    ],
    metaMetrics: { adsActive: true, lastUpdated: '2026-04-04', currency: 'EUR', conversionEvent: 'visita-prelanding', totalSpend7d: 74.57, totalConversions7d: 3, avgCpl7d: 24.86, spendYesterday: 8.20, conversionsYesterday: 0, impressions7d: 5693, clicks7d: 395, ctr7d: 6.94 }
  },
  'Monica Vozmediano': {
    metaAds: [
      { id: 'act_1585613345849627', name: 'MONICA VOZMEDIANO 2', currency: 'USD', spent: '$1,300', status: 'activa' }
    ],
    metaMetrics: { adsActive: true, lastUpdated: '2026-06-09', currency: 'USD', conversionEvent: 'visita-pagina-vsl-monica', totalSpend7d: 1394.15, totalConversions7d: 327, avgCpl7d: 4.26, spendYesterday: 241.30, conversionsYesterday: 59, impressions7d: 91669, clicks7d: 3259, ctr7d: 3.56 }
  },
  'Oscar Palayo': {
    metaAds: [
      { id: 'act_1164206578568839', name: 'Racha crypto', currency: 'EUR', spent: '\u20AC1,175', status: 'activa' }
    ],
    metaMetrics: { adsActive: false, lastUpdated: '2026-04-04', currency: 'EUR', conversionEvent: null, totalSpend7d: 0, totalConversions7d: 0, avgCpl7d: 0, spendYesterday: 0, conversionsYesterday: 0, impressions7d: 0, clicks7d: 0, ctr7d: 0, pauseReason: 'Sin gasto en 7 días — revisar estado de campañas' }
  },
  'Pablo Valladolid': {
    metaAds: [
      { id: 'act_9714878355303239', name: 'Holdex', currency: 'MXN', spent: '$7,790 MXN', status: 'deshabilitada' }
    ],
    metaMetrics: { adsActive: false, lastUpdated: '2026-04-04', currency: 'MXN', conversionEvent: null, totalSpend7d: 0, totalConversions7d: 0, avgCpl7d: 0, spendYesterday: 0, conversionsYesterday: 0, impressions7d: 0, clicks7d: 0, ctr7d: 0, pauseReason: 'Cuenta deshabilitada — saldo pendiente de Meta' }
  },
  'Janeling': {
    metaAds: [
      { id: 'act_1570641757365906', name: 'Janeyling - Korex', currency: 'USD', spent: '$0', status: 'activa' }
    ],
    metaMetrics: { adsActive: false, lastUpdated: '2026-04-04', currency: 'USD', conversionEvent: null, totalSpend7d: 0, totalConversions7d: 0, avgCpl7d: 0, spendYesterday: 0, conversionsYesterday: 0, impressions7d: 0, clicks7d: 0, ctr7d: 0, pauseReason: 'Pre-lanzamiento — cuenta sin campañas activas' }
  },
  'Kate Baltodano': {
    metaAds: [
      { id: 'act_1409141003912013', name: 'Kate - FARMASI', currency: 'USD', spent: '$199', status: 'activa' }
    ],
    metaMetrics: { adsActive: false, lastUpdated: '2026-04-04', currency: 'USD', conversionEvent: null, totalSpend7d: 0, totalConversions7d: 0, avgCpl7d: 0, spendYesterday: 0, conversionsYesterday: 0, impressions7d: 0, clicks7d: 0, ctr7d: 0, pauseReason: 'Sin gasto en 7 días — esperando grabación del cliente' }
  },
  'Gabi Espino': {
    metaAds: [
      { id: 'act_2062804297979658', name: 'Gaby Espino Networker', currency: 'USD', spent: '$0', status: 'activa' }
    ],
    metaMetrics: { adsActive: false, lastUpdated: '2026-04-04', currency: 'USD', conversionEvent: null, totalSpend7d: 0, totalConversions7d: 0, avgCpl7d: 0, spendYesterday: 0, conversionsYesterday: 0, impressions7d: 0, clicks7d: 0, ctr7d: 0, pauseReason: 'Pre-lanzamiento — en fase de estrategia' }
  },
  'Priscila': {
    metaAds: [
      { id: 'act_972848805355277', name: 'Priscilla Esquerra', currency: 'USD', spent: '$0', status: 'activa' }
    ],
    metaMetrics: { adsActive: false, lastUpdated: '2026-04-04', currency: 'USD', conversionEvent: null, totalSpend7d: 0, totalConversions7d: 0, avgCpl7d: 0, spendYesterday: 0, conversionsYesterday: 0, impressions7d: 0, clicks7d: 0, ctr7d: 0, pauseReason: 'Pre-lanzamiento — en fase de onboarding' }
  },
  'Victor Franco': {
    metaAds: [],
    metaMetrics: { adsActive: false, lastUpdated: '2026-04-04', currency: 'USD', conversionEvent: null, totalSpend7d: 0, totalConversions7d: 0, avgCpl7d: 0, spendYesterday: 0, conversionsYesterday: 0, impressions7d: 0, clicks7d: 0, ctr7d: 0, pauseReason: 'Cuenta Meta hackeada — sin cuenta activa' }
  },
  'Empresa (Korex)': {
    metaAds: [
      { id: 'act_479086528217518', name: 'Metodo Korex Account', currency: 'USD', spent: '', status: 'interna' }
    ],
    metaMetrics: null
  }
};