// Helpers y paleta compartidos del diseño de Finanzas (Claude Design).
// Todo el área usa estilos inline (apps/finance NO está en el @source de Tailwind,
// así que las clases arbitrarias no se generan) — por eso centralizamos colores acá.

export const ACCENT = '#0EA5A4';
export const ACCENT_DARK = '#0c8584';

// US$ redondeado, con guion para ~0.
export const money = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) < 0.5) return '—';
  return 'US$ ' + Math.round(v).toLocaleString('es-AR');
};
// Con decimales y moneda configurable (US$, €).
export const money2 = (n, c = 'US$') => {
  const v = Number(n);
  if (!isFinite(v) || v === 0) return '—';
  return c + ' ' + v.toLocaleString('es-AR', { maximumFractionDigits: 2 });
};
// Compacto: 1.2k, 980.
export const kfmt = (n) => {
  const v = Number(n) || 0, a = Math.abs(v);
  return a >= 1000 ? (v / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + 'k'
                   : Math.round(v).toLocaleString('es-AR');
};
// Iniciales (hasta 2) para avatares.
export const ini = (s) => (s || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
// 'YYYY-MM-DD' -> 'd/m/YYYY'
export const fdate = (d) => {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return day ? `${+day}/${+m}/${y}` : s;
};
// 'YYYY-MM' -> "ene '26"
export const mlabel = (ym) => {
  const [y, m] = (ym || '').split('-');
  const M = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return m ? `${M[+m] || m} '${(y || '').slice(2)}` : ym;
};
// Color determinístico de avatar a partir del nombre → [bg, fg].
export const avatarColor = (name) => {
  const h = [...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0);
  const set = [['#dbeafe', '#1d4ed8'], ['#e0f2fe', '#0369a1'], ['#fef3c7', '#b45309'],
               ['#ede9fe', '#6d28d9'], ['#fce7f3', '#be185d'], ['#dcfce7', '#15803d'], ['#ccfbf1', '#0f766e']];
  return set[Math.abs(h) % set.length];
};

// Roles que cobran comisión.
export const ROLE = { cliente: '#2563eb', conector: '#0ea5e9', afiliado: '#f59e0b', consultor: '#8b5cf6', marketing: '#ec4899' };
export const ROLE_LABEL = { cliente: 'Cliente', conector: 'Conector', afiliado: 'Afiliado', consultor: 'Consultor', marketing: 'Marketing' };

// Tipo de ingreso (chips).
export const TYPE_BG = { CRM: '#dbeafe', PUBLICIDAD: '#fef3c7', SETUP: '#e2e8f0' };
export const TYPE_FG = { CRM: '#1d4ed8', PUBLICIDAD: '#b45309', SETUP: '#475569' };
export const TYPE_RAIL = { CRM: '#3b82f6', PUBLICIDAD: '#f59e0b', SETUP: '#cbd5e1' };
export const typeBg = (t) => TYPE_BG[t] || '#f1f5f9';
export const typeFg = (t) => TYPE_FG[t] || '#64748B';

// Medio de pago → [label, bg, fg].
export const pagoChip = (p) => {
  const s = String(p || '').toLowerCase();
  if (s.includes('stripe')) return ['Stripe', '#e0e7ff', '#4338ca'];
  if (s.includes('mercury')) return ['Mercury', '#e0f2fe', '#0369a1'];
  if (s.includes('usdt') || s.includes('safepal')) return ['USDT', '#d1fae5', '#047857'];
  return [p || '—', '#f1f5f9', '#64748B'];
};

// Rol de persona (Directorio / Pagos) → [bg, fg].
export const ROLE_CHIP = {
  Cliente: ['#dbeafe', '#1d4ed8'], Usuario: ['#fef3c7', '#b45309'], Conector: ['#e0f2fe', '#0369a1'],
  Consultor: ['#ede9fe', '#6d28d9'], Marketing: ['#fce7f3', '#be185d'], Afiliado: ['#fef3c7', '#b45309'],
};
export const roleChip = (t) => ROLE_CHIP[t] || ['#f1f5f9', '#64748B'];

// Categoría de egreso → chip [bg, fg] y color sólido (barras).
export const CAT_CHIP = {
  Personal: ['#ede9fe', '#6d28d9'], Herramientas: ['#dbeafe', '#1d4ed8'], Proveedor: ['#e0f2fe', '#0369a1'],
  Infraestructura: ['#cffafe', '#0e7490'], Retiros: ['#ffe4e6', '#be123c'], Formacion: ['#fef3c7', '#b45309'],
  Fees: ['#ffedd5', '#c2410c'], Comisiones: ['#d1fae5', '#047857'], Otros: ['#f1f5f9', '#475569'],
};
export const catChip = (c) => CAT_CHIP[c] || ['#f1f5f9', '#64748B'];
export const CAT_COLOR = {
  Personal: '#8b5cf6', Herramientas: '#3b82f6', Proveedor: '#0ea5e9', Infraestructura: '#06b6d4',
  Retiros: '#f43f5e', Formacion: '#f59e0b', Fees: '#f97316', Comisiones: '#10b981', Otros: '#94a3b8',
};
export const catColor = (c) => CAT_COLOR[c] || '#94a3b8';

// ¿el egreso es un retiro de socios? (para separar egreso empresa vs retiro en el P&L).
export const isRetiro = (cat) => /retiro/i.test(cat || '');
// Detección de "presupuesto de publicidad" en los entries (no es comisión repartida).
export const isAdBudget = (e) => e.role_key === 'cliente' && /publicidad/i.test(e.notes || '');
