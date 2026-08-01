-- Portal · estado GRABADO aprobado por el equipo.
--
-- Antes "grabado/entregado" se DERIVABA de que hubiera algún archivo en la carpeta
-- del embudo (impreciso: 1 video marcaba todos los guiones del embudo como listos).
-- Ahora el equipo APRUEBA cada guión desde el resumen de Grabaciones del panel,
-- tras verificar que está completo. Nuevo paso de flujo: grabacion → grabado.
--
-- La aprobación marca portal_guion_status.grabado = true (lo que el cliente ve como
-- "grabado", su fuente de verdad) y mueve grab_flujo a 'grabado' (para el tracking).
create or replace function public.del_grab_marcar_grabado(p_section_id text, p_grabado boolean, p_by text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare v_cid text;
begin
  if not public.is_team_member() then return jsonb_build_object('ok', false, 'error', 'no autorizado'); end if;
  select client_id into v_cid from public.del_sections where id = p_section_id;
  if v_cid is null then return jsonb_build_object('ok', false, 'error', 'seccion inexistente'); end if;

  insert into public.portal_guion_status(client_id, section_id, grabado, grabado_at, updated_at)
  values (v_cid, p_section_id, coalesce(p_grabado, false), case when p_grabado then now() end, now())
  on conflict (client_id, section_id) do update
    set grabado = excluded.grabado, grabado_at = excluded.grabado_at, updated_at = now();

  perform public._del_grab_set(p_section_id, case when p_grabado then 'grabado' else 'grabacion' end,
                               'korex', coalesce(p_by, 'Korex'));
  return jsonb_build_object('ok', true, 'grabado', coalesce(p_grabado, false));
end $$;

grant execute on function public.del_grab_marcar_grabado(text, boolean, text) to authenticated, service_role;

notify pgrst, 'reload schema';
