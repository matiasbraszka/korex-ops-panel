// Reproductor de recursos DENTRO de la plataforma (Matías 2026-07-17: "que se
// reproduzcan"). Un clic en un recurso lo abre acá: los videos se reproducen con
// controles, las imágenes se ven a tamaño completo. Nada de abrir otra pestaña.
import { useEffect, useState } from 'react';
import { X, ExternalLink, Download, FileText, Copy, Check, Loader2 } from 'lucide-react';

export default function ResourceLightbox({ r, onClose }) {
  const [copied, setCopied] = useState(false);
  const [showTxt, setShowTxt] = useState(false);
  const [bajando, setBajando] = useState(false);
  useEffect(() => {
    if (!r) return;
    setCopied(false); setShowTxt(false);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [r, onClose]);

  const copiar = async () => {
    try { await navigator.clipboard.writeText(r.transcript || ''); }
    catch { const t = document.createElement('textarea'); t.value = r.transcript || ''; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch { /* noop */ } t.remove(); }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };

  if (!r) return null;
  const hasTxt = !!(r.transcript && String(r.transcript).trim());
  const isImg = r.kind === 'image';
  const isVid = r.kind === 'video';
  // Para los videos de Bunny, la descarga es el ARCHIVO ORIGINAL (4K si el original lo
  // es, sin re-comprimir). Se sirve en /original (derivado de la miniatura /thumbnail.jpg).
  const downloadUrl = r.provider === 'bunny'
    ? (r.storage_path || '').replace('/thumbnail.jpg', '/original')
    : r.public_url;

  // DESCARGA de verdad. El atributo download de un <a> solo funciona con archivos del
  // MISMO dominio; como los videos viven en Bunny/Storage, el navegador lo ignoraba y
  // abría otra pestaña. Solución: bajar el archivo como blob y dispararlo como descarga
  // con el nombre del recurso. Si el navegador lo bloquea, cae a abrir la pestaña.
  const descargar = async () => {
    if (bajando) return;
    setBajando(true);
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error('http ' + res.status);
      const blob = await res.blob();
      const ext = (() => {
        const m = /\.([a-z0-9]{2,5})(\?|#|$)/i.exec(downloadUrl || '');
        if (m && m[1] !== 'original') return '.' + m[1].toLowerCase();
        if ((blob.type || '').includes('mp4') || isVid) return '.mp4';
        if ((blob.type || '').includes('png')) return '.png';
        if ((blob.type || '').includes('jpeg')) return '.jpg';
        return '';
      })();
      const nombre = (r.title || 'recurso').replace(/[\\/:*?"<>|]/g, '_');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = /\.[a-z0-9]{2,5}$/i.test(nombre) ? nombre : nombre + ext;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      window.open(downloadUrl, '_blank', 'noopener');
    } finally {
      setBajando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 md:p-8" style={{ background: 'rgba(8,12,20,.82)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative flex flex-col max-w-[92vw] max-h-[92vh]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[13px] font-semibold text-white/90 truncate flex-1 min-w-0">{r.title}</span>
          {hasTxt && (
            <>
              <button onClick={copiar} title="Copiar la transcripción del video" className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-white/90 hover:text-white hover:bg-white/10 border-none bg-white/10 cursor-pointer text-[12px] font-semibold">
                {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copiado' : 'Copiar transcripción'}
              </button>
              <button onClick={() => setShowTxt(s => !s)} title="Ver la transcripción" className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white/80 hover:text-white hover:bg-white/10 border-none bg-transparent cursor-pointer"><FileText size={15} /></button>
            </>
          )}
          <a href={r.public_url} target="_blank" rel="noreferrer" title="Abrir en pestaña nueva" className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white/80 hover:text-white hover:bg-white/10"><ExternalLink size={15} /></a>
          <button onClick={descargar} title={r.provider === 'bunny' ? 'Descargar el original (máxima calidad)' : 'Descargar'} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white/80 hover:text-white hover:bg-white/10 border-none bg-transparent cursor-pointer">{bajando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}</button>
          <button onClick={onClose} title="Cerrar (Esc)" className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white/80 hover:text-white hover:bg-white/10 border-none bg-transparent cursor-pointer"><X size={17} /></button>
        </div>
        <div className="flex gap-3 items-stretch">
        <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center flex-1 min-w-0" style={{ minWidth: 280 }}>
          {isVid && r.provider === 'bunny' ? (
            // Player de Bunny (streaming adaptativo, reproduce en cualquier navegador).
            <div style={{ width: 'min(92vw, 1100px)', aspectRatio: '16 / 9' }}>
              {/* `fullscreen` va SÍ O SÍ dentro de allow: al declarar un allow propio, el
                  atributo allowFullScreen solo no alcanza y Chrome bloquea el botón de
                  pantalla completa del reproductor — se ve como que cae a "pantalla en
                  pantalla" en vez de agrandarse. */}
              <iframe src={`${r.public_url}?autoplay=true&preload=true`} loading="lazy" allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;fullscreen" allowFullScreen title={r.title} className="w-full h-full block border-none" />
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
        {hasTxt && showTxt && (
          <div className="w-[300px] shrink-0 rounded-xl bg-white/[.06] border border-white/10 p-3 flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="flex items-center gap-1.5 text-white/70 text-[11px] font-bold uppercase tracking-wide mb-2 shrink-0"><FileText size={12} />Transcripción</div>
            <div className="text-[12.5px] leading-relaxed text-white/85 whitespace-pre-wrap overflow-y-auto pr-1">{r.transcript}</div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
