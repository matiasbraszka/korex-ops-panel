-- migrations/del_sections_v5_set_kind.sql
--
-- Mover una sección del DEL a otra CATEGORÍA (cambia su `kind`). Habilita el botón
-- "mover a otra categoría" del editor (DelEditor). Mismo patrón que del_section_rename:
-- security definer, adopta el doc con del_claim, y solo authenticated puede ejecutarla.

create or replace function public.del_section_set_kind(p_id text, p_kind text, p_by text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_doc text;
begin
  select doc_id into v_doc from del_sections where id = p_id;
  if v_doc is null then raise exception 'seccion inexistente: %', p_id; end if;
  perform del_claim(v_doc);
  update del_sections
     set kind       = coalesce(nullif(trim(p_kind), ''), kind),
         source     = 'panel',
         updated_at = now(),
         updated_by = p_by
   where id = p_id;
end;
$function$;

revoke all   on function public.del_section_set_kind(text, text, text) from public, anon;
grant execute on function public.del_section_set_kind(text, text, text) to authenticated;

-- PostgREST cachea el esquema: sin esto el RPC nuevo da 404 hasta el próximo reinicio.
notify pgrst, 'reload schema';
