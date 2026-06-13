-- Depósitos/retiros con detalle (txid, red/método) para chequear pagos.
CREATE TABLE IF NOT EXISTS public.kraken_transfers (
  refid       text PRIMARY KEY,
  direction   text,            -- in (depósito) | out (retiro)
  asset       text,
  amount      numeric,
  fee         numeric,
  method      text,            -- ej. "Tether USD (TRC20)"
  txid        text,            -- id de transacción blockchain
  address     text,            -- campo 'info' (dirección de depósito/destino)
  time        timestamptz,
  status      text,
  raw         jsonb,
  alerted_at  timestamptz,     -- aviso de ingreso nuevo (dedupe)
  ingested_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kraken_transfers_time_idx ON public.kraken_transfers(time DESC);
CREATE INDEX IF NOT EXISTS kraken_transfers_dir_asset_idx ON public.kraken_transfers(direction, asset);

ALTER TABLE public.kraken_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kraken_transfers_admin ON public.kraken_transfers;
CREATE POLICY kraken_transfers_admin ON public.kraken_transfers FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kraken_transfers TO authenticated, service_role;
