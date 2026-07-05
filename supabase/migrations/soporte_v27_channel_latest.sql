-- soporte_v27: "lo último que sabemos" por canal.
-- Cuando un canal no tuvo actividad esta semana, la pestaña Satisfacción muestra
-- igual el último dato conocido (score + resumen + fecha) desde la serie semanal.
CREATE OR REPLACE FUNCTION public.ops_wa_channel_latest(p_client_id text)
RETURNS TABLE (scope text, score int, label text, notas text, week_start date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (h.scope) h.scope, h.score, h.label, h.notas, h.week_start
  FROM public.wa_satisfaction_history h
  WHERE h.client_id = p_client_id
    AND (has_permission('operations','*','read') OR has_permission('soporte','*','read'))
  ORDER BY h.scope, h.week_start DESC, h.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.ops_wa_channel_latest(text) FROM public;
GRANT EXECUTE ON FUNCTION public.ops_wa_channel_latest(text) TO authenticated;
