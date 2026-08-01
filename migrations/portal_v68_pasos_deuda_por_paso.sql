-- ═════════════════════════════════════════════════════════════════════════════
-- portal_v68_pasos_deuda_por_paso.sql
--
-- Arregla la contradicción "todo verde pero 83%": un paso ya no se pinta verde si
-- el cliente todavía adeuda algo DE ESE PASO, aunque haya parte hecha. Ej: hay
-- anuncios editados (substate 'editado') PERO faltan grabaciones de otros anuncios
-- → Anuncios en ROJO (tu parte), no verde.
--
-- Mapeo deuda→paso:
--   grabación de anuncios pendiente  → Anuncios rojo
--   grabación de VSL pendiente       → VSL rojo
--   revisión de anuncios/vsl/copy    → ese paso rojo
--   material (imágenes/branding)     → Landing rojo
-- Un funnel LANZADO se muestra todo verde (su deuda es optimización, aparte).
-- ═════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.portal_cliente_embudo_pasos()
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with cid as (select public.portal_cliente_client() as v),
  lanz as (select strategy_id from public.strategy_pages where status = 'activa'),
  base as (
    select cp.strategy_id, cp.stage, cp.ord, cp.substate, (cp.status = 'listo') as done,
           (cp.strategy_id in (select strategy_id from lanz)) as lanzado
    from public.cerebro_pipeline_status((select v from cid)) cp
  ),
  -- Deuda del cliente por funnel, separada por paso.
  deuda as (
    select f.sid,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = (select v from cid)
             where ds.strategy_id = f.sid and ds.para_grabar and ds.kind = 'anuncios' and not coalesce(gs.grabado,false)) as ads_grab,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = (select v from cid)
             where ds.strategy_id = f.sid and ds.para_grabar and ds.kind = 'vsl' and not coalesce(gs.grabado,false)) as vsl_grab,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = (select v from cid)
             where ds.strategy_id = f.sid and coalesce(ds.estado_seccion,'')='terminado' and coalesce(ds.accion_cliente,'')='revisar'
               and ds.kind = 'anuncios' and not coalesce(gs.revisado,false)) as ads_rev,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = (select v from cid)
             where ds.strategy_id = f.sid and coalesce(ds.estado_seccion,'')='terminado' and coalesce(ds.accion_cliente,'')='revisar'
               and ds.kind = 'vsl' and not coalesce(gs.revisado,false)) as vsl_rev,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = (select v from cid)
             where ds.strategy_id = f.sid and coalesce(ds.estado_seccion,'')='terminado' and coalesce(ds.accion_cliente,'')='revisar'
               and ds.kind in ('pg_prelanding','pg_landing','pg_formulario','pg_thankyou') and not coalesce(gs.revisado,false)) as land_rev,
      exists(select 1 from public.portal_pedidos pp
             left join lateral (select count(*) n from public.funnel_resources fr
               where fr.client_id = (select v from cid) and pp.bucket_key is not null and fr.bucket_key = pp.bucket_key
                 and fr.strategy_id = pp.strategy_id) cnt on true
             where pp.client_id = (select v from cid) and pp.activo and pp.strategy_id = f.sid
               and pp.estado not in ('completo','validado')
               and not (pp.target_count is not null and coalesce(cnt.n,0) >= pp.target_count)
               and not (pp.bucket_key is not null and pp.target_count is null and coalesce(cnt.n,0) > 0)) as mat
    from (select distinct strategy_id as sid from base) f
  ),
  marc0 as (
    select b.*,
      case b.stage when 'estrategia' then 'Estrategia' when 'avatares' then 'Avatares'
                   when 'vsl' then 'VSL' when 'anuncios' then 'Anuncios'
                   when 'landing' then 'Landing' else b.stage end as lbl,
      -- ¿este paso tiene deuda del cliente?
      case b.stage
        when 'vsl'      then (d.vsl_grab or d.vsl_rev or b.substate = 'guion')
        when 'anuncios' then (d.ads_grab or d.ads_rev or b.substate = 'guion')
        when 'landing'  then (d.mat or d.land_rev)
        else false end as debt_cli
    from base b left join deuda d on d.sid = b.strategy_id
  ),
  marc as (
    select m.*,
      case
        when m.lanzado then 'hecho'
        when m.debt_cli then 'cliente'
        when m.done then 'hecho'
        else 'korex' end as quien,
      -- "en_curso" = primer paso que no esté verde (ni hecho ni lanzado).
      case when m.lanzado or (m.done and not m.debt_cli) then 'listo'
           when m.ord = min(m.ord) filter (where not (m.lanzado or (m.done and not m.debt_cli))) over (partition by m.strategy_id) then 'en_curso'
           else 'pendiente' end as estado
    from marc0 m
  )
  select case when (select v from cid) is null then '{}'::jsonb else coalesce((
    select jsonb_object_agg(strategy_id, pasos) from (
      select strategy_id,
        jsonb_agg(jsonb_build_object('key', stage, 'label', lbl, 'done', done, 'quien', quien, 'estado', estado) order by ord) as pasos
      from marc group by strategy_id
    ) q
  ), '{}'::jsonb) end;
$$;

commit;

notify pgrst, 'reload schema';
