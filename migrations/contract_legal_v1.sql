-- Fase 5 ficha cliente: campos legales del contrato
-- contract_url: URL del PDF del contrato firmado
-- contract_signed_date: fecha en la que se firmo
-- contract_renewal_date: fecha limite para renovar (si aplica)

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS contract_url           text,
  ADD COLUMN IF NOT EXISTS contract_signed_date   date,
  ADD COLUMN IF NOT EXISTS contract_renewal_date  date;
