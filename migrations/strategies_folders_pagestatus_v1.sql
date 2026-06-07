-- strategies: carpetas múltiples + estado por página
--
-- 1) strategies.folders: lista de carpetas (Drive) ilimitadas, igual que docs.
--    Antes solo existía drive_url (una sola carpeta). Migramos ese valor a la
--    lista para no perder nada; el frontend usa folders de acá en más.
-- 2) strategy_pages.status: estado de cada página (activa, pausada,
--    en-construccion, cambios, vieja). Reemplaza al flag is_live.

ALTER TABLE public.strategies      ADD COLUMN IF NOT EXISTS folders jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.strategy_pages  ADD COLUMN IF NOT EXISTS status  text  NOT NULL DEFAULT 'activa';

-- Migrar el drive_url existente a la lista de carpetas (solo si aún no hay folders).
UPDATE public.strategies
SET folders = jsonb_build_array(jsonb_build_object('label', 'Drive de la estrategia', 'url', drive_url))
WHERE drive_url IS NOT NULL AND drive_url <> ''
  AND (folders IS NULL OR folders = '[]'::jsonb);
