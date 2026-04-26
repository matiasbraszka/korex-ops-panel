-- sales_dashboard_v2_pipeline_filter
--
-- Cambia la firma de sales_dashboard_metrics para aceptar p_pipeline_id (uuid,
-- nullable). Si esta seteado, todo se filtra a ese pipeline y el funnel devuelve
-- las etapas reales de ese pipeline. Si es null, mantiene comportamiento global
-- pero el funnel se agrupa por "bucket" universal (Inicial / En proceso /
-- Por cerrar / Cerrados) para que pipelines con stages distintos sumen bien.
--
-- Compatible con llamadas anteriores: el front nuevo pasa siempre los 2 args.

drop function if exists public.sales_dashboard_metrics(text);
drop function if exists public.sales_dashboard_metrics(text, uuid);

create or replace function public.sales_dashboard_metrics(
  p_range text default 'month',
  p_pipeline_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  visible uuid[];
  range_start timestamptz;
  prev_start timestamptz; prev_end timestamptz;
  result jsonb;
  cur_year int := extract(year from now())::int;
  cur_month int := extract(month from now())::int;
begin
  -- Pipelines visibles (RLS-aware)
  select coalesce(array_agg(p.id), ARRAY[]::uuid[]) into visible
  from public.list_my_sales_pipelines() p;

  -- Si nos piden un pipeline especifico, validamos que el caller lo pueda ver.
  if p_pipeline_id is not null and not (p_pipeline_id = any(visible)) then
    return jsonb_build_object('error', 'pipeline_no_visible');
  end if;

  if p_range = 'month' then
    range_start := date_trunc('month', now());
    prev_start  := date_trunc('month', now() - interval '1 month');
    prev_end    := range_start;
  else
    range_start := '-infinity'::timestamptz;
    prev_start  := null; prev_end := null;
  end if;

  with leads_in as (
    select * from public.sales_leads
    where pipeline_id = any(visible)
      and (p_pipeline_id is null or pipeline_id = p_pipeline_id)
      and created_at >= range_start
  ),
  leads_open as (
    select * from public.sales_leads
    where pipeline_id = any(visible)
      and (p_pipeline_id is null or pipeline_id = p_pipeline_id)
      and client_id is null
  ),
  leads_prev as (
    select * from public.sales_leads
    where pipeline_id = any(visible)
      and (p_pipeline_id is null or pipeline_id = p_pipeline_id)
      and prev_start is not null
      and created_at >= prev_start and created_at < prev_end
  ),
  per_owner as (
    select owner_id,
      count(*)::int as contacts,
      count(*) filter (where proposal is not null and length(trim(proposal)) > 0)::int as proposals,
      count(*) filter (where client_id is not null)::int as won,
      coalesce(sum(estimated_value) filter (where client_id is not null), 0)::numeric as revenue,
      coalesce(sum(estimated_value) filter (where client_id is null), 0)::numeric as pipeline,
      coalesce(avg(estimated_value) filter (where client_id is not null), 0)::numeric as avg_deal
    from leads_in group by owner_id
  ),
  per_owner_prev as (
    select owner_id,
      count(*)::int as contacts_prev,
      count(*) filter (where client_id is not null)::int as won_prev,
      count(*) filter (where proposal is not null and length(trim(proposal)) > 0)::int as proposals_prev,
      coalesce(sum(estimated_value) filter (where client_id is not null), 0)::numeric as revenue_prev
    from leads_prev group by owner_id
  ),
  per_owner_calls as (
    select l.owner_id, count(distinct ll.id)::int as calls
    from public.llamadas ll
    join public.sales_leads l on l.id = ll.lead_id or l.contact_id = ll.contact_id
    where l.pipeline_id = any(visible)
      and (p_pipeline_id is null or l.pipeline_id = p_pipeline_id)
      and (range_start = '-infinity'::timestamptz or coalesce(ll.fecha, ll.created_at) >= range_start)
    group by l.owner_id
  ),
  -- Para el funnel necesitamos el max(position) por pipeline para calcular el
  -- bucket relativo. Lo pre-computamos.
  pipeline_max_pos as (
    select pipeline_id, max(position) as max_pos, count(*) as total_stages
    from public.sales_pipeline_stages
    where pipeline_id = any(visible)
      and (p_pipeline_id is null or pipeline_id = p_pipeline_id)
    group by pipeline_id
  ),
  funnel_per_stage as (
    select s.id as stage_id, s.name, s.color, s.position, s.pipeline_id,
      count(l.id)::int as cnt,
      coalesce(sum(l.estimated_value), 0)::numeric as amount,
      pmp.max_pos
    from public.sales_pipeline_stages s
    left join leads_open l on l.stage_id = s.id
    join pipeline_max_pos pmp on pmp.pipeline_id = s.pipeline_id
    group by s.id, s.name, s.color, s.position, s.pipeline_id, pmp.max_pos
  ),
  funnel_specific as (
    -- Cuando hay pipeline filtrado: devolvemos las etapas reales de ese pipeline.
    select 0 as bucket_idx,
           name, color, position::int as position,
           sum(cnt)::int as cnt,
           sum(amount)::numeric as amount
    from funnel_per_stage
    where p_pipeline_id is not null
    group by name, color, position
  ),
  funnel_buckets as (
    -- Cuando no hay filtro: bucketeamos por posicion relativa.
    -- 4 buckets fijos: Inicial / En proceso / Por cerrar / Cerrados (ultima etapa).
    select
      case
        when position = max_pos then 4 -- Cerrados (ultima etapa, valor 1.0)
        when max_pos = 0 then 4
        when (position::float / max_pos) < 0.34 then 1 -- Inicial
        when (position::float / max_pos) < 0.67 then 2 -- En proceso
        else 3 -- Por cerrar
      end as bucket_idx,
      sum(cnt)::int as cnt,
      sum(amount)::numeric as amount
    from funnel_per_stage
    where p_pipeline_id is null
    group by 1
  ),
  funnel_buckets_named as (
    select
      bucket_idx,
      case bucket_idx
        when 1 then 'Inicial'
        when 2 then 'En proceso'
        when 3 then 'Por cerrar'
        when 4 then 'Cerrados'
      end as name,
      case bucket_idx
        when 1 then '#9CA3AF'
        when 2 then '#EAB308'
        when 3 then '#F97316'
        when 4 then '#22C55E'
      end as color,
      bucket_idx as position,
      cnt, amount
    from funnel_buckets
  ),
  funnel_final as (
    select bucket_idx, name, color, position, cnt, amount from funnel_specific
    union all
    select bucket_idx, name, color, position, cnt, amount from funnel_buckets_named
  ),
  heat as (
    select coalesce(score, 0)::int as score,
      count(*)::int as cnt,
      coalesce(sum(estimated_value), 0)::numeric as amount
    from leads_open
    group by coalesce(score, 0)
  ),
  spark as (
    select to_char(date_trunc(case when p_range='month' then 'day' else 'month' end, created_at),
                   case when p_range='month' then 'YYYY-MM-DD' else 'YYYY-MM' end) as bucket,
           owner_id,
           count(*)::int as v
    from leads_in group by 1, owner_id
  )
  select jsonb_build_object(
    'range', p_range,
    'pipeline_id', p_pipeline_id,
    'generated_at', now(),
    'visible_pipelines', visible,
    'per_owner', coalesce((select jsonb_agg(to_jsonb(po)) from per_owner po), '[]'::jsonb),
    'per_owner_prev', coalesce((select jsonb_agg(to_jsonb(p)) from per_owner_prev p), '[]'::jsonb),
    'per_owner_calls', coalesce((select jsonb_agg(to_jsonb(c)) from per_owner_calls c), '[]'::jsonb),
    'funnel', coalesce((select jsonb_agg(to_jsonb(f) order by f.position) from funnel_final f), '[]'::jsonb),
    'heat', coalesce((select jsonb_agg(to_jsonb(h)) from heat h), '[]'::jsonb),
    'spark', coalesce((select jsonb_agg(to_jsonb(s)) from spark s), '[]'::jsonb),
    'targets', coalesce((
      select jsonb_object_agg(user_id::text, target_usd)
      from public.sales_targets
      where year = cur_year and month = cur_month
    ), '{}'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.sales_dashboard_metrics(text, uuid) to authenticated;
