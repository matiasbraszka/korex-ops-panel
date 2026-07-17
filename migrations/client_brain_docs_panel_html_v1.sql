-- migrations/client_brain_docs_panel_html_v1.sql
--
-- Permite EDITAR desde el panel los documentos del cliente (personalidad, onboarding,
-- investigación) que aparecen en todos sus DEL. Se guarda el html editado en una columna
-- nueva (panel_html); el lector del panel lo prefiere sobre el texto plano.
--
-- `text` (lo que leen los agentes) se sigue actualizando con la edición, para que el
-- cambio también les llegue. OJO: client-brain-sync reescribe `text` desde el Google Doc
-- en cada corrida; panel_html NO lo pisa nadie, así que en el panel el cambio queda
-- siempre. (La protección total del texto contra el sync es un paso posterior.)
--
-- ADITIVA e INERTE: columnas nuevas nulas; nada cambia hasta que se edite un documento.

alter table public.client_brain_docs
  add column if not exists panel_html      text,
  add column if not exists panel_edited_by text,
  add column if not exists panel_edited_at timestamptz;

notify pgrst, 'reload schema';

-- Rollback:
--   alter table public.client_brain_docs
--     drop column if exists panel_html, drop column if exists panel_edited_by,
--     drop column if exists panel_edited_at;
