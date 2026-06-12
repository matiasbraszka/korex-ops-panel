import { Clock, AlertCircle, Check } from 'lucide-react';
import { fmtClock, colorFromString, msgTypeLabel } from '../lib/format.js';

// Burbuja de mensaje. showAuthor: en grupos, mostrar el autor arriba (solo en
// la primera burbuja consecutiva del mismo remitente).
export default function MessageBubble({ msg, isGroup, showAuthor, onRetry, onDiscard }) {
  const out = msg.direction === 'out';
  const typeLabel = msgTypeLabel(msg.msg_type);
  const authorName = !out && isGroup ? (msg.payload?.pushName || (msg.sender_jid || '').split('@')[0]) : null;
  const failed = msg.status === 'failed';
  const sending = msg.status === 'sending';

  return (
    <div className={`flex ${out ? 'justify-end' : 'justify-start'} px-4`}>
      <div
        className={`max-w-[75%] md:max-w-[60%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed break-words ${
          out
            ? failed ? 'bg-[#FEF2F2] border border-[#FCA5A5] text-text rounded-br-md' : 'bg-[#DCFCE7] text-text rounded-br-md'
            : 'bg-white border border-border text-text rounded-bl-md'
        }`}
      >
        {showAuthor && authorName && (
          <div className="text-[11px] font-bold mb-0.5" style={{ color: colorFromString(msg.sender_jid || '') }}>
            {authorName}
          </div>
        )}
        {typeLabel && (
          <div className={`text-[11.5px] font-medium ${msg.body ? 'mb-0.5' : ''} text-text2`}>{typeLabel}</div>
        )}
        {msg.body && <div className="whitespace-pre-wrap">{msg.body}</div>}
        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className="text-[9.5px] text-text3">{fmtClock(msg.wa_timestamp || msg.created_at)}</span>
          {out && sending && <Clock size={10} className="text-text3" />}
          {out && !sending && !failed && <Check size={11} className="text-[#16A34A]" />}
          {failed && <AlertCircle size={11} className="text-red-500" style={{ color: '#DC2626' }} />}
        </div>
        {failed && (
          <div className="flex items-center gap-2 mt-1 pt-1 border-t border-[#FCA5A5]/50">
            <span className="text-[10.5px] font-medium" style={{ color: '#DC2626' }}>No se pudo enviar</span>
            <button onClick={onRetry} className="text-[10.5px] font-bold bg-transparent border-0 cursor-pointer p-0 underline" style={{ color: '#DC2626' }}>Reintentar</button>
            <button onClick={onDiscard} className="text-[10.5px] bg-transparent border-0 cursor-pointer p-0 text-text3 underline">Descartar</button>
          </div>
        )}
      </div>
    </div>
  );
}
