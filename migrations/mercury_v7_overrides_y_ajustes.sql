-- 1) Override manual de categoría por transacción (Matías puede reclasificar).
ALTER TABLE public.mercury_transactions ADD COLUMN IF NOT EXISTS category_override text;

-- 2) Categorización: + softwares (Retell, Genspark, Jam, Zadarma), fees más amplios
--    (wireFee y cualquier counterparty que termine en "fee"). Trademedia queda como
--    gasto de tarjeta (proveedor), no software.
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
    WHEN p_kind ILIKE '%fee%'
         OR p_counterparty ILIKE '%transaction fee%' OR p_counterparty ILIKE '%fee'
         OR p_counterparty ILIKE 'Mercury Technologies%' OR p_counterparty ILIKE 'Mercury IO%'
      THEN 'Comisiones y fees'
    WHEN p_kind IN ('outgoingPayment','externalTransfer')
      THEN 'Pagos / transferencias externas'
    WHEN p_counterparty ~* '(cursor|fathom|openai|anthropic|claude|chatgpt|google|gsuite|workspace|microsoft|office ?365|adobe|vercel|supabase|github|gitlab|notion|slack|zoom|canva|figma|render\.com|railway|cloudflare|namecheap|godaddy|hostinger|digitalocean|amazon web|\maws\M|twilio|twillo|tuilio|sendgrid|mailgun|mailchimp|calendly|\mloom\M|zapier|make\.com|\mn8n\M|elevenlabs|eleven labs|midjourney|runway|descript|hubspot|airtable|typeform|wix|squarespace|semrush|ahrefs|capcut|hotjar|intercom|linear\.app|atlassian|dropbox|grammarly|perplexity|apify|relevance|gohighlevel|filesafe|ontop|redis|contabo|centralize|skool|sing\.com|bitwarden|voomly|snus24|ads ?power|adspower|kraken|payward|iproyal|retell|genspark|\mjam\M|zadarma)'
      THEN 'Software'
    WHEN p_kind IN ('debitCardTransaction','creditCardTransaction')
      THEN 'Otros gastos con tarjeta'
    ELSE 'Otros'
  END;
$$;

-- 3) Vista de egresos: usa el override si existe; EXCLUYE los pagos de tarjeta de
--    crédito (Mercury Credit) para no duplicar el gasto real.
DROP VIEW IF EXISTS public.mercury_egresos;
CREATE VIEW public.mercury_egresos
WITH (security_invoker = on) AS
  SELECT t.id,
         t.account_id,
         coalesce(a.nickname, a.name) AS fund_label,
         coalesce(t.category_override, public.korex_mercury_category(t.counterparty_name, t.kind)) AS category,
         (t.category_override IS NOT NULL) AS is_override,
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
  WHERE t.amount < 0
    AND t.status NOT IN ('failed', 'cancelled')
    AND t.counterparty_name IS DISTINCT FROM 'Mercury Credit'
    AND coalesce(public.korex_mercury_category(t.counterparty_name, t.kind), '') <> 'Pago tarjeta de crédito';

GRANT SELECT ON public.mercury_egresos TO authenticated;
