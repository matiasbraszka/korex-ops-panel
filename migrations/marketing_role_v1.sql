-- marketing_role_v1 — rol 'marketing' para gobernar el acceso al área Marketing.
-- Aditivo: agrega el rol al catálogo + su permiso de módulo. Matías lo asigna
-- a los usuarios desde Administración → equipo. Admin ya ve todo.
INSERT INTO public.roles (name, description) VALUES
  ('marketing', 'Acceso al área de Marketing: métricas de VSL.')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role, module, submodule, can_read, can_write) VALUES
  ('marketing', 'marketing', '*', true, true)
ON CONFLICT DO NOTHING;
