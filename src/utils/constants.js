export const DEFAULT_TASKS_TEMPLATE = [
  { id: 'registro',      name: 'Registro en finanzas',             phase: 'pre-onboarding',  days: 0.3, client: false, dependsOn: [] },
  { id: 'investigacion', name: 'Investigacion Pre-onboarding',     phase: 'pre-onboarding',  days: 0.5, client: false, dependsOn: [] },
  { id: 'carpetas',      name: 'Armado de carpetas Drive',         phase: 'pre-onboarding',  days: 1,   client: false, dependsOn: [] },
  { id: 'onboarding',    name: 'Onboarding + Config Meta',         phase: 'onboarding',      days: 2,   client: true,  dependsOn: [] },
  { id: 'estrategia',    name: 'Estrategia, Avatar, Puntos clave', phase: 'primera-entrega', days: 2,   client: false, dependsOn: ['onboarding'] },
  { id: 'guiones-ads',   name: 'Guiones de anuncios',              phase: 'primera-entrega', days: 1,   client: false, dependsOn: ['estrategia'] },
  { id: 'guion-vsl',     name: 'Guion VSL',                        phase: 'primera-entrega', days: 1,   client: false, dependsOn: ['estrategia'] },
  { id: 'landing-texto', name: 'Pre-landing, landing, formulario', phase: 'primera-entrega', days: 1,   client: false, dependsOn: ['estrategia'] },
  { id: 'revision',      name: 'REVISION DEL CLIENTE',             phase: 'primera-entrega', days: 7,   client: true,  dependsOn: ['guiones-ads', 'guion-vsl', 'landing-texto'] },
  { id: 'correcciones',  name: 'Correcciones',                     phase: 'primera-entrega', days: 1,   client: false, dependsOn: ['revision'] },
  { id: 'grabacion',     name: 'GRABACION DEL CLIENTE',            phase: 'primera-entrega', days: 7,   client: true,  dependsOn: ['correcciones'] },
  { id: 'edicion',       name: 'Edicion anuncios y VSL',           phase: 'primera-entrega', days: 4,   client: false, dependsOn: ['grabacion'] },
  { id: 'diseno',        name: 'Diseno de la landing',             phase: 'primera-entrega', days: 3,   client: false, dependsOn: ['landing-texto', 'revision'] },
  { id: 'revision-dis',  name: 'REVISION DISENO',                  phase: 'primera-entrega', days: 3,   client: true,  dependsOn: ['diseno'] },
  { id: 'codigo',        name: 'Pasar a codigo el funnel',         phase: 'primera-entrega', days: 4,   client: false, dependsOn: ['revision-dis'] },
  { id: 'vincular',      name: 'Vincular cuenta y metricas',       phase: 'primera-entrega', days: 3,   client: false, dependsOn: [] },
  { id: 'cargar-saldo',  name: 'Cargar saldo al networker',        phase: 'primera-entrega', days: 1,   client: false, dependsOn: ['vincular'] },
  { id: 'reunion',       name: 'REUNION DE PRESENTACION',          phase: 'primera-entrega', days: 1,   client: true,  dependsOn: ['codigo', 'cargar-saldo'] },
  { id: 'lanzamiento',   name: 'Lanzamiento de Ads',               phase: 'lanzamiento',     days: 1,   client: false, dependsOn: ['reunion'] },
  { id: 'auditoria',     name: 'Auditoria y mejora continua',      phase: 'auditoria',       days: 30,  client: false, dependsOn: ['lanzamiento'] },
];

// Backward compatibility alias
export const PROCESS_STEPS = DEFAULT_TASKS_TEMPLATE;

export const PHASES = {
  'pre-onboarding':  { label: 'Pre-Onboarding',  color: '#8B5CF6' },
  'onboarding':      { label: 'Onboarding',       color: '#5B7CF5' },
  'primera-entrega': { label: 'Primera Entrega',  color: '#EAB308' },
  'lanzamiento':     { label: 'Lanzamiento',      color: '#22C55E' },
  'auditoria':       { label: 'Auditoria',        color: '#06B6D4' },
};

export const PRIO_CLIENT = {
  1: { label: 'CRITICO',     color: '#EF4444' },
  2: { label: 'URGENTE',     color: '#F97316' },
  3: { label: 'ATENCION',    color: '#EAB308' },
  4: { label: 'EN PROGRESO', color: '#5B7CF5' },
  5: { label: 'NUEVO',       color: '#8B5CF6' },
};

export const TASK_PRIO = {
  urgent: { label: 'Urgente', color: '#EF4444', flag: '\u{1F6A9}', sort: 0 },
  high:   { label: 'Alta',    color: '#F97316', flag: '\u{1F3F3}', sort: 1 },
  normal: { label: 'Normal',  color: '#5B7CF5', flag: '\u{1F3F3}', sort: 2 },
  low:    { label: 'Baja',    color: '#9CA3AF', flag: '\u{1F3F3}', sort: 3 },
};

export const TASK_STATUS = {
  backlog:       { label: 'BACKLOG',      color: '#9CA3AF', bg: '#F3F4F6',  icon: '\u25CB' },
  'in-progress': { label: 'EN PROGRESO',  color: '#5B7CF5', bg: '#EEF2FF',  icon: '\u25C9' },
  'en-revision': { label: 'EN REVISION',  color: '#EAB308', bg: '#FEFCE8',  icon: '\u25C8' },
  done:          { label: 'COMPLETADA',   color: '#22C55E', bg: '#ECFDF5',  icon: '\u2713' },
  blocked:       { label: 'BLOQUEADA',    color: '#EF4444', bg: '#FEF2F2',  icon: '\u2715' },
  retrasadas:    { label: 'RETRASADA',    color: '#EF4444', bg: '#FEF2F2',  icon: '\u2298' },
};

export const TASK_STATUS_ORDER = ['backlog', 'in-progress', 'en-revision', 'done', 'blocked', 'retrasadas'];

export const TEAM = [
  { id: 'josem',  name: 'Jose Martin', role: 'CMO',          color: '#EAB308', initials: 'JM' },
  { id: 'david',  name: 'David',       role: 'Trafficker',   color: '#F97316', initials: 'DV' },
  { id: 'marcos', name: 'Marcos',      role: 'CTO',          color: '#22C55E', initials: 'MC' },
  { id: 'zil',    name: 'Zil',         role: 'Coordinacion', color: '#8B5CF6', initials: 'ZL' },
  { id: 'matias', name: 'Matias',      role: 'COO',          color: '#5B7CF5', initials: 'MB' },
  { id: 'cris',   name: 'Cristian',    role: 'CEO',          color: '#06B6D4', initials: 'CF' },
];

export const USERS = {
  matias:   { pass: 'korex2026', name: 'Matias Braszka',     role: 'COO',          initials: 'MB', color: '#5B7CF5' },
  cristian: { pass: 'korex2026', name: 'Cristian Fernandez', role: 'CEO',          initials: 'CF', color: '#06B6D4' },
  josem:    { pass: 'korex2026', name: 'Jose Martin',        role: 'CMO',          initials: 'JM', color: '#EAB308' },
  david:    { pass: 'korex2026', name: 'David',              role: 'Trafficker',   initials: 'DV', color: '#F97316' },
  marcos:   { pass: 'korex2026', name: 'Marcos',             role: 'CTO',          initials: 'MC', color: '#22C55E' },
  zil:      { pass: 'korex2026', name: 'Zil',               role: 'Coordinacion', initials: 'ZL', color: '#8B5CF6' },
};

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
      { id: 'act_402864097369944', name: 'MONICA LOPEZ VOZMEDIANO', currency: 'EUR', spent: '\u20AC10,352', status: 'activa' },
      { id: 'act_1585613345849627', name: 'MONICA VOZMEDIANO 2', currency: 'USD', spent: '$0', status: 'activa' }
    ],
    metaMetrics: { adsActive: true, lastUpdated: '2026-04-04', currency: 'EUR', conversionEvent: 'visita-pagina-vsl-monica', totalSpend7d: 128.96, totalConversions7d: 52, avgCpl7d: 2.48, spendYesterday: 27.89, conversionsYesterday: 1, impressions7d: 13388, clicks7d: 694, ctr7d: 5.18 }
  },
  'Oscar Palayo': {
    metaAds: [
      { id: 'act_1164206578568839', name: 'Racha crypto', currency: 'EUR', spent: '\u20AC1,175', status: 'activa' }
    ],
    metaMetrics: { adsActive: false, lastUpdated: '2026-04-04', currency: 'EUR', conversionEvent: null, totalSpend7d: 0, totalConversions7d: 0, avgCpl7d: 0, spendYesterday: 0, conversionsYesterday: 0, impressions7d: 0, clicks7d: 0, ctr7d: 0, pauseReason: 'Sin gasto en 7 dias — revisar estado de campanas' }
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
    metaMetrics: { adsActive: false, lastUpdated: '2026-04-04', currency: 'USD', conversionEvent: null, totalSpend7d: 0, totalConversions7d: 0, avgCpl7d: 0, spendYesterday: 0, conversionsYesterday: 0, impressions7d: 0, clicks7d: 0, ctr7d: 0, pauseReason: 'Pre-lanzamiento — cuenta sin campanas activas' }
  },
  'Kate Baltodano': {
    metaAds: [
      { id: 'act_1409141003912013', name: 'Kate - FARMASI', currency: 'USD', spent: '$199', status: 'activa' }
    ],
    metaMetrics: { adsActive: false, lastUpdated: '2026-04-04', currency: 'USD', conversionEvent: null, totalSpend7d: 0, totalConversions7d: 0, avgCpl7d: 0, spendYesterday: 0, conversionsYesterday: 0, impressions7d: 0, clicks7d: 0, ctr7d: 0, pauseReason: 'Sin gasto en 7 dias — esperando grabacion del cliente' }
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