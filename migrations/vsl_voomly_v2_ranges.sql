-- vsl_voomly_v2 — agrega columna `ranges` (jsonb) con las métricas + retención
-- por rango de fechas (all / 90d / 30d / 7d / today) para los VSL. Aditiva.
-- Cada clave de `ranges` tiene: total_plays, uniq_plays, total_views, uniq_views,
-- play_rate, engagement, completion, retention{duration,viewers,watchers,points}.
-- Rollback: ALTER TABLE public.vsl_voomly DROP COLUMN IF EXISTS ranges;
ALTER TABLE public.vsl_voomly ADD COLUMN IF NOT EXISTS ranges jsonb;
