-- Transcripción automática de RECURSOS (aplicada a prod vía MCP el 2026-07-29).
-- Hueco cerrado: los videos subidos DIRECTO al panel (funnel_resources en Bunny)
-- no los transcribía nadie — transcribir-batch solo cubre los que vinieron del
-- Drive. Nueva función transcribir-recursos + cron cada 20 min.

-- 1) Estado de transcripción en el propio recurso.
alter table funnel_resources add column if not exists transcript_status text;
alter table funnel_resources add column if not exists transcript_at timestamptz;

-- 2) Backfill: los que ya tienen texto quedan 'ok' (así el cron no los re-transcribe).
update funnel_resources set transcript_status = 'ok'
where coalesce(transcript,'') <> '' and transcript_status is null;

-- 3) El cron viejo que copia transcripciones Drive→recurso ahora también marca 'ok'
--    (si no, el cron nuevo los volvería a transcribir al pedo).
select cron.alter_job(35, command := $$ update funnel_resources fr set transcript = n.transcript, transcript_status = 'ok', transcript_at = now() from client_drive_nodes n where fr.provider='bunny' and fr.kind='video' and fr.client_id=n.client_id and n.node_type='video' and n.transcript is not null and lower(regexp_replace(n.name,'.[^.]+$','')) = lower(fr.title) and fr.transcript is distinct from n.transcript $$);

-- 4) Cron de la función nueva: cada 20 min, minutos 8/28/48 (sin pisar los minutos
--    cargados; regla de la casa: nunca */N). Secreto leído de motor_config al disparo.
select cron.schedule(
  'transcribir-recursos-20m',
  '8,28,48 * * * *',
  $$
  select net.http_post(
    url := 'https://cgdwieoxjoexzlfbxrfc.supabase.co/functions/v1/transcribir-recursos',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (select value #>> '{}' from motor_config where key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);
