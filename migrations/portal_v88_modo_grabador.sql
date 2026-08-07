-- migrations/portal_v88_modo_grabador.sql
--
-- MODO GRABADOR: el encargado de videos entra y ve SOLO los guiones que tiene que
-- grabar. Nada más: ni los del resto del equipo, ni copys de landing, ni avatares.
-- Pedido de Matías: "así la plataforma está limpia con lo que realmente tiene que grabar".
--
-- ── Primero, un bug que hacía todo esto imposible ────────────────────────────
-- `del_section_asignar_grabador` comparaba `portal_collaborators.id` (uuid) contra un
-- parámetro text: «operator does not exist: uuid = text». O sea que asignarle un guion
-- a alguien SIEMPRE fallaba. Por eso hay 0 guiones con responsable en toda la base
-- aunque la función existe desde hace semanas. Es el mismo bug que rompía el envío del
-- cuestionario del encargado (portal_v86); esta era la otra punta.
--
-- ── Cómo se filtra ───────────────────────────────────────────────────────────
-- Igual que con los embudos (portal_v87): una sola sustitución, siempre la misma, en
-- todas las funciones del portal:
--     public.del_sections   →   public._portal_ds_visibles()
-- Mismas columnas, filas filtradas para quien esté mirando. Los alias y joins de cada
-- consulta quedan intactos, y para el cliente devuelve todo (nada cambia).

begin;

-- ── 1 · El bug de la asignación ──────────────────────────────────────────────
create or replace function public.del_section_asignar_grabador(
  p_id text, p_colab_id text, p_by text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_cid text; v_ok boolean;
begin
  if not public.is_team_member() then return jsonb_build_object('ok', false, 'error', 'no autorizado'); end if;
  select client_id into v_cid from public.del_sections where id = p_id;
  if v_cid is null then return jsonb_build_object('ok', false, 'error', 'seccion inexistente'); end if;
  if p_colab_id is not null then
    -- id es uuid y el parámetro text: sin el cast esto reventaba SIEMPRE.
    select true into v_ok from public.portal_collaborators
     where id::text = p_colab_id and client_id = v_cid and enabled and role ilike 'Encargado de grabar%';
    if v_ok is null then return jsonb_build_object('ok', false, 'error', 'colaborador invalido'); end if;
  end if;
  update public.del_sections set grab_colab_id = p_colab_id, updated_at = now(),
         updated_by = coalesce(p_by, updated_by) where id = p_id;
  return jsonb_build_object('ok', true, 'responsable', public._del_grab_responsable(p_colab_id, v_cid));
end $$;

-- ── 2 · El interruptor, por persona ──────────────────────────────────────────
alter table public.portal_collaborators
  add column if not exists solo_sus_guiones boolean not null default false;

comment on column public.portal_collaborators.solo_sus_guiones is
  'Modo grabador: en el portal ve únicamente los guiones que tiene asignados para grabar.';

-- ── 3 · Quién está en modo grabador ──────────────────────────────────────────
-- Devuelve su id (como texto, que es lo que guarda del_sections.grab_colab_id) o null
-- si no aplica: el cliente, el equipo, o un colaborador sin el modo activado.
create or replace function public._portal_colab_grabador()
returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.id::text
    from public.portal_collaborators c
   where lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     and c.enabled and c.solo_sus_guiones
   order by c.created_at desc
   limit 1
$$;

-- Las secciones que la sesión actual puede ver. En modo grabador, SOLO las que
-- están marcadas para grabar y le fueron asignadas a esa persona.
create or replace function public._portal_ds_visibles()
returns setof public.del_sections
language sql stable security definer set search_path = public, pg_temp
as $$
  with g as (select public._portal_colab_grabador() as yo)
  select ds.* from public.del_sections ds, g
   where g.yo is null
      or (ds.para_grabar and ds.grab_colab_id = g.yo)
$$;

grant execute on function public._portal_colab_grabador() to anon, authenticated, service_role;
grant execute on function public._portal_ds_visibles()   to anon, authenticated, service_role;

-- ── 4 · Aplicarlo a las funciones del portal ─────────────────────────────────
do $$
declare
  r record; v_def text; v_nuevo text; v_n int := 0;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'portal_cliente%'
       and p.prosrc ilike '%public.del_sections%'
  loop
    v_def := pg_get_functiondef(r.oid);

    -- Una función que ESCRIBA en del_sections no puede apuntar a la vista filtrada.
    if v_def ~* '(insert\s+into|update|delete\s+from)\s+public\.del_sections' then
      raise warning 'salteada (escribe en del_sections): %', r.proname;
      continue;
    end if;

    v_nuevo := replace(v_def, 'public.del_sections', 'public._portal_ds_visibles()');
    if v_nuevo = v_def then continue; end if;
    execute v_nuevo;
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'No se pudo aplicar el filtro a ninguna función — revisar antes de seguir';
  end if;
  raise notice 'funciones del portal en modo grabador: %', v_n;
end
$$;

-- ── 5 · Gestión desde Operaciones ────────────────────────────────────────────
-- La lista suma el interruptor y CUÁNTOS guiones tiene asignados: encender el modo
-- sin guiones asignados le deja la pantalla vacía, y eso hay que verlo antes.
create or replace function public.portal_collab_list(p_client_id text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;
  return jsonb_build_object('ok', true, 'colaboradores', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'full_name', c.full_name, 'phone', c.phone,
      'email', c.email, 'role', c.role, 'enabled', c.enabled,
      'created_at', c.created_at,
      'funnel_ids', coalesce(to_jsonb(c.funnel_ids), 'null'::jsonb),
      'solo_sus_guiones', c.solo_sus_guiones,
      'guiones_asignados', (select count(*) from public.del_sections ds
                             where ds.grab_colab_id = c.id::text and ds.para_grabar)
    ) order by c.created_at)
    from public.portal_collaborators c where c.client_id = p_client_id
  ), '[]'::jsonb));
end $$;

create or replace function public.portal_collab_set_solo_guiones(p_id uuid, p_valor boolean)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_n int;
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;
  update public.portal_collaborators set solo_sus_guiones = coalesce(p_valor, false) where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'colaborador no encontrado'); end if;
  select count(*) into v_n from public.del_sections ds
   where ds.grab_colab_id = p_id::text and ds.para_grabar;
  return jsonb_build_object('ok', true, 'solo_sus_guiones', coalesce(p_valor, false), 'guiones_asignados', v_n);
end $$;

revoke all   on function public.portal_collab_set_solo_guiones(uuid, boolean) from public, anon;
grant execute on function public.portal_collab_set_solo_guiones(uuid, boolean) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and proname like 'portal_cliente%'
--      and prosrc ilike '%public.del_sections%';     -- solo las que escriben
--
-- ROLLBACK: reemplazar al revés y dropear las funciones nuevas.
