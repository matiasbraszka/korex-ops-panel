import { ClipboardList, MessageSquare, CornerDownRight, FileText, Ban, AlertTriangle, Bell, CreditCard, AtSign, FileSignature, FileWarning, CalendarClock, Landmark } from 'lucide-react';

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
  mercury_failed_transaction: { Icon: Landmark,   color: '#DC2626' },
  contract_signed:       { Icon: FileSignature,   color: '#16A34A' },
  contract_unlinked:     { Icon: FileWarning,     color: '#F59E0B' },
  contract_renewal:      { Icon: CalendarClock,   color: '#F97316' },
  mention:               { Icon: AtSign,          color: '#9333EA' },
};

export function notifMeta(type) {
  return META[type] || { Icon: Bell, color: '#6B7280' };
}

// fmtTime y dayKey viven en utils/helpers.js (fuente única). Se re-exportan
// acá para no romper los imports existentes del panel de notificaciones.
export { fmtTime, dayKey } from '../../utils/helpers';
