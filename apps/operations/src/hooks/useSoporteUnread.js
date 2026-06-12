import { useEffect, useRef, useState } from 'react';
import { supabase, sbFetch } from '@korex/db';

// Total de mensajes sin leer de la bandeja de Soporte, para el badge del nav.
// NO importa @korex/soporte (mantiene el chunk lazy): solo consulta
// wa_conversations y se refresca por realtime con debounce. Gated por
// `enabled` (canAccessSoporte) — sin permiso no hay fetch ni canal, y RLS
// devolveria [] de todas formas.
export default function useSoporteUnread(enabled) {
  const [count, setCount] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    const refetch = async () => {
      const rows = await sbFetch(
        'wa_conversations?select=unread_count&unread_count=gt.0',
        { headers: { Prefer: 'return=representation' } },
      );
      if (active && Array.isArray(rows)) {
        setCount(rows.reduce((acc, r) => acc + (r.unread_count || 0), 0));
      }
    };
    refetch();

    const debounced = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(refetch, 500);
    };

    const channel = supabase
      .channel('wa_unread_badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_conversations' }, debounced)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wa_conversations' }, debounced)
      .subscribe();

    return () => {
      active = false;
      clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  // Sin permiso no hay fetch ni canal; devolver 0 directo (sin setear estado).
  return enabled ? count : 0;
}
