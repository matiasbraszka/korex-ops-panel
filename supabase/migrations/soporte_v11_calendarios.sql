-- soporte_v11_calendarios.sql
-- Sistema de calendarios de agenda (estilo Calendly):
--   * booking_calendars: tipos de evento reservables con link público propio
--     (/agendar/<slug>), color de Google Calendar, motivo y equipo involucrado.
--   * team_members gana email (cuenta Google, para invitar y leer su
--     libre/ocupado) y availability (franjas semanales por persona).
--   * appointments gana calendar_id + member_ids para saber a quién bloquea
--     cada cita.
-- Seeds: la disponibilidad global vieja pasa a la ficha de Matias y el
-- public_agenda existente se convierte en el calendario "demo".

create table if not exists public.booking_calendars (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  purpose text not null default 'ventas' check (purpose in ('ventas', 'servicio')),
  duration_min integer not null default 30,
  gcal_title_template text,
  gcal_color_id text, -- colorId oficial de Google Calendar ('1'-'11')
  member_ids text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.booking_calendars enable row level security;

drop policy if exists booking_calendars_select_authenticated on public.booking_calendars;
create policy booking_calendars_select_authenticated
  on public.booking_calendars for select to authenticated using (true);

drop policy if exists booking_calendars_admin_write on public.booking_calendars;
create policy booking_calendars_admin_write
  on public.booking_calendars for all to authenticated
  using (is_admin()) with check (is_admin());

alter table public.team_members add column if not exists email text;
alter table public.team_members add column if not exists availability jsonb;

alter table public.appointments add column if not exists calendar_id uuid references public.booking_calendars(id) on delete set null;
alter table public.appointments add column if not exists member_ids text[];

-- Seed 1: la disponibilidad global vieja (un from/to por día) pasa a la ficha
-- de Matias en el formato nuevo de franjas múltiples.
update public.team_members tm
set availability = (
  select jsonb_build_object('days', jsonb_object_agg(
    d.key,
    jsonb_build_object(
      'enabled', coalesce((d.value ->> 'enabled')::boolean, false),
      'ranges', case
        when coalesce((d.value ->> 'enabled')::boolean, false)
          then jsonb_build_array(jsonb_build_object('from', d.value ->> 'from', 'to', d.value ->> 'to'))
        else '[]'::jsonb
      end
    )
  ))
  from app_settings s,
       jsonb_each(s.value -> 'availability' -> 'days') as d
  where s.key = 'soporte_config'
)
where tm.id = 'matias'
  and tm.availability is null
  and exists (
    select 1 from app_settings s
    where s.key = 'soporte_config' and s.value -> 'availability' -> 'days' is not null
  );

-- Seed 2: calendario por defecto desde public_agenda (mantiene vivo /agendar).
insert into public.booking_calendars (slug, name, purpose, duration_min, gcal_title_template, gcal_color_id, member_ids, active)
select
  'demo',
  coalesce(s.value -> 'public_agenda' ->> 'title', 'Demo del sistema'),
  'ventas',
  coalesce((s.value -> 'availability' ->> 'slot_minutes')::integer, 60),
  coalesce(s.value -> 'public_agenda' ->> 'title', 'Demo del sistema') || ' — {nombre}',
  '7', -- Peacock (azul)
  array['matias'],
  true
from app_settings s
where s.key = 'soporte_config'
on conflict (slug) do nothing;
