-- client_brain_v3 — nivel (scope) y estrategia de cada documento de contexto.
--
-- Cada doc del cerebro pertenece a un nivel:
--   client    → onboarding / investigación (alimentan TODAS las estrategias)
--   strategy  → DEL y demás docs de una estrategia (por su carpeta de Drive)
--   avatar    → la spec vinculada a un avatar puntual (avatars[].spec_node_id)
-- La edge function `client-brain-sync` calcula scope + strategy_id en cada sync.

ALTER TABLE public.client_brain_docs ADD COLUMN IF NOT EXISTS scope       text;
ALTER TABLE public.client_brain_docs ADD COLUMN IF NOT EXISTS strategy_id text;

CREATE INDEX IF NOT EXISTS client_brain_docs_strategy_idx ON public.client_brain_docs(strategy_id);
