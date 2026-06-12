-- soporte_v9: asignación de conversaciones. Por defecto todo chat se asigna a
-- Zil Oliveros (asistente, team_members.id='zil'); desde el panel se puede
-- reasignar a cualquier miembro. (Aplicada el 2026-06-12)

UPDATE public.app_settings
SET value = value || jsonb_build_object(
  'default_assignee', coalesce(value->>'default_assignee', 'zil')
)
WHERE key = 'soporte_config';

UPDATE public.wa_conversations
SET assigned_to = 'zil'
WHERE assigned_to IS NULL;
