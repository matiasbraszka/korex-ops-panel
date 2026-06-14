-- Stripe v5: materializar la llegada a Mercury en columnas reales de stripe_charges.
-- La vista stripe_charges_x (603 filas con cruces anidados) superaba el statement_timeout
-- de 8s del rol authenticated → el navegador recibía vacío ("No hay pagos que coincidan").
-- Solución: columnas materializadas que pobla korex_stripe_derive() (cron), lectura directa.

ALTER TABLE public.stripe_charges
  ADD COLUMN IF NOT EXISTS payout_id          text,
  ADD COLUMN IF NOT EXISTS mercury_arrived_at  timestamptz,
  ADD COLUMN IF NOT EXISTS trace_id            text;

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
  FROM link
  WHERE link.charge_id = sc.id
    AND (sc.payout_id IS DISTINCT FROM link.payout_id
      OR sc.mercury_arrived_at IS DISTINCT FROM link.mercury_arrived_at
      OR sc.trace_id IS DISTINCT FROM link.trace_id);
END $$;

DROP VIEW IF EXISTS public.stripe_charges_x;
