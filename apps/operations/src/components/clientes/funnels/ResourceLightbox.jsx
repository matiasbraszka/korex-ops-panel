// Reproductor de recursos DENTRO de la plataforma (Matías 2026-07-17: "que se
// reproduzcan"). Un clic en un recurso lo abre acá: los videos se reproducen con
// controles, las imágenes se ven a tamaño completo. Nada de abrir otra pestaña.
import { useEffect } from 'react';
import { X, ExternalLink, Download } from 'lucide-react';

export default function ResourceLightbox({ r, onClose }) {
  useEffect(() => {
    if (!r) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [r, onClose]);

  if (!r) return null;
  const isImg = r.kind === 'image';
  const isVid = r.kind === 'video';
  // Para los videos de Bunny, la descarga es el ARCHIVO ORIGINAL (4K si el original lo
  // es, sin re-comprimir). Se sirve en /original (derivado de la miniatura /thumbnail.jpg).
  const downloadUrl = r.provider === 'bunny'
    ? (r.storage_path || '').replace('/thumbnail.jpg', '/original')
    : r.public_url;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 md:p-8" style={{ background: 'rgba(8,12,20,.82)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative flex flex-col max-w-[92vw] max-h-[92vh]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[13px] font-semibold text-white/90 truncate flex-1 min-w-0">{r.title}</span>
          <a href={r.public_url} target="_blank" rel="noreferrer" title="Abrir en pestaña nueva" className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white/80 hover:text-white hover:bg-white/10"><ExternalLink size={15} /></a>
          <a href={downloadUrl} download target="_blank" rel="noreferrer" title={r.provider === 'bunny' ? 'Descargar el original (máxima calidad)' : 'Descargar'} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white/80 hover:text-white hover:bg-white/10"><Download size={15} /></a>
          <button onClick={onClose} title="Cerrar (Esc)" className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white/80 hover:text-white hover:bg-white/10 border-none bg-transparent cursor-pointer"><X size={17} /></button>
        </div>
        <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center" style={{ minWidth: 280 }}>
          {isVid && r.provider === 'bunny' ? (
            // Player de Bunny (streaming adaptativo, reproduce en cualquier navegador).
            <div style={{ width: 'min(92vw, 1100px)', aspectRatio: '16 / 9' }}>
              <iframe src={`${r.public_url}?autoplay=true&preload=true`} loading="lazy" allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture" allowFullScreen title={r.title} className="w-full h-full block border-none" />
            </div>
          ) : isVid ? (
            <video src={r.public_url} controls autoPlay playsInline className="max-w-[92vw] max-h-[80vh] block" />
          ) : isImg ? (
            <img src={r.public_url} alt={r.title} className="max-w-[92vw] max-h-[80vh] block object-contain" />
          ) : (
            <div className="p-10 text-center text-white/80">
              <div className="text-[13px] mb-3">Este tipo de archivo no se puede previsualizar acá.</div>
              <a href={r.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 py-2 px-4 rounded-lg bg-white/15 text-white text-[13px] font-semibold hover:bg-white/25"><ExternalLink size={14} />Abrir archivo</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
