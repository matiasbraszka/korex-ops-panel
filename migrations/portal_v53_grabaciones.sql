-- ═════════════════════════════════════════════════════════════════════════════
-- Portal · GRABACIONES: responsable por guión + máquina de estados + tracking
--
-- Cada guión (sección del DEL de kind vsl/anuncios que el cliente graba/revisa)
-- tiene un RESPONSABLE (el cliente o un colaborador "Encargado de grabarse") y
-- un ESTADO DE FLUJO con tracking de tiempos:
--
--   revision   → el responsable tiene que revisar/aprobar   (pelota del cliente)
--   correccion → dejó comentarios, vuelve a Korex a corregir (pelota de Korex)
--   grabacion  → aprobado, esperando que grabe               (pelota del cliente)
--   (grabado/entregado se sigue derivando de funnel_resources, como hoy)
--
-- Transiciones:
--   Korex marca terminado+revisar  → revision
--   Korex marca terminado+grabarse → grabacion
--   Cliente "revisado" SIN comentarios → aprobado → grabacion
--   Cliente "revisado" CON comentarios → correccion (Korex)
--   Korex re-habilita (set_meta)     → revision (resetea 'revisado') o grabacion
--
-- Esta migración es el BACKBONE (Etapa 1). El portal y el panel (UI) vienen
-- después y leen estas columnas/RPCs.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1) Columnas de grabación en del_sections ────────────────────────────────
alter table public.del_sections
  add column if not exists grab_colab_id  text,        -- responsable: null = el cliente; si no, portal_collaborators.id
  add column if not exists grab_flujo      text,        -- null | revision | correccion | grabacion
  add column if not exists grab_flujo_at   timestamptz; -- desde cuándo está en ese estado (para "hace cuánto")

-- ── 2) Historial de transiciones (tracking de tiempos, append-only) ─────────
create table if not exists public.del_grab_historial (
  id           bigint generated always as identity primary key,
  section_id   text not null,
  client_id    text,
  estado       text not null,        -- flujo al que entró
  actor_tipo   text,                 -- 'korex' | 'cliente' | 'colaborador'
  actor_nombre text,
  at           timestamptz not null default now()
);
create index if not exists del_grab_historial_sec_idx on public.del_grab_historial (section_id, at);
create index if not exists del_grab_historial_cli_idx on public.del_grab_historial (client_id, at);

alter table public.del_grab_historial enable row level security;
drop policy if exists del_grab_hist_team on public.del_grab_historial;
create policy del_grab_hist_team on public.del_grab_historial
  for select to authenticated using (public.is_team_member());
-- Las escrituras van solo por RPCs security definer (o service_role).

-- ── 3) Helper: setea el flujo y loguea la transición (solo si cambió) ───────
create or replace function public._del_grab_set(p_section text, p_flujo text, p_actor_tipo text, p_actor_nombre text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_cur text; v_cid text;
begin
  select grab_flujo, client_id into v_cur, v_cid from public.del_sections where id = p_section;
  if v_cur is distinct from p_flujo then
    update public.del_sections set grab_flujo = p_flujo, grab_flujo_at = now() where id = p_section;
    if p_flujo is not null then
      insert into public.del_grab_historial(section_id, client_id, estado, actor_tipo, actor_nombre)
      values (p_section, v_cid, p_flujo, p_actor_tipo, p_actor_nombre);
    end if;
  end if;
end $$;

-- ── 4) Datos del responsable de un guión (nombre, iniciales, color) ─────────
create or replace function public._del_grab_responsable(p_colab_id text, p_client_id text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_nombre text; v_tipo text; v_ini text; v_color text;
  v_palette text[] := array['#5B7CF5','#22C55E','#F59E0B','#EC4899','#8B5CF6','#06B6D4','#EF4444','#14B8A6'];
begin
  if p_colab_id is null then
    select name into v_nombre from public.clients where id = p_client_id;
    v_tipo := 'cliente';
  else
    select full_name into v_nombre from public.portal_collaborators where id = p_colab_id;
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

-- ── 5) Asignar responsable a un guión (desde Operaciones) ───────────────────
create or replace function public.del_section_asignar_grabador(p_id text, p_colab_id text, p_by text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_cid text; v_ok boolean;
begin
  if not public.is_team_member() then return jsonb_build_object('ok', false, 'error', 'no autorizado'); end if;
  select client_id into v_cid from public.del_sections where id = p_id;
  if v_cid is null then return jsonb_build_object('ok', false, 'error', 'seccion inexistente'); end if;
  if p_colab_id is not null then
    select true into v_ok from public.portal_collaborators
     where id = p_colab_id and client_id = v_cid and enabled and role ilike 'Encargado de grabar%';
    if v_ok is null then return jsonb_build_object('ok', false, 'error', 'colaborador invalido'); end if;
  end if;
  update public.del_sections set grab_colab_id = p_colab_id, updated_at = now(),
         updated_by = coalesce(p_by, updated_by) where id = p_id;
  return jsonb_build_object('ok', true, 'responsable', public._del_grab_responsable(p_colab_id, v_cid));
end $$;

-- ── 6) set_meta: además de accion/estado, mueve el flujo de grabación ───────
-- (Reemplaza del_v9_section_set_meta preservando su lógica y agregando el flujo.)
create or replace function public.del_section_set_meta(
  p_id text, p_accion text default null, p_estado text default null,
  p_para_grabar boolean default null, p_orden integer default null, p_by text default null)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
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

  -- Derivar el flujo de grabación desde el estado resultante (solo guiones grabables).
  select accion_cliente, estado_seccion, kind, grab_flujo
    into v_accion, v_estado, v_kind, v_prev from public.del_sections where id = p_id;
  if v_kind in ('vsl','anuncios') and coalesce(v_estado,'') = 'terminado' then
    if coalesce(v_accion,'') = 'revisar' then v_flujo := 'revision';
    elsif coalesce(v_accion,'') = 'grabarse' then v_flujo := 'grabacion';
    else v_flujo := null; end if;
  else
    v_flujo := null;
  end if;

  -- Al re-habilitar para revisión (típico tras una corrección), el cliente tiene
  -- que volver a revisarlo: reseteamos su marca "revisado".
  if v_flujo = 'revision' and coalesce(v_prev,'') <> 'revision' then
    update public.portal_guion_status set revisado = false, revisado_at = null, updated_at = now()
     where section_id = p_id;
  end if;

  perform public._del_grab_set(p_id, v_flujo, 'korex', coalesce(p_by, 'Korex'));
end $$;

revoke execute on function public.del_section_set_meta(text, text, text, boolean, integer, text) from public, anon;
grant  execute on function public.del_section_set_meta(text, text, text, boolean, integer, text) to authenticated, service_role;

-- ── 7) toggle_revisado: revisado sin comentarios = aprobado→grabación; ──────
--     con comentarios = vuelve a Korex (corrección).
create or replace function public.portal_cliente_toggle_revisado(p_section_id text, p_revisado boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cid text; v_sec record; v_emb text; v_email text;
  v_actor_tipo text; v_actor_nombre text; v_comentarios int; v_para_grabar boolean;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok', false); end if;
  select title, strategy_id, kind into v_sec
    from public.del_sections where id = p_section_id and client_id = v_cid;
  if v_sec.title is null then return jsonb_build_object('ok', false); end if;

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
    -- Pidió cambios → vuelve a Korex.
    perform public._del_grab_set(p_section_id, 'correccion', v_actor_tipo, v_actor_nombre);
    perform public._portal_slack(v_cid,
      public._portal_aviso_cab(v_cid) || ' · ✏️ pidió cambios en *' || v_sec.title || '*'
      || coalesce(' · embudo ' || v_emb, '') || ' — para corregir');
    insert into public.portal_eventos (client_id, tipo, payload)
    values (v_cid, 'guion_revisado', jsonb_build_object('section_id', p_section_id,
            'titulo', v_sec.title, 'embudo', v_emb, 'resultado', 'correccion'));
    return jsonb_build_object('ok', true, 'revisado', true, 'resultado', 'correccion');
  else
    -- Aprobado. Si es grabable, pasa directo a grabación.
    if v_sec.kind in ('vsl','anuncios') then
      update public.del_sections set accion_cliente = 'grabarse', para_grabar = true,
             updated_at = now(), updated_by = 'aprobado-cliente' where id = p_section_id;
      perform public._del_grab_set(p_section_id, 'grabacion', v_actor_tipo, v_actor_nombre);
    end if;
    perform public._portal_slack(v_cid,
      public._portal_aviso_cab(v_cid) || ' · ✅ aprobó *' || v_sec.title || '*'
      || coalesce(' · embudo ' || v_emb, '')
      || case when v_sec.kind in ('vsl','anuncios') then ' — pasa a grabación' else '' end);
    insert into public.portal_eventos (client_id, tipo, payload)
    values (v_cid, 'guion_revisado', jsonb_build_object('section_id', p_section_id,
            'titulo', v_sec.title, 'embudo', v_emb, 'resultado', 'aprobado'));
    return jsonb_build_object('ok', true, 'revisado', true, 'resultado', 'aprobado');
  end if;
end $$;

revoke all    on function public.portal_cliente_toggle_revisado(text, boolean) from public, anon;
grant execute on function public.portal_cliente_toggle_revisado(text, boolean) to authenticated;

-- ── 8) Backfill del flujo para guiones ya existentes ────────────────────────
-- Los que hoy están terminado+revisar → 'revision'; terminado+grabarse (o para_grabar) → 'grabacion'.
update public.del_sections s
   set grab_flujo = case
         when coalesce(estado_seccion,'') = 'terminado' and coalesce(accion_cliente,'') = 'revisar' then 'revision'
         when kind in ('vsl','anuncios') and (para_grabar or coalesce(accion_cliente,'') = 'grabarse')
              and coalesce(estado_seccion,'terminado') = 'terminado' then 'grabacion'
         else null end,
       grab_flujo_at = coalesce(grab_flujo_at, updated_at, imported_at, now())
 where kind in ('vsl','anuncios');

-- ── 9) Resumen de grabaciones por cliente (para Operaciones) ────────────────
create or replace function public.del_grab_resumen_cliente(p_client_id text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_guiones jsonb; v_resumen jsonb; v_recursos_dias int;
begin
  if not public.is_team_member() then return jsonb_build_object('ok', false, 'error', 'no autorizado'); end if;

  -- Lista por guión (los que están en el flujo de grabación).
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ds.id, 'titulo', ds.title, 'kind', ds.kind,
      'funnel', st.name, 'flujo', ds.grab_flujo,
      'dias', greatest(0, extract(day from now() - coalesce(ds.grab_flujo_at, ds.updated_at))::int),
      'desde', ds.grab_flujo_at,
      'responsable', public._del_grab_responsable(ds.grab_colab_id, p_client_id),
      'grabado', coalesce(gs.grabado, false), 'revisado', coalesce(gs.revisado, false)
    ) order by ds.grab_flujo, coalesce(ds.grab_flujo_at, ds.updated_at)), '[]'::jsonb)
    into v_guiones
  from public.del_sections ds
  left join public.strategies st on st.id = ds.strategy_id
  left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = p_client_id
  where ds.client_id = p_client_id and ds.grab_flujo is not null;

  -- Resumen por estado: cuántos y el más viejo (días).
  select jsonb_object_agg(flujo, jsonb_build_object('n', n, 'dias', dias)) into v_resumen from (
    select grab_flujo as flujo, count(*) n,
           max(greatest(0, extract(day from now() - coalesce(grab_flujo_at, updated_at))::int)) dias
    from public.del_sections
    where client_id = p_client_id and grab_flujo is not null
    group by grab_flujo
  ) q;

  -- Recursos: hace cuánto que no suben material (última subida a funnel_resources).
  select greatest(0, extract(day from now() - max(created_at))::int) into v_recursos_dias
  from public.funnel_resources where client_id = p_client_id;

  return jsonb_build_object('ok', true, 'guiones', v_guiones,
    'resumen', coalesce(v_resumen, '{}'::jsonb), 'recursosDiasSinSubir', v_recursos_dias);
end $$;

grant execute on function public.del_section_asignar_grabador(text, text, text) to authenticated, service_role;
grant execute on function public.del_grab_resumen_cliente(text) to authenticated, service_role;
grant execute on function public._del_grab_responsable(text, text) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
