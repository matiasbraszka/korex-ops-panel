-- migrations/funnel_resources_v3_cliente.sql
--
-- Recursos A NIVEL CLIENTE (no de un funnel): las 6 categorías estándar que pidió
-- Matías (2026-07-18) para ordenar el material al migrarlo del Drive. Sirven para todos
-- los funnels del cliente. Pueden ser foto o video.
--
-- Categorías (bucket_key cuando strategy_id es null):
--   autoridad   → Fotos de Autoridad
--   estilo_vida → Fotos Estilo de vida
--   branding    → Branding (colores, logo)
--   productos   → Foto de productos
--   empresa     → Material de la empresa (PDFs, etc.)
--   testimonios → Testimonios
--   sin_clasif  → lo que la migración no pudo ubicar solo (para acomodar a mano)
--
-- Para eso, strategy_id pasa a ser opcional: un recurso de cliente tiene client_id y
-- bucket_key = la categoría, con strategy_id y avatar_id en null.

alter table public.funnel_resources alter column strategy_id drop not null;

comment on column public.funnel_resources.strategy_id is
  'Funnel del recurso. NULL = recurso a nivel cliente (categorías estándar por client_id + bucket_key).';

notify pgrst, 'reload schema';

-- Rollback (solo si no hay recursos de cliente cargados):
--   alter table public.funnel_resources alter column strategy_id set not null;
