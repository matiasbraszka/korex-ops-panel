// Bajarse varios recursos de una carpeta de un saque.
//
// Los recursos NO viven todos en el mismo lado, y eso decide cómo se bajan:
//
//   · Fotos, PDFs y demás → bucket público de Supabase. Pesan poco, así que se
//     traen todos y se comprimen en un .zip que llega de una.
//   · Videos → Bunny. El original de un anuncio en 4K pesa entre 200 MB y 1 GB.
//     Meter veinte de esos en un zip armado en el navegador es pedirle al equipo
//     que tenga varios GB en memoria: la pestaña se cuelga. Por eso van de a uno,
//     uno tras otro, como si el usuario apretara "descargar" veinte veces.
//
// Todo se puede cancelar a mitad de camino.

import { zip } from 'fflate';

// La URL del archivo ORIGINAL. En Bunny, `public_url` es el reproductor incrustado
// y `storage_path` la miniatura: el archivo de verdad está al lado de la miniatura,
// en /original. Es la misma cuenta que hace el visor (ResourceLightbox.jsx:31-33).
export function urlOriginal(r) {
  if (!r) return null;
  if (r.provider === 'bunny') {
    return r.storage_path ? String(r.storage_path).replace('/thumbnail.jpg', '/original') : (r.public_url || null);
  }
  return r.public_url || null;
}

// Nombre de archivo usable en Windows, Mac y Linux, conservando la extensión real.
function nombreArchivo(r, usados) {
  // En vez de listar lo prohibido (que cambia según el sistema operativo), se deja
  // pasar solo lo seguro: letras, números, espacio y unos pocos símbolos. Un título
  // como «Anuncio 2: "el antes/después"» rompería el zip por los dos puntos y la barra.
  const limpio = String(r.title || 'archivo')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N} ._()\-+#&@']/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'archivo';

  const url = urlOriginal(r) || '';
  const deUrl = (url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i) || [])[1];
  const deMime = (r.mime_type || '').split('/')[1]?.split(';')[0];
  const ext = (deUrl || deMime || (r.provider === 'bunny' ? 'mp4' : 'bin')).toLowerCase();

  // Dos recursos pueden llamarse igual: el zip pisaría uno y el usuario nunca se
  // enteraría de que le faltó un archivo.
  let nombre = `${limpio}.${ext}`;
  let i = 2;
  while (usados.has(nombre)) nombre = `${limpio} (${i++}).${ext}`;
  usados.add(nombre);
  return nombre;
}

function bajarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function esVideoPesado(r) {
  return r?.provider === 'bunny';
}

/**
 * Descarga los recursos indicados.
 *
 * @param {Array}  recursos  filas de funnel_resources
 * @param {Object} opts
 *   nombreZip  — cómo se llama el .zip de los archivos livianos
 *   onPaso     — ({fase, hechos, total, actual}) para pintar el progreso
 *                fase: 'zip' | 'video' | 'listo'
 *   señal      — AbortSignal para cancelar
 * @returns {Promise<{zipeados:number, videos:number, fallados:string[]}>}
 */
export async function descargarLote(recursos, { nombreZip = 'recursos.zip', onPaso, señal } = {}) {
  const lista = (recursos || []).filter((r) => urlOriginal(r));
  const livianos = lista.filter((r) => !esVideoPesado(r));
  const videos = lista.filter((r) => esVideoPesado(r));
  const fallados = [];
  const usados = new Set();
  const total = lista.length;
  let hechos = 0;

  const cancelado = () => señal?.aborted;

  // ── 1. Los livianos, todos juntos en un zip ──
  let zipeados = 0;
  if (livianos.length) {
    const archivos = {};
    for (const r of livianos) {
      if (cancelado()) return { zipeados, videos: 0, fallados, cancelado: true };
      onPaso?.({ fase: 'zip', hechos, total, actual: r.title });
      try {
        const res = await fetch(urlOriginal(r), { signal: señal });
        if (!res.ok) throw new Error(String(res.status));
        archivos[nombreArchivo(r, usados)] = new Uint8Array(await res.arrayBuffer());
        zipeados += 1;
      } catch {
        if (cancelado()) return { zipeados, videos: 0, fallados, cancelado: true };
        fallados.push(r.title || r.id);
      }
      hechos += 1;
    }
    if (zipeados > 0) {
      const bytes = await new Promise((resolve, reject) => {
        // `zip` (asíncrono) y no `zipSync`: comprime fuera del hilo principal, así
        // la pantalla no se congela mientras arma el archivo.
        zip(archivos, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out)));
      });
      if (cancelado()) return { zipeados, videos: 0, fallados, cancelado: true };
      bajarBlob(new Blob([bytes], { type: 'application/zip' }), nombreZip);
    }
  }

  // ── 2. Los videos, de a uno ──
  let bajados = 0;
  for (const r of videos) {
    if (cancelado()) return { zipeados, videos: bajados, fallados, cancelado: true };
    onPaso?.({ fase: 'video', hechos, total, actual: r.title });
    try {
      const res = await fetch(urlOriginal(r), { signal: señal });
      if (!res.ok) throw new Error(String(res.status));
      bajarBlob(await res.blob(), nombreArchivo(r, usados));
      bajados += 1;
      // El navegador encola las descargas; un respiro entre una y otra evita que
      // Chrome tome la ráfaga por un intento de descarga automática y la bloquee.
      await new Promise((r2) => setTimeout(r2, 600));
    } catch {
      if (cancelado()) return { zipeados, videos: bajados, fallados, cancelado: true };
      fallados.push(r.title || r.id);
    }
    hechos += 1;
  }

  onPaso?.({ fase: 'listo', hechos, total });
  return { zipeados, videos: bajados, fallados };
}
