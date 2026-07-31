-- migrations/del_sections_v11_move_doc.sql
--
-- Mover una sección (hoja/pestaña) del DEL a OTRO DEL del MISMO cliente, cayendo en
-- la categoría elegida. Habilita el botón "Mover a otro embudo" del editor (DelEditor).
--
-- Hoy solo existía del_section_set_kind (mover dentro del mismo DEL, cambiando `kind`).
-- Esta función cambia además el `doc_id` (y sincroniza client_id/strategy_id del DEL
-- destino) para reubicar la hoja en otro embudo.
--
-- Seguridad: solo se permite mover entre DELs del MISMO cliente (evita filtrar contenido
-- de un cliente a otro). Mismo patrón que del_section_set_kind: security definer, adopta
-- ambos DELs con del_claim, y solo authenticated puede ejecutarla.

create or replace function public.del_section_move_doc(
  p_id text, p_target_doc_id text, p_kind text default null, p_by text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_src_doc   text;
  v_src_cli   text;
  v_dst_cli   text;
  v_dst_strat text;
  v_ord       int;
begin
  -- Sección de origen
  select doc_id, client_id into v_src_doc, v_src_cli from del_sections where id = p_id;
  if v_src_doc is null then raise exception 'seccion inexistente: %', p_id; end if;

  -- DEL destino (tomamos su cliente y su carpeta de estrategia)
  select client_id, strategy_id into v_dst_cli, v_dst_strat
    from client_brain_docs where id = p_target_doc_id;
  if v_dst_cli is null then raise exception 'DEL destino inexistente: %', p_target_doc_id; end if;

  -- Sin cambios si ya está en ese DEL
  if v_src_doc = p_target_doc_id then return; end if;

  -- Regla dura: mismo cliente
  if v_dst_cli is distinct from v_src_cli then
    raise exception 'no se puede mover una hoja a un DEL de otro cliente';
  end if;

  perform del_claim(v_src_doc);
  perform del_claim(p_target_doc_id);

  -- Nueva posición: al final del DEL destino (ord global único por doc).
  select coalesce(max(ord), 0) + 1 into v_ord from del_sections where doc_id = p_target_doc_id;

  update del_sections
     set doc_id      = p_target_doc_id,
         strategy_id = v_dst_strat,
         ord         = v_ord,
         kind        = coalesce(nullif(trim(p_kind), ''), kind),
         source      = 'panel',
         updated_at  = now(),
         updated_by  = p_by
   where id = p_id;
end
$function$;

revoke all   on function public.del_section_move_doc(text, text, text, text) from public, anon;
grant execute on function public.del_section_move_doc(text, text, text, text) to authenticated;

-- PostgREST cachea el esquema: sin esto el RPC nuevo da 404 hasta el próximo reinicio.
notify pgrst, 'reload schema';
