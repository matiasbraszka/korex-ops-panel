-- migrations/del_comments_v1.sql
--
-- Comentarios por sección del DEL: la parte "colaborativa" que pidió Matías.
-- El equipo deja notas ancladas a una sección (ej. "falta el hook del avatar 2"),
-- se responden y se marcan como resueltas. La presencia en vivo (quién está mirando
-- el DEL) NO usa base: va por Supabase Realtime (efímero), no hace falta tabla.
--
-- ── Decisión de diseño: sin FK a del_sections ───────────────────────────────
-- section_id es TEXTO, no una foreign key. Motivo: el importador (del_sections_import)
-- hace DELETE+INSERT de las secciones no adoptadas, con id DETERMINÍSTICO
-- ('dsec_<doc>_<ord>'). Un FK con ON DELETE CASCADE borraría los comentarios en cada
-- re-sync aunque el id vuelva idéntico. Sin FK, el comentario sobrevive y se vuelve a
-- asociar solo cuando la sección reaparece con su mismo id. Un comentario huérfano
-- (sección borrada a mano) simplemente no se muestra.
--
-- ADITIVA e INERTE: tabla nueva, nadie la lee hasta que la UI del panel la use.

create table if not exists public.del_comments (
  id          text primary key default 'dcmt_' || replace(gen_random_uuid()::text, '-', ''),
  section_id  text not null,
  doc_id      text,
  strategy_id text,
  author_id   text,
  author_name text,
  body        text not null,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists del_comments_section_idx  on public.del_comments (section_id);
create index if not exists del_comments_strategy_idx on public.del_comments (strategy_id);

-- RLS: solo el usuario logueado del panel (authenticated) lee/escribe. El anónimo,
-- nada — igual que el resto del DEL.
alter table public.del_comments enable row level security;

do $$ begin
  create policy del_comments_rw on public.del_comments
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Por las dudas, que anon no tenga grants de tabla (RLS ya lo bloquea, esto es cinturón
-- y tiradores, igual que en las otras tablas del DEL).
revoke all on public.del_comments from anon;
grant select, insert, update, delete on public.del_comments to authenticated;

-- PostgREST cachea el esquema: sin esto, la tabla nueva da 404 hasta el próximo reinicio.
notify pgrst, 'reload schema';

-- ── Verificación ─────────────────────────────────────────────────────────────
--   select count(*) from del_comments;                       -- 0
--   -- logueado puede insertar; anónimo recibe 401/403 por RLS.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   drop table if exists public.del_comments;
