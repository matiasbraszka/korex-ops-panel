-- soporte_v21: capa de Inteligencia de Soporte (análisis con IA de los chats).
--
-- Tablas (fuente de verdad; Google Docs es solo el render):
--   1. wa_briefings           — ficha viva por cliente (estado + satisfacción + historial)
--   2. wa_satisfaction_history — serie semanal de satisfacción por cliente/ámbito
--   3. wa_pending_items        — pendientes sin responder detectados a diario
--   4. wa_support_faqs         — FAQs/problemas frecuentes para nutrir la Guía de soporte
--   5. wa_intel_runs           — log de corridas (diaria/semanal)
--
-- Escritura: la hacen los edge functions con service_role (bypass RLS).
-- Lectura: usuarios con permiso 'soporte' (para mostrar en el panel a futuro).
-- pending_items y support_faqs son editables por soporte (resolver/curar a mano).

-- 1. Briefing vivo por cliente ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_briefings (
  client_id text PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  sat_usuarios int,                 -- 0..100
  sat_usuarios_label text,
  sat_cliente_grupo int,
  sat_cliente_grupo_label text,
  sat_privado int,
  sat_privado_label text,
  sat_overall int,
  estado text,                      -- resumen del estado actual del cliente
  riesgos text,
  historial jsonb NOT NULL DEFAULT '[]',  -- [{week_start, resumen, sat_overall}]
  gdoc_tab_id text,                 -- id/anchor de la pestaña en el Doc de briefings
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Serie temporal de satisfacción ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_satisfaction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text REFERENCES public.clients(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('usuarios','cliente_grupo','privado')),
  week_start date NOT NULL,
  score int,                        -- 0..100
  label text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, scope, week_start)
);
CREATE INDEX IF NOT EXISTS idx_wa_sat_client ON public.wa_satisfaction_history (client_id, week_start DESC);

-- 3. Pendientes sin responder (detección diaria) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_pending_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  client_id text REFERENCES public.clients(id) ON DELETE SET NULL,
  pregunta text NOT NULL,
  last_msg_preview text,
  wa_timestamp timestamptz,         -- momento del mensaje sin responder
  urgencia text NOT NULL DEFAULT 'media' CHECK (urgencia IN ('alta','media','baja')),
  detected_on date NOT NULL DEFAULT current_date,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_pending_open ON public.wa_pending_items (resolved_at, conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_pending_conv ON public.wa_pending_items (conversation_id);

-- 4. FAQs / problemas frecuentes (para la Guía de soporte) ────────────────────
CREATE TABLE IF NOT EXISTS public.wa_support_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pregunta text NOT NULL,
  respuesta_sugerida text,
  categoria text,
  frecuencia int NOT NULL DEFAULT 1,
  fuente_client_id text REFERENCES public.clients(id) ON DELETE SET NULL,
  first_seen date NOT NULL DEFAULT current_date,
  last_seen date NOT NULL DEFAULT current_date,
  published_at timestamptz,         -- cuándo se volcó a la Guía de soporte
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_faqs_last_seen ON public.wa_support_faqs (last_seen DESC);

-- 5. Log de corridas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_intel_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('daily','weekly')),
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','error')),
  stats jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_wa_intel_runs_kind ON public.wa_intel_runs (kind, created_at DESC);

-- RLS: lectura para soporte; escritura curada para pendientes y FAQs ──────────
ALTER TABLE public.wa_briefings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_satisfaction_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_pending_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_support_faqs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_intel_runs           ENABLE ROW LEVEL SECURITY;

CREATE POLICY wa_briefings_read ON public.wa_briefings
  FOR SELECT TO authenticated USING ((SELECT has_permission('soporte', '*', 'read')));
CREATE POLICY wa_sat_read ON public.wa_satisfaction_history
  FOR SELECT TO authenticated USING ((SELECT has_permission('soporte', '*', 'read')));
CREATE POLICY wa_runs_read ON public.wa_intel_runs
  FOR SELECT TO authenticated USING ((SELECT has_permission('soporte', '*', 'read')));

CREATE POLICY wa_pending_read ON public.wa_pending_items
  FOR SELECT TO authenticated USING ((SELECT has_permission('soporte', '*', 'read')));
CREATE POLICY wa_pending_write ON public.wa_pending_items
  FOR ALL TO authenticated
  USING ((SELECT has_permission('soporte', '*', 'write')))
  WITH CHECK ((SELECT has_permission('soporte', '*', 'write')));

CREATE POLICY wa_faqs_read ON public.wa_support_faqs
  FOR SELECT TO authenticated USING ((SELECT has_permission('soporte', '*', 'read')));
CREATE POLICY wa_faqs_write ON public.wa_support_faqs
  FOR ALL TO authenticated
  USING ((SELECT has_permission('soporte', '*', 'write')))
  WITH CHECK ((SELECT has_permission('soporte', '*', 'write')));

-- Seeds de soporte_config (no pisa claves existentes; agrega defaults faltantes).
-- korex_responder_phones: E.164 sin '+' (ej. "5492923514625"). Se completa
-- con el número de soporte + Matías + Cristian desde el panel/secreto.
UPDATE public.app_settings
SET value = jsonb_build_object(
      'analysis_model', 'claude-opus-4-8',
      'korex_responder_phones', '[]'::jsonb,
      'support_guide_doc_url', '',
      'docs_script_url', '',
      'docs_script_secret', '',
      'briefings_doc_url', '',
      'satisfaction_doc_url', '',
      'pending_doc_url', '',
      'usuarios_tag_label', 'G usuarios',
      'clientes_tag_label', 'G-Clientes',
      'intel_slack_pendientes_channel', '',
      'intel_slack_informe_channel', ''
    ) || value,
    updated_at = now()
WHERE key = 'soporte_config';
