-- tareas_sprint_v6_status_history
-- Historial de cambios de estado por tarea, DESACOPLADO del feed de comentarios
-- (Matías dejó los comentarios solo para personas; los cambios de estado ya no
-- se registran como entradas kind='system' ni notifican). Este array append-only
-- de { status, at } guarda CUÁNDO entró la tarea a cada estado y lo usa el panel
-- "Tiempo por estado" para calcular el tiempo real por etapa.
--
-- Aditivo, NOT NULL con default '[]' → no rompe el código actual (que ni lo lee
-- ni lo escribe). Las tareas viejas quedan con historial vacío y empiezan a
-- registrar desde su próximo cambio de estado.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]'::jsonb;
