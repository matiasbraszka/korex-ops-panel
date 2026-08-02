-- portal_v78_funnel_num_real.sql
--
-- Pedido: "En Sergio Canovas aparece un funnel 4".
--
-- Diagnostico (medido en la base, cliente c_1775304975528_pzu8sk):
--
--   strategy                  | position | funnels | carpeta Drive
--   --------------------------+----------+---------+------------------------------
--   strat_1780566296_mcbyru   |    0     |    1    | Estrategia #1
--   strat_1782812554_7nybfc   |    1     |    1    | Estrategia #2
--   strat_1785574924_2dtzwj   |    2     |    0    | Estrategia #3   <-- sin funnel
--   strat_sergio_networkers   |    5     |    1    | (creada a mano, sin carpeta)
--
-- Hay 3 funnels reales y 4 filas en `strategies`. La "Estrategia #3" existe como
-- carpeta en el Drive (drive-sync la dio de alta) pero nunca se le creo el funnel.
--
-- El bug es que se numeraba con dos criterios distintos:
--   * _portal_funnel_num contaba TODAS las `strategies` con row_number() ->
--     "Tribu Crecimiento: Networkers" caia 4a porque la #3 vacia ocupaba lugar.
--   * portal_cliente_embudos lista solo las estrategias que TIENEN funnel, y
--     EmbudosScreen numera las tarjetas por indice del array -> ahi es la 3a.
-- Resultado: el chip decia "FUNNEL 4" y la tarjeta era la 3.
--
-- Fix: numerar solo las estrategias que tienen al menos un funnel, con el MISMO
-- orden que usa el listado (order by strategy_id, igual que el distinct on de
-- portal_cliente_embudos). Asi el chip y la tarjeta siempre coinciden, para todos
-- los clientes, sin cambiar el orden visual de nada.
--
-- A proposito NO se borra la fila de la Estrategia #3: strategy_pages.strategy_id
-- es ON DELETE CASCADE (borrar una estrategia se lleva sus funnels con avatares y
-- guiones) y ademas drive-sync la recrearia en el sync de las 06:00 mientras la
-- carpeta siga en el Drive. Que quede sin numero alcanza.

create or replace function public._portal_funnel_num(p_client text, p_strategy text)
returns int language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select n from (
    select f.sid, row_number() over (order by f.sid) as n
    from (
      select distinct on (sp.strategy_id) sp.strategy_id as sid
      from public.strategy_pages sp
      join public.strategies s on s.id = sp.strategy_id
      where sp.client_id = p_client
      order by sp.strategy_id, sp.position, sp.id
    ) f
  ) q where q.sid = p_strategy;
$$;

-- Verificacion: tiene que dar 3 (antes daba 4).
--   select public._portal_funnel_num('c_1775304975528_pzu8sk','strat_sergio_networkers');
--
-- Y el conteo de estrategias numeradas tiene que coincidir con el de tarjetas:
--   select count(distinct sp.strategy_id) from public.strategy_pages sp
--    where sp.client_id = 'c_1775304975528_pzu8sk';
--
-- Nota aparte para el equipo: revisar la "Estrategia #3" de Sergio — tiene carpeta
-- en el Drive y 12 nodos sincronizados, pero ningun funnel creado. O se le crea el
-- funnel, o se archiva la carpeta.
