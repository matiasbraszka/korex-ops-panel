-- Portal · cada pedido/grabación/revisión lleva el NOMBRE del embudo (o null =
-- general), para mostrarle al cliente de qué funnel es cada petición.
-- Solo se agrega el campo 'funnel' a los tres generadores; nada más cambia.
begin;

create or replace function public._portal_pedidos_json(p_client text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pp.id, 'tipo', pp.tipo, 'titulo', pp.titulo, 'descripcion', coalesce(pp.descripcion,''),
    'bucket', pp.bucket_key, 'target', pp.target_count,
    'subidos', coalesce(cnt.n, 0),
    'bloqueante', pp.bloqueante,
    'dias', greatest(0, extract(day from now() - pp.pedido_at))::int,
    'estado', case
        when pp.estado in ('validado','completo') then pp.estado
        when pp.target_count is not null and coalesce(cnt.n,0) >= pp.target_count then 'completo'
        when pp.bucket_key is not null and pp.target_count is null and coalesce(cnt.n,0) > 0 then 'completo'
        else pp.estado end,
    'strategyId', pp.strategy_id,
    'funnel', (select s.name from public.strategies s where s.id = pp.strategy_id)
  ) order by pp.orden, pp.pedido_at), '[]'::jsonb)
  from public.portal_pedidos pp
  left join lateral (
    select count(*) n from public.funnel_resources fr
    where fr.client_id = p_client and pp.bucket_key is not null and fr.bucket_key = pp.bucket_key
      and ((pp.strategy_id is null and fr.strategy_id is null) or fr.strategy_id = pp.strategy_id)
  ) cnt on true
  where pp.client_id = p_client and pp.activo;
$$;

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
      'funnel', t.name,
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
        and exists (select 1 from public.del_sections ds
                    where ds.strategy_id = s.id and ds.para_grabar and ds.kind = x.kind)
        and not exists (select 1 from public.funnel_resources fr
                        where fr.strategy_id = s.id and fr.bucket_key in (x.bucket, x.bucket_edit))
    ) t
  ) q;
$$;

create or replace function public._portal_revisiones_json(p_client text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(item order by (item->>'dias')::int desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', 'revision_' || t.strategy_id || '_' || t.doc_tipo,
      'tipo', 'revision',
      'titulo', t.titulo,
      'descripcion', 'Embudo ' || t.name || '. ' || case when t.n = 1
        then 'Léelo y márcalo como revisado. Si algo no encaja, selecciona el texto y déjanos un comentario.'
        else 'Son ' || t.n || '. Léelos y márcalos como revisados; si algo no encaja, selecciona el texto y déjanos un comentario.' end,
      'dias', greatest(0, extract(day from now() - t.desde))::int,
      'bloqueante', false, 'estado', 'pendiente',
      'strategyId', t.strategy_id, 'docTipo', t.doc_tipo,
      'funnel', t.name,
      'pendientes', t.n, 'target', null, 'subidos', 0
    ) as item
    from (
      select s.id as strategy_id, s.name, x.doc_tipo,
             case x.doc_tipo when 'ads' then 'Revisa tus anuncios'
                             when 'vsl' then 'Revisa tu VSL'
                             when 'avatar' then 'Revisa tu avatar'
                             else 'Revisa la estrategia' end as titulo,
             count(*) as n,
             min(coalesce(ds.updated_at, ds.imported_at, now())) as desde
      from public.strategies s
      cross join (values ('ads','anuncios'), ('vsl','vsl'),
                         ('avatar','avatares'), ('estrategia','estrategia')) as x(doc_tipo, kind)
      join public.del_sections ds on ds.strategy_id = s.id and ds.kind = x.kind
      left join public.portal_guion_status gs
        on gs.section_id = ds.id and gs.client_id = p_client
      where s.client_id = p_client
        and coalesce(ds.estado_seccion, '') = 'terminado'
        and coalesce(ds.accion_cliente, '') = 'revisar'
        and not coalesce(ds.para_grabar, false)
        and not coalesce(gs.revisado, false)
      group by s.id, s.name, x.doc_tipo
    ) t
  ) q;
$$;

commit;

notify pgrst, 'reload schema';
