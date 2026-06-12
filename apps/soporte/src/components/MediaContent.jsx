import { useEffect } from 'react';
import { FileText, Download, Play, RefreshCw, ImageOff } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';

// Render del contenido multimedia de un mensaje.
// Imagenes/stickers/audios se cargan solos al aparecer; videos y documentos
// muestran su tarjeta al instante y el archivo se trae al tocar (los PDFs
// se descargan, los videos se reproducen inline una vez cargados).
const AUTO_LOAD = new Set(['imageMessage', 'stickerMessage', 'audioMessage']);

export default function MediaContent({ msg }) {
  const { mediaByMsg, loadMedia } = useSoporte();
  const media = mediaByMsg[msg.id] || {};
  const type = msg.msg_type;
  const isTemp = msg._temp === true;
  const auto = !isTemp && AUTO_LOAD.has(type);

  useEffect(() => {
    if (auto && !media.url && media.status !== 'failed') loadMedia(msg.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, msg.id]);

  // Burbuja optimista de un adjunto que recien se esta enviando.
  if (isTemp) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-text3 py-1 px-0.5">
        <span className="w-3 h-3 rounded-full border-2 border-text3 border-t-transparent animate-spin" />
        Enviando {msg._mediaPayload?.filename || 'adjunto'}…
      </div>
    );
  }

  // Nombre del documento sin esperar la descarga (viene en el payload crudo).
  const docName = msg.payload?.message?.documentMessage?.fileName || media.filename || 'Documento';

  if (media.status === 'failed') {
    return (
      <button onClick={() => loadMedia(msg.id)}
              className="flex items-center gap-1.5 text-[11.5px] font-medium text-text3 bg-surface2 rounded-lg px-2.5 py-2 border-0 cursor-pointer hover:text-text2">
        <ImageOff size={13} /> No se pudo cargar — reintentar <RefreshCw size={11} />
      </button>
    );
  }

  // ── Imagen / sticker ──
  if (type === 'imageMessage' || type === 'stickerMessage') {
    if (!media.url) {
      return <div className={`bg-surface2 animate-pulse rounded-xl ${type === 'stickerMessage' ? 'w-28 h-28' : 'w-56 h-40'}`} />;
    }
    return (
      <a href={media.url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={media.url} alt="" loading="lazy"
             className={`rounded-xl object-cover cursor-zoom-in ${type === 'stickerMessage' ? 'max-w-[120px]' : 'max-w-[260px] max-h-[300px]'}`} />
      </a>
    );
  }

  // ── Audio / nota de voz ──
  if (type === 'audioMessage') {
    if (!media.url) {
      return (
        <div className="flex items-center gap-2 text-[12px] text-text3 py-1.5 px-1">
          <span className="w-7 h-7 rounded-full bg-surface2 animate-pulse" /> Cargando audio…
        </div>
      );
    }
    return <audio controls src={media.url} preload="metadata" className="max-w-[260px] h-10" />;
  }

  // ── Video ──
  if (type === 'videoMessage') {
    if (media.url) {
      return <video controls src={media.url} className="rounded-xl max-w-[280px] max-h-[320px]" />;
    }
    return (
      <button onClick={() => loadMedia(msg.id)} disabled={media.status === 'loading'}
              className="flex items-center gap-2 text-[12px] font-semibold text-text2 bg-surface2 rounded-xl px-3 py-2.5 border-0 cursor-pointer hover:bg-surface3">
        <span className="w-8 h-8 rounded-full bg-[#5B7CF5] text-white flex items-center justify-center">
          <Play size={14} />
        </span>
        {media.status === 'loading' ? 'Cargando video…' : 'Ver video'}
      </button>
    );
  }

  // ── Documento (PDF, etc.) ──
  if (type === 'documentMessage') {
    const open = async () => {
      if (media.url) {
        window.open(media.url, '_blank', 'noopener');
      } else {
        loadMedia(msg.id);
      }
    };
    return (
      <button onClick={open} disabled={media.status === 'loading'}
              className="flex items-center gap-2.5 bg-white border border-border rounded-xl px-3 py-2.5 cursor-pointer hover:border-[#5B7CF5]/50 transition-colors text-left max-w-[260px]">
        <span className="w-9 h-9 rounded-lg bg-[#FEF2F2] flex items-center justify-center shrink-0">
          <FileText size={17} style={{ color: '#DC2626' }} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[12px] font-semibold text-text truncate">{docName}</span>
          <span className="block text-[10.5px] text-text3">
            {media.status === 'loading' ? 'Descargando…' : media.url ? 'Abrir' : 'Tocar para descargar'}
          </span>
        </span>
        <Download size={14} className="text-text3 shrink-0" />
      </button>
    );
  }

  return null;
}
