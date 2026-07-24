-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente · v5 · Feedback de Matías (2026-07-24)
--
-- 1. TAREAS DEL CLIENTE: tasks.asignada_cliente (el equipo la marca en ops) →
--    el cliente la ve en su Inicio con funnel, prioridad y días; al validarse
--    desaparece sola (solo se listan las no-done).
-- 2. SUBIDAS A CARPETAS REALES: registrar_recurso ahora recibe strategy/avatar
--    y mapea las carpetas del portal a los buckets QUE OPERACIONES YA LEE
--    (vsl_rec avatar-null / ad_rec por avatar / testimonios por funnel /
--    categorías del cliente). Antes caían en buckets genéricos invisibles.
-- 3. ETAPA REAL del stepper (Guion→Grabación→Edición→Publicado) calculada con
--    lo que de verdad hay (guiones marcados, grabaciones, ediciones, activo),
--    no con la regla burda "activo=4 / tiene guiones=2".
-- 4. ACCESOS: el cliente ve sus propios accesos (clients.links category=acceso).
-- 5. HISTORIAL en Avance: últimos movimientos (subidas suyas, devoluciones
--    nuestras, guiones publicados, tareas completadas).
--
-- Aplicada a prod el 2026-07-24. Aditiva; registrar_recurso se recrea con
-- parámetros nuevos CON DEFAULT (el portal ya deployado sigue funcionando).
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Tareas del cliente ─────────────────────────────────────────────────────
alter table public.tasks add column if not exists asignada_cliente boolean not null default false;
comment on column public.tasks.asignada_cliente is
  'Portal cliente: si true, el cliente ve esta tarea en su portal (con funnel, prioridad y días). Desaparece al validarse.';

create or replace function public.portal_cliente_tareas()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'titulo', t.title,
      'prioridad', coalesce(t.priority,'normal'),
      'dias', greatest(0, extract(day from now() - t.created_at))::int,
      'funnel', coalesce(sp.name, ''),
      'vence', t.due_date
    ) order by case coalesce(t.priority,'normal') when 'alta' then 0 when 'high' then 0 when 'urgente' then 0 when 'normal' then 1 else 2 end, t.created_at)
    from public.tasks t
    left join public.strategy_pages sp on sp.id = t.funnel_id
    where t.client_id = public.portal_cliente_client()
      and t.asignada_cliente
      and coalesce(t.status,'') <> 'done'
  ), '[]'::jsonb) end;
$$;

-- ── 2. Subidas a las carpetas REALES de operaciones ──────────────────────────
-- Mapa carpeta del portal → (bucket, scope). Las de grabación viajan con el
-- funnel (strategy) y, en anuncios, con el avatar. Las de material son del
-- cliente (mismas keys que CLIENT_CATS del panel; 'estilo' se traduce).
drop function if exists public.portal_cliente_registrar_recurso(text,text,text,text,text,text,text,text,bigint);
create or replace function public.portal_cliente_registrar_recurso(
  p_folder text, p_provider text, p_kind text, p_title text,
  p_storage_path text, p_public_url text, p_bunny_id text,
  p_mime text, p_size bigint,
  p_strategy text default null, p_avatar text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_cid text; v_id text;
  v_bucket text; v_strategy text := null; v_avatar text := null;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok', false); end if;

  -- Solo un funnel del propio cliente puede usarse como scope.
  if p_strategy is not null and exists (
    select 1 from public.strategies s where s.id = p_strategy and s.client_id = v_cid
  ) then v_strategy := p_strategy; end if;

  if p_folder = 'vsl_rec' and v_strategy is not null then
    v_bucket := 'vsl_rec';                                   -- VSL: 1 carpeta por funnel
  elsif p_folder like 'ad_rec__%' and v_strategy is not null then
    v_bucket := 'ad_rec'; v_avatar := substring(p_folder from 9);  -- anuncios: por avatar
  elsif p_folder = 'testimonios' and v_strategy is not null then
    v_bucket := 'testimonios';                               -- testimonios: por funnel
  else
    -- Material del cliente (compartido por sus funnels): mismas keys que el panel.
    v_strategy := null;
    v_bucket := case p_folder when 'estilo' then 'estilo_vida'
                              when 'grab-anuncios' then 'sin_clasif'  -- carpetas viejas del portal
                              when 'grab-vsl' then 'sin_clasif'
                              else coalesce(nullif(p_folder,''), 'sin_clasif') end;
  end if;

  v_id := 'fr_'||replace(gen_random_uuid()::text,'-','');
  insert into public.funnel_resources(id, client_id, strategy_id, avatar_id, version, kind, title,
     provider, bunny_id, storage_path, public_url, mime_type, size_bytes, bucket_key, created_by, created_at)
  values (v_id, v_cid, v_strategy, v_avatar, 1, coalesce(p_kind,'file'), p_title,
     p_provider, p_bunny_id, p_storage_path, p_public_url, p_mime, p_size, v_bucket, 'portal_cliente', now());
  return jsonb_build_object('ok', true, 'id', v_id, 'bucket', v_bucket);
end $$;

-- ── 3. Etapa REAL + avatares + conteos por carpeta del portal ────────────────
-- La etapa es el paso EN CURSO: 1 Guion · 2 Grabación · 3 Edición · 4 Publicado.
create or replace function public._portal_etapa(p_strategy text, p_status text)
returns int language sql stable set search_path=public,pg_temp as $$
  select case
    when p_status = 'activa' then 4
    when exists (select 1 from public.funnel_resources fr where fr.strategy_id = p_strategy and fr.bucket_key in ('vsl_edit','ad_edit')) then 4
    when exists (select 1 from public.funnel_resources fr where fr.strategy_id = p_strategy and fr.bucket_key in ('vsl_rec','ad_rec')) then 3
    when exists (select 1 from public.del_sections ds where ds.strategy_id = p_strategy and ds.para_grabar and ds.kind in ('vsl','anuncios')) then 2
    else 1 end;
$$;

create or replace function public.portal_cliente_funnels()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'status', s.status,
      'estadoLabel', case s.status when 'activa' then 'Activo' when 'borrador' then 'En construcción' else coalesce(s.status,'') end,
      'esPrioridad', coalesce(s.prioridad, false),
      'guionesTotal', gt.n, 'guionesGrabados', gg.n, 'pendientes', pc.n,
      'etapa', public._portal_etapa(s.id, s.status),
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
      'etapa', (select public._portal_etapa(id, status) from s),
      -- Los avatares del funnel (para segmentar las carpetas de grabación de anuncios).
      'avatars', (
        select coalesce(jsonb_agg(jsonb_build_object('id', a->>'id', 'name', a->>'name') order by a->>'name'), '[]'::jsonb)
        from (
          select distinct on (a->>'id') a
          from public.strategy_pages sp,
               jsonb_array_elements(case when jsonb_typeof(sp.avatars)='array' then sp.avatars else '[]'::jsonb end) a
          where sp.strategy_id = p_strategy and coalesce(a->>'id','') <> ''
        ) q
      ),
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
      -- Conteos por carpeta DEL PORTAL: las de funnel van scopeadas al funnel; las
      -- del cliente a nivel cliente (mismas keys que el panel; estilo→estilo_vida).
      'recursos', (
        select jsonb_object_agg(k, n) from (
          select 'vsl_rec' as k, count(*) n from public.funnel_resources
            where strategy_id = p_strategy and bucket_key='vsl_rec'
          union all
          select 'testimonios', count(*) from public.funnel_resources
            where strategy_id = p_strategy and bucket_key='testimonios'
          union all
          select 'ad_rec__'||avatar_id, count(*) from public.funnel_resources
            where strategy_id = p_strategy and bucket_key='ad_rec' and avatar_id is not null group by avatar_id
          union all
          select case bucket_key when 'estilo_vida' then 'estilo' else bucket_key end, count(*)
            from public.funnel_resources
            where client_id=(select id from cid) and strategy_id is null and bucket_key is not null
            group by bucket_key
        ) q
      )
    )
  end;
$$;

-- ── 4. Accesos del cliente (los suyos: CRM, plataformas, webs) ────────────────
create or replace function public.portal_cliente_accesos()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'label', l->>'label', 'url', l->>'url', 'email', l->>'email',
      'password', l->>'password', 'notes', l->>'notes'))
    from public.clients c,
         jsonb_array_elements(case when jsonb_typeof(c.links)='array' then c.links else '[]'::jsonb end) l
    where c.id = public.portal_cliente_client() and l->>'category' = 'acceso'
  ), '[]'::jsonb) end;
$$;

-- ── 5. Historial de movimientos (para la pantalla Avance) ────────────────────
create or replace function public.portal_cliente_movimientos()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object('texto', texto, 'fecha', to_char(fecha,'DD/MM/YYYY'), 'tipo', tipo) order by fecha desc)
    from (
      (select 'Subiste "'||coalesce(title,'archivo')||'"' as texto, created_at as fecha, 'subida' as tipo
        from public.funnel_resources
        where client_id = public.portal_cliente_client() and created_by = 'portal_cliente'
        order by created_at desc limit 6)
      union all
      (select 'Te devolvimos "'||coalesce(title,'material')||'"', created_at, 'devolucion'
        from public.funnel_resources
        where client_id = public.portal_cliente_client() and visible_cliente
        order by created_at desc limit 6)
      union all
      (select 'Guion listo para grabar: '||coalesce(title,''), coalesce(updated_at, imported_at, now()), 'guion'
        from public.del_sections
        where client_id = public.portal_cliente_client() and para_grabar and kind in ('vsl','anuncios')
        order by coalesce(updated_at, imported_at) desc limit 6)
      union all
      (select 'Completamos: '||coalesce(title,''), coalesce(validated_at, updated_at, created_at), 'tarea'
        from public.tasks
        where client_id = public.portal_cliente_client() and asignada_cliente and status = 'done'
        order by coalesce(validated_at, updated_at) desc limit 6)
    ) m
    limit 12
  ), '[]'::jsonb) end;
$$;

grant execute on function
  public.portal_cliente_tareas(), public.portal_cliente_accesos(), public.portal_cliente_movimientos(),
  public.portal_cliente_registrar_recurso(text,text,text,text,text,text,text,text,bigint,text,text)
to authenticated;

-- ── v5b (aplicada junto con v5): el LISTADO de una carpeta usa el mismo mapeo ──
drop function if exists public.portal_cliente_carpeta(text);
create or replace function public.portal_cliente_carpeta(p_folder text, p_strategy text default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  v_cid text := public.portal_cliente_client();
  v_bucket text; v_avatar text := null; v_por_funnel boolean := false;
begin
  if v_cid is null then return null; end if;

  if p_folder = 'vsl_rec' then v_bucket := 'vsl_rec'; v_por_funnel := true;
  elsif p_folder like 'ad_rec__%' then v_bucket := 'ad_rec'; v_avatar := substring(p_folder from 9); v_por_funnel := true;
  elsif p_folder = 'testimonios' then v_bucket := 'testimonios'; v_por_funnel := true;
  else v_bucket := case p_folder when 'estilo' then 'estilo_vida' else p_folder end;
  end if;

  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', fr.id, 'title', fr.title, 'kind', fr.kind,
      'public_url', fr.public_url, 'provider', fr.provider
    ) order by fr.created_at desc)
    from public.funnel_resources fr
    where fr.client_id = v_cid
      and fr.bucket_key = v_bucket
      and (v_avatar is null or fr.avatar_id = v_avatar)
      and (not v_por_funnel or p_strategy is null or fr.strategy_id = p_strategy)
      and (v_por_funnel or fr.strategy_id is null)
  ), '[]'::jsonb));
end $$;

grant execute on function public.portal_cliente_carpeta(text, text) to authenticated;
