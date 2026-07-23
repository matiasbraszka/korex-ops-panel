-- migrations/funnel_resources_v2_bunny.sql
--
-- Video pesado en Bunny Stream. Los VIDEOS se suben a Bunny (convierte MOV→MP4, reproduce
-- en cualquier navegador y aguanta cualquier tamaño); las IMÁGENES siguen en Supabase.
--
--   · provider = 'supabase' (imágenes y videos viejos) | 'bunny' (videos nuevos).
--   · bunny_id = el guid del video en Bunny (para armar player, miniatura y HLS).
--
-- Para los recursos de Bunny, public_url guarda el embed del player; storage_path queda
-- con el guid (no hay archivo en el bucket de Supabase). Aditiva e inerte.

alter table public.funnel_resources
  add column if not exists provider text not null default 'supabase',
  add column if not exists bunny_id text;

comment on column public.funnel_resources.provider is 'Dónde vive el archivo: supabase | bunny.';
comment on column public.funnel_resources.bunny_id is 'guid del video en Bunny Stream (si provider=bunny).';

notify pgrst, 'reload schema';

-- Rollback:
--   alter table public.funnel_resources drop column if exists provider, drop column if exists bunny_id;
