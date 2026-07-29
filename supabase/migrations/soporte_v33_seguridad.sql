-- soporte_v33: tapar los 3 agujeros de seguridad que dejo la Fase 1/2
--
-- Los tres los reporto el advisor de Supabase despues de aplicar v28..v32:
--   1. wa_conversations_seguimiento (la vista del kanban) es SECURITY DEFINER:
--      saltea RLS y cualquier usuario logueado ve las 713 conversaciones.
--   2. wa_identidades (284 filas con telefonos + client_id) quedo sin RLS.
--   3. wa_tel_norm() / wa_tel_9() con search_path mutable.
--
-- Ninguna sentencia de esta migracion toca datos.

-- ---------------------------------------------------------------------------
-- 1. La vista respeta RLS (cada quien ve lo que le corresponde, igual que el inbox)
-- ---------------------------------------------------------------------------
alter view if exists public.wa_conversations_seguimiento set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- 2. RLS en wa_identidades, con el mismo patron que el resto de las tablas wa_*
-- ---------------------------------------------------------------------------
alter table if exists public.wa_identidades enable row level security;

drop policy if exists wa_identidades_read on public.wa_identidades;
create policy wa_identidades_read on public.wa_identidades
  for select to authenticated
  using (public.has_permission('soporte', '*', 'read'));

drop policy if exists wa_identidades_write on public.wa_identidades;
create policy wa_identidades_write on public.wa_identidades
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- La tabla de respaldo previa a esta tanda: solo admins.
alter table if exists public.wa_conversations_backup_20260729 enable row level security;

drop policy if exists wa_conv_backup_admin on public.wa_conversations_backup_20260729;
create policy wa_conv_backup_admin on public.wa_conversations_backup_20260729
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. search_path fijo en las funciones de normalizacion de telefonos
--    (mismo arreglo que hizo perf_v2_function_search_path en su momento)
-- ---------------------------------------------------------------------------
create or replace function public.wa_tel_norm(t text) returns text
  language sql immutable
  set search_path = public, pg_temp
as $$
  select nullif(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '');
$$;

create or replace function public.wa_tel_9(t text) returns text
  language sql immutable
  set search_path = public, pg_temp
as $$
  select right(public.wa_tel_norm(t), 9);
$$;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- alter view public.wa_conversations_seguimiento set (security_invoker = off);
-- alter table public.wa_identidades disable row level security;
-- drop policy if exists wa_identidades_read on public.wa_identidades;
-- drop policy if exists wa_identidades_write on public.wa_identidades;
-- alter table public.wa_conversations_backup_20260729 disable row level security;
-- drop policy if exists wa_conv_backup_admin on public.wa_conversations_backup_20260729;
-- (las funciones: volver a crearlas sin el "set search_path")
