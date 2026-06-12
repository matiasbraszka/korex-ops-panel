-- soporte_v1: rol y permiso del nuevo modulo Soporte (bandeja WhatsApp,
-- citas, recordatorios). El editor de Admin -> equipo lee el catalogo de
-- roles dinamicamente, asi que el checkbox "soporte" aparece solo.
-- Los admins acceden siempre via el shortcut isAdmin de useCan.

INSERT INTO public.roles (name, description)
VALUES ('soporte', 'Acceso al modulo Soporte: bandeja de WhatsApp, citas y recordatorios')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role, module, submodule, can_read, can_write)
VALUES ('soporte', 'soporte', '*', true, true)
ON CONFLICT DO NOTHING;
