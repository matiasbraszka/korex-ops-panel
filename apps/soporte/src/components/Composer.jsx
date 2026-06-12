import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, Paperclip, X, FileText, Image as ImageIcon, Film, Music } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import { convName } from '../lib/format.js';

const MAX_FILE_MB = 12;

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
export default function Composer({ onSent }) {
  const { selectedId, selectedConversation, sendMessage, sendAttachment, getDraft, setDraft, templates: configTemplates } = useSoporte();
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const taRef = useRef(null);
  const fileRef = useRef(null);

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

  useEffect(() => { setHighlight(0); }, [slashQuery]);

  useEffect(() => {
    setText(getDraft(selectedId));
    setFile(null);
    setFileError('');
    setSlashDismissed(false);
    const ta = taRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.focus();
    }
  }, [selectedId, getDraft]);

  const autosize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  const onChange = (e) => {
    setText(e.target.value);
    setDraft(selectedId, e.target.value);
    setSlashDismissed(false);
    autosize();
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

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
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
      setFile({
        base64, mimetype, filename: f.name, kind,
        sizeMB: (f.size / 1048576).toFixed(1),
        previewUrl: kind === 'image' ? dataUrl : null,
      });
    };
    reader.readAsDataURL(f);
  };

  const submit = () => {
    const body = text.trim();
    if (file) {
      sendAttachment(selectedId, { base64: file.base64, mimetype: file.mimetype, filename: file.filename, kind: file.kind, caption: body });
      setFile(null);
    } else {
      if (!body) return;
      sendMessage(selectedId, body);
    }
    setText('');
    setDraft(selectedId, '');
    const ta = taRef.current;
    if (ta) ta.style.height = 'auto';
    onSent?.();
  };

  const onKeyDown = (e) => {
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
    <div className="px-3.5 pb-1.5 pt-2 shrink-0 relative">
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
      {/* Popover de respuestas rápidas */}
      {popoverOpen && (
        <div className="absolute bottom-full left-3.5 mb-1.5 w-[min(430px,calc(100%-28px))] bg-white border border-border rounded-[14px] shadow-lg p-1.5 z-20">
          <div className="flex items-center justify-between px-2.5 pt-1.5 pb-2">
            <span className="text-[10px] font-bold tracking-widest text-text3">RESPUESTAS RÁPIDAS</span>
            <Link to="/soporte/plantillas" className="text-[10.5px] font-semibold text-[#B45309] no-underline hover:underline">
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
          rows={1}
          placeholder={file ? 'Descripción (opcional)…' : 'Escribí un mensaje…'}
          className="flex-1 resize-none text-[13px] leading-relaxed py-1.5 border-0 bg-transparent outline-none min-h-[32px] max-h-[120px]"
        />
        <button
          onClick={submit}
          disabled={!canSend}
          className={`shrink-0 w-9 h-9 rounded-full border-0 flex items-center justify-center transition-colors duration-150 mb-0.5 ${
            canSend
              ? 'bg-[#F59E0B] text-white cursor-pointer hover:bg-[#E08C0B] shadow-[0_2px_6px_rgba(245,158,11,.35)]'
              : 'bg-surface2 text-text3 cursor-default'
          }`}
        >
          <Send size={15} />
        </button>
      </div>
      <div className="text-[10px] text-text3 mt-1 px-1">
        Enter envía · Shift+Enter salto de línea · <b className="font-semibold">/</b> respuestas rápidas · adjuntos hasta {MAX_FILE_MB}MB
      </div>
    </div>
  );
}
