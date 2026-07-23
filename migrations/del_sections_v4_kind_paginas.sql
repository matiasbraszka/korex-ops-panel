-- migrations/del_sections_v4_kind_paginas.sql
--
-- Arregla la clasificación: secciones de PÁGINA (Pre-landing, Landing, Formulario,
-- Thank You, Testimonios) caían en "Avatares" cuando el título mencionaba el avatar
-- (ej. "Pre-landing · Avatar 2"). Motivo: en del_section_kind el CASE chequeaba
-- 'avatar' ANTES que las páginas, y el primer match gana.
--
-- Fix: las páginas se detectan PRIMERO; 'avatar' queda después (una sección de avatar
-- pura —"Avatar 2 — Networkers", "Segmentación", "Descripción"— no tiene palabra de
-- página, así que sigue cayendo en avatares). Además 'landing' pasa antes que 'vsl'
-- para que "Landing VSL" sea la PÁGINA, no el guión.
--
-- No reimporta: hace un UPDATE en su lugar, así conserva los id de sección (y por
-- ende los comentarios que cuelgan de ellos). No toca el texto.

create or replace function public.del_section_kind(p_title text)
returns text
language sql
immutable
as $function$
  select case
    when p_title ~* 'estado del pipeline'     then 'pipeline_viejo'
    when p_title ~* 'mensaje'                 then 'mensajes'
    -- PÁGINAS primero (antes que avatar), de la más específica a la más general.
    when p_title ~* 'pre-?landing'            then 'pg_prelanding'
    when p_title ~* 'thank|\mtyp\M'           then 'pg_thankyou'
    when p_title ~* 'formulario'              then 'pg_formulario'
    when p_title ~* 'testimonio'              then 'pg_testimonios'
    when p_title ~* 'landing|\mbcl\M'         then 'pg_landing'
    -- Piezas de producción.
    when p_title ~* '\mvsl|gui[oó]n'          then 'vsl'
    when p_title ~* 'anuncio|\mads\M'         then 'anuncios'
    -- Avatar: sólo lo que NO es página ni pieza (nombre/segmentación/descripción).
    when p_title ~* 'avatar'                  then 'avatares'
    when p_title ~* 'estrategia|an[aá]lisis'  then 'estrategia'
    else 'otros'
  end
$function$;

-- Reclasifica en su lugar (no borra, no reimporta → conserva ids y comentarios).
update public.del_sections set kind = public.del_section_kind(title)
 where kind is distinct from public.del_section_kind(title);

notify pgrst, 'reload schema';

-- ── Verificación ─────────────────────────────────────────────────────────────
--   -- ninguna sección de página debería quedar en 'avatares':
--   select title, kind from del_sections
--    where kind='avatares' and title ~* 'landing|formulario|thank|testimonio';  -- 0 filas
--   select kind, count(*) from del_sections group by kind order by 2 desc;
