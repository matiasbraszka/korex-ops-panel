-- marketing_funnels_corpus_v1.sql
-- Corpus del agente de Copy de Funnels (subagente `landing`).
--
-- NO CREA NADA. La tabla (marketing_ad_library), los indices y los 4 RPCs de ingesta ya
-- existen: los creo marketing_vsl_corpus_v1.sql. Este archivo documenta el CONTRATO de los
-- `part` nuevos, que es lo unico que agrega este agente al esquema. `part` es texto libre
-- sin CHECK, asi que sin esto no queda escrito en ningun lado que significan.
--
-- Se carga con:
--   node scripts/funnels-corpus-parse.mjs --docs <carpeta> --ejemplos "Copy funnels Korex.docx" --out <dir>
--   node scripts/funnels-corpus-load.mjs --dir <dir>          (verifica MD5 fila por fila)
--   node scripts/funnels-corpus-test.mjs                      (prueba el retrieval sin deployar)
--
-- ============================================================================
-- LOS `part` DE ESTE AGENTE (156 filas)
-- ============================================================================
--
--   cf_blueprint  (1)    id: mal_cf_blueprint
--                        El SOP del proceso + los errores comunes, concatenados. Va SIEMPRE
--                        en la capa estable del prompt (se cachea). Es el estandar del metodo.
--
--   cf_section    (5)    id: mal_cf_sec_NN
--                        Una por fase (pre-landing, landing VSL, formulario, thank you page)
--                        + Secciones Graficas. Las recupera el scorer segun lo que se pide.
--                        niche_tags lleva las palabras de esa fase: asi engancha el pedido.
--
--   cf_ficha      (31)   id: mal_cf_ficha_<cliente>__<funnel>
--                        Resumen de cada funnel real: avatar, nicho, estrategia, estado y el
--                        arranque de sus 4 paginas. Es lo que PUNTUA el scorer (~1 KB c/u).
--
--   cf_pagina     (119)  id: mal_cf_pag_<cliente>__<funnel>__<fase>
--                        El copy real, verbatim del DEL. UNA FILA POR PAGINA.
--                        fase ∈ (prelanding | landing | formulario | thankyou), y va tambien
--                        en niche_tags[0] y en metrics.fase.
--
-- Por que una fila por pagina y no por funnel: un funnel entero pesa ~8 KB y los top-3 no
-- entrarian comodos en el prompt, pero sobre todo asi se puede auditar una pagina suelta
-- trayendo ESA pagina de varios funnels comparables, que es la mitad de para lo que se usa
-- el agente. El de VSL parte igual (ficha + guion), un nivel mas grueso.
--
-- Las 5 paginas que el DEL no tiene NO se cargan: la fila no existe. El documento fuente las
-- marca explicitamente y avisa que no hay que inventar un patron a partir de su ausencia.
--
-- ============================================================================
-- metrics jsonb — OJO: acá NO hay metricas de performance
-- ============================================================================
--
--   {funnel_id, cliente, funnel, estrategia, estado, publicado, paginas[], url?, fase?, titulo_del?}
--
-- A diferencia de VSL (que trae la retencion de Voomly y un tier ganador/perdedor), de estos
-- funnels NO se sabe cual convirtio: no hay retencion, ni CPL, ni tasa de registro atada a
-- estas paginas. Lo unico cierto es si llego a publicarse (5 de 31).
--
-- Por eso `publicado` pesa apenas +1 en el scorer y NO se mapea a tier='ganador', que sumaria
-- +2 y le diria al agente que ese funnel funciono. Seria inventar evidencia que no existe.
-- El prompt se lo dice crudo: "publicado" / "nunca se publico", y las instrucciones del
-- especialista le prohiben presentarlos como casos de exito.
--
-- Si algun dia hay metricas de conversion por funnel, ESTE es el lugar donde entran, y ahi si
-- conviene un tier con su umbral (como vsl_winners_config).
--
-- ============================================================================
-- Verificacion (no destructiva)
-- ============================================================================

-- Conteo por part: esperado 1 / 5 / 31 / 119
select part, count(*) as filas, sum(char_count) as chars
from public.marketing_ad_library
where part like 'cf\_%'
group by part order by part;

-- Paginas por fase: esperado prelanding 30 · landing 31 · formulario 29 · thankyou 29
select metrics->>'fase' as fase, count(*) as paginas
from public.marketing_ad_library
where part = 'cf_pagina'
group by 1 order by 1;

-- Toda ficha declara en metrics.paginas las paginas que realmente tiene cargadas.
-- Si esto devuelve filas, el corpus quedo inconsistente y el retrieval pediria paginas
-- que no existen (se filtra por metrics.paginas antes de armar los ids).
select f.id, f.metrics->'paginas' as declara, count(p.id) as existen
from public.marketing_ad_library f
left join public.marketing_ad_library p
  on p.part = 'cf_pagina' and p.id like 'mal_cf_pag_' || replace(f.id, 'mal_cf_ficha_', '') || '\_\_%'
where f.part = 'cf_ficha'
group by f.id, f.metrics->'paginas'
having jsonb_array_length(f.metrics->'paginas') <> count(p.id);
