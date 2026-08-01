-- Titulado automático de videos EN LA NUBE (sin depender de ninguna computadora).
-- Flujo completo del importador de Drive, todo por cron:
--   importar-drive (título = nombre de archivo) → transcribir-recursos (cron 20 min)
--   → organizar-videos modo auto (cron 30 min): pone el título "inteligente" (avatar · AD n
--     o "Financiero · Ángulo 1 · Hook 3") a partir de la transcripción, SIN visión (confía en
--     la carpeta grabado/editado ya elegida) y sin re-procesar los ya titulados.

-- 1) Marca de "ya titulado" (así el cron no lo vuelve a tocar ni re-gasta).
alter table funnel_resources add column if not exists titulado_at timestamptz;

-- 2) Backfill: TODO lo que ya existe queda marcado como titulado (no se toca su título
--    actual). El titulado automático aplica de acá en adelante, a lo nuevo que se importe.
update funnel_resources set titulado_at = now()
where provider = 'bunny' and kind = 'video' and titulado_at is null;

-- 3) Cron cada 30 min (minutos 17/47, sin pisar la transcripción de 8/28/48): toma el
--    próximo cliente con videos transcritos y sin titular, y les pone el título.
select cron.schedule(
  'titular-recursos-30m',
  '17,47 * * * *',
  $$
  select net.http_post(
    url := 'https://cgdwieoxjoexzlfbxrfc.supabase.co/functions/v1/organizar-videos',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (select value #>> '{}' from motor_config where key = 'cron_secret')
    ),
    body := '{"auto":true,"limit":10}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);
