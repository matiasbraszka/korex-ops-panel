-- migrations/funnels_v5_estrategia.sql
--
-- La seccion "Estrategia" del DEL (decision de Matias, llamada del 2026-07-16:
-- "faltaria la estrategia arriba y ya quedaria perfectamente estructurado").
-- Es la primera seccion del DEL y hace REAL el Paso 1 del riel ("Estrategia
-- definida"), que hoy NO define nadie: el tipo se ADIVINA con una regex sobre el
-- nombre de la carpeta de Drive. Con estos campos, el paso 1 deja de ser adivinanza.
--
-- Campos que ya existen y NO se tocan:
--   · tipo          (strategy_pages.tipo)          -- ya es campo real (v2)
--   · fecha         (strategy_pages.created_date)  -- ya existe, editable en la UI
--
-- Campos NUEVOS de esta migracion:
--   · campaign   -> etiqueta opcional para agrupar funnels de un mismo lanzamiento.
--                   Hoy sale de partir el nombre de la estrategia por "|"; se vuelve campo.
--   · punto_dif  -> "punto diferencial del cliente" (decision de Matias 2026-07-15,
--                   ya escrita en el README de la maqueta). Son los ejes reales del SOP
--                   del blueprint: historia | testimonios | autoridad | producto.
--                   Define QUE SECCION DE LA LANDING PESA MAS. NO existia como campo.
--   · objetivo   -> texto libre: que tiene que lograr este funnel, a quien le habla y
--                   que lo hace distinto de los otros funnels del cliente. NO existia.
--
-- Aditiva e inerte: columnas nuevas nulas; nada cambia hasta que se llene un funnel.

alter table public.strategy_pages
  add column if not exists campaign  text,
  add column if not exists punto_dif text,
  add column if not exists objetivo  text;

comment on column public.strategy_pages.campaign is
  'Etiqueta opcional de campana para agrupar funnels de un mismo lanzamiento.';
comment on column public.strategy_pages.punto_dif is
  'Punto diferencial del cliente (que seccion de la landing pesa mas): historia|testimonios|autoridad|producto.';
comment on column public.strategy_pages.objetivo is
  'Objetivo del funnel, texto libre: que tiene que lograr y que lo hace distinto.';

notify pgrst, 'reload schema';

-- Rollback:
--   alter table public.strategy_pages
--     drop column if exists campaign, drop column if exists punto_dif,
--     drop column if exists objetivo;
