import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Play, Plus, X, Star } from 'lucide-react';

/**
 * Extraer el embed URL de un link de Loom.
 * "https://www.loom.com/share/abc123" -> "https://www.loom.com/embed/abc123"
 */
function toEmbedUrl(url) {
  if (!url) return '';
  // Ya es embed
  if (url.includes('/embed/')) return url;
  // share -> embed
  return url.replace('/share/', '/embed/');
}

export default function VideosPage() {
  const { loomVideos, addLoomVideo, updateLoomVideo, deleteLoomVideo, currentUser } = useApp();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', loom_url: '', description: '', is_main: false });

  const canEdit = currentUser?.role === 'COO' || currentUser?.canAccessSettings === true;

  const mainVideo = loomVideos.find(v => v.is_main);
  const updates = loomVideos.filter(v => !v.is_main).sort((a, b) => {
    // Mas recientes primero
    if (a.created_at && b.created_at) return b.created_at.localeCompare(a.created_at);
    return (b.position ?? 0) - (a.position ?? 0);
  });

  // Marcar videos como vistos (localStorage por usuario)
  const seenKey = `loom_seen_${currentUser?.id || 'anon'}`;
  const getSeen = () => {
    try { return JSON.parse(localStorage.getItem(seenKey) || '[]'); } catch { return []; }
  };
  const markSeen = (videoId) => {
    const seen = getSeen();
    if (!seen.includes(videoId)) {
      localStorage.setItem(seenKey, JSON.stringify([...seen, videoId]));
    }
  };
  const unseenCount = updates.filter(v => !getSeen().includes(v.id)).length;

  // Marcar todos como vistos al entrar a la pagina
  useState(() => {
    loomVideos.forEach(v => markSeen(v.id));
  });

  const handleAdd = async () => {
    if (!form.title.trim() || !form.loom_url.trim()) return;
    // Si se marca como main, desmarcar el anterior
    if (form.is_main && mainVideo) {
      await updateLoomVideo(mainVideo.id, { is_main: false });
    }
    await addLoomVideo({
      title: form.title.trim(),
      loom_url: form.loom_url.trim(),
      description: form.description.trim(),
      is_main: form.is_main,
      position: loomVideos.length,
    });
    setForm({ title: '', loom_url: '', description: '', is_main: false });
    setAdding(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Eliminar este video?')) return;
    await deleteLoomVideo(id);
  };

  const handleSetMain = async (id) => {
    // Desmarcar el main actual
    if (mainVideo) await updateLoomVideo(mainVideo.id, { is_main: false });
    await updateLoomVideo(id, { is_main: true });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-gray-800 flex items-center gap-2">
            <Play size={20} className="text-blue-500" /> Tutoriales y Actualizaciones
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Videos de Loom para aprender a usar el sistema y ver las novedades.</p>
        </div>
        {canEdit && (
          <button
            className="flex items-center gap-1.5 text-[12px] text-white bg-blue-500 hover:bg-blue-600 border-none rounded-lg py-2 px-3 cursor-pointer font-sans font-semibold transition-colors"
            onClick={() => setAdding(true)}
          >
            <Plus size={14} /> Agregar video
          </button>
        )}
      </div>

      {/* Grid unificado: principal (2 cols) + actualizaciones */}
      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
        {/* Video principal */}
        {mainVideo && (
          <div className="col-span-2 max-md:col-span-1 bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-blue-50/30">
              <Star size={12} className="text-blue-500 fill-blue-500" />
              <span className="text-[12px] font-bold text-blue-700">Tutorial del sistema</span>
              {canEdit && (
                <button className="ml-auto text-gray-400 hover:text-red-400 bg-transparent border-none cursor-pointer p-1" onClick={() => handleDelete(mainVideo.id)} title="Eliminar"><X size={12} /></button>
              )}
            </div>
            <div className="aspect-video">
              <iframe src={toEmbedUrl(mainVideo.loom_url)} frameBorder="0" allowFullScreen className="w-full h-full" title={mainVideo.title} />
            </div>
            <div className="px-3 py-2">
              <div className="text-[13px] font-bold text-gray-800">{mainVideo.title}</div>
              {mainVideo.description && <div className="text-[11px] text-gray-500 mt-0.5">{mainVideo.description}</div>}
            </div>
          </div>
        )}

        {/* Actualizaciones: llenan el resto del grid */}
        {updates.map(v => {
          const isNew = !getSeen().includes(v.id);
          return (
            <div key={v.id} className={`bg-white border rounded-xl overflow-hidden transition-all hover:shadow-sm ${isNew ? 'border-blue-300 ring-1 ring-blue-100' : 'border-gray-200'}`}>
              <div className="aspect-video relative">
                <iframe src={toEmbedUrl(v.loom_url)} frameBorder="0" allowFullScreen className="w-full h-full" title={v.title} />
                {isNew && <span className="absolute top-2 right-2 text-[9px] font-bold text-white bg-blue-500 rounded-full px-2 py-0.5">NUEVO</span>}
              </div>
              <div className="px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-gray-800 leading-snug">{v.title}</div>
                    {v.description && <div className="text-[11px] text-gray-400 mt-0.5 truncate">{v.description}</div>}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button className="text-gray-400 hover:text-yellow-500 bg-transparent border-none cursor-pointer p-1" onClick={() => handleSetMain(v.id)} title="Marcar como tutorial principal"><Star size={12} /></button>
                      <button className="text-gray-400 hover:text-red-400 bg-transparent border-none cursor-pointer p-1" onClick={() => handleDelete(v.id)} title="Eliminar"><X size={12} /></button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {loomVideos.length === 0 && !adding && (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-xl">
          <Play size={40} className="text-gray-300 mx-auto mb-3" />
          <div className="text-[14px] text-gray-500 font-medium">Sin videos todavia</div>
          <div className="text-[12px] text-gray-400 mt-1">Agrega el primer tutorial del sistema para que el equipo aprenda a usarlo.</div>
        </div>
      )}

      {/* Form de agregar video */}
      {adding && canEdit && (
        <div className="bg-white border border-blue-300 rounded-xl p-5 max-w-[600px]">
          <h3 className="text-[14px] font-bold text-gray-800 mb-3">Nuevo video</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Titulo</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Tutorial del panel de operaciones"
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">URL de Loom</label>
              <input
                type="text"
                value={form.loom_url}
                onChange={(e) => setForm(f => ({ ...f, loom_url: e.target.value }))}
                placeholder="https://www.loom.com/share/..."
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-mono font-sans outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Descripcion (opcional)</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Breve descripcion del contenido"
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400"
              />
            </div>
            <label className="flex items-center gap-2 text-[12px] text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={form.is_main} onChange={(e) => setForm(f => ({ ...f, is_main: e.target.checked }))} className="cursor-pointer" />
              Marcar como tutorial principal (se muestra grande arriba)
            </label>
            <div className="flex items-center gap-2 pt-1">
              <button
                className="py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white text-[13px] font-semibold rounded-lg border-none cursor-pointer font-sans disabled:opacity-40"
                disabled={!form.title.trim() || !form.loom_url.trim()}
                onClick={handleAdd}
              >Agregar</button>
              <button
                className="py-2 px-4 bg-transparent border border-gray-200 text-gray-600 text-[13px] rounded-lg cursor-pointer font-sans hover:bg-gray-50"
                onClick={() => { setAdding(false); setForm({ title: '', loom_url: '', description: '', is_main: false }); }}
              >Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
