-- ─────────────────────────────────────────────────────────────────────────────
-- PORTAL v14 — "Tus guiones para grabar" (pedido de Matías):
-- el tab Guiones ya no abre el DEL de una: muestra tarjeta por tarjeta CADA
-- guion marcado para_grabar (título, resumen, duración estimada, estado) y al
-- tocar lleva al guion exacto dentro del documento.
-- Redefine portal_cliente_guiones (la versión v2 vieja quedó sin uso).
-- Aplicada a prod el 2026-07-25 vía MCP. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.portal_cliente_guiones()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', ds.id,
      'strategyId', ds.strategy_id,
      'docTipo', case ds.kind when 'vsl' then 'vsl' else 'ads' end,
      'funnel', s.name,
      'titulo', ds.title,
      'snippet', left(regexp_replace(coalesce(ds.text,''), '\s+', ' ', 'g'), 160),
      'palabras', coalesce(array_length(regexp_split_to_array(btrim(coalesce(ds.text,'')), E'\\s+'), 1), 0),
      'grabado', coalesce(gs.grabado, false),
      -- El documento entero ya tiene material (grabaciones o ediciones): entregado.
      'entregado', exists (
        select 1 from public.funnel_resources fr
        where fr.strategy_id = ds.strategy_id
          and fr.bucket_key in (case ds.kind when 'vsl' then 'vsl_rec' else 'ad_rec' end,
                                case ds.kind when 'vsl' then 'vsl_edit' else 'ad_edit' end))
    ) order by
      case when s.status = 'activa' then 1 else 0 end,   -- primero lo que está en armado
      s.position,
      case ds.kind when 'anuncios' then 0 else 1 end,
      coalesce(ds.orden_grabacion, ds.ord, 0), ds.title)
    from public.del_sections ds
    join public.strategies s on s.id = ds.strategy_id
    left join public.portal_guion_status gs
      on gs.section_id = ds.id and gs.client_id = public.portal_cliente_client()
    where s.client_id = public.portal_cliente_client()
      and ds.para_grabar and ds.kind in ('anuncios','vsl')
  ), '[]'::jsonb) end;
$$;

grant execute on function public.portal_cliente_guiones() to authenticated;
