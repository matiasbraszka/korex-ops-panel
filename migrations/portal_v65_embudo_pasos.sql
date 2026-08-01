-- ═════════════════════════════════════════════════════════════════════════════
-- portal_v65_embudo_pasos.sql
--
-- Expone al portal los PASOS del pipeline por funnel (los 5 del Kanban:
-- Estrategia · Avatares · VSL · Anuncios · Landing) con su estado, para dibujar
-- la barra segmentada ("todo lo que entregamos") y el timeline del embudo.
--
-- estado por paso: 'listo' (verde) · 'en_curso' (el primero sin terminar) ·
-- 'pendiente' (los que siguen).
-- ═════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.portal_cliente_embudo_pasos()
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select case when public.portal_cliente_client() is null then '{}'::jsonb else coalesce((
    select jsonb_object_agg(sid, pasos) from (
      select strategy_id as sid,
        jsonb_agg(jsonb_build_object('key', stage, 'label', lbl, 'done', done, 'estado', estado) order by ord) as pasos
      from (
        select cp.strategy_id, cp.stage, cp.ord, (cp.status = 'listo') as done,
          case cp.stage
            when 'estrategia' then 'Estrategia' when 'avatares' then 'Avatares'
            when 'vsl' then 'VSL' when 'anuncios' then 'Anuncios'
            when 'landing' then 'Landing' else cp.stage end as lbl,
          case when cp.status = 'listo' then 'listo'
               when cp.ord = min(cp.ord) filter (where cp.status <> 'listo') over (partition by cp.strategy_id)
                 then 'en_curso'
               else 'pendiente' end as estado
        from public.cerebro_pipeline_status(public.portal_cliente_client()) cp
      ) x
      group by strategy_id
    ) q
  ), '{}'::jsonb) end;
$$;

grant execute on function public.portal_cliente_embudo_pasos() to authenticated;

commit;

notify pgrst, 'reload schema';
