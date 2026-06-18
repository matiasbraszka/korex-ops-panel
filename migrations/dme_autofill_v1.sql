-- Autocompletado del DME desde Finanzas.
-- Devuelve, para (cliente, fecha), las métricas que el sistema YA conoce a partir
-- de fin_incomes + fin_commission_entries. Las que no tienen dato se omiten
-- (jsonb_strip_nulls) para que en el front queden en blanco, no en 0.
--
-- Mapeo (definiciones validadas contra el área Finanzas):
--   facturacion_setups = Σ net_usd      de ingresos SETUP
--   cashcollect_setups = Σ korex_real   de ingresos SETUP   (lo que le queda a Korex)
--   cashcollect_pub    = Σ korex_real   de ingresos PUBLICIDAD
--   invertido_pub      = Σ amount_usd   de ingresos PUBLICIDAD (lo que invirtieron los usuarios)
--   comisiones_setups  = Σ comisiones repartidas (excluye rol 'korex') de ingresos SETUP
--   comisiones_pub     = Σ comisiones repartidas (excluye rol 'korex') de ingresos PUBLICIDAD
--   cargas_nuevas_pub  = pagadores de publicidad del día cuyo PRIMER pago (histórico) es ese día
--   recargas_pub       = pagadores de publicidad del día que ya habían pagado antes

create or replace function public.dme_autofill_finanzas(p_client_id text, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fact_setups   numeric;
  v_cc_setups     numeric;
  v_cc_pub        numeric;
  v_invertido_pub numeric;
  v_com_setups    numeric;
  v_com_pub       numeric;
  v_payers        int;
  v_nuevas        int;
  v_recargas      int;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden autocompletar el DME desde Finanzas.';
  end if;

  -- Facturación + CashCollect + invertido (NULL si no hay ingresos de ese tipo ese día).
  select sum(net_usd)    filter (where effective_type = 'SETUP'),
         sum(korex_real) filter (where effective_type = 'SETUP'),
         sum(korex_real) filter (where effective_type = 'PUBLICIDAD'),
         sum(amount_usd) filter (where effective_type = 'PUBLICIDAD')
    into v_fact_setups, v_cc_setups, v_cc_pub, v_invertido_pub
  from fin_incomes
  where client_id = p_client_id and income_date = p_date;

  -- Comisiones repartidas (excluye el rol Korex = margen propio).
  select sum(ce.amount) filter (where i.effective_type = 'SETUP'),
         sum(ce.amount) filter (where i.effective_type = 'PUBLICIDAD')
    into v_com_setups, v_com_pub
  from fin_commission_entries ce
  join fin_incomes i on i.id = ce.income_id
  left join fin_roles r on r.key = ce.role_key
  where i.client_id = p_client_id and i.income_date = p_date
    and coalesce(r.is_korex, ce.role_key = 'korex') = false;

  -- Cargas de publicidad: pagadores únicos del día, separando nuevos de recargas.
  with primeros as (
    select payer_name, min(income_date) as primera
    from fin_incomes
    where client_id = p_client_id and effective_type = 'PUBLICIDAD' and payer_name is not null
    group by payer_name
  ),
  pagos_dia as (
    select distinct payer_name
    from fin_incomes
    where client_id = p_client_id and income_date = p_date
      and effective_type = 'PUBLICIDAD' and payer_name is not null
  )
  select count(*),
         count(*) filter (where pr.primera = p_date),
         count(*) filter (where pr.primera < p_date)
    into v_payers, v_nuevas, v_recargas
  from pagos_dia pd join primeros pr using (payer_name);

  return jsonb_strip_nulls(jsonb_build_object(
    'facturacion_setups', v_fact_setups,
    'cashcollect_setups', v_cc_setups,
    'cashcollect_pub',    v_cc_pub,
    'invertido_pub',      v_invertido_pub,
    'comisiones_setups',  v_com_setups,
    'comisiones_pub',     v_com_pub,
    -- cargas solo si hubo actividad de publicidad ese día (si no, blanco)
    'cargas_nuevas_pub',  case when v_payers > 0 then v_nuevas end,
    'recargas_pub',       case when v_payers > 0 then v_recargas end
  ));
end;
$$;

revoke all on function public.dme_autofill_finanzas(text, date) from public, anon;
grant execute on function public.dme_autofill_finanzas(text, date) to authenticated;
