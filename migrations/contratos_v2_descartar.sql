-- migrations/contratos_v2_descartar.sql
--
-- Un cliente puede terminar con varios contratos bajo el mismo código Korex: pruebas,
-- reenvíos, un sobre que se anuló. En la ficha aparecían todos por igual y no había
-- forma de decir cuál es el bueno — los de DocuSign ni siquiera se podían borrar
-- (ContratoTab.jsx: el botón de eliminar sale solo en los manuales).
--
-- Se descartan, no se borran: un sobre de DocuSign es el registro de algo que pasó de
-- verdad (se mandó, alguien lo abrió). Borrarlo perdería la trazabilidad y además el
-- webhook lo volvería a crear con el próximo evento de ese sobre. Descartado = sigue
-- guardado, pero fuera del listado principal y sin contar en la pestaña.

alter table public.contracts
  add column if not exists descartado     boolean not null default false,
  add column if not exists descartado_por text,
  add column if not exists descartado_at  timestamptz;

comment on column public.contracts.descartado is
  'Contrato de prueba / reenvío / anulado: se conserva pero no cuenta como el contrato del cliente.';

-- El listado de la ficha filtra por cliente y esconde los descartados.
create index if not exists contracts_cliente_vigentes_idx
  on public.contracts (client_id, created_at desc)
  where descartado = false;

notify pgrst, 'reload schema';

-- ROLLBACK:
--   drop index if exists public.contracts_cliente_vigentes_idx;
--   alter table public.contracts drop column if exists descartado,
--     drop column if exists descartado_por, drop column if exists descartado_at;
