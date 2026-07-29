-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente · DDL BASE (SNAPSHOT de producción, 2026-07-24)
--
-- Estas piezas se aplicaron a prod directo por MCP sin quedar versionadas.
-- Este archivo las documenta tal cual están en la base (pg_get_functiondef).
-- Es idempotente (if not exists / or replace), pero NO hace falta re-aplicarlo.
--
-- Piezas: portal_access (tabla puente auth↔persona), portal_current_person()
-- (persona del JWT por email), portal_cliente_client() (cliente del usuario
-- logueado), portal_gen_password(), portal_provision_account() y el trigger
-- de auto-provisión sobre fin_directory.
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.portal_access (
  id uuid not null default gen_random_uuid() primary key,
  person_id uuid,
  login_email text not null,
  auth_user_id uuid,
  enabled boolean not null default true,
  shared_secret text,          -- contraseña generada, en claro, para pasársela al cliente
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid
);
create unique index if not exists portal_access_login_email_key on public.portal_access (lower(login_email));

-- La persona del usuario logueado: por EMAIL del JWT (no por auth_user_id).
create or replace function public.portal_current_person()
returns table(person_id uuid, nombre text, email text, empresa text, norm_keys text[])
language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  with me as (
    select pa.person_id
    from public.portal_access pa
    where pa.enabled
      and lower(pa.login_email) = lower(nullif(auth.jwt()->>'email',''))
    limit 1
  )
  select d.id, d.nombre, d.email, d.empresa,
    (
      select array_agg(distinct k)
      from (
        select fin_norm(d.nombre) as k
        union
        select fin_norm(a) from unnest(coalesce(d.aliases,'{}')) a
      ) s
      where k is not null
    ) as norm_keys
  from me join public.fin_directory d on d.id = me.person_id;
$function$;

-- El cliente del usuario logueado (o null): nombre de cliente vs nombre/aliases.
create or replace function public.portal_cliente_client()
returns text
language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select c.id
  from public.portal_current_person() p
  join public.clients c on public.fin_norm(c.name) = any(p.norm_keys)
  order by length(c.name) desc
  limit 1
$function$;

create or replace function public.portal_gen_password(p_nombre text)
returns text
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_parts text[]; v_base text; v_pwd text; v_i int := 3;
begin
  v_parts := regexp_split_to_array(btrim(coalesce(p_nombre,'')), '\s+');
  v_base := lower(public.unaccent(coalesce(v_parts[array_length(v_parts,1)],'')));
  v_base := regexp_replace(v_base, '[^a-z0-9]', '', 'g');
  if v_base = '' then v_base := 'socio'; end if;
  loop
    v_pwd := v_base || left('123456789', v_i);
    exit when not exists (select 1 from public.portal_access where shared_secret = v_pwd);
    v_i := v_i + 1;
    if v_i > 9 then
      v_pwd := v_base || '123' || substr(replace(gen_random_uuid()::text,'-',''),1,4);
      exit;
    end if;
  end loop;
  return v_pwd;
end;$function$;

create or replace function public.portal_provision_account(p_id uuid)
returns void
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare d record; v_email text; v_pwd text; v_uid uuid;
begin
  select id, nombre, email into d from public.fin_directory where id = p_id;
  if d.id is null then return; end if;
  v_email := lower(btrim(coalesce(d.email,'')));
  if v_email = '' or v_email not like '%_@_%.__%' then return; end if;

  -- 🛑 GUARDAS DE SEGURIDAD: jamás tocar cuentas del equipo.
  if v_email like '%@metodokorex.com' then return; end if;
  if exists (select 1 from public.team_members tm where lower(tm.email) = v_email) then return; end if;

  -- si ya tiene acceso al portal, no hacer nada
  if exists (select 1 from public.portal_access where lower(login_email) = v_email) then return; end if;

  -- 🛑 si YA existe un usuario auth con ese email, NO lo tocamos. Solo cuentas 100% nuevas.
  if exists (select 1 from auth.users where lower(email) = v_email) then return; end if;

  v_pwd := public.portal_gen_password(d.nombre);
  v_uid := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated','authenticated', v_email,
    extensions.crypt(v_pwd, extensions.gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}','{}', '','','','','','','','');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_uid::text, v_uid, json_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  insert into public.portal_access (person_id, login_email, auth_user_id, enabled, shared_secret, notes)
  values (p_id, v_email, v_uid, true, v_pwd, 'auto-provision')
  on conflict (lower(login_email)) do nothing;
exception when others then
  raise warning 'portal_provision_account(%) falló: %', p_id, sqlerrm;
end;$function$;

create or replace function public.trg_portal_provision()
returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(NEW.tipo,'') in ('Cliente','Conector','Consultor','Marketing')
     and coalesce(NEW.email,'') <> '' then
    perform public.portal_provision_account(NEW.id);
  end if;
  return NEW;
end;$function$;

drop trigger if exists fin_directory_portal_provision on public.fin_directory;
create trigger fin_directory_portal_provision
  after insert or update of email, tipo on public.fin_directory
  for each row execute function trg_portal_provision();
