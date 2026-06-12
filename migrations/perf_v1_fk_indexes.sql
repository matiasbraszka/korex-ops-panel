-- perf_v1: indices para las 10 FKs sin indice detectadas por los advisors
-- de Supabase (2026-06-12). Solo agrega indices: no cambia logica ni datos.

CREATE INDEX IF NOT EXISTS idx_contacts_linked_client_id      ON public.contacts (linked_client_id);
CREATE INDEX IF NOT EXISTS idx_contacts_linked_team_member_id ON public.contacts (linked_team_member_id);
CREATE INDEX IF NOT EXISTS idx_notifications_bullet_comment_id ON public.notifications (bullet_comment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_comment_id        ON public.notifications (comment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_task_id           ON public.notifications (task_id);
CREATE INDEX IF NOT EXISTS idx_sales_leads_contact_id          ON public.sales_leads (contact_id);
CREATE INDEX IF NOT EXISTS idx_sales_pipeline_members_added_by ON public.sales_pipeline_members (added_by);
CREATE INDEX IF NOT EXISTS idx_sales_resources_created_by      ON public.sales_resources (created_by);
CREATE INDEX IF NOT EXISTS idx_team_blockers_report_id         ON public.team_blockers (report_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role                 ON public.user_roles (role);
