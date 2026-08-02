-- portal_v83_flujo_aprobacion.sql
--
-- Pedido de Matias: "tiene que haber algo que sepamos que el cliente ya la aprobo
-- al 100%. Se la dejamos para revisar, el deja comentarios / manda su primera
-- revision, damos ok a todos los comentarios y la volvemos a habilitar para que
-- la revise, y cuando da el OK se aprueba".
--
-- [portal_v77] ya habia agregado el estado 'aprobado', pero el circuito no
-- cerraba. Tres agujeros, verificados contra produccion:
--
--   1. del_section_set_meta BORRABA el estado. Para todo lo que no fuera
--      vsl/anuncios hacia `v_flujo := null`, asi que cualquier cambio de meta
--      (cambiar la accion, marcar terminado, reordenar) pisaba el 'aprobado' que
--      habia dejado el cliente. El estado no sobrevivia al primer clic.
--
--   2. NADA devolvia la pestaña al cliente despues de una correccion. El equipo
--      resolvia los comentarios a mano (update directo a del_comments desde el
--      panel) y ahi terminaba: la seccion quedaba en 'correccion' para siempre.
--
--   3. portal_guion_status.revisado quedaba en true. Aunque se rehabilitara, el
--      cliente ya no la veia: todas las listas del portal filtran por
--      `not revisado`. El reset existia, pero solo se disparaba para vsl/anuncios.
--
-- Resultado medido antes de esto: 0 secciones de pagina con grab_flujo. Ninguna
-- llego nunca a 'aprobado' — no porque nadie aprobara, sino porque el estado no
-- tenia como sobrevivir.
--
-- LA MAQUINA DE ESTADOS, ahora igual para paginas y para guiones:
--
--   (sin estado)  el equipo todavia la esta escribiendo
--        |  el equipo la marca Terminado + Para revisar
--        v
--    revision     esta en la cancha del CLIENTE
--        |  el cliente aprueba con comentarios
--        v
--   correccion    esta en la cancha de KOREX
--        |  el equipo da OK al ultimo comentario  (o la rehabilita a mano)
--        v
--    revision     vuelve al cliente, y se le limpia el "ya lo revise"
--        |  el cliente aprueba sin comentarios
--        v
--    aprobado     (paginas)      grabacion -> grabado  (vsl y anuncios)
--
-- Un estado cerrado ('aprobado' / 'grabado') o con la pelota en Korex
-- ('correccion') NO se pisa por editar la meta. Se sale de ahi a proposito.

-- ── 1) Rehabilitar: "damos ok a los comentarios y vuelve al cliente" ─────────
create or replace function public.del_seccion_rehabilitar(p_section_id text, p_by text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_cid text; v_title text; v_n int;
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;
  select client_id, title into v_cid, v_title from public.del_sections where id = p_section_id;
  if v_cid is null then
    return jsonb_build_object('ok', false, 'error', 'seccion inexistente');
  end if;

  -- Damos por buenos los comentarios que el cliente dejo abiertos.
  update public.del_comments set resolved = true
   where section_id = p_section_id
     and portal_client_id is not null
     and not coalesce(resolved, false);
  get diagnostics v_n = row_count;

  -- Vuelve a estar visible y accionable para el cliente.
  update public.del_sections
     set estado_seccion = 'terminado',
         accion_cliente = 'revisar',
         updated_at = now(),
         updated_by = coalesce(p_by, 'Korex')
   where id = p_section_id;

  -- Sin esto el cliente no la vuelve a ver: todas las listas filtran por
  -- `not revisado`.
  update public.portal_guion_status
     set revisado = false, revisado_at = null, updated_at = now()
   where section_id = p_section_id;

  perform public._del_grab_set(p_section_id, 'revision', 'korex', coalesce(p_by, 'Korex'));

  insert into public.portal_eventos (client_id, tipo, payload)
  values (v_cid, 'guion_rehabilitado',
          jsonb_build_object('section_id', p_section_id, 'titulo', v_title, 'comentarios_ok', v_n));

  return jsonb_build_object('ok', true, 'comentariosResueltos', v_n);
end $function$;

revoke all on function public.del_seccion_rehabilitar(text, text) from public, anon;
grant execute on function public.del_seccion_rehabilitar(text, text) to authenticated, service_role;

-- ── 2) Resolver un comentario, y cerrar el circuito con el ultimo ───────────
-- El panel hacia `update del_comments set resolved` directo contra la tabla, asi
-- que no habia donde colgar "y si ya no queda ninguno, devolvesela al cliente".
create or replace function public.del_comment_resolver(p_comment_id text, p_resolved boolean, p_by text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_sec text; v_pend int; v_flujo text; v_reab boolean := false;
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;

  update public.del_comments set resolved = coalesce(p_resolved, false)
   where id = p_comment_id
   returning section_id into v_sec;
  if v_sec is null then
    return jsonb_build_object('ok', false, 'error', 'comentario inexistente');
  end if;

  select grab_flujo into v_flujo from public.del_sections where id = v_sec;

  select count(*) into v_pend from public.del_comments
   where section_id = v_sec
     and portal_client_id is not null
     and not coalesce(resolved, false);

  -- Cerrado el ultimo comentario del cliente, la pestaña vuelve a el.
  if coalesce(p_resolved, false) and v_pend = 0 and v_flujo = 'correccion' then
    perform public.del_seccion_rehabilitar(v_sec, p_by);
    v_reab := true;
  end if;

  return jsonb_build_object('ok', true, 'sectionId', v_sec,
                            'pendientes', v_pend, 'rehabilitada', v_reab);
end $function$;

revoke all on function public.del_comment_resolver(text, boolean, text) from public, anon;
grant execute on function public.del_comment_resolver(text, boolean, text) to authenticated, service_role;

-- ── 3) del_section_set_meta: derivar el estado sin pisar lo ya cerrado ──────
create or replace function public.del_section_set_meta(p_id text, p_accion text default null::text, p_estado text default null::text, p_para_grabar boolean default null::boolean, p_orden integer default null::integer, p_by text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_existe boolean; v_accion text; v_estado text; v_kind text; v_flujo text; v_prev text;
begin
  if not public.is_team_member() then raise exception 'no autorizado'; end if;
  if p_accion is not null and p_accion not in ('grabarse','revisar','solo_ver','solo_equipo') then
    raise exception 'accion_cliente invalida: %', p_accion; end if;
  if p_estado is not null and p_estado not in ('en_construccion','terminado') then
    raise exception 'estado_seccion invalido: %', p_estado; end if;

  select true into v_existe from public.del_sections where id = p_id;
  if v_existe is null then raise exception 'seccion inexistente: %', p_id; end if;

  update public.del_sections
     set accion_cliente  = coalesce(p_accion, accion_cliente),
         estado_seccion  = coalesce(p_estado, estado_seccion),
         para_grabar     = coalesce(p_para_grabar, para_grabar),
         orden_grabacion = coalesce(p_orden, orden_grabacion, ord),
         updated_at      = now(),
         updated_by      = coalesce(p_by, updated_by)
   where id = p_id;

  select accion_cliente, estado_seccion, kind, grab_flujo
    into v_accion, v_estado, v_kind, v_prev from public.del_sections where id = p_id;

  if coalesce(v_estado,'') <> 'terminado' or coalesce(v_accion,'') = 'solo_equipo' then
    -- Vuelve a construccion o se esconde del cliente: ya no esta en su cancha.
    v_flujo := null;
  elsif v_prev in ('aprobado','grabado','correccion') then
    -- Cerrado por el cliente, aprobado por el equipo, o con la pelota en Korex.
    -- Editar la meta NO lo mueve: para eso esta del_seccion_rehabilitar.
    return;
  elsif coalesce(v_accion,'') = 'revisar' then
    v_flujo := 'revision';
  elsif coalesce(v_accion,'') = 'grabarse' and v_kind in ('vsl','anuncios') then
    v_flujo := 'grabacion';
  else
    v_flujo := null;
  end if;

  -- Al (re)habilitar para revision el cliente tiene que volver a leerla.
  if v_flujo = 'revision' and coalesce(v_prev,'') <> 'revision' then
    update public.portal_guion_status set revisado = false, revisado_at = null, updated_at = now()
     where section_id = p_id;
  end if;

  perform public._del_grab_set(p_id, v_flujo, 'korex', coalesce(p_by, 'Korex'));
end $function$;

-- ── 4) Backfill ────────────────────────────────────────────────────────────
-- Lo que ya esta habilitado al cliente y no tiene estado, pasa a 'revision':
-- asi el equipo ve "esperando al cliente" en vez de una pestaña muda.
-- Solo toca filas con grab_flujo null — no pisa ningun estado existente.
do $mig$
declare r record; n int := 0;
begin
  for r in
    select id from public.del_sections
     where grab_flujo is null
       and coalesce(estado_seccion,'') = 'terminado'
       and coalesce(accion_cliente,'') = 'revisar'
  loop
    perform public._del_grab_set(r.id, 'revision', 'korex', 'Korex');
    n := n + 1;
  end loop;
  raise notice 'Backfill: % secciones pasaron a revision', n;
end $mig$;

-- Verificacion:
--   select kind, coalesce(grab_flujo,'(sin estado)'), count(*)
--     from public.del_sections group by 1,2 order by 1,2;
