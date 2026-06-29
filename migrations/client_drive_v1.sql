-- client_drive_v1 — espejo automático del árbol de Google Drive por cliente.
--
-- Objetivo: que el equipo NO tenga que copiar/pegar links de carpetas a mano.
-- Una rutina diaria (edge function `drive-sync`) recorre la carpeta de cada
-- cliente (clients.drive_folder_url) vía Apps Script y guarda acá el árbol
-- completo (carpetas + archivos). El panel lo muestra agrupado por estrategia,
-- desplegable, y abre cada item en Drive. Además detecta duplicados / nombres
-- muy parecidos dentro de la MISMA carpeta y avisa por Slack al canal del cliente.
--
-- Ingesta: SOLO la edge function escribe (service_role, saltea RLS). El panel
-- solo lee. Los ids son los de Drive (text) para que el upsert sea idempotente.

-- ── 1) Nodos del árbol (carpetas + archivos) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_drive_nodes (
  id            text PRIMARY KEY,                 -- Drive file/folder id
  client_id     text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  parent_id     text,                             -- Drive id del padre (null en la raíz)
  name          text,
  node_type     text,                             -- folder|document|sheet|slides|pdf|image|video|other
  mime_type     text,
  web_url       text,                             -- link para abrir en Drive
  modified_time timestamptz,
  depth         int  DEFAULT 0,
  is_root       boolean DEFAULT false,            -- la carpeta raíz del cliente
  strategy_id   text,                             -- estrategia del panel a la que pertenece (si aplica)
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_drive_nodes_client_idx   ON public.client_drive_nodes(client_id);
CREATE INDEX IF NOT EXISTS client_drive_nodes_parent_idx   ON public.client_drive_nodes(client_id, parent_id);
CREATE INDEX IF NOT EXISTS client_drive_nodes_strategy_idx ON public.client_drive_nodes(strategy_id);

-- ── 2) Alertas de duplicados ya avisadas (anti-spam) ─────────────────────────
-- Cada grupo de duplicados se avisa UNA sola vez. dupe_key = ids del grupo
-- ordenados y unidos con '|' (estable para el mismo conjunto de archivos). Si el
-- duplicado desaparece, la edge function borra la fila para poder re-avisar.
CREATE TABLE IF NOT EXISTS public.client_drive_dupe_alerts (
  id         text PRIMARY KEY,
  client_id  text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  dupe_key   text NOT NULL,
  node_ids   text[] NOT NULL DEFAULT '{}',
  names      text[] NOT NULL DEFAULT '{}',
  alerted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, dupe_key)
);

CREATE INDEX IF NOT EXISTS client_drive_dupe_alerts_client_idx ON public.client_drive_dupe_alerts(client_id);

-- ── 3) RLS: el panel (authenticated) solo lee; la edge function escribe ───────
ALTER TABLE public.client_drive_nodes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_drive_dupe_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_drive_nodes_read ON public.client_drive_nodes;
CREATE POLICY client_drive_nodes_read ON public.client_drive_nodes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS client_drive_dupe_alerts_read ON public.client_drive_dupe_alerts;
CREATE POLICY client_drive_dupe_alerts_read ON public.client_drive_dupe_alerts
  FOR SELECT TO authenticated USING (true);

-- Sin acceso anon (hardening). La escritura va por service_role (saltea RLS).
GRANT SELECT ON public.client_drive_nodes, public.client_drive_dupe_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_drive_nodes, public.client_drive_dupe_alerts TO service_role;

-- ── 4) pg_cron: sincronización diaria (correr una sola vez, admin) ────────────
-- 06:00 BUE = 09:00 UTC. Reemplazar <PROJECT_REF> y <CRON_SECRET> (= soporte_config.cron_secret).
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--   select cron.schedule('korex-drive-sync', '0 9 * * *', $$
--     select net.http_post(
--       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/drive-sync',
--       headers := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
--       body    := '{}'::jsonb
--     );
--   $$);
