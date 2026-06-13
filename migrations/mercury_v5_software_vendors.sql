-- Amplía la lista de proveedores de Software (la pasó Matías) en la categorización.
-- Nota: \m y \M son límites de palabra de Postgres (no \b).
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
    WHEN p_counterparty ~* '(cursor|fathom|openai|anthropic|claude|chatgpt|google|gsuite|workspace|microsoft|office ?365|adobe|vercel|supabase|github|gitlab|notion|slack|zoom|canva|figma|render\.com|railway|cloudflare|namecheap|godaddy|hostinger|digitalocean|amazon web|\maws\M|twilio|twillo|tuilio|sendgrid|mailgun|mailchimp|calendly|\mloom\M|zapier|make\.com|\mn8n\M|elevenlabs|eleven labs|midjourney|runway|descript|hubspot|airtable|typeform|wix|squarespace|semrush|ahrefs|capcut|hotjar|intercom|linear\.app|atlassian|dropbox|grammarly|perplexity|apify|relevance|gohighlevel|filesafe|ontop|redis|contabo|centralize|skool|sing\.com|bitwarden|voomly|snus24|ads ?power|adspower|kraken|payward|iproyal)'
      THEN 'Software'
    WHEN p_kind IN ('outgoingPayment','externalTransfer')
      THEN 'Pagos / transferencias externas'
    WHEN p_kind IN ('debitCardTransaction','creditCardTransaction')
      THEN 'Otros gastos con tarjeta'
    ELSE 'Otros'
  END;
$$;
