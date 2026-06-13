-- soporte_v15: el "motivo" deja de ser fijo (ventas/servicio) y pasa a ser una
-- etiqueta personalizable (texto libre + color). El anfitrión se elige de un
-- miembro del equipo (su nombre y FOTO se muestran en la página pública).

alter table public.booking_calendars drop constraint if exists booking_calendars_purpose_check;
alter table public.booking_calendars alter column purpose drop default;
alter table public.booking_calendars add column if not exists purpose_color text;
alter table public.booking_calendars add column if not exists host_member_id text references public.team_members(id) on delete set null;

update public.booking_calendars
set purpose_color = case when purpose = 'servicio' then 'indigo' else 'amber' end
where purpose_color is null;

update public.booking_calendars set purpose = initcap(purpose)
where purpose in ('ventas', 'servicio');

update public.booking_calendars bc
set host_member_id = tm.id
from public.team_members tm
where bc.host_member_id is null and bc.host_name is not null
  and lower(tm.name) = lower(bc.host_name);
