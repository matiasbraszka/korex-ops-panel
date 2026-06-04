-- notifications v1 — buzón de notificaciones del panel de Operaciones
--
-- Objetivo: que cada persona con acceso a Operaciones reciba avisos automáticos
-- de lo que le interesa (tareas asignadas, comentarios/respuestas en sus tareas,
-- tareas bloqueadas o vencidas, y descripciones agregadas a sus tareas) y los
-- vea en un buzón con campana, en tiempo real.
--
-- Diseño clave: las notificaciones las GENERAN triggers de Postgres, no el
-- frontend. Así se disparan siempre, sin importar quién escriba (el panel, los
-- agentes vía REST, o edge functions). El frontend solo lee / muestra / marca
-- como leído. Todo el texto queda DENORMALIZADO en la fila (snapshot) para que
-- la notificación no se rompa si después cambia la tarea o el comentario.
--
-- recipient_id / actor_id usan SIEMPRE el id de team_members (ej "matias"),
-- igual que task_comments.author_id y currentUser.id en el frontend. Como
-- tasks.assignee guarda el NOMBRE (a veces parcial: "David", "Cristian", y con
-- algún typo "Jose Zerillos"), se resuelve nombre -> id con korex_resolve_member_id
-- (exacto por id/nombre, por primer nombre, y similitud trigram como respaldo).

-- pg_trgm: para resolver assignee (nombre libre) -> team_members.id de forma robusta.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Columna para excluir auto-notificaciones: el frontend setea el id de quien
-- hizo la última edición en cada write de la tarea. El trigger no notifica si
-- el destinatario es el propio actor.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS last_actor_id text;

-- ── Tabla ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           text PRIMARY KEY,
  recipient_id text NOT NULL,                                  -- team_members.id
  actor_id     text,                                           -- quién lo causó (avatar)
  type         text NOT NULL,                                  -- task_assigned | task_comment | comment_reply | task_description | task_blocked | task_overdue
  task_id      text REFERENCES public.tasks(id)         ON DELETE CASCADE,
  comment_id   text REFERENCES public.task_comments(id) ON DELETE CASCADE,
  title        text,                                           -- snapshot legible
  body         text,                                           -- snapshot legible
  read_at      timestamptz,                                    -- NULL = no leída
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on notifications" ON public.notifications;
CREATE POLICY "Allow all on notifications"
  ON public.notifications FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.notifications TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON public.notifications(recipient_id);
CREATE INDEX IF NOT EXISTS notifications_created_idx   ON public.notifications(created_at);
CREATE INDEX IF NOT EXISTS notifications_unread_idx    ON public.notifications(recipient_id, read_at);

-- Realtime: que el INSERT llegue al frontend al instante.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Resuelve un texto de assignee (nombre, a veces parcial) -> team_members.id.
-- Prioridad: id exacto > nombre exacto > primer nombre exacto > mejor similitud.
-- Devuelve NULL si no hay match razonable (ej "Cliente", o un cliente como
-- "Monica Vozmediano") -> en ese caso no se notifica a nadie.
CREATE OR REPLACE FUNCTION public.korex_resolve_member_id(p_txt text)
RETURNS text LANGUAGE sql STABLE AS $$
  WITH q AS (SELECT lower(trim(coalesce(p_txt, ''))) AS t)
  SELECT m.id FROM public.team_members m, q
  WHERE q.t <> '' AND (
        lower(m.id) = q.t
     OR lower(m.name) = q.t
     OR lower(split_part(m.name, ' ', 1)) = q.t
     OR similarity(lower(m.name), q.t) > 0.45
  )
  ORDER BY
    (lower(m.name) = q.t) DESC,
    (lower(m.id) = q.t) DESC,
    (lower(split_part(m.name, ' ', 1)) = q.t) DESC,
    similarity(lower(m.name), q.t) DESC
  LIMIT 1;
$$;

-- ¿La tarea está "disponible" para el assignee? (no bloqueada/terminada/pausada
-- y ya habilitada). enabled_date es text 'YYYY-MM-DD' -> comparación lexicográfica.
CREATE OR REPLACE FUNCTION public.korex_task_available(p_status text, p_enabled text, p_today text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(p_status, '') NOT IN ('blocked', 'done', 'paused')
     AND (p_enabled IS NULL OR p_enabled = '' OR p_enabled <= p_today);
$$;

-- Inserta una notificación con guardas: nunca al propio actor; si p_dedupe,
-- evita duplicar una no leída del mismo tipo+tarea para el mismo destinatario.
CREATE OR REPLACE FUNCTION public.korex_notify(
  p_recipient text, p_actor text, p_type text,
  p_task text, p_comment text, p_title text, p_body text, p_dedupe boolean
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_recipient IS NULL OR p_recipient = '' THEN RETURN; END IF;
  IF p_actor IS NOT NULL AND p_recipient = p_actor THEN RETURN; END IF;
  IF p_dedupe AND EXISTS (
       SELECT 1 FROM public.notifications
       WHERE recipient_id = p_recipient AND type = p_type
         AND task_id IS NOT DISTINCT FROM p_task AND read_at IS NULL
     ) THEN
    RETURN;
  END IF;
  INSERT INTO public.notifications (id, recipient_id, actor_id, type, task_id, comment_id, title, body)
  VALUES ('ntf_' || replace(gen_random_uuid()::text, '-', ''),
          p_recipient, p_actor, p_type, p_task, p_comment, p_title, p_body);
END;
$$;

-- ── Trigger: comentarios y respuestas ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_task_title text;
  v_assignee   text;
  v_author     text;
  v_recipient  text;
BEGIN
  SELECT t.title, t.assignee INTO v_task_title, v_assignee
    FROM public.tasks t WHERE t.id = NEW.task_id;
  SELECT name INTO v_author FROM public.team_members WHERE id = NEW.author_id;
  v_author := coalesce(v_author, NEW.author_id);

  IF NEW.parent_id IS NULL THEN
    -- Comentario raíz -> avisar al responsable de la tarea.
    v_recipient := public.korex_resolve_member_id(v_assignee);
    PERFORM public.korex_notify(
      v_recipient, NEW.author_id, 'task_comment', NEW.task_id, NEW.id,
      v_author || ' comentó en una tarea',
      '«' || coalesce(v_task_title, 'tarea') || '» — ' || left(NEW.body, 120),
      false);
  ELSE
    -- Respuesta -> avisar a todos los participantes del hilo + responsable,
    -- menos a uno mismo. Distinct para no duplicar.
    FOR v_recipient IN
      SELECT DISTINCT rid FROM (
        SELECT author_id AS rid FROM public.task_comments
          WHERE id = NEW.parent_id OR parent_id = NEW.parent_id
        UNION
        SELECT public.korex_resolve_member_id(v_assignee)
      ) s
      WHERE rid IS NOT NULL AND rid <> NEW.author_id
    LOOP
      PERFORM public.korex_notify(
        v_recipient, NEW.author_id, 'comment_reply', NEW.task_id, NEW.id,
        v_author || ' respondió en un hilo',
        '«' || coalesce(v_task_title, 'tarea') || '» — ' || left(NEW.body, 120),
        false);
    END LOOP;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- nunca romper el insert del comentario
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_comment ON public.task_comments;
CREATE TRIGGER trg_notify_on_comment
  AFTER INSERT ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

-- ── Trigger: cambios de tarea (asignación, descripción, bloqueo) ─────────────
CREATE OR REPLACE FUNCTION public.notify_on_task_change()
RETURNS trigger LANGUAGE plpgsql AS $$
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
    -- Solo notificar asignación si la tarea ya está disponible. El roadmap
    -- masivo crea muchas tareas no disponibles -> solo avisan las que arrancan
    -- habilitadas; las demás avisarán cuando se habiliten (rama UPDATE).
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

    -- Descripción agregada (vacío -> con contenido) en una tarea no terminada.
    IF coalesce(OLD.description, '') = '' AND coalesce(NEW.description, '') <> ''
       AND NEW.status IS DISTINCT FROM 'done' THEN
      PERFORM public.korex_notify(v_recipient, NEW.last_actor_id, 'task_description', NEW.id, NULL,
        'Se agregó una descripción', '«' || NEW.title || '»' || coalesce(' · ' || v_client, ''), true);
    END IF;

    -- Bloqueo: status pasa a 'blocked'.
    IF NEW.status = 'blocked' AND OLD.status IS DISTINCT FROM 'blocked' THEN
      PERFORM public.korex_notify(v_recipient, NEW.last_actor_id, 'task_blocked', NEW.id, NULL,
        'Tarea bloqueada', '«' || NEW.title || '»' || coalesce(' · ' || v_client, ''), true);
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- nunca romper el write de la tarea
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_task_change ON public.tasks;
CREATE TRIGGER trg_notify_on_task_change
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_task_change();

-- ── Vencidas: no hay write cuando pasa la fecha -> job diario ────────────────
-- Inserta 1 notificación por tarea vencida (due_date < hoy, no terminada),
-- máximo una por tarea por día. Se agenda con pg_cron (ver setup aparte).
CREATE OR REPLACE FUNCTION public.generate_overdue_notifications()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  r           record;
  v_recipient text;
  v_today     text := to_char((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM-DD');
  v_launch    text := '2026-06-04';  -- lanzamiento: no notificar vencidas anteriores a esta fecha
  v_count     int := 0;
BEGIN
  FOR r IN
    SELECT t.id, t.title, t.assignee, t.due_date, c.name AS client
    FROM public.tasks t
    LEFT JOIN public.clients c ON c.id = t.client_id
    WHERE t.due_date IS NOT NULL AND t.due_date <> ''
      AND t.due_date < v_today
      AND t.due_date >= v_launch          -- arrancamos desde hoy, no el backlog histórico
      AND coalesce(t.status, '') NOT IN ('done', 'paused')
  LOOP
    v_recipient := public.korex_resolve_member_id(r.assignee);
    IF v_recipient IS NULL THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM public.notifications
      WHERE type = 'task_overdue' AND task_id = r.id
        AND created_at >= (v_today || 'T00:00:00')::timestamptz
    ) THEN CONTINUE; END IF;
    PERFORM public.korex_notify(v_recipient, NULL, 'task_overdue', r.id, NULL,
      'Tarea vencida', '«' || r.title || '» venció el ' || r.due_date || coalesce(' · ' || r.client, ''), false);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- search_path fijo en todas las funciones (buenas prácticas / advisor de Supabase).
ALTER FUNCTION public.korex_task_available(text,text,text)                       SET search_path = public, pg_catalog;
ALTER FUNCTION public.korex_resolve_member_id(text)                              SET search_path = public, pg_catalog;
ALTER FUNCTION public.korex_notify(text,text,text,text,text,text,text,boolean)   SET search_path = public, pg_catalog;
ALTER FUNCTION public.notify_on_comment()                                        SET search_path = public, pg_catalog;
ALTER FUNCTION public.notify_on_task_change()                                    SET search_path = public, pg_catalog;
ALTER FUNCTION public.generate_overdue_notifications()                           SET search_path = public, pg_catalog;

-- pg_cron: job diario que genera las notificaciones de tareas vencidas.
-- (9:00 BUE = 12:00 UTC). Requiere la extensión pg_cron habilitada.
--   create extension if not exists pg_cron;
--   select cron.schedule('korex-overdue-notifs', '0 12 * * *',
--                        $$select public.generate_overdue_notifications();$$);
