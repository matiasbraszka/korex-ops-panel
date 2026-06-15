-- tareas_sprint_v2 — feedback de Matias (2026-06-15)
--   1) Esfuerzo estimado en HORAS, editable desde Objetivos (campo nuevo, no
--      derivado de la fecha de vencimiento). Separado de estimated_days (que
--      usan los timers del roadmap legacy) para no romper nada.
--   2) Notificaciones: además del responsable/hilo, avisar a TODOS los admins
--      en cada comentario de tarea (Matias como admin quiere verlos todos).

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS estimated_hours numeric;

CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_catalog AS $$
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
    FOR v_recipient IN
      SELECT DISTINCT rid FROM (
        SELECT public.korex_resolve_member_id(v_assignee) AS rid
        UNION
        SELECT tm.id FROM public.team_members tm
          JOIN public.user_roles ur ON ur.user_id = tm.user_id
          WHERE ur.role = 'admin'
      ) s
      WHERE rid IS NOT NULL AND rid <> NEW.author_id
    LOOP
      PERFORM public.korex_notify(
        v_recipient, NEW.author_id, 'task_comment', NEW.task_id, NEW.id,
        v_author || ' comentó en una tarea',
        '«' || coalesce(v_task_title, 'tarea') || '» — ' || left(NEW.body, 120),
        false);
    END LOOP;
  ELSE
    FOR v_recipient IN
      SELECT DISTINCT rid FROM (
        SELECT author_id AS rid FROM public.task_comments
          WHERE id = NEW.parent_id OR parent_id = NEW.parent_id
        UNION
        SELECT public.korex_resolve_member_id(v_assignee)
        UNION
        SELECT tm.id FROM public.team_members tm
          JOIN public.user_roles ur ON ur.user_id = tm.user_id
          WHERE ur.role = 'admin'
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
  RETURN NEW;
END;
$$;
