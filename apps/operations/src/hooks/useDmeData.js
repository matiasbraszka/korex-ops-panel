import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@korex/db';
import { INPUT_KEYS } from '../lib/dme/registry.js';

export const ALL_CLIENTS = '__ALL__';

// Carga las filas diarias del DME de un cliente en el rango [from, to] y expone
// saveDay/deleteDay (upsert por (client_id, date)). Para el Maestro
// (clientId === ALL_CLIENTS, solo admin) usa el RPC dme_combined_daily, que
// devuelve por fecha la suma cruzada de todos los clientes y es read-only.
export function useDmeData(clientId, from, to, updatedBy = null) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isCombined = clientId === ALL_CLIENTS;

  const load = useCallback(async () => {
    if (!clientId || !from || !to) { setRows([]); setLoading(false); return; }
    setLoading(true); setError(null);
    if (isCombined) {
      const { data, error: e } = await supabase.rpc('dme_combined_daily', { p_from: from, p_to: to });
      if (e) { console.error('[dme] combined error', e); setError(e.message); setRows([]); }
      else setRows((data || []).map((r) => ({ date: r.date, metrics: r.metrics || {} })));
    } else {
      const { data, error: e } = await supabase
        .from('dme_daily').select('*')
        .eq('client_id', clientId).gte('date', from).lte('date', to).order('date');
      if (e) { console.error('[dme] load error', e); setError(e.message); setRows([]); }
      else setRows(data || []);
    }
    setLoading(false);
  }, [clientId, from, to, isCombined]);

  useEffect(() => { load(); }, [load]);

  // Guarda (upsert) un dia. Solo se persisten las metricas REALMENTE cargadas
  // (campos vacios se omiten -> quedan en blanco, no como 0).
  const saveDay = useCallback(async (date, inputs, note = null) => {
    if (isCombined) return { error: 'El Maestro combinado es de solo lectura.' };
    const metrics = {};
    for (const k of INPUT_KEYS) {
      const v = inputs?.[k];
      if (v === '' || v == null) continue;
      const num = Number(v);
      if (Number.isFinite(num)) metrics[k] = num;
    }
    const row = { client_id: clientId, date, metrics, note, updated_by: updatedBy, updated_at: new Date().toISOString() };
    const { data, error: e } = await supabase
      .from('dme_daily').upsert(row, { onConflict: 'client_id,date' }).select().single();
    if (e) { console.error('[dme] save error', e); return { error: e.message }; }
    setRows((prev) => {
      const others = prev.filter((r) => r.date !== date);
      return [...others, data].sort((a, b) => (a.date < b.date ? -1 : 1));
    });
    return { data };
  }, [clientId, isCombined, updatedBy]);

  const deleteDay = useCallback(async (date) => {
    if (isCombined) return { error: 'El Maestro combinado es de solo lectura.' };
    const { error: e } = await supabase.from('dme_daily').delete().eq('client_id', clientId).eq('date', date);
    if (e) { console.error('[dme] delete error', e); return { error: e.message }; }
    setRows((prev) => prev.filter((r) => r.date !== date));
    return {};
  }, [clientId, isCombined]);

  return { rows, loading, error, reload: load, saveDay, deleteDay };
}
