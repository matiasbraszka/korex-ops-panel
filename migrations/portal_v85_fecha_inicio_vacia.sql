-- migrations/portal_v85_fecha_inicio_vacia.sql
--
-- BUG: a un cliente con la fecha de inicio guardada como TEXTO VACÍO ("") el portal le
-- mostraba "Modo demo · datos de ejemplo" y lo saludaba con el nombre del cliente de
-- ejemplo ("Hola, Sergio") en vez de con sus propios datos.
--
-- Cadena completa:
--   _portal_servicio hacía  coalesce(c.start_date::timestamptz, c.created_at, now())
--   → clients.start_date es TEXT; ''::timestamptz LANZA EXCEPCIÓN.
--   → el coalesce no salva nada: el cast revienta ANTES de que se evalúe el respaldo.
--   → portal_cliente_inicio() falla entera.
--   → portalApi.rpc() captura el error y devuelve los datos mock (portalApi.js:29-33),
--     que son los del cliente piloto Sergio Cánovas.
--
-- No era solo cosa de los clientes de prueba: **Daniel Serrano**, cliente real y activo,
-- tenía el mismo texto vacío y por lo tanto la misma pantalla rota.
--
-- Dos arreglos, porque hacen falta los dos:
--   1. El dato: '' pasa a NULL (que es lo que significa "no la sé").
--   2. La función: que tolere el vacío igual, para que un '' que entre mañana por
--      cualquier otra vía no vuelva a tumbar la pantalla de Inicio.

-- ── 1. Normalizar el dato ────────────────────────────────────────────────────
update public.clients
   set start_date = null
 where start_date is not null and btrim(start_date) = '';

-- ── 2. Blindar la función ────────────────────────────────────────────────────
-- Editada en vivo con pg_get_functiondef + replace para no re-escribirla a mano.
do $mig$
declare
  v_def text;
  v_old text := 'coalesce(c.start_date::timestamptz, c.created_at, now())';
  v_new text := 'coalesce(nullif(btrim(c.start_date), '''')::timestamptz, c.created_at, now())';
begin
  v_def := pg_get_functiondef('public._portal_servicio(text)'::regprocedure);

  if position(v_new in v_def) > 0 then
    raise notice '_portal_servicio ya estaba blindada.';
    return;
  end if;
  if position(v_old in v_def) = 0 then
    raise exception '_portal_servicio cambió: no encontré el cast a parchear. Revisar a mano.';
  end if;

  execute replace(v_def, v_old, v_new);
  raise notice '_portal_servicio actualizada.';
end $mig$;

notify pgrst, 'reload schema';

-- Verificación (como el cliente afectado, tiene que devolver datos y no reventar):
--   select set_config('request.jwt.claims', json_build_object('sub', <uid>, 'role','authenticated')::text, true);
--   set local role authenticated;
--   select public.portal_cliente_inicio() is not null;
--
-- Nota de diseño para el futuro: clients.start_date es TEXT y debería ser DATE. Mientras
-- siga siendo texto, cualquier lugar que la castee tiene que usar nullif(btrim(...), '').
