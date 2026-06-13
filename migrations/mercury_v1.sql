-- mercury_v1: vinculación con Mercury (banco propio de Korex).
--
-- Etapa 1: visibilidad de fondos (cuentas) + tarjetas + transacciones, con foco
-- en ALERTAR las transacciones FALLIDAS a todos los administradores, en el panel
-- (buzón con campana, type 'mercury_failed_transaction') y en Slack (#alertas-mercury).
--
-- Ingesta (ambas escriben con service_role, saltan RLS):
--   · mercury-webhook  → webhook de Mercury en tiempo real (transaction.updated).
--   · mercury-sync     → pg_cron: refresca saldos/tarjetas y reprocesa fallidas
--                        recientes como red de seguridad por si se pierde un webhook.
-- El panel SOLO lee (RLS admin-only). "fondo" = cuenta Mercury (mercury_accounts);
-- tarjetas y transacciones cuelgan de una cuenta. Los ids son los de Mercury (text)
-- para que el upsert sea idempotente.

-- ── 1) Fondos (cuentas) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mercury_accounts (
  id                text PRIMARY KEY,             -- Mercury accountId
  name              text,
  kind              text,                         -- checking | savings | treasury | credit ...
  status            text,                         -- active | pending | archived | deleted
  current_balance   numeric,
  available_balance numeric,
  currency          text DEFAULT 'USD',
  raw               jsonb,
  synced_at         timestamptz,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ── 2) Tarjetas (por cuenta) ─────────────────────────────────────────────────
-- Guardamos SOLO los últimos 4 dígitos (last_four). Nunca el número completo.
CREATE TABLE IF NOT EXISTS public.mercury_cards (
  card_id      text PRIMARY KEY,                  -- Mercury cardId
  account_id   text REFERENCES public.mercury_accounts(id) ON DELETE SET NULL,
  name_on_card text,
  last_four    text,
  network      text,                              -- visa | mastercard
  type         text,                              -- virtual | physical
  status       text,                              -- active | frozen | cancelled | ...
  raw          jsonb,
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mercury_cards_account_idx ON public.mercury_cards(account_id);

-- ── 3) Transacciones (con campos de bandeja de revisión para las fallidas) ────
CREATE TABLE IF NOT EXISTS public.mercury_transactions (
  id                 text PRIMARY KEY,            -- Mercury transaction id
  account_id         text REFERENCES public.mercury_accounts(id) ON DELETE SET NULL,
  card_id            text,                        -- resuelto de details.{debit,credit}CardInfo.id
  status             text,                        -- pending|sent|cancelled|failed|reversed|blocked
  kind               text,                        -- debitCardTransaction | externalTransfer | ...
  amount             numeric,
  currency           text DEFAULT 'USD',
  counterparty_name  text,
  note               text,
  merchant           jsonb,                       -- categoría/MCC para card transactions
  reason_for_failure text,
  failed_at          timestamptz,
  posted_at          timestamptz,
  tx_created_at      timestamptz,                 -- createdAt de Mercury
  raw                jsonb,
  ingested_at        timestamptz DEFAULT now(),
  alerted_at         timestamptz,                 -- se setea al avisar (dedupe de la alerta)
  review_status      text DEFAULT 'pending',      -- pending | reviewed (solo aplica a las fallidas)
  reviewed_by        text,                        -- team_members.id
  reviewed_at        timestamptz,
  review_note        text
);

CREATE INDEX IF NOT EXISTS mercury_tx_status_idx  ON public.mercury_transactions(status);
CREATE INDEX IF NOT EXISTS mercury_tx_account_idx ON public.mercury_transactions(account_id);
CREATE INDEX IF NOT EXISTS mercury_tx_review_idx  ON public.mercury_transactions(review_status) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS mercury_tx_created_idx ON public.mercury_transactions(tx_created_at DESC);

-- ── 4) RLS admin-only (datos bancarios sensibles) ────────────────────────────
ALTER TABLE public.mercury_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercury_cards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercury_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mercury_accounts_admin_all ON public.mercury_accounts;
CREATE POLICY mercury_accounts_admin_all ON public.mercury_accounts
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS mercury_cards_admin_all ON public.mercury_cards;
CREATE POLICY mercury_cards_admin_all ON public.mercury_cards
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS mercury_transactions_admin_all ON public.mercury_transactions;
CREATE POLICY mercury_transactions_admin_all ON public.mercury_transactions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.mercury_accounts, public.mercury_cards, public.mercury_transactions
  TO authenticated, service_role;

-- Realtime: que la bandeja de fallidas se actualice sola en el panel.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mercury_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mercury_transactions;
  END IF;
END $$;

-- ── 5) Helper: ids de team_members que son administradores ────────────────────
-- Para los avisos a "todos los admins". Une por user_id con user_roles (misma
-- fuente que is_admin()) e incluye como respaldo a quienes tienen
-- can_access_settings, para no quedarnos sin destinatarios si user_roles está
-- incompleto. Lo consume la edge function (service_role) vía rpc.
CREATE OR REPLACE FUNCTION public.korex_admin_member_ids()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
  SELECT coalesce(array_agg(DISTINCT id), '{}')
  FROM (
    SELECT tm.id
      FROM public.team_members tm
      JOIN public.user_roles ur ON ur.user_id = tm.user_id
     WHERE ur.role = 'admin'
    UNION
    SELECT tm.id
      FROM public.team_members tm
     WHERE tm.can_access_settings = true
  ) s;
$$;

-- ── 6) Config: secretos y webhook de Mercury / Slack ─────────────────────────
-- Matías completa estos valores desde Supabase (sin secretos en el código):
--   api_token      → token de la API de Mercury (incluí el prefijo "secret-token:")
--   webhook_secret → firma del webhook de Mercury (o secreto simple en la URL)
--   cron_secret    → protege la edge function mercury-sync llamada por pg_cron
--   slack_webhook  → Incoming Webhook del canal #alertas-mercury
INSERT INTO public.app_settings (key, value)
VALUES ('mercury_config',
        '{"api_token":"","webhook_secret":"","cron_secret":"","slack_webhook":""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── 7) pg_cron: red de seguridad cada 15 min (correr una sola vez, admin) ─────
-- Reemplazar <PROJECT_REF> y <CRON_SECRET> por los reales.
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--   select cron.schedule('korex-mercury-sync', '*/15 * * * *', $$
--     select net.http_post(
--       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/mercury-sync',
--       headers := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
--       body    := '{}'::jsonb
--     );
--   $$);
