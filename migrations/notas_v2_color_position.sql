-- Notas v2 — color + position; eliminar assignee
-- Quitamos el campo `assignee_id` (no se va a usar en la UI).
-- Agregamos:
--   - color: string libre con el nombre del preset (white, yellow, blue, ...)
--     usado por el frontend para pintar el fondo de la card.
--   - position: orden manual con drag&drop. Usamos double precision para que
--     reordenar sea barato (al insertar entre dos items podemos calcular el
--     promedio: position = (prev + next) / 2) sin renumerar todos los demas.

ALTER TABLE public.notas
  DROP COLUMN IF EXISTS assignee_id,
  ADD COLUMN IF NOT EXISTS color    text NOT NULL DEFAULT 'white',
  ADD COLUMN IF NOT EXISTS position double precision NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS notas_position_idx ON public.notas(position);
