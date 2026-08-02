-- vsl_custom_ranges.sql — "fecha libre" para el panel de VSL.
-- El panel encola un rango personalizado; el exportador diario (custom-ranges.mjs) lo trae de
-- Voomly y lo guarda en vsl_custom. Toda escritura pasa por RPCs SECURITY DEFINER (RLS está cerrado):
--   · panel  → vsl_range_request_add (encola)
--   · export → vsl_range_requests_pending / vsl_custom_ingest / vsl_range_request_done
-- El secreto es el mismo de siempre: app_settings.vsl_ingest_secret (VSL_INGEST_SECRET en .env).

-- Índice único para el upsert de vsl_custom (por si no lo tenía).
create unique index if not exists vsl_custom_uidx on public.vsl_custom (voomly_id, start_date, end_date);

-- Cola de rangos pedidos.
create table if not exists public.vsl_range_requests (
  id bigint generated always as identity primary key,
  start_date   date not null,
  end_date     date not null,
  status       text not null default 'pending',   -- pending | done | error
  requested_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  note         text,
  unique (start_date, end_date)
);
alter table public.vsl_range_requests enable row level security;

-- El panel encola un rango (o lo reactiva si había quedado en error). No depende de RLS.
create or replace function public.vsl_range_request_add(p_start date, p_end date)
returns text language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if p_start is null or p_end is null or p_end < p_start then return 'invalido'; end if;
  insert into public.vsl_range_requests (start_date, end_date)
    values (p_start, p_end)
    on conflict (start_date, end_date) do update
      set status = case when public.vsl_range_requests.status = 'error' then 'pending'
                        else public.vsl_range_requests.status end
    returning status into v_status;
  return v_status;
end $$;
grant execute on function public.vsl_range_request_add(date, date) to anon, authenticated;

-- El exportador lee lo pendiente (con secreto).
create or replace function public.vsl_range_requests_pending(p_secret text)
returns setof public.vsl_range_requests language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or p_secret <> (select value->>'secret' from public.app_settings where key = 'vsl_ingest_secret') then
    raise exception 'secreto invalido';
  end if;
  return query select * from public.vsl_range_requests where status = 'pending' order by requested_at limit 50;
end $$;
grant execute on function public.vsl_range_requests_pending(text) to anon, authenticated;

-- El exportador marca un rango como resuelto (o en error).
create or replace function public.vsl_range_request_done(p_secret text, p_id bigint, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or p_secret <> (select value->>'secret' from public.app_settings where key = 'vsl_ingest_secret') then
    raise exception 'secreto invalido';
  end if;
  update public.vsl_range_requests
    set status = coalesce(p_status, 'done'), fulfilled_at = now(), note = p_note
    where id = p_id;
end $$;
grant execute on function public.vsl_range_request_done(text, bigint, text, text) to anon, authenticated;

-- El exportador pide la lista de VSL (anon no tiene SELECT en vsl_voomly; con secreto sí).
create or replace function public.vsl_voomly_list(p_secret text)
returns table (voomly_id text, name text, duration numeric)
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or p_secret <> (select value->>'secret' from public.app_settings where key = 'vsl_ingest_secret') then
    raise exception 'secreto invalido';
  end if;
  return query select v.voomly_id, v.name, (v.retention->>'duration')::numeric from public.vsl_voomly v where v.kind = 'VSL';
end $$;
grant execute on function public.vsl_voomly_list(text) to anon, authenticated;

-- El exportador sube las métricas por VSL del rango pedido.
create or replace function public.vsl_custom_ingest(p_secret text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_secret text; v_count int;
begin
  select value->>'secret' into v_secret from public.app_settings where key = 'vsl_ingest_secret';
  if v_secret is null or p_secret is null or p_secret <> v_secret then raise exception 'secreto invalido'; end if;
  insert into public.vsl_custom (voomly_id, start_date, end_date, metrics)
  select (e->>'voomly_id')::text, (e->>'start_date')::date, (e->>'end_date')::date, (e->'metrics')
  from jsonb_array_elements(p_rows) e
  on conflict (voomly_id, start_date, end_date) do update set metrics = excluded.metrics;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
grant execute on function public.vsl_custom_ingest(text, jsonb) to anon, authenticated;
