import { Users, MessageCircle } from 'lucide-react';
import { initials, fmtTime, colorFromString, convName, prettyPreview } from '../lib/format.js';

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
      className={`w-full text-left px-3 py-3 rounded-xl border cursor-pointer flex items-start gap-2.5 transition-all mb-1.5 bg-white ${
        active ? 'border-[#5B7CF5]/70 shadow-[0_2px_10px_rgba(91,124,245,0.12)]' : 'border-border/70 hover:border-[#5B7CF5]/40 hover:shadow-sm'
      }`}
    >
      <div className="relative shrink-0">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-[13.5px]"
          style={{ background: color + '1d', color }}
        >
          {conv.is_group ? <Users size={17} /> : initials(name)}
        </div>
        {/* Mini badge del canal (WhatsApp) */}
        <span className="absolute -bottom-0.5 -right-0.5 w-[16px] h-[16px] rounded-full bg-[#22C55E] border-2 border-white flex items-center justify-center">
          <MessageCircle size={9} className="text-white" />
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[13px] truncate flex-1 ${unread > 0 ? 'font-bold text-text' : 'font-semibold text-text'}`}>
            {name}
          </span>
          <span className={`text-[10px] shrink-0 ${unread > 0 ? 'text-[#5B7CF5] font-semibold' : 'text-text3'}`}>{fmtTime(conv.last_message_at)}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[12px] truncate flex-1 ${unread > 0 ? 'text-text2 font-medium' : 'text-text3'}`}>
            {prettyPreview(conv.last_message_preview) || (conv.is_group ? 'Grupo' : 'Sin mensajes')}
          </span>
          {unread > 0 && (
            <span className="shrink-0 min-w-[20px] h-[20px] px-1.5 rounded-lg bg-[#5B7CF5] text-white text-[10.5px] font-bold flex items-center justify-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
        {(tags.length > 0 || conv.client?.name) && (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
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
