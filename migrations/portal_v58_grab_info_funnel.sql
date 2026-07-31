-- Portal · grab_info agrega el número + nombre del funnel por guión, para poder
-- agrupar los guiones por embudo en la pantalla "Tus guiones" (con la etiqueta
-- FUNNEL N · Nombre y el encargado a la vista).
create or replace function public.portal_cliente_grab_info(p_section_ids text[])
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_cid text; v_res jsonb;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return '{}'::jsonb; end if;
  select coalesce(jsonb_object_agg(ds.id, jsonb_build_object(
      'flujo', ds.grab_flujo,
      'avatar', ds.grab_avatar_id,
      'funnel', st.name,
      'funnelNum', public._portal_funnel_num(v_cid, ds.strategy_id),
      'responsable', public._del_grab_responsable(ds.grab_colab_id, v_cid)
    )), '{}'::jsonb) into v_res
  from public.del_sections ds
  left join public.strategies st on st.id = ds.strategy_id
  where ds.client_id = v_cid and ds.id = any(p_section_ids);
  return v_res;
end $$;

grant execute on function public.portal_cliente_grab_info(text[]) to authenticated;

notify pgrst, 'reload schema';
