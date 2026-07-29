-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente · RPCs de ADMINISTRACIÓN (para el panel de operaciones)
--
-- Dos funciones, solo para el equipo (is_team_member()):
--   · portal_admin_estado(client_id)  → ¿el cliente tiene cuenta del portal?
--     Devuelve la(s) cuenta(s) con su email de login y la contraseña generada
--     (portal_access.shared_secret), para pasársela al cliente.
--   · portal_admin_activar(client_id, email?) → crea lo que falte, idempotente:
--     - si el cliente no está en fin_directory, lo da de alta (tipo 'Cliente'),
--       y el trigger trg_portal_provision le crea la cuenta solo.
--     - si está pero sin cuenta, llama a portal_provision_account.
--     - si su persona no tiene email, usa el que le pases (o clients.email).
--
-- El vínculo cliente↔persona es el MISMO que usa el portal para loguear:
-- fin_norm(clients.name) contra fin_norm(fin_directory.nombre / aliases).
-- Aplicada a prod el 2026-07-24. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- Persona de fin_directory que corresponde a un cliente (misma lógica que
-- portal_cliente_client(), en sentido inverso).
create or replace function public._portal_person_de_cliente(p_client_id text)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select d.id
  from public.clients c
  join public.fin_directory d
    on public.fin_norm(c.name) = any (
      select k from (
        select public.fin_norm(d.nombre) as k
        union
        select public.fin_norm(a) from unnest(coalesce(d.aliases, '{}')) a
      ) s where k is not null
    )
  where c.id = p_client_id
  order by length(d.nombre) desc
  limit 1;
$$;

create or replace function public.portal_admin_estado(p_client_id text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_person uuid; v_cli record;
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;
  select id, name, email into v_cli from public.clients where id = p_client_id;
  if v_cli.id is null then return jsonb_build_object('ok', false, 'error', 'cliente no encontrado'); end if;
  v_person := public._portal_person_de_cliente(p_client_id);
  return jsonb_build_object(
    'ok', true,
    'client', jsonb_build_object('id', v_cli.id, 'name', v_cli.name, 'email', v_cli.email),
    'person', case when v_person is null then null else (
      select jsonb_build_object('id', d.id, 'nombre', d.nombre, 'email', d.email) from public.fin_directory d where d.id = v_person
    ) end,
    'cuentas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'login_email', pa.login_email,
        'password', pa.shared_secret,
        'enabled', pa.enabled,
        'tiene_auth', pa.auth_user_id is not null,
        'notes', pa.notes
      ) order by pa.created_at)
      from public.portal_access pa where pa.person_id = v_person
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.portal_admin_activar(p_client_id text, p_email text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare v_person uuid; v_cli record; v_email text;
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;
  select id, name, email into v_cli from public.clients where id = p_client_id;
  if v_cli.id is null then return jsonb_build_object('ok', false, 'error', 'cliente no encontrado'); end if;

  v_person := public._portal_person_de_cliente(p_client_id);
  v_email := lower(btrim(coalesce(nullif(p_email, ''), v_cli.email, '')));

  if v_person is null then
    -- No está en el directorio: lo damos de alta como Cliente. El trigger
    -- trg_portal_provision crea la cuenta del portal solo (si el email es válido).
    if v_email = '' or v_email not like '%_@_%.__%' then
      return jsonb_build_object('ok', false, 'error', 'falta_email',
        'detail', 'El cliente no tiene email cargado. Pasá un email para crearle el acceso.');
    end if;
    insert into public.fin_directory (nombre, email, tipo)
    values (v_cli.name, v_email, 'Cliente')
    returning id into v_person;
  else
    -- Está en el directorio: si su persona no tiene email, completarlo.
    if (select coalesce(email,'') from public.fin_directory where id = v_person) = '' then
      if v_email = '' or v_email not like '%_@_%.__%' then
        return jsonb_build_object('ok', false, 'error', 'falta_email',
          'detail', 'Su ficha del directorio no tiene email. Pasá un email para crearle el acceso.');
      end if;
      update public.fin_directory set email = v_email where id = v_person;
    end if;
    -- Y si todavía no tiene cuenta del portal, creársela.
    if not exists (select 1 from public.portal_access where person_id = v_person) then
      perform public.portal_provision_account(v_person);
    end if;
  end if;

  return public.portal_admin_estado(p_client_id);
end $$;

grant execute on function public.portal_admin_estado(text), public.portal_admin_activar(text, text) to authenticated;
