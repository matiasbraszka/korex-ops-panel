-- migrations/portal_v92_funnels_contratados.sql
--
-- Punto 9: «que en la plataforma del cliente aparezca un contador de los funnels que
-- pagaron y cuántos les estamos dando, y que se configure en el mismo lugar donde se
-- ponen los anuncios por funnel, detallando cuántos son y de qué tipo: producto o
-- reclutamiento».
--
-- Hoy CUÁNTOS FUNNELS CONTRATÓ un cliente no está guardado en ningún lado. Lo único
-- parecido es clients.service, que es texto libre ("Funnel + Ads", "Solo Ads"): sirve
-- para leerlo, no para contar. Así que el cliente no tiene forma de ver si ya le
-- entregamos lo que pagó, y el equipo tampoco.
--
-- Se agregan dos números al cliente, uno por tipo. El tipo ya existe de verdad en los
-- funnels (strategy_pages.tipo, con CHECK producto/reclutamiento — funnels_v1_aplanado),
-- así que "entregados" se cuenta contra eso y no contra el nombre.
--
-- Van en `clients` y no en una tabla nueva porque es parte del trato con el cliente,
-- igual que service_ends_at: un número por cliente, no una entidad.

alter table public.clients
  add column if not exists funnels_producto      int,
  add column if not exists funnels_reclutamiento int;

comment on column public.clients.funnels_producto is
  'Cuántos embudos de PRODUCTO contrató el cliente. NULL = no se cargó todavía (no se '
  'muestra contador). Se carga en el panel, junto a "Anuncios a entregar".';
comment on column public.clients.funnels_reclutamiento is
  'Cuántos embudos de RECLUTAMIENTO contrató el cliente. NULL = no se cargó todavía.';

-- ── Lo que ve el cliente ────────────────────────────────────────────────────
-- Se cuelga de _portal_servicio, que ya viaja al Inicio dentro de 'servicio'. Así no
-- hay que tocar portal_cliente_inicio, que fue editada en vivo dos veces (v79 y v89) y
-- no está entera en ningún .sql.
--
-- "Entregados" son los funnels que existen y no están en borrador: un borrador es algo
-- que todavía estamos armando, no algo entregado.
create or replace function public._portal_servicio(p_client text)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'vence', c.service_ends_at,
    'diasRestantes', case when c.service_ends_at is null then null
                          else (c.service_ends_at - current_date) end,
    'diasAtraso', public._portal_atraso(p_client),
    'pausado', (c.status = 'paused'),
    'diasPausado', public._portal_dias_pausado(
       p_client, coalesce(nullif(btrim(c.start_date), '')::timestamptz, c.created_at, now())),
    'funnels', case
      when c.funnels_producto is null and c.funnels_reclutamiento is null then null
      else jsonb_build_object(
        'productoContratados',      coalesce(c.funnels_producto, 0),
        'reclutamientoContratados', coalesce(c.funnels_reclutamiento, 0),
        'productoEntregados', (select count(*)::int from public.strategy_pages sp
                                where sp.client_id = c.id and sp.tipo = 'producto'
                                  and coalesce(sp.status,'') <> 'borrador'),
        'reclutamientoEntregados', (select count(*)::int from public.strategy_pages sp
                                     where sp.client_id = c.id and sp.tipo = 'reclutamiento'
                                       and coalesce(sp.status,'') <> 'borrador'))
      end
  )
  from public.clients c where c.id = p_client;
$function$;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   -- Sin cargar nada, 'funnels' tiene que venir null (el portal no muestra nada):
--   select public._portal_servicio('<client_id>') -> 'funnels';
--
--   -- Cargando 3 de producto, tiene que contar los que existen:
--   update public.clients set funnels_producto = 3 where id = '<client_id>';
--
-- ROLLBACK:
--   volver a la definición anterior de _portal_servicio (portal_v79_cliente_pausado.sql:118-132
--   con el parche de portal_v85) y:
--   alter table public.clients drop column if exists funnels_producto, drop column if exists funnels_reclutamiento;
