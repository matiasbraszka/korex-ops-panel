-- ads_engine_v2_sync_cuentas.sql
--
-- Pedido: "Las cuentas publicitarias aparecen dos veces, una en publicidad y otra
-- en links, vamos a dejarlo solo en links y que se pueda colocar la divisa de esa
-- cuenta publicitaria para que el sistema no se confunda a la hora de procesar o
-- extraer las metricas de un cliente, todos los valores deben quedar como calculo
-- final en USD."
--
-- La divisa ahora se elige en Funnels > Configuracion de Meta y links, y se guarda
-- en clients.meta_ads (jsonb). Pero el motor de metricas no lee ese jsonb: lee la
-- tabla ads_accounts, que se habia sembrado UNA vez y despues quedo congelada.
-- O sea: cambiar la divisa en el panel no llegaba al motor.
--
-- Este trigger cierra ese hueco. Cada vez que se tocan las cuentas de un cliente,
-- ads_accounts queda sincronizada, y ahi ads-engine-sync toma currency para calcular
-- spend_usd = spend_native * fx_rate y spend_usd_taxed.
--
-- Que NO hace: no borra cuentas de ads_accounts que ya no esten en el jsonb. Se
-- marcan como 'interna' (el motor las ignora) en vez de borrarlas, para no perder
-- el historico de ads_spend_daily, que tiene FK contra esta tabla.

create or replace function public._ads_accounts_sync_cliente(p_client text)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_ids text[];
begin
  -- Alta/actualizacion de lo que hoy tiene cargado el cliente.
  with cuentas as (
    select
      -- El panel guarda a veces 'act_123' y a veces '123'. ads_accounts usa el
      -- numerico pelado, igual que la API de Meta.
      regexp_replace(coalesce(a->>'account_id', a->>'id', ''), '^act_', '') as account_id,
      nullif(btrim(coalesce(a->>'name', '')), '')                          as name,
      upper(coalesce(nullif(a->>'currency', ''), 'USD'))                   as currency,
      coalesce(nullif(a->>'status', ''), 'activa')                         as status,
      coalesce(nullif(a->>'managed_by', ''), 'korex')                      as managed_by,
      coalesce((a->>'use_token')::boolean, true)                           as use_token
    from public.clients c, lateral jsonb_array_elements(coalesce(c.meta_ads, '[]'::jsonb)) a
    where c.id = p_client
  ), validas as (
    select * from cuentas where account_id <> '' and account_id ~ '^[0-9]+$'
  )
  insert into public.ads_accounts (account_id, client_id, name, currency, status, managed_by, use_token, updated_at)
  select v.account_id, p_client, v.name, v.currency, v.status, v.managed_by, v.use_token, now()
  from validas v
  on conflict (account_id) do update set
    client_id  = excluded.client_id,
    name       = coalesce(excluded.name, public.ads_accounts.name),
    currency   = excluded.currency,
    status     = excluded.status,
    managed_by = excluded.managed_by,
    use_token  = excluded.use_token,
    updated_at = now();

  -- Las que se sacaron del cliente: se apagan, NO se borran (ads_spend_daily
  -- referencia esta tabla y perderiamos el historico de gasto).
  select coalesce(array_agg(regexp_replace(coalesce(a->>'account_id', a->>'id', ''), '^act_', '')), '{}')
    into v_ids
  from public.clients c, lateral jsonb_array_elements(coalesce(c.meta_ads, '[]'::jsonb)) a
  where c.id = p_client;

  update public.ads_accounts
     set status = 'interna', updated_at = now()
   where client_id = p_client
     and not (account_id = any(v_ids))
     and status <> 'interna';
end $$;

create or replace function public._trg_ads_accounts_sync()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' or new.meta_ads is distinct from old.meta_ads then
    perform public._ads_accounts_sync_cliente(new.id);
  end if;
  return new;
end $$;

drop trigger if exists clients_ads_accounts_sync on public.clients;
create trigger clients_ads_accounts_sync
  after insert or update of meta_ads on public.clients
  for each row execute function public._trg_ads_accounts_sync();

-- Puesta al dia inicial: arrastra lo que ya esta cargado hoy (incluidas las 4
-- cuentas en EUR y la de MXN, que es de donde venia la confusion de monedas).
do $$
declare r record;
begin
  for r in select id from public.clients where jsonb_array_length(coalesce(meta_ads, '[]'::jsonb)) > 0 loop
    perform public._ads_accounts_sync_cliente(r.id);
  end loop;
end $$;

-- Verificacion: las divisas del panel y las del motor tienen que coincidir.
--   select a.account_id, a.name, a.currency, a.status, c.name as cliente
--     from public.ads_accounts a join public.clients c on c.id = a.client_id
--    where a.currency <> 'USD' order by a.currency;
--
--   -- y que no quede ninguna cuenta del panel sin espejo en el motor:
--   select c.name, regexp_replace(coalesce(x->>'account_id', x->>'id',''),'^act_','') as acc
--     from public.clients c, lateral jsonb_array_elements(coalesce(c.meta_ads,'[]'::jsonb)) x
--    where regexp_replace(coalesce(x->>'account_id', x->>'id',''),'^act_','') <> ''
--      and not exists (select 1 from public.ads_accounts a
--                      where a.account_id = regexp_replace(coalesce(x->>'account_id', x->>'id',''),'^act_',''));
