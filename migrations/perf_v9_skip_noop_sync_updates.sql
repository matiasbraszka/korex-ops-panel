-- perf_v9_skip_noop_sync_updates  (APLICADA EN PROD por MCP 2026-07-30)
-- Los syncs (Mercury/Stripe/Kraken) hacen upsert de TODAS las filas en cada corrida.
-- Un upsert escribe una version nueva de la fila SIEMPRE, aunque el dato sea identico
-- -> millones de updates fantasma -> WAL -> Realtime ahoga la CPU -> timeouts en el panel.
-- Este disparador BEFORE UPDATE ignora SOLO los timestamps de sync y, si nada real
-- cambio, devuelve NULL (no escribe): cero WAL, cero tupla muerta. Cambios reales pasan.
create or replace function public.skip_noop_sync_update()
returns trigger language plpgsql as $$
declare vol text[] := array['updated_at','synced_at','ingested_at'];
begin
  if (to_jsonb(NEW) - vol) is not distinct from (to_jsonb(OLD) - vol) then
    return null;
  end if;
  return NEW;
end;$$;
do $$
declare t text; tablas text[] := array[
  'mercury_transactions','mercury_accounts','mercury_cards',
  'stripe_charges','stripe_balance_transactions','stripe_payouts',
  'kraken_ledger','kraken_transfers'];
begin
  foreach t in array tablas loop
    execute format('drop trigger if exists trg_skip_noop_sync on public.%I', t);
    execute format('create trigger trg_skip_noop_sync before update on public.%I for each row execute function public.skip_noop_sync_update()', t);
  end loop;
end $$;
