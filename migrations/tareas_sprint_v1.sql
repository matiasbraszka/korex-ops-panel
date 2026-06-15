-- tareas_sprint_v1 — modelo de Sprint (Kanban ágil) para la sección Tareas
--
-- Objetivo: introducir el concepto de "sprint" (semana de trabajo del equipo)
-- como capa ADITIVA encima del modelo de tareas actual, sin romper nada.
--
-- Reglas de seguridad (acordadas con Matías):
--   • 100% aditivo: una tabla nueva (sprints) + columnas NULLABLE en tasks.
--     Nada destructivo → los datos actuales son su propio backup.
--   • "Validado" = el estado `done` de siempre (solo cambia la etiqueta en el
--     tablero). NO se toca el set de estados terminales ni korex_task_available,
--     así informes/dashboard/notificaciones siguen contando `done` igual.
--   • El estado nuevo `priorizado` NO es terminal (es "disponible"), por lo que
--     korex_task_available lo trata bien sin cambios.
--
-- Rollback (si se quisiera volver atrás — no debería hacer falta por ser aditivo):
--   UPDATE public.tasks SET status='backlog' WHERE status='priorizado';
--   ALTER TABLE public.tasks DROP COLUMN IF EXISTS sprint_id;
--   ALTER TABLE public.tasks DROP COLUMN IF EXISTS sprint_priority;
--   ALTER TABLE public.tasks DROP COLUMN IF EXISTS checklist;
--   DROP TABLE IF EXISTS public.sprints;

-- ── Tabla sprints ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sprints (
  id         text PRIMARY KEY,                 -- 'sp_<numero>' (ej "sp_2026_24")
  number     int,                              -- número de semana del año
  name       text,                             -- "Sprint 24"
  start_date date,                             -- lunes
  end_date   date,                             -- domingo
  goal       text,                             -- objetivo del sprint (opcional)
  status     text NOT NULL DEFAULT 'active',   -- 'active' | 'closed'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on sprints" ON public.sprints;
CREATE POLICY "Allow all on sprints"
  ON public.sprints FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.sprints TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS sprints_status_idx ON public.sprints(status);

-- Realtime: que altas/cambios de sprint lleguen al panel al instante.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sprints'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sprints;
  END IF;
END $$;

-- ── Columnas nuevas en tasks (todas nullable / con default) ──────────────────
-- sprint_id NULL = la tarea está solo en Objetivos (no entró a ningún sprint).
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS sprint_id text
  REFERENCES public.sprints(id) ON DELETE SET NULL;
-- prioridad dentro del sprint (badge 1-5 en la columna Priorizado).
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS sprint_priority int;
-- checklist / subtareas: [{ "id": "...", "text": "...", "done": false }]
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS checklist jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS tasks_sprint_idx ON public.tasks(sprint_id);

-- ── Seed: sprint activo de la semana en curso (zona Buenos Aires) ────────────
-- Lunes..Domingo de esta semana. id estable 'sp_<año>_<semana ISO>'.
DO $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_monday date := date_trunc('week', v_today)::date;          -- date_trunc('week') = lunes
  v_sunday date := v_monday + 6;
  v_week   int  := EXTRACT(week FROM v_monday)::int;
  v_year   int  := EXTRACT(isoyear FROM v_monday)::int;
  v_id     text := 'sp_' || v_year || '_' || lpad(v_week::text, 2, '0');
BEGIN
  -- Solo sembrar si no hay ningún sprint todavía (idempotente).
  IF NOT EXISTS (SELECT 1 FROM public.sprints) THEN
    INSERT INTO public.sprints (id, number, name, start_date, end_date, goal, status)
    VALUES (v_id, v_week, 'Sprint ' || v_week, v_monday, v_sunday, NULL, 'active')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
