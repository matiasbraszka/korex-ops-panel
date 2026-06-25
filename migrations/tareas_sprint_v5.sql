-- tareas_sprint_v5 — DOD, criterios de aceptación, revisor/validación e historial de sprints.
--
-- 100% aditivo y nullable (mismo criterio que v1-v4): los datos actuales son su
-- propio backup. `definition_of_done` ya existe en la DB (columna huérfana sin
-- uso en código) → ADD IF NOT EXISTS es no-op, solo la "adoptamos".
--
-- Rollback (no debería hacer falta por ser aditivo):
--   ALTER TABLE public.tasks DROP COLUMN IF EXISTS acceptance_criteria;
--   ALTER TABLE public.tasks DROP COLUMN IF EXISTS reviewer;
--   ALTER TABLE public.tasks DROP COLUMN IF EXISTS validated_by;
--   ALTER TABLE public.tasks DROP COLUMN IF EXISTS validated_at;
--   ALTER TABLE public.tasks DROP COLUMN IF EXISTS sprint_history;

-- #5 Definición de hecho (DOD): texto libre. Reusa columna existente.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS definition_of_done  text;

-- #6 Criterios de aceptación: [{ "id": "...", "text": "...", "done": false }].
-- Lista nueva, separada del `checklist`/subtareas, para no gatear tareas vivas.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS acceptance_criteria jsonb DEFAULT '[]'::jsonb;

-- #10 Revisor (nombre del miembro, espejo de `assignee`) + auditoría de validación.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS reviewer            text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS validated_by        text;        -- team_members.id de quien validó
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS validated_at        timestamptz; -- cuándo se validó

-- #2 Historial de sprints: array de sprint_id por los que pasó la tarea. El
-- "lleva N sprints" se deriva (distinct). Aditivo y append-if-absent en código.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS sprint_history      jsonb DEFAULT '[]'::jsonb;
