-- ═════════════════════════════════════════════════════════════════════════════
-- ACTIVAR el caso 100% real de Sergio Cánovas
--
-- Corré este archivo COMPLETO en:  Supabase Dashboard → proyecto Korex
-- (cgdwieoxjoexzlfbxrfc) → SQL Editor → New query → pegar → Run.
--
-- Es idempotente (podés correrlo más de una vez). Hace 2 cosas:
--   A) Deja las RPCs de funnels/guiones (v4) — solo lectura, aditivas.
--   B) Crea el LOGIN de piloto y lo mapea a Sergio (mismo Supabase Auth del panel).
--
-- Nota: v1 (esquema) y v2 (RPCs base) ya fueron aplicadas. Este archivo trae
-- también v4 por si querés todo junto. NO toca WhatsApp ni la cuenta real de Sergio.
--
-- Después: entrá a http://localhost:5190 y logueate con:
--     email:       sergio.piloto@portalkorex.app
--     contraseña:  sergio2026
-- ═════════════════════════════════════════════════════════════════════════════

-- ── A) RPCs v4 (funnels + guiones + guard null) ──────────────────────────────
-- Marca de prioridad por funnel (el equipo elige cuál se lanza primero).
alter table public.strategies add column if not exists prioridad boolean not null default false;

create or replace function public._portal_bloques(p_text text)
returns jsonb language sql immutable set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('marca','', 'label','Parte '||b.rn, 'texto', b.txt) order by b.rn), '[]'::jsonb)
  from (
    select trim(x.p) txt, row_number() over () rn
    from unnest(regexp_split_to_array(regexp_replace(coalesce(p_text,''), E'\r\n?', E'\n', 'g'), E'\n[ \t]*\n')) x(p)
  ) b
  where length(b.txt) > 0;
$$;

create or replace function public.portal_cliente_funnels()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'status', s.status,
      'estadoLabel', case s.status when 'activa' then 'Activo' when 'borrador' then 'En construcción' else coalesce(s.status,'') end,
      'esPrioridad', coalesce(s.prioridad, false),
      'guionesTotal', gt.n, 'guionesGrabados', gg.n, 'pendientes', pc.n,
      'etapa', case when s.status='activa' then 4 when gt.n > 0 then 2 else 1 end,
      'startDate', s.start_date
    ) order by s.position)
    from public.strategies s
    left join lateral (select count(*) n from public.del_sections ds
       where ds.strategy_id=s.id and ds.kind in ('vsl','anuncios') and ds.para_grabar) gt on true
    left join lateral (select count(*) n from public.del_sections ds
       join public.portal_guion_status gs on gs.section_id=ds.id and gs.client_id=s.client_id
       where ds.strategy_id=s.id and ds.kind in ('vsl','anuncios') and ds.para_grabar and gs.grabado) gg on true
    left join lateral (select count(*) n from jsonb_array_elements(
       case when jsonb_typeof(s.visual_resources)='array' then s.visual_resources else '[]'::jsonb end) v
       where coalesce((v->>'ok')::boolean,false)=false) pc on true
    where s.client_id = public.portal_cliente_client()
  ), '[]'::jsonb) end;
$$;

create or replace function public.portal_cliente_funnel(p_strategy text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with cid as (select public.portal_cliente_client() id),
  s as (select * from public.strategies where id=p_strategy and client_id=(select id from cid))
  select case when (select id from cid) is null or not exists(select 1 from s) then null else
    jsonb_build_object(
      'id', (select id from s), 'name', (select name from s), 'status', (select status from s),
      'estadoLabel', (select case status when 'activa' then 'Activo' when 'borrador' then 'En construcción' else coalesce(status,'') end from s),
      'guiones', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'id', ds.id,
            'tipo', case ds.kind when 'vsl' then 'VSL' else 'Anuncio' end,
            'avatar', coalesce(initcap((regexp_match(ds.title,'avatar\s*\d+','i'))[1]), case ds.kind when 'vsl' then 'VSL' else 'General' end),
            'dur', case ds.kind when 'vsl' then '~video' else '~30-60 seg' end,
            'fecha', to_char(coalesce(ds.updated_at, ds.imported_at, now()),'DD/MM/YYYY'),
            'grabado', coalesce(gs.grabado,false),
            'titulo', ds.title,
            'texto', coalesce(ds.text,'')
          ) order by coalesce(ds.orden_grabacion, ds.ord, 0), ds.title), '[]'::jsonb)
        from public.del_sections ds
        left join public.portal_guion_status gs on gs.section_id=ds.id and gs.client_id=ds.client_id
        where ds.strategy_id=p_strategy and ds.kind in ('vsl','anuncios') and ds.para_grabar
      ),
      'pendientes', (
        select coalesce(jsonb_agg(jsonb_build_object('label', v->>'label', 'ok', coalesce((v->>'ok')::boolean,false))), '[]'::jsonb)
        from s, jsonb_array_elements(case when jsonb_typeof(s.visual_resources)='array' then s.visual_resources else '[]'::jsonb end) v
      ),
      'folders', (
        select coalesce(jsonb_agg(jsonb_build_object('label', f->>'label', 'url', f->>'url')), '[]'::jsonb)
        from s, jsonb_array_elements(case when jsonb_typeof(s.folders)='array' then s.folders else '[]'::jsonb end) f
      ),
      -- Conteo de archivos por carpeta (bucket_key) para marcar vacías/subidas.
      'recursos', (
        select coalesce(jsonb_object_agg(bucket_key, n), '{}'::jsonb)
        from (select bucket_key, count(*) n from public.funnel_resources
              where client_id=(select id from cid) and bucket_key is not null
              group by bucket_key) q
      )
    )
  end;
$$;

create or replace function public.portal_cliente_guion(p_section_id text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select case when public.portal_cliente_client() is null then null else (
    select jsonb_build_object(
      'id', ds.id,
      'tipo', case ds.kind when 'vsl' then 'VSL' else 'Anuncio' end,
      'avatar', coalesce(initcap((regexp_match(ds.title,'avatar\s*\d+','i'))[1]), case ds.kind when 'vsl' then 'VSL' else 'General' end),
      'dur', case ds.kind when 'vsl' then '~video' else '~30-60 seg' end,
      'fecha', to_char(coalesce(ds.updated_at, ds.imported_at, now()),'DD/MM/YYYY'),
      'grabado', coalesce(gs.grabado,false),
      'titulo', ds.title,
      'texto', coalesce(ds.text,'')
    )
    from public.del_sections ds
    left join public.portal_guion_status gs on gs.section_id=ds.id and gs.client_id=ds.client_id
    where ds.id=p_section_id and ds.client_id = public.portal_cliente_client()
  ) end;
$$;

create or replace function public.portal_cliente_me()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select case when public.portal_cliente_client() is null then null else (
    select jsonb_build_object('id', c.id, 'name', c.name,
      'company', coalesce(nullif(btrim(coalesce(c.company,'')),''), c.name))
    from public.clients c where c.id = public.portal_cliente_client()
  ) end;
$$;

create or replace function public.portal_cliente_tutoriales()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object('id',id,'titulo',titulo,'dur',coalesce(dur,''),'url',coalesce(url,'')) order by orden)
    from public.portal_tutorials
    where activo and (client_id is null or client_id = public.portal_cliente_client())
  ), '[]'::jsonb) end;
$$;

grant execute on function
  public.portal_cliente_funnels(), public.portal_cliente_funnel(text),
  public.portal_cliente_guion(text)
to authenticated;

-- ── B) Login de piloto mapeado a Sergio Canovas ──────────────────────────────
do $$
declare v_uid uuid := gen_random_uuid();
        v_email text := 'sergio.piloto@portalkorex.app';
        v_pwd   text := 'sergio2026';
        v_person uuid := '66bc8580-1f08-4d48-b7e2-67f21c2b4eb0';  -- fin_directory: Sergio Canovas
begin
  -- vínculo portal_access (si no existe)
  insert into public.portal_access (person_id, login_email, auth_user_id, enabled, shared_secret, notes)
  select v_person, v_email, null, true, v_pwd, 'piloto-portal-cliente (demo, mapeado a Sergio Canovas)'
  where not exists (select 1 from public.portal_access where lower(login_email)=v_email);

  -- usuario de auth (si no existe)
  if not exists (select 1 from auth.users where lower(email)=v_email) then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated','authenticated', v_email,
      extensions.crypt(v_pwd, extensions.gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}','{}', '','','','','','','','');
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (v_uid::text, v_uid, json_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
    update public.portal_access set auth_user_id = v_uid where lower(login_email)=v_email;
  end if;
end $$;

-- ── Verificación rápida (opcional) ───────────────────────────────────────────
-- select set_config('request.jwt.claims', json_build_object('email','sergio.piloto@portalkorex.app','role','authenticated')::text, true);
-- select public.portal_cliente_me(), jsonb_array_length(public.portal_cliente_funnels());
