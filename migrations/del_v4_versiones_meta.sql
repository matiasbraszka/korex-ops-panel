-- migrations/del_v4_versiones_meta.sql
--
-- Metadatos de las VERSIONES del DEL (V1, V2, V3…).
--
-- Hasta ahora una "versión" no era una entidad: era solo el número que llevaba cada
-- fila de del_sections. Eso alcanzaba para agrupar, pero no para dos cosas que
-- pidió Matías:
--   · Ponerle TÍTULO a la versión y una NOTA de en qué cambia respecto de las otras,
--     para distinguirlas de un vistazo sin abrir cada página.
--   · Definir QUÉ PASOS lleva el embudo en esa versión: si la V2 va directo a
--     formulario, no tiene sentido que arrastre Pre-landing y Landing vacías.
--     Los pasos son POR VERSIÓN, no por funnel: la V1 puede llevar las cuatro
--     páginas y la V2 solo el formulario.
--
-- Se mantiene la estructura V1/V2/V3: el título es un agregado, nunca un reemplazo.
--
-- Un DEL = un funnel (strategy_pages.del_doc_id es UNIQUE), así que la clave es
-- (doc_id, version) y no hace falta arrastrar el funnel acá.
--
-- ADITIVA. Esta migración NO cambia el comportamiento de nada: crea la tabla y la
-- rellena con lo que ya hay. Quien la lee llega después.

create table if not exists public.del_versions (
  doc_id     text not null references public.client_brain_docs(id) on delete cascade,
  version    int  not null,
  titulo     text,
  nota       text,          -- "en qué cambia esta versión respecto a las otras"
  pasos      text[],        -- kinds que lleva ESTA versión (null = los de siempre)
  created_at timestamptz not null default now(),
  created_by text,
  primary key (doc_id, version)
);

comment on table public.del_versions is
  'Título, nota y pasos de cada versión del DEL. La versión sigue viviendo como número '
  'en del_sections.version; esto le cuelga los datos. pasos = qué categorías lleva el '
  'embudo en esa versión (null = todas las estándar).';
comment on column public.del_versions.pasos is
  'Kinds de del_sections que lleva esta versión (ej: {vsl,anuncios,pg_formulario}). '
  'NULL significa "las estándar de siempre", para no romper lo que ya existía.';

alter table public.del_versions enable row level security;

do $$ begin
  create policy del_versions_team on public.del_versions
    for all to authenticated
    using ((select public.is_team_member())) with check ((select public.is_team_member()));
exception when duplicate_object then null; end $$;

revoke all on public.del_versions from anon;
grant select, insert, update, delete on public.del_versions to authenticated;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Una fila por cada (doc_id, version) que ya exista, con los pasos que hoy tiene.
-- Se listan solo los kinds VERSIONABLES: avatares y mensajes no se duplican por
-- versión, así que no son un "paso" que se pueda sacar de la V2.
insert into public.del_versions (doc_id, version, pasos, created_by)
select ds.doc_id,
       ds.version,
       array_agg(distinct ds.kind) filter (
         where ds.kind in ('estrategia','vsl','anuncios','pg_prelanding','pg_landing',
                           'pg_formulario','pg_thankyou','pg_testimonios')),
       'backfill del_v4'
  from public.del_sections ds
 where ds.doc_id is not null
 group by ds.doc_id, ds.version
on conflict (doc_id, version) do nothing;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   select count(*) as versiones, count(distinct doc_id) as dels from public.del_versions;
--   -- Los DEL con más de una versión, que es donde el título se va a notar:
--   select doc_id, count(*) n, array_agg(version order by version)
--     from public.del_versions group by doc_id having count(*) > 1 order by n desc limit 10;
--
-- ROLLBACK: drop table if exists public.del_versions;
