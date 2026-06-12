-- perf_v4: resuelve el ERROR del linter "security_definer_view" en
-- sales_v_lead_calls SIN cambiar el comportamiento.
--
-- La view era SECURITY DEFINER a proposito: llamadas solo es legible con
-- permiso de operaciones, y la view dejaba que Ventas viera las llamadas de
-- sus leads. El fix correcto: dar a Ventas una politica SELECT sobre llamadas
-- limitada EXACTAMENTE a las filas que expone la view (categoria ventas con
-- lead vinculado), y recien entonces pasar la view a security_invoker.

CREATE POLICY sales_llamadas_lead_calls_select ON public.llamadas
  FOR SELECT TO authenticated
  USING (
    has_permission('sales'::text, '*'::text, 'read'::text)
    AND categoria = 'ventas'
    AND lead_id IS NOT NULL
  );

ALTER VIEW public.sales_v_lead_calls SET (security_invoker = true);
