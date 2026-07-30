-- perf_v9: revierte el indice que habia agregado perf_v6.
--
-- La teoria era que korex_mercury_meta_spend() tardaba 910 ms por falta de indice.
-- Era falsa. Medido despues de perf_v5, la misma consulta tarda 33 ms SIN usar
-- ningun indice: la causa real era la politica `is_admin()` de
-- mercury_transactions evaluandose una vez por fila.
--
-- El indice no aporta y si cuesta:
--   * el 28% de las filas coincide con el filtro, asi que el planificador siempre
--     prefiere recorrer la tabla — el plan mostraba Seq Scan con el indice puesto;
--   * en toda su vida se uso 2 veces, y las dos fueron mis propias pruebas;
--   * mercury_transactions recibe millones de escrituras del sync, que el indice
--     encarecia a cambio de nada.

drop index if exists public.idx_mercury_tx_facebook;

-- ---------------------------------------------------------------------------
-- ROLLBACK (no recomendado — ver arriba):
--   create index idx_mercury_tx_facebook
--     on public.mercury_transactions (lower(counterparty_name), account_id)
--     include (amount, status);
-- ---------------------------------------------------------------------------
