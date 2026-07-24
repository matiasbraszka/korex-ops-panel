-- agent_feedback_rls_v1 — cierra el hallazgo del advisor de Supabase: agent_feedback y
-- agent_improvements estaban con RLS DESHABILITADO, expuestas a anon/authenticated.
--
-- Riesgo de aplicarlo: casi nulo. Las dos tablas tienen 0 filas, y las edge functions que
-- las usan (agent-feedback-triage, apply-improvement) van por service_role, que saltea RLS.
-- Las policies son las mismas del resto del cerebro de marketing (marketing_brain_v1.sql):
-- gobernadas por el permiso 'marketing' vía has_permission.

ALTER TABLE public.agent_feedback     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_improvements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_feedback_read ON public.agent_feedback;
CREATE POLICY agent_feedback_read ON public.agent_feedback
  FOR SELECT TO authenticated USING (has_permission('marketing','*','read'));
DROP POLICY IF EXISTS agent_feedback_write ON public.agent_feedback;
CREATE POLICY agent_feedback_write ON public.agent_feedback
  FOR ALL TO authenticated
  USING (has_permission('marketing','*','write'))
  WITH CHECK (has_permission('marketing','*','write'));

DROP POLICY IF EXISTS agent_improvements_read ON public.agent_improvements;
CREATE POLICY agent_improvements_read ON public.agent_improvements
  FOR SELECT TO authenticated USING (has_permission('marketing','*','read'));
DROP POLICY IF EXISTS agent_improvements_write ON public.agent_improvements;
CREATE POLICY agent_improvements_write ON public.agent_improvements
  FOR ALL TO authenticated
  USING (has_permission('marketing','*','write'))
  WITH CHECK (has_permission('marketing','*','write'));
