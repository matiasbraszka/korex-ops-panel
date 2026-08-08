-- migrations/del_v7_deshacer_borrado.sql
--
-- "Ctrl+Z" para el DEL: poder deshacer el borrado de una sección.
--
-- La red de seguridad ya existía y nadie la podía usar: cada borrado de del_sections
-- (y de client_brain_docs) guarda la fila ENTERA en papelera_borrados por trigger
-- (papelera_del_v1.sql). Pero no había ninguna forma de sacarla de ahí: para
-- recuperar algo había que entrar a la base a mano. Con 726 secciones en juego y un
-- tacho de basura a un clic, eso es una bomba de tiempo.
--
-- Esta función devuelve la fila tal cual estaba. Es idempotente: si la sección ya
-- volvió (dos clics en Deshacer), no rompe ni duplica.
--
-- Solo el equipo, y solo lo borrado en las últimas 24 horas: "deshacer" es para el
-- clic equivocado de recién, no para revivir algo de hace tres semanas que a esta
-- altura chocaría con lo que se escribió después.

create or replace function public.del_section_restaurar(p_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_fila record; v_datos jsonb; v_ord int;
begin
  if not public.is_team_member() then raise exception 'no autorizado'; end if;

  select * into v_fila
    from public.papelera_borrados
   where tabla = 'del_sections' and fila_id = p_id
     and borrado_at > now() - interval '24 hours'
   order by borrado_at desc
   limit 1;

  if v_fila.id is null then
    return jsonb_build_object('ok', false, 'error', 'No encontré esa sección en la papelera (o pasaron más de 24 horas).');
  end if;

  if exists (select 1 from public.del_sections where id = p_id) then
    return jsonb_build_object('ok', true, 'ya_estaba', true);
  end if;

  v_datos := v_fila.datos;

  -- El `ord` es único por documento: si en el medio se creó otra sección que se quedó
  -- con ese número, la que vuelve se pone al final en vez de fallar.
  v_ord := (v_datos->>'ord')::int;
  if exists (select 1 from public.del_sections where doc_id = v_datos->>'doc_id' and ord = v_ord) then
    select coalesce(max(ord), 0) + 1 into v_ord
      from public.del_sections where doc_id = v_datos->>'doc_id';
  end if;

  insert into public.del_sections
  select * from jsonb_populate_record(null::public.del_sections, v_datos || jsonb_build_object('ord', v_ord));

  -- Si al borrarla se sacó su paso de la versión (del_v5), devolverlo también:
  -- deshacer tiene que dejar todo como estaba, no a medias.
  update public.del_versions
     set pasos = (select array_agg(distinct x) from unnest(pasos || array[v_datos->>'kind']) x)
   where doc_id = v_datos->>'doc_id'
     and version = coalesce((v_datos->>'version')::int, 1)
     and pasos is not null
     and not (v_datos->>'kind' = any(pasos));

  return jsonb_build_object('ok', true, 'titulo', v_datos->>'title');
end
$function$;

comment on function public.del_section_restaurar(text) is
  'Deshace el borrado de una sección del DEL, sacándola de papelera_borrados. Solo '
  'equipo y solo dentro de las 24 horas. Idempotente.';

revoke all   on function public.del_section_restaurar(text) from public, anon;
grant execute on function public.del_section_restaurar(text) to authenticated;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   -- Borrar y restaurar dentro de un bloque que termine en `raise exception`.
--   -- Tiene que volver con el mismo texto, el mismo kind y su paso en del_versions.
--
-- ROLLBACK: drop function if exists public.del_section_restaurar(text);
