// Helpers de formato del DME. Local a operations para no importar de apps/sales.
// El valor crudo es siempre numerico; el formateo (%, $, k) se hace al renderizar.

export function fmtMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '$ 0';
  if (Math.abs(v) >= 1000) return '$ ' + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
  return '$ ' + (Number.isInteger(v) ? v : v.toFixed(2));
}

// Porcentajes: el valor crudo es un ratio (0.20 = 20%).
export function fmtPct(n, digits = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return (v * 100).toFixed(digits) + '%';
}

export function fmtInt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return Math.round(v).toLocaleString('es-AR');
}

// Numero "lindo" con hasta 1 decimal (dias de runway, leads por networker).
export function fmtNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return Number(v.toFixed(1)).toLocaleString('es-AR');
}

// Formatea segun el kind de la metrica del registro.
export function fmtMetric(kind, value) {
  switch (kind) {
    case 'money':
    case 'cpl':   return fmtMoney(value);
    case 'pct':
    case 'roi':   return fmtPct(value);
    case 'num':   return fmtNum(value);
    case 'int':
    default:      return fmtInt(value);
  }
}
