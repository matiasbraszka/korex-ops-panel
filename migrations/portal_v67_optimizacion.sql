-- ═════════════════════════════════════════════════════════════════════════════
-- portal_v67_optimizacion.sql — Fase de OPTIMIZACIÓN (trabajo de más tras lanzar).
--
-- Modelo (decisión de Matías):
--   100% = funnel entregado + los anuncios comprometidos (ads_target, ej. 15
--   videos editados en la carpeta). Cuando el equipo LANZA el funnel (status
--   'activa'), el avance queda CONGELADO en 100% — ese es el trato cumplido.
--   Lo que hacemos DESPUÉS (anuncios de más) es OPTIMIZACIÓN: se muestra aparte,
--   con sus tiempos y los retrasos que el cliente causa, SIN tocar el 100%.
--
--   ads_target vive en la config del funnel (strategy_pages).
-- ═════════════════════════════════════════════════════════════════════════════

begin;

alter table public.strategy_pages add column if not exists ads_target int;

-- ── Avance por funnel: los LANZADOS quedan en 100% (trato cumplido) ─────────
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
    -- Antes de lanzar: pend del cliente frena. Lanzado: lo pendiente es OPTIMIZACIÓN (no frena el %).
    (not lanzado and (grab_pend or rev_pend or mat_pend)),
    (lanzado or (prod_total > 0 and prod_done = prod_total and not grab_pend and not rev_pend and not mat_pend))
  from calc
  where prod_total > 0 or grab_hay or rev_hay or mat_hay or lanzado;
$$;

-- ── Pasos del embudo: un funnel LANZADO se muestra todo entregado (verde) ────
create or replace function public.portal_cliente_embudo_pasos()
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with cid as (select public.portal_cliente_client() as v),
  av as (select sid, mat_pend from public._portal_avance_funnel((select v from cid))),
  lanz as (select strategy_id from public.strategy_pages where status = 'activa'),
  base as (
    select cp.strategy_id, cp.stage, cp.ord, cp.substate, (cp.status = 'listo') as done,
           coalesce(a.mat_pend, false) as mat_pend,
           (cp.strategy_id in (select strategy_id from lanz)) as lanzado
    from public.cerebro_pipeline_status((select v from cid)) cp
    left join av a on a.sid = cp.strategy_id
  ),
  marc as (
    select b.*,
      case b.stage when 'estrategia' then 'Estrategia' when 'avatares' then 'Avatares'
                   when 'vsl' then 'VSL' when 'anuncios' then 'Anuncios'
                   when 'landing' then 'Landing' else b.stage end as lbl,
      case
        when b.lanzado or b.done then 'hecho'
        when b.stage in ('vsl','anuncios') and b.substate = 'guion' then 'cliente'
        when b.stage = 'landing' and b.mat_pend then 'cliente'
        else 'korex'
      end as quien,
      case when b.lanzado or b.done then 'listo'
           when b.ord = min(b.ord) filter (where not (b.done or b.lanzado)) over (partition by b.strategy_id) then 'en_curso'
           else 'pendiente' end as estado
    from base b
  )
  select case when (select v from cid) is null then '{}'::jsonb else coalesce((
    select jsonb_object_agg(strategy_id, pasos) from (
      select strategy_id,
        jsonb_agg(jsonb_build_object('key', stage, 'label', lbl, 'done', done, 'quien', quien, 'estado', estado) order by ord) as pasos
      from marc group by strategy_id
    ) q
  ), '{}'::jsonb) end;
$$;

-- ── Optimización por funnel lanzado: extras + lo que le pedimos + retrasos ───
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
        -- Lo nuevo que le pedimos y todavía no hizo (grabar/revisar), con días.
        'pendientes', coalesce((
          select jsonb_agg(jsonb_build_object('tipo', tipo, 'titulo', titulo, 'dias', dias) order by dias desc) from (
            select 'grabar' as tipo, ds.title as titulo,
                   greatest(0, extract(day from now() - coalesce(ds.grab_flujo_at, ds.updated_at, ds.imported_at))::int) as dias
            from public.del_sections ds
            left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = (select v from cid)
            where ds.strategy_id = s.id and ds.para_grabar and ds.kind in ('vsl','anuncios')
              and not coalesce(gs.grabado, false)
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
