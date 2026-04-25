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
