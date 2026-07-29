-- ─────────────────────────────────────────────────────────────────────────────
-- Portal del cliente v8 — re-diseño con tabs (Home · Funnels · Recursos · Perfil)
--  1. portal_cliente_tareas: + funnelId (el id de la ESTRATEGIA, que es el id que
--     usa el portal en /funnel/:id) para que tocar la tarea lleve a su funnel.
--     tasks.funnel_id apunta a strategy_pages → subimos a sp.strategy_id.
--     El chip "funnel" pasa a mostrar el nombre de la estrategia (lo que el
--     cliente ve en su lista de funnels), con fallback al nombre de la página.
--  2. portal_cliente_recursos(): conteo de archivos por carpeta a NIVEL CLIENTE
--     (branding, autoridad, productos, estilo, empresa…) para el tab Recursos.
--     'estilo_vida' se traduce de vuelta a 'estilo' (id de carpeta del portal).
-- Aplicada a prod el 2026-07-24 (MCP apply_migration portal_cliente_v8_tareas_funnelid_recursos).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.portal_cliente_tareas()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'titulo', t.title,
      'prioridad', coalesce(t.priority,'normal'),
      'dias', greatest(0, extract(day from now() - t.created_at))::int,
      'funnel', coalesce(st.name, sp.name, ''),
      'funnelId', sp.strategy_id,
      'vence', t.due_date
    ) order by case coalesce(t.priority,'normal') when 'alta' then 0 when 'high' then 0 when 'urgente' then 0 when 'normal' then 1 else 2 end, t.created_at)
    from public.tasks t
    left join public.strategy_pages sp on sp.id = t.funnel_id
    left join public.strategies st on st.id = sp.strategy_id
    where t.client_id = public.portal_cliente_client()
      and t.asignada_cliente
      and coalesce(t.status,'') <> 'done'
  ), '[]'::jsonb) end;
$$;

create or replace function public.portal_cliente_recursos()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_object_agg(q.k, q.n) from (
      select case fr.bucket_key when 'estilo_vida' then 'estilo' else fr.bucket_key end as k, count(*) as n
      from public.funnel_resources fr
      where fr.client_id = public.portal_cliente_client() and fr.strategy_id is null
      group by 1
    ) q
  ), '{}'::jsonb) end;
$$;

grant execute on function public.portal_cliente_tareas() to authenticated;
grant execute on function public.portal_cliente_recursos() to authenticated;
