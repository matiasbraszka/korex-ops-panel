-- Portal · info de grabación por guión (responsable + estado de flujo), liviana,
-- para no reescribir portal_cliente_documento / _guiones. El portal la llama con
-- los ids que ya tiene y pinta la inicial del responsable + el estado.
create or replace function public.portal_cliente_grab_info(p_section_ids text[])
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_cid text; v_res jsonb;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return '{}'::jsonb; end if;
  select coalesce(jsonb_object_agg(ds.id, jsonb_build_object(
      'flujo', ds.grab_flujo,
      'responsable', public._del_grab_responsable(ds.grab_colab_id, v_cid)
    )), '{}'::jsonb) into v_res
  from public.del_sections ds
  where ds.client_id = v_cid and ds.id = any(p_section_ids);
  return v_res;
end $$;

revoke all    on function public.portal_cliente_grab_info(text[]) from public, anon;
grant execute on function public.portal_cliente_grab_info(text[]) to authenticated;

notify pgrst, 'reload schema';
