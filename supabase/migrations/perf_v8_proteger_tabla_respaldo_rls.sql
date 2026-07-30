-- perf_v8: cerrar la tabla de respaldo que dejo abierta perf_v5.
--
-- rls_backup_20260730 guarda el mapa completo de permisos del sistema (las 237
-- politicas con sus condiciones). Se creo en el esquema public sin RLS: la podia
-- leer cualquier usuario logueado. Solo admins.
--
-- Misma leccion que con las tablas de respaldo de soporte: un "create table as"
-- en public nace SIN RLS. Siempre cerrarla en la misma migracion que la crea.

alter table if exists public.rls_backup_20260730 enable row level security;

drop policy if exists rls_backup_admin on public.rls_backup_20260730;
create policy rls_backup_admin on public.rls_backup_20260730
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Clave primaria, para que no quede como tabla sin PK en el advisor.
alter table if exists public.rls_backup_20260730
  add constraint rls_backup_20260730_pk primary key (tablename, policyname);

-- ---------------------------------------------------------------------------
-- ROLLBACK: disable row level security + drop policy + drop constraint.
-- La tabla se puede borrar entera una vez confirmado que perf_v5 quedo bien
-- (conviene esperar unas semanas antes de tirar el unico respaldo de permisos).
-- ---------------------------------------------------------------------------
