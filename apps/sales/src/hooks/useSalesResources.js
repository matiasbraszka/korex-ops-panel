import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@korex/db';

// Hook para sales_resources con schema v12 (rediseno handoff).
// Campos: id, type, title, body, body_alt, url, description, tags[], used_count, created_at...
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

  // create / update / remove son agnósticos a la UI: si falla, devuelven el
  // error como string para que el caller lo muestre como toast in-app.
  const create = useCallback(async (payload) => {
    const { data: userData } = await supabase.auth.getUser();
    const created_by = userData?.user?.id || null;
    const type = payload.type || 'recursos';
    const row = {
      type,
      // category es columna legacy NOT NULL hasta v15. Pasamos el type tambien
      // ahi para no romper inserts en DBs que aun tienen el constraint viejo.
      category: payload.category || type,
      title: payload.title?.trim() || '',
      body: payload.body?.trim() || null,
      body_alt: payload.body_alt?.trim() || null,
      url: payload.url?.trim() || null,
      description: payload.description?.trim() || null,
      tags: payload.tags || [],
      created_by,
    };
    const { data, error: e } = await supabase
      .from('sales_resources')
      .insert(row)
      .select()
      .single();
    if (e) { console.error(e); return { error: e.message }; }
    setItems((prev) => [data, ...prev]);
    return { data };
  }, []);

  const update = useCallback(async (item, patch) => {
    if (!item?.id) return { error: 'Sin id' };
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
    const { error: e } = await supabase.from('sales_resources').update(patch).eq('id', item.id);
    if (e) { console.error(e); return { error: e.message }; }
    return {};
  }, []);

  const remove = useCallback(async (item) => {
    if (!item?.id) return { error: 'Sin id' };
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    const { error: e } = await supabase.from('sales_resources').delete().eq('id', item.id);
    if (e) { console.error(e); return { error: e.message }; }
    return {};
  }, []);

  // Compat con la API antigua de ResourcesPanel
  const add = create;

  return { items, loading, error, refresh: load, create, add, update, remove };
}
