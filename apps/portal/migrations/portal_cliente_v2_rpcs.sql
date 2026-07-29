-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente · v2 · RPCs (SECURITY DEFINER)
--
-- Toda la data del portal pasa por acá, scopeada al cliente del usuario logueado.
-- El frontend nunca lee tablas internas directo.
--
-- ⚠️  BORRADOR PARA REVISAR — NO aplicado a producción.
--     Los "CONFIRMAR:" marcan joins/columnas a validar contra el esquema real.
--     La FORMA de cada retorno debe coincidir con src/data/mockData.js del portal.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── Resolver: usuario logueado → client_id ───────────────────────────────────
-- CONFIRMAR el vínculo person→client. Camino asumido:
--   auth.uid() → portal_access.auth_user_id → person_id (fin_directory) → clients.
-- Si fin_directory no tiene client_id, mapear por email (fallback comentado abajo).
create or replace function public.portal_cliente_client_id()
returns text
language sql stable security definer set search_path = public
as $$
  select c.id
  from public.portal_access pa
  join public.fin_directory fd on fd.id = pa.person_id
  join public.clients c on c.id = fd.client_id        -- CONFIRMAR: columna de vínculo
  where pa.auth_user_id = auth.uid()
    and coalesce(pa.enabled, true)
  limit 1;
  -- Fallback por email (si no hay client_id en fin_directory):
  -- select c.id from public.clients c
  -- join public.portal_access pa on lower(pa.login_email) = lower(c.email)
  -- where pa.auth_user_id = auth.uid() limit 1;
$$;

-- ── me() ─────────────────────────────────────────────────────────────────────
create or replace function public.portal_cliente_me()
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object('id', c.id, 'name', c.name, 'clientName', c.name, 'company', c.company)
  from public.clients c
  where c.id = public.portal_cliente_client_id();
$$;

-- ── home() ───────────────────────────────────────────────────────────────────
create or replace function public.portal_cliente_home()
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_client text := public.portal_cliente_client_id();
  v_total int; v_hechos int;
begin
  select count(*) into v_total
  from public.del_sections s
  where s.client_id = v_client and s.para_grabar and s.kind in ('vsl','anuncios');

  select count(*) into v_hechos
  from public.portal_guion_status g
  where g.client_id = v_client and g.grabado;

  return (
    select json_build_object(
      'clientName', c.name,
      'guionesTotal', v_total,
      'guionesGrabados', least(v_hechos, v_total),
      -- CONFIRMAR: origen del video "cómo usar" (por ahora, tutorial global o campo del cliente).
      'videoSrc', (select url from public.portal_tutorials where activo and client_id is null and url is not null order by orden limit 1),
      -- pending_resources: jsonb en clients. CONFIRMAR shape; acá se asume array de {id,nombre,subido,folderKey}.
      'pendingResources', coalesce(c.pending_resources, '[]'::jsonb),
      'pipelineNext', (select public.portal_cliente_pipeline_next(v_client))
    )
    from public.clients c where c.id = v_client
  );
end $$;

-- Próxima entrega (usado por home). CONFIRMAR shape de phase_deadlines/steps.
create or replace function public.portal_cliente_pipeline_next(p_client text)
returns json
language sql stable security definer set search_path = public
as $$
  -- Devuelve la primera fase no completada con su fecha. Ajustar al shape real.
  select json_build_object('fase', f->>'nombre', 'fecha', f->>'fecha')
  from public.clients c,
       lateral jsonb_array_elements(coalesce(c.custom_phases, '[]'::jsonb)) as f
  where c.id = p_client and coalesce(f->>'estado','pendiente') <> 'hecho'
  limit 1;
$$;

-- ── guiones() ────────────────────────────────────────────────────────────────
-- Secciones del DEL marcadas "para grabar" (VSL/anuncios), con estado grabado.
create or replace function public.portal_cliente_guiones()
returns json
language sql stable security definer set search_path = public
as $$
  select coalesce(json_agg(g order by g.orden nulls last, g.fecha), '[]'::json)
  from (
    select
      s.id::text as id,
      case when s.kind = 'vsl' then 'VSL' else 'Anuncio' end as tipo,
      -- CONFIRMAR: cómo obtener el label del avatar de la sección.
      coalesce(s.title, 'Guion') as titulo,
      coalesce(av.nombre, 'General') as avatar,
      coalesce(s.orden_grabacion, s.ord) as orden,
      to_char(coalesce(s.updated_at, s.created_at), 'DD/MM/YYYY') as fecha,
      '~1 min' as dur,                                   -- CONFIRMAR: duración real si existe
      coalesce(st.grabado, false) as grabado,
      -- bloques: por ahora un bloque con el texto de la sección. Se puede enriquecer
      -- parseando s.html en sub-bloques (hook/cuerpo/cierre) más adelante.
      json_build_array(json_build_object('label', coalesce(s.title,'Guion'), 'marca', '', 'texto', coalesce(s.text, ''))) as bloques
    from public.del_sections s
    left join public.portal_guion_status st on st.section_id = s.id and st.client_id = s.client_id
    left join lateral (select null::text as nombre) av on true   -- CONFIRMAR: join real de avatar
    where s.client_id = public.portal_cliente_client_id()
      and s.para_grabar and s.kind in ('vsl','anuncios')
  ) g;
$$;

-- ── toggle_guion() ───────────────────────────────────────────────────────────
create or replace function public.portal_cliente_toggle_guion(p_section_id uuid, p_grabado boolean)
returns json
language plpgsql volatile security definer set search_path = public
as $$
declare v_client text := public.portal_cliente_client_id();
begin
  -- Solo secciones del propio cliente marcadas para grabar.
  if not exists (select 1 from public.del_sections s where s.id = p_section_id and s.client_id = v_client and s.para_grabar) then
    return json_build_object('ok', false, 'error', 'not_allowed');
  end if;
  insert into public.portal_guion_status (client_id, section_id, grabado, grabado_at, updated_at)
  values (v_client, p_section_id, p_grabado, case when p_grabado then now() end, now())
  on conflict (client_id, section_id)
  do update set grabado = excluded.grabado,
                grabado_at = case when excluded.grabado then now() else null end,
                updated_at = now();
  return json_build_object('ok', true, 'grabado', p_grabado);
end $$;

-- ── carpetas() ───────────────────────────────────────────────────────────────
-- Grabaciones (donde sube el cliente) + recursos + ediciones devueltas.
-- CONFIRMAR: naming de bucket_key para grabaciones/recursos en funnel_resources.
create or replace function public.portal_cliente_carpetas()
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_client text := public.portal_cliente_client_id();
  -- Recursos que se le piden al cliente (carpeta fija). Ajustar a la convención real.
  v_recursos text[] := array['autoridad','estilo','branding','productos','empresa'];
begin
  return json_build_array(
    -- Sección grabaciones anuncios/vsl: se generaría por strategy×avatar. Placeholder
    -- CONFIRMAR: armar dinámico desde strategies/strategy_pages.avatars del cliente.
    json_build_object('key','sec-gr-anuncios','label','Grabaciones · Anuncios','labelColor','var(--color-blue-ink)',
      'items', public.portal_cliente_carpeta_items(v_client, 'grabacion', 'anuncios')),
    json_build_object('key','sec-gr-vsl','label','Grabaciones · VSL','labelColor','var(--color-purple)',
      'items', public.portal_cliente_carpeta_items(v_client, 'grabacion', 'vsl')),
    json_build_object('key','sec-recursos','label','Recursos del cliente','labelColor','var(--color-text3)',
      'items', (
        select json_agg(json_build_object(
          'id', r, 'cardLabel', initcap(r), 'group','recurso','iconKey','folder',
          'needed', r = any(array['autoridad','branding','productos']),
          'count', (select count(*) from public.funnel_resources fr where fr.client_id = v_client and fr.bucket_key = r)
        )) from unnest(v_recursos) as r
      ))
  );
end $$;

-- Items de una sección de grabaciones (helper). Devuelve carpetas por avatar.
create or replace function public.portal_cliente_carpeta_items(p_client text, p_group text, p_tipo text)
returns json
language sql stable security definer set search_path = public
as $$
  -- CONFIRMAR: derivar de los avatares reales del cliente. Placeholder mínimo.
  select json_agg(json_build_object(
    'id', 'gr-' || p_tipo || '-' || a.key,
    'cardLabel', a.label, 'group', p_group, 'iconKey', 'film',
    'needed', true,
    'count', (select count(*) from public.funnel_resources fr where fr.client_id = p_client and fr.bucket_key = 'gr-' || p_tipo || '-' || a.key)
  ))
  from (values ('av1','Avatar 1'), ('av2','Avatar 2')) as a(key,label);
$$;

-- ── carpeta(folder) : archivos de una carpeta ────────────────────────────────
create or replace function public.portal_cliente_carpeta(p_folder text)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object('items', coalesce(json_agg(json_build_object(
    'id', fr.id, 'title', fr.title, 'kind', fr.kind,
    'public_url', fr.public_url, 'provider', fr.provider
  ) order by fr.created_at desc), '[]'::json))
  from public.funnel_resources fr
  where fr.client_id = public.portal_cliente_client_id()
    and fr.bucket_key = p_folder;
$$;

-- ── registrar_recurso() : el portal subió un archivo, lo registramos ─────────
create or replace function public.portal_cliente_registrar_recurso(
  p_folder text, p_provider text, p_kind text, p_title text,
  p_storage_path text, p_public_url text, p_bunny_id text,
  p_mime text, p_size bigint
) returns json
language plpgsql volatile security definer set search_path = public
as $$
declare v_client text := public.portal_cliente_client_id(); v_id uuid;
begin
  if v_client is null then return json_build_object('ok', false, 'error', 'no_client'); end if;
  insert into public.funnel_resources
    (client_id, bucket_key, title, provider, kind, storage_path, public_url, bunny_id, mime_type, size_bytes, visible_cliente)
  values
    (v_client, p_folder, p_title, p_provider, p_kind, p_storage_path, p_public_url, p_bunny_id, p_mime, p_size, false)
  returning id into v_id;
  -- Aviso al equipo de que el cliente subió algo (la función se crea en v3).
  -- Envuelto para que una subida no falle si v3 todavía no se aplicó.
  begin
    perform public.portal_cliente_notify_subida(v_client, p_folder, p_title);
  exception when undefined_function then null;
  end;
  return json_build_object('ok', true, 'id', v_id);
end $$;

-- ── pipeline() ───────────────────────────────────────────────────────────────
-- CONFIRMAR: shape real de clients.custom_phases / phase_deadlines / steps.
create or replace function public.portal_cliente_pipeline()
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'progreso', coalesce((c.custom_phases->>'progreso')::int,
      (select round(100.0 * count(*) filter (where f->>'estado' = 'hecho') / nullif(count(*),0))
       from jsonb_array_elements(coalesce(c.custom_phases->'fases', c.custom_phases, '[]'::jsonb)) f)),
    'fases', coalesce((
      select json_agg(json_build_object(
        'id', coalesce(f->>'id', ordinality::text), 'nombre', f->>'nombre',
        'estado', coalesce(f->>'estado','pendiente'), 'fecha', f->>'fecha', 'detalle', f->>'detalle'))
      from jsonb_array_elements(coalesce(c.custom_phases->'fases', c.custom_phases, '[]'::jsonb)) with ordinality f
    ), '[]'::json)
  )
  from public.clients c where c.id = public.portal_cliente_client_id();
$$;

-- ── tutoriales() ─────────────────────────────────────────────────────────────
create or replace function public.portal_cliente_tutoriales()
returns json
language sql stable security definer set search_path = public
as $$
  select coalesce(json_agg(json_build_object('id', t.id, 'titulo', t.titulo, 'dur', t.dur, 'url', t.url) order by t.orden), '[]'::json)
  from public.portal_tutorials t
  where t.activo and (t.client_id is null or t.client_id = public.portal_cliente_client_id());
$$;

-- Permisos: ejecutables por usuarios autenticados (el scoping lo hace cada función).
grant execute on function
  public.portal_cliente_me(), public.portal_cliente_home(), public.portal_cliente_guiones(),
  public.portal_cliente_toggle_guion(uuid, boolean), public.portal_cliente_carpetas(),
  public.portal_cliente_carpeta(text), public.portal_cliente_registrar_recurso(text,text,text,text,text,text,text,text,bigint),
  public.portal_cliente_pipeline(), public.portal_cliente_tutoriales()
to authenticated;

commit;
