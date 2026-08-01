-- ═════════════════════════════════════════════════════════════════════════════
-- portal_v66_pasos_responsable.sql
--
-- Los pasos del embudo ahora dicen DE QUIÉN depende cada uno (para pintar la barra
-- por responsabilidad, no todo verde):
--   'hecho'   → entregado (verde)
--   'cliente' → falta que el cliente entregue su parte (rojo) — por esto se demora
--   'korex'   → lo estamos haciendo nosotros (gris)
--
-- Se deriva del substate del pipeline (mismo motor del Kanban):
--   vsl/anuncios substate 'guion' = guionado, falta que el cliente GRABE  → cliente
--   vsl/anuncios substate 'grabado' = grabado, falta que Korex EDITE       → korex
--   landing sin diseñar + el cliente adeuda material (imágenes/branding)   → cliente
--   el resto sin terminar                                                  → korex
-- ═════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.portal_cliente_embudo_pasos()
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with cid as (select public.portal_cliente_client() as v),
  av as (select sid, mat_pend from public._portal_avance_funnel((select v from cid))),
  base as (
    select cp.strategy_id, cp.stage, cp.ord, cp.substate, (cp.status = 'listo') as done,
           coalesce(a.mat_pend, false) as mat_pend
    from public.cerebro_pipeline_status((select v from cid)) cp
    left join av a on a.sid = cp.strategy_id
  ),
  marc as (
    select b.*,
      case b.stage when 'estrategia' then 'Estrategia' when 'avatares' then 'Avatares'
                   when 'vsl' then 'VSL' when 'anuncios' then 'Anuncios'
                   when 'landing' then 'Landing' else b.stage end as lbl,
      case
        when b.done then 'hecho'
        when b.stage in ('vsl','anuncios') and b.substate = 'guion' then 'cliente'
        when b.stage = 'landing' and b.mat_pend then 'cliente'
        else 'korex'
      end as quien,
      case when b.done then 'listo'
           when b.ord = min(b.ord) filter (where not b.done) over (partition by b.strategy_id) then 'en_curso'
           else 'pendiente' end as estado
    from base b
  )
  select case when (select v from cid) is null then '{}'::jsonb else coalesce((
    select jsonb_object_agg(strategy_id, pasos) from (
      select strategy_id,
        jsonb_agg(jsonb_build_object(
          'key', stage, 'label', lbl, 'done', done, 'quien', quien, 'estado', estado
        ) order by ord) as pasos
      from marc group by strategy_id
    ) q
  ), '{}'::jsonb) end;
$$;

grant execute on function public.portal_cliente_embudo_pasos() to authenticated;

commit;

notify pgrst, 'reload schema';
