-- descubrimiento_gate_v2_quien_ejecuta.sql
-- Los pasos 1 y 2 (research y competencia) NO se hacen desde el chat. El gate tiene que decirlo.
--
-- EL BUG QUE ARREGLA (lo encontró una simulación del arranque del chat contra los clientes
-- reales, antes de que nadie lo probara):
--
--   Pablo Valladolid está en pre-llamada, sin nada cargado. El gate v1 le marcaba `research`
--   como 'pendiente' — que significa "se puede producir ahora" — y la edge fn, viendo que no
--   estaba bloqueado, le cargaba al modelo los 23 KB de la metodología de research. Esa
--   metodología abre diciendo "hacé 15-20 búsquedas del líder y 12-18 de la empresa".
--
--   El chat no tiene buscador. Un modelo con esa instrucción, sin la herramienta y con un
--   nombre de líder, hace lo único que puede: inventarlo. Y un research inventado no queda
--   ahí: es el input del análisis estratégico (paso 4), que es el input del avatar (paso 5).
--   Envenena toda la cadena, con formato de research serio y "fuentes" que no existen.
--
--   Es exactamente lo que el doc del agente prohíbe: "Si una skill no está disponible, NO la
--   simules: avisá qué falta".
--
-- QUÉ CAMBIA:
--   · El `detail` de research y competencia dice que no se hacen acá y quién los aporta.
--   · `can_generate` es false para esos dos SIEMPRE, aunque figuren pendientes: no hay con qué.
--
-- El corte de verdad lo hace la edge fn, que no le carga la metodología a un paso cuyo
-- `metrics.ejecuta` es "fuera" (eso vive en el corpus, en las fichas: ver
-- marketing_descubrimiento_corpus_v1.sql). Esto es la otra mitad: que el estado no mienta.
--
-- CUÁNDO REVERTIR ESTO: cuando existan las fases 2 (research con Brave) y 3 (competencia con
-- el Ad Library API) como jobs a-pedido. Ahí los dos pasos pasan a producirse de verdad, y
-- hay que actualizar el `detail`, el `can_generate` y el `ejecuta` de las fichas del corpus.
--
-- El cuerpo completo de la función está en la migración aplicada (descubrimiento_gate_v2_quien_ejecuta).
-- Este archivo documenta el porqué; para el estado actual de la función:
--   select pg_get_functiondef('public.descubrimiento_status(text)'::regprocedure);

-- ============================================================================
-- Verificación (no destructiva)
-- ============================================================================

-- 1) research y competencia nunca pueden generarse desde el chat, pasen lo que pasen.
--    Si esto devuelve filas, el bug volvió.
select c.name, s.stage, s.status, s.can_generate
from clients c cross join lateral public.descubrimiento_status(c.id) s
where s.stage in ('research', 'competencia') and s.can_generate = true;

-- 2) Simulación del arranque del chat: qué paso abriría cada cliente y cuánta metodología
--    recibiría. Los pasos con ejecuta='fuera' tienen que dar 0.
-- with g as (select c.name, s.* from clients c cross join lateral public.descubrimiento_status(c.id) s),
--      elegido as (select distinct on (name) name, momento, stage from g where status='pendiente' order by name, ord)
-- select e.name, e.momento, e.stage as paso_que_abriria,
--        coalesce(f.metrics->>'ejecuta','?') as se_hace_en,
--        case when coalesce(f.metrics->>'ejecuta','chat')='fuera' then 0
--             else coalesce((select char_count from marketing_ad_library where id='mal_desc_skill_'||e.stage),0) end
--          as metodologia_que_recibe
-- from elegido e
-- left join marketing_ad_library f on f.part='desc_ficha' and f.metrics->>'slug' = e.stage
-- order by e.name;
