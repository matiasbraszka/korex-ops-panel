-- migrations/team_members_department.sql
-- Área (department) por persona: vincula cada miembro del equipo con su área
-- (ventas / marketing / programacion / operaciones, las claves de DEPARTMENTS).
-- Se usa para AUTOCOMPLETAR el área de una tarea según su responsable (editable
-- a mano; nunca queda en blanco). Editable desde Administración › Equipo.
-- Aditiva. Se aplica VIVA en Supabase.

alter table public.team_members add column if not exists department text;

-- Mapa inicial (definido por Matías 2026-07-05). Los no listados quedan null y
-- se completan desde Administración.
update public.team_members set department = 'programacion' where id = 'marcos';
update public.team_members set department = 'marketing'    where id in ('josem','david','maria','zerillos');
update public.team_members set department = 'ventas'       where id = 'cristian';
update public.team_members set department = 'operaciones'  where id in ('matias','zil','sioux-carrera','viviana');

-- Backfill: tareas SIN área heredan la del responsable (solo las que están en
-- blanco; las manuales no se tocan). Cambiar solo `department` no dispara el
-- trigger de notificaciones (el responsable no cambia).
--   update public.tasks t set department = tm.department
--   from public.team_members tm
--   where (t.department is null or t.department = '') and tm.department is not null
--     and (lower(tm.name) = lower(trim(t.assignee))
--          or lower(split_part(tm.name,' ',1)) = lower(trim(t.assignee)));
