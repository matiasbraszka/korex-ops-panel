-- soporte_v3: bandeja funcional — etiquetas, notas, citas y permisos de config.
--
-- 1. wa_conversations: tags (etiquetas configurables) + notes (notas internas)
-- 2. appointments: citas agendadas desde el chat (espejo del evento en Google
--    Calendar de admin@metodokorex.com via Apps Script)
-- 3. app_settings: los usuarios con permiso soporte pueden editar SOLO la fila
--    soporte_config (catalogo de etiquetas, plantilla de confirmacion)
-- 4. seeds de soporte_config

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.wa_conversations(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  wa_jid text,
  title text NOT NULL,
  notes text,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  gcal_event_id text,
  gcal_link text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','done')),
  created_by text REFERENCES public.team_members(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_appointments_start ON public.appointments (start_at);
CREATE INDEX idx_appointments_conv  ON public.appointments (conversation_id);
CREATE INDEX idx_appointments_contact ON public.appointments (contact_id);
CREATE INDEX idx_appointments_created_by ON public.appointments (created_by);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY appointments_read ON public.appointments
  FOR SELECT TO authenticated
  USING ((SELECT has_permission('soporte', '*', 'read')));
CREATE POLICY appointments_write ON public.appointments
  FOR ALL TO authenticated
  USING ((SELECT has_permission('soporte', '*', 'write')))
  WITH CHECK ((SELECT has_permission('soporte', '*', 'write')));

-- app_settings hoy es solo-operations: sin esto, un usuario solo-soporte no
-- podria editar el catalogo de etiquetas. Se abre UNICAMENTE la fila
-- soporte_config (SELECT + UPDATE; no INSERT/DELETE).
CREATE POLICY soporte_app_settings_select ON public.app_settings
  FOR SELECT TO authenticated
  USING (key = 'soporte_config' AND (SELECT has_permission('soporte', '*', 'read')));
CREATE POLICY soporte_app_settings_update ON public.app_settings
  FOR UPDATE TO authenticated
  USING (key = 'soporte_config' AND (SELECT has_permission('soporte', '*', 'write')))
  WITH CHECK (key = 'soporte_config' AND (SELECT has_permission('soporte', '*', 'write')));

-- Seeds (no pisa claves existentes como webhook_secret / evolution_api_key)
UPDATE public.app_settings
SET value = jsonb_build_object(
      'tags', '[]'::jsonb,
      'appointment_template', 'Hola {{nombre}}! Te agendamos para el {{fecha}} a las {{hora}}. Cualquier cosa avisame por acá 👍',
      'server_url', 'https://evolution-api-production-06b0.up.railway.app'
    ) || value,
    updated_at = now()
WHERE key = 'soporte_config';
