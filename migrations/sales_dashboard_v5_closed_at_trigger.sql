-- sales_dashboard_v5_closed_at_trigger
--
-- Unifica "cerrado" en una sola señal: cuando un lead pasa a una etapa con
-- bucket='cerrados', se setea automaticamente:
--   - closed_at = now()
--   - dias_de_cierre = dias entre created_at y closed_at (interno)
-- Y el dashboard cuenta esa plata como facturacion del mes en que cerro
-- (no del mes en que se creo el contacto).
--
-- Si el lead vuelve a salir de un stage cerrado (ej: alguien lo movio por
-- error), ambos campos se limpian para no contar facturacion incorrecta.

-- 1) Columna interna dias_de_cierre
alter table public.sales_leads
  add column if not exists dias_de_cierre int;

-- 2) Trigger que sincroniza closed_at + dias_de_cierre con el bucket de la etapa
create or replace function public.sales_leads_sync_closed_at()
returns trigger
language plpgsql
as $$
declare
  new_bucket text;
  old_bucket text;
begin
  -- Bucket de la etapa nueva
  if NEW.stage_id is not null then
    select coalesce(bucket, 'en_proceso') into new_bucket
    from public.sales_pipeline_stages where id = NEW.stage_id;
  end if;

  -- Bucket de la etapa anterior (solo en updates)
  if TG_OP = 'UPDATE' and OLD.stage_id is not null then
    select coalesce(bucket, 'en_proceso') into old_bucket
    from public.sales_pipeline_stages where id = OLD.stage_id;
  end if;

  -- Si entra a un stage cerrado y todavia no tiene closed_at, lo setea
  if new_bucket = 'cerrados' and NEW.closed_at is null then
    NEW.closed_at := now();
    NEW.dias_de_cierre := greatest(0, extract(day from (now() - NEW.created_at))::int);
  end if;

  -- Si sale de cerrado a otro bucket, limpia ambos campos
  if TG_OP = 'UPDATE'
     and old_bucket = 'cerrados'
     and (new_bucket is null or new_bucket <> 'cerrados') then
    NEW.closed_at := null;
    NEW.dias_de_cierre := null;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_sales_leads_sync_closed_at on public.sales_leads;
create trigger trg_sales_leads_sync_closed_at
  before insert or update of stage_id on public.sales_leads
  for each row execute function public.sales_leads_sync_closed_at();

-- 3) Backfill: leads que ya estan en una etapa cerrada pero sin closed_at,
--    asumimos que cerraron en su updated_at (mejor aproximacion disponible).
update public.sales_leads l
set closed_at = l.updated_at,
    dias_de_cierre = greatest(0, extract(day from (l.updated_at - l.created_at))::int)
from public.sales_pipeline_stages s
where l.stage_id = s.id
  and coalesce(s.bucket, 'en_proceso') = 'cerrados'
  and l.closed_at is null;

-- 4) RPC v5: revenue/won/avg_deal usan closed_at en lugar de client_id.
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
  select coalesce(array_agg(p.id), ARRAY[]::uuid[]) into visible
  from public.list_my_sales_pipelines() p;

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

  with discarded_stages as (
    select id from public.sales_pipeline_stages
    where coalesce(bucket, 'en_proceso') = 'descartados'
      and pipeline_id = any(visible)
      and (p_pipeline_id is null or pipeline_id = p_pipeline_id)
  ),
  -- Contactos del mes: leads creados en el rango (no cambia)
  leads_in as (
    select * from public.sales_leads
    where pipeline_id = any(visible)
      and (p_pipeline_id is null or pipeline_id = p_pipeline_id)
      and created_at >= range_start
  ),
  -- Cerrados del mes: leads cuyo closed_at cae en el rango
  leads_closed as (
    select * from public.sales_leads
    where pipeline_id = any(visible)
      and (p_pipeline_id is null or pipeline_id = p_pipeline_id)
      and closed_at is not null
      and closed_at >= range_start
  ),
  -- Cerrados del mes anterior (para deltas)
  leads_closed_prev as (
    select * from public.sales_leads
    where pipeline_id = any(visible)
      and (p_pipeline_id is null or pipeline_id = p_pipeline_id)
      and closed_at is not null
      and prev_start is not null
      and closed_at >= prev_start and closed_at < prev_end
  ),
  -- Pipeline abierto = sin closed_at y sin estar en descartados
  leads_open as (
    select * from public.sales_leads
    where pipeline_id = any(visible)
      and (p_pipeline_id is null or pipeline_id = p_pipeline_id)
      and closed_at is null
      and (stage_id is null or stage_id not in (select id from discarded_stages))
  ),
  -- Mes anterior para deltas de contactos/proposals
  leads_prev as (
    select * from public.sales_leads
    where pipeline_id = any(visible)
      and (p_pipeline_id is null or pipeline_id = p_pipeline_id)
      and prev_start is not null
      and created_at >= prev_start and created_at < prev_end
  ),
  per_owner as (
    select coalesce(c.owner_id, p.owner_id, op.owner_id) as owner_id,
      coalesce(c.contacts, 0)::int as contacts,
      coalesce(p.proposals, 0)::int as proposals,
      coalesce(cl.won, 0)::int as won,
      coalesce(cl.revenue, 0)::numeric as revenue,
      coalesce(op.pipeline, 0)::numeric as pipeline,
      coalesce(cl.avg_deal, 0)::numeric as avg_deal,
      coalesce(cl.avg_dias_cierre, 0)::numeric as avg_dias_cierre
    from
      (select owner_id, count(*)::int as contacts from leads_in group by owner_id) c
      full outer join (
        select owner_id, count(*) filter (where proposal is not null and length(trim(proposal)) > 0)::int as proposals
        from leads_in group by owner_id
      ) p using (owner_id)
      full outer join (
        select owner_id,
          count(*)::int as won,
          coalesce(sum(estimated_value), 0)::numeric as revenue,
          coalesce(avg(estimated_value), 0)::numeric as avg_deal,
          coalesce(avg(dias_de_cierre), 0)::numeric as avg_dias_cierre
        from leads_closed group by owner_id
      ) cl using (owner_id)
      full outer join (
        select owner_id, coalesce(sum(estimated_value), 0)::numeric as pipeline
        from leads_open group by owner_id
      ) op using (owner_id)
  ),
  per_owner_prev as (
    select coalesce(c.owner_id, cp.owner_id) as owner_id,
      coalesce(c.contacts_prev, 0)::int as contacts_prev,
      coalesce(cp.won_prev, 0)::int as won_prev,
      coalesce(c.proposals_prev, 0)::int as proposals_prev,
      coalesce(cp.revenue_prev, 0)::numeric as revenue_prev
    from
      (select owner_id,
              count(*)::int as contacts_prev,
              count(*) filter (where proposal is not null and length(trim(proposal)) > 0)::int as proposals_prev
       from leads_prev group by owner_id) c
      full outer join (
        select owner_id,
          count(*)::int as won_prev,
          coalesce(sum(estimated_value), 0)::numeric as revenue_prev
        from leads_closed_prev group by owner_id
      ) cp using (owner_id)
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
  funnel_per_stage as (
    select s.id as stage_id, s.name, s.color, s.position, s.pipeline_id,
      coalesce(s.bucket, 'en_proceso') as bucket,
      count(l.id)::int as cnt,
      coalesce(sum(l.estimated_value), 0)::numeric as amount
    from public.sales_pipeline_stages s
    left join leads_open l on l.stage_id = s.id
    where s.pipeline_id = any(visible)
      and (p_pipeline_id is null or s.pipeline_id = p_pipeline_id)
      and coalesce(s.bucket, 'en_proceso') <> 'descartados'
    group by s.id, s.name, s.color, s.position, s.pipeline_id, s.bucket
  ),
  funnel_specific as (
    select 0 as bucket_idx,
           name, color, position::int as position,
           sum(cnt)::int as cnt,
           sum(amount)::numeric as amount
    from funnel_per_stage
    where p_pipeline_id is not null
    group by name, color, position
  ),
  funnel_buckets as (
    select bucket,
      sum(cnt)::int as cnt,
      sum(amount)::numeric as amount
    from funnel_per_stage
    where p_pipeline_id is null
    group by bucket
  ),
  funnel_buckets_named as (
    select
      case bucket
        when 'inicial'    then 1
        when 'en_proceso' then 2
        when 'por_cerrar' then 3
        when 'cerrados'   then 4
        else 2
      end as bucket_idx,
      case bucket
        when 'inicial'    then 'Inicial'
        when 'en_proceso' then 'En proceso'
        when 'por_cerrar' then 'Por cerrar'
        when 'cerrados'   then 'Cerrados'
        else 'En proceso'
      end as name,
      case bucket
        when 'inicial'    then '#9CA3AF'
        when 'en_proceso' then '#EAB308'
        when 'por_cerrar' then '#F97316'
        when 'cerrados'   then '#22C55E'
        else '#9CA3AF'
      end as color,
      case bucket
        when 'inicial'    then 1
        when 'en_proceso' then 2
        when 'por_cerrar' then 3
        when 'cerrados'   then 4
        else 2
      end as position,
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
