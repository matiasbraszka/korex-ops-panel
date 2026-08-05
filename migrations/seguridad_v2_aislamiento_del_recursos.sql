-- migrations/seguridad_v2_aislamiento_del_recursos.sql
--
-- CIERRA UNA FUGA REAL: cualquier CLIENTE logueado en su portal podía leer el material
-- de TODOS los demás clientes, y en el caso de los recursos también modificarlo y borrarlo.
--
-- Verificado en producción simulando la sesión de un cliente real (is_team_member() = false):
--     funnel_resources    6.813 filas visibles   (videos, grabaciones, archivos de la agencia)
--     del_sections          726 filas visibles   (secciones de DEL de todos los clientes)
--     client_brain_docs     188 filas visibles   (documentos DEL completos)
--     strategy_pages / clients → 0  (esas sí estaban bien cerradas)
--
-- La causa: las políticas decían `to authenticated using (true)`. Los clientes del portal
-- se loguean con Supabase Auth (apps/portal/src/auth/PortalAuthProvider.jsx:30), o sea que
-- su token tiene rol `authenticated` — EL MISMO que el equipo. La política nunca distinguió
-- "equipo" de "cliente". Y funnel_resources era `for all`, no solo select.
--
-- Estaba anotado como deuda desde el día uno y nunca se cerró:
--   apps/portal/migrations/portal_cliente_v1_schema.sql:88-91
--
-- POR QUÉ ES SEGURO CERRARLO (verificado antes de aplicar):
--   · apps/portal NO consulta estas tablas directamente: entra por RPCs.
--   · Las 36 funciones portal_cliente_* son SECURITY DEFINER (0 INVOKER) → ignoran RLS.
--   · share_get (links compartidos) es SECURITY DEFINER.
--   · Las edge functions usan service role.
--   · Las 4 funciones INVOKER que tocan estas tablas (_portal_etapa, del_assemble_text,
--     trg_del_sections_sync_text, audit_recursos_cliente) se ejecutan siempre dentro de un
--     contexto DEFINER o a mano por un admin, así que heredan permisos suficientes.
--
-- REVERTIR: cambiar `(select public.is_team_member())` por `true` en las políticas de abajo.

-- ── funnel_resources ─────────────────────────────────────────────────────────
-- Era `for all ... using(true) with check(true)`: lectura, escritura Y BORRADO de todo.
-- Se parte en cuatro políticas por comando en vez de un `for all` para no pagar dos veces
-- el chequeo en cada SELECT (un `for all` también cubre el select, y el advisor lo marca
-- como multiple_permissive_policies).
-- has_permission/is_team_member van envueltos en (select ...) para que Postgres los evalúe
-- UNA vez por consulta y no una por fila (advisor auth_rls_initplan, ver perf_v5).
drop policy if exists fr_rw     on public.funnel_resources;
drop policy if exists fr_read   on public.funnel_resources;
drop policy if exists fr_insert on public.funnel_resources;
drop policy if exists fr_update on public.funnel_resources;
drop policy if exists fr_delete on public.funnel_resources;

create policy fr_read on public.funnel_resources for select to authenticated
  using ((select public.is_team_member()));
create policy fr_insert on public.funnel_resources for insert to authenticated
  with check ((select public.is_team_member()));
create policy fr_update on public.funnel_resources for update to authenticated
  using ((select public.is_team_member())) with check ((select public.is_team_member()));
create policy fr_delete on public.funnel_resources for delete to authenticated
  using ((select public.is_team_member()));

-- ── del_sections ─────────────────────────────────────────────────────────────
-- Solo tenía política de SELECT (las escrituras ya pasaban por RPCs DEFINER), así que
-- alcanza con cerrar la lectura.
drop policy if exists del_sections_read on public.del_sections;
create policy del_sections_read on public.del_sections for select to authenticated
  using ((select public.is_team_member()));

-- ── client_brain_docs ────────────────────────────────────────────────────────
-- Acá vive el TEXTO COMPLETO de cada DEL. Se conserva client_brain_docs_team_update tal
-- como está (UPDATE con is_team_member); solo se cierra la lectura.
drop policy if exists client_brain_docs_read on public.client_brain_docs;
create policy client_brain_docs_read on public.client_brain_docs for select to authenticated
  using ((select public.is_team_member()));

notify pgrst, 'reload schema';

-- Verificación (simulando un cliente del portal, tiene que dar 0/0/0; con un usuario del
-- equipo tiene que seguir dando 6813/726/188):
--   select set_config('request.jwt.claims',
--     json_build_object('sub','<uid del cliente>','role','authenticated')::text, true);
--   set local role authenticated;
--   select count(*) from public.funnel_resources;
--   select count(*) from public.del_sections;
--   select count(*) from public.client_brain_docs;
