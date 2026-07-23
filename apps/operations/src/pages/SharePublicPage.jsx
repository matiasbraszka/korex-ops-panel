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

// Identidad estable del invitado (para que al volver reconozca lo suyo y no "pierda la sesión").
const GUEST_ID = (() => {
  try { let g = localStorage.getItem('korex_share_guest'); if (!g) { g = 'g_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); localStorage.setItem('korex_share_guest', g); } return g; }
  catch { return ''; }
})();

// Resalta en el html las frases comentadas (primer match de texto plano, fuera de tags).
function highlightHtml(html, cmts) {
  let out = html || '';
  for (const c of cmts) {
    const q = (c.quote || '').trim();
    if (q.length < 2 || c.resolved) continue;
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try { out = out.replace(new RegExp('(?![^<]*>)(' + esc + ')'), `<mark data-cmt="${c.id}" style="background:#FEF9C3;border-radius:2px;padding:0 1px;cursor:pointer;">$1</mark>`); } catch { /* frase con caracteres raros: sin resaltar */ }
  }
  return out;
}

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

  if (err) return <Shell><div className="bg-white rounded-2xl border border-[#E7EAF0] p-5 sm:p-8 text-center"><div className="text-[15px] font-bold text-[#1A1D26] mb-1">Ups</div><div className="text-[13px] text-[#6B7280]">{err}</div></div></Shell>;
  if (!data) return <Shell><div className="bg-white rounded-2xl border border-[#E7EAF0] p-6 sm:p-10 text-center text-[13px] text-[#9098A4] flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" />Cargando…</div></Shell>;

  // Gate de nombre (una vez).
  if (!nameOk) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl border border-[#E7EAF0] p-5 sm:p-8 max-w-[440px] mx-auto">
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
      <div className="bg-white rounded-2xl border border-[#E7EAF0] p-4 sm:p-6">
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
        <div className="bg-white rounded-2xl border border-[#E7EAF0] p-4 sm:p-6">
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
                {esMio(r) && <div className="px-2 pb-1.5 -mt-1 text-[10.5px] text-[#AEB4BF]">Subiste vos</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── DEL: leer secciones + comentar estilo Google Docs (marcar texto, hilos, ver "Aplicado") ──
function DelShare({ data, name, onReload }) {
  const [selBtn, setSelBtn] = useState(null);      // botón flotante {top,left,quote,sectionId}
  const [composer, setComposer] = useState(null);  // caja de comentario anclado {quote,sectionId,top,left}
  const [draft, setDraft] = useState('');          // texto del composer
  const [flashCmt, setFlashCmt] = useState(null);  // id del comentario a destacar (al tocar su resaltado)
  const [replyFor, setReplyFor] = useState(null);  // id del comentario con la caja de respuesta abierta
  const [replyDraft, setReplyDraft] = useState({});
  const [sending, setSending] = useState(null);
  const [localComments, setLocalComments] = useState([]);  // optimista: lo recién enviado se ve al instante
  const [sent, setSent] = useState(false);                 // confirmación breve "enviado"

  const sections = Array.isArray(data.sections) ? data.sections : [];
  const serverComments = Array.isArray(data.comments) ? data.comments : [];
  // Optimista: mostramos lo recién enviado ya; cuando la recarga lo trae del servidor, no duplicamos.
  const comments = [...serverComments, ...localComments.filter((lc) => !serverComments.some((sc) =>
    sc.body === lc.body && sc.section_id === lc.section_id && (!!sc.parent_id === !!lc.parent_id)))];
  const repliesByParent = {};
  for (const c of comments) if (c.parent_id) (repliesByParent[c.parent_id] ||= []).push(c);
  for (const k in repliesByParent) repliesByParent[k].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  // Todos los comentarios (de todas las secciones) para el margen derecho, ordenados por
  // sección y luego por fecha; los resueltos van al final.
  const secOrder = {}; sections.forEach((s, i) => { secOrder[s.id] = i; });
  const topComments = comments.filter((c) => !c.parent_id).sort((a, b) =>
    (a.resolved ? 1 : 0) - (b.resolved ? 1 : 0) ||
    ((secOrder[a.section_id] ?? 99) - (secOrder[b.section_id] ?? 99)) ||
    (new Date(a.created_at) - new Date(b.created_at)));

  // Marcar una frase → botón flotante "Comentar" (mismo mecanismo que el panel).
  const onDocMouseUp = () => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!sel || sel.isCollapsed || text.length < 2) { setSelBtn(null); return; }
    let node = sel.anchorNode;
    while (node && node.nodeType !== 1) node = node.parentNode;
    const secEl = node?.closest?.('[data-secid]');
    if (!secEl) { setSelBtn(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setSelBtn({ top: rect.top, left: rect.left + rect.width / 2, quote: text.slice(0, 300), sectionId: secEl.getAttribute('data-secid') });
  };
  // En el celular la selección es por "mantener presionado": el touchend llega antes de que la
  // selección termine de asentarse, por eso reviso con un pequeño delay.
  const onDocTouchEnd = () => setTimeout(onDocMouseUp, 80);

  const enviarComment = async ({ sectionId, quote, parentId, body }) => {
    const b = (body || '').trim();
    if (!b) return false;
    const { data: r, error } = await supabase.rpc('share_del_comment', {
      p_token: TOKEN, p_section_id: sectionId, p_body: b, p_name: name,
      p_quote: quote || null, p_parent_id: parentId || null, p_guest_id: GUEST_ID,
    });
    if (error || !r?.ok) { window.alert('No pude guardar. Probá de nuevo.'); return false; }
    // Optimista: aparece al instante; la recarga lo confirma desde el servidor.
    setLocalComments((prev) => [...prev, { id: r.id || ('tmp_' + Date.now()), section_id: sectionId, parent_id: parentId || null, quote: quote || null, body: b, author_name: name, is_team: false, resolved: false, created_at: new Date().toISOString() }]);
    setSent(true); setTimeout(() => setSent(false), 2500);
    await onReload();
    setLocalComments([]);
    return true;
  };
  const enviarQuote = async () => {
    if (!composer) return; setSending('c');
    const ok = await enviarComment({ sectionId: composer.sectionId, quote: composer.quote, body: draft });
    if (ok) { setDraft(''); setComposer(null); setSelBtn(null); }
    setSending(null);
  };
  // Tocar el resaltado del texto → destacar su comentario en el margen; y al revés, tocar la
  // cita del comentario → llevar la frase resaltada del texto a la vista.
  const flashComment = (id) => {
    setFlashCmt(id);
    document.getElementById('cmt-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setFlashCmt(null), 1800);
  };
  const scrollToMark = (id) => {
    const el = document.querySelector(`mark[data-cmt="${id}"]`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); try { el.animate([{ background: '#FDE68A' }, { background: '#FEF9C3' }], { duration: 1200 }); } catch { /* */ } }
  };
  const onDocClick = (e) => {
    const m = e.target?.closest?.('mark[data-cmt]');
    if (m) flashComment(m.getAttribute('data-cmt'));
  };
  const responder = async (parent) => {
    setSending('r:' + parent.id);
    const ok = await enviarComment({ sectionId: parent.section_id, parentId: parent.id, body: replyDraft[parent.id] });
    if (ok) { setReplyDraft((d) => ({ ...d, [parent.id]: '' })); setReplyFor(null); }
    setSending(null);
  };

  return (
    <>
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-4 lg:items-start" onMouseUp={onDocMouseUp} onTouchEnd={onDocTouchEnd} onClick={onDocClick}>
      <div className="flex flex-col gap-4 min-w-0">
      <div className="bg-white rounded-2xl border border-[#E7EAF0] p-5 sm:p-6">
        <div className="text-[16px] sm:text-[17px] font-bold text-[#1A1D26]">{data.label || 'Documento compartido'}</div>
        <div className="text-[12.5px] text-[#6B7280] mt-1 leading-relaxed">Para comentar, <b>marcá el texto</b> (en el celular, mantené presionado hasta que se pinte) y tocá <b>Comentar</b>. Tus comentarios y las respuestas del equipo aparecen al costado (o abajo en el celular). Tocá una <mark style={{ background: '#FEF9C3', padding: '0 3px', borderRadius: 2 }}>frase resaltada</mark> para ver su comentario. Sos <b>{name}</b>.</div>
        {sent && <div className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#16A34A]"><Check size={14} />¡Comentario enviado!</div>}
      </div>
      {sections.map((s) => {
        const rawHtml = s.html ? sanitizeDelHtml(s.html) : `<p>${(s.text || '').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`;
        let html = highlightHtml(rawHtml, comments.filter((c) => c.section_id === s.id && !c.parent_id));
        // Pintar la frase elegida (azul) DESDE QUE SE MARCA (selBtn) y mientras se escribe el
        // comentario (composer): con nuestro propio resaltado, no depende de la selección nativa del
        // navegador (que se suelta al aparecer el botón/caja). Así no "parpadea y desaparece".
        const marking = (composer && composer.sectionId === s.id) ? composer
                       : (selBtn && selBtn.sectionId === s.id) ? selBtn : null;
        if (marking && (marking.quote || '').trim().length >= 2) {
          const esc = marking.quote.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          try { html = html.replace(new RegExp('(?![^<]*>)(' + esc + ')'), '<mark style="background:#BFDBFE;border-radius:2px;padding:0 1px;">$1</mark>'); } catch { /* frase con caracteres raros */ }
        }
        return (
          <div key={s.id} className="bg-white rounded-2xl border border-[#E7EAF0] overflow-hidden">
            <div className="py-2.5 px-5 border-b border-[#F1F3F7] text-[13px] font-bold text-[#1A1D26]">{s.title || 'Sección'}</div>
            <div data-secid={s.id} className="del-rich py-5 px-4 sm:py-6 sm:px-8 text-[13.5px] leading-[1.62] text-[#2A2E3A] break-words"
              dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        );
      })}
      </div>

      {/* Margen de comentarios: a la derecha en desktop (sticky), debajo del documento en el celular. */}
      <aside className="mt-4 lg:mt-0 lg:sticky lg:top-4 flex flex-col gap-2 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pb-6">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#9098A4] px-1 flex items-center gap-1.5"><MessageSquare size={12} />Comentarios{topComments.length ? ` · ${topComments.length}` : ''}</div>
        {topComments.length === 0 && (
          <div className="text-[11.5px] text-[#AEB4BF] leading-snug bg-white rounded-xl border border-[#E7EAF0] p-3">Todavía no hay comentarios. Marcá una frase del texto y tocá <b>Comentar</b> para dejar el primero.</div>
        )}
        {topComments.map((c) => {
          const reps = repliesByParent[c.id] || [];
          return (
            <div key={c.id} id={'cmt-' + c.id} className="rounded-xl border bg-white px-3 py-2.5"
              style={{ borderColor: flashCmt === c.id ? '#2E69E0' : '#EEF0F3', boxShadow: flashCmt === c.id ? '0 0 0 2px #DBEAFE' : 'none', opacity: c.resolved ? 0.7 : 1 }}>
              {c.quote && <div onClick={() => scrollToMark(c.id)} title="Ver en el texto" className="text-[10.5px] text-[#8A6D2B] border-l-2 border-[#EAB308] pl-1.5 mb-1 italic line-clamp-2 cursor-pointer hover:text-[#6B5310]">“{c.quote}”</div>}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11.5px] font-bold text-[#1A1D26]">{c.author_name || 'Alguien'}</span>
                {c.is_team && <span className="text-[10px] font-bold text-[#2E69E0] bg-[#EAF1FF] rounded px-1 py-px uppercase tracking-wide">equipo</span>}
                {c.resolved && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#15803D] bg-[#ECFDF5] rounded px-1 py-px uppercase tracking-wide"><Check size={10} strokeWidth={3} />Aplicado</span>}
              </div>
              <div className="text-[12.5px] text-[#374151] whitespace-pre-wrap leading-[1.5] mt-0.5" style={{ textDecoration: c.resolved ? 'line-through' : 'none' }}>{c.body}</div>
              {reps.length > 0 && (
                <div className="mt-1.5 pl-2 border-l-2 border-[#EDF0F5] flex flex-col gap-1.5">
                  {reps.map((r) => (
                    <div key={r.id}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-[#1A1D26]">{r.author_name || 'Alguien'}</span>
                        {r.is_team && <span className="text-[10px] font-bold text-[#2E69E0] bg-[#EAF1FF] rounded px-1 py-px uppercase tracking-wide">equipo</span>}
                      </div>
                      <div className="text-[11.5px] text-[#374151] whitespace-pre-wrap leading-[1.45]">{r.body}</div>
                    </div>
                  ))}
                </div>
              )}
              {replyFor === c.id ? (
                <div className="mt-1.5">
                  <textarea value={replyDraft[c.id] || ''} autoFocus onChange={(e) => setReplyDraft((d) => ({ ...d, [c.id]: e.target.value }))} rows={2}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); responder(c); } if (e.key === 'Escape') setReplyFor(null); }}
                    placeholder="Responder…  (Ctrl+Enter)" className="w-full py-1.5 px-2 border border-[#E2E5EB] rounded-lg text-[12px] outline-none focus:border-[#2E69E0] bg-white resize-y" />
                  <div className="flex justify-end gap-1.5 mt-1">
                    <button onClick={() => setReplyFor(null)} className="py-1 px-2 rounded border border-[#E2E5EB] bg-white text-[#4B5563] text-[11px] font-semibold cursor-pointer">Cancelar</button>
                    <button onClick={() => responder(c)} disabled={sending === ('r:' + c.id) || !(replyDraft[c.id] || '').trim()} className="inline-flex items-center gap-1 py-1 px-2 rounded border-none bg-[#2E69E0] text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50">{sending === ('r:' + c.id) ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}Responder</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setReplyFor(c.id)} className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-semibold py-0.5 px-1.5 rounded border-none cursor-pointer bg-[#EFF3FF] text-[#2E69E0]"><MessageSquare size={11} />Responder</button>
              )}
            </div>
          );
        })}
      </aside>
    </div>

      {/* Botón flotante al marcar texto (FUERA del contenedor con onMouseUp: si estuviera
          dentro, el click al botón re-dispararía onDocMouseUp y borraría el botón antes del click). */}
      {selBtn && !composer && (
        <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }} onClick={() => { setComposer({ ...selBtn }); setDraft(''); setSelBtn(null); }}
          className="fixed z-[70] inline-flex items-center gap-1.5 py-2 px-4 rounded-full bg-[#1A1D26] text-white text-[13px] font-semibold cursor-pointer shadow-lg"
          style={{ top: Math.max(52, selBtn.top), left: Math.min(Math.max(selBtn.left, 64), (typeof window !== 'undefined' ? window.innerWidth : 1200) - 64), transform: 'translate(-50%,-130%)' }}>
          <MessageSquare size={14} />Comentar
        </button>
      )}
      {composer && (() => {
        // En mobile (< lg) el composer va como "bottom-sheet" pegado abajo (ancho completo): así el
        // teclado no lo tapa. En desktop, flota anclado a la frase.
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
        return (
        <div onMouseDown={(e) => e.stopPropagation()}
          className={`fixed z-[71] bg-white border border-[#E2E5EB] p-3 ${isMobile ? 'inset-x-2 bottom-2 rounded-2xl' : 'rounded-xl w-[min(320px,calc(100vw-24px))]'}`}
          style={isMobile
            ? { boxShadow: '0 -8px 40px rgba(10,22,40,.20)' }
            : { top: Math.min(composer.top, window.innerHeight - 220), left: Math.min(Math.max(composer.left, 168), window.innerWidth - 168), transform: 'translate(-50%, 10px)', boxShadow: '0 12px 40px rgba(10,22,40,.22)' }}>
          <div className="text-[10.5px] text-[#8A6D2B] border-l-2 border-[#EAB308] pl-1.5 mb-2 italic line-clamp-3">“{composer.quote}”</div>
          <textarea value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} rows={3}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviarQuote(); } if (e.key === 'Escape') { setComposer(null); setDraft(''); } }}
            placeholder="Escribí tu comentario…  (Ctrl+Enter)" className="w-full py-2 px-2.5 border border-[#E2E5EB] rounded-lg text-[12.5px] text-[#1A1D26] bg-white resize-y outline-none focus:border-[#2E69E0] leading-snug" />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => { setComposer(null); setDraft(''); }} className="py-1.5 px-3 rounded-lg border border-[#E2E5EB] bg-white text-[#4B5563] text-[12px] font-semibold cursor-pointer">Cancelar</button>
            <button onClick={enviarQuote} disabled={sending === 'c' || !draft.trim()} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border-none bg-[#2E69E0] text-white text-[12px] font-semibold cursor-pointer hover:bg-[#1D4FD8] disabled:opacity-50">{sending === 'c' ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}Comentar</button>
          </div>
        </div>
        );
      })()}
    </>
  );
}
