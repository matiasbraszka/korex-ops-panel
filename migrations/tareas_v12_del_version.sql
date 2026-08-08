-- migrations/tareas_v12_del_version.sql
--
-- Qué VERSIÓN del DEL se está trabajando en esta tarea.
--
-- La tarea ya guarda el funnel (tasks.funnel_id, tareas_sprint_v9). Pero un funnel
-- puede tener varias versiones de su DEL, y "rehacer la landing" de la V1 no es la
-- misma tarea que hacerla para la V2. Sin esto, el equipo abre el DEL y tiene que
-- adivinar en cuál estaba trabajando.
--
-- Es solo un número: no hay FK contra del_versions porque la versión existe desde
-- que hay una sección con ese número, aunque nadie le haya puesto título todavía.
-- NULL = la tarea no está atada a ninguna versión en particular (lo normal cuando
-- el funnel tiene una sola).
--
-- ADITIVA e INERTE: nada la lee hasta que el panel la muestre.

alter table public.tasks
  add column if not exists del_version int;

comment on column public.tasks.del_version is
  'Versión del DEL del funnel (tasks.funnel_id) que se está trabajando en esta tarea. '
  'NULL = sin versión concreta. Los datos de esa versión (título, nota, pasos) viven '
  'en del_versions, buscando por el del_doc_id del funnel.';

-- Si se cambia el funnel de una tarea, la versión vieja deja de tener sentido.
-- El panel ya la limpia, pero el guard evita que quede colgada si alguien escribe
-- por REST o por SQL. Se apoya en el mismo patrón del guard de funnel_id
-- (tareas_sprint_v9_funnel_id.sql:43-63): corrige en silencio, no explota.
create or replace function public.tasks_del_version_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  -- Sin funnel no puede haber versión.
  if new.funnel_id is null then
    new.del_version := null;
    return new;
  end if;
  -- Si cambió el funnel y nadie mandó una versión nueva en el mismo update, se limpia.
  if tg_op = 'UPDATE'
     and new.funnel_id is distinct from old.funnel_id
     and new.del_version is not distinct from old.del_version then
    new.del_version := null;
  end if;
  return new;
end
$function$;

drop trigger if exists tasks_del_version_guard_trg on public.tasks;
create trigger tasks_del_version_guard_trg
  before insert or update of funnel_id, del_version on public.tasks
  for each row execute function public.tasks_del_version_guard();

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   select count(*) filter (where del_version is not null) as con_version from public.tasks;
--
--   -- El guard: mover una tarea a otro funnel tiene que dejar del_version en null.
--   -- (probar dentro de un bloque que termine en `raise exception` para que revierta)
--
-- ROLLBACK:
--   drop trigger if exists tasks_del_version_guard_trg on public.tasks;
--   drop function if exists public.tasks_del_version_guard();
--   alter table public.tasks drop column if exists del_version;
