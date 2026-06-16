import { useEffect, useState, useCallback } from 'react';
import { sbFetch } from '@korex/db';

// Listas configurables (categorias_egreso, medio_pago, tipo_ingreso, concepto_pago, rol_pago).
// Devuelve las opciones + add/rename/remove (soft-delete) para editarlas desde el desplegable.
export function useOptions(kind) {
  const [options, setOptions] = useState([]);

  const reload = useCallback(() => {
    sbFetch(`fin_options?kind=eq.${encodeURIComponent(kind)}&active=eq.true&select=id,value,color,sort&order=sort.asc,value.asc`)
      .then((d) => setOptions(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [kind]);
  useEffect(() => { reload(); }, [reload]);

  const add = useCallback(async (value, color) => {
    const v = (value || '').trim();
    if (!v) return null;
    const sort = options.reduce((m, o) => Math.max(m, o.sort || 0), 0) + 1;
    try {
      const res = await sbFetch('fin_options', {
        method: 'POST', headers: { Prefer: 'return=representation' }, throwOnError: true,
        body: JSON.stringify({ kind, value: v, color: color || null, sort }),
      });
      reload();
      return Array.isArray(res) ? res[0] : res;
    } catch { return null; }
  }, [kind, options, reload]);

  const rename = useCallback(async (id, value) => {
    const v = (value || '').trim();
    if (!v) return;
    try { await sbFetch(`fin_options?id=eq.${id}`, { method: 'PATCH', throwOnError: true, body: JSON.stringify({ value: v }) }); reload(); } catch {}
  }, [reload]);

  // Soft-delete (active=false): no rompe filas que ya usan la etiqueta.
  const remove = useCallback(async (id) => {
    try { await sbFetch(`fin_options?id=eq.${id}`, { method: 'PATCH', throwOnError: true, body: JSON.stringify({ active: false }) }); reload(); } catch {}
  }, [reload]);

  return { options, add, rename, remove, reload };
}
