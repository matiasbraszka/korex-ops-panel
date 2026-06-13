-- mercury_v2: el apodo real del fondo (nickname de Mercury) trae cliente+categoría
-- (ej. "Sergio Cánovas Publicidad"). El `name` de la API es genérico
-- ("Mercury Checking ••4071"), por eso usamos nickname para mostrar y para las alertas.
ALTER TABLE public.mercury_accounts ADD COLUMN IF NOT EXISTS nickname text;

-- Backfill desde el JSON crudo ya guardado.
UPDATE public.mercury_accounts
SET nickname = nullif(raw->>'nickname','')
WHERE nickname IS NULL AND raw ? 'nickname';
