-- Portal · "Lo que te falta" (grabaciones) ahora se basa en la APROBACIÓN del
-- equipo, no en si hay archivos. Un embudo+tipo queda pendiente de grabar mientras
-- exista al menos un guión para_grabar que el equipo todavía NO marcó grabado
-- (portal_guion_status.grabado). Coherente con la pantalla de Guiones.
create or replace function public._portal_grabaciones_json(p_client text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(item order by (item->>'dias')::int desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'tipo', 'grabacion_' || t.doc_tipo,
      'titulo', case t.doc_tipo when 'vsl' then 'Graba tu VSL' else 'Graba tus anuncios' end,
      'descripcion', 'Los guiones ya están escritos en tu documento del embudo ' || t.name ||
        case t.doc_tipo when 'vsl' then '.' else '. Cada uno dura menos de un minuto.' end,
      'dias', greatest(0, extract(day from now() - t.desde))::int,
      'bloqueante', false, 'estado', 'pendiente',
      'strategyId', t.strategy_id, 'docTipo', t.doc_tipo,
      'funnel', t.name, 'funnelNum', public._portal_funnel_num(p_client, t.strategy_id),
      'target', null, 'subidos', 0, 'bucket', t.bucket
    ) as item
    from (
      select s.id as strategy_id, s.name, x.doc_tipo, x.bucket,
        (select max(coalesce(ds.updated_at, ds.imported_at, now()))
           from public.del_sections ds
          where ds.strategy_id = s.id and ds.para_grabar and ds.kind = x.kind) as desde
      from public.strategies s
      cross join (values ('ads','anuncios','ad_rec','ad_edit'), ('vsl','vsl','vsl_rec','vsl_edit')) as x(doc_tipo, kind, bucket, bucket_edit)
      where s.client_id = p_client
        and coalesce(s.status,'') <> 'activa'
        -- Pendiente mientras haya un guión para_grabar que el equipo NO aprobó grabado.
        and exists (
          select 1 from public.del_sections ds
          left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = p_client
          where ds.strategy_id = s.id and ds.para_grabar and ds.kind = x.kind
            and not coalesce(gs.grabado, false))
    ) t
  ) q;
$$;

notify pgrst, 'reload schema';
