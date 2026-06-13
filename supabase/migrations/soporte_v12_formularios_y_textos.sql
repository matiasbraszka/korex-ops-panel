-- soporte_v12: textos públicos y formulario configurable por calendario,
-- respuestas del lead en la cita, y helper de miembros con acceso a soporte.

alter table public.booking_calendars add column if not exists description text;
alter table public.booking_calendars add column if not exists host_name text;
alter table public.booking_calendars add column if not exists host_role text;
-- questions: [{id, label, type 'text'|'select', required, options[]}]
alter table public.booking_calendars add column if not exists questions jsonb;

alter table public.appointments add column if not exists answers jsonb;

-- Seed: los calendarios existentes heredan los textos de public_agenda y la
-- pregunta abierta que la página traía por defecto.
update public.booking_calendars bc
set
  description = coalesce(bc.description, s.value -> 'public_agenda' ->> 'description'),
  host_name = coalesce(bc.host_name, s.value -> 'public_agenda' ->> 'host_name'),
  host_role = coalesce(bc.host_role, s.value -> 'public_agenda' ->> 'host_role'),
  questions = coalesce(bc.questions, jsonb_build_array(jsonb_build_object(
    'id', 'q1', 'label', '¿Qué te gustaría resolver?', 'type', 'text', 'required', false, 'options', '[]'::jsonb
  )))
from app_settings s
where s.key = 'soporte_config';

-- Miembros del equipo con acceso al módulo soporte (o admins).
create or replace function public.korex_soporte_member_ids()
returns text[]
language sql
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct tm.id), '{}')
  from team_members tm
  join user_roles ur on ur.user_id = tm.user_id
  where ur.role = 'admin'
     or exists (
       select 1 from role_permissions rp
       where rp.role = ur.role
         and rp.module in ('*', 'soporte')
         and rp.can_read
     );
$$;

revoke all on function public.korex_soporte_member_ids() from public;
grant execute on function public.korex_soporte_member_ids() to authenticated;
