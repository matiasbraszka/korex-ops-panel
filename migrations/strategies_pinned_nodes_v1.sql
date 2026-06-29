-- strategies.pinned_nodes: items "fijados" (destacados) del árbol de Drive.
--
-- Cada estrategia puede fijar carpetas/documentos del espejo de Drive
-- (client_drive_nodes) para que se aparten arriba del desplegable, debajo
-- del documento DEL. Guarda un array de IDs de nodo. Aditivo: no toca datos.
-- Ya aplicado en vivo (apply_migration strategies_pinned_nodes).

ALTER TABLE public.strategies
  ADD COLUMN IF NOT EXISTS pinned_nodes jsonb NOT NULL DEFAULT '[]'::jsonb;
