-- Categorización automática de egresos (gastos / salidas de dinero).
-- Reglas por contraparte (counterparty_name) y tipo de movimiento (kind).
CREATE OR REPLACE FUNCTION public.korex_mercury_category(p_counterparty text, p_kind text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = public, pg_catalog AS $$
  SELECT CASE
    WHEN p_counterparty ILIKE 'facebook' OR p_counterparty ILIKE '%meta platform%'
      THEN 'Publicidad (Meta)'
    WHEN p_kind = 'internalTransfer'
         OR p_counterparty ILIKE 'Mercury Checking%' OR p_counterparty ILIKE 'Mercury Savings%'
      THEN 'Transferencias internas'
    WHEN p_counterparty ILIKE 'Mercury Credit'
      THEN 'Pago tarjeta de crédito'
    WHEN p_kind IN ('cardInternationalTransactionFee','billingEngineSubscriptionFee')
         OR p_counterparty ILIKE '%transaction fee%'
         OR p_counterparty ILIKE 'Mercury Technologies%' OR p_counterparty ILIKE 'Mercury IO%'
      THEN 'Comisiones y fees'
    WHEN p_counterparty ~* '(cursor|fathom|openai|anthropic|claude|chatgpt|google|gsuite|workspace|microsoft|office ?365|adobe|vercel|supabase|github|gitlab|notion|slack|zoom|canva|figma|render\.com|railway|cloudflare|namecheap|godaddy|hostinger|digitalocean|amazon web|\baws\b|twilio|sendgrid|mailgun|mailchimp|calendly|loom|zapier|make\.com|\bn8n\b|elevenlabs|eleven labs|midjourney|runway|descript|hubspot|airtable|typeform|wix|squarespace|semrush|ahrefs|capcut|hotjar|intercom|linear\.app|atlassian|dropbox|grammarly|perplexity|apify|relevance|gohighlevel|filesafe)'
      THEN 'Software'
    WHEN p_kind IN ('outgoingPayment','externalTransfer')
      THEN 'Pagos / transferencias externas'
    WHEN p_kind IN ('debitCardTransaction','creditCardTransaction')
      THEN 'Otros gastos con tarjeta'
    ELSE 'Otros'
  END;
$$;

-- Vista de egresos (débitos exitosos) con su categoría y el fondo. security_invoker
-- = on para que respete la RLS admin-only de mercury_transactions.
CREATE OR REPLACE VIEW public.mercury_egresos
WITH (security_invoker = on) AS
  SELECT t.id,
         t.account_id,
         coalesce(a.nickname, a.name) AS fund_label,
         public.korex_mercury_category(t.counterparty_name, t.kind) AS category,
         t.counterparty_name,
         t.merchant,
         t.kind,
         (-t.amount) AS amount,
         t.currency,
         t.tx_created_at,
         t.posted_at,
         t.status
  FROM public.mercury_transactions t
  LEFT JOIN public.mercury_accounts a ON a.id = t.account_id
  WHERE t.amount < 0 AND t.status NOT IN ('failed', 'cancelled');

GRANT SELECT ON public.mercury_egresos TO authenticated;
