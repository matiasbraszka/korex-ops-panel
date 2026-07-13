-- migrations/tareas_sprint_v8_created_by.sql
-- created_by: quién CREÓ la tarea (id de team_members, texto). A diferencia de
-- last_actor_id ("quién la tocó por última vez"), created_by es estable: se setea
-- al crear la tarea y no cambia al editarla.
--
-- Habilita la visibilidad ACOTADA para usuarios no-admin del Tablero Sprint /
-- Objetivos: cada persona ve SUS tareas (responsable) + las que ELLA creó (aunque
-- sean de otro) + las que REVISA (es el revisor). Así cualquiera puede crear tareas
-- para el equipo y meterlas al sprint sin perderlas de vista, y un revisor puede
-- abrir y modificar la tarea de la otra persona en cualquier momento.
--
-- Aditiva e idempotente. Se aplica VIVA en Supabase (no en main). Las tareas
-- previas quedan con created_by NULL (sus responsables las siguen viendo por
-- responsable; el admin ve todas).

alter table public.tasks
  add column if not exists created_by text;
