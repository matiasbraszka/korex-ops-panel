-- marketing_descubrimiento_corpus_v1.sql
-- Corpus del Agente de Descubrimiento (subagente `descubrimiento`).
--
-- NO CREA NADA. La tabla (marketing_ad_library), los indices y los RPCs de ingesta ya
-- existen: los creo marketing_vsl_corpus_v1.sql. Este archivo documenta el CONTRATO de los
-- `part` nuevos, que es lo unico que agrega este agente al esquema. `part` es texto libre
-- sin CHECK, asi que sin esto no queda escrito en ningun lado que significan.
--
-- El gate del agente vive aparte, en descubrimiento_gate_v1.sql (descubrimiento_status()).
--
-- Se carga con:
--   node scripts/descubrimiento-corpus-load.mjs [--dry-run]   (verifica MD5 fila por fila)
--   node scripts/descubrimiento-corpus-test.mjs               (prueba el ruteo sin deployar)
--
-- Las 5 skills fuente viven versionadas en corpus-src/korex_discovery_skills/ y se cargan
-- VERBATIM: no hay parser (a diferencia de VSL y funnels, que salian de .docx).
--
-- ============================================================================
-- LOS `part` DE ESTE AGENTE (11 filas)
-- ============================================================================
--
--   desc_blueprint  (1)   id: mal_desc_blueprint
--                         El SOP: la cadena de 5 pasos, sus dependencias, la regla de oro y
--                         como leer el gate. Va SIEMPRE en la capa estable del prompt (se
--                         cachea). Fuente versionada: corpus-src/descubrimiento-sop.md
--
--   desc_ficha      (5)   id: mal_desc_ficha_<slug>
--                         Una por skill: paso, momento del ciclo, cuando corresponde,
--                         prerrequisito, output, y el `description` del frontmatter de la
--                         skill. ~1 KB c/u. Van SIEMPRE las 5: son el MENU con el que el
--                         orquestador decide y con el que puede decir "el que corresponde es
--                         el paso 4" sin tener cargada la metodologia del 4.
--
--   desc_skill      (5)   id: mal_desc_skill_<slug>
--                         El SKILL.md completo, verbatim. Entra SOLO el del paso activo.
--
-- slug ∈ (research | competencia | onboarding | estrategia | avatar)
--
-- EL SLUG ES LA BISAGRA DE TODO. El mismo string es:
--   - el sufijo del id de la fila            (mal_desc_skill_<slug>)
--   - el `stage` del gate                    (descubrimiento_status.stage)
--   - la clave del ruteo en agent-chat       (PASOS_DESC[].slug)
--   - el `metrics.slug` de ficha y skill
-- Si cambia en un lado, cambia en los cuatro.
--
-- ============================================================================
-- Por que la skill entera y no troceada (no existe `desc_section`)
-- ============================================================================
--
-- VSL y funnels trocean su blueprint en `*_section` y el scorer trae el top-3 de secciones.
-- Aca NO, y es deliberado: estas 5 skills son metodologias PRESCRIPTIVAS — tienen secciones
-- tituladas "ESTRUCTURA DEL DOCUMENTO (OBLIGATORIA)", "REGLAS DE ORO", "PROCESO PASO A PASO".
-- Mandar 3 secciones sueltas elegidas por keywords no da "la parte relevante": da una
-- metodologia rota, sin su estructura de salida ni sus reglas.
--
-- Entonces la eleccion se hace un nivel mas arriba: se elige QUE SKILL (no que parrafo), y
-- esa skill entra completa. Es la misma logica de "buscar el caso mas cercano -> clonar su
-- estructura" del corpus de VSL, pero aplicada a metodologias en vez de ejemplos.
--
-- El costo de esa decision es el peso del paso activo (chars / ~tokens):
--   research      23.065  ~6,1k     competencia    7.840  ~2,1k
--   onboarding    12.453  ~3,3k     estrategia    26.842  ~7,1k
--   avatar        49.372  ~13k   <- el mas pesado
-- Mandar las 5 siempre serian ~32k tokens por turno. Asi es entre 2k y 13k, y el peor caso
-- (avatar) cuesta ~$0,04 por turno: va en la capa volatil, no se cachea.
--
-- ============================================================================
-- metrics jsonb — OJO: aca NO hay metricas de performance
-- ============================================================================
--
--   {slug, skill, ord, momento, prereq}
--
-- Es metadata del pipeline, no evidencia de que algo funciono. A diferencia del corpus de
-- VSL (que trae retencion de Voomly y un tier ganador/perdedor), aca no hay nada que medir:
-- una metodologia no "convierte". No agregar `tier` a estas filas: el scorer de agent-chat
-- le da +2 a tier='ganador', y eso le diria al agente que una skill es mejor que otra
-- cuando lo unico que decide cual usar es EN QUE PASO ESTA EL CLIENTE.
--
-- ============================================================================
-- niche y avatar van en NULL a proposito
-- ============================================================================
--
-- El scorer suma +5 si el `niche` de la fila matchea el nicho del cliente y +3 por avatar.
-- Que skill corresponde NO depende del nicho ni del avatar: depende del paso del pipeline.
-- Si estas 11 filas llevaran niche='network_marketing', las 5 sumarian +5 por igual — no
-- discriminaria nada y ademas competirian con el corpus de los otros agentes.
--
-- Las palabras con las que el equipo pide cada paso viven en `niche_tags`, que junto con
-- `niche` y `title` es lo unico que mira el scorer (hayOf() nunca lee el content).
--
-- ============================================================================
-- Verificacion (no destructiva)
-- ============================================================================

-- Conteo por part: esperado 1 / 5 / 5
select part, count(*) as filas, sum(char_count) as chars
from public.marketing_ad_library
where part like 'desc\_%'
group by part order by part;

-- Toda ficha tiene su skill y viceversa (el id deriva del slug: si no matchean, el
-- retrieval pediria una skill que no existe y el paso activo entraria sin metodologia).
select coalesce(f.metrics->>'slug', s.metrics->>'slug') as slug,
       f.id as ficha, s.id as skill, s.char_count as skill_chars
from public.marketing_ad_library f
full outer join public.marketing_ad_library s
  on s.part = 'desc_skill' and s.metrics->>'slug' = f.metrics->>'slug'
where f.part = 'desc_ficha' or s.part = 'desc_skill'
order by (coalesce(f.metrics->>'ord', s.metrics->>'ord'))::int;

-- Los 5 slugs del corpus tienen que ser EXACTAMENTE los 5 stages del gate.
-- Si esto devuelve filas, el ruteo se rompe: hay un paso sin metodologia o al reves.
select coalesce(c.slug, g.stage) as slug,
       (c.slug is not null) as en_corpus, (g.stage is not null) as en_gate
from (select distinct metrics->>'slug' as slug from public.marketing_ad_library
      where part = 'desc_skill') c
full outer join (select stage from public.descubrimiento_status('c_1775304975528_bf0w0m')) g
  on g.stage = c.slug
where c.slug is null or g.stage is null;
