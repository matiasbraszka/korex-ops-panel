-- notifications_v2_cleanup — menos ruido en notificaciones (pedido de Matias, 2026-06)
--
-- Regla nueva: las notificaciones del panel son SOLO:
--   • task_assigned  — cuando se crea/asigna una tarea a alguien.
--   • task_comment   — cuando comentan en una tarea (raíz).
--   • comment_reply  — cuando responden en un hilo donde participás.
--   • mention        — cuando te etiquetan (@) en un comentario.  (sin cambios)
--
-- Se quitan los avisos por "mínimos cambios" de la tarea:
--   • task_description (se agregó descripción)
--   • task_blocked     (la tarea pasó a bloqueada)
--   • task_overdue     (job diario de vencidas)  → se desagenda el cron.
--
-- notify_on_comment NO se toca (sigue avisando comentarios y respuestas).
-- Las entradas automáticas kind='system' en el feed de comentarios se cortan
-- desde el frontend (recordTaskSystemEvents quedó como no-op).

-- ── Trigger de cambios de tarea: solo asignación ─────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_task_change()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_recipient text;
  v_client    text;
  v_today     text := to_char((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM-DD');
  v_avail_new boolean;
  v_avail_old boolean;
BEGIN
  v_recipient := public.korex_resolve_member_id(NEW.assignee);
  IF v_recipient IS NULL THEN RETURN NEW; END IF;

  SELECT name INTO v_client FROM public.clients WHERE id = NEW.client_id;
  v_avail_new := public.korex_task_available(NEW.status, NEW.enabled_date, v_today);

  IF TG_OP = 'INSERT' THEN
    -- Tarea recién creada y ya disponible para su responsable.
    IF v_avail_new THEN
      PERFORM public.korex_notify(v_recipient, NEW.last_actor_id, 'task_assigned', NEW.id, NULL,
        'Nueva tarea asignada', '«' || NEW.title || '»' || coalesce(' · ' || v_client, ''), true);
    END IF;
  ELSE
    v_avail_old := public.korex_task_available(OLD.status, OLD.enabled_date, v_today);
    -- Asignación: cuando se vuelve disponible o cambia de responsable.
    IF v_avail_new AND ((NOT v_avail_old) OR (OLD.assignee IS DISTINCT FROM NEW.assignee)) THEN
      PERFORM public.korex_notify(v_recipient, NEW.last_actor_id, 'task_assigned', NEW.id, NULL,
        'Nueva tarea asignada', '«' || NEW.title || '»' || coalesce(' · ' || v_client, ''), true);
    END IF;
    -- (Quitado) task_description y task_blocked: eran "mínimos cambios" → ya no avisan.
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- nunca romper el write de la tarea
END;
$function$;

-- ── Vencidas: desagendar el job diario ───────────────────────────────────────
-- Se conserva la función generate_overdue_notifications() por si se quisiera
-- reactivar, pero deja de correr automáticamente.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'korex-overdue-notifs') THEN
    PERFORM cron.unschedule('korex-overdue-notifs');
  END IF;
END $$;
