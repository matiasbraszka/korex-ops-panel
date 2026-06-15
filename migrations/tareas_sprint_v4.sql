-- tareas_sprint_v4 — pantalla "Rendimiento" (feedback Matias 2026-06-15)
--   Sprint en vivo + historial. Aditivo.
ALTER TABLE public.sprints ADD COLUMN IF NOT EXISTS monday_call_url text;  -- link grabación lunes
ALTER TABLE public.sprints ADD COLUMN IF NOT EXISTS friday_call_url text;  -- link grabación viernes
ALTER TABLE public.sprints ADD COLUMN IF NOT EXISTS conclusion text;       -- conclusión de la semana
ALTER TABLE public.sprints ADD COLUMN IF NOT EXISTS worked_hours jsonb DEFAULT '{}'::jsonb; -- { memberId: horas trabajadas }
ALTER TABLE public.sprints ADD COLUMN IF NOT EXISTS summary jsonb;         -- snapshot del resumen al cerrar (para el historial)

ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS weekly_capacity numeric; -- horas que puede por semana
