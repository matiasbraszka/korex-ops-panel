-- Stripe v2: cruce Mercury↔Stripe + columnas para producto/categoría/cliente/respuestas.
-- Los payouts de Stripe llegan a Mercury (cuenta "Fondos Generales") como "Korex Project LL",
-- apilados. Se cruzan por monto (USD) + fecha (postedAt ≈ arrival_date).

-- Columnas de enriquecimiento del cobro (se llenan cuando haya permiso de Checkout Sessions).
ALTER TABLE public.stripe_charges
  ADD COLUMN IF NOT EXISTS product_id       text,
  ADD COLUMN IF NOT EXISTS product_name     text,   -- ej "Bitradex y Korex | Acceso CRM | 350 USD"
  ADD COLUMN IF NOT EXISTS category_auto    text,   -- crm | publicidad | otro (deducido del producto)
  ADD COLUMN IF NOT EXISTS category         text,   -- override manual de Matias
  ADD COLUMN IF NOT EXISTS client_id        text,   -- cliente del sistema (clients.id)
  ADD COLUMN IF NOT EXISTS customer_phone   text,
  ADD COLUMN IF NOT EXISTS checkout_answers jsonb;  -- respuestas del checkout (custom_fields)
CREATE INDEX IF NOT EXISTS stripe_charges_client_idx ON public.stripe_charges(client_id);

-- Vista: payout de Stripe + su llegada real a Mercury (si ya llegó).
DROP VIEW IF EXISTS public.stripe_payouts_x;
CREATE VIEW public.stripe_payouts_x WITH (security_invoker = on) AS
SELECT
  p.*,
  m.id        AS mercury_tx_id,
  (m.raw->>'postedAt')::timestamptz AS mercury_arrived_at,
  m.account_id AS mercury_account_id
FROM public.stripe_payouts p
LEFT JOIN LATERAL (
  SELECT mt.id, mt.account_id, mt.raw
  FROM public.mercury_transactions mt
  WHERE mt.amount = p.amount
    AND mt.amount > 0
    AND mt.counterparty_name ILIKE 'Korex Project%'
    AND (mt.raw->>'postedAt')::timestamptz
        BETWEEN p.arrival_date - interval '4 days' AND p.arrival_date + interval '6 days'
  ORDER BY abs(extract(epoch FROM ((mt.raw->>'postedAt')::timestamptz - p.arrival_date)))
  LIMIT 1
) m ON true;
GRANT SELECT ON public.stripe_payouts_x TO authenticated, service_role;

-- Vista: ingresos de Mercury (todo lo que entra), marcando los que son payouts de Stripe
-- y enlazándolos al payout correspondiente (para saber qué clientes los componen).
DROP VIEW IF EXISTS public.mercury_ingresos;
CREATE VIEW public.mercury_ingresos WITH (security_invoker = on) AS
SELECT
  m.id,
  m.account_id,
  m.amount,
  m.counterparty_name,
  m.kind,
  m.status,
  (m.raw->>'postedAt')::timestamptz AS posted_at,
  (m.counterparty_name ILIKE 'Korex Project%') AS is_stripe_payout,
  sp.id AS stripe_payout_id
FROM public.mercury_transactions m
LEFT JOIN LATERAL (
  SELECT p.id
  FROM public.stripe_payouts p
  WHERE p.amount = m.amount
    AND (m.raw->>'postedAt')::timestamptz
        BETWEEN p.arrival_date - interval '6 days' AND p.arrival_date + interval '4 days'
  ORDER BY abs(extract(epoch FROM ((m.raw->>'postedAt')::timestamptz - p.arrival_date)))
  LIMIT 1
) sp ON (m.counterparty_name ILIKE 'Korex Project%')
WHERE m.amount > 0
  AND coalesce(m.status, '') NOT IN ('failed', 'cancelled', 'blocked', 'reversed');
GRANT SELECT ON public.mercury_ingresos TO authenticated, service_role;

-- Actualizar la vista de items del payout para exponer producto/categoría/cliente (se llenan luego).
DROP VIEW IF EXISTS public.stripe_payout_items;
CREATE VIEW public.stripe_payout_items WITH (security_invoker = on) AS
SELECT
  bt.payout_id,
  bt.id            AS balance_tx_id,
  bt.type,
  bt.reporting_category,
  bt.source,
  bt.amount_usd,
  bt.fee_usd,
  bt.net_usd,
  bt.created_at,
  c.customer_name,
  c.customer_email,
  c.customer_phone,
  c.amount         AS charge_amount,
  c.currency       AS charge_currency,
  c.description    AS charge_description,
  c.status         AS charge_status,
  c.product_name,
  c.category_auto,
  c.category,
  c.client_id
FROM public.stripe_balance_transactions bt
LEFT JOIN public.stripe_charges c ON c.id = bt.source
WHERE bt.payout_id IS NOT NULL AND bt.type <> 'payout';
GRANT SELECT ON public.stripe_payout_items TO authenticated, service_role;
