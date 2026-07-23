-- vsl_versions_por_funnel_v1 — VSL grabación/edición pasa a ser 1 por funnel (no por avatar).
-- Antes las carpetas VSL vivían scope (strategy_id, avatar_id, version) por cada avatar.
-- Ahora son a nivel funnel (avatar_id=null), versionadas por strategy_pages.vsl_versions.
-- Aditivo: columna nueva con default [1]; consolidación de los VSL ya subidos a avatar_id=null
-- (verificado: ningún funnel tiene VSL repartido en >1 avatar, así que no hay merge/colisión).
-- Aplicar por MCP/CLI (coordinar con Matías; toca strategy_pages y funnel_resources).

alter table public.strategy_pages
  add column if not exists vsl_versions jsonb not null default '[1]'::jsonb;

-- Consolidar los VSL existentes de por-avatar a por-funnel.
update public.funnel_resources
   set avatar_id = null
 where bucket_key in ('vsl_rec','vsl_edit')
   and avatar_id is not null;

-- Rollback: alter table public.strategy_pages drop column if exists vsl_versions;
-- (la consolidación de avatar_id no se revierte automáticamente).
