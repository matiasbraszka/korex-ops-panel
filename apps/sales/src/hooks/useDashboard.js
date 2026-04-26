import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@korex/db';

// Pide al backend toda la data del dashboard en una sola RPC.
// `range` = 'month' | 'max'. `pipelineId` = uuid o null. `setterId` = uuid o null.
export function useDashboard(range, pipelineId = null, setterId = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    let { data: payload, error: e } = await supabase.rpc('sales_dashboard_metrics', {
      p_range: range,
      p_pipeline_id: pipelineId || null,
      p_setter_id: setterId || null,
    });
    // Fallback v2: RPC sin p_setter_id
    if (e && (e.code === 'PGRST202' || (e.message || '').includes('function'))) {
      const r2 = await supabase.rpc('sales_dashboard_metrics', {
        p_range: range, p_pipeline_id: pipelineId || null,
      });
      payload = r2.data; e = r2.error;
    }
    // Fallback v1: solo p_range
    if (e && (e.code === 'PGRST202' || (e.message || '').includes('function'))) {
      const r1 = await supabase.rpc('sales_dashboard_metrics', { p_range: range });
      payload = r1.data; e = r1.error;
    }
    if (e) {
      console.error('[dashboard] rpc error', e);
      setError(e.message);
    } else {
      setData(payload);
    }
    setLoading(false);
  }, [range, pipelineId, setterId]);

  useEffect(() => { reload(); }, [reload]);

  return { data, loading, error, reload };
}
