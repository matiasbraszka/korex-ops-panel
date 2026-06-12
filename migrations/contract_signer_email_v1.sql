-- Email del firmante del contrato (el que firma en DocuSign).
-- Se usa para vincular automáticamente el sobre de DocuSign con este cliente.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS contract_signer_email text;
