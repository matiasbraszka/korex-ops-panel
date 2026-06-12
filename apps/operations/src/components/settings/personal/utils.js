import { supabase } from '@korex/db';

// Helpers de la pestaña Personal: archivos en el bucket privado staff-docs
// (facturas y contratos) + formateos de fechas y plata.

const BUCKET = 'staff-docs';

export const CURRENCIES = ['USD', 'ARS'];

export async function uploadStaffDoc(memberId, tipo, file) {
  const safe = file.name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-');
  const path = `${memberId}/${tipo}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
  return path;
}

// El bucket es privado: se abre con un link firmado de 1 hora.
export async function openStaffDoc(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  window.open(data.signedUrl, '_blank', 'noopener');
}

export async function deleteStaffDoc(path) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

export function fmtMoney(amount, currency = 'USD') {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = Number(amount);
  if (Number.isNaN(n)) return '—';
  return `${currency === 'ARS' ? '$' : 'US$'} ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
}

export function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// '2026-06-01' → 'Junio 2026'
export function fmtPeriod(d) {
  if (!d) return '—';
  const date = new Date(d + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return '—';
  const s = date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function yearsSince(d) {
  if (!d) return null;
  const from = new Date(d + 'T00:00:00');
  if (Number.isNaN(from.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - from.getFullYear();
  const beforeBirthday =
    now.getMonth() < from.getMonth() ||
    (now.getMonth() === from.getMonth() && now.getDate() < from.getDate());
  if (beforeBirthday) years--;
  return years;
}

// Antigüedad legible: '8 meses', '1 año', '2 años y 3 meses'
export function antiguedadLabel(d) {
  if (!d) return null;
  const from = new Date(d + 'T00:00:00');
  if (Number.isNaN(from.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) months--;
  if (months < 0) return 'Ingresa pronto';
  if (months === 0) return 'Menos de 1 mes';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yLabel = years > 0 ? `${years} año${years === 1 ? '' : 's'}` : '';
  const mLabel = rest > 0 ? `${rest} mes${rest === 1 ? '' : 'es'}` : '';
  return [yLabel, mLabel].filter(Boolean).join(' y ');
}

// Estado de un contrato según su vencimiento.
export function contractStatus(contract) {
  if (!contract.end_date) return { label: 'Sin vencimiento', tone: 'gray' };
  const end = new Date(contract.end_date + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((end - today) / 86400000);
  if (days < 0) return { label: 'Vencido', tone: 'red' };
  if (days === 0) return { label: 'Vence hoy', tone: 'red' };
  if (days <= 30) return { label: `Vence en ${days} día${days === 1 ? '' : 's'}`, tone: 'amber' };
  return { label: 'Vigente', tone: 'green' };
}

export const TONE_CLS = {
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red/10 text-red',
  gray: 'bg-surface2 text-text3',
};

export const inputCls =
  'w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(91,124,245,0.1)]';
