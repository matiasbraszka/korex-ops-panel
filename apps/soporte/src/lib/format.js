// Helpers de formato del modulo Soporte. Copias minimas de
// apps/operations/src/utils/helpers.js (no importable cross-app) + propios.

export function initials(n) {
  if (!n) return '?';
  return n.split(' ').filter(Boolean).map((x) => x[0]).join('').toUpperCase().slice(0, 2);
}

// Hora relativa amable de un timestamp: "recién", "hace X min", hora, "ayer",
// "hace N días", o fecha corta. Mismo criterio que el buzón de notificaciones.
export function fmtTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'recién';
  if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const diffDays = Math.floor(diffSec / 86400);
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays} días`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

// Hora exacta HH:MM para las burbujas del chat.
export function fmtClock(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

// Etiqueta de día para agrupar el hilo (Hoy / Ayer / fecha larga).
export function dayKey(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Hoy';
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (sameDay(d, yest)) return 'Ayer';
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Color estable derivado de un string (jid del chat / autor en grupos).
const PALETTE = ['#5B7CF5', '#22C55E', '#EAB308', '#F97316', '#8B5CF6', '#06B6D4', '#EC4899', '#10B981', '#F43F5E', '#6366F1'];
export function colorFromString(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

// Telefono legible desde wa_phone ("5492915056739" -> "+54 9 291 505 6739" basico).
export function fmtPhone(phone) {
  if (!phone) return '';
  return '+' + phone;
}

// Etiqueta amable para tipos de mensaje no-texto de Baileys.
const TYPE_LABELS = {
  imageMessage: '📷 Imagen',
  videoMessage: '🎬 Video',
  audioMessage: '🎙 Audio',
  documentMessage: '📄 Documento',
  stickerMessage: '✨ Sticker',
  locationMessage: '📍 Ubicación',
  contactMessage: '👤 Contacto',
  reactionMessage: '👍 Reacción',
  pollCreationMessage: '📊 Encuesta',
};
export function msgTypeLabel(msgType) {
  if (!msgType || msgType === 'conversation' || msgType === 'extendedTextMessage') return null;
  return TYPE_LABELS[msgType] || '📎 Adjunto';
}

// Preview legible: convierte "[audioMessage]" (crudo del webhook viejo) o
// "Autor: [imageMessage]" en su etiqueta amable.
export function prettyPreview(preview) {
  if (!preview) return '';
  return preview.replace(/\[(\w+Message|\w+)\]/g, (match, type) => TYPE_LABELS[type] || match);
}

// Nombre a mostrar de una conversación: contacto vinculado > nombre de perfil > teléfono > jid.
export function convName(conv) {
  return conv?.contact?.full_name || conv?.wa_profile_name || fmtPhone(conv?.wa_phone) || conv?.wa_jid || '';
}

// Resuelve la plantilla de confirmación: {{nombre}}, {{fecha}}, {{hora}}.
export function resolveTemplate(template, { nombre, fecha, hora }) {
  return String(template || '')
    .replaceAll('{{nombre}}', nombre || '')
    .replaceAll('{{fecha}}', fecha || '')
    .replaceAll('{{hora}}', hora || '');
}
