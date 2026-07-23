-- migrations/del_client_doc_hidden_v1.sql
--
-- Qué documentos del cliente el equipo QUITÓ del grupo "Del cliente" del DEL. Por
-- defecto aparecen todos los documentos de contexto (onboarding, investigación,
-- personalidad) en todos los DEL de ese cliente; acá se guardan los que se sacaron,
-- para que no vuelvan a mostrarse. "Agregar" = borrar la fila (vuelve a aparecer).
--
-- ¿Por qué tabla propia y no client_brain_pins? Porque esa tabla tiene única
-- (client_id, node_id) y la usa el sistema de CONTEXTO (cada doc tiene UN slot:
-- onboarding/investigación/…). Guardar acá la exclusión pisaría ese slot y rompería
-- lo que leen los agentes. Son cosas distintas → tabla separada.
--
-- ADITIVA e INERTE.

create table if not exists public.del_client_doc_hidden (
  client_id text not null,
  node_id   text not null,
  hidden_at timestamptz not null default now(),
  primary key (client_id, node_id)
);

alter table public.del_client_doc_hidden enable row level security;

do $$ begin
  create policy dcdh_rw on public.del_client_doc_hidden
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

revoke all on public.del_client_doc_hidden from anon;
grant select, insert, update, delete on public.del_client_doc_hidden to authenticated;

notify pgrst, 'reload schema';

-- Rollback: drop table if exists public.del_client_doc_hidden;
