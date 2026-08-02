-- stripe_v5_korex_matcher.sql
--
-- El pedido original era quitar de los ingresos de Mercury los movimientos que
-- dicen KOREX, asumiendo que eran transferencias internas. Se verifico contra la
-- base ANTES de tocar nada y NO lo son:
--
--   counterparty_name   | movs |    total   | que es
--   --------------------+------+------------+------------------------------------
--   Korex Project LL    |  108 | 184.798,79 | payouts de Stripe llegando a Mercury
--   KOREX PROJECT LL    |    1 |   4.990,17 | idem
--   Korex               |    5 |   1.920,78 | idem, con el nombre acortado
--
-- Los 5 "Korex" de julio (286,20 / 381,80 / 763,60 / 190,90 / 298,28) coinciden
-- EXACTO en monto y fecha con filas de stripe_payouts. Las transferencias internas
-- de verdad ya se excluyen por otro lado (kind 'internalTransfer' y los
-- counterparty 'Mercury Checking%' / 'Mercury Savings%'), y esos filtros quedan
-- intactos.
--
-- Decision de Matias: esos movimientos NO se muestran en la pestana de Ingresos.
-- Son plata que ya se conto en Stripe y que recien aterriza en Mercury; listarlos
-- ahi la duplicaba. El filtro se hace en la PANTALLA (MercuryPage), que es el unico
-- consumidor de esta vista — verificado por grep. Nada de mercury_transactions ni
-- del area de Finanzas se toca: no hay riesgo de mover un numero contable.
--
-- Para poder filtrarlos primero hay que reconocerlos, y ahi estaba el bug: Mercury
-- acorto el nombre de "Korex Project LL" a "Korex" el 22/07/2026, y el matcher
-- buscaba 'Korex Project%'. Desde esa fecha los payouts dejaron de marcarse como
-- Stripe: se perdio el chip morado, el desglose de clientes de cada payout y el
-- cruce con stripe_payouts_x / stripe_charges_x.
--
-- Fix: ampliar el patron a 'Korex%'. Verificado que no genera falsos positivos —
-- no existe ningun ingreso con 'korex' en el nombre que no sea un payout. Esta
-- migracion solo redefine VISTAS (calculo de lectura): no altera ni una fila.
--
-- Base: la definicion viva sacada con pg_get_viewdef (coincide con
-- migrations/stripe_v4_setup_traceid_arrival.sql).

create or replace view public.mercury_ingresos with (security_invoker = on) as
 SELECT m.id,
    m.account_id,
    m.amount,
    m.counterparty_name,
    m.kind,
    m.status,
    (m.raw ->> 'postedAt'::text)::timestamp with time zone AS posted_at,
    m.counterparty_name ~~* 'Korex%'::text AS is_stripe_payout,
    sp.id AS stripe_payout_id
   FROM mercury_transactions m
     LEFT JOIN LATERAL ( SELECT p.id
           FROM stripe_payouts p
          WHERE p.amount = m.amount
            AND ((m.raw ->> 'postedAt'::text)::timestamp with time zone) >= (p.arrival_date - '6 days'::interval)
            AND ((m.raw ->> 'postedAt'::text)::timestamp with time zone) <= (p.arrival_date + '4 days'::interval)
          ORDER BY (abs(EXTRACT(epoch FROM ((m.raw ->> 'postedAt'::text)::timestamp with time zone) - p.arrival_date)))
         LIMIT 1) sp ON m.counterparty_name ~~* 'Korex%'::text
  WHERE m.amount > 0::numeric
    AND (COALESCE(m.status, ''::text) <> ALL (ARRAY['failed'::text, 'cancelled'::text, 'blocked'::text, 'reversed'::text]))
    AND COALESCE(m.kind, ''::text) <> 'internalTransfer'::text
    AND COALESCE(m.counterparty_name, ''::text) !~~* 'Mercury Checking%'::text
    AND COALESCE(m.counterparty_name, ''::text) !~~* 'Mercury Savings%'::text;

-- El mismo patron viejo dejaba ciega la vista de cruce payout <-> Mercury. Medido
-- antes de tocar: de 114 payouts, 109 cruzados y 5 sin cruzar, que son exactamente
-- los 5 del nombre corto. De aca cuelga stripe_charges_x (mercury_arrived_at,
-- mercury_tx_id, trace_id), asi que sin esto la conciliacion queda con agujeros.
--
-- CREATE OR REPLACE (no DROP): las columnas no cambian, solo el WHERE del lateral.
-- Dropear obligaria a recrear tambien stripe_charges_x, que depende de esta.
create or replace view public.stripe_payouts_x with (security_invoker = on) as
 SELECT p.id, p.amount, p.currency, p.status, p.arrival_date, p.method, p.automatic,
    p.destination, p.description, p.statement_descriptor, p.failure_code,
    p.failure_message, p.reconciliation_status, p.balance_transaction, p.created_at,
    p.raw, p.synced_at,
    (p.raw -> 'trace_id'::text) ->> 'value'::text AS trace_id,
    m.id AS mercury_tx_id,
    (m.raw ->> 'postedAt'::text)::timestamp with time zone AS mercury_arrived_at,
    m.account_id AS mercury_account_id,
    m.raw ->> 'trackingNumber'::text AS mercury_tracking,
    (m.raw ->> 'trackingNumber'::text) = ((p.raw -> 'trace_id'::text) ->> 'value'::text) AS matched_by_id
   FROM stripe_payouts p
     LEFT JOIN LATERAL ( SELECT mt.id, mt.account_id, mt.raw
           FROM mercury_transactions mt
          WHERE mt.amount > 0::numeric
            AND mt.counterparty_name ~~* 'Korex%'::text
            AND (NULLIF((p.raw -> 'trace_id'::text) ->> 'value'::text, ''::text) IS NOT NULL
                 AND (mt.raw ->> 'trackingNumber'::text) = ((p.raw -> 'trace_id'::text) ->> 'value'::text)
              OR mt.amount = p.amount
                 AND ((mt.raw ->> 'postedAt'::text)::timestamp with time zone) >= (p.arrival_date - '4 days'::interval)
                 AND ((mt.raw ->> 'postedAt'::text)::timestamp with time zone) <= (p.arrival_date + '6 days'::interval))
          ORDER BY (
                CASE
                    WHEN (mt.raw ->> 'trackingNumber'::text) = ((p.raw -> 'trace_id'::text) ->> 'value'::text) THEN 0
                    ELSE 1
                END), (abs(EXTRACT(epoch FROM ((mt.raw ->> 'postedAt'::text)::timestamp with time zone) - p.arrival_date)))
         LIMIT 1) m ON true;

grant select on public.stripe_payouts_x to authenticated, service_role;

-- Verificacion despues de aplicar:
--   -- los 6 payouts de julio marcados y cruzados
--   select posted_at::date, amount, counterparty_name, is_stripe_payout, stripe_payout_id
--     from public.mercury_ingresos
--    where posted_at >= '2026-07-20' and counterparty_name ilike 'korex%'
--    order by posted_at;
--
--   -- tiene que dar 114 / 114 / 0 (antes: 114 / 109 / 5)
--   select count(*) total, count(mercury_tx_id) cruzados,
--          count(*) filter (where mercury_tx_id is null and arrival_date >= '2026-07-20') sin_cruzar
--     from public.stripe_payouts_x;
--
-- El total de ingresos del periodo NO debe cambiar: esto no filtra nada nuevo,
-- solo reconoce lo que ya estaba entrando.
