-- ═════════════════════════════════════════════════════════════════════════════
-- portal_v62_avance_real.sql
--
-- "Avance de tu proyecto" (portal del cliente) EXACTO y vinculado al pipeline.
--
-- ANTES: usaba _portal_etapa (grueso, 1-4) con un atajo fatal — si el equipo
-- marcaba el funnel "activa", saltaba a 100% aunque el cliente adeudara grabar,
-- revisar el copy o subir material. Por eso decía 100% con cosas pendientes.
--
-- AHORA (decisión de Matías): el % sale del MISMO motor del Kanban de Operaciones
-- (cerebro_pipeline_status) + una regla dura: cada cosa que el cliente adeuda en
-- un funnel cuenta como un paso sin terminar, así el funnel NUNCA llega a 100%
-- mientras el cliente deba algo. Deudas que frenan (las 3): grabaciones (guiones
-- para grabar sin aprobar), revisiones/copy (secciones 'revisar' sin revisar,
-- incluye las páginas pg_*), y material (pedidos abiertos).
--
-- El número final por funnel = (pasos de producción listos + deudas saldadas) /
-- (pasos de producción + deudas activas). El % del proyecto = suma de todo lo
-- hecho / suma de todo lo que hay (pondera funnel por tamaño, más exacto).
-- ═════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public._portal_avance(p_client text)
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with
  -- 1) Producción: los pasos del pipeline interno (mismo motor que el Kanban),
  --    agregados por funnel (strategy). done = pasos 'listo'.
  prod as (
    select strategy_id,
           count(*) filter (where status = 'listo') as done,
           count(*) as total
    from public.cerebro_pipeline_status(p_client)
    group by strategy_id
  ),
  funnels as (
    select s.id as sid, s.name from public.strategies s where s.client_id = p_client
  ),
  -- 2) Deuda del cliente por funnel: ¿hay algo de esa categoría? (_hay) y ¿queda
  --    algo pendiente? (_pend).
  deuda as (
    select f.sid,
      exists(select 1 from public.del_sections ds
             where ds.strategy_id = f.sid and ds.para_grabar and ds.kind in ('vsl','anuncios')) as grab_hay,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = p_client
             where ds.strategy_id = f.sid and ds.para_grabar and ds.kind in ('vsl','anuncios')
               and not coalesce(gs.grabado, false)) as grab_pend,
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
  ),
  por_funnel as (
    select f.sid,
      coalesce(pr.done,0) as prod_done, coalesce(pr.total,0) as prod_total,
      coalesce(d.grab_hay,false) grab_hay, coalesce(d.grab_pend,false) grab_pend,
      coalesce(d.rev_hay,false)  rev_hay,  coalesce(d.rev_pend,false)  rev_pend,
      coalesce(d.mat_hay,false)  mat_hay,  coalesce(d.mat_pend,false)  mat_pend
    from funnels f
    left join prod pr on pr.strategy_id = f.sid
    left join deuda d on d.sid = f.sid
  ),
  -- Solo funnels con algo real (producción o deuda); los vacíos no distorsionan.
  activos as (
    select * from por_funnel
    where prod_total > 0 or grab_hay or rev_hay or mat_hay
  ),
  -- 3) Pedidos GENERALES (sin funnel): frenan el proyecto entero.
  gen as (
    select
      exists(select 1 from public.portal_pedidos pp
             where pp.client_id = p_client and pp.activo and pp.strategy_id is null) as gen_hay,
      exists(select 1 from public.portal_pedidos pp
             left join lateral (select count(*) n from public.funnel_resources fr
               where fr.client_id = p_client and pp.bucket_key is not null and fr.bucket_key = pp.bucket_key
                 and fr.strategy_id is null) cnt on true
             where pp.client_id = p_client and pp.activo and pp.strategy_id is null
               and pp.estado not in ('completo','validado')
               and not (pp.target_count is not null and coalesce(cnt.n,0) >= pp.target_count)
               and not (pp.bucket_key is not null and pp.target_count is null and coalesce(cnt.n,0) > 0)) as gen_pend
  ),
  agg as (
    select
      (select count(*) from activos) as n_funnels,
      coalesce((select sum(
        prod_done
        + case when grab_hay and not grab_pend then 1 else 0 end
        + case when rev_hay  and not rev_pend  then 1 else 0 end
        + case when mat_hay  and not mat_pend  then 1 else 0 end
      ) from activos), 0)
      + case when (select gen_hay from gen) and not (select gen_pend from gen) then 1 else 0 end as done,
      coalesce((select sum(
        prod_total
        + case when grab_hay then 1 else 0 end
        + case when rev_hay  then 1 else 0 end
        + case when mat_hay  then 1 else 0 end
      ) from activos), 0)
      + case when (select gen_hay from gen) then 1 else 0 end as total,
      coalesce((select bool_and(
        prod_total > 0 and prod_done = prod_total
        and not grab_pend and not rev_pend and not mat_pend
      ) from activos), false) as todos_funnels
    from activos limit 1
  )
  select jsonb_build_object(
    'pct', case when coalesce((select total from agg),0) = 0 then 0
                else round((select done from agg)::numeric / (select total from agg) * 100)::int end,
    'done', coalesce((select n_funnels from agg),0) > 0
            and coalesce((select todos_funnels from agg), false)
            and not (select gen_pend from gen)
  );
$$;

grant execute on function public._portal_avance(text) to authenticated, service_role;

-- ── La Home usa el avance real (reemplaza el cálculo de _portal_etapa) ───────
create or replace function public.portal_cliente_inicio()
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cid text; v_name text; v_prog int; v_done boolean; v_ped jsonb; v_grab jsonb; v_wa text;
  v_rev jsonb; v_run record; v_onb jsonb; p record; v_av jsonb;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;
  select name into v_name from public.clients where id = v_cid;

  -- Avance EXACTO: pipeline interno + freno por deuda del cliente.
  v_av   := public._portal_avance(v_cid);
  v_prog := coalesce((v_av->>'pct')::int, 0);
  v_done := coalesce((v_av->>'done')::boolean, false);

  v_ped  := public._portal_pedidos_json(v_cid);
  v_grab := public._portal_grabaciones_json(v_cid);
  v_rev  := public._portal_revisiones_json(v_cid);
  select value->>'whatsapp_equipo' into v_wa from public.app_settings where key = 'portal_config';

  select * into v_run from public.onboarding_runs
   where client_id = v_cid and estado <> 'archivado' limit 1;

  if v_run.id is null then
    v_onb := jsonb_build_object('existe', false, 'completo', true);
  else
    select * into p from public.onboarding_progreso(v_run.id);
    v_onb := jsonb_build_object(
      'existe', true,
      'completo', v_run.estado = 'completado',
      'estado', v_run.estado,
      'pct', p.progreso,
      'requeridas', p.requeridas,
      'respondidas', p.respondidas,
      'agendaEstado', v_run.agenda_estado,
      'agendaAt', v_run.agenda_at,
      'bloques', p.bloques,
      'desbloqueadas', coalesce((
        select jsonb_agg(distinct r)
          from jsonb_array_elements(p.bloques) b,
               jsonb_array_elements_text(b->'desbloquea') r
         where (b->>'total')::int > 0
           and (b->>'hechas')::int >= (b->>'total')::int
      ), '[]'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'name', v_name,
    'progreso', v_prog,
    'todosTerminados', v_done,
    'whatsapp', coalesce(v_wa, ''),
    'onboarding', v_onb,
    'pendientes', v_rev || v_grab || coalesce((
      select jsonb_agg(p2) from jsonb_array_elements(v_ped) p2
      where p2->>'estado' in ('pendiente','cliente_dice_listo')), '[]'::jsonb),
    'completados', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', p2->>'titulo'))
      from jsonb_array_elements(v_ped) p2
      where p2->>'estado' in ('completo','validado')), '[]'::jsonb)
  );
end $$;

commit;

notify pgrst, 'reload schema';
