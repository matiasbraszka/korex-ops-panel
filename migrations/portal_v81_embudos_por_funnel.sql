-- portal_v81_embudos_por_funnel.sql   [APLICADA EN PROD 2026-08-02]
--
-- Segunda mitad de [portal_v80_avance_por_funnel]. El portal listaba UN embudo por
-- carpeta de Drive (`distinct on (sp.strategy_id)`), asi que los 3 funnels de
-- Daniel Serrano y los 2 de Korex se veian como uno solo. Ahora la unidad es el
-- funnel (strategy_pages.id), igual que en el resto del sistema.
--
-- Resultado medido: Daniel Serrano 1 -> 3 embudos, Korex 1 -> 2. Sergio Canovas y
-- Fabiana Carrasco siguen igual (ya tenian un funnel por carpeta).
--
-- Que se resuelve por que:
--   * DEL (guiones, revisiones, copy)  -> por sp.del_doc_id  (propio de cada funnel)
--   * recursos y material del cliente  -> por sp.strategy_id (la carpeta, compartida)
--   * la pagina publicada              -> del propio funnel
--
-- portal_pedidos_seed_funnels NO se toca a proposito: los pedidos de material se
-- siembran por carpeta, que es donde vive el material del cliente. Si se sembraran
-- por funnel, un cliente con 3 funnels en una carpeta recibiria el mismo pedido 3
-- veces.
--
-- Se edita la definicion VIVA con replace, para no transcribir 6.379 caracteres a
-- mano (misma tecnica que en portal_v79b). Si algun patron no aparece, aborta sin
-- tocar nada.

do $mig$
declare d text; o text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'portal_cliente_embudos';
  if d is null then raise exception 'portal_cliente_embudos no existe'; end if;
  o := d;

  -- 1) La fuente: un renglon por FUNNEL, exponiendo tambien su carpeta y su DEL.
  d := replace(d,
    'select distinct on (sp.strategy_id)
        sp.strategy_id as sid, sp.name, sp.status, sp.position,
        sp.official_domain, sp.prod_url, s.start_date
      from public.strategy_pages sp
      join public.strategies s on s.id = sp.strategy_id
      where sp.client_id = public.portal_cliente_client()
      order by sp.strategy_id, sp.position, sp.id',
    'select sp.id as sid, sp.strategy_id as strat, sp.del_doc_id as del_doc,
        sp.name, sp.status, sp.position,
        sp.official_domain, sp.prod_url, s.start_date
      from public.strategy_pages sp
      join public.strategies s on s.id = sp.strategy_id
      where sp.client_id = public.portal_cliente_client()
      order by sp.position, sp.id');

  -- 2) La etapa mira recursos del Drive -> va por carpeta.
  d := replace(d, 'public._portal_etapa(f.sid, f.status)', 'public._portal_etapa(f.strat, f.status)');

  -- 3) Las secciones del DEL -> por el documento del funnel.
  d := replace(d, 'ds.strategy_id = f.sid', 'ds.doc_id = f.del_doc');
  d := replace(d, 'ds.strategy_id=f.sid',   'ds.doc_id=f.del_doc');

  -- 4) Recursos y pedidos de material -> siguen por carpeta (son del cliente).
  d := replace(d, 'fr.strategy_id = f.sid', 'fr.strategy_id = f.strat');
  d := replace(d, 'pp.strategy_id=f.sid',   'pp.strategy_id=f.strat');

  -- 5) La pagina publicada es la del propio funnel, no la de un hermano.
  d := replace(d, 'sp2.strategy_id = f.sid', 'sp2.id = f.sid');

  if d = o then raise exception 'Ningun patron coincidio: abortado'; end if;
  if position('distinct on (sp.strategy_id)' in d) > 0 then
    raise exception 'Quedo el distinct on strategy_id: abortado';
  end if;
  if position('strategy_id = f.sid' in d) > 0 or position('strategy_id=f.sid' in d) > 0 then
    raise exception 'Quedo algun strategy_id = f.sid sin migrar: abortado';
  end if;

  execute d;
end $mig$;

-- El numero del chip "FUNNEL N" pasa a contar funnels, no carpetas. Usa el mismo
-- orden que la lista (position, id), asi el chip y la tarjeta siempre coinciden.
create or replace function public._portal_funnel_num(p_client text, p_strategy text)
returns int language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select n from (
    select sp.id as sid, row_number() over (order by sp.position nulls last, sp.id) as n
    from public.strategy_pages sp
    where sp.client_id = p_client
  ) q where q.sid = p_strategy;
$$;

-- portal_cliente_funnels(): la otra lista del portal, con el mismo problema.
-- (Hoy ninguna pantalla la consume — solo se usa api.embudos() — pero se corrige
-- igual para que no quede una fuente diciendo lo contrario.)
do $mig$
declare d text; o text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'portal_cliente_funnels';
  if d is null then raise exception 'portal_cliente_funnels no existe'; end if;
  o := d;

  d := replace(d,
    'select distinct on (sp.strategy_id)
        sp.strategy_id as sid, sp.name, sp.status, sp.position, sp.client_id,
        s.start_date, s.prioridad, s.visual_resources
      from public.strategy_pages sp
      join public.strategies s on s.id = sp.strategy_id
      where sp.client_id = public.portal_cliente_client()
      order by sp.strategy_id, sp.position, sp.id',
    'select sp.id as sid, sp.strategy_id as strat, sp.del_doc_id as del_doc,
        sp.name, sp.status, sp.position, sp.client_id,
        s.start_date, s.prioridad, s.visual_resources
      from public.strategy_pages sp
      join public.strategies s on s.id = sp.strategy_id
      where sp.client_id = public.portal_cliente_client()
      order by sp.position, sp.id');

  d := replace(d, 'public._portal_etapa(f.sid, f.status)', 'public._portal_etapa(f.strat, f.status)');
  d := replace(d, 'ds.strategy_id=f.sid', 'ds.doc_id=f.del_doc');

  if d = o then raise exception 'Ningun patron coincidio: abortado'; end if;
  if position('distinct on (sp.strategy_id)' in d) > 0 then
    raise exception 'Quedo el distinct on: abortado';
  end if;

  execute d;
end $mig$;

-- Verificacion:
--   -- Daniel 3, Korex 2, Sergio 3
--   select c.name, count(*) from public.clients c
--     join public.strategy_pages sp on sp.client_id = c.id
--    where c.name in ('Daniel Serrano','Korex','Sergio Canovas') group by 1;
--
--   -- que no quede ninguna funcion agrupando por carpeta (salvo el seed de pedidos)
--   select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.prokind='f'
--      and pg_get_functiondef(p.oid) like '%distinct on (sp.strategy_id)%';
