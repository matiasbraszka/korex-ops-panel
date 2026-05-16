-- Pending resources v1
-- Agrega la columna pending_resources al cliente para guardar el checklist de
-- recursos que el cliente nos debe enviar al arrancar. Cada item:
--   { id: text, label: text, description: text, done: bool }
-- La plantilla por defecto vive en app_settings.value.pending_resources_template
-- (array de { id, label, description }). Cuando se crea un cliente nuevo, el
-- frontend copia esa plantilla en el cliente.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS pending_resources jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.clients.pending_resources IS
  'Checklist de recursos que el cliente nos debe enviar (logo, fotos, etc.). Array de {id,label,description,done}.';
