-- strategy_pages_vsl_v1 — el VSL es POR FUNNEL (1 VSL por funnel), no por avatar.
-- Antes el VSL vivía en cada avatar (avatars[].vsl_url); se mueve a nivel funnel.
ALTER TABLE public.strategy_pages ADD COLUMN IF NOT EXISTS vsl_url text;
