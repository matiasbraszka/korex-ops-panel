-- invitado_v1: rol "Invitado" para colaboradores externos con una vista
-- SUPER acotada del panel: solo la seccion Tareas (Objetivos + Tablero Sprint),
-- y solo sus propias tareas (el filtro por asignado ya vive en la UI, patron
-- `restricted` = no-admin). El editor de Admin -> Equipo lee el catalogo de
-- roles dinamicamente, asi que el checkbox "invitado" aparece solo.
--
-- Permiso operations read+write: el invitado necesita ESCRIBIR en `tasks`
-- (mover en el Kanban / marcar hecho). QUE puede tocar lo restringe la UI
-- (mismo modelo de confianza que cualquier miembro no-admin). El recorte a
-- "solo Tareas / solo mis clientes" es de interfaz, no de RLS.

INSERT INTO public.roles (name, description)
VALUES ('invitado', 'Acceso invitado: solo Tareas (Objetivos y Tablero Sprint), tareas propias')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role, module, submodule, can_read, can_write)
VALUES ('invitado', 'operations', '*', true, true)
ON CONFLICT DO NOTHING;
