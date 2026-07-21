// Una CARPETA de recursos del funnel, alojada en la plataforma (Etapa C).
// Reemplaza al viejo "pegá el link de la carpeta de Drive": acá se SUBEN los archivos,
// se les pone título y quedan alojados en nuestro servidor. Un clic abre el recurso.
//
// Cada carpeta es (avatar_id + bucket_key). Se abre/cierra como en el Drive, dice
// cuántos elementos tiene, y adentro están los recursos subidos con su miniatura.
import { useEffect, useRef, useState } from 'react';
import * as tus from 'tus-js-client';
import { supabase, sbFetch } from '@korex/db';
import { FolderOpen, ChevronRight, Plus, Trash2, Play, Image as ImageIcon, Loader2, Pencil } from 'lucide-react';
import ResourceLightbox from './ResourceLightbox';

const BUCKET = 'funnel-recursos';
const kindOf = (mime) => (mime || '').startsWith('image/') ? 'image' : (mime || '').startsWith('video/') ? 'video' : 'other';
const safeName = (s) => String(s || 'archivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);

// Sube un video directo a Bunny (aguanta cualquier tamaño, sin pasar por Supabase).
// El servidor crea el video y firma la subida; el navegador la manda por TUS.
async function subirABunny(file, title, onProgress) {
  const { data, error } = await supabase.functions.invoke('bunny-video', { body: { action: 'create', title } });
  if (error || !data?.ok) throw new Error(data?.error || error?.message || 'No pude preparar la subida a Bunny');
  const { videoId, libraryId, signature, expiration, tusEndpoint, embedUrl, hostname } = data;
  await new Promise((resolve, reject) => {
    const up = new tus.Upload(file, {
      endpoint: tusEndpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { AuthorizationSignature: signature, AuthorizationExpire: String(expiration), VideoId: videoId, LibraryId: String(libraryId) },
      metadata: { filetype: file.type, title },
      onError: reject,
      onProgress: (sent, total) => onProgress?.(total ? sent / total : 0),
      onSuccess: resolve,
    });
    up.start();
  });
  return { videoId, embedUrl, thumbUrl: `https://${hostname}/${videoId}/thumbnail.jpg` };
}

const VOOMLY_URL = 'https://app.voomly.com/';   // dashboard de Voombly (buscar el VSL y copiar su link)
function Tile({ r, voomly = false, onVoomly, selected, onToggleSelect, onDelete, onRename, onOpen, resolveDragIds }) {
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [voomEdit, setVoomEdit] = useState(false);
  const isImg = r.kind === 'image';
  const isVid = r.kind === 'video';
  return (
    <div draggable
      onDragStart={(e) => { const ids = resolveDragIds(r.id); e.dataTransfer.setData('application/x-korex-resource', JSON.stringify({ ids })); e.dataTransfer.effectAllowed = 'move'; }}
      title="Arrastrá para mover de carpeta"
      className={`group relative flex flex-col rounded-lg border bg-white overflow-hidden cursor-grab active:cursor-grabbing ${selected ? 'border-[#2E69E0] ring-2 ring-[#2E69E0]/40' : 'border-[#E7EAF0]'}`}>
      {/* Título ARRIBA */}
      <div className="flex items-center gap-1 px-1.5 pt-1.5 pb-1">
        {editing ? (
          <input autoFocus defaultValue={r.title}
            onBlur={(e) => { const v = e.target.value.trim(); setEditing(false); if (v && v !== r.title) onRename(r, v); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditing(false); }}
            className="flex-1 min-w-0 text-[10.5px] font-semibold text-[#1A1D26] border border-[#2E69E0] rounded px-1 py-0.5 outline-none" />
        ) : (
          <button onClick={() => setEditing(true)} title="Cambiar el título" className="flex items-center gap-1 flex-1 min-w-0 text-left border-none bg-transparent cursor-pointer p-0">
            <span className="text-[10.5px] font-semibold text-[#3F4653] truncate">{r.title}</span>
            <Pencil size={9} className="opacity-0 group-hover:opacity-100 text-[#C3C9D4] shrink-0 transition-opacity" />
          </button>
        )}
      </div>
      {/* Miniatura (clic = abrir/reproducir) */}
      <button onClick={() => onOpen(r)} title={isVid ? `Reproducir: ${r.title}` : `Ver: ${r.title}`} className="relative w-full aspect-[4/3] bg-[#F4F5F7] flex items-center justify-center overflow-hidden cursor-pointer border-none p-0">
        {isImg && r.public_url && !failed ? (
          <img src={r.public_url} alt={r.title} loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />
        ) : isVid && r.provider === 'bunny' && r.storage_path && !failed ? (
          // Bunny genera la miniatura del video (puede tardar unos segundos tras subir).
          <img src={r.storage_path} alt={r.title} loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />
        ) : isVid && r.public_url && !failed ? (
          // El #t=0.5 hace que el navegador muestre el cuadro a los 0,5s como miniatura.
          <video src={r.public_url + '#t=0.5'} muted preload="metadata" onError={() => setFailed(true)} className="w-full h-full object-cover pointer-events-none" />
        ) : (
          <ImageIcon size={22} className="text-[#C3C9D4]" />
        )}
        {isVid && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-black/55 text-white group-hover:bg-black/70 transition-colors"><Play size={13} fill="currentColor" /></span>
          </span>
        )}
      </button>
      {/* Acciones ABAJO: elegir (para mover en masa) + borrar */}
      <div className="flex items-center gap-1 px-1.5 py-1.5 border-t border-[#F1F3F7]">
        <label onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 cursor-pointer select-none" title="Tildá para seleccionar y mover varias juntas">
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect(r.id)} className="w-3.5 h-3.5 accent-[#2E69E0] cursor-pointer" />
          <span className={`text-[9.5px] font-semibold ${selected ? 'text-[#2E69E0]' : 'text-[#9098A4]'}`}>Elegir</span>
        </label>
        <button onClick={() => onDelete(r)} title="Borrar recurso" className="ml-auto w-5 h-5 inline-flex items-center justify-center rounded text-[#C3C9D4] hover:text-[#DC2626] hover:bg-[#FEF2F2] border-none bg-transparent cursor-pointer shrink-0 transition-colors"><Trash2 size={12} /></button>
      </div>
      {/* VSL edición: además del video en el sistema, el link de Voombly (campo manual + buscar). */}
      {voomly && (
        <div className="px-1.5 pb-1.5 pt-0 flex flex-col gap-1">
          {r.voomly_url && !voomEdit ? (
            <div className="flex items-center gap-1">
              <a href={r.voomly_url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 inline-flex items-center gap-1 text-[9.5px] font-bold text-[#2E69E0] truncate no-underline" title={r.voomly_url}>
                <Play size={9} fill="currentColor" /> Abrir en Voombly
              </a>
              <button onClick={() => setVoomEdit(true)} title="Editar link" className="w-4 h-4 inline-flex items-center justify-center text-[#C3C9D4] hover:text-[#6B7280] border-none bg-transparent cursor-pointer"><Pencil size={9} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <input autoFocus={voomEdit} defaultValue={r.voomly_url || ''} placeholder="Pegá el link de Voombly"
                onBlur={(e) => { const v = e.target.value.trim(); setVoomEdit(false); if (v !== (r.voomly_url || '')) onVoomly?.(r, v); }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setVoomEdit(false); }}
                className="flex-1 min-w-0 text-[9.5px] border border-[#E2E5EB] rounded px-1 py-0.5 outline-none focus:border-[#2E69E0]" />
            </div>
          )}
          <a href={VOOMLY_URL} target="_blank" rel="noreferrer" title="Abrir Voombly para buscar el VSL y copiar su link"
            className="inline-flex items-center justify-center gap-1 py-0.5 rounded border border-dashed border-[#C7DBFB] text-[9px] font-bold text-[#2E69E0] no-underline hover:bg-[#EFF6FF]">
            🔍 Buscar en Voombly
          </a>
        </div>
      )}
    </div>
  );
}

export default function FunnelResourceFolder({ strategyId, clientId, avatarId, bucketKey, label, color, bg, extra, by, accept = 'image/*,video/*', clientScope = false, version = 1, reloadTick = 0, onMoved, moveTargets, voomly = false }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);   // null = sin cargar aún
  const [busy, setBusy] = useState(null);      // null | {done,total} mientras sube
  const [dragOver, setDragOver] = useState(false);   // arrastrando un ARCHIVO nuevo encima
  const [resOver, setResOver] = useState(false);     // arrastrando un RECURSO de otra carpeta
  const [selected, setSelected] = useState(() => new Set()); // ids tildados para mover en masa
  const [preview, setPreview] = useState(null);   // recurso abierto en el reproductor
  const [visible, setVisible] = useState(10);     // paginado: cuántos se muestran (de a 10)
  const fileRef = useRef(null);
  const toggleSel = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // Al arrastrar: si el recurso está tildado y hay varios, se lleva TODA la selección.
  const resolveDragIds = (id) => (selected.has(id) && selected.size > 1) ? Array.from(selected) : [id];
  // Ámbito: 'funnel' (por avatar, dentro de una estrategia) o 'client' (categorías del
  // cliente, compartidas por todos sus funnels — strategy_id null).
  const scopeFilter = clientScope
    ? `client_id=eq.${encodeURIComponent(clientId)}&strategy_id=is.null&avatar_id=is.null`
    : `strategy_id=eq.${encodeURIComponent(strategyId)}&${avatarId ? `avatar_id=eq.${encodeURIComponent(avatarId)}` : 'avatar_id=is.null'}&version=eq.${version}`;

  const cargar = async () => {
    try {
      const q = `funnel_resources?select=id,title,public_url,storage_path,kind,mime_type,size_bytes,created_at,provider,bunny_id,transcript,voomly_url&${scopeFilter}&bucket_key=eq.${encodeURIComponent(bucketKey)}&order=created_at.desc`;
      const rows = await sbFetch(q);
      // Orden natural por título: "VSL P01…P10", "AD1…AD10", "G1…G10" quedan en secuencia
      // (localeCompare con numeric respeta los números dentro del texto).
      const arr = Array.isArray(rows) ? [...rows] : [];
      arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'es', { numeric: true, sensitivity: 'base' }));
      setItems(arr);
    } catch { setItems([]); }
    setSelected(new Set());
    setVisible(10);   // al recargar la carpeta, volvemos a mostrar los primeros 10
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [strategyId, clientId, avatarId, bucketKey, clientScope, version, reloadTick]);

  const subir = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || (!clientScope && !strategyId) || (clientScope && !clientId)) return;
    setOpen(true);
    // Campos comunes de dónde vive el recurso (funnel o cliente).
    const base = clientScope
      ? { strategy_id: null, client_id: clientId, avatar_id: null }
      : { strategy_id: strategyId, client_id: clientId || null, avatar_id: avatarId || null, version };
    const pathBase = clientScope ? `cliente/${clientId}` : `${strategyId}/${avatarId || 'cliente'}`;
    let done = 0; setBusy({ done, total: files.length, pct: 0 });
    for (const file of files) {
      const titulo = file.name.replace(/\.[^.]+$/, '');
      const esVideo = (file.type || '').startsWith('video/');
      try {
        let row;
        if (esVideo) {
          // Video → Bunny (convierte y reproduce en cualquier lado, cualquier tamaño).
          const { videoId, embedUrl, thumbUrl } = await subirABunny(file, titulo, (frac) => setBusy({ done, total: files.length, pct: Math.round(frac * 100) }));
          const { data, error } = await supabase.from('funnel_resources').insert({
            ...base, bucket_key: bucketKey,
            title: titulo, provider: 'bunny', bunny_id: videoId, storage_path: thumbUrl, public_url: embedUrl,
            mime_type: file.type || null, kind: 'video', size_bytes: file.size || null, created_by: by || null,
          }).select().single();
          if (error) { window.alert('Subí el video a Bunny pero no pude guardarlo: ' + error.message); continue; }
          row = data;
        } else {
          // Imagen (u otro) → Supabase Storage.
          const path = `${pathBase}/${bucketKey}/${Date.now()}_${safeName(file.name)}`;
          const up = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
          if (up.error) { window.alert('No pude subir "' + file.name + '": ' + up.error.message); continue; }
          const pub = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          const { data, error } = await supabase.from('funnel_resources').insert({
            ...base, bucket_key: bucketKey,
            title: titulo, provider: 'supabase', storage_path: path, public_url: pub,
            mime_type: file.type || null, kind: kindOf(file.type), size_bytes: file.size || null, created_by: by || null,
          }).select().single();
          if (error) { window.alert('Subí el archivo pero no pude guardarlo: ' + error.message); continue; }
          row = data;
        }
        setItems((prev) => [row, ...(prev || [])]);
      } catch (e) { window.alert('Error subiendo "' + file.name + '": ' + (e?.message || e)); }
      done += 1; setBusy({ done, total: files.length, pct: 0 });
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const borrar = async (r) => {
    if (!window.confirm(`¿Borrar "${r.title}"? No se puede deshacer.`)) return;
    setItems((prev) => (prev || []).filter(x => x.id !== r.id));
    if (r.provider === 'bunny') {
      await supabase.functions.invoke('bunny-video', { body: { action: 'delete', videoId: r.bunny_id } }).catch(() => {});
    } else {
      await supabase.storage.from(BUCKET).remove([r.storage_path]).catch(() => {});
    }
    await supabase.from('funnel_resources').delete().eq('id', r.id);
  };

  const renombrar = async (r, title) => {
    setItems((prev) => (prev || []).map(x => x.id === r.id ? { ...x, title } : x));
    await supabase.from('funnel_resources').update({ title }).eq('id', r.id);
  };

  // Guarda el link de Voombly del VSL (además del video normal alojado en Bunny).
  const guardarVoomly = async (r, url) => {
    const v = (url || '').trim() || null;
    setItems((prev) => (prev || []).map(x => x.id === r.id ? { ...x, voomly_url: v } : x));
    await supabase.from('funnel_resources').update({ voomly_url: v }).eq('id', r.id);
  };

  // Mueve uno o varios recursos a la carpeta destino (targetKey). Para categorías del
  // cliente cambia sólo el bucket_key; en funnels, además, re-ubica en este avatar/estrategia.
  const moverIds = async (ids, targetKey) => {
    if (!ids?.length || !targetKey) return;
    const patch = clientScope
      ? { strategy_id: null, client_id: clientId, avatar_id: null, bucket_key: targetKey }
      : { strategy_id: strategyId, client_id: clientId || null, avatar_id: avatarId || null, bucket_key: targetKey, version };
    const { error } = await supabase.from('funnel_resources').update(patch).in('id', ids);
    if (error) { window.alert('No pude mover: ' + error.message); return; }
    setSelected(new Set());
    onMoved?.();   // avisa al padre para que TODAS las carpetas se refresquen
  };

  const tieneRecurso = (e) => Array.from(e.dataTransfer?.types || []).includes('application/x-korex-resource');
  const onDragOver = (e) => {
    e.preventDefault();
    if (tieneRecurso(e)) { setResOver(true); e.dataTransfer.dropEffect = 'move'; }
    else setDragOver(true);
  };
  const onDragLeave = (e) => {
    // Sólo apaga el resaltado si el cursor salió de la carpeta entera (no al pasar por un hijo).
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOver(false); setResOver(false);
  };
  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false); setResOver(false);
    const raw = e.dataTransfer.getData('application/x-korex-resource');
    if (raw) { try { const { ids } = JSON.parse(raw); if (ids?.length) { setOpen(true); moverIds(ids, bucketKey); } } catch {} return; }
    if (e.dataTransfer?.files?.length) { setOpen(true); subir(e.dataTransfer.files); }
  };

  const n = items?.length ?? 0;
  return (
    <div className="rounded-lg border relative" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      style={{ borderColor: resOver ? color : (open ? (color + '55') : '#EDF0F5'), background: open ? bg : '#FBFCFE' }}>
      {resOver && (
        <div className="absolute inset-0 z-20 rounded-lg border-2 border-dashed flex items-center justify-center pointer-events-none" style={{ borderColor: color, background: bg + 'ee' }}>
          <span className="text-[11.5px] font-bold" style={{ color }}>Soltá para mover a “{label}”</span>
        </div>
      )}
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 w-full py-2 px-2.5 border-none bg-transparent cursor-pointer text-left">
        <FolderOpen size={15} className="shrink-0" style={{ color: n ? color : '#C3C9D4' }} />
        <span className="text-[12px] font-semibold shrink-0" style={{ color: n ? color : '#6B7280' }}>{label}</span>
        {extra}
        <span className="ml-auto text-[10.5px] font-bold py-0.5 px-2 rounded-full whitespace-nowrap shrink-0" style={n ? { background: bg, color, border: `1px solid ${color}33` } : { background: '#F1F3F7', color: '#AEB4BF' }}>
          {items === null ? '…' : `${n} elemento${n === 1 ? '' : 's'}`}
        </span>
        <ChevronRight size={14} className="shrink-0 transition-transform text-[#C3C9D4]" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
      </button>
      {open && (
        <div className="px-2.5 pb-2.5">
          {/* Barra de acción en masa: aparece cuando hay recursos tildados. */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-2 py-1.5 px-2 rounded-lg" style={{ background: '#fff', border: `1px solid ${color}44` }}>
              <span className="text-[11px] font-bold" style={{ color }}>{selected.size} seleccionada{selected.size === 1 ? '' : 's'}</span>
              {moveTargets?.length > 0 && (
                <select value="" onChange={(e) => { if (e.target.value) moverIds(Array.from(selected), e.target.value); }}
                  className="text-[11px] font-bold rounded-md border-none px-2.5 py-1.5 cursor-pointer outline-none appearance-none" style={{ background: color, color: '#fff' }}>
                  <option value="" style={{ color: '#1A1D26' }}>📁 Mover a…</option>
                  {moveTargets.filter(t => t.key !== bucketKey).map(t => <option key={t.key} value={t.key} style={{ color: '#1A1D26' }}>{t.label}</option>)}
                </select>
              )}
              <button onClick={() => setSelected(new Set())} className="text-[11px] font-semibold text-[#9098A4] hover:text-[#6B7280] border-none bg-transparent cursor-pointer">Quitar selección</button>
              <span className="text-[10.5px] text-[#AEB4BF] ml-auto hidden sm:inline">…o arrastralas a otra carpeta</span>
            </div>
          )}
          <div className={`rounded-lg transition-colors ${dragOver ? 'ring-2 ring-dashed' : ''}`} style={dragOver ? { outline: `2px dashed ${color}`, outlineOffset: 2 } : undefined}>
            {n > 0 && (
              <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))' }}>
                {items.slice(0, visible).map(r => <Tile key={r.id} r={r} voomly={voomly} selected={selected.has(r.id)} onToggleSelect={toggleSel} onDelete={borrar} onRename={renombrar} onOpen={setPreview} onVoomly={guardarVoomly} resolveDragIds={resolveDragIds} />)}
              </div>
            )}
            {/* Paginado: mostramos de a 10 para que la carpeta abra fluida aunque tenga cientos. */}
            {n > visible && (
              <div className="flex items-center justify-center gap-2 mb-2">
                <button onClick={() => setVisible(v => v + 10)}
                  className="inline-flex items-center gap-1.5 py-1.5 px-3.5 rounded-lg border text-[11.5px] font-semibold cursor-pointer bg-white hover:bg-[#F7F9FC]"
                  style={{ borderColor: color + '55', color }}>
                  Cargar más <span className="opacity-70">({Math.min(10, n - visible)} de {n - visible} restantes)</span>
                </button>
                {n - visible > 10 && (
                  <button onClick={() => setVisible(n)} className="text-[11px] font-semibold text-[#9098A4] hover:text-[#6B7280] border-none bg-transparent cursor-pointer">Ver todos</button>
                )}
              </div>
            )}
            {items !== null && n === 0 && !busy && (
              <div className="text-[11px] text-[#AEB4BF] py-3 text-center">Carpeta vacía · subí archivos, arrastralos acá, o arrastrá un recurso de otra carpeta.</div>
            )}
          </div>
          {busy && (
            <div className="py-1.5 mb-1">
              <div className="flex items-center gap-2 text-[11px] font-semibold" style={{ color }}>
                <Loader2 size={13} className="animate-spin" />Subiendo {busy.done + 1} de {busy.total}{busy.pct ? ` · ${busy.pct}%` : '…'}
              </div>
              {busy.pct > 0 && (
                <div className="h-1 rounded-full bg-[#EDF0F5] mt-1 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${busy.pct}%`, background: color }} /></div>
              )}
            </div>
          )}
          <input ref={fileRef} type="file" accept={accept} multiple className="hidden" onChange={e => subir(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={!!busy}
            className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-dashed text-[11.5px] font-semibold cursor-pointer disabled:opacity-60 bg-white"
            style={{ borderColor: color + '66', color }}>
            <Plus size={13} />Subir archivo
          </button>
        </div>
      )}
      <ResourceLightbox r={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
