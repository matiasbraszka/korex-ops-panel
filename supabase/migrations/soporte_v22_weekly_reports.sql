-- soporte_v22: detalle estructurado del informe semanal por cliente y ámbito.
-- Una fila por (cliente, ámbito, semana). data jsonb guarda: nuevas_preguntas,
-- sin_resolver, dudas, feedback, problemas_count, bugs_count, tiempo_respuesta,
-- score, label, resumen. Lo escribe la rutina semanal de análisis.

CREATE TABLE IF NOT EXISTS public.wa_weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text REFERENCES public.clients(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('usuarios','cliente_grupo','privado')),
  week_start date NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, scope, week_start)
);
CREATE INDEX IF NOT EXISTS idx_wa_weekly_reports ON public.wa_weekly_reports (week_start DESC, client_id);

ALTER TABLE public.wa_weekly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY wa_weekly_reports_read ON public.wa_weekly_reports
  FOR SELECT TO authenticated USING ((SELECT has_permission('soporte', '*', 'read')));
