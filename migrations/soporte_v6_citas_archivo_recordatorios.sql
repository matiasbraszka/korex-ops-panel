-- soporte_v6: reagendar citas, invitación por email (RSVP), archivado de chats
-- y recordatorios automáticos 24h/2h antes. (Aplicada el 2026-06-12)

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS invite_email text,
  ADD COLUMN IF NOT EXISTS rsvp_status text,
  ADD COLUMN IF NOT EXISTS zoom_meeting_id text,
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_2h_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_appointments_status_start
  ON public.appointments (status, start_at);

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- Plantillas de recordatorio + secreto para el cron (solo si no existen aún)
UPDATE public.app_settings
SET value = value || jsonb_build_object(
  'reminder_24h_template', coalesce(value->>'reminder_24h_template',
    'Hola {{nombre}}! Te recuerdo que mañana, el {{fecha}} a las {{hora}}, tenemos nuestra reunión agendada. Te espero 👍'),
  'reminder_2h_template', coalesce(value->>'reminder_2h_template',
    'Hola {{nombre}}! En un rato, a las {{hora}}, tenemos nuestra reunión. Nos vemos ahí 👋'),
  'cron_secret', coalesce(value->>'cron_secret', 'kxr_' || encode(extensions.gen_random_bytes(18), 'hex'))
)
WHERE key = 'soporte_config';

-- El job de pg_cron (cada 10 min → edge function citas-recordatorios) se crea
-- por execute_sql aparte porque necesita el cron_secret ya generado:
--   select cron.schedule('citas_recordatorios', '*/10 * * * *', $$ select net.http_post(...) $$);
