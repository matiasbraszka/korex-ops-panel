// Paleta de colores neutrales del UI del Historial.
// Las fases y los tipos de evento ya NO viven acá: se leen de app_settings
// vía useHistorialConfig() (ver useHistorialConfig.js).
export const T = {
  bg: '#F7F8FA',
  surface: '#FFFFFF',
  surface2: '#F0F2F5',
  border: '#E2E5EB',
  borderLight: '#D0D5DD',
  blue: '#5B7CF5',
  blueLight: '#7B9AFF',
  blueDark: '#4A67D8',
  blueBg: '#EEF2FF',
  blueBg2: '#F5F7FF',
  green: '#22C55E',
  greenBg: '#ECFDF5',
  yellow: '#EAB308',
  yellowBg: '#FEFCE8',
  red: '#EF4444',
  redBg: '#FEF2F2',
  orange: '#F97316',
  orangeBg: '#FFF7ED',
  purple: '#8B5CF6',
  purpleBg: '#F5F3FF',
  cyan: '#06B6D4',
  text: '#1A1D26',
  text2: '#6B7280',
  text3: '#9CA3AF',
};

// Defaults defensivos: solo se usan si app_settings nunca fue migrado.
// La tabla app_settings se siembra con estos mismos valores en historial_v1.sql.
export const DEFAULT_FASES = [
  { n: 1,  short: 'Pre-Onb', label: 'Pre-Onboarding',      color: '#8B5CF6' },
  { n: 2,  short: 'Onb',     label: 'Onboarding + Meta',   color: '#5B7CF5' },
  { n: 3,  short: 'Estrat',  label: 'Estrategia & Avatar', color: '#5B7CF5' },
  { n: 4,  short: 'Guion',   label: 'Guiones & VSL',       color: '#EAB308' },
  { n: 5,  short: 'Diseño',  label: 'Diseño Landing',      color: '#EAB308' },
  { n: 6,  short: 'Code',    label: 'Funnel en código',    color: '#EAB308' },
  { n: 7,  short: 'QA',      label: 'QA & Tracking',       color: '#22C55E' },
  { n: 8,  short: 'Lanz',    label: 'Lanzamiento Ads',     color: '#22C55E' },
  { n: 9,  short: 'Optim',   label: 'Optimización',        color: '#06B6D4' },
  { n: 10, short: 'Audit',   label: 'Auditoría',           color: '#06B6D4' },
  { n: 11, short: 'Escala',  label: 'Escalado',            color: '#06B6D4' },
];

export const DEFAULT_EVENT_TYPES = [
  { key: 'entregable',   label: 'Entregable',   color: '#22C55E', bg: '#ECFDF5', dot: '◆' },
  { key: 'hito',         label: 'Hito',         color: '#5B7CF5', bg: '#EEF2FF', dot: '★' },
  { key: 'bloqueo',      label: 'Bloqueo',      color: '#EF4444', bg: '#FEF2F2', dot: '⚠' },
  { key: 'comunicacion', label: 'Comunicación', color: '#8B5CF6', bg: '#F5F3FF', dot: '◌' },
  { key: 'decision',     label: 'Decisión',     color: '#F97316', bg: '#FFF7ED', dot: '▶' },
  { key: 'validacion',   label: 'Validación',   color: '#EAB308', bg: '#FEFCE8', dot: '✓' },
  { key: 'metrica',      label: 'Métrica',      color: '#06B6D4', bg: '#ECFEFF', dot: '▲' },
];
