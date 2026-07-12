-- client_brain_v4 — casilleros (slots) de contexto de cliente.
--
-- Un documento marcado 🧠 puede ir a un CASILLERO de nivel cliente (slot) o quedar
-- como marca de estrategia (slot NULL). Casilleros de cliente (alimentan TODAS las
-- estrategias): inv_cliente, inv_empresa, onboarding, briefing.
-- Reemplaza el "adivino por nombre" (onboarding/investigación) por asignación explícita.

ALTER TABLE public.client_brain_pins ADD COLUMN IF NOT EXISTS slot text;
