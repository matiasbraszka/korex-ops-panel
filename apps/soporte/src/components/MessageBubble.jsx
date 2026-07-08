import { Clock, AlertCircle, CheckCheck, Forward, Reply, CircleCheck, Circle, Trash2, Ban } from 'lucide-react';
import { fmtClock, colorFromString, msgTypeLabel, initials } from '../lib/format.js';
import MediaContent from './MediaContent.jsx';

// Tipos que renderizan contenido multimedia real (imagen, audio, video, doc).
const MEDIA_TYPES = new Set(['imageMessage', 'stickerMessage', 'audioMessage', 'videoMessage', 'documentMessage']);

// Texto corto de un mensaje (para la cita / preview).
const MEDIA_SNIPPET = { imageMessage: '📷 Imagen', stickerMessage: 'Sticker', audioMessage: '🎙 Nota de voz', videoMessage: '🎬 Video', documentMessage: '📄 Documento' };
const snippetOf = (m) => (m?.body && m.body.trim()) || MEDIA_SNIPPET[m?.msg_type] || 'Mensaje';

// Menciones coloreadas como en WhatsApp. Si la mención es un @<número> y
// conocemos el nombre de esa persona (mapa mentions), mostramos @Nombre.
function BodyText({ text, mentions }) {
  const parts = String(text).split(/(@[0-9]{5,}|@[\wÀ-ÿ.]+)/g);
  return (
    <div className="whitespace-pre-wrap">
      {parts.map((p, i) => {
        if (p.startsWith('@')) {
          const key = p.slice(1);
          const name = mentions && mentions[key];
          return <span key={i} className="font-semibold text-[#4A67D8]">@{name || key}</span>;
        }
        return <span key={i}>{p}</span>;
      })}
    </div>
  );
}

// Burbuja de mensaje — Diseño A (estilo WhatsApp).
// Entrantes: blancas con sombra sutil. Salientes: verde #DCFCE7.
// En grupos: avatar del autor (solo primera burbuja consecutiva) + nombre coloreado.
export default function MessageBubble({ msg, isGroup, showAuthor, onRetry, onDiscard, onForward, onReply, onDeleteForEveryone, selectMode, selected, onToggleSelect, quotedMsg, mentions }) {
  const out = msg.direction === 'out';
  const deleted = !!msg.deleted_at;
  const isMedia = !deleted && MEDIA_TYPES.has(msg.msg_type);
  const typeLabel = !isMedia && !deleted ? msgTypeLabel(msg.msg_type) : null;
  const authorName = !out && isGroup ? (msg.payload?.pushName || (msg.sender_jid || '').split('@')[0]) : null;
  const authorColor = colorFromString(msg.sender_jid || '');
  const failed = msg.status === 'failed';
  const sending = msg.status === 'sending';

  // Acciones (responder / reenviar / eliminar / seleccionar): en mensajes ya
  // enviados o recibidos (no en los que fallaron, están enviándose o se borraron).
  const actionable = !failed && !sending && !msg._temp && !deleted && (msg.body || isMedia);
  const canForward = onForward && actionable;
  const canReply = onReply && actionable;
  // Eliminar "para todos": solo mensajes propios (salientes).
  const canDelete = onDeleteForEveryone && actionable && out;
  const actions = (canForward || canReply || canDelete) ? (
    <div className="self-center flex items-center gap-1 opacity-0 group-hover:opacity-100 max-md:opacity-70 transition-opacity duration-150 shrink-0">
      {canReply && (
        <button onClick={() => onReply(msg)} title="Responder a este mensaje"
                className="w-7 h-7 rounded-full bg-white/90 border border-border text-text3 hover:text-[#B45309] hover:border-[#F5D9A8] flex items-center justify-center cursor-pointer">
          <Reply size={13} />
        </button>
      )}
      {canForward && (
        <button onClick={() => onForward(msg)} title="Reenviar a otro chat (podés elegir varios)"
                className="w-7 h-7 rounded-full bg-white/90 border border-border text-text3 hover:text-[#B45309] hover:border-[#F5D9A8] flex items-center justify-center cursor-pointer">
          <Forward size={13} />
        </button>
      )}
      {canDelete && (
        <button onClick={() => onDeleteForEveryone(msg)} title="Eliminar para todos"
                className="w-7 h-7 rounded-full bg-white/90 border border-border text-text3 hover:text-[#DC2626] hover:border-[#FCA5A5] flex items-center justify-center cursor-pointer">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  ) : null;

  // Nombre del autor del mensaje citado (para la cabecera de la cita).
  const quotedAuthor = quotedMsg ? (quotedMsg.direction === 'out' ? 'Vos' : (quotedMsg.payload?.pushName || authorName || 'Contacto')) : null;

  const bubble = (
    <div
      className={`max-w-[75%] md:max-w-[58%] px-3 py-2 text-[13px] leading-relaxed break-words shadow-[0_1px_1px_rgba(10,22,40,.06)] ${
        out
          ? failed
            ? 'bg-[#FEF2F2] border border-[#FCA5A5] text-text rounded-[14px] rounded-br-[4px]'
            : 'bg-[#DCFCE7] text-text rounded-[14px] rounded-br-[4px]'
          : 'bg-white text-text rounded-[14px] rounded-bl-[4px]'
      } ${selectMode && selected ? 'ring-2 ring-[#F59E0B]' : ''}`}
    >
      {showAuthor && authorName && (
        <div className="text-[11px] font-bold mb-0.5" style={{ color: authorColor }}>
          {authorName}
        </div>
      )}
      {deleted ? (
        <div className="text-[12.5px] italic text-text3 flex items-center gap-1.5">
          <Ban size={13} className="shrink-0" /> {out ? 'Eliminaste este mensaje' : 'Se eliminó este mensaje'}
        </div>
      ) : (
        <>
          {quotedMsg && (
            <div className="mb-1 rounded-md border-l-[3px] border-[#4A67D8] bg-black/[0.045] px-2 py-1 overflow-hidden">
              <div className="text-[10.5px] font-bold text-[#4A67D8] truncate leading-tight">{quotedAuthor}</div>
              <div className="text-[11px] text-text2 truncate leading-tight">{snippetOf(quotedMsg)}</div>
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
          {msg.body && <BodyText text={msg.body} mentions={mentions} />}
        </>
      )}

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
  );

  const avatarEl = !out && isGroup ? (
    showAuthor && authorName ? (
      <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[9.5px] shrink-0 self-end"
           style={{ background: authorColor + '1d', color: authorColor }}>
        {initials(authorName)}
      </div>
    ) : (
      <div className="w-7 shrink-0" />
    )
  ) : null;

  // ── Modo selección múltiple: checkbox a la izquierda, fila clickeable ──
  if (selectMode) {
    return (
      <div onClick={actionable ? () => onToggleSelect(msg) : undefined}
           className={`flex items-center px-2 gap-1 ${actionable ? 'cursor-pointer' : 'opacity-50'} ${selected ? 'bg-[#F59E0B]/[0.08]' : 'hover:bg-black/[0.02]'}`}>
        <span className="w-7 shrink-0 flex items-center justify-center">
          {actionable && (selected
            ? <CircleCheck size={20} className="text-[#F59E0B]" strokeWidth={2.2} />
            : <Circle size={20} className="text-text3" />)}
        </span>
        <div className={`flex-1 min-w-0 flex items-center gap-1.5 ${out ? 'justify-end' : 'justify-start'}`}>
          {avatarEl}
          {bubble}
        </div>
      </div>
    );
  }

  // ── Modo normal ──
  return (
    <div className={`group flex items-center ${out ? 'justify-end' : 'justify-start'} px-4 gap-1.5`}>
      {out && actions}
      {avatarEl}
      {bubble}
      {!out && actions}
    </div>
  );
}
