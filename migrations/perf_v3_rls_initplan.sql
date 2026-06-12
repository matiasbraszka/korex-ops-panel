-- perf_v3: optimiza politicas RLS que re-evaluaban auth.uid() por fila
-- (advisor auth_rls_initplan). Cambio semanticamente identico: se envuelve
-- auth.uid() en (SELECT auth.uid()) para que Postgres lo evalue una vez por
-- query. Definiciones extraidas textualmente de pg_policies el 2026-06-12.

-- user_roles (CRITICA: la lee el AuthProvider en el login)
DROP POLICY IF EXISTS user_roles_select_self_or_admin ON public.user_roles;
CREATE POLICY user_roles_select_self_or_admin ON public.user_roles
  FOR SELECT TO authenticated
  USING ((user_id = (SELECT auth.uid())) OR is_admin());

-- sales_closer_daily
DROP POLICY IF EXISTS sales_closer_daily_read ON public.sales_closer_daily;
CREATE POLICY sales_closer_daily_read ON public.sales_closer_daily
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = ANY (ARRAY['sales'::text, 'admin'::text])));

DROP POLICY IF EXISTS sales_closer_daily_write ON public.sales_closer_daily;
CREATE POLICY sales_closer_daily_write ON public.sales_closer_daily
  FOR ALL TO public
  USING ((closer_id = (SELECT auth.uid())) OR (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'admin'::text)))
  WITH CHECK ((closer_id = (SELECT auth.uid())) OR (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'admin'::text)));

-- sales_leads
DROP POLICY IF EXISTS sales_leads_visible_select ON public.sales_leads;
CREATE POLICY sales_leads_visible_select ON public.sales_leads
  FOR SELECT TO authenticated
  USING (is_admin() OR (owner_id = (SELECT auth.uid())) OR (setter_id = (SELECT auth.uid())) OR is_pipeline_member(pipeline_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS sales_leads_visible_write ON public.sales_leads;
CREATE POLICY sales_leads_visible_write ON public.sales_leads
  FOR ALL TO authenticated
  USING (is_admin() OR (owner_id = (SELECT auth.uid())) OR (setter_id = (SELECT auth.uid())) OR is_pipeline_member(pipeline_id, (SELECT auth.uid())))
  WITH CHECK (is_admin() OR (owner_id = (SELECT auth.uid())) OR (setter_id = (SELECT auth.uid())) OR is_pipeline_member(pipeline_id, (SELECT auth.uid())));

-- sales_pipeline_members
DROP POLICY IF EXISTS pipeline_members_select ON public.sales_pipeline_members;
CREATE POLICY pipeline_members_select ON public.sales_pipeline_members
  FOR SELECT TO authenticated
  USING ((user_id = (SELECT auth.uid())) OR is_admin() OR is_pipeline_owner(pipeline_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS pipeline_members_write ON public.sales_pipeline_members;
CREATE POLICY pipeline_members_write ON public.sales_pipeline_members
  FOR ALL TO authenticated
  USING (is_admin() OR is_pipeline_owner(pipeline_id, (SELECT auth.uid())))
  WITH CHECK (is_admin() OR is_pipeline_owner(pipeline_id, (SELECT auth.uid())));

-- sales_pipelines
DROP POLICY IF EXISTS sales_pipelines_select ON public.sales_pipelines;
CREATE POLICY sales_pipelines_select ON public.sales_pipelines
  FOR SELECT TO authenticated
  USING ((is_shared = true) OR (owner_id = (SELECT auth.uid())) OR is_admin() OR is_pipeline_member(id, (SELECT auth.uid())));

DROP POLICY IF EXISTS sales_pipelines_insert ON public.sales_pipelines;
CREATE POLICY sales_pipelines_insert ON public.sales_pipelines
  FOR INSERT TO authenticated
  WITH CHECK ((owner_id = (SELECT auth.uid())) OR is_admin());

DROP POLICY IF EXISTS sales_pipelines_update ON public.sales_pipelines;
CREATE POLICY sales_pipelines_update ON public.sales_pipelines
  FOR UPDATE TO authenticated
  USING ((owner_id = (SELECT auth.uid())) OR is_admin())
  WITH CHECK ((owner_id = (SELECT auth.uid())) OR is_admin());

DROP POLICY IF EXISTS sales_pipelines_delete ON public.sales_pipelines;
CREATE POLICY sales_pipelines_delete ON public.sales_pipelines
  FOR DELETE TO authenticated
  USING (((owner_id = (SELECT auth.uid())) OR is_admin()) AND (is_shared = false));

-- sales_resources
DROP POLICY IF EXISTS sales_resources_select ON public.sales_resources;
CREATE POLICY sales_resources_select ON public.sales_resources
  FOR SELECT TO public
  USING (is_shared OR (created_by = (SELECT auth.uid())) OR is_admin());

DROP POLICY IF EXISTS sales_resources_update ON public.sales_resources;
CREATE POLICY sales_resources_update ON public.sales_resources
  FOR UPDATE TO public
  USING ((created_by = (SELECT auth.uid())) OR is_admin())
  WITH CHECK ((created_by = (SELECT auth.uid())) OR is_admin());

DROP POLICY IF EXISTS sales_resources_delete ON public.sales_resources;
CREATE POLICY sales_resources_delete ON public.sales_resources
  FOR DELETE TO public
  USING ((created_by = (SELECT auth.uid())) OR is_admin());

-- sales_targets
DROP POLICY IF EXISTS sales_targets_read ON public.sales_targets;
CREATE POLICY sales_targets_read ON public.sales_targets
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = ANY (ARRAY['sales'::text, 'admin'::text])));

DROP POLICY IF EXISTS sales_targets_write ON public.sales_targets;
CREATE POLICY sales_targets_write ON public.sales_targets
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'admin'::text))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'admin'::text));
