-- tareas_sprint_v6 — backfill del tiempo por SPRINT anterior (bug reportado por Mati).
--
-- Síntoma: una tarea que pasó por 2 sprints (sprint_history) mostraba "lleva 2
-- sprints" pero el tiempo del sprint ANTERIOR salía en 0. Causa: computeSprintDurations
-- mide el tiempo con `sprint_events` (log con fecha `{sprint, at}`), y ese log
-- empezó a registrarse recién (~2026-07-05). Los sprints en los que la tarea ya
-- estaba ANTES de esa fecha quedaron solo en `sprint_history` (sin fecha) → sin
-- tiempo medible. El código YA registra sprint_events bien de acá en adelante
-- (incluye el carry-over al cerrar sprint); esto solo arregla lo histórico.
--
-- Fix (DATA-ONLY, ya aplicado a producción vía MCP — no requiere deploy de código):
--   1) Se quitan status_since / time_in_status: fueron un intento redundante; el
--      mecanismo statusHistory/sprintEvents (de otra sesión, ya en main) lo cubre.
--   2) Por cada sprint en sprint_history que NO tenga evento con fecha, se agrega
--      {sprint, at = start_date del sprint} para que el tramo anterior se mida.

ALTER TABLE public.tasks DROP COLUMN IF EXISTS status_since;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS time_in_status;

WITH sp AS (SELECT id, start_date FROM public.sprints),
add_ev AS (
  SELECT t.id AS task_id,
    jsonb_agg(jsonb_build_object('sprint', h.sid, 'at', to_char(s.start_date,'YYYY-MM-DD')||'T00:00:00Z')) AS evs
  FROM public.tasks t
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(t.sprint_history,'[]'::jsonb)) AS h(sid)
  JOIN sp s ON s.id = h.sid
  WHERE t.status <> 'done'
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(t.sprint_events,'[]'::jsonb)) e WHERE e->>'sprint' = h.sid)
  GROUP BY t.id
)
UPDATE public.tasks t
SET sprint_events = COALESCE(t.sprint_events,'[]'::jsonb) || a.evs
FROM add_ev a
WHERE t.id = a.task_id;
