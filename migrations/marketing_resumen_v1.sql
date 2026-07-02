-- migrations/marketing_resumen_v1.sql
-- Automatización: resumen de las reuniones del equipo de MARKETING → Slack.
--
-- IMPORTANTE: la generación del resumen + el posteo NO son un edge function.
-- Corre como RUTINA CLAUDE EN LA NUBE (claude.ai RemoteTrigger, sobre la
-- suscripción de Claude — SIN ANTHROPIC_API_KEY), igual que "Procesar llamadas
-- Fathom". Trigger: "Marketing: resumen de llamadas → Slack (prueba DM)"
-- (id trig_018vudTszU8hrrdo4EUHcyFF), diario 04:35 UTC (01:35 AR), con los
-- conectores MCP de Supabase + Slack. Ver MARKETING-RESUMEN.md.
--
-- Este .sql solo aporta el ESTADO en la base (columnas de seguimiento + config
-- que lee la rutina). Se aplica VIVO en Supabase. Idempotente.

-- 1) Columnas de seguimiento en `llamadas` (aditivas). La rutina las usa para no
--    re-postear (idempotencia): null = pendiente, 'sent' = ya posteada,
--    'skipped' = evaluada y NO era de marketing.
alter table public.llamadas
  add column if not exists mkt_resumen_status  text,          -- 'sent' | 'skipped' | null
  add column if not exists mkt_resumen_at       timestamptz;

-- Índice parcial para la búsqueda de pendientes de la rutina (equipo + sin postear).
create index if not exists idx_llamadas_mkt_pending
  on public.llamadas (fecha)
  where categoria = 'equipo' and mkt_resumen_status is null;

-- 2) Config que lee la rutina, en app_settings.reuniones_config.marketing_auto.
--    Reutiliza el canal y el flag test_dm_to que ya existían en reuniones_config.
--    Los valores EXISTENTES ganan sobre los defaults → no pisa un test_mode ya
--    cambiado a producción.
--      - test_mode=true  → la rutina DMea el resumen a Matías (validación previa)
--      - test_mode=false → la rutina postea al canal grupos.marketing.channel
update public.app_settings
set value = jsonb_set(
  coalesce(value, '{}'::jsonb),
  '{marketing_auto}',
  jsonb_build_object(
    'enabled',       true,
    'test_mode',     true,   -- arranca en prueba (DM a Matías)
    'lookback_days', 7,
    'max_per_run',   4
  ) || coalesce(value->'marketing_auto', '{}'::jsonb),
  true
)
where key = 'reuniones_config';

-- Para pasar a producción (postear al canal de marketing) cuando Matías valide:
--   update public.app_settings
--   set value = jsonb_set(value, '{marketing_auto,test_mode}', 'false'::jsonb)
--   where key = 'reuniones_config';
