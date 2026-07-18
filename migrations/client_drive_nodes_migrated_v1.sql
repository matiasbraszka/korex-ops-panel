-- migrations/client_drive_nodes_migrated_v1.sql
--
-- Migración de recursos en el SERVIDOR (Matías 2026-07-18): que las fotos se pasen del Drive
-- a Supabase Storage solas, con un cron, sin depender de la PC. Para saber qué falta y no
-- repetir, cada nodo se marca al migrarse.
--
--   migrated_at → cuándo se migró ese archivo (NULL = todavía en el Drive, sin pasar)

alter table public.client_drive_nodes add column if not exists migrated_at timestamptz;

-- La edge fn migrar-fotos toma un lote de nodos image con migrated_at NULL, los sube y los marca.
-- Cuando no queda ninguno, se auto-apaga el cron con esta función:
create or replace function public.migrar_fotos_finalizar()
  returns void language sql security definer set search_path = public, cron as $$
    select cron.unschedule('migrar-fotos-batch') where exists (select 1 from cron.job where jobname = 'migrar-fotos-batch');
$$;

-- Cron (se crea aparte, cada minuto):
--   select cron.schedule('migrar-fotos-batch','* * * * *',
--     $$ select net.http_post(url:='.../functions/v1/migrar-fotos',
--        headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer <DETECT_TOKEN>'),
--        body:='{}'::jsonb) $$);
