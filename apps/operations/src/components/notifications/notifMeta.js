import { ClipboardList, MessageSquare, CornerDownRight, FileText, Ban, AlertTriangle, Bell, CreditCard, AtSign } from 'lucide-react';

// Mapeo tipo de notificación -> ícono + color. Centralizado para que el panel
// y el toast se vean consistentes. Los colores siguen la paleta del panel.
const META = {
  task_assigned:         { Icon: ClipboardList,   color: '#5B7CF5' },
  task_comment:          { Icon: MessageSquare,   color: '#06B6D4' },
  comment_reply:         { Icon: CornerDownRight, color: '#8B5CF6' },
  bullet_comment:        { Icon: MessageSquare,   color: '#0891B2' },
  bullet_comment_reply:  { Icon: CornerDownRight, color: '#7C3AED' },
  idea_comment:          { Icon: MessageSquare,   color: '#F59E0B' },
  idea_comment_reply:    { Icon: CornerDownRight, color: '#D97706' },
  blocker_comment:       { Icon: MessageSquare,   color: '#EF4444' },
  blocker_comment_reply: { Icon: CornerDownRight, color: '#B91C1C' },
  task_description:      { Icon: FileText,        color: '#22C55E' },
  task_blocked:          { Icon: Ban,             color: '#EF4444' },
  task_overdue:          { Icon: AlertTriangle,   color: '#F59E0B' },
  meta_account_error:    { Icon: CreditCard,      color: '#DC2626' },
  mention:               { Icon: AtSign,          color: '#9333EA' },
};

export function notifMeta(type) {
  return META[type] || { Icon: Bell, color: '#6B7280' };
}

// Hora relativa amable (recién / hace X min / hora / ayer / fecha).
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

// Etiqueta de día para agrupar el feed (Hoy / Ayer / fecha larga).
export function dayKey(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Hoy';
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (sameDay(d, yest)) return 'Ayer';
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
}
