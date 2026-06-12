-- soporte_v7: participantes de grupos (quién es quién) + plantillas de
-- respuestas rápidas + disponibilidad (para el futuro link público).
-- (Aplicada el 2026-06-12)

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS participants jsonb;

UPDATE public.app_settings
SET value = value || jsonb_build_object(
  'templates', coalesce(value->'templates', '[
    {"id": "tpl_cita",   "shortcut": "cita",   "name": "Confirmación de cita", "body": "Hola {nombre}! Te agendamos para el {fecha} a las {hora}. Cualquier cosa avisame por acá"},
    {"id": "tpl_link",   "shortcut": "link",   "name": "Link de reunión",      "body": "Link de la reunión: {zoom}"},
    {"id": "tpl_saludo", "shortcut": "saludo", "name": "Saludo inicial",       "body": "Hola {nombre}! Gracias por escribirnos, ¿en qué te ayudo?"}
  ]'::jsonb),
  'availability', coalesce(value->'availability', 'null'::jsonb)
)
WHERE key = 'soporte_config';
