import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@korex/db';

// Pide al backend toda la data del dashboard en una sola RPC.
// `range` = 'month' | 'max'
export function useDashboard(range) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: payload, error: e } = await supabase.rpc('sales_dashboard_metrics', { p_range: range });
    if (e) {
      console.error('[dashboard] rpc error', e);
      setError(e.message);
    } else {
      setData(payload);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => { reload(); }, [reload]);

  return { data, loading, error, reload };
}
