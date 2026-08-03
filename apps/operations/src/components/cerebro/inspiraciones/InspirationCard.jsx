// Una tarjeta de la galería: miniatura + acciones al pasar el mouse.
import { useState } from 'react';
import { Download, Trash2, Star, ImageOff, Loader2, RotateCcw } from 'lucide-react';
import { descargar, pesoLegible } from './inspiraciones';

export default function InspirationCard({ item, url, canWrite, onOpen, onStar, onDelete, onRestore }) {
  const [roto, setRoto] = useState(false);
  const [bajando, setBajando] = useState(false);
  const nicho = item.marketing_niches;
  const borrada = !!item.deleted_at;

  const bajar = async (e) => {
    e.stopPropagation();
    if (bajando) return;
    setBajando(true);
    try { await descargar(item.storage_path, item.title, item.mime_type); }
    catch { window.alert('No se pudo descargar la imagen.'); }
    finally { setBajando(false); }
  };

  const accion = (fn) => (e) => { e.stopPropagation(); fn(item); };

  return (
    <div onClick={() => onOpen(item)}
      className="group relative rounded-xl overflow-hidden bg-white border border-[#E2E5EB] cursor-pointer hover:border-[#5B7CF5] transition-colors"
      style={borrada ? { opacity: 0.55 } : undefined}>

      <div className="bg-[#F4F6F9] flex items-center justify-center" style={{ aspectRatio: '4 / 5' }}>
        {url && !roto
          ? <img src={url} alt={item.title} loading="lazy" onError={() => setRoto(true)}
              className="w-full h-full object-cover" />
          : <div className="flex flex-col items-center gap-1 text-[#C3C9D4]">
              {url ? <ImageOff size={22} /> : <Loader2 size={18} className="animate-spin" />}
            </div>}
      </div>

      {/* Acciones: aparecen al pasar el mouse; en pantallas táctiles quedan siempre visibles */}
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

      {item.starred && !borrada && (
        <div className="absolute top-1.5 left-1.5 inline-flex items-center justify-center w-6 h-6 rounded-lg group-hover:opacity-0 transition-opacity"
          style={{ background: 'rgba(12,16,24,.62)' }}>
          <Star size={12} fill="#F5B301" color="#F5B301" />
        </div>
      )}

      <div className="p-2">
        <div className="text-[12px] font-semibold text-[#1A1D26] truncate" title={item.title}>{item.title}</div>
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
