// Página PÚBLICA de un link compartido (/compartir/<token>). Un externo sin cuenta:
//  · kind 'folder' → sube videos/imágenes a la carpeta (directo).
//  · kind 'del'    → lee las secciones compartidas y comenta.
// Todo por token: share_get (leer), share-upload (subir), share_del_comment (comentar).
import { useEffect, useRef, useState } from 'react';
import * as tus from 'tus-js-client';
import { supabase } from '@korex/db';
import { UploadCloud, Image as ImageIcon, Film, Loader2, Check, Send, MessageSquare, KeyRound, X, Trash2 } from 'lucide-react';
import { sanitizeDelHtml } from '../components/clientes/funnels/delSanitize';

const TOKEN = (() => { const m = window.location.pathname.match(/^\/compartir\/([A-Za-z0-9]{1,40})/); return m ? m[1] : ''; })();
const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

// Sube un video directo a Bunny (TUS) usando la firma que da share-upload.
// registerTus(up) permite guardarse la instancia para poder CANCELAR (up.abort()).
async function subirVideo(token, name, file, onProgress, registerTus) {
  const { data, error } = await supabase.functions.invoke('share-upload', { body: { token, action: 'bunny-create', name, title: file.name.replace(/\.[^.]+$/, '') } });
  if (error || !data?.ok) throw new Error(data?.error || 'No se pudo preparar la subida del video');
  const { videoId, libraryId, signature, expiration, tusEndpoint, embedUrl, hostname } = data;
  await new Promise((resolve, reject) => {
    const up = new tus.Upload(file, {
      endpoint: tusEndpoint, retryDelays: [0, 3000, 6000, 12000],
      headers: { AuthorizationSignature: signature, AuthorizationExpire: String(expiration), VideoId: videoId, LibraryId: String(libraryId) },
      metadata: { filetype: file.type, title: file.name },
      onError: reject,
      onProgress: (sent, total) => onProgress?.(total ? sent / total : 0),
      onSuccess: resolve,
    });
    registerTus?.(up);
    up.start();
  });
  const thumbUrl = hostname ? `https://${hostname}/${videoId}/thumbnail.jpg` : '';
  const commit = await supabase.functions.invoke('share-upload', { body: { token, action: 'bunny-commit', name, title: file.name.replace(/\.[^.]+$/, ''), videoId, embedUrl, thumbUrl } });
  if (commit.error || !commit.data?.ok) throw new Error('Subí el video pero no lo pude registrar');
  return commit.data.resource;
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-[860px]">{children}</div>
      <div className="mt-8 text-[11px] text-[#AEB4BF]">Korex · link compartido</div>
    </div>
  );
}

export default function SharePublicPage() {
  const [data, setData] = useState(null);   // resultado de share_get
  const [err, setErr] = useState(null);
  const [name, setName] = useState(() => { try { return localStorage.getItem('korex_share_name') || ''; } catch { return ''; } });
  const [nameOk, setNameOk] = useState(() => { try { return !!localStorage.getItem('korex_share_name'); } catch { return false; } });

  const cargar = async () => {
    try {
      const { data: r, error } = await supabase.rpc('share_get', { p_token: TOKEN });
      if (error) { setErr('No pude abrir el link.'); return; }
      if (!r || !r.ok) { setErr('Este link no existe o fue desactivado.'); return; }
      setData(r);
    } catch { setErr('No pude abrir el link.'); }
  };
  useEffect(() => { if (TOKEN) cargar(); else setErr('Link inválido.'); /* eslint-disable-next-line */ }, []);

  const guardarNombre = () => { const n = name.trim(); if (!n) return; try { localStorage.setItem('korex_share_name', n); } catch { /* */ } setName(n); setNameOk(true); };

  if (err) return <Shell><div className="bg-white rounded-2xl border border-[#E7EAF0] p-8 text-center"><div className="text-[15px] font-bold text-[#1A1D26] mb-1">Ups</div><div className="text-[13px] text-[#6B7280]">{err}</div></div></Shell>;
  if (!data) return <Shell><div className="bg-white rounded-2xl border border-[#E7EAF0] p-10 text-center text-[13px] text-[#9098A4] flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" />Cargando…</div></Shell>;

  // Gate de nombre (una vez).
  if (!nameOk) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl border border-[#E7EAF0] p-8 max-w-[440px] mx-auto">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[#EEF2FF] text-[#2E69E0] mb-3"><KeyRound size={20} /></div>
          <div className="text-[16px] font-bold text-[#1A1D26]">{data.label || 'Contenido compartido'}</div>
          <div className="text-[12.5px] text-[#6B7280] mt-1 mb-4">{data.kind === 'folder' ? 'Vas a poder subir archivos a esta carpeta.' : 'Vas a poder leer y comentar.'} Primero, ¿cómo te llamás?</div>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') guardarNombre(); }} autoFocus placeholder="Tu nombre" className="w-full py-2.5 px-3 border border-[#E2E5EB] rounded-[10px] text-[14px] outline-none focus:border-[#2E69E0] bg-white" />
          <button onClick={guardarNombre} disabled={!name.trim()} className="mt-3 w-full py-2.5 rounded-[10px] border-none bg-[#2E69E0] text-white text-[14px] font-semibold cursor-pointer disabled:opacity-50">Continuar</button>
        </div>
      </Shell>
    );
  }

  return <Shell>{data.kind === 'folder' ? <FolderShare data={data} name={name} onReload={cargar} /> : <DelShare data={data} name={name} onReload={cargar} />}</Shell>;
}

// ── Carpeta: subir + ver lo subido ──────────────────────────────────────────────
function FolderShare({ data, name, onReload }) {
  const [busy, setBusy] = useState(null);   // {label, pct}
  const [done, setDone] = useState(0);
  const [borrando, setBorrando] = useState(null);   // id del recurso que se está borrando
  const fileRef = useRef(null);
  const cancelRef = useRef(null);   // { canceled, tus } de la subida en curso

  const subir = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    cancelRef.current = { canceled: false, tus: null };
    let subidos = 0;
    for (let i = 0; i < files.length; i++) {
      if (cancelRef.current.canceled) break;
      const file = files[i];
      const esVideo = (file.type || '').startsWith('video/');
      try {
        setBusy({ label: `${esVideo ? 'Subiendo video' : 'Subiendo imagen'} ${i + 1}/${files.length}`, pct: 0 });
        if (esVideo) {
          await subirVideo(TOKEN, name, file, (frac) => setBusy({ label: `Subiendo video ${i + 1}/${files.length}`, pct: Math.round(frac * 100) }), (up) => { cancelRef.current.tus = up; });
        } else if ((file.type || '').startsWith('image/')) {
          const dataUrl = await fileToDataUrl(file);
          if (cancelRef.current.canceled) break;
          const { data: r, error } = await supabase.functions.invoke('share-upload', { body: { token: TOKEN, action: 'image', name, title: file.name.replace(/\.[^.]+$/, ''), dataUrl } });
          if (error || !r?.ok) throw new Error(r?.error || 'No se pudo subir la imagen');
        } else { window.alert(`"${file.name}" no es imagen ni video, lo salteo.`); continue; }
        subidos++; setDone((d) => d + 1);
      } catch (e) {
        if (cancelRef.current.canceled) break;
        window.alert(`No pude subir "${file.name}": ${e?.message || e}`);
      }
    }
    const fueCancelado = cancelRef.current.canceled;
    cancelRef.current = null;
    setBusy(null);
    if (fileRef.current) fileRef.current.value = '';
    onReload();
    if (fueCancelado && subidos === 0) setDone(0);
  };

  const cancelar = () => {
    if (!cancelRef.current) return;
    cancelRef.current.canceled = true;
    try { cancelRef.current.tus?.abort(true); } catch { /* */ }
    setBusy(null);
  };

  const borrar = async (file) => {
    if (!window.confirm(`¿Borrar "${file.title}"? Se quita de la carpeta.`)) return;
    setBorrando(file.id);
    try {
      const { data: r, error } = await supabase.functions.invoke('share-upload', { body: { token: TOKEN, action: 'delete', name, resourceId: file.id } });
      if (error || !r?.ok) { window.alert('No pude borrarlo: ' + (r?.error || 'error')); }
      else await onReload();
    } finally { setBorrando(null); }
  };

  const files = Array.isArray(data.files) ? data.files : [];
  const esMio = (f) => f.created_by === `externo:${name}`;   // solo puedo borrar lo que subí yo
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-[#E7EAF0] p-6">
        <div className="text-[17px] font-bold text-[#1A1D26]">{data.label || 'Carpeta compartida'}</div>
        <div className="text-[12.5px] text-[#6B7280] mt-0.5 mb-4">Subí acá videos o imágenes. Se agregan directo a la carpeta. Estás como <b>{name}</b>.</div>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => subir(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} disabled={!!busy}
          className="w-full flex flex-col items-center justify-center gap-2 py-9 rounded-xl border-2 border-dashed border-[#C7D2FE] text-[#2E69E0] bg-[#F5F8FF] cursor-pointer disabled:opacity-60 hover:bg-[#EEF3FF]">
          {busy ? <><Loader2 size={22} className="animate-spin" /><span className="text-[13px] font-semibold">{busy.label}{busy.pct ? ` · ${busy.pct}%` : '…'}</span></>
                : <><UploadCloud size={26} /><span className="text-[13.5px] font-semibold">Elegí archivos para subir</span><span className="text-[11.5px] text-[#8AA0E0]">Videos o imágenes</span></>}
        </button>
        {busy && (
          <button onClick={cancelar} className="mt-2 w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-[#FECACA] bg-white text-[#DC2626] text-[12.5px] font-semibold cursor-pointer hover:bg-[#FEF2F2]">
            <X size={14} />Cancelar subida
          </button>
        )}
        {done > 0 && !busy && <div className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#16A34A]"><Check size={14} />{done} archivo{done === 1 ? '' : 's'} subido{done === 1 ? '' : 's'}. ¡Gracias!</div>}
      </div>

      {files.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E7EAF0] p-6">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#9098A4] mb-3">Ya en la carpeta · {files.length}</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>
            {files.map((r) => (
              <div key={r.id} className="rounded-lg border border-[#E7EAF0] overflow-hidden bg-[#FBFCFE] relative group">
                {esMio(r) && (
                  <button onClick={() => borrar(r)} disabled={borrando === r.id} title="Borrar (lo subiste vos)"
                    className="absolute top-1 right-1 z-10 inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/90 border border-[#E2E5EB] text-[#C3C9D4] cursor-pointer hover:text-[#EF4444] hover:border-[#FECACA] disabled:opacity-50">
                    {borrando === r.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                )}
                <div className="aspect-[4/3] bg-[#F1F3F7] flex items-center justify-center overflow-hidden">
                  {r.kind === 'image'
                    ? <img src={r.public_url} alt={r.title} loading="lazy" className="w-full h-full object-cover" />
                    : <Film size={26} className="text-[#9098A4]" />}
                </div>
                <div className="px-2 py-1.5 text-[11px] font-semibold text-[#3F4653] truncate flex items-center gap-1">{r.kind === 'image' ? <ImageIcon size={11} /> : <Film size={11} />}{r.title}</div>
                {esMio(r) && <div className="px-2 pb-1.5 -mt-1 text-[9.5px] text-[#AEB4BF]">Subiste vos</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── DEL: leer secciones + comentar ──────────────────────────────────────────────
function DelShare({ data, name, onReload }) {
  const [drafts, setDrafts] = useState({});   // sectionId -> texto
  const [sending, setSending] = useState(null);
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const comments = Array.isArray(data.comments) ? data.comments : [];
  const bySection = (sid) => comments.filter((c) => c.section_id === sid);

  const enviar = async (sid) => {
    const body = (drafts[sid] || '').trim();
    if (!body) return;
    setSending(sid);
    try {
      const { data: r, error } = await supabase.rpc('share_del_comment', { p_token: TOKEN, p_section_id: sid, p_body: body, p_name: name });
      if (error || !r?.ok) { window.alert('No pude guardar el comentario.'); return; }
      setDrafts((d) => ({ ...d, [sid]: '' }));
      await onReload();
    } finally { setSending(null); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-[#E7EAF0] p-6">
        <div className="text-[17px] font-bold text-[#1A1D26]">{data.label || 'Documento compartido'}</div>
        <div className="text-[12.5px] text-[#6B7280] mt-0.5">Leé y dejá tus comentarios. Estás como <b>{name}</b>.</div>
      </div>
      {sections.map((s) => {
        const scoms = bySection(s.id);
        return (
          <div key={s.id} className="bg-white rounded-2xl border border-[#E7EAF0] overflow-hidden">
            <div className="py-2.5 px-5 border-b border-[#F1F3F7] text-[13px] font-bold text-[#1A1D26]">{s.title || 'Sección'}</div>
            <div className="del-rich py-6 px-8 text-[13.5px] leading-[1.62] text-[#2A2E3A] break-words"
              dangerouslySetInnerHTML={{ __html: s.html ? sanitizeDelHtml(s.html) : `<p>${(s.text || '').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>` }} />
            <div className="border-t border-[#F1F3F7] bg-[#FBFCFE] px-5 py-4">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#9098A4] mb-2 flex items-center gap-1.5"><MessageSquare size={12} />Comentarios{scoms.length ? ` · ${scoms.length}` : ''}</div>
              {scoms.map((c) => (
                <div key={c.id} className="mb-2 rounded-lg border border-[#EEF0F3] bg-white px-3 py-2">
                  <div className="text-[11px] font-semibold text-[#1A1D26]">{c.author_name || 'Alguien'}</div>
                  <div className="text-[12.5px] text-[#374151] whitespace-pre-wrap leading-[1.5]">{c.body}</div>
                </div>
              ))}
              <div className="flex items-end gap-2 mt-2">
                <textarea value={drafts[s.id] || ''} onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(s.id); } }}
                  rows={2} placeholder="Escribí un comentario…" className="flex-1 py-2 px-3 border border-[#E2E5EB] rounded-[10px] text-[12.5px] outline-none focus:border-[#2E69E0] bg-white resize-y" />
                <button onClick={() => enviar(s.id)} disabled={sending === s.id || !(drafts[s.id] || '').trim()}
                  className="inline-flex items-center justify-center w-10 h-10 rounded-[10px] border-none bg-[#2E69E0] text-white cursor-pointer disabled:opacity-50 shrink-0">
                  {sending === s.id ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
