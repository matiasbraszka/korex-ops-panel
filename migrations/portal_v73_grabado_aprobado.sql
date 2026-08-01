-- ═════════════════════════════════════════════════════════════════════════════
-- portal_v73_grabado_aprobado.sql
--
-- Una grabación cuenta como hecha SOLO cuando el EQUIPO la aprueba, no cuando el
-- cliente dice que grabó / subió videos. Pedido de Matías: "aunque el cliente haya
-- marcado que grabó o subido las grabaciones, si no se aprueba no lo damos por
-- grabado".
--
-- Ya existía la aprobación del equipo: `del_grab_marcar_grabado` (portal_v59) mueve
-- `del_sections.grab_flujo` a 'grabado' (estado que SOLO setea el equipo). El cliente,
-- en cambio, setea `portal_guion_status.grabado` (su auto-reporte) vía toggle_guion.
--
-- Este cambio: la señal de "grabado" para el avance / lo pendiente pasa a ser
-- **grab_flujo = 'grabado'** (aprobación del equipo), NO `portal_guion_status.grabado`
-- (auto-reporte del cliente). El auto-reporte del cliente sigue existiendo como
-- aviso, pero ya no completa el guión por sí solo.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- Avance por funnel: grab_pend = guión de lanzamiento SIN aprobar (grab_flujo<>'grabado').
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
      exists(select 1 from public.strategy_pages sp where sp.strategy_id = s.id
             and sp.status in ('activa','antiguo')) as lanzado
    from public.strategies s where s.client_id = p_client
  ),
  pf as (
    select f.sid, f.lanzado,
      coalesce(pr.done,0) as prod_done, coalesce(pr.total,0) as prod_total,
      exists(select 1 from public.del_sections ds
             where ds.strategy_id = f.sid and ds.para_grabar and ds.kind in ('vsl','anuncios')
               and coalesce(ds.fase,'lanzamiento') = 'lanzamiento') as grab_hay,
      -- Pendiente = guión de lanzamiento que el equipo NO aprobó como grabado.
      exists(select 1 from public.del_sections ds
             where ds.strategy_id = f.sid and ds.para_grabar and ds.kind in ('vsl','anuncios')
               and coalesce(ds.fase,'lanzamiento') = 'lanzamiento'
               and coalesce(ds.grab_flujo,'') <> 'grabado') as grab_pend,
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

-- "grabá esto" (Inicio/Guiones): pendiente = de lanzamiento y sin aprobar.
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
        and coalesce(s.status,'') not in ('activa','antiguo')
        and exists (
          select 1 from public.del_sections ds
          where ds.strategy_id = s.id and ds.para_grabar and ds.kind = x.kind
            and coalesce(ds.fase,'lanzamiento') = 'lanzamiento'
            and coalesce(ds.grab_flujo,'') <> 'grabado')
    ) t
  ) q;
$$;

grant execute on function public._portal_grabaciones_json(text) to authenticated, service_role;

-- Optimización: "grabar" pendiente = guión sin aprobar (grab_flujo<>'grabado').
create or replace function public.portal_cliente_optimizacion()
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with cid as (select public.portal_cliente_client() as v)
  select case when (select v from cid) is null then '{}'::jsonb else coalesce((
    select jsonb_object_agg(sid, info) from (
      select s.id as sid, jsonb_build_object(
        'lanzado', true,
        'target', sp.ads_target,
        'entregados', (select count(*) from public.funnel_resources fr
                        where fr.strategy_id = s.id and fr.bucket_key = 'ad_edit'),
        'extras', greatest(0, (select count(*) from public.funnel_resources fr
                        where fr.strategy_id = s.id and fr.bucket_key = 'ad_edit') - coalesce(sp.ads_target, 0)),
        'pendientes', coalesce((
          select jsonb_agg(jsonb_build_object('tipo', tipo, 'titulo', titulo, 'dias', dias) order by dias desc) from (
            select 'grabar' as tipo, ds.title as titulo,
                   greatest(0, extract(day from now() - coalesce(ds.grab_flujo_at, ds.updated_at, ds.imported_at))::int) as dias
            from public.del_sections ds
            where ds.strategy_id = s.id and ds.para_grabar and ds.kind in ('vsl','anuncios')
              and coalesce(ds.grab_flujo,'') <> 'grabado'
            union all
            select 'revisar', ds.title,
                   greatest(0, extract(day from now() - coalesce(ds.updated_at, ds.imported_at))::int)
            from public.del_sections ds
            left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = (select v from cid)
            where ds.strategy_id = s.id and coalesce(ds.estado_seccion,'') = 'terminado'
              and coalesce(ds.accion_cliente,'') = 'revisar' and not coalesce(gs.revisado, false)
          ) p
        ), '[]'::jsonb)
      ) as info
      from public.strategies s
      join public.strategy_pages sp on sp.strategy_id = s.id and sp.status = 'activa'
      where s.client_id = (select v from cid)
    ) q
  ), '{}'::jsonb) end;
$$;

grant execute on function public.portal_cliente_optimizacion() to authenticated;

commit;

notify pgrst, 'reload schema';
