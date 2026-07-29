-- del_client_extra_docs_system_v1 — marca de "documento del sistema" (no borrable desde el panel).
-- La usa el "Resumen de la venta" que crea crear-venta: aparece en todos los DEL del cliente y
-- no se puede borrar por error. Aditivo e inocuo (default false → los docs existentes no cambian).

alter table public.del_client_extra_docs add column if not exists system boolean not null default false;

-- Rollback: alter table public.del_client_extra_docs drop column if exists system;
