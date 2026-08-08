import { supabase } from '@korex/db';

// Imágenes que se insertan dentro de una nota (subidas desde la computadora,
// pegadas con Ctrl+V o arrastradas al texto).
//
// Reusamos el bucket público 'informe-capturas' — es el mismo tipo de contenido
// (imágenes internas del panel) y así no hace falta infraestructura nueva. Las
// notas van en su propia carpeta y la URL no es adivinable (usuario + fecha +
// random). El bucket ya limita a 10 MB por archivo.

const BUCKET = 'informe-capturas';
export const MAX_IMAGEN_BYTES = 10 * 1024 * 1024; // 10 MB (igual que el bucket)

// Sube el archivo y devuelve la URL pública para insertarla como <img>.
//
// Las del DEL usan el MISMO bucket y su propia carpeta (`del/<cliente>/…`). Van
// acá y no a funnel_resources a propósito: una captura pegada dentro del documento
// es parte del texto, no material del cliente — si cayera en Recursos, las carpetas
// se llenarían de recortes sueltos y el equipo no encontraría más los entregables.
export async function uploadNotaImagen(userId, file) {
  if (!file) throw new Error('no llegó el archivo');
  if (!/^image\//.test(file.type || '')) throw new Error('el archivo no es una imagen');
  if (file.size > MAX_IMAGEN_BYTES) throw new Error('la imagen pesa más de 10 MB');

  const safe = (file.name || 'imagen')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-');
  const ym = new Date().toISOString().slice(0, 7); // YYYY-MM
  const rnd = Math.random().toString(36).slice(2, 7);
  const path = `notas/${userId || 'anon'}/${ym}/${Date.now()}-${rnd}-${safe}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Imagen pegada, arrastrada o subida DENTRO del DEL de un cliente.
export async function uploadDelImagen(clientId, file) {
  if (!file) throw new Error('no llegó el archivo');
  if (!/^image\//.test(file.type || '')) throw new Error('el archivo no es una imagen');
  if (file.size > MAX_IMAGEN_BYTES) throw new Error('la imagen pesa más de 10 MB');

  const safe = (file.name || 'imagen')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-');
  const ym = new Date().toISOString().slice(0, 7);
  const rnd = Math.random().toString(36).slice(2, 7);
  const path = `del/${clientId || 'sin-cliente'}/${ym}/${Date.now()}-${rnd}-${safe}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
