// Helpers de formato del dashboard.
export function fmtMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return v === 0 ? 'US$ 0' : '—';
  if (Math.abs(v) >= 1000) return 'US$ ' + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
  return 'US$ ' + Math.round(v);
}

export function fmtPct(n, digits = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return (v * 100).toFixed(digits) + '%';
}

export function fmtInt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('es-AR');
}

// Iniciales: "Matías Braszka" -> "MB"
export function initials(name) {
  if (!name) return '··';
  const p = String(name).trim().split(/\s+/);
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

// Probabilidad de cierre por etapa segun su posicion. No tenemos columna en la
// base — usamos heuristica lineal: primera etapa 10%, ultima 100%, lineal en el
// medio. Heuristica matchea aproximadamente las {new:.10, call:.25, prop:.45,
// neg:.70, won:1.00} del diseno hi-fi cuando hay 5 etapas.
export function stageProb(position, totalStages) {
  if (!totalStages || totalStages <= 1) return 1;
  const t = position / (totalStages - 1);
  return Math.round((0.10 + (0.90 * t)) * 100) / 100;
}

// Probabilidad de cierre por score (calentura). Igual al diseno hi-fi.
export function scoreProb(score) {
  if (score === 3) return 0.62;
  if (score === 2) return 0.32;
  if (score === 1) return 0.08;
  return 0.05;
}
