-- Stripe (pagos) — SOLO LECTURA. Pagos (charges), payouts a Mercury, reembolsos y
-- disputas. Trazabilidad: qué pagos componen cada payout (vía balance transactions).
-- Análogo a Mercury/Kraken. RLS admin-only. Montos guardados en unidad mayor (÷100).

-- 1) Pagos recibidos (charges)
CREATE TABLE IF NOT EXISTS public.stripe_charges (
  id                  text PRIMARY KEY,         -- ch_...
  amount              numeric,                  -- en la moneda del cobro (eur/usd)
  currency            text,
  amount_refunded     numeric,
  status              text,                     -- succeeded | pending | failed
  paid                boolean,
  refunded            boolean,
  disputed            boolean,
  captured            boolean,
  description         text,
  customer_name       text,
  customer_email      text,
  payment_intent      text,
  receipt_url         text,
  failure_code        text,
  failure_message     text,
  risk_level          text,                     -- normal | elevated | highest
  net_usd             numeric,                  -- neto liquidado en USD (de balance tx)
  fee_usd             numeric,                  -- comisión Stripe en USD (de balance tx)
  balance_transaction text,
  created_at          timestamptz,
  raw                 jsonb,
  synced_at           timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stripe_charges_created_idx ON public.stripe_charges(created_at DESC);
CREATE INDEX IF NOT EXISTS stripe_charges_status_idx  ON public.stripe_charges(status);

-- 2) Payouts a Mercury
CREATE TABLE IF NOT EXISTS public.stripe_payouts (
  id                   text PRIMARY KEY,        -- po_...
  amount               numeric,                 -- USD
  currency             text,
  status               text,                    -- paid | pending | in_transit | canceled | failed
  arrival_date         timestamptz,             -- cuándo llega/llegó a Mercury
  method               text,                    -- standard | instant
  automatic            boolean,
  destination          text,                    -- ba_... (cuenta bancaria Mercury)
  description          text,
  statement_descriptor text,
  failure_code         text,
  failure_message      text,
  reconciliation_status text,
  balance_transaction  text,
  created_at           timestamptz,
  raw                  jsonb,
  synced_at            timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stripe_payouts_arrival_idx ON public.stripe_payouts(arrival_date DESC);
CREATE INDEX IF NOT EXISTS stripe_payouts_status_idx  ON public.stripe_payouts(status);

-- 3) Movimientos de saldo (capa de liquidación). Mapea cada cobro/reembolso/disputa
--    a su payout (payout_id) → trazabilidad de qué compone cada payout.
CREATE TABLE IF NOT EXISTS public.stripe_balance_transactions (
  id                  text PRIMARY KEY,         -- txn_...
  type                text,                     -- charge | payout | refund | dispute | adjustment | ...
  reporting_category  text,
  amount_usd          numeric,
  fee_usd             numeric,
  net_usd             numeric,
  currency            text,
  source              text,                     -- ch_/po_/re_/du_...
  payout_id           text,                     -- payout que lo liquidó (null = aún no pagado)
  exchange_rate       numeric,
  available_on        timestamptz,
  created_at          timestamptz,
  raw                 jsonb,
  synced_at           timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stripe_bt_payout_idx  ON public.stripe_balance_transactions(payout_id);
CREATE INDEX IF NOT EXISTS stripe_bt_source_idx  ON public.stripe_balance_transactions(source);
CREATE INDEX IF NOT EXISTS stripe_bt_created_idx ON public.stripe_balance_transactions(created_at DESC);

-- 4) Reembolsos
CREATE TABLE IF NOT EXISTS public.stripe_refunds (
  id                  text PRIMARY KEY,         -- re_...
  amount              numeric,
  currency            text,
  charge_id           text,
  payment_intent      text,
  status              text,                     -- succeeded | pending | failed | canceled | requires_action
  reason              text,
  balance_transaction text,
  created_at          timestamptz,
  raw                 jsonb,
  synced_at           timestamptz DEFAULT now(),
  alerted_at          timestamptz              -- aviso de reembolso nuevo (dedupe)
);
CREATE INDEX IF NOT EXISTS stripe_refunds_created_idx ON public.stripe_refunds(created_at DESC);
CREATE INDEX IF NOT EXISTS stripe_refunds_charge_idx  ON public.stripe_refunds(charge_id);

-- 5) Disputas / contracargos
CREATE TABLE IF NOT EXISTS public.stripe_disputes (
  id                   text PRIMARY KEY,        -- du_...
  amount               numeric,
  currency             text,
  charge_id            text,
  payment_intent       text,
  status               text,                    -- needs_response | warning_needs_response | under_review | won | lost | ...
  reason               text,
  evidence_due_by      timestamptz,             -- plazo para responder
  is_charge_refundable boolean,
  balance_transaction  text,
  created_at           timestamptz,
  raw                  jsonb,
  synced_at            timestamptz DEFAULT now(),
  alerted_at           timestamptz             -- aviso de disputa nueva (dedupe)
);
CREATE INDEX IF NOT EXISTS stripe_disputes_created_idx ON public.stripe_disputes(created_at DESC);
CREATE INDEX IF NOT EXISTS stripe_disputes_charge_idx  ON public.stripe_disputes(charge_id);

-- RLS admin-only en todas
ALTER TABLE public.stripe_charges               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_payouts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_balance_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_refunds               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_disputes              ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_charges_admin ON public.stripe_charges;
CREATE POLICY stripe_charges_admin ON public.stripe_charges FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS stripe_payouts_admin ON public.stripe_payouts;
CREATE POLICY stripe_payouts_admin ON public.stripe_payouts FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS stripe_bt_admin ON public.stripe_balance_transactions;
CREATE POLICY stripe_bt_admin ON public.stripe_balance_transactions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS stripe_refunds_admin ON public.stripe_refunds;
CREATE POLICY stripe_refunds_admin ON public.stripe_refunds FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS stripe_disputes_admin ON public.stripe_disputes;
CREATE POLICY stripe_disputes_admin ON public.stripe_disputes FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.stripe_charges, public.stripe_payouts, public.stripe_balance_transactions,
  public.stripe_refunds, public.stripe_disputes
  TO authenticated, service_role;

-- Vista de trazabilidad: items que componen cada payout (cobros/reembolsos/disputas)
-- resueltos con el cliente del cobro. security_invoker → respeta RLS admin de las tablas.
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
  c.amount         AS charge_amount,
  c.currency       AS charge_currency,
  c.description    AS charge_description,
  c.status         AS charge_status
FROM public.stripe_balance_transactions bt
LEFT JOIN public.stripe_charges c ON c.id = bt.source
WHERE bt.payout_id IS NOT NULL
  AND bt.type <> 'payout';   -- excluir la fila agregada del propio payout
GRANT SELECT ON public.stripe_payout_items TO authenticated, service_role;

-- Config (Matías carga la clave restringida de SOLO LECTURA rk_live_...)
INSERT INTO public.app_settings (key, value)
VALUES ('stripe_config', '{"api_token":"","cron_secret":"","webhook_secret":"","slack_channel":""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- pg_cron cada 15 min (se agenda aparte con el cron_secret real).
--   select cron.schedule('korex-stripe-sync', '*/15 * * * *', $$
--     select net.http_post(
--       url:='https://cgdwieoxjoexzlfbxrfc.supabase.co/functions/v1/stripe-sync',
--       headers:='{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
--       body:='{}'::jsonb);
--   $$);
