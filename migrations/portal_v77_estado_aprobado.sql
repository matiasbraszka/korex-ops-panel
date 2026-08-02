-- portal_v77_estado_aprobado.sql
--
-- Pedido: "Estado de las landings en el DEL que diga 'aprobado' en vez de 'Grabacion'".
--
-- Causa: del_sections.grab_flujo es UNA sola maquina de estados para todo tipo de
-- seccion, y el vocabulario es de grabacion (revision -> correccion -> grabacion ->
-- grabado). Una landing no se graba nunca: se aprueba y pasa a diseno.
--
-- Los kinds grabables estaban hardcodeados como ('vsl','anuncios') en media docena de
-- lugares, y dos puertas NO lo chequeaban:
--   1. portal_cliente_toggle_revisado: al aprobar una landing no seteaba nada (el
--      cliente aprobaba y en el panel no se veia), y al comentar la mandaba a
--      'correccion' -- ese si estaba bien.
--   2. del_grab_marcar_grabado: aceptaba cualquier seccion, asi que una landing se
--      podia marcar "grabada".
--
-- Ahora: las secciones NO grabables aprobadas quedan en 'aprobado', un estado nuevo
-- que el panel pinta como "✅ Aprobado". Las grabables no cambian en nada.
--
-- Estado de la base al escribir esto: 19 secciones con grab_flujo, todas vsl/anuncios.
-- O sea que la contaminacion todavia no paso; esto la evita y ademas hace visible la
-- aprobacion de las landings, que hoy no se ve en ningun lado.

-- 1) Aprobar una seccion NO grabable la deja en 'aprobado' (antes: en nada).
create or replace function public.portal_cliente_toggle_revisado(p_section_id text, p_revisado boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cid text; v_sec record; v_emb text; v_email text;
  v_actor_tipo text; v_actor_nombre text; v_comentarios int; v_grabable boolean;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok', false); end if;
  select title, strategy_id, kind into v_sec
    from public.del_sections where id = p_section_id and client_id = v_cid;
  if v_sec.title is null then return jsonb_build_object('ok', false); end if;

  v_grabable := v_sec.kind in ('vsl','anuncios');

  insert into public.portal_guion_status(client_id, section_id, revisado, revisado_at, updated_at)
  values (v_cid, p_section_id, coalesce(p_revisado, false),
          case when p_revisado then now() end, now())
  on conflict (client_id, section_id) do update
    set revisado = excluded.revisado, revisado_at = excluded.revisado_at, updated_at = now();

  if not coalesce(p_revisado, false) then
    return jsonb_build_object('ok', true, 'revisado', false);
  end if;

  -- ¿Quién actuó? (cliente o cuál colaborador — por el email del JWT)
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  select full_name into v_actor_nombre from public.portal_collaborators
   where lower(email) = v_email and enabled order by created_at desc limit 1;
  if v_actor_nombre is not null then v_actor_tipo := 'colaborador';
  else v_actor_tipo := 'cliente'; select name into v_actor_nombre from public.clients where id = v_cid; end if;

  v_emb := public._portal_embudo_nombre(v_sec.strategy_id);

  -- ¿Dejó comentarios sin resolver en este guión?
  select count(*) into v_comentarios from public.del_comments
   where section_id = p_section_id and portal_client_id is not null and not coalesce(resolved, false);

  if v_comentarios > 0 then
    -- Pidió cambios → vuelve a Korex. Vale igual para guiones y para páginas.
    perform public._del_grab_set(p_section_id, 'correccion', v_actor_tipo, v_actor_nombre);
    perform public._portal_slack(v_cid,
      public._portal_aviso_cab(v_cid) || ' · ✏️ pidió cambios en *' || v_sec.title || '*'
      || coalesce(' · embudo ' || v_emb, '') || ' — para corregir');
    insert into public.portal_eventos (client_id, tipo, payload)
    values (v_cid, 'guion_revisado', jsonb_build_object('section_id', p_section_id,
            'titulo', v_sec.title, 'embudo', v_emb, 'resultado', 'correccion'));
    return jsonb_build_object('ok', true, 'revisado', true, 'resultado', 'correccion');
  else
    if v_grabable then
      -- Guión aprobado: pasa directo a grabación.
      update public.del_sections set accion_cliente = 'grabarse', para_grabar = true,
             updated_at = now(), updated_by = 'aprobado-cliente' where id = p_section_id;
      perform public._del_grab_set(p_section_id, 'grabacion', v_actor_tipo, v_actor_nombre);
    else
      -- Landing / formulario / thank you: aprobado, NO se graba.
      perform public._del_grab_set(p_section_id, 'aprobado', v_actor_tipo, v_actor_nombre);
    end if;
    perform public._portal_slack(v_cid,
      public._portal_aviso_cab(v_cid) || ' · ✅ aprobó *' || v_sec.title || '*'
      || coalesce(' · embudo ' || v_emb, '')
      || case when v_grabable then ' — pasa a grabación' else '' end);
    insert into public.portal_eventos (client_id, tipo, payload)
    values (v_cid, 'guion_revisado', jsonb_build_object('section_id', p_section_id,
            'titulo', v_sec.title, 'embudo', v_emb, 'resultado', 'aprobado'));
    return jsonb_build_object('ok', true, 'revisado', true, 'resultado', 'aprobado');
  end if;
end $function$;

-- 2) "Marcar grabado" solo tiene sentido en lo que se graba.
create or replace function public.del_grab_marcar_grabado(p_section_id text, p_grabado boolean, p_by text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_cid text; v_kind text;
begin
  if not public.is_team_member() then return jsonb_build_object('ok', false, 'error', 'no autorizado'); end if;
  select client_id, kind into v_cid, v_kind from public.del_sections where id = p_section_id;
  if v_cid is null then return jsonb_build_object('ok', false, 'error', 'seccion inexistente'); end if;
  if v_kind not in ('vsl','anuncios') then
    return jsonb_build_object('ok', false, 'error', 'esta seccion no se graba');
  end if;

  insert into public.portal_guion_status(client_id, section_id, grabado, grabado_at, updated_at)
  values (v_cid, p_section_id, coalesce(p_grabado, false), case when p_grabado then now() end, now())
  on conflict (client_id, section_id) do update
    set grabado = excluded.grabado, grabado_at = excluded.grabado_at, updated_at = now();

  perform public._del_grab_set(p_section_id, case when p_grabado then 'grabado' else 'grabacion' end,
                               'korex', coalesce(p_by, 'Korex'));
  return jsonb_build_object('ok', true, 'grabado', coalesce(p_grabado, false));
end $function$;

-- 3) Backfill defensivo: si alguna seccion no grabable quedo con vocabulario de
-- grabacion, pasa a 'aprobado'. Al escribir esto no habia ninguna (0 filas).
update public.del_sections
   set grab_flujo = 'aprobado', grab_flujo_at = coalesce(grab_flujo_at, now())
 where kind not in ('vsl','anuncios')
   and grab_flujo in ('grabacion','grabado');

-- Verificacion:
--   select kind, grab_flujo, count(*) from public.del_sections
--    where grab_flujo is not null group by 1,2 order by 1,2;
--   -- 'grabacion' y 'grabado' solo deben aparecer con kind vsl/anuncios.
