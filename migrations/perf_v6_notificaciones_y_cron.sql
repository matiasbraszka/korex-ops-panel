-- migrations/perf_v6_notificaciones_y_cron.sql
--
-- Alivio de carga tras el incidente del 2026-08-03 (el panel se quedaba cargando y el alta
-- de tareas fallaba). La causa de fondo es que la base corre en la instancia Micro y se
-- queda sin CPU; esto NO la reemplaza, pero saca dos costos evitables.
--
-- 1) EL ALTA DE TAREAS ROZABA EL LÍMITE DE 8 SEGUNDOS.
--    Medido con explain analyze: de los ~1800 ms de un insert en `tasks`, 1747 ms se los
--    llevaba trg_notify_on_task_change, y de esos casi todo era la consulta de deduplicado
--    de korex_notify:
--        where recipient_id = ? and type = ? and task_id is not distinct from ? and read_at is null
--    El plan hacía BitmapAnd de dos índices y después descartaba 162 filas filtrando por
--    `type`, tocando 56 páginas del heap. Con un índice que cubra las cuatro columnas se
--    resuelve sin ir al heap.
--    Importa porque `authenticated` tiene statement_timeout=8s: cuando la máquina se
--    saturaba, el insert lo superaba, fallaba, y el panel reintentaba — realimentando la
--    saturación (46 intentos en 30 s contra 1-3 tareas por minuto realmente creadas).
--
-- 2) onboarding_sync_pendientes() CORRÍA CADA 2 MINUTOS.
--    En 2 horas: 51 corridas exitosas de 0 s (nada que hacer) y 9 que ni siquiera pudieron
--    arrancar por falta de workers. Cada 15 minutos alcanza de sobra para lo que hace.

-- ── 1. Índice del deduplicado de notificaciones ──────────────────────────────
-- Parcial sobre read_at is null: las leídas no se consultan nunca acá, y así el índice
-- queda chico (hoy ~247 filas de 2555).
-- Sin CONCURRENTLY a propósito: la Management API corre el archivo dentro de una
-- transacción y CONCURRENTLY no puede. La tabla son 1,5 MB, así que el lock exclusivo
-- dura milisegundos — en una tabla grande esto NO se haría así.
create index if not exists notifications_dedupe_idx
  on public.notifications (recipient_id, type, task_id)
  where read_at is null;

analyze public.notifications;

-- ── 2. Espaciar la rutina de onboarding ──────────────────────────────────────
select cron.alter_job(42, schedule => '*/15 * * * *');

-- Verificación:
--   select jobid, schedule from cron.job where jobid = 42;   -- */15 * * * *
--   explain (analyze, buffers) select 1 from public.notifications
--     where recipient_id='matias' and type='task_assigned'
--       and task_id is not distinct from null and read_at is null;
--   -- tiene que usar notifications_dedupe_idx y tocar pocas páginas
--
-- ROLLBACK:
--   drop index if exists public.notifications_dedupe_idx;
--   select cron.alter_job(42, schedule => '*/2 * * * *');
