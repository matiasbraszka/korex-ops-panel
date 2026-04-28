-- ============================================================================
-- Historial del cliente — backend v1
-- Correr en Supabase SQL Editor antes de mergear feat/historial-cliente.
-- Idempotente: se puede correr varias veces sin romper.
-- ============================================================================

-- 1) Tabla de eventos del historial (datos por-cliente)
CREATE TABLE IF NOT EXISTS historial_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id text NOT NULL,
  tipo text NOT NULL,                 -- key del tipo de evento (entregable/hito/bloqueo/...)
  fase int NOT NULL DEFAULT 1,        -- 1..N (referencia al numero de fase en app_settings.historial_fases)
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  hora text,                          -- 'HH:MM'
  titulo text NOT NULL,
  descripcion text DEFAULT '',
  autor text DEFAULT '',
  responsable text DEFAULT 'Korex',   -- 'Korex' | 'Cliente' | 'Externo'
  tiempo_min int DEFAULT 0,
  estado text DEFAULT 'completado',   -- 'completado' | 'en-curso'
  adjuntos int DEFAULT 0,
  bloqueo_categoria text,
  bloqueo_esperando text,
  bloqueo_dias int DEFAULT 0,
  incluir_resumen boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS historial_eventos_cliente_idx
  ON historial_eventos(cliente_id, fecha DESC, hora DESC);

-- 2) Audit log de emails enviados
CREATE TABLE IF NOT EXISTS historial_emails_enviados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id text,
  destinatario_real text NOT NULL,    -- email al que iba dirigido (cliente real)
  destinatario_efectivo text NOT NULL,-- a quién se envió (test_email si test_mode estaba on)
  asunto text NOT NULL,
  cuerpo text NOT NULL,
  test_mode boolean NOT NULL,
  resend_id text,                     -- id del envío devuelto por Resend
  status text NOT NULL,               -- 'sent' | 'error'
  error_msg text,
  enviado_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS historial_emails_cliente_idx
  ON historial_emails_enviados(cliente_id, enviado_at DESC);

-- 3) Trigger para updated_at en eventos
CREATE OR REPLACE FUNCTION historial_eventos_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS historial_eventos_updated_at ON historial_eventos;
CREATE TRIGGER historial_eventos_updated_at
  BEFORE UPDATE ON historial_eventos
  FOR EACH ROW EXECUTE FUNCTION historial_eventos_touch_updated_at();

-- 4) Extender app_settings.value con keys del Historial (NO destructivo)
--    Solo escribe los keys si no existen ya — usa COALESCE en operación de merge.
UPDATE app_settings
SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
  'historial_fases', COALESCE(value->'historial_fases', '[
    { "n": 1,  "short": "Pre-Onb", "label": "Pre-Onboarding",      "color": "#8B5CF6" },
    { "n": 2,  "short": "Onb",     "label": "Onboarding + Meta",   "color": "#5B7CF5" },
    { "n": 3,  "short": "Estrat",  "label": "Estrategia & Avatar", "color": "#5B7CF5" },
    { "n": 4,  "short": "Guion",   "label": "Guiones & VSL",       "color": "#EAB308" },
    { "n": 5,  "short": "Diseño",  "label": "Diseño Landing",      "color": "#EAB308" },
    { "n": 6,  "short": "Code",    "label": "Funnel en código",    "color": "#EAB308" },
    { "n": 7,  "short": "QA",      "label": "QA & Tracking",       "color": "#22C55E" },
    { "n": 8,  "short": "Lanz",    "label": "Lanzamiento Ads",     "color": "#22C55E" },
    { "n": 9,  "short": "Optim",   "label": "Optimización",        "color": "#06B6D4" },
    { "n": 10, "short": "Audit",   "label": "Auditoría",           "color": "#06B6D4" },
    { "n": 11, "short": "Escala",  "label": "Escalado",            "color": "#06B6D4" }
  ]'::jsonb),
  'historial_event_types', COALESCE(value->'historial_event_types', '[
    { "key": "entregable",   "label": "Entregable",   "color": "#22C55E", "bg": "#ECFDF5", "dot": "◆" },
    { "key": "hito",         "label": "Hito",         "color": "#5B7CF5", "bg": "#EEF2FF", "dot": "★" },
    { "key": "bloqueo",      "label": "Bloqueo",      "color": "#EF4444", "bg": "#FEF2F2", "dot": "⚠" },
    { "key": "comunicacion", "label": "Comunicación", "color": "#8B5CF6", "bg": "#F5F3FF", "dot": "◌" },
    { "key": "decision",     "label": "Decisión",     "color": "#F97316", "bg": "#FFF7ED", "dot": "▶" },
    { "key": "validacion",   "label": "Validación",   "color": "#EAB308", "bg": "#FEFCE8", "dot": "✓" },
    { "key": "metrica",      "label": "Métrica",      "color": "#06B6D4", "bg": "#ECFEFF", "dot": "▲" }
  ]'::jsonb),
  'historial_email', COALESCE(value->'historial_email', '{
    "test_mode": true,
    "test_email": "troksgamer777@gmail.com",
    "from_email": "onboarding@resend.dev",
    "from_name": "Equipo Korex",
    "reply_to": "soporte@metodokorex.com"
  }'::jsonb)
),
updated_at = now()
WHERE key = 'global';

-- 5) Si por alguna razón no existe la fila 'global', la creamos vacía con los defaults.
INSERT INTO app_settings (key, value)
SELECT 'global', jsonb_build_object(
  'historial_fases', '[
    { "n": 1,  "short": "Pre-Onb", "label": "Pre-Onboarding",      "color": "#8B5CF6" },
    { "n": 2,  "short": "Onb",     "label": "Onboarding + Meta",   "color": "#5B7CF5" },
    { "n": 3,  "short": "Estrat",  "label": "Estrategia & Avatar", "color": "#5B7CF5" },
    { "n": 4,  "short": "Guion",   "label": "Guiones & VSL",       "color": "#EAB308" },
    { "n": 5,  "short": "Diseño",  "label": "Diseño Landing",      "color": "#EAB308" },
    { "n": 6,  "short": "Code",    "label": "Funnel en código",    "color": "#EAB308" },
    { "n": 7,  "short": "QA",      "label": "QA & Tracking",       "color": "#22C55E" },
    { "n": 8,  "short": "Lanz",    "label": "Lanzamiento Ads",     "color": "#22C55E" },
    { "n": 9,  "short": "Optim",   "label": "Optimización",        "color": "#06B6D4" },
    { "n": 10, "short": "Audit",   "label": "Auditoría",           "color": "#06B6D4" },
    { "n": 11, "short": "Escala",  "label": "Escalado",            "color": "#06B6D4" }
  ]'::jsonb,
  'historial_event_types', '[
    { "key": "entregable",   "label": "Entregable",   "color": "#22C55E", "bg": "#ECFDF5", "dot": "◆" },
    { "key": "hito",         "label": "Hito",         "color": "#5B7CF5", "bg": "#EEF2FF", "dot": "★" },
    { "key": "bloqueo",      "label": "Bloqueo",      "color": "#EF4444", "bg": "#FEF2F2", "dot": "⚠" },
    { "key": "comunicacion", "label": "Comunicación", "color": "#8B5CF6", "bg": "#F5F3FF", "dot": "◌" },
    { "key": "decision",     "label": "Decisión",     "color": "#F97316", "bg": "#FFF7ED", "dot": "▶" },
    { "key": "validacion",   "label": "Validación",   "color": "#EAB308", "bg": "#FEFCE8", "dot": "✓" },
    { "key": "metrica",      "label": "Métrica",      "color": "#06B6D4", "bg": "#ECFEFF", "dot": "▲" }
  ]'::jsonb,
  'historial_email', '{
    "test_mode": true,
    "test_email": "troksgamer777@gmail.com",
    "from_email": "onboarding@resend.dev",
    "from_name": "Equipo Korex",
    "reply_to": "soporte@metodokorex.com"
  }'::jsonb
)
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'global');
