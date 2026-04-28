// Design tokens del Historial — espejo de tokens.jsx del Cloud Design
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

// 11 fases del Método Korex
export const KOREX_FASES = [
  { n: 1,  short: 'Pre-Onb', label: 'Pre-Onboarding' },
  { n: 2,  short: 'Onb',     label: 'Onboarding + Meta' },
  { n: 3,  short: 'Estrat',  label: 'Estrategia & Avatar' },
  { n: 4,  short: 'Guion',   label: 'Guiones & VSL' },
  { n: 5,  short: 'Diseño',  label: 'Diseño Landing' },
  { n: 6,  short: 'Code',    label: 'Funnel en código' },
  { n: 7,  short: 'QA',      label: 'QA & Tracking' },
  { n: 8,  short: 'Lanz',    label: 'Lanzamiento Ads' },
  { n: 9,  short: 'Optim',   label: 'Optimización' },
  { n: 10, short: 'Audit',   label: 'Auditoría' },
  { n: 11, short: 'Escala',  label: 'Escalado' },
];

export const EVENT_TYPES = {
  entregable:    { label: 'Entregable',    color: '#22C55E', bg: '#ECFDF5', dot: '◆' },
  hito:          { label: 'Hito',          color: '#5B7CF5', bg: '#EEF2FF', dot: '★' },
  bloqueo:       { label: 'Bloqueo',       color: '#EF4444', bg: '#FEF2F2', dot: '⚠' },
  comunicacion:  { label: 'Comunicación',  color: '#8B5CF6', bg: '#F5F3FF', dot: '◌' },
  decision:      { label: 'Decisión',      color: '#F97316', bg: '#FFF7ED', dot: '▶' },
  validacion:    { label: 'Validación',    color: '#EAB308', bg: '#FEFCE8', dot: '✓' },
  metrica:       { label: 'Métrica',       color: '#06B6D4', bg: '#ECFEFF', dot: '▲' },
};
