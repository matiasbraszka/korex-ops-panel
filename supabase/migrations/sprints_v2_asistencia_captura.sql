-- Rendimiento del sprint: asistencia a las dailys (manual, 5/semana) y captura
-- del estado de las tareas al cerrar el sprint. Aplicado en vivo 2026-06-28.
alter table public.sprints
  add column if not exists daily_attendance jsonb not null default '{}'::jsonb,
  add column if not exists close_screenshot_url text;

comment on column public.sprints.daily_attendance is 'Asistencia a dailys por persona: { memberId: [lun,mar,mie,jue,vie] booleans }';
comment on column public.sprints.close_screenshot_url is 'Captura del estado de las tareas al cerrar el sprint (prueba).';
