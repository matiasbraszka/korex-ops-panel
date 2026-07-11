-- client_brain_v1 — el "mini-cerebro" de contexto por cliente.
--
-- Objetivo: que el sistema ENTIENDA a cada cliente. Hoy el panel solo linkea los
-- Google Docs del cliente (client_drive_nodes = árbol, sin contenido). Acá guardamos
-- el TEXTO de los 3 documentos clave —DEL (documento en limpio), Onboarding e
-- Investigación— para que el cerebro de marketing pueda razonar sobre ellos.
--
-- Ingesta: SOLO la edge function `client-brain-sync` escribe (service_role, saltea
-- RLS). Lee el árbol de client_drive_nodes, detecta los 3 docs por nombre, pide su
-- texto a un Apps Script (acción read_doc) y hace upsert acá. Idempotente por doc.
-- El panel solo lee.

CREATE TABLE IF NOT EXISTS public.client_brain_docs (
  id                    text PRIMARY KEY,                 -- cbd_<client>_<kind>
  client_id             text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  node_id               text,                             -- Drive id del doc (ref a client_drive_nodes.id)
  doc_kind              text NOT NULL,                    -- del | onboarding | investigacion
  title                 text,
  text                  text,                             -- cuerpo en texto plano
  char_count            int DEFAULT 0,
  web_url               text,                             -- link para abrir en Drive
  source_modified_time  timestamptz,                      -- modified_time del nodo cuando se extrajo
  synced_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, doc_kind)
);

CREATE INDEX IF NOT EXISTS client_brain_docs_client_idx ON public.client_brain_docs(client_id);

-- RLS: el panel (authenticated) solo lee; la edge function escribe (service_role).
ALTER TABLE public.client_brain_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_brain_docs_read ON public.client_brain_docs;
CREATE POLICY client_brain_docs_read ON public.client_brain_docs
  FOR SELECT TO authenticated USING (true);
