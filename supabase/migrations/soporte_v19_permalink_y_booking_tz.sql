-- Link permanente por calendario (estilo GoHighLevel): un token inmutable que
-- NO cambia aunque se renombre el slug. El link por slug sigue siendo editable.
alter table booking_calendars add column if not exists public_token text;
update booking_calendars
  set public_token = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 20)
  where public_token is null;
alter table booking_calendars
  alter column public_token set default substr(md5(random()::text || clock_timestamp()::text), 1, 20);
alter table booking_calendars alter column public_token set not null;
create unique index if not exists booking_calendars_public_token_key on booking_calendars(public_token);

-- Zona horaria en la que el lead agendó (para que los recordatorios salgan en
-- SU zona, igual que la confirmación). Null en citas cargadas a mano.
alter table appointments add column if not exists booking_tz text;

-- RPC de metadatos públicos: ahora resuelve por token (link permanente) o por
-- slug (link editable). Reemplaza la versión de un solo argumento.
drop function if exists public.agenda_calendar_meta(text);
create or replace function public.agenda_calendar_meta(p_slug text default null, p_token text default null)
returns table(name text, description text)
language sql
stable
security definer
set search_path = public
as $$
  select name, description
  from booking_calendars
  where active = true
    and ( (p_token is not null and public_token = p_token)
       or (p_token is null and (p_slug is null or slug = p_slug)) )
  order by created_at asc
  limit 1
$$;
revoke all on function public.agenda_calendar_meta(text, text) from public;
grant execute on function public.agenda_calendar_meta(text, text) to anon, authenticated;
