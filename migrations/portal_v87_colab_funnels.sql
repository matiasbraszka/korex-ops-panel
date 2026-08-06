-- migrations/portal_v87_colab_funnels.sql
--
-- QUÉ FUNNELS VE CADA COLABORADOR.
--
-- Hasta ahora un colaborador del cliente veía EXACTAMENTE lo mismo que el cliente:
-- todos sus embudos, guiones, material y avance. Para un asistente está bien, pero
-- un "encargado de grabarse" que solo participa de un embudo no tiene por qué ver
-- el resto del trabajo.
--
-- Modelo: `portal_collaborators.funnel_ids`
--    null  o  {}   → ve TODOS los embudos (comportamiento de siempre; nadie pierde acceso)
--    {id1, id2}    → ve SOLO esos
--
-- ── Cómo se aplica (la parte importante) ─────────────────────────────────────
-- Las 11 funciones del portal que sirven embudos no comparten forma: distintos
-- alias (sp / s / sp2), algunas filtran por cliente y otras no. Meter un "and ..."
-- en cada una a mano era la vía segura de romper una.
--
-- En vez de eso se cambia UNA sola cosa, siempre igual, en todas:
--     from public.strategy_pages sp   →   from public._portal_sp_visibles() sp
--
-- `_portal_sp_visibles()` devuelve las mismas filas de strategy_pages, ya filtradas
-- para quien esté mirando. El alias, los joins y el resto de cada consulta quedan
-- intactos. Para el cliente (y para cualquiera que no sea un colaborador limitado)
-- devuelve todo, así que nada cambia.

begin;

-- ── 1 · Dónde se guarda ──────────────────────────────────────────────────────
alter table public.portal_collaborators
  add column if not exists funnel_ids text[];

comment on column public.portal_collaborators.funnel_ids is
  'Embudos (strategy_pages.id) que puede ver. null o vacío = todos.';

-- ── 2 · Qué embudos puede ver la sesión actual ───────────────────────────────
-- Devuelve null cuando no hay límite: el cliente, el equipo, o un colaborador sin
-- restricción. Solo devuelve una lista cuando es un colaborador acotado.
create or replace function public._portal_colab_funnels()
returns text[]
language sql stable security definer set search_path = public, pg_temp
as $$
  select nullif(c.funnel_ids, '{}')
    from public.portal_collaborators c
   where lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     and c.enabled
   order by c.created_at desc
   limit 1
$$;

-- Los embudos que la sesión actual puede ver. Reemplaza a `public.strategy_pages`
-- dentro de las funciones del portal: mismas columnas, filas filtradas.
create or replace function public._portal_sp_visibles()
returns setof public.strategy_pages
language sql stable security definer set search_path = public, pg_temp
as $$
  with lim as (select public._portal_colab_funnels() as ids)
  select sp.* from public.strategy_pages sp, lim
   where lim.ids is null or sp.id = any(lim.ids)
$$;

grant execute on function public._portal_colab_funnels() to anon, authenticated, service_role;
grant execute on function public._portal_sp_visibles()  to anon, authenticated, service_role;

-- ── 3 · Aplicarlo a las funciones del portal ─────────────────────────────────
do $$
declare
  r record;
  v_def text;
  v_nuevo text;
  v_n int := 0;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'portal_cliente%'
       and p.prosrc ilike '%public.strategy_pages%'
  loop
    v_def := pg_get_functiondef(r.oid);

    -- Ninguna de estas escribe en strategy_pages; si alguna lo hiciera, la vista
    -- filtrada no sería un destino válido y hay que dejarla afuera.
    if v_def ~* '(insert\s+into|update)\s+public\.strategy_pages' then
      raise warning 'salteada (escribe en strategy_pages): %', r.proname;
      continue;
    end if;

    v_nuevo := replace(v_def, 'public.strategy_pages', 'public._portal_sp_visibles()');
    if v_nuevo = v_def then continue; end if;

    execute v_nuevo;
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'No se pudo aplicar el filtro a ninguna función — revisar antes de seguir';
  end if;
  raise notice 'funciones del portal filtradas por embudo: %', v_n;
end
$$;

-- ── 4 · Gestión desde Operaciones ────────────────────────────────────────────
-- La lista ahora devuelve también los embudos elegidos.
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
      'funnel_ids', coalesce(to_jsonb(c.funnel_ids), 'null'::jsonb)
    ) order by c.created_at)
    from public.portal_collaborators c where c.client_id = p_client_id
  ), '[]'::jsonb));
end $$;

-- Elegir los embudos de un colaborador. Lista vacía o null = todos.
create or replace function public.portal_collab_set_funnels(p_id uuid, p_funnel_ids text[])
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_client text;
  v_ids text[];
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;

  select client_id into v_client from public.portal_collaborators where id = p_id;
  if v_client is null then
    return jsonb_build_object('ok', false, 'error', 'colaborador no encontrado');
  end if;

  -- Solo embudos DE SU CLIENTE: si no, elegir mal en la pantalla le abriría la
  -- puerta al material de otro.
  select array_agg(sp.id) into v_ids
    from public.strategy_pages sp
   where sp.client_id = v_client
     and sp.id = any(coalesce(p_funnel_ids, '{}'));

  update public.portal_collaborators
     set funnel_ids = nullif(coalesce(v_ids, '{}'), '{}')
   where id = p_id;

  return jsonb_build_object('ok', true, 'funnel_ids', coalesce(to_jsonb(v_ids), 'null'::jsonb));
end $$;

revoke all   on function public.portal_collab_set_funnels(uuid, text[]) from public, anon;
grant execute on function public.portal_collab_set_funnels(uuid, text[]) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   -- ninguna función del portal debería seguir leyendo la tabla directa:
--   select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and proname like 'portal_cliente%'
--      and prosrc ilike '%public.strategy_pages%';        -- 0 filas
--
--   -- simulando la sesión de un colaborador limitado, portal_cliente_funnels()
--   -- tiene que devolver solo los elegidos.
--
-- ROLLBACK: reemplazar al revés ('public._portal_sp_visibles()' → 'public.strategy_pages')
-- con el mismo bloque, y dropear las dos funciones nuevas.
