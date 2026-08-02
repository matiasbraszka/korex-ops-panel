// VslPlayer — reproduce un VSL de Voomly desde su stream PÚBLICO (HLS), sin depender del
// embed (que quedó en 404 al re-subir los videos). El .m3u8 de media.voomly.com es público;
// Chrome no lo reproduce solo, así que usamos hls.js. Safari lo toca nativo.
import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { X } from 'lucide-react';

// Cuenta Voomly de Korex (fija para todos los videos). El stream público se arma con el voomly_id.
const VOOMLY_ACCOUNT = '464baf9a-e95b-4efa-abf6-2a298fe08c7b';
export const vslHlsUrl = (voomlyId) => `https://media.voomly.com/${VOOMLY_ACCOUNT}/${voomlyId}/v2/hls/file.m3u8`;

export default function VslPlayer({ voomlyId, title, onClose }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !voomlyId) return;
    const src = vslHlsUrl(voomlyId);
    let hls;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src; // Safari: HLS nativo
    } else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      video.src = src; // último recurso
    }
    return () => { if (hls) hls.destroy(); };
  }, [voomlyId]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,18,26,0.78)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(920px, 100%)', background: '#0B0D12', borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', color: '#fff' }}>
          <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title || 'VSL'}</span>
          <button onClick={onClose} title="Cerrar" style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', display: 'inline-flex' }}><X size={20} /></button>
        </div>
        <video ref={videoRef} controls autoPlay playsInline style={{ width: '100%', maxHeight: '76vh', background: '#000', display: 'block' }} />
      </div>
    </div>
  );
}
