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
