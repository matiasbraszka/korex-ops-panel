// Helpers de satisfacción del cliente (WhatsApp) para Operaciones.
// La data viene del RPC ops_wa_satisfaction (una fila por cliente, en context.satByClient).
// La "general" es la suma proporcional de los 4 canales; el color usa el promedio (pct).

export const SAT_CHANNELS = ['sat_usuarios', 'sat_cliente_grupo', 'sat_privado_cliente', 'sat_privado_usuarios'];

// { sum, max, pct } — pct (0-100) es el promedio de los canales con datos.
export function satGeneral(sat) {
  if (!sat) return { sum: null, max: 0, pct: null };
  const vals = SAT_CHANNELS.map((k) => sat[k]).filter((v) => v !== null && v !== undefined);
  if (!vals.length) return { sum: null, max: 0, pct: null };
  const sum = vals.reduce((a, v) => a + v, 0);
  const max = vals.length * 100;
  return { sum, max, pct: Math.round((sum / max) * 100) };
}

// Color del semáforo (dot) según el promedio.
export function satDotColor(pct) {
  if (pct === null || pct === undefined) return '#CBD5E1'; // gris = sin datos
  if (pct >= 75) return '#16A34A'; // verde
  if (pct >= 50) return '#CA8A04'; // amarillo
  return '#EF4444';                // rojo
}

// Colores de pill (fondo + texto) para chips de score.
export function satChipColor(v) {
  if (v === null || v === undefined) return { bg: '#F1F5F9', fg: '#64748B' };
  if (v >= 75) return { bg: '#DCFCE7', fg: '#15803D' };
  if (v >= 50) return { bg: '#FEF0D7', fg: '#B45309' };
  return { bg: '#FEE2E2', fg: '#DC2626' };
}

export function satLabel(pct) {
  if (pct === null || pct === undefined) return 'Sin datos';
  if (pct >= 75) return 'Buena';
  if (pct >= 50) return 'Media';
  return 'Baja';
}
