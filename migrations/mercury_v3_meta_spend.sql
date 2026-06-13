-- Gasto en anuncios de Meta procesado EXITOSAMENTE por fondo.
-- En Mercury los cargos de Meta llegan como counterparty_name = 'Facebook'.
-- "Exitoso" = no failed/cancelled; los gastos son débitos (amount < 0).
-- SECURITY INVOKER (default): respeta la RLS admin-only de mercury_transactions.
CREATE OR REPLACE FUNCTION public.korex_mercury_meta_spend()
RETURNS TABLE(account_id text, meta_spend numeric)
LANGUAGE sql STABLE
SET search_path = public, pg_catalog AS $$
  SELECT account_id,
         sum(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS meta_spend
  FROM public.mercury_transactions
  WHERE counterparty_name ILIKE 'facebook'
    AND status NOT IN ('failed', 'cancelled')
  GROUP BY account_id;
$$;

GRANT EXECUTE ON FUNCTION public.korex_mercury_meta_spend() TO authenticated;
