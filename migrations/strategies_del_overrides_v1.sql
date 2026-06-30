-- strategies.del_overrides: overrides del documento DEL por estrategia.
--
-- Permite OCULTAR un DEL auto-detectado (cuando hay varios docs con "DEL" o
-- "Documento en limpio" y solo uno es el correcto) o EDITAR su etiqueta/link.
-- Clave = id del nodo de Drive. Aditivo. Ya aplicado en vivo.
-- { "<nodeId>": { "hidden": true } , "<nodeId2>": { "label": "...", "url": "..." } }

ALTER TABLE public.strategies
  ADD COLUMN IF NOT EXISTS del_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
