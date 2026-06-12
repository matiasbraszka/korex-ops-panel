import { Users } from 'lucide-react';
import { initials, fmtTime, colorFromString, convName } from '../lib/format.js';

export default function ConversationItem({ conv, active, isSelected, tagsCatalog, onClick }) {
  const name = convName(conv);
  const color = colorFromString(conv.wa_jid);
  // La conversacion abierta siempre muestra 0 (clamp visual; el server converge solo).
  const unread = isSelected ? 0 : conv.unread_count || 0;
  const tags = (conv.tags || [])
    .map((id) => tagsCatalog.find((t) => t.id === id))
    .filter(Boolean)
    .slice(0, 3);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-0 cursor-pointer flex items-start gap-2.5 transition-colors border-b border-b-border/60 ${active ? 'bg-[#FFFBEB]' : 'bg-transparent hover:bg-surface2'}`}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[13px] shrink-0 relative"
        style={{ background: color + '20', color }}
      >
        {conv.is_group ? <Users size={17} /> : initials(name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[13px] truncate flex-1 ${unread > 0 ? 'font-bold text-text' : 'font-semibold text-text'}`}>{name}</span>
          <span className="text-[10px] text-text3 shrink-0">{fmtTime(conv.last_message_at)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[12px] truncate flex-1 ${unread > 0 ? 'text-text font-medium' : 'text-text3'}`}>
            {conv.last_message_preview || (conv.is_group ? 'Grupo' : 'Sin mensajes')}
          </span>
          {unread > 0 && (
            <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#22C55E] text-white text-[10px] font-bold flex items-center justify-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
        {(tags.length > 0 || conv.client?.name) && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {conv.client?.name && (
              <span className="text-[9.5px] font-semibold px-1.5 py-px rounded-full bg-[#EEF2FF] text-[#4A67D8] truncate max-w-[110px]">
                {conv.client.name}
              </span>
            )}
            {tags.map((t) => (
              <span key={t.id} className="text-[9.5px] font-semibold px-1.5 py-px rounded-full truncate max-w-[90px]"
                    style={{ background: t.color + '1f', color: t.color }}>
                {t.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
