-- migrations/funnel_resources_v1.sql
--
-- RECURSOS ALOJADOS EN LA PLATAFORMA (Etapa C). Decisión de Matías (2026-07-17):
-- en vez de pegar el link de una carpeta de Drive, se SUBEN los archivos acá mismo,
-- se les pone título y quedan alojados en nuestro servidor. Carpetas como el Drive,
-- pero adentro del sistema: un clic abre el recurso.
--
-- Modelo: cada recurso pertenece a un funnel (strategy_id) y, normalmente, a un avatar
-- (avatar_id) y a una de sus 4 carpetas (bucket_key). Los de branding del cliente van
-- con avatar_id null y bucket_key 'branding'.
--
-- Los archivos viven en el bucket de Storage 'funnel-recursos' (público, para que el
-- click los abra directo). La tabla guarda el metadato + el path + la URL pública.

-- ── 1) Tabla de metadatos ────────────────────────────────────────────────────
create table if not exists public.funnel_resources (
  id           text primary key default 'fr_' || replace(gen_random_uuid()::text, '-', ''),
  strategy_id  text not null,
  client_id    text,
  avatar_id    text,                      -- null = recurso de cliente (branding)
  bucket_key   text not null,             -- ad_rec | ad_edit | vsl_rec | vsl_edit | branding
  title        text not null default 'Sin título',
  storage_path text not null,             -- ruta dentro del bucket de Storage
  public_url   text,                      -- URL pública para abrir/mostrar
  mime_type    text,
  kind         text,                      -- image | video | other
  size_bytes   bigint,
  created_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists funnel_resources_strategy_idx on public.funnel_resources (strategy_id);
create index if not exists funnel_resources_avatar_idx   on public.funnel_resources (avatar_id);

alter table public.funnel_resources enable row level security;
do $$ begin
  create policy fr_rw on public.funnel_resources for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
revoke all on public.funnel_resources from anon;
grant select, insert, update, delete on public.funnel_resources to authenticated;

-- ── 2) Bucket de Storage (público) ───────────────────────────────────────────
-- Público = el click abre el archivo por URL directa. file_size_limit generoso para
-- videos (500 MB); si el proyecto tiene un tope global más bajo, gana el global.
insert into storage.buckets (id, name, public, file_size_limit)
values ('funnel-recursos', 'funnel-recursos', true, 524288000)
on conflict (id) do update set public = true, file_size_limit = 524288000;

-- ── 3) Políticas del bucket ──────────────────────────────────────────────────
-- Lectura: pública (bucket público). Subir/borrar/actualizar: sólo autenticados.
do $$ begin
  create policy funnel_recursos_read on storage.objects for select
    using (bucket_id = 'funnel-recursos');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy funnel_recursos_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'funnel-recursos');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy funnel_recursos_update on storage.objects for update to authenticated
    using (bucket_id = 'funnel-recursos');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy funnel_recursos_delete on storage.objects for delete to authenticated
    using (bucket_id = 'funnel-recursos');
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';

-- Rollback:
--   drop table if exists public.funnel_resources;
--   delete from storage.buckets where id = 'funnel-recursos';   -- (borrar objetos antes)
--   drop policy if exists funnel_recursos_read   on storage.objects;
--   drop policy if exists funnel_recursos_insert on storage.objects;
--   drop policy if exists funnel_recursos_update on storage.objects;
--   drop policy if exists funnel_recursos_delete on storage.objects;
