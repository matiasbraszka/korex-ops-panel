-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente · v6 · El Avance se conecta al HISTORIAL de operaciones
--
-- Pedido de Matías (2026-07-24): "el avance de tu proyecto debería estar
-- conectado con el historial del cliente que figura en operaciones".
--
-- portal_cliente_pipeline ahora devuelve también `eventos`: la línea de tiempo
-- de historial_eventos del cliente (la misma pestaña Historial del panel).
-- Curación: entra lo NO descartado y con incluir_resumen=true — el MISMO flag
-- que decide qué va en el resumen por email al cliente, así el equipo controla
-- qué ve el cliente con un solo tilde que ya usa.
--
-- Aplicada a prod el 2026-07-24. Aditiva (solo agrega la clave 'eventos').
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.portal_cliente_pipeline()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select case when public.portal_cliente_client() is null then null else (
    select jsonb_build_object(
      'progreso', coalesce((c.custom_phases->>'progreso')::int,
        (select round(100.0 * count(*) filter (where f->>'estado' = 'hecho') / nullif(count(*),0))
         from jsonb_array_elements(coalesce(c.custom_phases->'fases', c.custom_phases, '[]'::jsonb)) f)),
      'fases', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', coalesce(f.val->>'id', f.ord::text), 'nombre', f.val->>'nombre',
          'estado', coalesce(f.val->>'estado','pendiente'), 'fecha', f.val->>'fecha', 'detalle', f.val->>'detalle'))
        from jsonb_array_elements(coalesce(c.custom_phases->'fases', c.custom_phases, '[]'::jsonb)) with ordinality as f(val, ord)
      ), '[]'::jsonb),
      -- La línea de tiempo REAL del proyecto: el Historial del panel de operaciones.
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
