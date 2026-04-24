import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@korex/db';

// Hook para la biblioteca de recursos de Ventas (sales_resources).
// Compartida entre todo el equipo de Ventas: cada vendedor ve y edita la misma lista.
export function useSalesResources() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await supabase
      .from('sales_resources')
      .select('*')
      .order('created_at', { ascending: false });
    if (e) setError(e.message); else setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = useCallback(async (link) => {
    const { data: userData } = await supabase.auth.getUser();
    const created_by = userData?.user?.id || null;
    const { data, error: e } = await supabase
      .from('sales_resources')
      .insert({ ...link, created_by })
      .select()
      .single();
    if (e) { console.error(e); return; }
    setItems((prev) => [data, ...prev]);
  }, []);

  const update = useCallback(async (link, patch) => {
    if (!link?.id) return;
    setItems((prev) => prev.map((x) => (x.id === link.id ? { ...x, ...patch } : x)));
    const { error: e } = await supabase.from('sales_resources').update(patch).eq('id', link.id);
    if (e) console.error(e);
  }, []);

  const remove = useCallback(async (link) => {
    if (!link?.id) return;
    if (!confirm('¿Eliminar este recurso?')) return;
    setItems((prev) => prev.filter((x) => x.id !== link.id));
    const { error: e } = await supabase.from('sales_resources').delete().eq('id', link.id);
    if (e) console.error(e);
  }, []);

  return { items, loading, error, refresh: load, add, update, remove };
}
