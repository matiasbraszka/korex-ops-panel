import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ArrowDown, ChevronLeft, PanelRight, CalendarPlus, Users, Forward, X } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import { useAuth } from '@korex/auth';
import { initials, dayKey, colorFromString, convName, fmtPhone, mentionMap } from '../lib/format.js';
import MessageBubble from './MessageBubble.jsx';
import Composer from './Composer.jsx';
import ForwardModal from './ForwardModal.jsx';

// Hilo de chat — Diseño A: wallpaper estilo WhatsApp, header con chip de
// vínculo, píldora de día. Lógica idéntica a la versión anterior
// (agrupado por día, autoscroll inteligente, paginación hacia atrás).

// Wallpaper: beige WhatsApp + puntos sutiles (no hay token Tailwind, va inline).
const WALLPAPER = {
  backgroundColor: '#EFEAE2',
  backgroundImage: 'radial-gradient(rgba(120,100,70,0.07) 1px, transparent 1.1px)',
  backgroundSize: '18px 18px',
};

export default function ChatThread({ onBack, onOpenPanel, onSchedule }) {
  const { selectedId, selectedConversation, threads, loadOlder, retrySend, discardFailed, deleteForEveryone, groupDirByConv, loadGroupDirectory } = useSoporte();
  const { isAdmin } = useAuth();
  const scrollRef = useRef(null);
  const [showJump, setShowJump] = useState(false);
  const [forwardMsgs, setForwardMsgs] = useState(null); // array de mensajes a reenviar (null = modal cerrado)
  const [selectMode, setSelectMode] = useState(false);  // selección múltiple para reenviar
  const [selected, setSelected] = useState(() => new Set());
  const [replyTo, setReplyTo] = useState(null);

  const exitSelect = useCallback(() => { setSelectMode(false); setSelected(new Set()); }, []);
  const enterSelect = useCallback((m) => { setSelectMode(true); setSelected(new Set([m.id])); }, []);
  const toggleSelect = useCallback((m) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; });
  }, []);

  // Eliminar "para todos" (revoke). Solo mensajes propios; confirma antes.
  const handleDelete = useCallback(async (m) => {
    if (!window.confirm('¿Eliminar este mensaje para todos? Se borra también del WhatsApp del contacto.')) return;
    try {
      await deleteForEveryone(selectedId, m.id);
    } catch (e) {
      console.error('delete for everyone', e);
      window.alert('No se pudo eliminar para todos. Puede que WhatsApp ya no lo permita (pasó demasiado tiempo desde que se envió).');
    }
  }, [deleteForEveryone, selectedId]);
  const stickToBottom = useRef(true);
  const prevHeightRef = useRef(null);

  const thread = threads[selectedId] || { items: [], hasMore: false, loadingOlder: false, loaded: false };
  const conv = selectedConversation;

  const groups = useMemo(() => {
    // "Contenido protegido" (secretEncryptedMessage): wrapper E2E que WhatsApp no
    // deja ver del lado del panel (viene sobre todo de mensajes del teléfono).
    // Es ruido irrecuperable → no se muestra en el hilo.
    const sorted = [...thread.items]
      .filter((m) => m.msg_type !== 'secretEncryptedMessage')
      .sort((a, b) => {
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

  // Mapa wa_message_id → mensaje (para resolver la cita del "responder").
  const byWaId = useMemo(() => {
    const m = {};
    for (const it of thread.items) if (it.wa_message_id) m[it.wa_message_id] = it;
    return m;
  }, [thread.items]);

  // Mensajes seleccionados para reenviar (en orden del hilo).
  const selectedMsgs = useMemo(() => thread.items.filter((m) => selected.has(m.id)), [thread.items, selected]);

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

  useEffect(() => {
    stickToBottom.current = true;
    setShowJump(false);
    setReplyTo(null);
    setSelectMode(false);
    setSelected(new Set());
  }, [selectedId]);

  // En grupos, el sub del header lista a los participantes con nombre
  // ("Pedro, Romina y 5 más"), como en el diseño.
  const isGroup = Boolean(conv?.is_group);
  const convId = conv?.id;
  useEffect(() => {
    if (isGroup && convId) loadGroupDirectory(convId);
  }, [isGroup, convId, loadGroupDirectory]);
  const dir = isGroup && convId ? groupDirByConv[convId] : null;
  // Mapa número→nombre para mostrar las menciones (@número) con el nombre real.
  const mentions = useMemo(() => (isGroup ? mentionMap(dir) : null), [isGroup, dir]);
  let groupSub = 'Grupo';
  if (dir?.participants?.length) {
    const names = dir.participants
      .map((p) => dir.names?.[p.jid])
      .filter(Boolean)
      .map((n) => n.split(' ')[0]);
    const shown = [...new Set(names)].slice(0, 4);
    const more = dir.participants.length - shown.length;
    groupSub = shown.length
      ? `${shown.join(', ')}${more > 0 ? ` y ${more} más` : ''}`
      : `${dir.participants.length} participantes`;
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prevHeightRef.current !== null) {
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
      <div className="flex-1 flex items-center justify-center h-full" style={WALLPAPER}>
        <div className="text-center px-6">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-white shadow-sm">
            <Users size={24} className="text-[#F59E0B]" />
          </div>
          <div className="text-[14px] font-semibold text-text2">Elegí una conversación</div>
          <div className="text-[12px] text-text3 mt-1">Tus chats de WhatsApp aparecen a la izquierda.</div>
        </div>
      </div>
    );
  }

  const name = convName(conv, !isAdmin);
  const color = colorFromString(conv.wa_jid);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0">
      {/* Header del chat */}
      <div className="h-[58px] bg-white border-b border-border flex items-center gap-2.5 px-3.5 shrink-0">
        <button onClick={onBack} className="md:hidden bg-transparent border-0 text-text2 cursor-pointer p-1 -ml-1">
          <ChevronLeft size={20} />
        </button>
        <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[12px] shrink-0"
             style={{ background: color + '1d', color }}>
          {conv.is_group ? <Users size={15} /> : initials(name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13.5px] font-bold truncate">{name}</span>
            {conv.client?.name && (
              <span className="shrink-0 text-[9.5px] font-semibold px-1.5 py-px rounded-full bg-[#EEF2FF] text-[#4A67D8] max-md:hidden">
                Cliente · {conv.client.name}
              </span>
            )}
            {!conv.client && conv.contact?.full_name && (
              <span className="shrink-0 text-[9.5px] font-semibold px-1.5 py-px rounded-full bg-[#ECFEFF] text-[#0E7490] max-md:hidden">
                {conv.contact.full_name}
              </span>
            )}
          </div>
          <div className="text-[11px] text-text3 truncate">
            {/* El número solo lo ven los admins; el resto ve el nombre arriba. */}
            {[conv.is_group ? groupSub : (isAdmin ? fmtPhone(conv.wa_phone) : ''),
              conv.status === 'closed' ? 'Cerrada' : '']
              .filter(Boolean).join(' · ')}
          </div>
        </div>
        {!conv.is_group && (
          <button onClick={onSchedule} title="Agendar cita"
                  className="bg-white border border-border rounded-[9px] h-8 px-2.5 text-[12px] font-semibold text-text2 hover:text-[#B45309] hover:border-[#F5D9A8] cursor-pointer transition-colors duration-150 flex items-center gap-1.5">
            <CalendarPlus size={14} />
            <span className="max-md:hidden">Agendar</span>
          </button>
        )}
        <button onClick={onOpenPanel} title="Detalles, etiquetas y notas"
                className="bg-[#FFFBF2] border border-[#F5D9A8] rounded-[9px] w-8 h-8 text-[#B45309] cursor-pointer transition-colors duration-150 flex items-center justify-center">
          <PanelRight size={14} />
        </button>
      </div>

      {/* Hilo sobre wallpaper */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto min-h-0 py-3.5 relative" style={WALLPAPER}>
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
                  <span className="inline-flex items-center text-[10.5px] font-semibold text-text3 bg-white rounded-full px-3 py-1 uppercase shadow-[0_1px_2px_rgba(10,22,40,.06)]">
                    {g.label}
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
                  onForward={enterSelect}
                  onReply={setReplyTo}
                  onDeleteForEveryone={handleDelete}
                  selectMode={selectMode}
                  selected={selected.has(g.msg.id)}
                  onToggleSelect={toggleSelect}
                  quotedMsg={g.msg.reply_to ? byWaId[g.msg.reply_to] : null}
                  mentions={mentions}
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

      {selectMode ? (
        <div className="bg-white border-t border-border px-3 py-2.5 flex items-center gap-3 shrink-0">
          <button onClick={exitSelect} title="Cancelar"
                  className="w-8 h-8 rounded-full border border-border text-text2 hover:bg-surface2 flex items-center justify-center cursor-pointer shrink-0">
            <X size={16} />
          </button>
          <span className="text-[12.5px] font-semibold text-text2">
            {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
          </span>
          <div className="flex-1" />
          <button onClick={() => selected.size && setForwardMsgs(selectedMsgs)} disabled={!selected.size}
                  className={`py-2 px-4 rounded-[10px] border-0 text-[12.5px] font-bold flex items-center gap-1.5 transition-colors duration-150 ${
                    selected.size ? 'bg-[#F59E0B] text-white cursor-pointer hover:bg-[#E08C0B] shadow-[0_2px_6px_rgba(245,158,11,.35)]' : 'bg-surface2 text-text3 cursor-default'}`}>
            <Forward size={14} /> Reenviar
          </button>
        </div>
      ) : (
        <Composer replyTo={replyTo} onClearReply={() => setReplyTo(null)}
                  onSent={() => { stickToBottom.current = true; }} />
      )}

      <ForwardModal msgs={forwardMsgs} onClose={() => { setForwardMsgs(null); exitSelect(); }} />
    </div>
  );
}
