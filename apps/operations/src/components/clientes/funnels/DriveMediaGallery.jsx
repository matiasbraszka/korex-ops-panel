// Galería de Recursos — Etapa C, paso 1 ($0, antes de mover un solo byte).
//
// El árbol del Drive ya está espejado en client_drive_nodes (lo llena drive-sync a
// diario). Acá mostramos las IMÁGENES y VIDEOS de ese árbol como una galería, con
// miniatura de Drive y un click para abrir el archivo. Cuando la Etapa C mueva los
// videos a hosting propio, SOLO cambia de dónde sale la miniatura/URL: la galería
// no se rehace.
//
// La miniatura de Drive es "best-effort": si el que mira no tiene sesión de Google
// con acceso al archivo, la imagen no carga y se ve el ícono. No cuesta nada y no
// rompe nada.
import { useEffect, useMemo, useState } from 'react';
import { sbFetch } from '@korex/db';
import { Image as ImageIcon, Film, ExternalLink, FolderOpen, RefreshCw } from 'lucide-react';
import { openUrl } from '../recursosShared';

// Miniatura pública de Drive por id de archivo.
const thumb = (id, w = 400) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;

function Card({ node }) {
  const [failed, setFailed] = useState(false);
  const isVideo = node.node_type === 'video';
  return (
    <button onClick={() => openUrl(node.web_url)} title={`Abrir en Drive: ${node.name || ''}`}
      className="group relative flex flex-col rounded-xl border border-[#E7EAF0] bg-white overflow-hidden cursor-pointer text-left hover:border-[#2E69E0] transition-colors">
      <div className="relative w-full aspect-[4/3] bg-[#F4F5F7] flex items-center justify-center overflow-hidden">
        {node.id && !failed ? (
          <img src={thumb(node.id)} alt={node.name || ''} loading="lazy" onError={() => setFailed(true)}
            className="w-full h-full object-cover" />
        ) : (
          isVideo ? <Film size={26} className="text-[#C3C9D4]" /> : <ImageIcon size={26} className="text-[#C3C9D4]" />
        )}
        {isVideo && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-black/55 text-white">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </span>
          </span>
        )}
        <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 py-0.5 px-1.5 rounded-md text-[9.5px] font-bold uppercase tracking-[0.04em]"
          style={isVideo ? { background: '#EDE9FE', color: '#6D28D9' } : { background: '#E0F2FE', color: '#0369A1' }}>
          {isVideo ? <Film size={9} /> : <ImageIcon size={9} />}{isVideo ? 'Video' : 'Imagen'}
        </span>
        <span className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-6 h-6 rounded-md bg-white/90 text-[#2E69E0] transition-opacity">
          <ExternalLink size={12} />
        </span>
      </div>
      <div className="px-2 py-1.5 text-[11px] font-semibold text-[#3F4653] truncate">{node.name || 'Sin nombre'}</div>
    </button>
  );
}

export default function DriveMediaGallery({ clientId, strategyId }) {
  const [nodes, setNodes] = useState(null);
  const [scope, setScope] = useState('funnel'); // 'funnel' (este funnel) | 'client' (todo el cliente)

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    setNodes(null);
    (async () => {
      try {
        const rows = await sbFetch(
          `client_drive_nodes?client_id=eq.${encodeURIComponent(clientId)}&node_type=in.(image,video)&select=id,name,node_type,web_url,parent_id,strategy_id,modified_time&order=modified_time.desc`,
        );
        if (alive) setNodes(Array.isArray(rows) ? rows : []);
      } catch { if (alive) setNodes([]); }
    })();
    return () => { alive = false; };
  }, [clientId]);

  // Cuántos son de ESTE funnel (por strategy_id). Si ninguno matchea, no tiene sentido
  // el filtro por funnel: se muestra todo el cliente.
  const delFunnel = useMemo(() => (nodes || []).filter(n => strategyId && n.strategy_id === strategyId), [nodes, strategyId]);
  const efectivo = scope === 'funnel' && delFunnel.length ? delFunnel : (nodes || []);
  const hayFiltro = !!(strategyId && delFunnel.length && delFunnel.length !== (nodes || []).length);

  if (nodes === null) {
    return (
      <div className="rounded-xl border border-[#E7EAF0] bg-white py-8 text-center text-[12px] text-[#9098A4] flex items-center justify-center gap-2">
        <RefreshCw size={14} className="animate-spin" />Cargando la galería del Drive…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#E7EAF0] bg-white overflow-hidden">
      <div className="flex items-center gap-2.5 py-3 px-4 border-b border-[#EDF0F5]">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#EEF2FF] text-[#4F46E5] shrink-0"><ImageIcon size={15} /></span>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-[#1A1D26]">Galería de imágenes y videos</div>
          <div className="text-[11px] text-[#9098A4]">Del Drive del cliente. Un clic abre el archivo. La subida a video propio llega después.</div>
        </div>
        {hayFiltro && (
          <div className="ml-auto inline-flex rounded-lg p-0.5 shrink-0" style={{ background: '#F1F3F7' }}>
            <button onClick={() => setScope('funnel')} className="py-1 px-2.5 rounded-md text-[11px] font-semibold cursor-pointer border-none transition-colors" style={scope === 'funnel' ? { background: '#fff', color: '#1A1D26', boxShadow: '0 1px 2px rgba(10,22,40,.06)' } : { background: 'transparent', color: '#6B7280' }}>Este funnel</button>
            <button onClick={() => setScope('client')} className="py-1 px-2.5 rounded-md text-[11px] font-semibold cursor-pointer border-none transition-colors" style={scope === 'client' ? { background: '#fff', color: '#1A1D26', boxShadow: '0 1px 2px rgba(10,22,40,.06)' } : { background: 'transparent', color: '#6B7280' }}>Todo el cliente</button>
          </div>
        )}
      </div>

      {efectivo.length === 0 ? (
        <div className="py-10 px-4 text-center">
          <FolderOpen size={26} className="text-[#D0D5DD] mx-auto mb-2" />
          <div className="text-[12.5px] text-[#6B7280] font-semibold">Todavía no hay imágenes ni videos sincronizados</div>
          <div className="text-[11px] text-[#9098A4] mt-1">La galería se llena sola con el Drive del cliente (sincroniza a diario).</div>
        </div>
      ) : (
        <div className="p-3">
          <div className="mb-2.5 text-[11px] font-semibold text-[#9098A4]">{efectivo.length} archivo{efectivo.length === 1 ? '' : 's'}</div>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>
            {efectivo.map(n => <Card key={n.id} node={n} />)}
          </div>
        </div>
      )}
    </div>
  );
}
