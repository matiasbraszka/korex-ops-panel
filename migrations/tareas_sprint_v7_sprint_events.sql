-- migrations/tareas_sprint_v7_sprint_events.sql
-- Tracking "paso por sprints": registra CUÁNDO entró (y salió de) cada sprint una
-- tarea, para medir el tiempo real por sprint en el panel Actividad de la ficha.
--
-- Aditiva y calcada del patrón ya validado `status_history` (v6): un log
-- append-only jsonb `[{ "sprint": "sp_2026_28"|null, "at": "ISO" }]`. Una entrada
-- con "sprint": null marca que la tarea SALIÓ del sprint (cierra el segmento sin
-- sumar tiempo).
--
-- NO se toca `sprint_history` (que sigue alimentando el "lleva N sprints"): así el
-- código de otras ramas-isla no se rompe. Se aplica VIVA en Supabase. Idempotente.

alter table public.tasks
  add column if not exists sprint_events jsonb not null default '[]'::jsonb;

-- Nota: los sprints futuros pre-abiertos usan status = 'planned' (además de
-- 'active' / 'closed'). La columna sprints.status es text sin CHECK, así que el
-- valor nuevo es aditivo y no requiere cambios de esquema.
