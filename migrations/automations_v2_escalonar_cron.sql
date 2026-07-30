-- automations_v2_escalonar_cron.sql
--
-- PROBLEMA
-- La instancia tiene max_worker_processes = 6, pero 9 tareas de pg_cron arrancaban
-- todas en el minuto :00 (y 8 en el :30), porque todas usaban cadencias */2 */5 */10
-- */15 */30 que se alinean en el mismo minuto. Cuando las 9 tardaban un poco mas de
-- lo normal, las que sobraban morian con "job startup timeout".
-- Eso produjo los 24 fallos del 20 y 21/7 repartidos en 9 automatizaciones distintas.
-- No hay ningun bug en el codigo de las tareas: es inanicion de workers.
--
-- SOLUCION
-- Misma cadencia para cada tarea, pero con minutos de arranque distintos.
-- Maximo 2 tareas simultaneas en cualquier minuto (antes: 9).
--
-- Reversible: volver a poner los schedule viejos (anotados al lado de cada linea).

select cron.alter_job(35, schedule := '3-58/5 * * * *');           -- sync-transcripts        (era */5)
select cron.alter_job(5,  schedule := '4,14,24,34,44,54 * * * *'); -- citas_recordatorios     (era */10)
select cron.alter_job(21, schedule := '9,19,29,39,49,59 * * * *'); -- fbcrm-lead-poll         (era */10)
select cron.alter_job(6,  schedule := '2,17,32,47 * * * *');       -- korex-mercury-sync      (era */15)
select cron.alter_job(8,  schedule := '6,21,36,51 * * * *');       -- korex-stripe-sync       (era */15)
select cron.alter_job(7,  schedule := '11,41 * * * *');            -- korex-kraken-sync       (era */30)
select cron.alter_job(20, schedule := '26,56 * * * *');            -- fbcrm-forms-sync        (era */30)
select cron.alter_job(19, schedule := '13 */2 * * *');             -- fbcrm-cpl-2h            (era 0 */2)
select cron.alter_job(1,  schedule := '22 * * * *');               -- fathom-poll-hourly      (era 7, chocaba con stripe-enrich)

-- onboarding-sync-texto (42, */2) y korex-stripe-enrich (9, 7,37) quedan como estan:
-- ya no chocan con nadie una vez movidas las de arriba.

-- Verificacion
select jobid, jobname, schedule, active from cron.job order by jobid;
