-- migrations/funnel_resources_v4_indices.sql
--
-- funnel_resources solo tenía índices por strategy_id y avatar_id sueltos. Las dos
-- consultas que el panel dispara todo el día no podían usarlos:
--
--   carpetas del CLIENTE  → client_id + strategy_id is null + avatar_id is null + bucket_key
--   carpetas del FUNNEL   → strategy_id + avatar_id + version + bucket_key
--
-- Medido antes (carpeta "branding" de un cliente):
--   Seq Scan · 801 páginas leídas · 6.809 filas descartadas para devolver 4 · 2,3 ms
--
-- Suena poco hasta que se multiplica: abrir UN funnel monta ~11 carpetas de cliente
-- (FunnelsView.jsx:1047-1058) más las de cada avatar, o sea 20-24 de estas consultas en
-- paralelo. Son ~9.000 páginas por apertura, y mover un solo archivo las redispara todas.
-- En una instancia por ráfagas como la nuestra, eso es CPU que no sobra (ver el incidente
-- del 2026-08-03).
--
-- created_at va en el índice porque las dos consultas ordenan por él: así el orden sale
-- del índice y no hace falta ordenar aparte.

-- Carpetas del cliente. Parcial: solo las filas de scope cliente (sin estrategia ni avatar),
-- que son las únicas que consulta esa rama. Índice chico y exactamente el que se usa.
create index if not exists funnel_resources_cliente_idx
  on public.funnel_resources (client_id, bucket_key, created_at desc)
  where strategy_id is null and avatar_id is null;

-- Carpetas del funnel.
create index if not exists funnel_resources_funnel_idx
  on public.funnel_resources (strategy_id, bucket_key, version, avatar_id, created_at desc);

analyze public.funnel_resources;

-- Verificación: el mismo explain de arriba tiene que pasar de Seq Scan a Index Scan y de
-- ~800 páginas a unas pocas.
--   explain (analyze, buffers, costs off)
--   select id,title from public.funnel_resources
--    where client_id='<un cliente>' and strategy_id is null and avatar_id is null
--      and bucket_key='branding' order by created_at desc;
--
-- ROLLBACK:
--   drop index if exists public.funnel_resources_cliente_idx;
--   drop index if exists public.funnel_resources_funnel_idx;
