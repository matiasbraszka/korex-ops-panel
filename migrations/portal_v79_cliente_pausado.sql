-- portal_v79_cliente_pausado.sql
--
-- Pedido: "Colocar cuando un cliente esta pausado para que no le cuente los tiempos
-- que adeuda algo en la plataforma; el tracking seria 'Pausado' en ese caso, para
-- sacar el tiempo de cuanto estuvo pausado."
--
-- Situacion previa: clients.status ya tenia el valor 'paused' y el selector en la
-- ficha ("Estado del proyecto": Activo / Pausado / Completado), pero NO hacia nada.
-- Ninguna funcion SQL leia clients.status; solo se usaba para filtrar listados.
--
-- Y _portal_atraso era un now() - fecha_ancla puro: si un proyecto se pausaba dos
-- meses de comun acuerdo, el cliente igual veia "Frenado por tu parte: 60 dias".
--
-- Solucion, calcada del patron que ya existe para tareas (tasks.status_history, que
-- helpers.js usa para el tiempo real por estado):
--   1. clients.status_history: historial append-only de cambios de estado.
--   2. _portal_dias_pausado(cliente, desde): dias pausados desde una fecha.
--   3. _portal_atraso: le resta a cada reloj los dias que el proyecto estuvo pausado.
--   4. portal_cliente_inicio: expone 'pausado' y 'diasPausado' para que el portal
--      muestre "Proyecto en pausa" en vez del contador.
--
-- Mientras el cliente esta pausado, el span abierto crece al mismo ritmo que el
-- tiempo total, asi que la resta queda constante: el contador se CONGELA solo, sin
-- necesidad de tocarlo a mano. Al reactivar, sigue desde donde habia quedado.

-- 1) Historial de estados del cliente ---------------------------------------
alter table public.clients
  add column if not exists status_history jsonb not null default '[]'::jsonb;

comment on column public.clients.status_history is
  'Append-only: [{at, from, to}] por cada cambio de status. Lo escribe el trigger clients_status_history. Sirve para descontar el tiempo en pausa.';

create or replace function public._clients_status_history()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_history := coalesce(old.status_history, '[]'::jsonb) || jsonb_build_object(
      'at', now(), 'from', old.status, 'to', new.status);
  end if;
  return new;
end $$;

drop trigger if exists clients_status_history on public.clients;
create trigger clients_status_history
  before update on public.clients
  for each row execute function public._clients_status_history();

-- 2) Dias que el proyecto estuvo pausado desde una fecha --------------------
-- Un tramo pausado va desde que status pasa a 'paused' hasta el cambio siguiente
-- (o hasta ahora, si sigue pausado). Se cuenta solo la parte que cae despues de
-- p_desde, porque cada reloj de _portal_atraso tiene su propio punto de partida.
--
-- OJO: el lead() se calcula ANTES de filtrar por 'paused'. Filtrar primero daria
-- el tramo hasta la proxima pausa en vez de hasta la proxima reactivacion.
create or replace function public._portal_dias_pausado(p_client text, p_desde timestamptz)
returns int language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  with h as (
    select (e->>'at')::timestamptz as at, e->>'to' as est
    from public.clients c, lateral jsonb_array_elements(coalesce(c.status_history, '[]'::jsonb)) e
    where c.id = p_client
  ), h2 as (
    select at, est, coalesce(lead(at) over (order by at), now()) as hasta from h
  ), spans as (
    select at as desde, hasta from h2 where est = 'paused'
  )
  select coalesce(
    sum(greatest(0, extract(epoch from (least(hasta, now()) - greatest(desde, p_desde))))) / 86400.0,
    0)::int
  from spans
  where hasta > p_desde and p_desde is not null;
$$;

-- 3) El atraso descuenta las pausas -----------------------------------------
create or replace function public._portal_atraso(p_client text)
returns integer language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(max(dias), 0)::int from (
    -- Grabaciones: guiones para grabar que el equipo no aprobó.
    select greatest(0,
      extract(day from now() - coalesce(ds.grab_flujo_at, ds.updated_at, ds.imported_at))::int
      - public._portal_dias_pausado(p_client, coalesce(ds.grab_flujo_at, ds.updated_at, ds.imported_at))
    ) as dias
    from public.del_sections ds
    left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = p_client
    where ds.client_id = p_client and ds.para_grabar and ds.kind in ('vsl','anuncios')
      and not coalesce(gs.grabado, false)
    union all
    -- Revisiones / copy: secciones 'revisar' + terminado sin revisar (incluye pg_*).
    select greatest(0,
      extract(day from now() - coalesce(ds.updated_at, ds.imported_at))::int
      - public._portal_dias_pausado(p_client, coalesce(ds.updated_at, ds.imported_at))
    )
    from public.del_sections ds
    left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = p_client
    where ds.client_id = p_client and coalesce(ds.estado_seccion,'') = 'terminado'
      and coalesce(ds.accion_cliente,'') = 'revisar' and not coalesce(gs.revisado, false)
    union all
    -- Material: pedidos abiertos.
    select greatest(0,
      extract(day from now() - pp.pedido_at)::int
      - public._portal_dias_pausado(p_client, pp.pedido_at)
    )
    from public.portal_pedidos pp
    left join lateral (select count(*) n from public.funnel_resources fr
      where fr.client_id = p_client and pp.bucket_key is not null and fr.bucket_key = pp.bucket_key
        and ((pp.strategy_id is null and fr.strategy_id is null) or fr.strategy_id = pp.strategy_id)) cnt on true
    where pp.client_id = p_client and pp.activo and pp.estado not in ('completo','validado')
      and not (pp.target_count is not null and coalesce(cnt.n,0) >= pp.target_count)
      and not (pp.bucket_key is not null and pp.target_count is null and coalesce(cnt.n,0) > 0)
  ) q;
$function$;

-- 4) El portal necesita saber que esta en pausa ------------------------------
-- Se agrega al objeto 'servicio' que arma portal_cliente_inicio(). Como esa funcion
-- es larga y la editamos en un solo punto, se hace con un helper que devuelve el
-- bloque entero; portal_cliente_inicio pasa a llamarlo.
create or replace function public._portal_servicio(p_client text)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'vence', c.service_ends_at,
    'diasRestantes', case when c.service_ends_at is null then null
                          else (c.service_ends_at - current_date) end,
    'diasAtraso', public._portal_atraso(p_client),
    'pausado', (c.status = 'paused'),
    -- Dias acumulados en pausa desde que arranco el servicio (para el historial).
    'diasPausado', public._portal_dias_pausado(
       p_client, coalesce(c.start_date::timestamptz, c.created_at, now()))
  )
  from public.clients c where c.id = p_client;
$$;

-- IMPORTANTE al aplicar: dentro de portal_cliente_inicio() hay que reemplazar el
-- bloque literal
--     'servicio', jsonb_build_object(
--       'vence', v_vence,
--       'diasRestantes', case when v_vence is null then null else (v_vence - current_date) end,
--       'diasAtraso', v_atraso),
-- por
--     'servicio', public._portal_servicio(v_cid),
-- Se deja como paso aparte a proposito: la funcion es larga y transcribirla entera
-- desde pg_get_functiondef es justo la clase de cosa que rompe algo sin querer.

-- Verificacion:
--   -- pausar un cliente de prueba y ver que el contador deja de crecer
--   update public.clients set status='paused' where id='<CLIENT_ID>';
--   select status_history from public.clients where id='<CLIENT_ID>';
--   select public._portal_atraso('<CLIENT_ID>');   -- anotar el valor
--   -- (esperar / o simular editando status_history en una copia) y repetir: igual.
--   update public.clients set status='active' where id='<CLIENT_ID>';
--   -- el atraso retoma desde donde estaba, sin el tiempo de pausa.
