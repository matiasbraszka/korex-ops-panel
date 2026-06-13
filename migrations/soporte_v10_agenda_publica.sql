-- soporte_v10: configuración de la agenda pública (/agendar).
-- (Aplicada el 2026-06-12)
UPDATE public.app_settings
SET value = value || jsonb_build_object(
  'public_agenda', coalesce(value->'public_agenda', '{
    "title": "Demo del sistema",
    "description": "Vemos tu caso en vivo y te mostramos cómo el sistema te trae personas que ya vieron tu presentación.",
    "host_name": "Matias Braszka",
    "host_role": "Te muestra el sistema en vivo",
    "confirmation_template": "Hola {nombre}! Confirmamos tu reunión para el {fecha} a las {hora} (hora Argentina). Cualquier cosa avisame por acá."
  }'::jsonb)
)
WHERE key = 'soporte_config';
