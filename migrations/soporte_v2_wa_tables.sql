-- soporte_v2: tablas de mensajeria WhatsApp (puente Evolution API) con RLS
-- restrictiva desde el dia 1 y Realtime habilitado.
--
-- Modelo: wa_conversations = un chat (persona o grupo, identificado por su
-- JID de WhatsApp); wa_messages = cada mensaje, entrante o saliente, con el
-- payload crudo del puente para no perder informacion.
--
-- Permisos: se reutiliza has_permission('soporte', ...) (ya existente,
-- SECURITY DEFINER, incluye shortcut de admin). Se envuelve en (SELECT ...)
-- para que Postgres lo evalue una vez por query y no por fila.
-- El webhook escribe con service_role (bypassa RLS); anon NO tiene acceso.

CREATE TABLE public.wa_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- JID de WhatsApp: "<numero>@s.whatsapp.net" (persona) o "<id>@g.us" (grupo)
  wa_jid text NOT NULL UNIQUE,
  wa_phone text,                       -- E.164 sin "+" (null en grupos)
  is_group boolean NOT NULL DEFAULT false,
  wa_profile_name text,                -- pushName del contacto / subject del grupo
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  client_id text REFERENCES public.clients(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','closed')),
  assigned_to text REFERENCES public.team_members(id) ON DELETE SET NULL,
  unread_count int NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_conversations_contact  ON public.wa_conversations (contact_id);
CREATE INDEX idx_wa_conversations_client   ON public.wa_conversations (client_id);
CREATE INDEX idx_wa_conversations_assigned ON public.wa_conversations (assigned_to);
CREATE INDEX idx_wa_conversations_inbox    ON public.wa_conversations (status, last_message_at DESC);

CREATE TABLE public.wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  -- key.id de Baileys/Evolution. UNIQUE = idempotencia: los webhooks pueden
  -- repetirse y el INSERT ... ON CONFLICT DO NOTHING los descarta.
  wa_message_id text UNIQUE,
  direction text NOT NULL CHECK (direction IN ('in','out')),  -- out = key.fromMe
  sender_jid text,                     -- autor real dentro de un grupo
  msg_type text,                       -- conversation | imageMessage | audioMessage | ...
  body text,                           -- texto plano extraido (si aplica)
  media_id text,                       -- referencia a media (descarga diferida)
  status text NOT NULL DEFAULT 'received',  -- received|sent|delivered|read|failed
  sent_by text REFERENCES public.team_members(id),  -- quien envio desde el panel (null si fue desde el telefono o entrante)
  payload jsonb,                       -- evento crudo del puente, siempre
  wa_timestamp timestamptz,            -- messageTimestamp del mensaje
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_messages_conv    ON public.wa_messages (conversation_id, created_at DESC);
CREATE INDEX idx_wa_messages_sent_by ON public.wa_messages (sent_by);

-- updated_at automatico (reusa el trigger generico existente)
CREATE TRIGGER wa_conversations_updated_at
  BEFORE UPDATE ON public.wa_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY wa_conversations_read ON public.wa_conversations
  FOR SELECT TO authenticated
  USING ((SELECT has_permission('soporte', '*', 'read')));
CREATE POLICY wa_conversations_write ON public.wa_conversations
  FOR ALL TO authenticated
  USING ((SELECT has_permission('soporte', '*', 'write')))
  WITH CHECK ((SELECT has_permission('soporte', '*', 'write')));

CREATE POLICY wa_messages_read ON public.wa_messages
  FOR SELECT TO authenticated
  USING ((SELECT has_permission('soporte', '*', 'read')));
CREATE POLICY wa_messages_write ON public.wa_messages
  FOR ALL TO authenticated
  USING ((SELECT has_permission('soporte', '*', 'write')))
  WITH CHECK ((SELECT has_permission('soporte', '*', 'write')));

-- Realtime: el panel se suscribe a INSERTs de estas tablas (respeta RLS)
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_conversations, public.wa_messages;

-- Config del modulo (solo datos NO sensibles: los tokens van a secrets de
-- la edge function, jamas aca)
INSERT INTO public.app_settings (key, value)
VALUES ('soporte_config', '{"instance_name": "korex-soporte", "default_assignee": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;
