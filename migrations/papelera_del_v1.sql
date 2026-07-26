-- PAPELERA del DEL — APLICADA a prod el 2026-07-26 (vía MCP).
-- Red de seguridad universal contra pérdida de datos tras el incidente del
-- 21-22/07: el sync de Drive borró los client_brain_docs NATIVOS (no estaban en
-- Drive) y la cascada de del_sections se llevó todas las pestañas de los DEL
-- separados de Summit sin dejar rastro.
--
-- Capa 1 (esto): cualquier DELETE sobre client_brain_docs o del_sections queda
-- archivado en papelera_borrados ANTES de ejecutarse, venga de donde venga
-- (sync, cascada, humano, bug futuro). Restaurar = re-insertar desde `datos`.
-- Capa 2 (edge client-brain-sync v23, deployada el mismo día): el sync solo puede
-- borrar docs cuyo node sigue existiendo en client_drive_nodes — los DEL nativos
-- (native_*/panel_*) quedan fuera de su alcance para siempre.

create table if not exists papelera_borrados (
  id bigint generated always as identity primary key,
  tabla text not null,
  fila_id text not null,
  client_id text,
  strategy_id text,
  titulo text,
  datos jsonb not null,
  borrado_at timestamptz not null default now()
);
create index if not exists papelera_borrados_tabla_idx on papelera_borrados (tabla, borrado_at desc);
create index if not exists papelera_borrados_client_idx on papelera_borrados (client_id);

alter table papelera_borrados enable row level security;
create policy papelera_team_select on papelera_borrados for select to authenticated
  using (is_team_member());

create or replace function public._papelera_guardar()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $$
begin
  insert into papelera_borrados (tabla, fila_id, client_id, strategy_id, titulo, datos)
  values (
    TG_TABLE_NAME,
    coalesce(old.id::text, '?'),
    (to_jsonb(old)->>'client_id'),
    (to_jsonb(old)->>'strategy_id'),
    (to_jsonb(old)->>'title'),
    to_jsonb(old)
  );
  return old;
end $$;

drop trigger if exists trg_papelera_cbd on client_brain_docs;
create trigger trg_papelera_cbd before delete on client_brain_docs
  for each row execute function public._papelera_guardar();

drop trigger if exists trg_papelera_dsec on del_sections;
create trigger trg_papelera_dsec before delete on del_sections
  for each row execute function public._papelera_guardar();
