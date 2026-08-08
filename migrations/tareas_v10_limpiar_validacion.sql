-- migrations/tareas_v10_limpiar_validacion.sql
--
-- La pestaña "Validación" de la tarea tenía tres bloques y nadie usaba dos.
-- Se sacaron de la ficha:
--   · "Motivo de revisión"   → tasks.review_reason
--   · "Definición de hecho"  → tasks.definition_of_done
-- y el tercero, "Criterios de aceptación" (tasks.acceptance_criteria), pasó a
-- llamarse "Cambios a realizar" y ocupa la pestaña entera. La columna NO cambia:
-- solo cambia la etiqueta en pantalla, así que las tareas viejas siguen igual y el
-- freno para validar (todos tildados) sigue funcionando.
--
-- NO se hace `drop column` a propósito:
--   1. La creación de public.tasks no está versionada en este repo (es previa), y
--      hay dos triggers vivos encima (notify_on_task_change, tasks_funnel_client_guard).
--   2. Si algún día alguien quiere recuperar lo que se escribió, el dato sigue ahí.
-- Se marcan como muertas con un comment para que la próxima persona no las reviva.
--
-- ADITIVA e INERTE: no borra ni modifica ninguna fila.

comment on column public.tasks.review_reason is
  'MUERTA desde 2026-08-08 (tareas_v10). Era "Motivo de revisión" en la ficha de la '
  'tarea; se sacó de la pantalla. El panel ya no la lee ni la escribe. No la uses en '
  'código nuevo: los datos viejos quedan solo como historia.';

comment on column public.tasks.definition_of_done is
  'MUERTA desde 2026-08-08 (tareas_v10). Era "Definición de hecho" en la ficha de la '
  'tarea; se sacó de la pantalla. El panel ya no la lee ni la escribe. No la uses en '
  'código nuevo: los datos viejos quedan solo como historia.';

comment on column public.tasks.acceptance_criteria is
  'Se muestra como "Cambios a realizar" en la ficha de la tarea (antes "Criterios de '
  'aceptación"). Forma: [{id, text, done}]. Mientras quede alguno sin tildar, la tarea '
  'no se puede marcar validada.';

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   select col_description('public.tasks'::regclass, ordinal_position)
--     from information_schema.columns
--    where table_schema='public' and table_name='tasks'
--      and column_name in ('review_reason','definition_of_done','acceptance_criteria');
--
--   -- Cuánto dato queda en las muertas (informativo):
--   select count(*) filter (where coalesce(btrim(review_reason),'') <> '')      as con_motivo,
--          count(*) filter (where coalesce(btrim(definition_of_done),'') <> '') as con_definicion
--     from public.tasks;
--
-- ROLLBACK: no hace falta — nada cambia de comportamiento en la base.
