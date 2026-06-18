// Listas y helpers del sistema de Cambios de Landings (área Marketing).
// Migrado del Google Sheet "Cambios de landings". Mantener en un solo lugar
// para que los desplegables del formulario y los filtros usen las mismas opciones.

export const CATEGORIAS = [
  'Cambio Copy',
  'Cambio Diseño',
  'Mejora Funnel actual',
  'Nuevo Funnel Copy',
  'Nuevo Diseño Funnel (de 0)',
  'Nuevo funnel - A/B testing',
];

export const FASES = [
  'Pre-Landing',
  'Landing VSL',
  'Quiz',
  'Thank You Page',
  'Funnel Entero',
];

export const URGENCIAS = ['Baja', 'Media', 'Alta', 'Muy alta'];

export const ESTADOS = ['Pendiente', 'En progreso', 'Terminado', 'Bloqueado'];

// Encargados / solicitantes habituales (el campo igual admite escribir otro).
export const ENCARGADOS = ['Jose Zerillo', 'Zil', 'Programacion', 'Maria'];
export const SOLICITANTES = ['Maria', 'Zil', 'Matias', 'Jose Martin'];

// ── Tests A/B ──
export const METRICAS = [
  'CTR del ad (%)',
  'Tasa de registro (%)',
  'VSL play rate (%)',
  'VSL completion rate (%)',
  'Quiz completion rate (%)',
  'Form submit rate (%)',
  'Leads totales (#)',
  'Leads por día (#)',
  'Costo por lead - CPL ($)',
  'Lead score promedio (#)',
  'Show-up rate a llamada (%)',
  'Conversión a venta (%)',
  'ROAS (x)',
  'Otra',
];
export const RESULTADOS = ['En curso', 'Ganador', 'Perdedor', 'Sin cambio', 'Inconcluso'];
export const DECISIONES = ['Mantener', 'Revertir', 'Iterar', 'En espera'];
export const REPLICABLE = ['Sí', 'No', 'Parcial'];

// ── Aprendizajes (biblioteca) ──
export const CATEGORIAS_APRENDIZAJE = [
  'Hook / Headline',
  'Copy del cuerpo',
  'Video / VSL',
  'Visual / Imagen',
  'CTA',
  'Formulario / Quiz',
  'Garantía',
  'Prueba social',
  'Bonus / Stack de valor',
  'Estructura general',
  'Targeting / Ad creative',
  'Otro',
];

// ── Helpers de color ──
// Devuelve la clase del StatusPill según estado.
export function estadoPill(estado) {
  switch (estado) {
    case 'Terminado': return 'pill-green';
    case 'En progreso': return 'pill-blue';
    case 'Bloqueado': return 'pill-red';
    case 'Pendiente': return 'pill-gray';
    default: return 'pill-gray';
  }
}

// Color sólido por urgencia (para puntos / bordes).
export function urgenciaColor(urgencia) {
  switch (urgencia) {
    case 'Muy alta': return '#DC2626';
    case 'Alta': return '#EA580C';
    case 'Media': return '#CA8A04';
    case 'Baja': return '#16A34A';
    default: return '#9AA5B1';
  }
}

export function urgenciaPill(urgencia) {
  switch (urgencia) {
    case 'Muy alta': return 'pill-red';
    case 'Alta': return 'pill-orange';
    case 'Media': return 'pill-yellow';
    case 'Baja': return 'pill-green';
    default: return 'pill-gray';
  }
}

export function resultadoPill(resultado) {
  switch (resultado) {
    case 'Ganador': return 'pill-green';
    case 'Perdedor': return 'pill-red';
    case 'Sin cambio': return 'pill-gray';
    case 'Inconcluso': return 'pill-yellow';
    case 'En curso': return 'pill-blue';
    default: return 'pill-gray';
  }
}

// Acento del área Marketing (rosa).
export const MKT_ACCENT = '#EC4899';
export const MKT_BG = '#FDF2F8';

// dd/mm/yyyy a partir de una fecha ISO (yyyy-mm-dd). Vacío si no hay.
export function fmtFecha(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
