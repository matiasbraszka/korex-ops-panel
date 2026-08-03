// Firma en LOTE las rutas de un bucket privado y las cachea.
//
// El punto: createSignedUrls (plural) resuelve toda la página en UNA llamada HTTP. Con el
// singular serían 24 llamadas por página y 24 re-renders. El caché vive en un ref, así que
// cambiar de nicho y volver no vuelve a firmar nada.
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@korex/db';

const CHUNK = 100;

export function useSignedUrls(bucket, paths, { ttl = 7200, margin = 600 } = {}) {
  const cache = useRef(new Map());   // path -> { url, exp }  (exp en epoch ms)
  const enVuelo = useRef(new Set()); // pedidas y todavía sin respuesta
  const [urls, setUrls] = useState({});
  const [tick, setTick] = useState(0);

  // Solo pide lo que falta o lo que vence dentro del margen.
  const faltantes = useCallback((lista) => {
    const ahora = Date.now();
    const out = [];
    for (const p of lista) {
      if (!p || enVuelo.current.has(p)) continue;
      const hit = cache.current.get(p);
      if (hit && hit.exp - ahora > margin * 1000) continue;
      out.push(p);
    }
    return out;
  }, [margin]);

  useEffect(() => {
    const pendientes = faltantes(paths || []);
    if (!pendientes.length) return;
    let vivo = true;
    pendientes.forEach((p) => enVuelo.current.add(p));

    (async () => {
      for (let i = 0; i < pendientes.length; i += CHUNK) {
        const lote = pendientes.slice(i, i + CHUNK);
        try {
          const { data } = await supabase.storage.from(bucket).createSignedUrls(lote, ttl);
          const exp = Date.now() + ttl * 1000;
          const parche = {};
          // Zipeamos por ÍNDICE, no por el campo `path` de la respuesta: ese campo cambió
          // entre versiones del SDK según incluya o no el bucket como prefijo. El orden
          // de entrada sí está garantizado.
          lote.forEach((p, idx) => {
            const url = data?.[idx]?.signedUrl || null;
            if (url) cache.current.set(p, { url, exp });
            parche[p] = url;
          });
          if (vivo) setUrls((prev) => ({ ...prev, ...parche }));
        } catch {
          const parche = {};
          lote.forEach((p) => { parche[p] = null; });
          if (vivo) setUrls((prev) => ({ ...prev, ...parche }));
        } finally {
          lote.forEach((p) => enVuelo.current.delete(p));
        }
      }
    })();

    return () => { vivo = false; };
    // `tick` está en las deps a propósito: es lo que dispara el refresco periódico.
  }, [bucket, paths, ttl, faltantes, tick]);

  // Con TTL de 2 h y margen de 10 min, en una sesión normal esto no re-firma nunca.
  // Solo cubre al que deja la pestaña abierta toda la tarde.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return urls;
}

export default useSignedUrls;
