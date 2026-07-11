-- marketing_brain_v1 — la "capacitación" (skills) de los subagentes de marketing.
--
-- Editor visual tipo Proyecto de Claude: por subagente se cargan INSTRUCCIONES
-- (el skill / system prompt) + MATERIAL de entrenamiento (texto, links, docs de
-- Drive, archivos). Fuente de verdad = Supabase / el panel. Los subagentes del
-- workspace de Claude Code son "cargadores finos": leen su capacitación de acá.
--
-- Capa `general` = modelo de negocio Korex + lineamientos que TODOS heredan.
-- Escritura/lectura desde el panel gobernada por el permiso 'marketing'
-- (has_permission). El cerebro de Claude Code lee vía service_role (saltea RLS).

-- ── 1) Subagentes: uno por fila, con sus instrucciones ───────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_subagents (
  key          text PRIMARY KEY,      -- general | anuncios | vsl | landing | formularios | auditor
  name         text NOT NULL,
  instructions text DEFAULT '',       -- el skill / system prompt (editable en el panel)
  active       boolean NOT NULL DEFAULT true,
  position     int DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── 2) Material de entrenamiento por subagente ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_training_material (
  id          text PRIMARY KEY,       -- mtm_<ts>_<rnd>
  scope       text NOT NULL REFERENCES public.marketing_subagents(key) ON DELETE CASCADE,
  kind        text NOT NULL,          -- guia | ejemplo | regla | link | doc_drive | archivo | creativo_ganador
  title       text,
  content     text,                   -- texto del bloque (guía/ejemplo/regla)
  url         text,                   -- link o doc de Drive
  file_path   text,                   -- ruta en el bucket marketing-training
  source      text NOT NULL DEFAULT 'manual',  -- manual | auto
  client_id   text REFERENCES public.clients(id) ON DELETE SET NULL,  -- null = general; set = de un cliente
  metrics     jsonb,                  -- para creativo_ganador: {play_rate, cpl, registros, ...}
  position    int DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mtm_scope_idx     ON public.marketing_training_material(scope);
CREATE INDEX IF NOT EXISTS mtm_client_idx    ON public.marketing_training_material(client_id);

-- ── 3) Seed de subagentes (instrucciones se cargan luego desde el panel) ──────
INSERT INTO public.marketing_subagents (key, name, position, instructions) VALUES
  ('general',     'General (modelo Korex)', 0, ''),
  ('anuncios',    'Anuncios',               1, ''),
  ('vsl',         'VSL',                    2, ''),
  ('landing',     'Landing',                3, ''),
  ('formularios', 'Formularios',            4, ''),
  ('auditor',     'Auditor',                5, '')
ON CONFLICT (key) DO NOTHING;

-- ── 4) RLS: gobernado por el permiso 'marketing' (admin incluido) ─────────────
ALTER TABLE public.marketing_subagents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_training_material  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mkt_subagents_read  ON public.marketing_subagents;
CREATE POLICY mkt_subagents_read  ON public.marketing_subagents
  FOR SELECT TO authenticated USING (has_permission('marketing','*','read'));
DROP POLICY IF EXISTS mkt_subagents_write ON public.marketing_subagents;
CREATE POLICY mkt_subagents_write ON public.marketing_subagents
  FOR ALL TO authenticated
  USING (has_permission('marketing','*','write'))
  WITH CHECK (has_permission('marketing','*','write'));

DROP POLICY IF EXISTS mtm_read  ON public.marketing_training_material;
CREATE POLICY mtm_read  ON public.marketing_training_material
  FOR SELECT TO authenticated USING (has_permission('marketing','*','read'));
DROP POLICY IF EXISTS mtm_write ON public.marketing_training_material;
CREATE POLICY mtm_write ON public.marketing_training_material
  FOR ALL TO authenticated
  USING (has_permission('marketing','*','write'))
  WITH CHECK (has_permission('marketing','*','write'));

-- ── 5) Bucket privado para archivos de entrenamiento + su RLS ─────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-training', 'marketing-training', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS mkt_training_read   ON storage.objects;
CREATE POLICY mkt_training_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'marketing-training' AND has_permission('marketing','*','read'));
DROP POLICY IF EXISTS mkt_training_write  ON storage.objects;
CREATE POLICY mkt_training_write ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'marketing-training' AND has_permission('marketing','*','write'))
  WITH CHECK (bucket_id = 'marketing-training' AND has_permission('marketing','*','write'));
