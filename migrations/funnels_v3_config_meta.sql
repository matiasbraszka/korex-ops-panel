-- migrations/funnels_v3_config_meta.sql
--
-- Configuracion de Meta: el campo que falta y el que se usaba al reves.
--
-- ── 1. ad_account ────────────────────────────────────────────────────────────
-- La cuenta publicitaria de Meta desde la que se paga cada funnel. NO EXISTE en
-- ningun lado hoy (verificado). Es el unico campo nuevo de la pantalla nueva.
--
-- ── 2. clarity_code ──────────────────────────────────────────────────────────
-- El campo se llama `clarity_id` pero se usa como "pega aca el codigo": de los 14
-- funnels con Clarity cargado, los 14 tienen el <script> ENTERO pegado y NINGUNO
-- tiene el ID limpio. El mas largo son 349 caracteres.
--
-- El Pixel YA resolvio esto: tiene pixel_id (el ID) + pixel_code (el script). Esta
-- migracion le da al Clarity la misma forma. No se le cambia el habito al equipo:
-- el panel sigue aceptando que pegues el script y extrae el ID solo.
--
-- ── El backfill ──────────────────────────────────────────────────────────────
-- El patron es el del snippet oficial de Clarity:
--   (function(c,l,a,r,i,t,y){...})(window, document, "clarity", "script", "<ID>");
-- VERIFICADO 2026-07-17 contra los 14: los 14 matchean y el ID sale en los 14.
-- Por eso el update no necesita fallback ni deja filas a medias.
--
-- OJO — LO QUE ESTE BACKFILL DEJA A LA VISTA (no lo causa: ya estaba roto):
-- al extraer los IDs aparecen Clarity COMPARTIDOS ENTRE CLIENTES DISTINTOS.
--   · wt6dbf6z4y  -> 4 funnels de Corina Grosu + Marta Torrico
--   · weoqd4d4fp  -> 2 funnels de Monica Vozmediano + Summit Network
-- Alguien copio el script de un cliente a otro y se llevo el ID adentro: los mapas
-- de calor y las grabaciones de esos 4 clientes estan mezclados AHORA MISMO.
-- (wkfy5tf2rp x2 en Jose Luis Rivas es legitimo: mismo cliente, 2 funnels.)
-- Corregirlos es de Matias, no del codigo: hay que crear los proyectos que falten
-- en Clarity y pegar el ID correcto. La query de verificacion esta al final.
--
-- Aditiva e inerte: ninguna de las dos columnas se lee hasta que salga la UI.

alter table public.strategy_pages
  add column if not exists ad_account  text,
  add column if not exists clarity_code text;

comment on column public.strategy_pages.ad_account is
  'Cuenta publicitaria de Meta que paga este funnel (ej: act_1234567890).';
comment on column public.strategy_pages.clarity_code is
  'El <script> de Microsoft Clarity, tal cual se pega. El ID limpio va en clarity_id.';

-- Mueve el script a su columna y deja el ID limpio en clarity_id.
-- Idempotente: al correr de nuevo, el where ya no matchea (clarity_id ya es un ID).
update public.strategy_pages
   set clarity_code = clarity_id,
       clarity_id   = (regexp_match(clarity_id, '"clarity"\s*,\s*"script"\s*,\s*"([a-z0-9]{6,15})"'))[1]
 where clarity_id ilike '%<script%';

-- ── 3. Rescatar los 11 Pixel ─────────────────────────────────────────────────
-- El Pixel YA tenia sus dos columnas, pero nadie llenaba pixel_id: 11 funnels
-- tienen pixel_code y solo 1 tiene el ID. O sea que el ID estaba adentro del
-- codigo y el campo "Pixel ID" se veia VACIO aunque el dato estuviera.
-- Patron del snippet oficial:  fbq('init', '1234567890123456');
-- VERIFICADO 2026-07-17: los 11 matchean. No pisa el que ya tiene ID (coalesce).
update public.strategy_pages
   set pixel_id = (regexp_match(pixel_code, 'fbq\(\s*.init.\s*,\s*.([0-9]{10,20}).'))[1]
 where coalesce(pixel_code,'') <> ''
   and coalesce(pixel_id,'') = ''
   and pixel_code ~ 'fbq\(\s*.init.\s*,\s*.[0-9]{10,20}.';

-- Nota: el Pixel esta LIMPIO, el problema de mezcla es solo del Clarity. El unico
-- pixel_id repetido (1413723233472975) es de Corina Grosu consigo misma, en sus 2
-- funnels: eso es legitimo. Refuerza de donde viene el bug del Clarity -- el
-- Pixel se configuro cliente por cliente; el script de Clarity se copio y pego.

-- ── Verificacion (correr despues de aplicar) ─────────────────────────────────
-- 1. Los 14 Clarity quedaron partidos y ninguno perdio el dato; los 11 Pixel salieron:
--    select count(*) filter (where clarity_code ilike '%<script%')      as clarity_codigo,   -- 14
--           count(*) filter (where clarity_id ~ '^[a-z0-9]{6,15}$')     as clarity_id_limpio,-- 14
--           count(*) filter (where clarity_code is not null
--                              and clarity_id is null)                  as clarity_perdido,  -- 0
--           count(*) filter (where pixel_id ~ '^[0-9]{10,20}$')         as pixel_id_limpio,  -- 12 (11+1)
--           count(*) filter (where coalesce(pixel_code,'') <> ''
--                              and coalesce(pixel_id,'') = '')          as pixel_perdido     -- 0
--      from public.strategy_pages;
--
-- 2. Los Clarity compartidos entre clientes distintos (para que Matias los corrija):
--    select sp.clarity_id, count(*) as funnels, string_agg(distinct c.name, ' + ') as quienes
--      from public.strategy_pages sp join public.clients c on c.id = sp.client_id
--     where coalesce(sp.clarity_id,'') <> ''
--     group by sp.clarity_id having count(distinct c.name) > 1;
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--    update public.strategy_pages set clarity_id = clarity_code, clarity_code = null
--     where clarity_code is not null;
--    alter table public.strategy_pages drop column if exists ad_account,
--                                      drop column if exists clarity_code;
