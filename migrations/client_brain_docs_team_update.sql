-- El panel no podía editar ni renombrar los documentos generales del cliente
-- (onboarding, personalidad, etc.): client_brain_docs solo tenía política de
-- SELECT, así que todo UPDATE moría en silencio (0 filas). El equipo puede editar.
-- Aplicada a prod vía MCP apply_migration el 2026-07-28.
create policy client_brain_docs_team_update on client_brain_docs
for update using (is_team_member()) with check (is_team_member());
