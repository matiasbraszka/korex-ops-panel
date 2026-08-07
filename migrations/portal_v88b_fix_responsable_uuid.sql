-- migrations/portal_v88b_fix_responsable_uuid.sql
--
-- Última punta del mismo bug uuid/text: `_del_grab_responsable` busca al colaborador
-- con `where id = p_colab_id` (id uuid, parámetro text) y revienta con
-- «operator does not exist: uuid = text».
--
-- La llama `del_section_asignar_grabador` al devolver el resultado, así que asignarle
-- un guion a alguien seguía fallando aun después de arreglar la validación (v88).
-- Es la misma familia de errores que rompía el cuestionario del encargado (v86).

create or replace function public._del_grab_responsable(p_colab_id text, p_client_id text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_nombre text; v_tipo text; v_ini text; v_color text;
  v_palette text[] := array['#5B7CF5','#22C55E','#F59E0B','#EC4899','#8B5CF6','#06B6D4','#EF4444','#14B8A6'];
begin
  if p_colab_id is null then
    select name into v_nombre from public.clients where id = p_client_id;
    v_tipo := 'cliente';
  else
    -- id es uuid y el parámetro text: sin el cast esto reventaba siempre.
    select full_name into v_nombre from public.portal_collaborators where id::text = p_colab_id;
    v_tipo := 'colaborador';
  end if;
  v_nombre := coalesce(nullif(btrim(v_nombre), ''), 'Sin asignar');
  -- Iniciales: primeras letras de las dos primeras palabras.
  v_ini := upper(left(split_part(v_nombre, ' ', 1), 1) ||
                 coalesce(left(nullif(split_part(v_nombre, ' ', 2), ''), 1), ''));
  v_color := v_palette[1 + (abs(hashtext(v_nombre)) % array_length(v_palette, 1))];
  return jsonb_build_object('nombre', v_nombre, 'tipo', v_tipo, 'iniciales', v_ini, 'color', v_color,
                            'colabId', p_colab_id);
end $$;

notify pgrst, 'reload schema';
