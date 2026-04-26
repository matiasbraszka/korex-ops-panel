import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@korex/db';

// Pide al backend toda la data del dashboard en una sola RPC.
// `range` = 'month' | 'max'. `pipelineId` = uuid o null (todos).
export function useDashboard(range, pipelineId = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    let { data: payload, error: e } = await supabase.rpc('sales_dashboard_metrics', {
      p_range: range,
      p_pipeline_id: pipelineId || null,
    });
    // Fallback: si la RPC nueva (v2) todavia no fue aplicada en la base,
    // probamos la firma anterior con solo p_range.
    if (e && (e.code === 'PGRST202' || (e.message || '').includes('function'))) {
      console.warn('[dashboard] v2 RPC no encontrada, fallback a v1 (sin filtro de pipeline)');
      const r = await supabase.rpc('sales_dashboard_metrics', { p_range: range });
      payload = r.data; e = r.error;
    }
    if (e) {
      console.error('[dashboard] rpc error', e);
      setError(e.message);
    } else {
      setData(payload);
    }
    setLoading(false);
  }, [range, pipelineId]);

  useEffect(() => { reload(); }, [reload]);

  return { data, loading, error, reload };
}
