-- reuniones_equipo v1 — Reportes accionables de reuniones de equipo
--
-- Suma lo necesario para que las llamadas de "equipo" (subtipo marketing/socios/
-- programacion/abogada/equipo) generen un reporte por persona, se enganchen con el
-- sprint (subtarea o comentario) y se posteen al canal de Slack del grupo.
--
-- Es aditivo e idempotente: no toca datos ni flujos existentes.

-- 1) Slack ID por miembro del equipo (para mandar DMs). Ej: 'U0123ABCD'.
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS slack_id text;

-- 2) Campos de reporte en llamadas.
ALTER TABLE public.llamadas
  ADD COLUMN IF NOT EXISTS equipo_subtipo   text,                       -- marketing|socios|programacion|abogada|equipo (null si no es de equipo)
  ADD COLUMN IF NOT EXISTS reporte_status   text NOT NULL DEFAULT 'none', -- none|draft|sent
  ADD COLUMN IF NOT EXISTS reporte_payload  jsonb,                      -- borrador editable (por-persona + post de canal)
  ADD COLUMN IF NOT EXISTS reporte_sent_at  timestamptz;

-- 3) Config de reuniones de equipo: mapa grupo -> canal de Slack + miembros sugeridos.
--    Solo se inserta si no existe (no pisa configuracion ya cargada).
--    Los 'channel' arrancan vacios: se completan desde Settings con el ID del canal.
INSERT INTO public.app_settings (key, value)
VALUES (
  'reuniones_config',
  '{
    "grupos": {
      "marketing":    { "channel": "", "members": ["josem", "maria", "zerillos", "david"] },
      "socios":       { "channel": "", "members": ["matias", "cristian", "marcos"] },
      "programacion": { "channel": "", "members": ["marcos", "christian", "mikel-zabala"] },
      "abogada":      { "channel": "", "members": ["sioux-carrera"] },
      "equipo":       { "channel": "", "members": [] }
    }
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
