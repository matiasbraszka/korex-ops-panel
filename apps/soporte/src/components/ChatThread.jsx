import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ArrowDown, ChevronLeft, PanelRight, CalendarPlus, Users, Calendar } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import { initials, dayKey, colorFromString, convName, fmtPhone } from '../lib/format.js';
import MessageBubble from './MessageBubble.jsx';
import Composer from './Composer.jsx';

// Hilo de chat: agrupado por día, autoscroll inteligente, paginación hacia atrás.
export default function ChatThread({ onBack, onOpenPanel, onSchedule }) {
  const { selectedId, selectedConversation, threads, loadOlder, retrySend, discardFailed } = useSoporte();
  const scrollRef = useRef(null);
  const [showJump, setShowJump] = useState(false);
  const stickToBottom = useRef(true);
  const prevHeightRef = useRef(null);

  const thread = threads[selectedId] || { items: [], hasMore: false, loadingOlder: false, loaded: false };
  const conv = selectedConversation;

  // Grupos por día + flag de autor por burbuja (grupos). Los mensajes se
  // ordenan por la hora REAL de WhatsApp (wa_timestamp): el webhook puede
  // entregarlos fuera de orden si llegan casi juntos.
  const groups = useMemo(() => {
    const sorted = [...thread.items].sort((a, b) => {
      const ta = a.wa_timestamp || a.created_at || '';
      const tb = b.wa_timestamp || b.created_at || '';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return (a.created_at || '') < (b.created_at || '') ? -1 : 1;
    });
    const out = [];
    let lastDay = null;
    let lastSender = null;
    for (const m of sorted) {
      const day = dayKey(m.wa_timestamp || m.created_at);
      if (day !== lastDay) {
        out.push({ type: 'day', key: 'day_' + day + '_' + out.length, label: day });
        lastDay = day;
        lastSender = null;
      }
      const senderKey = m.direction === 'out' ? '_me' : (m.sender_jid || 'in');
      out.push({ type: 'msg', key: m.id, msg: m, showAuthor: senderKey !== lastSender });
      lastSender = senderKey;
    }
    return out;
  }, [thread.items]);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setShowJump(false);
  }, []);

  // Al cambiar de conversación: al fondo.
  useEffect(() => {
    stickToBottom.current = true;
    setShowJump(false);
    // El scroll real ocurre en el efecto de items (cuando carga el thread).
  }, [selectedId]);

  // Mensajes nuevos: autoscroll solo si estaba al fondo; si no, pill.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prevHeightRef.current !== null) {
      // Veníamos de un loadOlder: preservar posición visual tras el prepend.
      el.scrollTop = el.scrollHeight - prevHeightRef.current;
      prevHeightRef.current = null;
      return;
    }
    if (stickToBottom.current) scrollToBottom();
    else setShowJump(true);
  }, [groups.length, scrollToBottom]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = isNearBottom();
    if (stickToBottom.current) setShowJump(false);
    if (el.scrollTop < 60 && thread.hasMore && !thread.loadingOlder) {
      prevHeightRef.current = el.scrollHeight - el.scrollTop;
      loadOlder(selectedId);
    }
  }, [isNearBottom, thread.hasMore, thread.loadingOlder, loadOlder, selectedId]);

  if (!conv) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F7F8FA] h-full">
        <div className="text-center px-6">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: '#ECFDF5' }}>
            <Users size={24} style={{ color: '#22C55E' }} />
          </div>
          <div className="text-[14px] font-semibold text-text2">Elegí una conversación</div>
          <div className="text-[12px] text-text3 mt-1">Tus chats de WhatsApp aparecen a la izquierda.</div>
        </div>
      </div>
    );
  }

  const name = convName(conv);
  const color = colorFromString(conv.wa_jid);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 bg-white">
      {/* Header del chat */}
      <div className="h-[54px] bg-white border-b border-border flex items-center gap-2.5 px-3 shrink-0">
        <button onClick={onBack} className="md:hidden bg-transparent border-0 text-text2 cursor-pointer p-1 -ml-1">
          <ChevronLeft size={20} />
        </button>
        <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[12px] shrink-0"
             style={{ background: color + '20', color }}>
          {conv.is_group ? <Users size={15} /> : initials(name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-bold truncate">{name}</div>
          <div className="text-[11px] text-text3 truncate">
            {conv.is_group ? 'Grupo' : fmtPhone(conv.wa_phone)}
            {conv.client?.name ? ` · ${conv.client.name}` : ''}
            {conv.status === 'closed' ? ' · Cerrada' : ''}
          </div>
        </div>
        {!conv.is_group && (
          <button onClick={onSchedule} title="Agendar cita"
                  className="bg-transparent border border-border rounded-lg p-1.5 text-text2 hover:text-[#F59E0B] hover:border-[#F59E0B]/60 cursor-pointer transition-colors">
            <CalendarPlus size={16} />
          </button>
        )}
        <button onClick={onOpenPanel} title="Detalles, etiquetas y notas"
                className="bg-transparent border border-border rounded-lg p-1.5 text-text2 hover:text-[#F59E0B] hover:border-[#F59E0B]/60 cursor-pointer transition-colors">
          <PanelRight size={16} />
        </button>
      </div>

      {/* Hilo */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto min-h-0 py-3 relative">
        {thread.loadingOlder && (
          <div className="text-center text-[11px] text-text3 py-1.5">Cargando anteriores…</div>
        )}
        {!thread.loaded ? (
          <div className="text-center text-[12px] text-text3 py-10">Cargando mensajes…</div>
        ) : thread.items.length === 0 ? (
          <div className="text-center text-[12px] text-text3 py-10">Sin mensajes todavía. Los nuevos van a aparecer acá.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {groups.map((g) =>
              g.type === 'day' ? (
                <div key={g.key} className="flex justify-center my-2">
                  <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-text2 bg-surface2 rounded-full px-3 py-1 capitalize">
                    <Calendar size={11} /> {g.label}
                  </span>
                </div>
              ) : (
                <MessageBubble
                  key={g.key}
                  msg={g.msg}
                  isGroup={conv.is_group}
                  showAuthor={g.showAuthor}
                  onRetry={() => retrySend(selectedId, g.msg.id)}
                  onDiscard={() => discardFailed(selectedId, g.msg.id)}
                />
              )
            )}
          </div>
        )}
      </div>

      {showJump && (
        <div className="relative">
          <button onClick={() => scrollToBottom(true)}
                  className="absolute -top-12 right-4 bg-white border border-border rounded-full shadow-md px-3 py-1.5 text-[11.5px] font-semibold text-text2 cursor-pointer flex items-center gap-1 hover:text-text z-10">
            Nuevos mensajes <ArrowDown size={12} />
          </button>
        </div>
      )}

      <Composer onSent={() => { stickToBottom.current = true; }} />
    </div>
  );
}
