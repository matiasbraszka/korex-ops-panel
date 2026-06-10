-- sales_closer_daily v2: formulario publico de carga
-- Dos funciones SECURITY DEFINER para que el formulario publico (/cargar-kpis,
-- sin login) pueda listar closers y guardar un dia SIN exponer la tabla al rol
-- anonimo. submit valida que el closer pertenezca al equipo de ventas.

CREATE OR REPLACE FUNCTION public.list_closers_publico()
RETURNS TABLE (closer_id uuid, name text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT tm.user_id, tm.name
  FROM team_members tm
  JOIN user_roles ur ON ur.user_id = tm.user_id
  WHERE tm.user_id IS NOT NULL AND ur.role = ANY (ARRAY['sales','admin'])
  GROUP BY tm.user_id, tm.name
  ORDER BY tm.name;
$$;

CREATE OR REPLACE FUNCTION public.submit_kpis_publico(
  p_closer_id uuid,
  p_date date,
  p_data jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ok boolean;
  i  jsonb := COALESCE(p_data, '{}'::jsonb);
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = p_closer_id AND ur.role = ANY (ARRAY['sales','admin'])
  ) INTO ok;
  IF NOT ok THEN
    RAISE EXCEPTION 'Closer invalido';
  END IF;

  INSERT INTO public.sales_closer_daily (
    closer_id, date,
    seguimientos, contactos_contactados, leads_vieron_contenido, calendlys_enviados, llamadas_agendadas,
    llamadas_calendario_inicio, llamadas_tuve, llamadas_calificadas, llamadas_no_asistieron, ofertas,
    depositos, ventas, facturacion, new_upfront_cash, updated_at
  ) VALUES (
    p_closer_id, p_date,
    COALESCE((i->>'seguimientos')::int, 0),
    COALESCE((i->>'contactos_contactados')::int, 0),
    COALESCE((i->>'leads_vieron_contenido')::int, 0),
    COALESCE((i->>'calendlys_enviados')::int, 0),
    COALESCE((i->>'llamadas_agendadas')::int, 0),
    COALESCE((i->>'llamadas_calendario_inicio')::int, 0),
    COALESCE((i->>'llamadas_tuve')::int, 0),
    COALESCE((i->>'llamadas_calificadas')::int, 0),
    COALESCE((i->>'llamadas_no_asistieron')::int, 0),
    COALESCE((i->>'ofertas')::int, 0),
    COALESCE((i->>'depositos')::int, 0),
    COALESCE((i->>'ventas')::int, 0),
    COALESCE((i->>'facturacion')::numeric, 0),
    COALESCE((i->>'new_upfront_cash')::numeric, 0),
    now()
  )
  ON CONFLICT (closer_id, date) DO UPDATE SET
    seguimientos               = EXCLUDED.seguimientos,
    contactos_contactados      = EXCLUDED.contactos_contactados,
    leads_vieron_contenido     = EXCLUDED.leads_vieron_contenido,
    calendlys_enviados         = EXCLUDED.calendlys_enviados,
    llamadas_agendadas         = EXCLUDED.llamadas_agendadas,
    llamadas_calendario_inicio = EXCLUDED.llamadas_calendario_inicio,
    llamadas_tuve              = EXCLUDED.llamadas_tuve,
    llamadas_calificadas       = EXCLUDED.llamadas_calificadas,
    llamadas_no_asistieron     = EXCLUDED.llamadas_no_asistieron,
    ofertas                    = EXCLUDED.ofertas,
    depositos                  = EXCLUDED.depositos,
    ventas                     = EXCLUDED.ventas,
    facturacion                = EXCLUDED.facturacion,
    new_upfront_cash           = EXCLUDED.new_upfront_cash,
    updated_at                 = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_closers_publico() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_kpis_publico(uuid, date, jsonb) TO anon, authenticated;
