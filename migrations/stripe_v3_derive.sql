-- Stripe v3: deducción de categoría (CRM/Publicidad) y cliente desde el producto,
-- con soporte de override manual (category override + client_locked).
ALTER TABLE public.stripe_charges ADD COLUMN IF NOT EXISTS client_locked boolean DEFAULT false;

CREATE OR REPLACE FUNCTION public.korex_stripe_derive() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Categoría automática desde el nombre del producto.
  -- CRM = "Sistema de duplicación" (el CRM de Korex) / upgrades de meses / acceso CRM.
  UPDATE public.stripe_charges SET category_auto = CASE
    WHEN product_name ~* 'duplicaci[oó]n|\ycrm\y|acceso crm|upgrade de [0-9]+ *mes' THEN 'crm'
    WHEN product_name ~* 'publicidad|meta ?ad|\yads\y|facebook|anuncio|tiktok ?ad'   THEN 'publicidad'
    ELSE NULL END
  WHERE product_name IS NOT NULL;

  -- Cliente: solo filas no bloqueadas y sin cliente, con un único match por nombre.
  UPDATE public.stripe_charges sc SET client_id = c.id
  FROM public.clients c
  WHERE sc.product_name IS NOT NULL AND coalesce(sc.client_locked, false) = false AND sc.client_id IS NULL
    AND length(c.name) >= 3 AND sc.product_name ILIKE '%' || c.name || '%'
    AND (SELECT count(*) FROM public.clients c2
         WHERE length(c2.name) >= 3 AND sc.product_name ILIKE '%' || c2.name || '%') = 1;
END $$;

GRANT EXECUTE ON FUNCTION public.korex_stripe_derive() TO service_role, authenticated;
