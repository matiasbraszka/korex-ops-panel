// Helpers del Banco de inspiraciones (sin React).
//
// El bucket es PRIVADO a propósito: las imágenes no se sirven por URL pública, se firman
// al vuelo. Y no tiene policy de delete, así que un archivo subido no se puede borrar desde
// la app — el borrado del panel es lógico (deleted_at) y el archivo queda guardado.
// Ver migrations/marketing_inspiraciones_v1.sql.
import { supabase } from '@korex/db';

export const BUCKET = 'marketing-inspiraciones';
export const TABLA = 'marketing_inspirations';
export const TABLA_NICHOS = 'marketing_niches';

// Los mismos que acepta el bucket. Si acá se agrega uno, hay que agregarlo también en
// allowed_mime_types de la migración o el archivo se sube y Storage lo rechaza.
export const MIMES_IMG = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
export const MIMES_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'];
export const MIMES = [...MIMES_IMG, ...MIMES_VIDEO];
// El video pesa mucho más que una imagen: el bucket admite hasta 200 MB (ver la migración
// marketing_inspiraciones_ganadores_v1.sql). Las imágenes se quedan en 15 MB.
export const MAX_IMG = 15 * 1024 * 1024;
export const MAX_VIDEO = 200 * 1024 * 1024;
export const MAX_BYTES = MAX_VIDEO; // tope duro del input; el límite fino lo pone maxDe()
export const POR_PAGINA = 24;

export const esImagen = (f) => !!f && MIMES_IMG.includes((f.type || '').toLowerCase());
export const esVideo = (f) => !!f && MIMES_VIDEO.includes((f.type || '').toLowerCase());
export const esCreativo = (f) => esImagen(f) || esVideo(f);
export const maxDe = (f) => (esVideo(f) ? MAX_VIDEO : MAX_IMG);

export const pesoLegible = (b) => {
  if (!b) return '';
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

// Espejo en JS de public.mkt_slug(). Si se toca una, tocar la otra.
export function slugify(txt) {
  return String(txt || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Nombre de archivo apto para una ruta de Storage (sin acentos ni caracteres raros).
export function safeName(nombre) {
  return String(nombre || 'imagen')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(-80);
}

export const sinExtension = (n) => String(n || '').replace(/\.[a-z0-9]{2,5}$/i, '');

// La ruta NO codifica el nicho: el nicho se puede cambiar después y el path quedaría
// mintiendo. Carpeta por mes + usuario, y timestamp + random para que no haya colisión.
export function buildPath(userId, file) {
  const ym = new Date().toISOString().slice(0, 7);
  const rnd = Math.random().toString(36).slice(2, 7);
  return `${ym}/${userId || 'anon'}/${Date.now()}-${rnd}-${safeName(file.name)}`;
}

// SHA-256 del archivo, para avisar "esta imagen ya está en el banco". No es un candado:
// una variante legítima se puede subir igual.
// crypto.subtle solo existe en contexto seguro (https o localhost); si el panel se abre
// por IP en http, devolvemos null y seguimos sin dedupe en vez de romper la subida.
export async function sha256Hex(file) {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

// Ancho y alto. El agente de imágenes que venga después necesita saber si la referencia
// es 1:1 o 9:16. Si el navegador no puede decodificarla, no aborta la subida.
export async function readDimensions(file) {
  try {
    const bmp = await createImageBitmap(file);
    const out = { width: bmp.width, height: bmp.height };
    bmp.close?.();
    return out;
  } catch {
    return { width: null, height: null };
  }
}

// Sube el archivo PRIMERO y recién después inserta la fila. Si falla en el medio queda un
// archivo huérfano invisible de unos KB; al revés quedaría una tarjeta rota en la galería,
// que se ve y molesta. La consulta para auditar huérfanos está en la migración.
export async function subirInspiracion({ file, userId, comun, checksum, dims }) {
  const path = buildPath(userId, file);
  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (up.error) throw up.error;

  const fila = {
    storage_path: path,
    mime_type: file.type || 'image/png',
    size_bytes: file.size || null,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    checksum: checksum || null,
    niche_slug: comun.niche_slug,
    title: (comun.title || sinExtension(file.name) || 'Sin título').slice(0, 160),
    notes: comun.notes || null,
    tags: comun.tags || [],
    source: comun.source || null,
    source_url: comun.source_url || null,
    client_id: comun.client_id || null,
    brand: comun.brand || null,
    created_by: userId || null,
    // Campos del anuncio GANADOR (vacíos cuando es una inspiración suelta).
    es_ganador: !!comun.es_ganador,
    ad_copy: comun.ad_copy || null,
    activo_desde: comun.activo_desde || null,
    activo_hasta: comun.activo_hasta || null,
    metrics: comun.metrics || {},
  };
  const { data, error } = await supabase.from(TABLA).insert(fila).select('*').single();
  if (error) throw error;
  return data;
}

// Descarga con el nombre lindo. Storage sabe devolver Content-Disposition: attachment si le
// pasamos `download`, así que no hace falta bajar el archivo a memoria.
// Si eso falla, caemos al truco del blob (el atributo download de un <a> se ignora
// cross-origin, por eso hay que bajarlo y re-dispararlo desde el mismo dominio).
export async function descargar(path, titulo, mime) {
  const ext = (() => {
    const m = /\.([a-z0-9]{2,5})$/i.exec(path || '');
    if (m) return `.${m[1].toLowerCase()}`;
    if ((mime || '').includes('png')) return '.png';
    if ((mime || '').includes('webp')) return '.webp';
    if ((mime || '').includes('gif')) return '.gif';
    return '.jpg';
  })();
  const limpio = String(titulo || 'inspiracion').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const nombre = /\.[a-z0-9]{2,5}$/i.test(limpio) ? limpio : limpio + ext;

  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60, { download: nombre });
  if (data?.signedUrl) {
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const firma = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (!firma.data?.signedUrl) throw new Error('No se pudo generar el enlace de descarga.');
  const res = await fetch(firma.data.signedUrl);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
