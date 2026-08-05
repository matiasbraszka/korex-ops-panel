-- migrations/del_v3_landing_vsl.sql
--
-- Renombrar la sección estándar del DEL: "Landing" → "Landing VSL" (pedido de Matías).
-- El kind sigue siendo `pg_landing`: NO se toca la clasificación, solo la etiqueta que
-- se ve. Y "Landing VSL" cae igual en pg_landing porque del_section_kind evalúa
-- 'landing' antes que 'vsl' (ver del_sections_v4_kind_paginas.sql:11).
--
-- Tres lugares tienen la etiqueta:
--   1. del_version_add    → título de la sección que se crea al abrir una versión nueva
--   2. portal_cliente_documento → cómo la ve el CLIENTE en su portal
--   3. delTabs.js         → la pestaña del panel (va en el commit, no acá)
--
-- Filas existentes: solo se renombran las que dicen EXACTAMENTE "Landing" (5 filas),
-- que son las que creó automáticamente del_version_add. Todo lo demás
-- ("Landing 1 PASOS", "Landing Page VSL", "Landing (Networkers)"…) lo escribió una
-- persona y no se toca.

do $$
declare
  r record;
  v_def text;
  v_nuevo text;
  v_fn int := 0;
begin
  -- ── Funciones: reemplazo quirúrgico sobre la definición viva ────────────────
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (pg_get_functiondef(p.oid) ~ 'pg_landing''\s+then\s+''Landing'''
            or pg_get_functiondef(p.oid) ~ '"pg_landing":"Landing"')
  loop
    v_def   := pg_get_functiondef(r.oid);
    v_nuevo := replace(v_def, '"pg_landing":"Landing"', '"pg_landing":"Landing VSL"');
    v_nuevo := regexp_replace(v_nuevo, '(pg_landing''\s+then\s+)''Landing''', '\1''Landing VSL''', 'g');

    if v_nuevo = v_def then
      raise exception 'No se pudo reemplazar la etiqueta en %', r.proname;
    end if;

    execute v_nuevo;
    v_fn := v_fn + 1;
  end loop;

  if v_fn = 0 then
    raise exception 'Ninguna función tenía la etiqueta "Landing" — revisar antes de seguir';
  end if;

  raise notice 'Funciones actualizadas: %', v_fn;
end
$$;

-- ── Filas existentes: solo el título exacto "Landing" ────────────────────────
update public.del_sections
   set title = 'Landing VSL'
 where kind = 'pg_landing'
   and btrim(title) = 'Landing';

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   select btrim(title), count(*) from del_sections
--    where kind='pg_landing' group by 1 order by 2 desc;   -- "Landing" en 0
--   select public.del_section_kind('Landing VSL');          -- pg_landing
--
-- ROLLBACK: mismo bloque con los reemplazos al revés
--   + update del_sections set title='Landing' where btrim(title)='Landing VSL';
--     (OJO: eso también pisaría las 6 que ya decían "Landing VSL" de antes).
