-- migrations/funnels_v5_estrategia.sql
--
-- La pagina "Estrategia" del DEL (decision de Matias, llamada del 2026-07-16:
-- "faltaria la estrategia arriba y ya quedaria perfectamente estructurado").
-- Es una pagina propia del funnel (como Configuracion y Recursos) y hace REAL el
-- Paso 1 del riel ("Estrategia definida"), que hoy NO define nadie: el tipo se
-- ADIVINA con una regex sobre el nombre de la carpeta de Drive.
--
-- Campos que ya existen y NO se tocan:
--   · tipo          (strategy_pages.tipo)          -- ya es campo real (v2)
--   · fecha         (strategy_pages.created_date)  -- ya existe, editable en la UI
--
-- Campo NUEVO de esta migracion:
--   · punto_dif  -> "punto diferencial del cliente" (decision de Matias 2026-07-15,
--                   ya escrita en el README de la maqueta). Son los ejes reales del SOP
--                   del blueprint: historia | testimonios | autoridad | producto.
--                   Define QUE SECCION DE LA LANDING PESA MAS. Se pueden elegir VARIOS
--                   (Matias 2026-07-17): se guardan separados por coma, ej "historia,autoridad".
--                   NO existia como campo.
--
-- Aditiva e inerte: columna nueva nula; nada cambia hasta que se llene un funnel.

alter table public.strategy_pages
  add column if not exists punto_dif text;

comment on column public.strategy_pages.punto_dif is
  'Punto diferencial del cliente (que secciones de la landing pesan mas), varios separados por coma: historia,testimonios,autoridad,producto.';

notify pgrst, 'reload schema';

-- Rollback:
--   alter table public.strategy_pages drop column if exists punto_dif;
