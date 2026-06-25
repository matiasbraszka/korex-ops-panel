-- Panel "Automatizaciones" (Administración) + alerta diaria por Slack.
-- Aplicado en prod vía MCP el 2026-06-25. Este archivo es el registro/fuente.
--
-- Piezas:
--   1) función automations_health()  → estado en vivo de TODAS las automatizaciones
--      (cron auto-descubiertos + rutinas nube + webhooks), con runtime y frescura.
--   2) edge function `automations-alert` (supabase/functions/automations-alert) →
--      manda 1 mensaje a Slack con las que están en error/alerta. Config en
--      app_settings.automations_alert_config. La llama el cron de abajo.
--   3) cron diario que dispara la alerta.

-- ── 1) Estado de salud ──────────────────────────────────────────────────────
create or replace function public.automations_health()
returns jsonb
language sql
security definer
set search_path = public, cron, pg_temp
stable
as $$
with stats as (
  select d.jobid,
    count(*) filter (where d.start_time > now() - interval '7 days')                               as runs_7d,
    count(*) filter (where d.start_time > now() - interval '7 days' and d.status='succeeded')        as ok_7d,
    count(*) filter (where d.start_time > now() - interval '7 days' and d.status='failed')           as failed_7d,
    max(d.start_time)                                            as last_run,
    max(d.start_time) filter (where d.status='succeeded')        as last_ok,
    (array_agg(d.status order by d.start_time desc))[1]          as last_status
  from cron.job_run_details d
  group by d.jobid
),
fresh as (
  select 'mercury'::text k, max(ingested_at) ts from mercury_transactions
  union all select 'clarity',  max(synced_at)   from clarity_daily
  union all select 'vsl',      max(synced_at)   from vsl_voomly
  union all select 'llamadas', max(received_at) from llamadas_inbox
),
cron_rows as (
  select
    'cron-'||j.jobname as id, coalesce(m.name, j.jobname) as name,
    coalesce(m.category, 'Otros') as category, 'cron' as source, 'supabase' as runtime,
    j.active as active, coalesce(m.schedule_human, j.schedule) as schedule_human,
    m.cadence_minutes as cadence_minutes,
    coalesce(m.description, 'Automatización nueva sin describir') as description,
    m.data_key as data_key, s.runs_7d, s.ok_7d, s.failed_7d, s.last_run, s.last_ok, s.last_status
  from cron.job j
  left join stats s on s.jobid = j.jobid
  left join (values
    ('korex-mercury-sync',           'Mercury (banco)',        'Sincronización', 'cada 15 min',                    15,   'Trae los movimientos del banco Mercury',                         'mercury'),
    ('korex-stripe-sync',            'Stripe',                 'Sincronización', 'cada 15 min',                    15,   'Trae los pagos de Stripe',                                       null),
    ('korex-stripe-enrich',          'Stripe (enriquecer)',    'Sincronización', '2 veces por hora',               30,   'Completa y cruza los datos de Stripe',                           null),
    ('korex-kraken-sync',            'Kraken (cripto)',        'Sincronización', 'cada 30 min',                    30,   'Saldos y movimientos de cripto en Kraken',                       null),
    ('clarity-sync-daily',           'Clarity',                'Sincronización', 'diario 06:30 (BUE)',             1440, 'Métricas de Microsoft Clarity del día',                          'clarity'),
    ('citas_recordatorios',          'Recordatorios de citas', 'Recordatorios',  'cada 10 min',                    10,   'Avisa por WhatsApp las citas agendadas próximas',                null),
    ('contract-reminders-daily',     'Contratos DocuSign',     'Recordatorios',  'diario 01:55 (BUE)',             1440, 'Recordatorios de contratos pendientes de firma',                 null),
    ('pago-reminders',               'Cuotas por vencer',      'Recordatorios',  'diario 09:13 (BUE)',             1440, 'Avisa por Slack las cuotas que vencen en 3 días',                null),
    ('historial-resumenes-semanales','Resúmenes semanales',    'Informes',       'viernes 09:00 (BUE)',            10080,'Envía por email los resúmenes semanales',                        null),
    ('automations-alert-daily',      'Alerta de automatizaciones','Informes',    'diario 09:30 (BUE)',             1440, 'Te avisa por Slack si hay automatizaciones con problemas',        null),
    ('fathom-poll-hourly',           'Fathom (respaldo)',      'Llamadas',       'cada hora',                      60,   'Respaldo: vuelve a pedir llamadas a Fathom por las dudas',       'llamadas')
  ) as m(jobname, name, category, schedule_human, cadence_minutes, description, data_key)
    on m.jobname = j.jobname
),
static_rows as (
  select * from (values
    ('cloud-informe-publicidad','Informe Publicidad Meta','Informes','cloud','claude', true,  'diario 08:00 (BUE)', 1440, 'Reporte de Meta Ads a Slack #informe-diario-adds (incluye impuesto 7,625%)', null),
    ('cloud-soporte-pendientes','Soporte · Pendientes',   'IA',      'cloud','claude', true,  'diario',             1440, 'Detecta pendientes en los chats de WhatsApp',                                null),
    ('cloud-soporte-briefing',  'Soporte · Briefing',     'IA',      'cloud','claude', true,  'lun a sáb',          1440, 'Briefing diario incremental de las últimas 48h a Docs/Slack',                null),
    ('cloud-soporte-semanal',   'Soporte · Semanal',      'IA',      'cloud','claude', true,  'domingo',            10080,'Análisis profundo, satisfacción y FAQs de la semana',                        null),
    ('cloud-vsl-voomly',        'VSL Voomly (scraper)',   'Sincronización','cloud','local', true, 'diario 06:00 (tu compu)', 1440, 'Tu PC entra a Voomly con tu sesión (Playwright) y baja las métricas de los VSL', 'vsl'),
    ('cloud-fathom-procesa',    'Llamadas (procesa IA)',  'Llamadas','cloud','claude', true,  'cada 6 h',           360,  'Procesa las llamadas crudas y las pasa a la tabla final',                    'llamadas'),
    ('cloud-informe-diario-ops','Informe Diario ops',     'Informes','cloud','local', false, '—',                  null, 'Informe diario unificado de operaciones (RETIRADO el 07/06 · tarea de Windows deshabilitada)', null),
    ('event-fathom-webhook',    'Fathom (webhook)',       'Llamadas','event','external', true,  'al recibir llamada', null, 'Recibe en vivo las llamadas grabadas de Fathom',                             'llamadas'),
    ('event-docusign-webhook',  'DocuSign (webhook)',     'Contratos','event','external', true, 'al firmar contrato', null, 'Registra los contratos cuando se firman',                                    null),
    ('event-whatsapp-webhook',  'WhatsApp (webhook)',     'Soporte', 'event','external', true,  'al entrar mensaje',  null, 'Recibe los mensajes entrantes de WhatsApp (Evolution API)',                  null),
    ('event-mercury-webhook',   'Mercury (alertas)',      'Finanzas','event','external', true,  'alerta de transacción', null, 'Avisa cuando hay una transacción/alerta del banco',                      null),
    ('event-crear-venta',       'Alta de venta',          'Ventas',  'event','supabase', true,  'al cargar una venta', null, 'Dispara Slack #onboarding + fin_incomes + cuotas + carpeta Drive',           null)
  ) as v(id, name, category, source, runtime, active, schedule_human, cadence_minutes, description, data_key)
),
unioned as (
  select id, name, category, source, runtime, active, schedule_human, cadence_minutes, description, data_key,
         runs_7d, ok_7d, failed_7d, last_run, last_ok, last_status from cron_rows
  union all
  select id, name, category, source, runtime, active, schedule_human, cadence_minutes, description, data_key,
         null::bigint, null::bigint, null::bigint, null::timestamptz, null::timestamptz, null::text from static_rows
),
enriched as (
  select u.*, f.ts as last_data,
    case u.data_key when 'mercury' then interval '6 hours' when 'clarity' then interval '30 hours'
                    when 'vsl' then interval '30 hours' when 'llamadas' then interval '24 hours' else null end as fresh_window
  from unioned u left join fresh f on f.k = u.data_key
),
final as (
  select e.*,
    (e.data_key is not null and (e.last_data is null or e.last_data < now() - e.fresh_window)) as data_stale,
    case
      when e.active = false then 'paused'
      when e.source = 'cron' and (e.last_status = 'failed' or (coalesce(e.failed_7d,0) > 0 and e.last_ok is null)) then 'error'
      when e.source = 'cron' and e.data_key is not null and (e.last_data is null or e.last_data < now() - e.fresh_window) then 'warn'
      when e.source = 'cron' and coalesce(e.failed_7d,0) > 0 then 'warn'
      when e.source = 'cron' and e.last_run is null then 'warn'
      when e.source = 'cron' then 'ok'
      when e.source = 'cloud' and e.data_key is not null and (e.last_data is null or e.last_data < now() - e.fresh_window) then 'error'
      when e.source = 'cloud' and e.data_key is not null then 'ok'
      when e.source = 'cloud' then 'info'
      when e.source = 'event' and e.data_key is not null and not (e.last_data is null or e.last_data < now() - e.fresh_window) then 'ok'
      else 'info'
    end as health
  from enriched e
)
select coalesce(jsonb_agg(to_jsonb(final.*) order by category, name), '[]'::jsonb) from final;
$$;

revoke all on function public.automations_health() from public, anon;
grant execute on function public.automations_health() to authenticated;

-- ── 2) Config de la alerta (editable desde el panel) ────────────────────────
insert into public.app_settings (key, value)
values ('automations_alert_config',
        '{"enabled": true, "slack_channel": "#alertas-general", "include_warn": true, "panel_url": ""}'::jsonb)
on conflict (key) do nothing;

-- ── 3) Cron diario que dispara la edge function `automations-alert` ─────────
select cron.schedule('automations-alert-daily', '30 12 * * *', $cmd$
  select net.http_post(
    url := 'https://cgdwieoxjoexzlfbxrfc.supabase.co/functions/v1/automations-alert',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb);
$cmd$);
