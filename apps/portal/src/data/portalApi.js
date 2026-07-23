// ─────────────────────────────────────────────────────────────────────────────
// portalApi — única capa que habla con el backend de Korex.
//
// - Lecturas: RPCs `portal_cliente_*` (SECURITY DEFINER, scopeadas al client del
//   usuario logueado). Si la RPC todavía no está desplegada (o estás en demo sin
//   sesión), cae automáticamente a los datos de src/data/mockData.js.
// - Subidas: video → Bunny (TUS, vía edge function bunny-video, idéntico al panel);
//   fotos/recursos → Supabase Storage. El registro en `funnel_resources` lo hace
//   la RPC `portal_cliente_registrar_recurso` (el cliente NO escribe la tabla directo).
//
// Cuando termines las RPCs, no hay que tocar los screens: cambian los datos solos.
// ─────────────────────────────────────────────────────────────────────────────
import * as tus from 'tus-js-client';
import { supabase, STORAGE_BUCKET } from '../lib/supabase';
import * as mock from './mockData';

let _demo = false;
/** true si la última lectura vino de datos demo (RPC no disponible / sin sesión). */
export function isDemo() { return _demo; }

async function rpc(fn, args, fallback) {
  try {
    const { data, error } = await supabase.rpc(fn, args || {});
    if (error) throw error;
    if (data == null) throw new Error('rpc_empty');
    _demo = false;
    return data;
  } catch (e) {
    console.warn(`[portalApi] ${fn} → demo (${e?.message || e})`);
    _demo = true;
    return typeof fallback === 'function' ? fallback() : fallback;
  }
}

// ── Lecturas ────────────────────────────────────────────────────────────────
export const api = {
  me:        () => rpc('portal_cliente_me',        {}, () => mock.MOCK_CLIENT),
  home:      () => rpc('portal_cliente_home',      {}, () => mock.MOCK_HOME),

  // Funnels: el eje del portal.
  funnels:   () => rpc('portal_cliente_funnels',   {}, () => mock.MOCK_FUNNELS),
  funnel:    (id) => rpc('portal_cliente_funnel',  { p_strategy: id }, () => mock.mockFunnel(id)),
  guion:     (id) => rpc('portal_cliente_guion',   { p_section_id: id }, () => mock.mockGuion(id)),

  guiones:   () => rpc('portal_cliente_guiones',   {}, () => mock.MOCK_GUIONES),
  carpetas:  () => rpc('portal_cliente_carpetas',  {}, () => mock.MOCK_CARPETAS),
  pipeline:  () => rpc('portal_cliente_pipeline',  {}, () => mock.MOCK_PIPELINE),
  tutoriales:() => rpc('portal_cliente_tutoriales',{}, () => mock.MOCK_TUTORIALES),

  toggleGuion: (sectionId, grabado) =>
    rpc('portal_cliente_toggle_guion',
        { p_section_id: sectionId, p_grabado: grabado },
        () => ({ ok: true, demo: true })),

  // Lista los archivos de una carpeta. En demo devuelve lo que tenga el mock local.
  carpeta: (folderId) =>
    rpc('portal_cliente_carpeta', { p_folder: folderId }, () => ({ items: [] })),
};

// ── Subidas ─────────────────────────────────────────────────────────────────
const isVideo = (f) => (f.type || '').startsWith('video');
const safeName = (n) => (n || 'archivo').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);

// Video pesado → Bunny (mismo flujo que el panel: el server crea+firma, el browser
// sube por TUS directo a Bunny, sin exponer la key y sin límite de tamaño).
async function subirABunny(file, title, onProgress) {
  const { data, error } = await supabase.functions.invoke('bunny-video', { body: { action: 'create', title } });
  if (error || !data?.ok) throw new Error(data?.error || error?.message || 'bunny_prepare_failed');
  const { videoId, libraryId, signature, expiration, tusEndpoint, embedUrl } = data;
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
  return { provider: 'bunny', bunny_id: videoId, public_url: embedUrl, storage_path: embedUrl, kind: 'video' };
}

// Foto/recurso → Supabase Storage (bucket público funnel-recursos), bajo un prefijo
// del portal. El registro en funnel_resources lo hace la RPC (scopeada al cliente).
async function subirAStorage(file, folderId, onProgress) {
  // Storage upload no expone progreso real en el navegador; simulamos avance suave
  // mientras la promesa está pendiente para que la barra no quede congelada.
  let p = 0;
  const t = setInterval(() => { p = Math.min(0.9, p + 0.08); onProgress?.(p); }, 180);
  try {
    const path = `portal/${folderId}/${Date.now()}_${safeName(file.name)}`;
    const up = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
    if (up.error) throw up.error;
    const pub = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
    onProgress?.(1);
    return { provider: 'supabase', storage_path: path, public_url: pub, kind: 'image' };
  } finally {
    clearInterval(t);
  }
}

// Sube 1 archivo real y lo registra vía RPC. onProgress(frac 0..1).
export async function uploadRecurso(folderId, file, onProgress) {
  const title = file.name;
  const res = isVideo(file)
    ? await subirABunny(file, title, onProgress)
    : await subirAStorage(file, folderId, onProgress);
  const { error } = await supabase.rpc('portal_cliente_registrar_recurso', {
    p_folder: folderId,
    p_provider: res.provider,
    p_kind: res.kind,
    p_title: title,
    p_storage_path: res.storage_path,
    p_public_url: res.public_url,
    p_bunny_id: res.bunny_id || null,
    p_mime: file.type || null,
    p_size: file.size || null,
  });
  if (error) throw error;
  return { ...res, title };
}

// Simula una subida (modo demo / sin backend) para ver la UI de progreso completa.
export function simulateUpload(file, onProgress, onDone) {
  let p = 0;
  const t = setInterval(() => {
    p = Math.min(1, p + (0.06 + Math.random() * 0.16));
    onProgress?.(p);
    if (p >= 1) { clearInterval(t); onDone?.({ provider: isVideo(file) ? 'bunny' : 'supabase', kind: isVideo(file) ? 'video' : 'image', title: file.name }); }
  }, 220);
  return () => clearInterval(t);
}
