-- informe_ads_v1_sin_conector_mcp.sql
--
-- PROBLEMA
-- El informe diario de #informe-diario-adds lo armaba un agente de Claude en la nube
-- que leia Meta por el CONECTOR MCP. Ese conector alcanzaba 2 de 19 cuentas: las otras
-- 17 salian como "MCP pendiente (no podemos medir desde el conector)".
-- Mientras tanto Supabase ya tenia el dato por token propio (meta-ads-sync), con gasto
-- real de 7 de esos clientes. El informe nunca se conecto a esa fuente.
-- Prueba: el informe del 26/07 decia "Sin actividad ayer"; ese mismo dia Monica
-- Vozmediano habia gastado USD 66,30, y el token lo leyo en 2 llamadas.
--
-- SOLUCION (3 partes)
--   1) Guardar el dato DIARIO. Hasta ahora meta_ad_insights solo tenia ventanas de
--      7 dias (time_window='last_7d'), asi que no existia el "ayer" de nadie.
--   2) Consultar TODAS las cuentas, no solo las marcadas. Ver meta-ads-sync v19:
--      el criterio viejo (use_token o mcp_pendiente) dejaba 12 de 27 cuentas sin
--      consultar NUNCA, y el informe las habria mostrado como $0 sin preguntarle a Meta.
--      Se revierte con only_flagged=true en meta_ads_sync_config.
--   3) Armar el informe en Supabase (edge function informe-ads-diario) en vez de en
--      la nube de Claude. Sin conector MCP de por medio.
--
-- OJO: al pasar de 15 a 27 cuentas la corrida se alarga. Se bajo throttle_ms de 3000
-- a 1500 para no chocar con el limite de tiempo de las edge functions. El uso de la
-- API de Meta venia al 1%, hay margen de sobra.
--
-- Los minutos elegidos (50 y 5) respetan el limite de 6 workers de pg_cron
-- documentado en automations_v2_escalonar_cron.sql. No cambiarlos a la ligera.

-- 1) Sincronizacion diaria del gasto de AYER (07:50 BUE).
select cron.schedule('meta-ads-sync-ayer', '50 10 * * *', $job$
  select net.http_post(
    url := 'https://cgdwieoxjoexzlfbxrfc.supabase.co/functions/v1/meta-ads-sync',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (select value->>'cron_secret' from app_settings where key='meta_ads_sync_config')
    ),
    body := '{"window":"yesterday"}'::jsonb,
    timeout_milliseconds := 120000
  );
$job$);

-- 2) Menos pausa entre cuentas: ahora son 27 y no 15.
update app_settings
   set value = jsonb_set(value, '{throttle_ms}', '1500'::jsonb)
 where key = 'meta_ads_sync_config';

-- 3) Config del informe. El impuesto y el tipo de cambio se editan aca, sin re-deployar.
--    tax_applies_to: 'all' = el impuesto se suma a todos los clientes despues de pasar
--    a USD. Poner 'USD' si solo corresponde a las cuentas facturadas en dolares.
insert into app_settings (key, value) values ('informe_ads_config', jsonb_build_object(
  'enabled', true,
  'slack_channel', '#informe-diario-adds',
  'tax_pct', 7.625,
  'tax_applies_to', 'all',
  'fx', jsonb_build_object('USD', 1, 'EUR', 1.08),
  'cron_secret', replace(gen_random_uuid()::text,'-','')
))
on conflict (key) do update set value = excluded.value;

-- 4) Envio del informe (08:05 BUE), 15 min despues de la sincronizacion.
--    OJO: hay que APAGAR la rutina vieja de Claude en la nube, o llegan dos mensajes
--    por dia al mismo canal. Eso se hace desde claude.ai, no desde aca.
select cron.schedule('informe-ads-diario', '5 11 * * *', $job$
  select net.http_post(
    url := 'https://cgdwieoxjoexzlfbxrfc.supabase.co/functions/v1/informe-ads-diario',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (select value->>'cron_secret' from app_settings where key='informe_ads_config')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);

-- Para pausarlo sin borrar nada: update app_settings set value = jsonb_set(value,'{enabled}','false')
--   where key = 'informe_ads_config';

-- Verificacion
select jobid, jobname, schedule, active from cron.job order by jobid;
