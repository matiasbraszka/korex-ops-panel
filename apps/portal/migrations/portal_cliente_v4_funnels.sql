-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente · v4 · Rediseño por FUNNELS
--
-- Todo gira en torno a funnels (strategies): la Home lista los funnels del cliente,
-- y al entrar a uno se ven sus guiones (pestañas del DEL) y lo que tiene pendiente.
--
-- Además: guard `null` en las RPCs para que, sin sesión (modo demo), el front caiga
-- al mock en vez de recibir datos reales vacíos.
--
-- Aplicar en el Supabase de Korex (cgdwieoxjoexzlfbxrfc) DESPUÉS de v1 y v2.
-- Aditivo y reversible.
-- ═════════════════════════════════════════════════════════════════════════════

-- Marca de prioridad por funnel: el equipo elige cuál se lanza primero.
-- (Setear con: update public.strategies set prioridad=true where id='<funnel>';)
alter table public.strategies add column if not exists prioridad boolean not null default false;

-- Helper: partir el texto de una sección de DEL en bloques legibles
create or replace function public._portal_bloques(p_text text)
returns jsonb language sql immutable set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('marca','', 'label','Parte '||b.rn, 'texto', b.txt) order by b.rn), '[]'::jsonb)
  from (
    select trim(x.p) txt, row_number() over () rn
    from unnest(regexp_split_to_array(regexp_replace(coalesce(p_text,''), E'\r\n?', E'\n', 'g'), E'\n[ \t]*\n')) x(p)
  ) b
  where length(b.txt) > 0;
$$;

-- Lista de funnels (estrategias) del cliente
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

-- Detalle de un funnel: guiones + pendientes + carpetas de Drive
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

-- Un guion suelto (para la vista de detalle / abrir la pestaña del DEL)
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

-- ── Guard null en las RPCs existentes (para que el modo demo caiga al mock) ──
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
