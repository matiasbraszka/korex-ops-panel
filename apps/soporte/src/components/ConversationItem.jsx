import { Users, Calendar, Link2, CheckCheck, Building2 } from 'lucide-react';
import { useAuth } from '@korex/auth';
import { initials, fmtTime, colorFromString, convName, prettyPreview } from '../lib/format.js';

// Item de conversación — Diseño A.
// Card con avatar + mini-badge WhatsApp, chip de vínculo (cliente azul /
// contacto cian / "Vincular" punteado ámbar), puntos de etiqueta y badge ámbar.
export default function ConversationItem({ conv, active, isSelected, tagsCatalog, onClick }) {
  const { isAdmin } = useAuth();
  const name = convName(conv, !isAdmin);
  const color = colorFromString(conv.wa_jid);
  const unread = isSelected ? 0 : conv.unread_count || 0;
  // Sin nombre conocido (solo teléfono) → avatar "?" punteado, como el diseño.
  const unknown = !conv.is_group && !conv.contact?.full_name && !conv.wa_profile_name;
  const lastIsOurs = conv.last_message_direction === 'out';
  const allTags = (conv.tags || [])
    .map((id) => tagsCatalog.find((t) => t.id === id))
    .filter(Boolean);
  // Mostramos las etiquetas con su nombre; si hay muchas, las primeras + "+N".
  const tags = allTags.slice(0, conv.client?.name ? 1 : 2);
  const extraTags = allTags.length - tags.length;
  // Próxima cita embebida (opcional — si la query de conversaciones la trae).
  const cita = conv.next_appointment || null;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-2.5 rounded-xl border cursor-pointer flex items-start gap-2.5 transition-all duration-150 mb-1.5 ${
        active
          ? 'border-[#F59E0B]/65 bg-[#FFFBF2] shadow-[0_2px_10px_rgba(245,158,11,0.12)]'
          : 'border-border/70 bg-white hover:border-[#F59E0B]/45 hover:shadow-[0_2px_8px_rgba(10,22,40,0.06)]'
      }`}
    >
      {/* Avatar + mini-badge del canal */}
      <div className="relative shrink-0 self-start h-11">
        {unknown ? (
          <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-[15px] text-text3 bg-surface2 border border-dashed border-[#D0D5DD]">
            ?
          </div>
        ) : (
          <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-[13.5px]"
               style={{ background: color + '1d', color }}>
            {conv.is_group ? <Users size={17} /> : initials(name)}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {/* Fila 1: nombre + hora */}
        <div className="flex items-center gap-1.5">
          <span className={`text-[13px] truncate ${unread > 0 ? 'font-bold' : 'font-semibold'} text-text`}>{name}</span>
          {conv.is_group && (
            <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider text-text3 bg-surface2 rounded px-1 py-px">
              Grupo
            </span>
          )}
          <span className="flex-1" />
          <span className={`text-[10px] shrink-0 ${unread > 0 ? 'text-[#B45309] font-semibold' : 'text-text3'}`}>
            {fmtTime(conv.last_message_at)}
          </span>
        </div>

        {/* Fila 2: preview (tilde doble azul si el último mensaje es nuestro) */}
        <div className={`text-[12px] truncate mt-0.5 flex items-center gap-1 ${unread > 0 ? 'text-text font-medium' : 'text-text3'}`}>
          {lastIsOurs && <CheckCheck size={13} className="text-[#53BDEB] shrink-0" />}
          <span className="truncate">
            {(lastIsOurs
              ? prettyPreview(conv.last_message_preview).replace(/^Vos: /, '')
              : prettyPreview(conv.last_message_preview)) || (conv.is_group ? 'Grupo' : 'Sin mensajes')}
          </span>
        </div>

        {/* Fila 3: CLIENTE vinculado (para identificar de quién es) + etiquetas + cita + no leídos.
            El nombre de la persona ya va arriba; no lo repetimos como pastilla. */}
        <div className="flex items-center gap-1 mt-1">
          {conv.client?.name ? (
            <span className="text-[9.5px] font-semibold px-1.5 py-px rounded-full bg-[#EEF2FF] text-[#4A67D8] truncate max-w-[140px] shrink-0 flex items-center gap-0.5">
              <Building2 size={9} className="shrink-0" /> {conv.client.name}
            </span>
          ) : (isAdmin && !conv.is_group && !conv.contact?.full_name) ? (
            <span className="text-[9.5px] font-semibold px-1.5 py-px rounded-full border border-dashed border-[#F5D9A8] text-[#B45309] flex items-center gap-0.5 shrink-0">
              <Link2 size={8} /> Vincular
            </span>
          ) : null}

          {tags.map((t) => (
            <span key={t.id} title={t.label}
                  className="text-[9.5px] font-semibold px-1.5 py-px rounded-full truncate max-w-[96px] shrink min-w-0"
                  style={{ background: t.color + '1f', color: t.color }}>
              {t.label}
            </span>
          ))}
          {extraTags > 0 && (
            <span className="text-[9px] font-bold px-1 py-px rounded-full bg-surface2 text-text3 shrink-0">+{extraTags}</span>
          )}

          {cita && (
            <span className="text-[9.5px] font-semibold px-1.5 py-px rounded-full bg-[#DCFCE7] text-[#15803D] flex items-center gap-0.5 shrink-0">
              <Calendar size={8} /> {cita}
            </span>
          )}

          <span className="flex-1" />
          {unread > 0 && (
            <span className="shrink-0 min-w-[19px] h-[19px] px-1.5 rounded-lg bg-[#F59E0B] text-white text-[10.5px] font-bold flex items-center justify-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
