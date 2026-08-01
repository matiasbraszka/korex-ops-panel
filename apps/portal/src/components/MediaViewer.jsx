import { useEffect } from 'react';

// Reproductor/visor a pantalla completa para el material del cliente. Reproduce
// videos de Bunny (iframe embed) y de Storage (<video>), y muestra imágenes.
// item: { url, kind, provider, title }
const esBunny = (url = '', provider = '') =>
  provider === 'bunny' || /mediadelivery\.net|iframe\.media|\/embed\//.test(url || '');

export default function MediaViewer({ item, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  if (!item) return null;
  const url = item.url || item.public_url || '';
  const kind = item.kind || (esBunny(url, item.provider) ? 'video' : 'image');
  const bunny = kind === 'video' && esBunny(url, item.provider);
  const embed = bunny ? url + (url.includes('?') ? '&' : '?') + 'autoplay=true&preload=true' : url;

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(8,10,16,.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, animation: 'kxFade .18s ease' }}>
      <button onClick={onClose} aria-label="Cerrar"
        style={{ position: 'absolute', top: 14, right: 16, width: 40, height: 40, borderRadius: 999, border: 'none', background: 'rgba(255,255,255,.16)', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>

      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {kind === 'video' ? (
          bunny ? (
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 14, overflow: 'hidden', background: '#000' }}>
              <iframe src={embed} title={item.title || 'Video'} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
            </div>
          ) : (
            <video src={url} controls autoPlay playsInline style={{ width: '100%', maxHeight: '80vh', borderRadius: 14, background: '#000' }} />
          )
        ) : kind === 'image' ? (
          <img src={url} alt={item.title || ''} style={{ width: '100%', maxHeight: '82vh', objectFit: 'contain', borderRadius: 14 }} />
        ) : (
          <a href={url} target="_blank" rel="noreferrer" style={{ color: '#fff', textAlign: 'center', fontSize: 15, fontWeight: 700, textDecoration: 'underline' }}>Abrir archivo</a>
        )}
        {item.title && <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, textAlign: 'center', opacity: 0.9 }}>{item.title}</div>}
      </div>
    </div>
  );
}
