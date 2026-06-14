-- Stripe v6: desglose del neto. El neto = lo que pagó la persona (convertido a USD)
-- menos comisión de proceso de Stripe y comisión por cambio de divisa.
ALTER TABLE public.stripe_charges
  ADD COLUMN IF NOT EXISTS gross_usd  numeric,   -- monto convertido a USD (antes de comisiones)
  ADD COLUMN IF NOT EXISTS fee_fx_usd numeric;   -- parte de la comisión por cambio de divisa

-- korex_stripe_derive: categoría/cliente + vínculo Mercury + montos del balance transaction.
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

  WITH link AS (
    SELECT c.id AS charge_id, bt.payout_id, px.mercury_arrived_at, px.trace_id
    FROM public.stripe_charges c
    LEFT JOIN LATERAL (
      SELECT b.payout_id FROM public.stripe_balance_transactions b
      WHERE b.source = c.id AND b.payout_id IS NOT NULL ORDER BY b.created_at DESC LIMIT 1
    ) bt ON true
    LEFT JOIN public.stripe_payouts_x px ON px.id = bt.payout_id
  )
  UPDATE public.stripe_charges sc
  SET payout_id = link.payout_id, mercury_arrived_at = link.mercury_arrived_at, trace_id = link.trace_id
  FROM link WHERE link.charge_id = sc.id
    AND (sc.payout_id IS DISTINCT FROM link.payout_id OR sc.mercury_arrived_at IS DISTINCT FROM link.mercury_arrived_at OR sc.trace_id IS DISTINCT FROM link.trace_id);

  -- Neto, comisión total, bruto USD y comisión de cambio — todo del balance transaction.
  WITH feebt AS (
    SELECT b.source AS charge_id, b.amount_usd AS gross_usd, b.net_usd, b.fee_usd,
      coalesce((SELECT sum((fd->>'amount')::numeric)/100
                FROM jsonb_array_elements(b.raw->'fee_details') fd
                WHERE fd->>'description' ILIKE '%conversion%'), 0) AS fee_fx_usd
    FROM public.stripe_balance_transactions b
    WHERE b.type IN ('charge', 'payment') AND b.source IS NOT NULL
  )
  UPDATE public.stripe_charges sc
  SET gross_usd = feebt.gross_usd, fee_fx_usd = feebt.fee_fx_usd, net_usd = feebt.net_usd, fee_usd = feebt.fee_usd
  FROM feebt WHERE feebt.charge_id = sc.id
    AND (sc.gross_usd IS DISTINCT FROM feebt.gross_usd OR sc.fee_fx_usd IS DISTINCT FROM feebt.fee_fx_usd
      OR sc.net_usd IS DISTINCT FROM feebt.net_usd OR sc.fee_usd IS DISTINCT FROM feebt.fee_usd);
END $$;
