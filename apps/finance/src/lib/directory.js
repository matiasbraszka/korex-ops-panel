import { useEffect, useState, useCallback } from 'react';
import { sbFetch } from '@korex/db';

// Normalización de nombre en JS que replica la SQL fin_norm() (minúsculas, sin acentos,
// sin puntuación, espacios colapsados). NFD descompone acentos y la T-coma rumana (Ț→T).
const COMBINING = /[̀-ͯ]/g;
export const normName = (t) =>
  ((t || '')
    .normalize('NFD').replace(COMBINING, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()) || null;

// Hook: carga el directorio único (id ↔ nombre normalizado) y devuelve resolve(name) → id|null.
// Permite hacer clickeable cualquier nombre suelto (Pagos, Deuda, etc.) hacia el perfil 360°.
export function useDirectoryResolver() {
  const [map, setMap] = useState(null);
  useEffect(() => {
    let alive = true;
    sbFetch('fin_directory_unique?select=id,norm_name&limit=1000')
      .then((d) => {
        if (!alive) return;
        const m = new Map();
        (Array.isArray(d) ? d : []).forEach((r) => { if (r.norm_name) m.set(r.norm_name, r.id); });
        setMap(m);
      })
      .catch(() => { if (alive) setMap(new Map()); });
    return () => { alive = false; };
  }, []);
  return useCallback((name) => { const k = normName(name); return (k && map) ? (map.get(k) || null) : null; }, [map]);
}
