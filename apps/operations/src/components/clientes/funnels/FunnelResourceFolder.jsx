// Una CARPETA de recursos del funnel, alojada en la plataforma (Etapa C).
// Reemplaza al viejo "pegá el link de la carpeta de Drive": acá se SUBEN los archivos,
// se les pone título y quedan alojados en nuestro servidor. Un clic abre el recurso.
//
// Cada carpeta es (avatar_id + bucket_key). Se abre/cierra como en el Drive, dice
// cuántos elementos tiene, y adentro están los recursos subidos con su miniatura.
import { useEffect, useRef, useState } from 'react';
import { supabase, sbFetch } from '@korex/db';
import { FolderOpen, ChevronRight, Plus, Trash2, Play, Image as ImageIcon, Loader2, Pencil } from 'lucide-react';
import ResourceLightbox from './ResourceLightbox';

const BUCKET = 'funnel-recursos';
const kindOf = (mime) => (mime || '').startsWith('image/') ? 'image' : (mime || '').startsWith('video/') ? 'video' : 'other';
const safeName = (s) => String(s || 'archivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);

function Tile({ r, onDelete, onRename, onOpen }) {
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const isImg = r.kind === 'image';
  const isVid = r.kind === 'video';
  return (
    <div className="group relative flex flex-col rounded-lg border border-[#E7EAF0] bg-white overflow-hidden">
      <button onClick={() => onOpen(r)} title={isVid ? `Reproducir: ${r.title}` : `Ver: ${r.title}`} className="relative w-full aspect-[4/3] bg-[#F4F5F7] flex items-center justify-center overflow-hidden cursor-pointer border-none p-0">
        {isImg && r.public_url && !failed ? (
          <img src={r.public_url} alt={r.title} loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />
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
      <div className="flex items-center gap-1 px-1.5 py-1">
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
        <button onClick={() => onDelete(r)} title="Borrar recurso" className="opacity-0 group-hover:opacity-100 w-5 h-5 inline-flex items-center justify-center rounded text-[#C3C9D4] hover:text-[#DC2626] hover:bg-[#FEF2F2] border-none bg-transparent cursor-pointer shrink-0 transition-opacity"><Trash2 size={11} /></button>
      </div>
    </div>
  );
}

export default function FunnelResourceFolder({ strategyId, clientId, avatarId, bucketKey, label, color, bg, extra, by, accept = 'image/*,video/*' }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);   // null = sin cargar aún
  const [busy, setBusy] = useState(null);      // null | {done,total} mientras sube
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);   // recurso abierto en el reproductor
  const fileRef = useRef(null);

  const cargar = async () => {
    try {
      const q = `funnel_resources?select=id,title,public_url,storage_path,kind,mime_type,size_bytes,created_at&strategy_id=eq.${encodeURIComponent(strategyId)}&bucket_key=eq.${encodeURIComponent(bucketKey)}&${avatarId ? `avatar_id=eq.${encodeURIComponent(avatarId)}` : 'avatar_id=is.null'}&order=created_at.desc`;
      const rows = await sbFetch(q);
      setItems(Array.isArray(rows) ? rows : []);
    } catch { setItems([]); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [strategyId, avatarId, bucketKey]);

  const subir = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || !strategyId) return;
    setOpen(true);
    let done = 0; setBusy({ done, total: files.length });
    for (const file of files) {
      try {
        const path = `${strategyId}/${avatarId || 'cliente'}/${bucketKey}/${Date.now()}_${safeName(file.name)}`;
        const up = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
        if (up.error) { window.alert('No pude subir "' + file.name + '": ' + up.error.message); continue; }
        const pub = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        const { data, error } = await supabase.from('funnel_resources').insert({
          strategy_id: strategyId, client_id: clientId || null, avatar_id: avatarId || null, bucket_key: bucketKey,
          title: file.name.replace(/\.[^.]+$/, ''), storage_path: path, public_url: pub,
          mime_type: file.type || null, kind: kindOf(file.type), size_bytes: file.size || null, created_by: by || null,
        }).select().single();
        if (error) { window.alert('Subí el archivo pero no pude guardarlo: ' + error.message); continue; }
        setItems((prev) => [data, ...(prev || [])]);
      } catch (e) { window.alert('Error subiendo: ' + (e?.message || e)); }
      done += 1; setBusy({ done, total: files.length });
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const borrar = async (r) => {
    if (!window.confirm(`¿Borrar "${r.title}"? No se puede deshacer.`)) return;
    setItems((prev) => (prev || []).filter(x => x.id !== r.id));
    await supabase.storage.from(BUCKET).remove([r.storage_path]).catch(() => {});
    await supabase.from('funnel_resources').delete().eq('id', r.id);
  };

  const renombrar = async (r, title) => {
    setItems((prev) => (prev || []).map(x => x.id === r.id ? { ...x, title } : x));
    await supabase.from('funnel_resources').update({ title }).eq('id', r.id);
  };

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer?.files?.length) subir(e.dataTransfer.files); };

  const n = items?.length ?? 0;
  return (
    <div className="rounded-lg border" style={{ borderColor: open ? (color + '55') : '#EDF0F5', background: open ? bg : '#FBFCFE' }}>
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
        <div className="px-2.5 pb-2.5" onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
          <div className={`rounded-lg transition-colors ${dragOver ? 'ring-2 ring-dashed' : ''}`} style={dragOver ? { outline: `2px dashed ${color}`, outlineOffset: 2 } : undefined}>
            {n > 0 && (
              <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))' }}>
                {items.map(r => <Tile key={r.id} r={r} onDelete={borrar} onRename={renombrar} onOpen={setPreview} />)}
              </div>
            )}
            {items !== null && n === 0 && !busy && (
              <div className="text-[11px] text-[#AEB4BF] py-3 text-center">Carpeta vacía · subí archivos o arrastralos acá.</div>
            )}
          </div>
          {busy && (
            <div className="flex items-center gap-2 text-[11px] font-semibold py-1.5 mb-1" style={{ color }}>
              <Loader2 size={13} className="animate-spin" />Subiendo {busy.done + 1} de {busy.total}…
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
