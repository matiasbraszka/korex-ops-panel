import { Clock, AlertCircle, CheckCheck } from 'lucide-react';
import { fmtClock, colorFromString, msgTypeLabel, initials } from '../lib/format.js';
import MediaContent from './MediaContent.jsx';

// Tipos que renderizan contenido multimedia real (imagen, audio, video, doc).
const MEDIA_TYPES = new Set(['imageMessage', 'stickerMessage', 'audioMessage', 'videoMessage', 'documentMessage']);

// Burbuja de mensaje — Diseño A (estilo WhatsApp).
// Entrantes: blancas con sombra sutil. Salientes: verde #DCFCE7.
// En grupos: avatar del autor (solo primera burbuja consecutiva) + nombre coloreado.
export default function MessageBubble({ msg, isGroup, showAuthor, onRetry, onDiscard }) {
  const out = msg.direction === 'out';
  const isMedia = MEDIA_TYPES.has(msg.msg_type);
  const typeLabel = !isMedia ? msgTypeLabel(msg.msg_type) : null;
  const authorName = !out && isGroup ? (msg.payload?.pushName || (msg.sender_jid || '').split('@')[0]) : null;
  const authorColor = colorFromString(msg.sender_jid || '');
  const failed = msg.status === 'failed';
  const sending = msg.status === 'sending';

  return (
    <div className={`flex ${out ? 'justify-end' : 'justify-start'} px-4 gap-2`}>
      {/* Avatar del autor en grupos (alineado abajo, spacer si es consecutiva) */}
      {!out && isGroup && (
        showAuthor && authorName ? (
          <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[9.5px] shrink-0 self-end"
               style={{ background: authorColor + '1d', color: authorColor }}>
            {initials(authorName)}
          </div>
        ) : (
          <div className="w-7 shrink-0" />
        )
      )}

      <div
        className={`max-w-[75%] md:max-w-[58%] px-3 py-2 text-[13px] leading-relaxed break-words shadow-[0_1px_1px_rgba(10,22,40,.06)] ${
          out
            ? failed
              ? 'bg-[#FEF2F2] border border-[#FCA5A5] text-text rounded-[14px] rounded-br-[4px]'
              : 'bg-[#DCFCE7] text-text rounded-[14px] rounded-br-[4px]'
            : 'bg-white text-text rounded-[14px] rounded-bl-[4px]'
        }`}
      >
        {showAuthor && authorName && (
          <div className="text-[11px] font-bold mb-0.5" style={{ color: authorColor }}>
            {authorName}
          </div>
        )}
        {isMedia && (
          <div className={msg.body ? 'mb-1' : ''}>
            <MediaContent msg={msg} />
          </div>
        )}
        {typeLabel && (
          <div className={`text-[11.5px] font-medium ${msg.body ? 'mb-0.5' : ''} text-text2`}>{typeLabel}</div>
        )}
        {msg.body && <div className="whitespace-pre-wrap">{msg.body}</div>}

        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className={`text-[9.5px] ${out && !failed ? 'text-[#7A9484]' : 'text-text3'}`}>
            {fmtClock(msg.wa_timestamp || msg.created_at)}
          </span>
          {out && sending && <Clock size={10} className="text-text3" />}
          {out && !sending && !failed && <CheckCheck size={12} className="text-[#53BDEB]" />}
          {failed && <AlertCircle size={11} style={{ color: '#DC2626' }} />}
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
