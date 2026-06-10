import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@korex/db';
import { INPUT_KEYS } from '../lib/closerKpis.js';

// Primer y ultimo dia (YYYY-MM-DD) de un mes dado (month: 1-12).
function monthBounds(year, month) {
  const pad = (n) => String(n).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate(); // dia 0 del mes siguiente = ultimo del actual
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` };
}

// Carga las filas diarias del scorecard de un mes (todas o filtradas por closer)
// y expone saveDay para crear/editar un dia via upsert.
export function useCloserScorecard(year, month, closerId = null) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { from, to } = monthBounds(year, month);
    let q = supabase.from('sales_closer_daily').select('*')
      .gte('date', from).lte('date', to).order('date');
    if (closerId) q = q.eq('closer_id', closerId);
    const { data, error: e } = await q;
    if (e) { console.error('[scorecard] load error', e); setError(e.message); }
    else setRows(data || []);
    setLoading(false);
  }, [year, month, closerId]);

  useEffect(() => { load(); }, [load]);

  // Guarda (upsert) el dia de un closer. `inputs` trae solo las keys de INPUT_KEYS.
  const saveDay = useCallback(async (date, forCloserId, inputs) => {
    const clean = {};
    INPUT_KEYS.forEach((k) => { clean[k] = Number(inputs[k] || 0); });
    const row = { closer_id: forCloserId, date, ...clean, updated_at: new Date().toISOString() };
    const { data, error: e } = await supabase
      .from('sales_closer_daily')
      .upsert(row, { onConflict: 'closer_id,date' })
      .select().single();
    if (e) { console.error('[scorecard] save error', e); return { error: e.message }; }
    // Actualizar state local: reemplazar la fila de ese (closer, dia) si existia.
    setRows((prev) => {
      const others = prev.filter((r) => !(r.closer_id === forCloserId && r.date === date));
      return [...others, data].sort((a, b) => (a.date < b.date ? -1 : 1));
    });
    return { data };
  }, []);

  return { rows, loading, error, reload: load, saveDay };
}
