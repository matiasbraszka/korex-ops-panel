-- Comentarios por bullet de informe del equipo.
-- Espejo de task_comments: hilos de 1 nivel, RLS abierto, CASCADE en parent y report.
-- bullet_id es un soft-link al id que vive en team_reports.progress_by_client[*].bullets[*].id
-- (no hay FK porque los bullets viven dentro de un jsonb).

CREATE TABLE IF NOT EXISTS public.report_bullet_comments (
  id          text PRIMARY KEY,
  report_id   text NOT NULL REFERENCES public.team_reports(id) ON DELETE CASCADE,
  bullet_id   text NOT NULL,
  parent_id   text REFERENCES public.report_bullet_comments(id) ON DELETE CASCADE,
  author_id   text NOT NULL,
  body        text NOT NULL,
  edited      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.report_bullet_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on report_bullet_comments" ON public.report_bullet_comments;
CREATE POLICY "Allow all on report_bullet_comments"
  ON public.report_bullet_comments FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS rbc_report_idx  ON public.report_bullet_comments(report_id);
CREATE INDEX IF NOT EXISTS rbc_bullet_idx  ON public.report_bullet_comments(bullet_id);
CREATE INDEX IF NOT EXISTS rbc_parent_idx  ON public.report_bullet_comments(parent_id);
CREATE INDEX IF NOT EXISTS rbc_created_idx ON public.report_bullet_comments(created_at);
