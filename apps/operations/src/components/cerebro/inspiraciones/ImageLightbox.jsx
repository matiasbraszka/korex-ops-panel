// Visor a pantalla completa del banco, con navegación entre imágenes.
//
// No reusamos ResourceLightbox: ese vive también en SharePublicPage (página pública para
// externos) y arrastra Bunny, video y transcripciones. Cambiarle la firma para soportar
// prev/next tocaría esa página. Acá solo hay imágenes.
import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Loader2, Star } from 'lucide-react';
import { descargar } from './inspiraciones';

export default function ImageLightbox({ items, index, urls, onIndex, onClose }) {
  const [bajando, setBajando] = useState(false);
  // Los handlers viven en un ref para poder registrar el listener de teclado UNA sola vez:
  // si dependiera de `index`, se re-suscribiría en cada flecha.
  const nav = useRef({ onIndex, onClose, index, total: items.length });
  useEffect(() => { nav.current = { onIndex, onClose, index, total: items.length }; });

  useEffect(() => {
    const onKey = (e) => {
      const { onIndex: ir, onClose: cerrar, index: i, total } = nav.current;
      if (e.key === 'Escape') { cerrar(); return; }
      if (e.key === 'ArrowRight' && i < total - 1) { e.preventDefault(); ir(i + 1); }
      if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); ir(i - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const it = items[index];

  // Precargar la anterior y la siguiente para que pasar de una a otra no parpadee.
  useEffect(() => {
    [index - 1, index + 1].forEach((i) => {
      const u = items[i] && urls[items[i].storage_path];
      if (u) { const img = new Image(); img.src = u; }
    });
  }, [index, items, urls]);

  if (!it) return null;
  const url = urls[it.storage_path];
  const nicho = it.marketing_niches;

  const bajar = async () => {
    if (bajando) return;
    setBajando(true);
    try { await descargar(it.storage_path, it.title, it.mime_type); }
    catch { window.alert('No se pudo descargar la imagen.'); }
    finally { setBajando(false); }
  };

  const ir = (delta) => (e) => { e.stopPropagation(); onIndex(index + delta); };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 md:p-8"
      style={{ background: 'rgba(8,12,20,.88)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="relative flex flex-col max-w-[92vw] max-h-[92vh]">
        <div className="flex items-center gap-2 mb-2">
          {it.starred && <Star size={14} className="text-[#F5B301] shrink-0" fill="#F5B301" />}
          <span className="text-[13px] font-semibold text-white/90 truncate min-w-0">{it.title}</span>
          {nicho?.label && (
            <span className="text-[10.5px] font-semibold py-0.5 px-2 rounded-full shrink-0"
              style={{ background: 'rgba(255,255,255,.14)', color: '#fff' }}>{nicho.label}</span>
          )}
          <span className="text-[11.5px] text-white/50 shrink-0 ml-auto">{index + 1} de {items.length}</span>
          <button onClick={bajar} title="Descargar"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white/80 hover:text-white hover:bg-white/10 border-none bg-transparent cursor-pointer">
            {bajando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          </button>
          <button onClick={onClose} title="Cerrar (Esc)"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white/80 hover:text-white hover:bg-white/10 border-none bg-transparent cursor-pointer">
            <X size={17} />
          </button>
        </div>

        <div className="relative rounded-xl overflow-hidden bg-black flex items-center justify-center" style={{ minWidth: 280, minHeight: 200 }}>
          {url
            ? <img src={url} alt={it.title} className="max-w-[92vw] max-h-[78vh] block object-contain" />
            : <div className="p-16 text-white/50 text-[13px]"><Loader2 size={18} className="animate-spin inline mr-2" />Cargando…</div>}

          {index > 0 && (
            <button onClick={ir(-1)} title="Anterior (←)"
              className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-10 h-10 rounded-full border-none cursor-pointer text-white"
              style={{ background: 'rgba(0,0,0,.45)' }}><ChevronLeft size={22} /></button>
          )}
          {index < items.length - 1 && (
            <button onClick={ir(1)} title="Siguiente (→)"
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-10 h-10 rounded-full border-none cursor-pointer text-white"
              style={{ background: 'rgba(0,0,0,.45)' }}><ChevronRight size={22} /></button>
          )}
        </div>

        {(it.notes || it.brand || it.source_url) && (
          <div className="mt-2 rounded-xl bg-white/[.07] border border-white/10 p-3 max-h-[16vh] overflow-y-auto">
            {it.notes && <div className="text-[12.5px] leading-relaxed text-white/85 whitespace-pre-wrap">{it.notes}</div>}
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {it.brand && <span className="text-[11px] text-white/55">Marca: {it.brand}</span>}
              {it.source_url && (
                <a href={it.source_url} target="_blank" rel="noreferrer" className="text-[11px] text-[#8FB4FF] hover:underline">Ver el original</a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
