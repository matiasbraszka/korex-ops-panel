-- migrations/del_client_extra_docs_v1.sql
--
-- Documentos "generales" que el equipo crea A MANO desde el panel y que aparecen en
-- TODOS los DEL de un cliente (además de los que vienen del Drive: onboarding,
-- personalidad, investigación). Son propios del panel: NO los toca client-brain-sync
-- (por eso tabla aparte y no client_brain_docs, que el sync borra si no está en Drive).
--
-- ADITIVA e INERTE.
create table if not exists public.del_client_extra_docs (
  id         text primary key default 'dxd_' || replace(gen_random_uuid()::text, '-', ''),
  client_id  text not null,
  title      text not null default 'Documento nuevo',
  html       text not null default '',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists del_client_extra_docs_client_idx on public.del_client_extra_docs (client_id);

alter table public.del_client_extra_docs enable row level security;
do $$ begin
  create policy dced_rw on public.del_client_extra_docs for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
revoke all on public.del_client_extra_docs from anon;
grant select, insert, update, delete on public.del_client_extra_docs to authenticated;
notify pgrst, 'reload schema';
-- Rollback: drop table if exists public.del_client_extra_docs;
