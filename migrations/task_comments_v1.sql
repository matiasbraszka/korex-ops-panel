-- task_comments v1 — comentarios y respuestas en tareas
--
-- Modelo: cada tarea puede tener N comentarios raiz (parent_id NULL) y cada
-- raiz puede tener N respuestas (parent_id = id de la raiz). La anidacion
-- mas profunda no se permite desde el frontend para que el hilo se mantenga
-- legible (estilo Slack).
--
-- CASCADE:
--   - Si se borra la tarea -> se borran sus comentarios.
--   - Si se borra un comentario raiz -> se borran sus respuestas.
--
-- RLS: abierto como notas/ideas. El panel es trusted; permisos se chequean
-- en frontend (autor o admin).

CREATE TABLE IF NOT EXISTS public.task_comments (
  id          text PRIMARY KEY,
  task_id     text NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  parent_id   text REFERENCES public.task_comments(id) ON DELETE CASCADE,
  author_id   text NOT NULL,
  body        text NOT NULL,
  edited      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on task_comments" ON public.task_comments;
CREATE POLICY "Allow all on task_comments"
  ON public.task_comments FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS task_comments_task_idx    ON public.task_comments(task_id);
CREATE INDEX IF NOT EXISTS task_comments_parent_idx  ON public.task_comments(parent_id);
CREATE INDEX IF NOT EXISTS task_comments_created_idx ON public.task_comments(created_at);
