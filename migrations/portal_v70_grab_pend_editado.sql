-- ═════════════════════════════════════════════════════════════════════════════
-- portal_v70_grab_pend_editado.sql
--
-- Arregla la contradicción "el freno dice que falta grabación, pero el detalle
-- dice que ya la recibimos". Pasaba en embudos VIEJOS/entregados (ej. Sergio
-- Canovas · Padres y Madres V1): tienen sus anuncios YA EDITADOS en el sistema
-- (ad_edit / vsl_edit) pero, por un re-import, quedaron guiones marcados
-- `para_grabar` sin el tilde `grabado`. El freno (grab_pend) los contaba como
-- deuda del cliente → 83% eterno, mientras el detalle (basado en archivos)
-- decía "recibimos tu grabación".
--
-- Regla nueva y general: una grabación NO está pendiente si ya existe el EDITADO
-- de ese tipo. Si lo editamos, es imposible que no se haya grabado. Así el freno
-- deja de trabar embudos ya entregados y coincide con lo que ve el cliente.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public._portal_avance_funnel(p_client text)
returns table(
  sid text, prod_done int, prod_total int,
  grab_hay boolean, grab_pend boolean, rev_hay boolean, rev_pend boolean,
  mat_hay boolean, mat_pend boolean,
  done int, total int, pct int, pend boolean, completo boolean)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with
  prod as (
    select strategy_id,
           count(*) filter (where status = 'listo') as done,
           count(*) as total
    from public.cerebro_pipeline_status(p_client)
    group by strategy_id
  ),
  funnels as (
    select s.id as sid,
      exists(select 1 from public.strategy_pages sp where sp.strategy_id = s.id and sp.status = 'activa') as lanzado
    from public.strategies s where s.client_id = p_client
  ),
  pf as (
    select f.sid, f.lanzado,
      coalesce(pr.done,0) as prod_done, coalesce(pr.total,0) as prod_total,
      exists(select 1 from public.del_sections ds
             where ds.strategy_id = f.sid and ds.para_grabar and ds.kind in ('vsl','anuncios')) as grab_hay,
      -- Pendiente = guión para_grabar sin `grabado` Y sin editado de ese tipo.
      -- Si ya existe el editado (ad_edit / vsl_edit), la grabación se dio: no frena.
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = p_client
             where ds.strategy_id = f.sid and ds.para_grabar and ds.kind in ('vsl','anuncios')
               and not coalesce(gs.grabado, false)
               and not exists(select 1 from public.funnel_resources fr
                              where fr.strategy_id = f.sid
                                and fr.bucket_key = case ds.kind when 'vsl' then 'vsl_edit' else 'ad_edit' end)) as grab_pend,
      exists(select 1 from public.del_sections ds
             where ds.strategy_id = f.sid and coalesce(ds.estado_seccion,'') = 'terminado'
               and coalesce(ds.accion_cliente,'') = 'revisar') as rev_hay,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = p_client
             where ds.strategy_id = f.sid and coalesce(ds.estado_seccion,'') = 'terminado'
               and coalesce(ds.accion_cliente,'') = 'revisar' and not coalesce(gs.revisado, false)) as rev_pend,
      exists(select 1 from public.portal_pedidos pp
             where pp.client_id = p_client and pp.activo and pp.strategy_id = f.sid) as mat_hay,
      exists(select 1 from public.portal_pedidos pp
             left join lateral (select count(*) n from public.funnel_resources fr
               where fr.client_id = p_client and pp.bucket_key is not null and fr.bucket_key = pp.bucket_key
                 and fr.strategy_id = pp.strategy_id) cnt on true
             where pp.client_id = p_client and pp.activo and pp.strategy_id = f.sid
               and pp.estado not in ('completo','validado')
               and not (pp.target_count is not null and coalesce(cnt.n,0) >= pp.target_count)
               and not (pp.bucket_key is not null and pp.target_count is null and coalesce(cnt.n,0) > 0)) as mat_pend
    from funnels f
    left join prod pr on pr.strategy_id = f.sid
  ),
  calc as (
    select pf.*,
      case when lanzado then
        prod_total + case when grab_hay then 1 else 0 end + case when rev_hay then 1 else 0 end + case when mat_hay then 1 else 0 end
      else
        prod_done
        + case when grab_hay and not grab_pend then 1 else 0 end
        + case when rev_hay  and not rev_pend  then 1 else 0 end
        + case when mat_hay  and not mat_pend  then 1 else 0 end
      end as done_c,
      prod_total
        + case when grab_hay then 1 else 0 end
        + case when rev_hay  then 1 else 0 end
        + case when mat_hay  then 1 else 0 end as total_c
    from pf
  )
  select sid, prod_done, prod_total, grab_hay, grab_pend, rev_hay, rev_pend, mat_hay, mat_pend,
    done_c, total_c,
    case when lanzado then 100 when total_c = 0 then 0 else round(done_c::numeric / total_c * 100)::int end,
    (not lanzado and (grab_pend or rev_pend or mat_pend)),
    (lanzado or (prod_total > 0 and prod_done = prod_total and not grab_pend and not rev_pend and not mat_pend))
  from calc
  where prod_total > 0 or grab_hay or rev_hay or mat_hay or lanzado;
$$;

grant execute on function public._portal_avance_funnel(text) to authenticated, service_role;

-- Misma regla para la lista "Tus grabaciones para grabar" (Inicio / Guiones):
-- no pedir grabar algo cuyo editado ya está entregado.
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
        and exists (
          select 1 from public.del_sections ds
          left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = p_client
          where ds.strategy_id = s.id and ds.para_grabar and ds.kind = x.kind
            and not coalesce(gs.grabado, false))
        -- pero NO pedirlo si ya entregamos el editado de ese tipo.
        and not exists (
          select 1 from public.funnel_resources fr
          where fr.strategy_id = s.id and fr.bucket_key = x.bucket_edit)
    ) t
  ) q;
$$;

grant execute on function public._portal_grabaciones_json(text) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
