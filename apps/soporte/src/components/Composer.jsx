import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, Paperclip, X, FileText, Image as ImageIcon, Film, Music, Mic, Trash2, User } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import { convName, colorFromString, initials } from '../lib/format.js';

const MAX_FILE_MB = 12;

const REPLY_SNIPPET = { imageMessage: '📷 Imagen', stickerMessage: 'Sticker', audioMessage: '🎙 Nota de voz', videoMessage: '🎬 Video', documentMessage: '📄 Documento' };
const replySnippet = (m) => (m?.body && m.body.trim()) || REPLY_SNIPPET[m?.msg_type] || 'Mensaje';

function kindFromMime(mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

const KIND_ICONS = { image: ImageIcon, video: Film, audio: Music, document: FileText };

// Respaldo si la config todavía no tiene plantillas. La fuente de verdad es
// soporte_config.templates, editable desde la página Plantillas.
const DEFAULT_TEMPLATES = [
  { id: 'tpl_cita', shortcut: 'cita', name: 'Confirmación de cita', body: 'Hola {nombre}! Te agendamos para el {fecha} a las {hora}. Cualquier cosa avisame por acá' },
  { id: 'tpl_link', shortcut: 'link', name: 'Link de reunión', body: 'Link de la reunión: {zoom}' },
  { id: 'tpl_saludo', shortcut: 'saludo', name: 'Saludo inicial', body: 'Hola {nombre}! Gracias por escribirnos, ¿en qué te ayudo?' },
];

// Composer — Diseño A: card redondeada, foco ámbar, enviar circular ámbar.
// Tipear «/» al inicio abre el popover de respuestas rápidas (↑↓ Enter Esc).
export default function Composer({ onSent, replyTo, onClearReply }) {
  const { selectedId, selectedConversation, sendMessage, sendAttachment, getDraft, setDraft, templates: configTemplates, groupDirByConv } = useSoporte();
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const taRef = useRef(null);
  const fileRef = useRef(null);

  // ── Menciones @ (solo grupos) ──
  const [mentionQuery, setMentionQuery] = useState(null); // texto tras @ o null
  const [mentionStart, setMentionStart] = useState(0);
  const mentionsRef = useRef([]); // [{ tag, num, jid }] agregadas con el picker
  const isGroup = selectedConversation?.is_group;
  const groupDir = isGroup ? groupDirByConv[selectedId] : null;
  const mentionCandidates = useMemo(() => {
    if (!groupDir) return [];
    const names = groupDir.names || {};
    const seen = new Set();
    const list = [];
    const add = (jid) => {
      const num = String(jid || '').split('@')[0].split(':')[0];
      if (!num || seen.has(num)) return;
      seen.add(num);
      list.push({ num, jid, name: names[jid] || null });
    };
    (groupDir.participants || []).forEach((p) => add(p.jid));
    Object.keys(names).forEach((jid) => add(jid));
    return list.sort((a, b) => (b.name ? 1 : 0) - (a.name ? 1 : 0));
  }, [groupDir]);
  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery;
    return mentionCandidates
      .filter((c) => (c.name || '').toLowerCase().includes(q) || c.num.includes(q))
      .slice(0, 8);
  }, [mentionQuery, mentionCandidates]);

  // ── Grabación de nota de voz ──
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const recRef = useRef(null);      // MediaRecorder
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const sendOnStopRef = useRef(false);
  const fmtSecs = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    clearInterval(timerRef.current);
  };

  const startRecording = async () => {
    setFileError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setFileError('Tu navegador no permite grabar audio.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        stopTracks();
        setRecording(false);
        setRecSecs(0);
        if (sendOnStopRef.current && blob.size > 0) {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = String(reader.result || '').split(',')[1] || '';
            if (!base64) return;
            const ext = (blob.type.includes('mp4') ? 'm4a' : 'webm');
            sendAttachment(selectedId, { base64, mimetype: blob.type || 'audio/webm', filename: `nota-de-voz.${ext}`, kind: 'audio', caption: '', quotedId: replyTo?.wa_message_id || null });
            onClearReply?.();
            onSent?.();
          };
          reader.readAsDataURL(blob);
        }
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      setRecSecs(0);
      timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      setFileError('No pudimos acceder al micrófono. Revisá los permisos del navegador.');
      stopTracks();
    }
  };

  const finishRecording = (send) => {
    sendOnStopRef.current = send;
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    else { stopTracks(); setRecording(false); setRecSecs(0); }
  };

  // Cortar la grabación si se cambia de chat o se desmonta.
  useEffect(() => () => { sendOnStopRef.current = false; if (recRef.current?.state === 'recording') recRef.current.stop(); stopTracks(); }, []);

  const templates = useMemo(
    () => (configTemplates?.length ? configTemplates : DEFAULT_TEMPLATES),
    [configTemplates],
  );

  // Popover «/»: activo si el texto empieza con "/" (sin saltos) y no fue cerrado con Esc.
  const slashQuery = text.startsWith('/') && !text.includes('\n') ? text.slice(1).toLowerCase() : null;
  const slashMatches = useMemo(() => {
    if (slashQuery === null) return [];
    return templates.filter((t) => t.shortcut.startsWith(slashQuery) || t.name.toLowerCase().includes(slashQuery));
  }, [slashQuery, templates]);
  const popoverOpen = slashQuery !== null && slashMatches.length > 0 && !slashDismissed && !file;
  const mentionOpen = Boolean(isGroup) && mentionQuery !== null && mentionMatches.length > 0 && !file;

  useEffect(() => { setHighlight(0); }, [slashQuery, mentionQuery]);

  useEffect(() => {
    // Si estaba grabando y cambia de chat, descartar la grabación.
    if (recRef.current?.state === 'recording') { sendOnStopRef.current = false; recRef.current.stop(); }
    setText(getDraft(selectedId));
    setFile(null);
    setFileError('');
    setSlashDismissed(false);
    setMentionQuery(null);
    mentionsRef.current = [];
    const ta = taRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.focus();
    }
  }, [selectedId, getDraft]);

  // Al elegir "responder", enfocar el cuadro de texto.
  useEffect(() => { if (replyTo) taRef.current?.focus(); }, [replyTo]);

  const autosize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  // Detecta si el cursor está escribiendo una mención (@algo) para abrir el picker.
  const detectMention = (val, caret) => {
    if (!isGroup) { setMentionQuery(null); return; }
    const upto = val.slice(0, caret ?? val.length);
    const m = upto.match(/(?:^|\s)@([\p{L}0-9._-]*)$/u);
    if (m) { setMentionQuery(m[1].toLowerCase()); setMentionStart((caret ?? val.length) - m[1].length - 1); }
    else setMentionQuery(null);
  };

  const onChange = (e) => {
    setText(e.target.value);
    setDraft(selectedId, e.target.value);
    setSlashDismissed(false);
    detectMention(e.target.value, e.target.selectionStart);
    autosize();
  };

  // Elegir a quién mencionar: inserta @Nombre legible y recuerda su número/jid.
  const pickMention = (c) => {
    if (!c) return;
    const ta = taRef.current;
    const caret = ta ? ta.selectionStart : text.length;
    const before = text.slice(0, mentionStart);
    const after = text.slice(caret);
    const tag = c.name ? '@' + c.name.split(' ')[0] : '@' + c.num;
    const insert = tag + ' ';
    const next = before + insert + after;
    setText(next);
    setDraft(selectedId, next);
    mentionsRef.current.push({ tag, num: c.num, jid: c.jid });
    setMentionQuery(null);
    requestAnimationFrame(() => {
      autosize();
      const pos = (before + insert).length;
      ta?.focus();
      ta?.setSelectionRange(pos, pos);
    });
  };

  // Inserta la plantilla resolviendo {nombre} con el contacto del chat.
  const insertTemplate = (tpl) => {
    const nombre = (convName(selectedConversation) || '').split(' ')[0];
    const body = tpl.body.replaceAll('{nombre}', nombre || '{nombre}');
    setText(body);
    setDraft(selectedId, body);
    setSlashDismissed(true);
    requestAnimationFrame(() => {
      autosize();
      taRef.current?.focus();
    });
  };

  // Deja un archivo en preview listo para enviar. Fuente única para el botón
  // clip, pegar (paste) y arrastrar-soltar (drop).
  const stageFile = (f) => {
    if (!f) return;
    setFileError('');
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setFileError(`El archivo supera los ${MAX_FILE_MB}MB. Mandalo desde el teléfono.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.split(',')[1] || '';
      const mimetype = f.type || 'application/octet-stream';
      const kind = kindFromMime(mimetype);
      // Las imágenes pegadas del portapapeles suelen venir sin nombre.
      const filename = f.name || `imagen.${(mimetype.split('/')[1] || 'png').split(';')[0]}`;
      setFile({
        base64, mimetype, filename, kind,
        sizeMB: (f.size / 1048576).toFixed(1),
        previewUrl: kind === 'image' ? dataUrl : null,
      });
    };
    reader.readAsDataURL(f);
  };

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    stageFile(f);
  };

  // Pegar (Ctrl/Cmd+V) una imagen/archivo desde el portapapeles.
  const onPaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) { e.preventDefault(); stageFile(f); return; }
      }
    }
  };

  // Arrastrar-soltar un archivo sobre el cuadro de mensaje.
  const onDragOver = (e) => {
    if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragging(true); }
  };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    setDragging(false);
    stageFile(e.dataTransfer.files[0]);
  };

  const submit = () => {
    const body = text.trim();
    const quotedId = replyTo?.wa_message_id || null;
    if (file) {
      sendAttachment(selectedId, { base64: file.base64, mimetype: file.mimetype, filename: file.filename, kind: file.kind, caption: body, quotedId });
      setFile(null);
    } else {
      if (!body) return;
      // Traducir @Nombre → @número (lo que WhatsApp necesita) y juntar los jids
      // mencionados para que Evolution notifique a esas personas.
      let outBody = body;
      const mentioned = [];
      for (const men of mentionsRef.current) {
        if (outBody.includes(men.tag)) {
          outBody = outBody.replace(men.tag, '@' + men.num);
          mentioned.push(men.jid);
        }
      }
      sendMessage(selectedId, outBody, quotedId, mentioned.length ? mentioned : undefined);
    }
    mentionsRef.current = [];
    setMentionQuery(null);
    setText('');
    setDraft(selectedId, '');
    onClearReply?.();
    const ta = taRef.current;
    if (ta) ta.style.height = 'auto';
    onSent?.();
  };

  const onKeyDown = (e) => {
    if (mentionOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % mentionMatches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + mentionMatches.length) % mentionMatches.length); return; }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { e.preventDefault(); pickMention(mentionMatches[highlight]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return; }
    }
    if (popoverOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % slashMatches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + slashMatches.length) % slashMatches.length); return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); insertTemplate(slashMatches[highlight]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSlashDismissed(true); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = file || text.trim();
  const KindIcon = file ? KIND_ICONS[file.kind] : null;

  return (
    <div className="px-3.5 pb-1.5 pt-2 shrink-0 relative"
         onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {/* Overlay al arrastrar un archivo encima del cuadro */}
      {dragging && (
        <div className="absolute inset-1.5 z-30 flex items-center justify-center rounded-[14px] border-2 border-dashed border-[#F59E0B] bg-[#FFFBEB]/95 pointer-events-none">
          <span className="text-[13px] font-bold text-[#B45309] flex items-center gap-2">
            <Paperclip size={16} /> Soltá para adjuntar
          </span>
        </div>
      )}
      {/* Mobile: respuestas rápidas como chips horizontales (el popover "/" es
          incómodo con teclado táctil) */}
      {!file && !text && (
        <div className="hidden max-md:flex gap-1.5 mb-2 overflow-x-auto pb-0.5">
          {templates.slice(0, 3).map((t) => (
            <button key={t.id || t.shortcut} onClick={() => insertTemplate(t)}
                    className="shrink-0 text-[11.5px] font-bold px-2.5 py-1 rounded-full border border-[#F5D9A8] bg-white text-[#B45309] cursor-pointer">
              /{t.shortcut}
            </button>
          ))}
          {templates.length > 3 && (
            <button onClick={() => { setText('/'); setDraft(selectedId, '/'); taRef.current?.focus(); }}
                    className="shrink-0 text-[11.5px] font-semibold px-2.5 py-1 rounded-full border border-dashed border-[#D0D5DD] bg-white text-text3 cursor-pointer">
              más…
            </button>
          )}
        </div>
      )}
      {/* Popover de menciones (@ en grupos) */}
      {mentionOpen && (
        <div className="absolute bottom-full left-3.5 mb-1.5 w-[min(360px,calc(100%-28px))] bg-white border border-border rounded-[14px] shadow-lg p-1.5 z-20">
          <div className="px-2.5 pt-1.5 pb-1.5 text-[10px] font-bold tracking-widest text-text3">MENCIONAR EN EL GRUPO</div>
          <div className="flex flex-col gap-0.5 max-h-[240px] overflow-y-auto">
            {mentionMatches.map((c, i) => (
              <button key={c.num}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => pickMention(c)}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-[10px] border-0 cursor-pointer text-left transition-colors duration-150 ${i === highlight ? 'bg-[#FEF0D7]' : 'bg-transparent hover:bg-surface2'}`}>
                <span className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0"
                      style={{ background: colorFromString(c.jid) + '1d', color: colorFromString(c.jid) }}>
                  {c.name ? initials(c.name) : <User size={13} />}
                </span>
                <span className="flex-1 min-w-0 leading-tight">
                  <span className="block text-[12.5px] font-semibold truncate">{c.name || `+${c.num}`}</span>
                  {!c.name && <span className="block text-[10.5px] text-text3">Sin nombre en WhatsApp</span>}
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-surface2 mt-1 px-2.5 pt-1.5 pb-0.5 text-[10px] text-text3">
            ↑ ↓ elegir · Enter menciona · Esc cierra
          </div>
        </div>
      )}
      {/* Popover de respuestas rápidas */}
      {popoverOpen && (
        <div className="absolute bottom-full left-3.5 mb-1.5 w-[min(430px,calc(100%-28px))] bg-white border border-border rounded-[14px] shadow-lg p-1.5 z-20">
          <div className="flex items-center justify-between px-2.5 pt-1.5 pb-2">
            <span className="text-[10px] font-bold tracking-widest text-text3">RESPUESTAS RÁPIDAS</span>
            <Link to="/soporte/recursos?tab=plantillas" className="text-[10.5px] font-semibold text-[#B45309] no-underline hover:underline">
              Gestionar plantillas
            </Link>
          </div>
          <div className="flex flex-col gap-0.5">
            {slashMatches.map((t, i) => (
              <button key={t.id || t.shortcut}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => insertTemplate(t)}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] border-0 cursor-pointer text-left transition-colors duration-150 ${i === highlight ? 'bg-[#FEF0D7]' : 'bg-transparent hover:bg-surface2'}`}>
                <span className={`text-[11px] font-bold rounded-md px-2 py-0.5 shrink-0 ${i === highlight ? 'bg-white text-[#B45309]' : 'bg-surface2 text-text2'}`}>
                  /{t.shortcut}
                </span>
                <span className="text-[12px] text-text2 truncate">{t.body}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-surface2 mt-1 px-2.5 pt-1.5 pb-0.5 text-[10px] text-text3">
            ↑ ↓ navegar · Enter inserta · Esc cierra
          </div>
        </div>
      )}

      {fileError && (
        <div className="text-[11px] font-medium mb-1.5 px-1" style={{ color: '#DC2626' }}>{fileError}</div>
      )}
      {file && (
        <div className="flex items-center gap-2.5 mb-2 px-2.5 py-2 rounded-xl border border-[#F5D9A8] bg-[#FFFBF2]">
          {file.previewUrl ? (
            <img src={file.previewUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
          ) : (
            <span className="w-10 h-10 rounded-lg bg-white border border-border flex items-center justify-center shrink-0">
              {KindIcon && <KindIcon size={17} className="text-[#B45309]" />}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold truncate">{file.filename}</div>
            <div className="text-[10.5px] text-text3">{file.sizeMB} MB · el texto de abajo va como descripción</div>
          </div>
          <button onClick={() => setFile(null)}
                  className="bg-transparent border-0 text-text3 hover:text-text cursor-pointer p-1 shrink-0">
            <X size={15} />
          </button>
        </div>
      )}

      {replyTo && !recording && (
        <div className="flex items-center gap-2.5 mb-2 px-2.5 py-2 rounded-xl border border-[#C8D6FF] bg-[#EEF3FF]">
          <span className="w-0.5 self-stretch rounded-full bg-[#4A67D8] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-[#4A67D8] truncate">
              Respondiendo a {replyTo.direction === 'out' ? 'tu mensaje' : (convName(selectedConversation)?.split(' ')[0] || 'el contacto')}
            </div>
            <div className="text-[11.5px] text-text2 truncate">{replySnippet(replyTo)}</div>
          </div>
          <button onClick={onClearReply} title="Cancelar respuesta"
                  className="bg-transparent border-0 text-text3 hover:text-text cursor-pointer p-1 shrink-0">
            <X size={15} />
          </button>
        </div>
      )}

      {recording ? (
        /* Barra de grabación de nota de voz */
        <div className="flex items-center gap-2.5 rounded-[14px] border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2.5">
          <button onClick={() => finishRecording(false)} title="Descartar"
                  className="shrink-0 w-9 h-9 rounded-xl border-0 bg-transparent text-[#DC2626] hover:bg-[#FEE2E2] cursor-pointer flex items-center justify-center transition-colors duration-150">
            <Trash2 size={17} />
          </button>
          <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] animate-pulse shrink-0" />
          <span className="text-[13px] font-bold text-[#B91C1C] tabular-nums shrink-0">{fmtSecs(recSecs)}</span>
          <span className="flex-1 text-[12px] text-[#B91C1C]">Grabando nota de voz…</span>
          <button onClick={() => finishRecording(true)} title="Enviar nota de voz"
                  className="shrink-0 w-9 h-9 rounded-full border-0 bg-[#F59E0B] text-white cursor-pointer hover:bg-[#E08C0B] flex items-center justify-center shadow-[0_2px_6px_rgba(245,158,11,.35)] transition-colors duration-150">
            <Send size={15} />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2 rounded-[14px] border border-border bg-white px-2.5 py-1.5 shadow-sm focus-within:border-[#F59E0B] transition-colors duration-150">
          <input ref={fileRef} type="file" className="hidden" onChange={pickFile}
                 accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" />
          <button onClick={() => fileRef.current?.click()} title="Adjuntar archivo"
                  className="shrink-0 w-9 h-9 rounded-xl border-0 bg-transparent text-text3 hover:text-[#B45309] hover:bg-[#FEF0D7] cursor-pointer flex items-center justify-center transition-colors duration-150 mb-0.5">
            <Paperclip size={17} />
          </button>
          <textarea
            ref={taRef}
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            rows={1}
            placeholder={file ? 'Descripción (opcional)…' : 'Escribí un mensaje…'}
            className="flex-1 resize-none text-[13px] leading-relaxed py-1.5 border-0 bg-transparent outline-none min-h-[32px] max-h-[120px]"
          />
          {canSend ? (
            <button
              onClick={submit}
              className="shrink-0 w-9 h-9 rounded-full border-0 flex items-center justify-center transition-colors duration-150 mb-0.5 bg-[#F59E0B] text-white cursor-pointer hover:bg-[#E08C0B] shadow-[0_2px_6px_rgba(245,158,11,.35)]"
            >
              <Send size={15} />
            </button>
          ) : (
            <button
              onClick={startRecording}
              title="Grabar nota de voz"
              className="shrink-0 w-9 h-9 rounded-full border-0 flex items-center justify-center transition-colors duration-150 mb-0.5 bg-surface2 text-text2 cursor-pointer hover:bg-[#FEF0D7] hover:text-[#B45309]"
            >
              <Mic size={16} />
            </button>
          )}
        </div>
      )}
      <div className="text-[10px] text-text3 mt-1 px-1">
        {recording
          ? 'Tocá el avión para enviar la nota de voz · el tacho la descarta'
          : <>Enter envía · Shift+Enter salto de línea · <b className="font-semibold">/</b> respuestas rápidas · pegá o arrastrá una imagen 📎</>}
      </div>
    </div>
  );
}
