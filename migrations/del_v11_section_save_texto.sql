-- ─────────────────────────────────────────────────────────────────────────────
-- del_v11_section_save_texto.sql
--
-- `del_sections` tiene DOS columnas de contenido, `html` y `text`, y estaban
-- escritas por caminos distintos:
--   · el panel guarda con `del_section_save`, que escribía SOLO `html`;
--   · `text` quedó congelado en lo que trajo la importación del Google Doc.
--
-- El panel muestra `html` (con fallback a `text`) y `del_assemble_text` también
-- prefiere `html`: para el equipo y para los agentes, `html` es el contenido. El
-- portal del cliente, en cambio, leía `text` — así que una pestaña escrita
-- nativa en el panel le llegaba VACÍA, y una editada le llegaba vieja.
--
-- El portal pasa a usar la misma precedencia (arreglado en el front) y acá se
-- corta la fuente del problema: `del_section_save` escribe las dos.
--
-- No se reescriben en masa las secciones ya desfasadas: hay 116 donde las dos
-- columnas difieren y en varias es `text` la que tiene el contenido largo. Se
-- rellenan solo las que tienen `text` vacío, donde no hay nada que perder.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- HTML → texto plano, con los saltos de línea que el HTML implica. Es el gemelo
-- en SQL del `htmlToText` que ya usaba el panel para los documentos del cliente.
create or replace function public.del_html_to_text(p_html text)
returns text
language sql immutable
as $$
  select btrim(regexp_replace(
    replace(replace(replace(replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(coalesce(p_html, ''), '<br\s*/?>', E'\n', 'gi'),
          '<li[^>]*>', '• ', 'gi'),
        '</(p|div|h[1-6]|li|tr)>', E'\n', 'gi'),
      '<[^>]+>', '', 'g'),
    '&nbsp;', ' '), '&amp;', '&'), '&lt;', '<'), '&gt;', '>'),
  E'\n{3,}', E'\n\n', 'g'));
$$;

create or replace function public.del_section_save(p_id text, p_html text, p_by text default null)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_doc text;
begin
  select doc_id into v_doc from del_sections where id = p_id;
  if v_doc is null then raise exception 'seccion inexistente: %', p_id; end if;
  perform del_claim(v_doc);
  update del_sections
     set html = p_html,
         text = public.del_html_to_text(p_html),   -- las dos juntas, siempre
         char_count = del_plain_len(p_html),
         source = 'panel',
         updated_at = now(),
         updated_by = p_by
   where id = p_id;
end
$function$;

-- Las que nunca tuvieron texto: se rellenan desde el html. Sin riesgo — no había
-- nada ahí.
update public.del_sections
   set text = public.del_html_to_text(html)
 where coalesce(html, '') <> '' and coalesce(btrim(text), '') = '';

commit;

notify pgrst, 'reload schema';
