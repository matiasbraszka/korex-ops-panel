// Una tarjeta de la galería: miniatura (imagen o video) + acciones al pasar el mouse.
// Si es un anuncio ganador, muestra la medalla y sus métricas clave.
import { useState } from 'react';
import { Download, Trash2, Star, ImageOff, Loader2, RotateCcw, Trophy, Play } from 'lucide-react';
import { descargar, pesoLegible } from './inspiraciones';

const GOLD = '#C79A2E';

// Las 3 métricas que se muestran en la tarjeta (el resto queda para el detalle). Con su unidad.
const CLAVE = [
  { k: 'cpl', label: 'CPL', fmt: (v) => `US$${v}` },
  { k: 'hook_rate', label: 'Hook', fmt: (v) => `${v}%` },
  { k: 'ctr', label: 'CTR', fmt: (v) => `${v}%` },
];

export default function InspirationCard({ item, url, canWrite, onOpen, onStar, onDelete, onRestore }) {
  const [roto, setRoto] = useState(false);
  const [bajando, setBajando] = useState(false);
  const nicho = item.marketing_niches;
  const borrada = !!item.deleted_at;
  const esVideo = (item.mime_type || '').startsWith('video/');
  const ganador = !!item.es_ganador;
  const met = item.metrics || {};
  const metricas = CLAVE.filter((m) => met[m.k] != null && met[m.k] !== '');

  const bajar = async (e) => {
    e.stopPropagation();
    if (bajando) return;
    setBajando(true);
    try { await descargar(item.storage_path, item.title, item.mime_type); }
    catch { window.alert('No se pudo descargar el archivo.'); }
    finally { setBajando(false); }
  };

  const accion = (fn) => (e) => { e.stopPropagation(); fn(item); };

  return (
    <div onClick={() => onOpen(item)}
      className="group relative rounded-xl overflow-hidden bg-white border cursor-pointer transition-colors"
      style={{ borderColor: ganador ? '#EAD9A8' : '#E2E5EB', opacity: borrada ? 0.55 : 1 }}>

      <div className="bg-[#F4F6F9] flex items-center justify-center relative" style={{ aspectRatio: '4 / 5' }}>
        {!url
          ? <Loader2 size={18} className="animate-spin text-[#C3C9D4]" />
          : roto
            ? <ImageOff size={22} className="text-[#C3C9D4]" />
            : esVideo
              ? <>
                  <video src={url} muted playsInline preload="metadata" onError={() => setRoto(true)}
                    className="w-full h-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-full" style={{ background: 'rgba(12,16,24,.55)' }}>
                      <Play size={16} className="text-white" fill="white" />
                    </span>
                  </span>
                </>
              : <img src={url} alt={item.title} loading="lazy" onError={() => setRoto(true)}
                  className="w-full h-full object-cover" />}
      </div>

      {/* Acciones */}
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity">
        {canWrite && !borrada && (
          <button onClick={accion(onStar)} title={item.starred ? 'Sacar de destacadas' : 'Destacar'}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border-none cursor-pointer text-white"
            style={{ background: 'rgba(12,16,24,.62)' }}>
            <Star size={13} fill={item.starred ? '#F5B301' : 'none'} color={item.starred ? '#F5B301' : 'currentColor'} />
          </button>
        )}
        <button onClick={bajar} title="Descargar"
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg border-none cursor-pointer text-white"
          style={{ background: 'rgba(12,16,24,.62)' }}>
          {bajando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        </button>
        {canWrite && (borrada
          ? <button onClick={accion(onRestore)} title="Restaurar"
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg border-none cursor-pointer text-white"
              style={{ background: 'rgba(22,163,74,.85)' }}><RotateCcw size={13} /></button>
          : <button onClick={accion(onDelete)} title="Sacar de la galería"
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg border-none cursor-pointer text-white"
              style={{ background: 'rgba(12,16,24,.62)' }}><Trash2 size={13} /></button>)}
      </div>

      {/* Medalla de ganador (prioriza sobre la estrella) */}
      {ganador && !borrada ? (
        <div className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 py-0.5 px-1.5 rounded-lg group-hover:opacity-0 transition-opacity"
          style={{ background: GOLD }}>
          <Trophy size={11} className="text-white" fill="white" />
          <span className="text-[9.5px] font-bold text-white uppercase tracking-wider">Ganador</span>
        </div>
      ) : item.starred && !borrada ? (
        <div className="absolute top-1.5 left-1.5 inline-flex items-center justify-center w-6 h-6 rounded-lg group-hover:opacity-0 transition-opacity"
          style={{ background: 'rgba(12,16,24,.62)' }}>
          <Star size={12} fill="#F5B301" color="#F5B301" />
        </div>
      ) : null}

      <div className="p-2">
        <div className="text-[12px] font-semibold text-[#1A1D26] truncate" title={item.title}>{item.title}</div>

        {ganador && metricas.length > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {metricas.map((m) => (
              <span key={m.k} className="text-[9.5px] font-bold py-0.5 px-1.5 rounded-full"
                style={{ background: '#FCFAF3', color: '#7A5B12', border: '1px solid #EAD9A8' }}>
                {m.label} {m.fmt(met[m.k])}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {nicho?.label && (
            <span className="text-[9.5px] font-bold uppercase tracking-wider py-0.5 px-1.5 rounded-full"
              style={{ background: `${nicho.color || '#5B7CF5'}1A`, color: nicho.color || '#5B7CF5' }}>
              {nicho.label}
            </span>
          )}
          {item.width && item.height && (
            <span className="text-[9.5px] text-[#9CA3AF]">{item.width}×{item.height}</span>
          )}
          {item.size_bytes ? <span className="text-[9.5px] text-[#C3C9D4]">{pesoLegible(item.size_bytes)}</span> : null}
        </div>
      </div>
    </div>
  );
}
