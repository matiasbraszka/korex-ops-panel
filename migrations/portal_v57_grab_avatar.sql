-- Portal · avatar asignado a un guión de anuncios. Si el funnel tiene más de un
-- avatar, el equipo elige a qué avatar pertenece cada guión, así el cliente NO
-- tiene que elegirlo al subir la grabación (se sube a ad_rec__<avatar> solo).
begin;

alter table public.del_sections add column if not exists grab_avatar_id text;

-- Asigna (o limpia) el avatar de un guión, desde Operaciones.
create or replace function public.del_section_set_grab_avatar(p_id text, p_avatar text, p_by text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_team_member() then return jsonb_build_object('ok', false, 'error', 'no autorizado'); end if;
  update public.del_sections set grab_avatar_id = nullif(p_avatar, ''), updated_at = now(),
         updated_by = coalesce(p_by, updated_by) where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'seccion inexistente'); end if;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.del_section_set_grab_avatar(text, text, text) to authenticated, service_role;

-- grab_info del portal: agrega el avatar asignado por guión.
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
      'responsable', public._del_grab_responsable(ds.grab_colab_id, v_cid)
    )), '{}'::jsonb) into v_res
  from public.del_sections ds
  where ds.client_id = v_cid and ds.id = any(p_section_ids);
  return v_res;
end $$;

grant execute on function public.portal_cliente_grab_info(text[]) to authenticated;

commit;

notify pgrst, 'reload schema';
