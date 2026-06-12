import { useEffect, useRef, useState } from 'react';
import { Send, Paperclip, X, FileText, Image as ImageIcon, Film, Music } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';

const MAX_FILE_MB = 12;

function kindFromMime(mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

const KIND_ICONS = { image: ImageIcon, video: Film, audio: Music, document: FileText };

// Caja de respuesta: Enter envía, Shift+Enter salto. Clip para adjuntar
// imagen/video/audio/documento (el texto pasa a ser la descripción).
export default function Composer({ onSent }) {
  const { selectedId, sendMessage, sendAttachment, getDraft, setDraft } = useSoporte();
  const [text, setText] = useState('');
  const [file, setFile] = useState(null); // { base64, mimetype, filename, kind, sizeMB, previewUrl }
  const [fileError, setFileError] = useState('');
  const taRef = useRef(null);
  const fileRef = useRef(null);

  // Cambiar de conversación: restaurar borrador, limpiar adjunto y enfocar.
  useEffect(() => {
    setText(getDraft(selectedId));
    setFile(null);
    setFileError('');
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
    autosize();
  };

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // permite elegir el mismo archivo de nuevo
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
        base64,
        mimetype,
        filename: f.name,
        kind,
        sizeMB: (f.size / 1048576).toFixed(1),
        previewUrl: kind === 'image' ? dataUrl : null,
      });
    };
    reader.readAsDataURL(f);
  };

  const submit = () => {
    const body = text.trim();
    if (file) {
      sendAttachment(selectedId, { ...file, caption: body });
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = file || text.trim();
  const KindIcon = file ? KIND_ICONS[file.kind] : null;

  return (
    <div className="bg-white border-t border-border px-3 py-2.5 shrink-0">
      {fileError && (
        <div className="text-[11px] font-medium mb-1.5 px-1" style={{ color: '#DC2626' }}>{fileError}</div>
      )}
      {file && (
        <div className="flex items-center gap-2.5 mb-2 px-2.5 py-2 rounded-xl border border-[#5B7CF5]/40 bg-[#EEF2FF]/50">
          {file.previewUrl ? (
            <img src={file.previewUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
          ) : (
            <span className="w-10 h-10 rounded-lg bg-white border border-border flex items-center justify-center shrink-0">
              {KindIcon && <KindIcon size={17} className="text-[#5B7CF5]" />}
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
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-white px-2 py-1.5 focus-within:border-[#5B7CF5] transition-colors">
        <input ref={fileRef} type="file" className="hidden" onChange={pickFile}
               accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" />
        <button onClick={() => fileRef.current?.click()} title="Adjuntar archivo"
                className="shrink-0 w-9 h-9 rounded-xl border-0 bg-transparent text-text3 hover:text-[#5B7CF5] hover:bg-[#EEF2FF] cursor-pointer flex items-center justify-center transition-colors mb-0.5">
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
          className={`shrink-0 w-9 h-9 rounded-xl border-0 flex items-center justify-center transition-colors mb-0.5 ${canSend ? 'bg-[#5B7CF5] text-white cursor-pointer hover:bg-[#4A67D8]' : 'bg-surface2 text-text3 cursor-default'}`}
        >
          <Send size={15} />
        </button>
      </div>
      <div className="text-[10px] text-text3 mt-1 px-1">Enter envía · Shift+Enter salto de línea · 📎 hasta {MAX_FILE_MB}MB</div>
    </div>
  );
}
