-- client_brain_v5 — links de webs como contexto general del cliente.
-- Además de los documentos, el cliente puede tener páginas web de contexto
-- (su sitio, la web de la empresa MLM, etc.). Los dominios de los FUNNELS ya
-- viven en strategy_pages y también nutren el contexto (no se duplican acá).

CREATE TABLE IF NOT EXISTS public.client_brain_webs (
  id         text PRIMARY KEY,
  client_id  text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  url        text NOT NULL,
  label      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_brain_webs_client_idx ON public.client_brain_webs(client_id);

ALTER TABLE public.client_brain_webs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_brain_webs_read ON public.client_brain_webs;
CREATE POLICY client_brain_webs_read ON public.client_brain_webs
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS client_brain_webs_write ON public.client_brain_webs;
CREATE POLICY client_brain_webs_write ON public.client_brain_webs
  FOR ALL TO authenticated
  USING (has_permission('operations','*','write'))
  WITH CHECK (has_permission('operations','*','write'));
