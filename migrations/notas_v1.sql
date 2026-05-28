-- Notas v1
-- Tabla para la nueva pestaña "Notas" del modulo Accountability.
-- Cada nota tiene autor, asignado opcional, lista de usuarios con los que se
-- comparte, tags libres y body en HTML sanitizado (DOMPurify en frontend).
-- RLS abierta a proposito (igual que ideas/team_reports); la visibilidad se
-- filtra en el frontend por author/assignee/share_with/admin.

CREATE TABLE IF NOT EXISTS public.notas (
  id              text PRIMARY KEY,
  title           text NOT NULL,
  body_html       text NOT NULL DEFAULT '',
  tags            text[] NOT NULL DEFAULT ARRAY[]::text[],
  author_id       text NOT NULL,
  assignee_id     text,
  share_with_ids  text[] NOT NULL DEFAULT ARRAY[]::text[],
  pinned          boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on notas" ON public.notas;
CREATE POLICY "Allow all on notas" ON public.notas FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS notas_author_idx   ON public.notas(author_id);
CREATE INDEX IF NOT EXISTS notas_assignee_idx ON public.notas(assignee_id);
CREATE INDEX IF NOT EXISTS notas_updated_idx  ON public.notas(updated_at DESC);
