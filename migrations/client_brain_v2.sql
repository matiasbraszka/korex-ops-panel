-- client_brain_v2 — el mini-cerebro admite VARIOS documentos por cliente.
--
-- Cambio vs v1: antes era 1 doc por tipo (UNIQUE client_id+doc_kind). Ahora un
-- cliente puede tener varios onboarding (estructurado + transcripción), varios
-- extra fijados a mano, etc. La clave pasa a ser el documento de Drive (node_id).
--
-- Además: `client_brain_pins` = documentos que el equipo FIJA a mano desde la
-- pestaña Cerebro para sumarlos al contexto (los avatares, análisis, etc. que
-- tienen nombres irregulares y no se detectan solos). La edge function los ingiere
-- con doc_kind='extra'.

-- Recreamos la tabla con la nueva clave (solo tenía datos de prueba de 1 cliente).
DROP TABLE IF EXISTS public.client_brain_docs;

CREATE TABLE public.client_brain_docs (
  id                    text PRIMARY KEY,                 -- cbd_<node_id>
  client_id             text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  node_id               text NOT NULL,                    -- Drive id del doc
  doc_kind              text NOT NULL,                    -- del | onboarding | investigacion | extra
  title                 text,
  text                  text,
  char_count            int DEFAULT 0,
  web_url               text,
  source_modified_time  timestamptz,
  synced_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, node_id)
);
CREATE INDEX client_brain_docs_client_idx ON public.client_brain_docs(client_id);

ALTER TABLE public.client_brain_docs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_brain_docs_read ON public.client_brain_docs;
CREATE POLICY client_brain_docs_read ON public.client_brain_docs
  FOR SELECT TO authenticated USING (true);

-- Documentos fijados a mano (pins) que suman al contexto del cerebro.
CREATE TABLE IF NOT EXISTS public.client_brain_pins (
  client_id   text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  node_id     text NOT NULL,                              -- Drive id (ref client_drive_nodes.id)
  label       text,                                       -- nombre cacheado para la UI
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, node_id)
);
CREATE INDEX IF NOT EXISTS client_brain_pins_client_idx ON public.client_brain_pins(client_id);

ALTER TABLE public.client_brain_pins ENABLE ROW LEVEL SECURITY;
-- Se administran desde la ficha del cliente (área Operaciones).
DROP POLICY IF EXISTS client_brain_pins_read ON public.client_brain_pins;
CREATE POLICY client_brain_pins_read ON public.client_brain_pins
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS client_brain_pins_write ON public.client_brain_pins;
CREATE POLICY client_brain_pins_write ON public.client_brain_pins
  FOR ALL TO authenticated
  USING (has_permission('operations','*','write'))
  WITH CHECK (has_permission('operations','*','write'));
