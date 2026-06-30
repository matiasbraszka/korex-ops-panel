-- Rediseño Recursos -> Funnels + Carpetas. Aditivo, sin pérdida. Ya aplicado en vivo.
--
-- Funnels = se amplía la tabla strategy_pages existente:
--   avatars          : variantes de avatar [{id,name,audience,status,ad_url}]
--   visual_resources : material a completar por funnel [{label,done,url}]
--   pixel_code       : snippet completo del pixel de Meta (textarea del diseño)
--   updated_at       : columna "Modificado" del listado
-- conversion_events (ya jsonb) pasa a la forma {name, purpose, code}; el editor
-- mapea lo viejo {label, meta_name} para no romper.
alter table public.strategy_pages
  add column if not exists avatars jsonb not null default '[]'::jsonb,
  add column if not exists visual_resources jsonb not null default '[]'::jsonb,
  add column if not exists pixel_code text,
  add column if not exists updated_at timestamptz not null default now();

-- La estrategia ahora la DEFINE la carpeta de Drive "Estrategia #N": drive-sync
-- auto-crea/actualiza el registro. drive_folder_id = clave estable (id de la carpeta).
alter table public.strategies
  add column if not exists drive_folder_id text;
