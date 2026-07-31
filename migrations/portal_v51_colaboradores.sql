-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente · COLABORADORES del cliente
--
-- Cada cliente puede sumar a su equipo (asistente, encargado de grabarse, líder,
-- otro) con un LINK auto-servicio. El colaborador abre el link, completa un mini
-- formulario (nombre, teléfono, email, rol) y elige su contraseña → entra y ve el
-- 100% de lo que ve el cliente.
--
-- Cómo comparte identidad con el cliente SIN tocar RLS ni las RPCs portal_cliente_*:
-- el colaborador recibe su propia fila `portal_access` (su email + su password),
-- pero con el MISMO `person_id` que la cuenta del cliente. Como portal_cliente_client()
-- resuelve por person_id → client_id, el colaborador cae en el mismo cliente y ve
-- todo igual. (person_id no es único en portal_access: solo login_email lo es.)
--
-- El alta real (crear auth.users + portal_access) la hace la edge function pública
-- `colaborador-registro` con service role. Acá van: las tablas, y las RPCs del
-- EQUIPO (is_team_member) para dar el link, rotarlo, listar y quitar accesos.
-- ═════════════════════════════════════════════════════════════════════════════

-- 1) Un token compartible por cliente (el "link de colaboradores").
create table if not exists public.portal_collab_invites (
  client_id  text primary key,
  token      text unique not null,
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text
);

-- 2) Los colaboradores que se registraron (para que Operaciones los vea y controle).
create table if not exists public.portal_collaborators (
  id           uuid primary key default gen_random_uuid(),
  client_id    text not null,
  person_id    uuid,
  full_name    text,
  phone        text,
  email        text,
  role         text,
  auth_user_id uuid,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists portal_collaborators_client_idx on public.portal_collaborators (client_id);
create index if not exists portal_collaborators_email_idx on public.portal_collaborators (lower(email));

-- Cierre a anónimo: nadie lee estas tablas directo. El portal (colaborador) pasa
-- por la edge function con service role; el equipo, por las RPCs security definer.
alter table public.portal_collab_invites  enable row level security;
alter table public.portal_collaborators   enable row level security;
drop policy if exists collab_invites_team on public.portal_collab_invites;
drop policy if exists collaborators_team  on public.portal_collaborators;
create policy collab_invites_team on public.portal_collab_invites
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy collaborators_team on public.portal_collaborators
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());

-- Token opaco sin depender de pgcrypto: dos uuid sin guiones (256 bits de espacio).
create or replace function public._collab_gen_token()
returns text language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

-- ── RPCs del EQUIPO (panel de operaciones) ──────────────────────────────────

-- Devuelve (creando si falta) el token del cliente. Idempotente.
create or replace function public.portal_collab_link(p_client_id text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare v_row public.portal_collab_invites;
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;
  select * into v_row from public.portal_collab_invites where client_id = p_client_id;
  if v_row.client_id is null then
    insert into public.portal_collab_invites (client_id, token, created_by)
    values (p_client_id, public._collab_gen_token(), coalesce(auth.jwt() ->> 'email', 'panel'))
    returning * into v_row;
  end if;
  return jsonb_build_object('ok', true, 'token', v_row.token, 'enabled', v_row.enabled);
end $$;

-- Rota el token (invalida el link viejo). Útil si se filtró.
create or replace function public.portal_collab_rotate(p_client_id text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare v_token text;
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;
  v_token := public._collab_gen_token();
  insert into public.portal_collab_invites (client_id, token, created_by)
  values (p_client_id, v_token, coalesce(auth.jwt() ->> 'email', 'panel'))
  on conflict (client_id) do update set token = excluded.token, enabled = true;
  return jsonb_build_object('ok', true, 'token', v_token, 'enabled', true);
end $$;

-- Lista los colaboradores del cliente.
create or replace function public.portal_collab_list(p_client_id text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;
  return jsonb_build_object('ok', true, 'colaboradores', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'full_name', c.full_name, 'phone', c.phone,
      'email', c.email, 'role', c.role, 'enabled', c.enabled,
      'created_at', c.created_at
    ) order by c.created_at)
    from public.portal_collaborators c where c.client_id = p_client_id
  ), '[]'::jsonb));
end $$;

-- Habilita / quita el acceso de un colaborador (toca su portal_access también).
create or replace function public.portal_collab_set_enabled(p_id uuid, p_enabled boolean)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare v_email text;
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;
  update public.portal_collaborators set enabled = p_enabled where id = p_id returning email into v_email;
  if v_email is null then return jsonb_build_object('ok', false, 'error', 'colaborador no encontrado'); end if;
  update public.portal_access set enabled = p_enabled where lower(login_email) = lower(v_email);
  return jsonb_build_object('ok', true, 'enabled', p_enabled);
end $$;

grant execute on function
  public.portal_collab_link(text),
  public.portal_collab_rotate(text),
  public.portal_collab_list(text),
  public.portal_collab_set_enabled(uuid, boolean)
to authenticated;
