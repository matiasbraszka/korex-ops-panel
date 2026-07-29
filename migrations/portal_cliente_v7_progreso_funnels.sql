-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente · v7 · El progreso del Avance se calcula con los FUNNELS
--
-- Pedido de Matías (2026-07-24): las "fases" viejas (clients.custom_phases, que
-- mostraban círculos "Pendiente" vacíos) se ELIMINAN del portal. El progreso
-- general = promedio del avance real de los funnels del cliente (etapa 1-4 de
-- _portal_etapa: guion→grabación→edición→publicado). Si TODOS los funnels están
-- publicados → 100% y el portal muestra "Funnels todos terminados · Ahora,
-- optimizando los resultados".
--
-- Aplicada a prod el 2026-07-24. fases queda [] (compat con el front viejo).
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.portal_cliente_pipeline()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select case when public.portal_cliente_client() is null then null else (
    select jsonb_build_object(
      -- Progreso = promedio del avance de los funnels (etapa 1→0% · 4→100%).
      'progreso', coalesce((
        select round(avg((public._portal_etapa(s.id, s.status) - 1) / 3.0) * 100)::int
        from public.strategies s where s.client_id = c.id
      ), 0),
      'todosTerminados', coalesce((
        select bool_and(public._portal_etapa(s.id, s.status) = 4) and count(*) > 0
        from public.strategies s where s.client_id = c.id
      ), false),
      'fases', '[]'::jsonb,
      'eventos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'fecha', to_char(h.fecha, 'DD/MM/YYYY'),
          'titulo', h.titulo,
          'descripcion', coalesce(h.descripcion, ''),
          'tipo', coalesce(h.tipo, ''),
          'estado', coalesce(h.estado, 'completado')
        ) order by h.fecha desc, h.hora desc nulls last)
        from (
          select * from public.historial_eventos he
          where he.cliente_id = c.id
            and coalesce(he.dismissed, false) = false
            and he.incluir_resumen is distinct from false
          order by he.fecha desc, he.hora desc nulls last
          limit 25
        ) h
      ), '[]'::jsonb)
    )
    from public.clients c where c.id = public.portal_cliente_client()
  ) end;
$$;
