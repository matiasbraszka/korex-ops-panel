-- Kraken (cripto) — solo lectura. Saldos + libro mayor (ingresos/egresos).
CREATE TABLE IF NOT EXISTS public.kraken_balances (
  asset      text PRIMARY KEY,
  amount     numeric,
  usd_value  numeric,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kraken_ledger (
  id          text PRIMARY KEY,       -- id de la entrada del ledger
  refid       text,                   -- id de la operación/transferencia
  time        timestamptz,
  type        text,                   -- deposit | withdrawal | trade | transfer | receive | spend | staking | ...
  subtype     text,
  asset       text,
  amount      numeric,                -- + ingreso / - egreso
  fee         numeric,
  balance     numeric,
  usd_amount  numeric,
  raw         jsonb,
  ingested_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kraken_ledger_time_idx ON public.kraken_ledger(time DESC);
CREATE INDEX IF NOT EXISTS kraken_ledger_type_idx ON public.kraken_ledger(type);

ALTER TABLE public.kraken_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kraken_ledger   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kraken_balances_admin ON public.kraken_balances;
CREATE POLICY kraken_balances_admin ON public.kraken_balances FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS kraken_ledger_admin ON public.kraken_ledger;
CREATE POLICY kraken_ledger_admin ON public.kraken_ledger FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kraken_balances, public.kraken_ledger TO authenticated, service_role;

-- Config (Matías carga api_key + private_key de la clave de SOLO LECTURA).
INSERT INTO public.app_settings (key, value)
VALUES ('kraken_config', '{"api_key":"","private_key":"","cron_secret":""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- pg_cron cada 30 min (correr una vez, admin). Reemplazar <REF> y <CRON_SECRET>.
--   select cron.schedule('korex-kraken-sync', '*/30 * * * *', $$
--     select net.http_post(
--       url:='https://<REF>.supabase.co/functions/v1/kraken-sync',
--       headers:='{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
--       body:='{}'::jsonb);
--   $$);
