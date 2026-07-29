-- Cron del motor de métricas (PR3, en sombra). Aplicada a prod vía MCP 2026-07-28.
-- Corre ANTES que el sync viejo (10:30 UTC = 07:30 BUE). El secreto se lee de
-- motor_config en el momento del disparo (nada hardcodeado en el comando).
select cron.schedule(
  'ads-engine-sync-daily',
  '30 10 * * *',
  $$
  select net.http_post(
    url := 'https://cgdwieoxjoexzlfbxrfc.supabase.co/functions/v1/ads-engine-sync',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (select value #>> '{}' from motor_config where key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);
