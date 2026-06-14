-- Stripe v4: categoría SETUP, linkeo por ID (trace_id=trackingNumber), llegada por-cobro,
-- e ingresos de Mercury sin movimientos internos.

-- 1) korex_stripe_derive: agrega SETUP (pago inicial/onboarding) con prioridad sobre CRM.
CREATE OR REPLACE FUNCTION public.korex_stripe_derive() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.stripe_charges SET category_auto = CASE
    WHEN product_name ~* 'setup|onboarding|primera cuota'                          THEN 'setup'
    WHEN product_name ~* 'duplicaci[oó]n|\ycrm\y|acceso crm|upgrade de [0-9]+ *mes' THEN 'crm'
    WHEN product_name ~* 'publicidad|meta ?ad|\yads\y|facebook|anuncio|tiktok ?ad'  THEN 'publicidad'
    ELSE NULL END
  WHERE product_name IS NOT NULL;

  UPDATE public.stripe_charges sc SET client_id = c.id
  FROM public.clients c
  WHERE sc.product_name IS NOT NULL AND coalesce(sc.client_locked, false) = false AND sc.client_id IS NULL
    AND length(c.name) >= 3 AND sc.product_name ILIKE '%' || c.name || '%'
    AND (SELECT count(*) FROM public.clients c2
         WHERE length(c2.name) >= 3 AND sc.product_name ILIKE '%' || c2.name || '%') = 1;
END $$;

-- 2) Payouts ↔ Mercury por trackingNumber = trace_id (ID exacto), fallback monto+fecha.
DROP VIEW IF EXISTS public.stripe_charges_x;
DROP VIEW IF EXISTS public.stripe_payouts_x;
CREATE VIEW public.stripe_payouts_x WITH (security_invoker = on) AS
SELECT p.*,
  (p.raw->'trace_id'->>'value') AS trace_id,
  m.id AS mercury_tx_id,
  (m.raw->>'postedAt')::timestamptz AS mercury_arrived_at,
  m.account_id AS mercury_account_id,
  (m.raw->>'trackingNumber') AS mercury_tracking,
  ((m.raw->>'trackingNumber') = (p.raw->'trace_id'->>'value')) AS matched_by_id
FROM public.stripe_payouts p
LEFT JOIN LATERAL (
  SELECT mt.id, mt.account_id, mt.raw
  FROM public.mercury_transactions mt
  WHERE mt.amount > 0 AND mt.counterparty_name ILIKE 'Korex Project%'
    AND ( (nullif(p.raw->'trace_id'->>'value','') IS NOT NULL AND (mt.raw->>'trackingNumber') = (p.raw->'trace_id'->>'value'))
       OR (mt.amount = p.amount AND (mt.raw->>'postedAt')::timestamptz BETWEEN p.arrival_date - interval '4 days' AND p.arrival_date + interval '6 days') )
  ORDER BY CASE WHEN (mt.raw->>'trackingNumber') = (p.raw->'trace_id'->>'value') THEN 0 ELSE 1 END,
           abs(extract(epoch FROM ((mt.raw->>'postedAt')::timestamptz - p.arrival_date)))
  LIMIT 1
) m ON true;
GRANT SELECT ON public.stripe_payouts_x TO authenticated, service_role;

-- 3) Llegada por-cobro calculada en la DB (robusto).
CREATE VIEW public.stripe_charges_x WITH (security_invoker = on) AS
SELECT c.*, bt.payout_id, px.status AS payout_status, px.arrival_date AS payout_arrival_date,
  px.mercury_arrived_at, px.mercury_tx_id, px.trace_id
FROM public.stripe_charges c
LEFT JOIN LATERAL (
  SELECT b.payout_id FROM public.stripe_balance_transactions b
  WHERE b.source = c.id AND b.payout_id IS NOT NULL ORDER BY b.created_at DESC LIMIT 1
) bt ON true
LEFT JOIN public.stripe_payouts_x px ON px.id = bt.payout_id;
GRANT SELECT ON public.stripe_charges_x TO authenticated, service_role;

-- 4) Ingresos de Mercury: excluir movimientos internos entre cuentas propias.
DROP VIEW IF EXISTS public.mercury_ingresos;
CREATE VIEW public.mercury_ingresos WITH (security_invoker = on) AS
SELECT m.id, m.account_id, m.amount, m.counterparty_name, m.kind, m.status,
  (m.raw->>'postedAt')::timestamptz AS posted_at,
  (m.counterparty_name ILIKE 'Korex Project%') AS is_stripe_payout, sp.id AS stripe_payout_id
FROM public.mercury_transactions m
LEFT JOIN LATERAL (
  SELECT p.id FROM public.stripe_payouts p
  WHERE p.amount = m.amount
    AND (m.raw->>'postedAt')::timestamptz BETWEEN p.arrival_date - interval '6 days' AND p.arrival_date + interval '4 days'
  ORDER BY abs(extract(epoch FROM ((m.raw->>'postedAt')::timestamptz - p.arrival_date))) LIMIT 1
) sp ON (m.counterparty_name ILIKE 'Korex Project%')
WHERE m.amount > 0
  AND coalesce(m.status, '') NOT IN ('failed', 'cancelled', 'blocked', 'reversed')
  AND coalesce(m.kind, '') <> 'internalTransfer'
  AND coalesce(m.counterparty_name, '') NOT ILIKE 'Mercury Checking%'
  AND coalesce(m.counterparty_name, '') NOT ILIKE 'Mercury Savings%';
GRANT SELECT ON public.mercury_ingresos TO authenticated, service_role;