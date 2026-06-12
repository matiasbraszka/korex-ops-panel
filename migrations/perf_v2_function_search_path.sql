-- perf_v2: fija search_path en las 19 funciones flaggeadas por el linter
-- de seguridad (function_search_path_mutable). No cambia logica: todas
-- referencian objetos de public; solo se fija el entorno de resolucion.

ALTER FUNCTION public.block_truncate_llamadas() SET search_path = public, pg_temp;
ALTER FUNCTION public.contacts_set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.contacts_sync_names() SET search_path = public, pg_temp;
ALTER FUNCTION public.forbid_truncate() SET search_path = public, pg_temp;
ALTER FUNCTION public.guess_llamada_categoria(p_participants text[]) SET search_path = public, pg_temp;
ALTER FUNCTION public.historial_eventos_touch_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_on_blocker_comment() SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_on_blocker_comment_mention() SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_on_bullet_comment_mention() SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_on_comment() SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_on_idea_comment() SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_on_idea_comment_mention() SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_on_report_bullet_mention() SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_on_task_comment_mention() SET search_path = public, pg_temp;
ALTER FUNCTION public.protect_bottleneck() SET search_path = public, pg_temp;
ALTER FUNCTION public.sales_leads_sync_closed_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.sales_stage_bucket_sync_leads() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at_sales_resources() SET search_path = public, pg_temp;
ALTER FUNCTION public.split_full_name(p text) SET search_path = public, pg_temp;
