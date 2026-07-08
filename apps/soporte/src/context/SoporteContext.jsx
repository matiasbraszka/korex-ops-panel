import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@korex/db';
import { useAuth } from '@korex/auth';
import {
  fetchConversations, fetchMessages, patchConversation, fetchSoporteConfig,
  patchSoporteConfig, fetchAppointments, fetchParticipants, fetchGroupNames,
  invokeSend, invokeCita, invokeMedia, invokeGroup, invokeLink,
  invokeAgendar, invokeDeleteForEveryone, PAGE_SIZE,
} from '../lib/api.js';
import { fmtNextCita } from '../lib/format.js';

// Contexto del modulo Soporte: bandeja de WhatsApp.
// Vive solo dentro de /soporte/* (montado por SoporteRoutes), asi su estado y
// el canal realtime mueren al salir del modulo.
const SoporteContext = createContext(null);

export function useSoporte() {
  const ctx = useContext(SoporteContext);
  if (!ctx) throw new Error('useSoporte must be used within SoporteProvider');
  return ctx;
}

let tempSeq = 0;
const tempId = () => `tmp_${Date.now()}_${++tempSeq}`;

export function SoporteProvider({ children }) {
  const { profile } = useAuth();
  const currentMemberId = profile?.id || null;

  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filters, setFilters] = useState({ scope: 'all', tagId: null, assigneeId: null, clientId: null, search: '' });
  // threads: { [convId]: { items, hasMore, loadingOlder, loaded } }
  const [threads, setThreads] = useState({});
  const [config, setConfig] = useState({ tags: [], appointment_template: '' });
  const [appointmentsByConv, setAppointmentsByConv] = useState({});
  const [realtimeOk, setRealtimeOk] = useState(true);

  // Refs espejo para usar dentro de handlers realtime sin resuscribir el canal.
  const selectedRef = useRef(null);
  selectedRef.current = selectedId;
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  // Borradores del composer por conversacion (no causan re-render).
  const draftsRef = useRef({});
  const markReadTimer = useRef(null);

  // ── Carga inicial ──
  const loadAll = useCallback(async () => {
    const [convs, cfg] = await Promise.all([fetchConversations(), fetchSoporteConfig()]);
    if (Array.isArray(convs)) setConversations(convs);
    if (cfg) setConfig(cfg);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── markRead: clamp local + PATCH condicional (solo si unread > 0) ──
  const markRead = useCallback((convId) => {
    if (!convId) return;
    setConversations((prev) => prev.map((c) => (c.id === convId && c.unread_count > 0 ? { ...c, unread_count: 0 } : c)));
    patchConversation(convId, { unread_count: 0 }, { extraFilter: '&unread_count=gt.0' });
  }, []);

  // ── Threads: carga lazy + paginacion ──
  const loadThread = useCallback(async (convId) => {
    const existing = threadsRef.current[convId];
    if (existing?.loaded) return;
    const items = await fetchMessages(convId);
    setThreads((prev) => ({
      ...prev,
      [convId]: { items, hasMore: items.length === PAGE_SIZE, loadingOlder: false, loaded: true },
    }));
  }, []);

  const loadOlder = useCallback(async (convId) => {
    const t = threadsRef.current[convId];
    if (!t || t.loadingOlder || !t.hasMore || t.items.length === 0) return;
    setThreads((prev) => ({ ...prev, [convId]: { ...prev[convId], loadingOlder: true } }));
    const oldest = t.items.find((m) => !m._temp);
    const older = await fetchMessages(convId, { before: oldest?.created_at });
    setThreads((prev) => {
      const cur = prev[convId];
      if (!cur) return prev;
      const seen = new Set(cur.items.map((m) => m.id));
      const fresh = older.filter((m) => !seen.has(m.id));
      return {
        ...prev,
        [convId]: { ...cur, items: [...fresh, ...cur.items], hasMore: older.length === PAGE_SIZE, loadingOlder: false },
      };
    });
  }, []);

  const selectConversation = useCallback((convId) => {
    setSelectedId(convId);
    if (convId) {
      loadThread(convId);
      markRead(convId);
    }
  }, [loadThread, markRead]);

  // ── Realtime: un solo canal, 3 listeners ──
  useEffect(() => {
    let disposed = false;
    let channel = null;
    let retryDelay = 1000;
    let retryTimer = null;

    const upsertConv = (row) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === row.id);
        if (idx === -1) return [...prev, row];
        // Merge preservando los embeds (contact/client) que el evento no trae.
        const merged = { ...prev[idx], ...row };
        const next = [...prev];
        next[idx] = merged;
        return next;
      });
      // Carrera markRead vs webhook: si la conversacion abierta vuelve a tener
      // unread (el webhook la incremento despues de nuestro PATCH), re-marcar.
      if (row.id === selectedRef.current && row.unread_count > 0 && document.visibilityState === 'visible') {
        clearTimeout(markReadTimer.current);
        markReadTimer.current = setTimeout(() => markRead(row.id), 400);
      }
    };

    const onMessageInsert = (row) => {
      const t = threadsRef.current[row.conversation_id];
      if (!t?.loaded) return; // el hilo no esta abierto/cargado: la lista se actualiza sola por el UPDATE de la conversacion
      setThreads((prev) => {
        const cur = prev[row.conversation_id];
        if (!cur) return prev;
        if (cur.items.some((m) => m.id === row.id)) return prev; // duplicado
        // Reconciliar con burbuja optimista: mismo body saliente en 'sending'.
        const tmpIdx = cur.items.findIndex((m) => m._temp && m.direction === 'out' && m.status === 'sending' && m.body === row.body);
        let items;
        if (row.direction === 'out' && tmpIdx !== -1) {
          items = [...cur.items];
          items[tmpIdx] = row;
        } else {
          items = [...cur.items, row];
        }
        return { ...prev, [row.conversation_id]: { ...cur, items } };
      });
    };

    const subscribe = () => {
      if (disposed) return;
      channel = supabase
        .channel('soporte_inbox')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_conversations' }, (p) => upsertConv(p.new))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wa_conversations' }, (p) => upsertConv(p.new))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_messages' }, (p) => onMessageInsert(p.new))
        .subscribe((status) => {
          if (disposed) return;
          if (status === 'SUBSCRIBED') {
            setRealtimeOk(true);
            retryDelay = 1000;
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setRealtimeOk(false);
            const ch = channel;
            channel = null;
            if (ch) supabase.removeChannel(ch);
            retryTimer = setTimeout(subscribe, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 15000);
          }
        });
    };
    subscribe();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearTimeout(markReadTimer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [markRead]);

  // ── Resync al volver a la pestaña (la suscripcion pudo dormirse) ──
  const refresh = useCallback(async () => {
    const convs = await fetchConversations();
    if (Array.isArray(convs)) {
      setConversations(convs);
      if (selectedRef.current && !convs.some((c) => c.id === selectedRef.current)) setSelectedId(null);
    }
    // Delta del hilo abierto: solo lo nuevo despues del ultimo cargado.
    const convId = selectedRef.current;
    const t = convId ? threadsRef.current[convId] : null;
    if (convId && t?.loaded) {
      const lastReal = [...t.items].reverse().find((m) => !m._temp);
      if (lastReal) {
        const fresh = await fetchMessages(convId, { after: lastReal.created_at });
        if (fresh.length) {
          setThreads((prev) => {
            const cur = prev[convId];
            if (!cur) return prev;
            const seen = new Set(cur.items.map((m) => m.id));
            const add = fresh.filter((m) => !seen.has(m.id));
            return add.length ? { ...prev, [convId]: { ...cur, items: [...cur.items, ...add] } } : prev;
          });
        }
      }
    }
  }, []);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // ── Envio con burbuja optimista ──
  const patchTempMessage = (convId, id, patch) => {
    setThreads((prev) => {
      const cur = prev[convId];
      if (!cur) return prev;
      return { ...prev, [convId]: { ...cur, items: cur.items.map((m) => (m.id === id ? { ...m, ...patch } : m)) } };
    });
  };

  const sendMessage = useCallback(async (convId, text, quotedId = null, mentioned = null) => {
    const body = String(text || '').trim();
    if (!convId || !body) return;
    const now = new Date().toISOString();
    const temp = {
      id: tempId(), _temp: true, conversation_id: convId, direction: 'out',
      msg_type: 'conversation', body, status: 'sending', sent_by: currentMemberId,
      wa_timestamp: now, created_at: now, reply_to: quotedId || null,
    };
    setThreads((prev) => {
      const cur = prev[convId] || { items: [], hasMore: false, loadingOlder: false, loaded: true };
      return { ...prev, [convId]: { ...cur, items: [...cur.items, temp] } };
    });
    // Patch optimista de la lista (preview + orden).
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, last_message_at: now, last_message_preview: body.slice(0, 120) } : c)));

    try {
      const res = await invokeSend({ conversationId: convId, text: body, quotedId, mentioned });
      const real = res?.message;
      setThreads((prev) => {
        const cur = prev[convId];
        if (!cur) return prev;
        const already = real && cur.items.some((m) => m.id === real.id);
        const items = cur.items
          .filter((m) => !(m.id === temp.id && (already || !real)))
          .map((m) => (m.id === temp.id && real && !already ? real : m));
        return { ...prev, [convId]: { ...cur, items } };
      });
      if (!real) patchTempMessage(convId, temp.id, { status: 'sent', _temp: false });
    } catch (e) {
      console.error('soporte: fallo el envio', e);
      patchTempMessage(convId, temp.id, { status: 'failed' });
    }
  }, [currentMemberId]);

  // ── Envio de adjuntos (imagen/video/audio/documento) ──
  const MSG_TYPE_BY_KIND = { image: 'imageMessage', video: 'videoMessage', audio: 'audioMessage', document: 'documentMessage' };
  const sendAttachment = useCallback(async (convId, { base64, mimetype, filename, kind, caption, quotedId = null }) => {
    if (!convId || !base64) return;
    const now = new Date().toISOString();
    const temp = {
      id: tempId(), _temp: true, conversation_id: convId, direction: 'out',
      msg_type: MSG_TYPE_BY_KIND[kind] || 'documentMessage', body: caption?.trim() || null,
      status: 'sending', sent_by: currentMemberId, wa_timestamp: now, created_at: now,
      reply_to: quotedId || null,
      // Para reintentar si falla.
      _mediaPayload: { base64, mimetype, filename, kind, caption, quotedId },
    };
    setThreads((prev) => {
      const cur = prev[convId] || { items: [], hasMore: false, loadingOlder: false, loaded: true };
      return { ...prev, [convId]: { ...cur, items: [...cur.items, temp] } };
    });
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, last_message_at: now, last_message_preview: caption || `📎 ${filename}` } : c)));
    try {
      const res = await invokeSend({ conversationId: convId, text: caption?.trim() || '', media: { base64, mimetype, filename, kind }, quotedId });
      const real = res?.message;
      setThreads((prev) => {
        const cur = prev[convId];
        if (!cur) return prev;
        const already = real && cur.items.some((m) => m.id === real.id);
        const items = cur.items
          .filter((m) => !(m.id === temp.id && (already || !real)))
          .map((m) => (m.id === temp.id && real && !already ? real : m));
        return { ...prev, [convId]: { ...cur, items } };
      });
    } catch (e) {
      console.error('soporte: fallo el envio del adjunto', e);
      patchTempMessage(convId, temp.id, { status: 'failed' });
    }
  }, [currentMemberId]);

  // ── Reenviar un mensaje a otro chat (texto o media) ──
  // Texto: lo manda como mensaje. Media: recupera los bytes vía invokeMedia
  // (que ya cachea/firma desde Storage o Evolution) y los reenvía como adjunto.
  const FWD_KIND = { imageMessage: 'image', stickerMessage: 'image', audioMessage: 'audio', videoMessage: 'video', documentMessage: 'document' };
  const forwardMessage = useCallback(async (msg, toConvId) => {
    if (!msg || !toConvId) return;
    const kind = FWD_KIND[msg.msg_type];
    if (!kind) {
      const text = String(msg.body || '').trim();
      if (text) await sendMessage(toConvId, text);
      return;
    }
    const info = await invokeMedia(msg.id); // { url, mime, filename }
    const blob = await (await fetch(info.url)).blob();
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    if (!base64) throw new Error('media_vacia');
    await sendAttachment(toConvId, {
      base64,
      mimetype: info.mime || blob.type || 'application/octet-stream',
      filename: info.filename || 'archivo',
      kind,
      caption: '',
    });
  }, [sendMessage, sendAttachment]);

  const retrySend = useCallback((convId, msgId) => {
    const t = threadsRef.current[convId];
    const msg = t?.items.find((m) => m.id === msgId);
    if (!msg) return;
    // Quitar la fallida y reenviar como mensaje nuevo.
    setThreads((prev) => {
      const cur = prev[convId];
      return { ...prev, [convId]: { ...cur, items: cur.items.filter((m) => m.id !== msgId) } };
    });
    if (msg._mediaPayload) sendAttachment(convId, msg._mediaPayload);
    else sendMessage(convId, msg.body);
  }, [sendMessage, sendAttachment]);

  const discardFailed = useCallback((convId, msgId) => {
    setThreads((prev) => {
      const cur = prev[convId];
      if (!cur) return prev;
      return { ...prev, [convId]: { ...cur, items: cur.items.filter((m) => m.id !== msgId) } };
    });
  }, []);

  // ── Tags / notas / vinculos / status ──
  const updateConversation = useCallback(async (convId, patch) => {
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, ...patch } : c)));
    await patchConversation(convId, patch);
  }, []);

  const notesTimers = useRef({});
  const updateNotes = useCallback((convId, notes) => {
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, notes } : c)));
    clearTimeout(notesTimers.current[convId]);
    notesTimers.current[convId] = setTimeout(() => patchConversation(convId, { notes }), 800);
  }, []);

  const linkContact = useCallback(async (convId, { contactId = undefined, clientId = undefined, contact = undefined, client = undefined }) => {
    const patch = {};
    if (contactId !== undefined) patch.contact_id = contactId;
    if (clientId !== undefined) patch.client_id = clientId;
    setConversations((prev) => prev.map((c) => {
      if (c.id !== convId) return c;
      const next = { ...c, ...patch };
      if (contact !== undefined) next.contact = contact;
      if (client !== undefined) next.client = client;
      return next;
    }));
    await patchConversation(convId, patch);
  }, []);

  // Vincula la conversacion a una persona del Directorio de Finanzas (edge
  // function whatsapp-link): deriva cliente + puente CRM + Google Contacts.
  const linkByFinance = useCallback(async (convId, directoryId) => {
    const res = await invokeLink({ conversationId: convId, directoryId });
    setConversations((prev) => prev.map((c) => {
      if (c.id !== convId) return c;
      const next = { ...c };
      next.contact_id = res.contact_id ?? null;
      next.contact = res.contact_id ? { id: res.contact_id, full_name: res.name } : null;
      if (res.client_id) { next.client_id = res.client_id; next.client = { id: res.client_id, name: res.client_name }; }
      if (res.name) next.wa_profile_name = res.name;
      return next;
    }));
    return res;
  }, []);

  // Agenda un chat 1-a-1 con un nombre a eleccion (custom_name) y lo da de alta
  // en Google Contacts (edge whatsapp-agendar). La base de datos igual tiene
  // prioridad al mostrar el nombre (contact.full_name > custom_name > pushName).
  const agendarContact = useCallback(async (convId, name) => {
    const clean = String(name || '').trim();
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, custom_name: clean || null } : c)));
    return invokeAgendar({ conversationId: convId, name: clean });
  }, []);

  // Elimina un mensaje "para todos" (revoke estilo WhatsApp) via Evolution.
  // Solo mensajes propios; al confirmar, marca deleted_at en el hilo.
  const deleteForEveryone = useCallback(async (convId, messageId) => {
    await invokeDeleteForEveryone(messageId);
    setThreads((prev) => {
      const cur = prev[convId];
      if (!cur) return prev;
      const items = cur.items.map((m) => (m.id === messageId ? { ...m, deleted_at: new Date().toISOString() } : m));
      return { ...prev, [convId]: { ...cur, items } };
    });
  }, []);

  const saveTagsCatalog = useCallback(async (tags) => {
    setConfig((prev) => ({ ...prev, tags }));
    await patchSoporteConfig({ tags });
  }, []);

  // Plantillas de respuestas rápidas (popover "/" del composer + página Plantillas).
  const saveTemplates = useCallback(async (templates) => {
    setConfig((prev) => ({ ...prev, templates }));
    await patchSoporteConfig({ templates });
  }, []);

  // Disponibilidad horaria (página Citas; la usará el futuro link público).
  const saveAvailability = useCallback(async (availability) => {
    setConfig((prev) => ({ ...prev, availability }));
    await patchSoporteConfig({ availability });
  }, []);

  // Enlaces y carpetas de la sección Recursos.
  const saveRecursos = useCallback(async (recursos) => {
    setConfig((prev) => ({ ...prev, recursos }));
    await patchSoporteConfig({ recursos });
  }, []);

  // Número de soporte para el generador de links de WhatsApp (Recursos).
  // Se guarda solo dígitos (código de país incluido, sin + ni espacios).
  const saveSupportNumber = useCallback(async (support_number) => {
    setConfig((prev) => ({ ...prev, support_number }));
    await patchSoporteConfig({ support_number });
  }, []);

  // Historial de links de WhatsApp generados (Recursos → Link de WhatsApp).
  // Cada item: { url, message, number, created_at }.
  const saveWaLinks = useCallback(async (wa_links) => {
    setConfig((prev) => ({ ...prev, wa_links }));
    await patchSoporteConfig({ wa_links });
  }, []);

  // Directorio de un grupo: participantes (jsonb pesado, se pide aparte) +
  // nombres visibles de quienes ya hablaron (pushName de los mensajes).
  const [groupDirByConv, setGroupDirByConv] = useState({});
  const groupDirInflight = useRef(new Set());
  const loadGroupDirectory = useCallback(async (convId) => {
    if (!convId || groupDirInflight.current.has(convId) || groupDirByConv[convId]) return;
    groupDirInflight.current.add(convId);
    try {
      const [participants, names] = await Promise.all([
        fetchParticipants(convId),
        fetchGroupNames(convId),
      ]);
      setGroupDirByConv((prev) => ({ ...prev, [convId]: { participants: participants || [], names } }));
    } catch (e) {
      console.error('soporte: fallo el directorio del grupo', e);
    } finally {
      groupDirInflight.current.delete(convId);
    }
  }, [groupDirByConv]);

  // ── Administracion de grupos (nombre, descripcion, participantes) ──
  // Proxea a Evolution via la edge function whatsapp-group y refleja el
  // resultado en la conversacion + el directorio del grupo.
  const runGroupAction = useCallback(async (convId, payload) => {
    const res = await invokeGroup({ conversationId: convId, ...payload });
    setConversations((prev) => prev.map((c) => {
      if (c.id !== convId) return c;
      const next = { ...c };
      if (res.subject) next.wa_profile_name = res.subject;
      if (res.description !== undefined) next.description = res.description;
      return next;
    }));
    if (Array.isArray(res.participants)) {
      setGroupDirByConv((prev) => ({
        ...prev,
        [convId]: { participants: res.participants, names: prev[convId]?.names || {} },
      }));
    }
    return res;
  }, []);

  const setGroupSubject = useCallback(
    (convId, subject) => runGroupAction(convId, { action: 'set_subject', value: subject }),
    [runGroupAction]);
  const setGroupDescription = useCallback(
    (convId, description) => runGroupAction(convId, { action: 'set_description', value: description }),
    [runGroupAction]);
  const addParticipant = useCallback(
    (convId, phone) => runGroupAction(convId, { action: 'update_participants', op: 'add', participants: [phone] }),
    [runGroupAction]);
  const removeParticipant = useCallback(
    (convId, jid) => runGroupAction(convId, { action: 'update_participants', op: 'remove', participants: [jid] }),
    [runGroupAction]);
  const setGroupPicture = useCallback(
    (convId, image, mimetype) => runGroupAction(convId, { action: 'set_picture', image, mimetype }),
    [runGroupAction]);

  // ── Media (imagenes, audios, documentos) ──
  // mediaByMsg: { [msgId]: { status: 'loading'|'ok'|'failed', url?, mime?, filename? } }
  const [mediaByMsg, setMediaByMsg] = useState({});
  const mediaInflight = useRef(new Set());

  const loadMedia = useCallback(async (msgId) => {
    if (!msgId || mediaInflight.current.has(msgId)) return;
    mediaInflight.current.add(msgId);
    setMediaByMsg((prev) => (prev[msgId]?.url ? prev : { ...prev, [msgId]: { status: 'loading' } }));
    try {
      const res = await invokeMedia(msgId);
      setMediaByMsg((prev) => ({ ...prev, [msgId]: { status: 'ok', url: res.url, mime: res.mime, filename: res.filename } }));
    } catch (e) {
      console.error('soporte: fallo la descarga de media', e);
      setMediaByMsg((prev) => ({ ...prev, [msgId]: { status: 'failed' } }));
    } finally {
      mediaInflight.current.delete(msgId);
    }
  }, []);

  // ── Citas ──
  const appointmentsRef = useRef(appointmentsByConv);
  appointmentsRef.current = appointmentsByConv;

  // Recalcula el chip "próxima cita" de la tarjeta en la lista.
  const refreshNextCita = useCallback((convId, appts) => {
    const now = Date.now();
    const next = (appts || [])
      .filter((a) => a.status === 'scheduled' && new Date(a.start_at).getTime() > now)
      .sort((a, b) => (a.start_at < b.start_at ? -1 : 1))[0];
    setConversations((prev) => prev.map((c) => (
      c.id === convId ? { ...c, next_appointment: next ? fmtNextCita(next.start_at) : null } : c
    )));
  }, []);

  const loadAppointments = useCallback(async (convId) => {
    const rows = await fetchAppointments(convId);
    setAppointmentsByConv((prev) => ({ ...prev, [convId]: rows }));
    // Si hay citas vigentes con invitado por mail, refrescar la asistencia
    // (RSVP) en segundo plano contra Google Calendar.
    if (rows.some((a) => a.status === 'scheduled' && a.invite_email)) {
      invokeCita({ action: 'sync_rsvp', conversation_id: convId })
        .then((res) => {
          if (Array.isArray(res?.appointments)) {
            setAppointmentsByConv((prev) => ({ ...prev, [convId]: res.appointments }));
          }
        })
        .catch(() => {});
    }
  }, []);

  const createAppointment = useCallback(async (payload) => {
    const res = await invokeCita(payload); // lanza si falla
    if (res?.appointment) {
      const convId = payload.conversation_id;
      const next = [res.appointment, ...(appointmentsRef.current[convId] || [])];
      setAppointmentsByConv((prev) => ({ ...prev, [convId]: next }));
      refreshNextCita(convId, next);
    }
    return res;
  }, [refreshNextCita]);

  const cancelAppointment = useCallback(async (convId, appointmentId) => {
    await invokeCita({ action: 'cancel', appointment_id: appointmentId });
    const next = (appointmentsRef.current[convId] || []).map((a) =>
      (a.id === appointmentId ? { ...a, status: 'cancelled' } : a));
    setAppointmentsByConv((prev) => ({ ...prev, [convId]: next }));
    refreshNextCita(convId, next);
  }, [refreshNextCita]);

  // Mueve la cita: actualiza Calendar + Zoom y resetea los recordatorios.
  const rescheduleAppointment = useCallback(async (convId, payload) => {
    const res = await invokeCita({ action: 'reschedule', ...payload }); // lanza si falla
    if (res?.appointment) {
      const next = (appointmentsRef.current[convId] || []).map((a) =>
        (a.id === res.appointment.id ? res.appointment : a));
      setAppointmentsByConv((prev) => ({ ...prev, [convId]: next }));
      refreshNextCita(convId, next);
    }
    return res;
  }, [refreshNextCita]);

  // ── Derivados ──
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const ta = a.last_message_at || a.created_at || '';
      const tb = b.last_message_at || b.created_at || '';
      if (ta !== tb) return ta < tb ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });
  }, [conversations]);

  const visibleConversations = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return sortedConversations.filter((c) => {
      // Archivados: solo se ven en su pestaña (y vuelven solos si escriben).
      if (filters.scope === 'archived') {
        if (!c.archived) return false;
      } else if (c.archived) {
        return false;
      }
      if (filters.scope === 'unread' && !(c.unread_count > 0 && c.id !== selectedId)) return false;
      if (filters.scope === 'dm' && c.is_group) return false;
      if (filters.scope === 'groups' && !c.is_group) return false;
      if (filters.tagId && !(c.tags || []).includes(filters.tagId)) return false;
      if (filters.assigneeId && c.assigned_to !== filters.assigneeId) return false;
      if (filters.clientId && c.client_id !== filters.clientId) return false;
      if (q) {
        const hay = `${c.wa_profile_name || ''} ${c.wa_phone || ''} ${c.contact?.full_name || ''} ${c.client?.name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sortedConversations, filters, selectedId]);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) || null,
    [conversations, selectedId],
  );

  // Conteos por etiqueta y clientes vinculados (sobre los chats NO archivados),
  // para el panel "Etiquetas" y el filtro por cliente.
  const tagCounts = useMemo(() => {
    const counts = {};
    for (const c of conversations) {
      if (c.archived) continue;
      for (const id of (c.tags || [])) counts[id] = (counts[id] || 0) + 1;
    }
    return counts;
  }, [conversations]);

  const linkedClients = useMemo(() => {
    const map = new Map();
    for (const c of conversations) {
      if (c.archived || !c.client_id) continue;
      const cur = map.get(c.client_id) || { id: c.client_id, name: c.client?.name || 'Cliente', count: 0 };
      cur.count += 1;
      map.set(c.client_id, cur);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [conversations]);

  const unreadTotal = useMemo(
    () => conversations.reduce((acc, c) => acc + (c.id === selectedId || c.archived ? 0 : (c.unread_count || 0)), 0),
    [conversations, selectedId],
  );

  const getDraft = useCallback((convId) => draftsRef.current[convId] || '', []);
  const setDraft = useCallback((convId, text) => { draftsRef.current[convId] = text; }, []);

  const value = useMemo(() => ({
    loading, realtimeOk,
    conversations: visibleConversations,
    allConversations: conversations,
    allConversationsCount: conversations.length,
    unreadTotal,
    selectedId, selectedConversation, selectConversation,
    filters, setFilters,
    tagCounts, linkedClients,
    threads, loadOlder,
    sendMessage, sendAttachment, retrySend, discardFailed, forwardMessage,
    tagsCatalog: config.tags || [],
    appointmentTemplate: config.appointment_template || '',
    templates: config.templates || [],
    availability: config.availability || null,
    recursos: config.recursos || [],
    supportNumber: config.support_number || '',
    waLinks: config.wa_links || [],
    saveTagsCatalog, saveTemplates, saveAvailability, saveRecursos, saveSupportNumber, saveWaLinks,
    updateConversation, updateNotes, linkContact, linkByFinance, agendarContact, deleteForEveryone,
    appointmentsByConv, loadAppointments, createAppointment, cancelAppointment, rescheduleAppointment,
    groupDirByConv, loadGroupDirectory,
    setGroupSubject, setGroupDescription, addParticipant, removeParticipant, setGroupPicture,
    mediaByMsg, loadMedia,
    getDraft, setDraft, refresh,
  }), [
    loading, realtimeOk, visibleConversations, conversations, unreadTotal, selectedId,
    selectedConversation, selectConversation, filters, tagCounts, linkedClients, threads, loadOlder,
    sendMessage, sendAttachment, retrySend, discardFailed, forwardMessage, config,
    saveTagsCatalog, saveTemplates, saveAvailability, saveRecursos, saveSupportNumber, saveWaLinks,
    updateConversation, updateNotes, linkContact, linkByFinance, agendarContact, deleteForEveryone, appointmentsByConv,
    loadAppointments, createAppointment, cancelAppointment, rescheduleAppointment,
    groupDirByConv, loadGroupDirectory,
    setGroupSubject, setGroupDescription, addParticipant, removeParticipant, setGroupPicture,
    mediaByMsg, loadMedia, getDraft, setDraft, refresh,
  ]);

  return <SoporteContext.Provider value={value}>{children}</SoporteContext.Provider>;
}
