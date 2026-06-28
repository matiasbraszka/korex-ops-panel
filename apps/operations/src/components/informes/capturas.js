import { supabase } from '@korex/db';

// Capturas (screenshots) de los informes — bucket público 'informe-capturas'.
// Guardamos la URL pública en el bullet para mostrarla en el panel, llevarla al
// historial del cliente y enviarla a Slack. Es contenido interno; la URL no es
// adivinable (carpeta por usuario + timestamp + random).

const BUCKET = 'informe-capturas';
export const MAX_CAPTURA_BYTES = 10 * 1024 * 1024; // 10 MB (igual que el bucket)

// Sube un archivo y devuelve { url, path, name, type } para guardar en el bullet.
export async function uploadInformeCaptura(userId, file) {
  const safe = (file.name || 'captura')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-');
  const ym = new Date().toISOString().slice(0, 7); // YYYY-MM
  const rnd = Math.random().toString(36).slice(2, 7);
  const path = `${userId || 'anon'}/${ym}/${Date.now()}-${rnd}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path, name: file.name || safe, type: file.type || '' };
}

// Quita una captura del storage (al sacarla de un bullet antes de guardar).
export async function deleteInformeCaptura(path) {
  if (!path) return;
  try { await supabase.storage.from(BUCKET).remove([path]); } catch { /* ignore */ }
}
