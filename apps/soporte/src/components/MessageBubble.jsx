import { Clock, AlertCircle, CheckCheck, Forward, Reply, CircleCheck, Circle, Trash2, Ban, User, Phone, Pencil } from 'lucide-react';
import { fmtClock, colorFromString, msgTypeLabel, initials, extractContacts } from '../lib/format.js';
import MediaContent from './MediaContent.jsx';

// Tipos que renderizan contenido multimedia real (imagen, audio, video, doc).
const MEDIA_TYPES = new Set(['imageMessage', 'stickerMessage', 'audioMessage', 'videoMessage', 'documentMessage']);
// Tipos de tarjeta de contacto (vCard): se pintan desde el payload, sin descarga.
const CONTACT_TYPES = new Set(['contactMessage', 'contactsArrayMessage']);

// Tarjeta de contacto compartida: nombre + teléfonos con acción de llamar.
// Los datos ya vienen en el payload del mensaje (no hay que bajar nada).
function ContactCard({ contacts }) {
  if (!contacts?.length) return <div className="text-[12.5px] font-medium text-text2">👤 Contacto</div>;
  return (
    <div className="flex flex-col gap-1.5">
      {contacts.map((c, i) => (
        <div key={i} className="flex items-center gap-2.5 bg-white border border-border rounded-xl px-3 py-2 max-w-[260px]">
          <span className="w-8 h-8 rounded-full bg-[#EEF2FF] text-[#4A67D8] flex items-center justify-center shrink-0">
            <User size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-text truncate">{c.name}</div>
            {c.phones.length ? c.phones.map((p, j) => (
              <a key={j} href={`tel:${p}`} className="flex items-center gap-1 text-[11px] text-[#4A67D8] truncate hover:underline">
                <Phone size={10} className="shrink-0" /> {p}
              </a>
            )) : <div className="text-[11px] text-text3">Sin número</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// Texto corto de un mensaje (para la cita / preview).
const MEDIA_SNIPPET = { imageMessage: '📷 Imagen', stickerMessage: 'Sticker', audioMessage: '🎙 Nota de voz', videoMessage: '🎬 Video', documentMessage: '📄 Documento' };
const snippetOf = (m) => (m?.body && m.body.trim()) || MEDIA_SNIPPET[m?.msg_type] || 'Mensaje';

// Menciones coloreadas como en WhatsApp. `mentions` es el índice número→
// {name, phone} del grupo. Si la mención es un @<número> conocido mostramos el
// nombre; si no lo hay pero sí el teléfono real, mostramos +teléfono; recién
// como último recurso mostramos el número crudo (el "lid" opaco de WhatsApp).
function BodyText({ text, mentions }) {
  const parts = String(text).split(/(@[0-9]{5,}|@[\wÀ-ÿ.]+)/g);
  return (
    <div className="whitespace-pre-wrap">
      {parts.map((p, i) => {
        if (p.startsWith('@')) {
          const key = p.slice(1);
          const info = mentions && mentions[key];
          const label = info ? (info.name || (info.phone ? '+' + info.phone : key)) : key;
          return <span key={i} className="font-semibold text-[#4A67D8]">@{label}</span>;
        }
        return <span key={i}>{p}</span>;
      })}
    </div>
  );
}

// Burbuja de mensaje — Diseño A (estilo WhatsApp).
// Entrantes: blancas con sombra sutil. Salientes: verde #DCFCE7.
// En grupos: avatar del autor (solo primera burbuja consecutiva) + nombre coloreado.
// WhatsApp deja editar los mensajes propios hasta 15 minutos después de enviarlos.
// El botón aparece solo dentro de esa ventana: ofrecerlo después sería prometer algo
// que el servidor va a rechazar.
const VENTANA_EDICION_MIN = 15;
const dentroDeVentana = (msg) => {
  const t = new Date(msg.wa_timestamp || msg.created_at || 0).getTime();
  return t > 0 && (Date.now() - t) / 60000 < VENTANA_EDICION_MIN;
};

export default function MessageBubble({ msg, isGroup, showAuthor, onRetry, onDiscard, onForward, onReply, onDeleteForEveryone, onEdit, selectMode, selected, onToggleSelect, quotedMsg, mentions }) {
  const out = msg.direction === 'out';
  const deleted = !!msg.deleted_at;
  const isMedia = !deleted && MEDIA_TYPES.has(msg.msg_type);
  const isContact = !deleted && CONTACT_TYPES.has(msg.msg_type);
  const contacts = isContact ? extractContacts(msg.payload) : null;
  const typeLabel = !isMedia && !isContact && !deleted ? msgTypeLabel(msg.msg_type) : null;
  const authorName = !out && isGroup ? (msg.payload?.pushName || (msg.sender_jid || '').split('@')[0]) : null;
  const authorColor = colorFromString(msg.sender_jid || '');
  const failed = msg.status === 'failed';
  const sending = msg.status === 'sending';

  // Acciones (responder / reenviar / eliminar / seleccionar): en mensajes ya
  // enviados o recibidos (no en los que fallaron, están enviándose o se borraron).
  const actionable = !failed && !sending && !msg._temp && !deleted && (msg.body || isMedia || isContact);
  const canForward = onForward && actionable;
  const canReply = onReply && actionable;
  // Eliminar "para todos": solo mensajes propios (salientes).
  const canDelete = onDeleteForEveryone && actionable && out;
  // Editar: propio, de texto, y dentro de los 15 minutos que permite WhatsApp.
  const canEdit = onEdit && actionable && out && !isMedia && !isContact && !!msg.body && dentroDeVentana(msg);
  const actions = (canForward || canReply || canDelete || canEdit) ? (
    <div className="self-center flex items-center gap-1 opacity-0 group-hover:opacity-100 max-md:opacity-70 transition-opacity duration-150 shrink-0">
      {canEdit && (
        <button onClick={() => onEdit(msg)} title="Editar este mensaje (WhatsApp lo permite hasta 15 minutos después de enviarlo)"
                className="w-7 h-7 rounded-full bg-white/90 border border-border text-text3 hover:text-[#2E69E0] hover:border-[#C7D2FE] flex items-center justify-center cursor-pointer">
          <Pencil size={13} />
        </button>
      )}
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
          {isContact && (
            <div className={msg.body ? 'mb-1' : ''}>
              <ContactCard contacts={contacts} />
            </div>
          )}
          {typeLabel && (
            <div className={`text-[11.5px] font-medium ${msg.body ? 'mb-0.5' : ''} text-text2`}>{typeLabel}</div>
          )}
          {msg.body && <BodyText text={msg.body} mentions={mentions} />}
        </>
      )}

      <div className="flex items-center justify-end gap-1 mt-0.5">
        {/* "editado", igual que WhatsApp. Con el texto original en el tooltip: si
            alguien discute qué se le dijo al cliente, está a un hover. */}
        {msg.edited_at && !deleted && (
          <span className={`text-[9.5px] italic ${out ? 'text-[#7A9484]' : 'text-text3'}`}
                title={msg.body_original ? `Antes decía: ${msg.body_original}` : 'Este mensaje se editó'}>
            editado
          </span>
        )}
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
