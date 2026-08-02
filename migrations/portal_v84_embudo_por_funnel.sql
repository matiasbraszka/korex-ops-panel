-- portal_v84_embudo_por_funnel.sql
--
-- Ultimo tramo del cambio a "el funnel es la unidad" ([portal_v80] / [v81] / [v82]).
--
-- La pantalla EMBUDO del portal cruza cuatro RPCs con el id que le llega por la
-- URL. Ese id ahora es el del FUNNEL, pero las cuatro seguian devolviendo mapas
-- indexados por CARPETA (strategies.id). Efecto en pantalla:
--
--   * portal_cliente_material   -> EmbudoScreen filtra `g.strategyId === id`:
--       no coincidia nada, asi que el embudo se veia SIN grabaciones ni
--       devoluciones aunque las tuviera.
--   * portal_cliente_embudo_pasos / _tracks / _optimizacion -> `optMap?.[id]`
--       daba undefined: el timeline y el detalle quedaban vacios.
--
-- Ademas habia un bug de fondo, anterior a esto: _tracks y _optimizacion
-- agregaban con jsonb_object_agg(s.id, ...) uniendo strategies con
-- strategy_pages. Con VARIOS funnels en una misma carpeta la clave se repetia y
-- jsonb_object_agg se queda con el ultimo: Daniel Serrano (3 funnels) y Korex (2)
-- veian los datos de UNO solo, pisando a los otros.
--
-- Regla, igual que en las anteriores:
--   * secciones del DEL   -> por del_doc_id  (propio de cada funnel)
--   * recursos y pedidos  -> por strategy_id (la carpeta, compartida)

-- ── 1) Material: grabaciones, devoluciones y paginas, por funnel ────────────
create or replace function public.portal_cliente_material()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_cid text; v_visto timestamptz;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;
  select pa.material_visto_at into v_visto
  from public.portal_access pa
  where pa.enabled and lower(pa.login_email) = lower(nullif(auth.jwt()->>'email',''))
  limit 1;

  return jsonb_build_object(
    'grabaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'funnel', t.name, 'strategyId', t.sid, 'tipo', t.doc_tipo,
        'titulo', case t.doc_tipo when 'vsl' then 'VSL grabado' else 'Anuncios grabados' end,
        'subidos', t.n,
        'estado', case when t.n > 0 or t.ed > 0 then 'subido' else 'falta' end,
        'dias', t.dias, 'ultimo', t.ultimo
      ) order by t.pos, t.doc_tipo)
      from (
        select sp.id sid, sp.name, sp.position pos, x.doc_tipo,
          (select count(*) from public.funnel_resources fr where fr.strategy_id = sp.strategy_id and fr.bucket_key = x.bucket) n,
          (select count(*) from public.funnel_resources fr where fr.strategy_id = sp.strategy_id and fr.bucket_key = x.bucket_edit) ed,
          (select fr.title from public.funnel_resources fr where fr.strategy_id = sp.strategy_id and fr.bucket_key = x.bucket order by fr.created_at desc limit 1) ultimo,
          greatest(0, extract(day from now() - (select max(coalesce(ds.updated_at, ds.imported_at)) from public.del_sections ds
             where ds.doc_id = sp.del_doc_id and ds.para_grabar and ds.kind = x.kind)))::int dias
        from public.strategy_pages sp
        cross join (values ('ads','anuncios','ad_rec','ad_edit'), ('vsl','vsl','vsl_rec','vsl_edit')) x(doc_tipo, kind, bucket, bucket_edit)
        where sp.client_id = v_cid
          and (exists (select 1 from public.del_sections ds where ds.doc_id = sp.del_doc_id and ds.para_grabar and ds.kind = x.kind)
            or exists (select 1 from public.funnel_resources fr where fr.strategy_id = sp.strategy_id and fr.bucket_key = x.bucket))
      ) t), '[]'::jsonb),
    'marca', coalesce((
      select jsonb_agg(p) from jsonb_array_elements(public._portal_pedidos_json(v_cid)) p
      where p->>'tipo' <> 'acceso_meta' and p->>'bucket' is not null), '[]'::jsonb),
    'accesoMeta', case when public._portal_meta_configurada(v_cid) then 'validado' else coalesce((
      select case when pp.estado in ('completo','validado') then 'validado' else pp.estado end
      from public.portal_pedidos pp
      where pp.client_id = v_cid and pp.tipo = 'acceso_meta' and pp.activo
      order by pp.pedido_at desc limit 1), 'sin_pedido') end,
    -- Los videos editados se guardan por CARPETA. Se muestran en cada funnel de
    -- esa carpeta: es preferible que los vea repetidos a que no los vea.
    'devoluciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'funnel', sp.name, 'strategyId', sp.id, 'count', d.n,
        'ultimo', to_char(d.ult, 'DD/MM'),
        'nuevo', d.ult > coalesce(v_visto, 'epoch'::timestamptz),
        'items', d.items
      ) order by d.ult desc)
      from (
        select fr.strategy_id, count(*) n, max(fr.created_at) ult,
          jsonb_agg(jsonb_build_object('titulo', fr.title, 'url', fr.public_url, 'kind', fr.kind,
            'bucket', fr.bucket_key, 'fecha', to_char(fr.created_at,'DD/MM'))
            order by fr.created_at desc) items
        from public.funnel_resources fr
        where fr.client_id = v_cid and fr.bucket_key in ('vsl_edit','ad_edit')
          and coalesce(fr.visible_cliente, false)
        group by fr.strategy_id
      ) d join public.strategy_pages sp on sp.strategy_id = d.strategy_id and sp.client_id = v_cid), '[]'::jsonb),
    'paginas', coalesce((
      select jsonb_agg(jsonb_build_object('funnel', sp.name,
        'url', coalesce(nullif(sp.official_domain,''), nullif(sp.prod_url,''))))
      from public.strategy_pages sp
      where sp.client_id = v_cid and sp.status = 'activa'
        and (coalesce(sp.official_domain,'') <> '' or coalesce(sp.prod_url,'') <> '')), '[]'::jsonb)
  );
end $function$;

-- ── 2) Pasos del embudo (el timeline vertical) ─────────────────────────────
create or replace function public.portal_cliente_embudo_pasos()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with cid as (select public.portal_cliente_client() as v),
  base as (
    select cp.funnel_id as sid, cp.stage, cp.ord, cp.substate, (cp.status = 'listo') as done,
           exists(select 1 from public.strategy_pages sp
                   where sp.id = cp.funnel_id and sp.status = 'activa') as lanzado
    from public.cerebro_pipeline_status((select v from cid)) cp
    where cp.funnel_id is not null
  ),
  -- Deuda del cliente por funnel, separada por paso. El DEL va por documento
  -- propio; los pedidos de material, por carpeta.
  deuda as (
    select sp.id as sid,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = (select v from cid)
             where ds.doc_id = sp.del_doc_id and ds.para_grabar and ds.kind = 'anuncios' and not coalesce(gs.grabado,false)) as ads_grab,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = (select v from cid)
             where ds.doc_id = sp.del_doc_id and ds.para_grabar and ds.kind = 'vsl' and not coalesce(gs.grabado,false)) as vsl_grab,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = (select v from cid)
             where ds.doc_id = sp.del_doc_id and coalesce(ds.estado_seccion,'')='terminado' and coalesce(ds.accion_cliente,'')='revisar'
               and ds.kind = 'anuncios' and not coalesce(gs.revisado,false)) as ads_rev,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = (select v from cid)
             where ds.doc_id = sp.del_doc_id and coalesce(ds.estado_seccion,'')='terminado' and coalesce(ds.accion_cliente,'')='revisar'
               and ds.kind = 'vsl' and not coalesce(gs.revisado,false)) as vsl_rev,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = (select v from cid)
             where ds.doc_id = sp.del_doc_id and coalesce(ds.estado_seccion,'')='terminado' and coalesce(ds.accion_cliente,'')='revisar'
               and ds.kind in ('pg_prelanding','pg_landing','pg_formulario','pg_thankyou') and not coalesce(gs.revisado,false)) as land_rev,
      exists(select 1 from public.portal_pedidos pp
             left join lateral (select count(*) n from public.funnel_resources fr
               where fr.client_id = (select v from cid) and pp.bucket_key is not null and fr.bucket_key = pp.bucket_key
                 and fr.strategy_id = pp.strategy_id) cnt on true
             where pp.client_id = (select v from cid) and pp.activo and pp.strategy_id = sp.strategy_id
               and pp.estado not in ('completo','validado')
               and not (pp.target_count is not null and coalesce(cnt.n,0) >= pp.target_count)
               and not (pp.bucket_key is not null and pp.target_count is null and coalesce(cnt.n,0) > 0)) as mat
    from public.strategy_pages sp
    where sp.client_id = (select v from cid)
  ),
  marc0 as (
    select b.*,
      case b.stage when 'estrategia' then 'Estrategia' when 'avatares' then 'Avatares'
                   when 'vsl' then 'VSL' when 'anuncios' then 'Anuncios'
                   when 'landing' then 'Landing' else b.stage end as lbl,
      case b.stage
        when 'vsl'      then (d.vsl_grab or d.vsl_rev or b.substate = 'guion')
        when 'anuncios' then (d.ads_grab or d.ads_rev or b.substate = 'guion')
        when 'landing'  then (d.mat or d.land_rev)
        else false end as debt_cli
    from base b left join deuda d on d.sid = b.sid
  ),
  marc as (
    select m.*,
      case
        when m.lanzado then 'hecho'
        when m.debt_cli then 'cliente'
        when m.done then 'hecho'
        else 'korex' end as quien,
      case when m.lanzado or (m.done and not m.debt_cli) then 'listo'
           when m.ord = min(m.ord) filter (where not (m.lanzado or (m.done and not m.debt_cli))) over (partition by m.sid) then 'en_curso'
           else 'pendiente' end as estado
    from marc0 m
  )
  select case when (select v from cid) is null then '{}'::jsonb else coalesce((
    select jsonb_object_agg(sid, pasos) from (
      select sid,
        jsonb_agg(jsonb_build_object('key', stage, 'label', lbl, 'done', done, 'quien', quien, 'estado', estado) order by ord) as pasos
      from marc group by sid
    ) q
  ), '{}'::jsonb) end;
$function$;

-- ── 3) Tracks (VSL / Anuncios / Landing con sus fases) ─────────────────────
create or replace function public.portal_cliente_embudo_tracks()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with cid as (select public.portal_cliente_client() as v),
  sig as (
    select sp.id as sid,
      (sp.status = 'activa') as lanzado,
      -- VSL
      (coalesce(sp.vsl_script,'') <> '' or exists(select 1 from public.del_sections d where d.doc_id=sp.del_doc_id and d.kind='vsl')) as vsl_guion,
      exists(select 1 from public.funnel_resources fr where fr.strategy_id=sp.strategy_id and fr.bucket_key='vsl_rec') as vsl_grab,
      (coalesce(sp.vsl_url,'') <> '' or exists(select 1 from public.funnel_resources fr where fr.strategy_id=sp.strategy_id and fr.bucket_key='vsl_edit')) as vsl_edit,
      exists(select 1 from public.del_sections d left join public.portal_guion_status g on g.section_id=d.id and g.client_id=sp.client_id
             where d.doc_id=sp.del_doc_id and d.kind='vsl' and coalesce(d.estado_seccion,'')='terminado' and coalesce(d.accion_cliente,'')='revisar' and not coalesce(g.revisado,false)) as vsl_revp,
      exists(select 1 from public.del_sections d left join public.portal_guion_status g on g.section_id=d.id and g.client_id=sp.client_id
             where d.doc_id=sp.del_doc_id and d.kind='vsl' and d.para_grabar and not coalesce(g.grabado,false)) as vsl_grabp,
      -- Anuncios
      (exists(select 1 from public.del_sections d where d.doc_id=sp.del_doc_id and d.kind='anuncios')
        or (select count(*) from jsonb_array_elements(coalesce(sp.avatars,'[]'::jsonb)) a where coalesce(a->>'ad_script','')<>'')>0) as ads_guion,
      (exists(select 1 from public.funnel_resources fr where fr.strategy_id=sp.strategy_id and fr.bucket_key='ad_rec')
        or (select count(*) from jsonb_array_elements(coalesce(sp.avatars,'[]'::jsonb)) a where coalesce((a->>'rec_files')::int,0)>0)>0) as ads_grab,
      (exists(select 1 from public.funnel_resources fr where fr.strategy_id=sp.strategy_id and fr.bucket_key='ad_edit')
        or (select count(*) from jsonb_array_elements(coalesce(sp.avatars,'[]'::jsonb)) a where coalesce((a->>'edit_files')::int,0)>0 or coalesce(a->>'ad_url','')<>'')>0) as ads_edit,
      exists(select 1 from public.del_sections d left join public.portal_guion_status g on g.section_id=d.id and g.client_id=sp.client_id
             where d.doc_id=sp.del_doc_id and d.kind='anuncios' and coalesce(d.estado_seccion,'')='terminado' and coalesce(d.accion_cliente,'')='revisar' and not coalesce(g.revisado,false)) as ads_revp,
      exists(select 1 from public.del_sections d left join public.portal_guion_status g on g.section_id=d.id and g.client_id=sp.client_id
             where d.doc_id=sp.del_doc_id and d.kind='anuncios' and d.para_grabar and not coalesce(g.grabado,false)) as ads_grabp,
      -- Landing
      exists(select 1 from public.del_sections d where d.doc_id=sp.del_doc_id and d.kind='pg_landing') as land_copy,
      (coalesce(sp.prod_url,'') <> '' or coalesce(sp.official_domain,'') <> '') as land_pub,
      exists(select 1 from public.del_sections d left join public.portal_guion_status g on g.section_id=d.id and g.client_id=sp.client_id
             where d.doc_id=sp.del_doc_id and d.kind in ('pg_prelanding','pg_landing','pg_formulario','pg_thankyou')
               and coalesce(d.estado_seccion,'')='terminado' and coalesce(d.accion_cliente,'')='revisar' and not coalesce(g.revisado,false)) as land_revp,
      (sp.tipo is not null) as estr_done,
      ((select count(*) from jsonb_array_elements(coalesce(sp.avatars,'[]'::jsonb)) a where coalesce(a->>'spec_text','')<>'')>0) as avat_done,
      exists(select 1 from public.portal_pedidos pp
             left join lateral (select count(*) n from public.funnel_resources fr
               where fr.client_id=sp.client_id and pp.bucket_key is not null and fr.bucket_key=pp.bucket_key and fr.strategy_id=pp.strategy_id) cnt on true
             where pp.client_id=sp.client_id and pp.activo and pp.strategy_id=sp.strategy_id and pp.estado not in ('completo','validado')
               and not (pp.target_count is not null and coalesce(cnt.n,0)>=pp.target_count)
               and not (pp.bucket_key is not null and pp.target_count is null and coalesce(cnt.n,0)>0)) as mat_pend
    from public.strategy_pages sp
    where sp.client_id = (select v from cid)
  ),
  cur as (
    select sig.*,
      case when lanzado then 5
           when mat_pend then 0
           when not vsl_guion then 1
           when vsl_revp then 2
           when vsl_grabp then 3
           when not vsl_edit then 4
           else 5 end as vsl_cur,
      case when lanzado then 5
           when mat_pend then 0
           when not ads_guion then 1
           when ads_revp then 2
           when ads_grabp then 3
           when not ads_edit then 4
           else 5 end as ads_cur,
      case when lanzado then 4
           when mat_pend then 0
           when not land_copy then 1
           when land_revp then 2
           when not land_pub then 3
           else 4 end as land_cur
    from sig
  )
  select case when (select v from cid) is null then '{}'::jsonb else coalesce((
    select jsonb_object_agg(sid, jsonb_build_object(
      'lanzado', lanzado,
      'simples', jsonb_build_array(
        jsonb_build_object('label','Estrategia','estado', case when estr_done then 'hecho' else 'korex' end),
        jsonb_build_object('label','Avatares','estado', case when avat_done then 'hecho' else 'korex' end)),
      'tracks', jsonb_build_array(
        jsonb_build_object('label','VSL','fases', jsonb_build_array(
          public._portal_fase('Recursos', 0, vsl_cur, 'cliente'),
          public._portal_fase('Guión',    1, vsl_cur, 'korex'),
          public._portal_fase('Revisión', 2, vsl_cur, 'cliente'),
          public._portal_fase('Grabación',3, vsl_cur, 'cliente'),
          public._portal_fase('Edición',  4, vsl_cur, 'korex'))),
        jsonb_build_object('label','Anuncios','fases', jsonb_build_array(
          public._portal_fase('Recursos', 0, ads_cur, 'cliente'),
          public._portal_fase('Copy',     1, ads_cur, 'korex'),
          public._portal_fase('Revisión', 2, ads_cur, 'cliente'),
          public._portal_fase('Grabación',3, ads_cur, 'cliente'),
          public._portal_fase('Edición',  4, ads_cur, 'korex'))),
        jsonb_build_object('label','Landing','fases', jsonb_build_array(
          public._portal_fase('Recursos', 0, land_cur, 'cliente'),
          public._portal_fase('Copy',     1, land_cur, 'korex'),
          public._portal_fase('Revisión', 2, land_cur, 'cliente'),
          public._portal_fase('Diseño',   3, land_cur, 'korex'))))
    )) from cur
  ), '{}'::jsonb) end;
$function$;

-- ── 4) Optimizacion (lo que sigue despues del 100%) ────────────────────────
create or replace function public.portal_cliente_optimizacion()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with cid as (select public.portal_cliente_client() as v)
  select case when (select v from cid) is null then '{}'::jsonb else coalesce((
    select jsonb_object_agg(sid, info) from (
      select sp.id as sid, jsonb_build_object(
        'lanzado', true,
        'target', sp.ads_target,
        'entregados', (select count(*) from public.funnel_resources fr
                        where fr.strategy_id = sp.strategy_id and fr.bucket_key = 'ad_edit'),
        'extras', greatest(0, (select count(*) from public.funnel_resources fr
                        where fr.strategy_id = sp.strategy_id and fr.bucket_key = 'ad_edit') - coalesce(sp.ads_target, 0)),
        'pendientes', coalesce((
          select jsonb_agg(jsonb_build_object('tipo', tipo, 'titulo', titulo, 'dias', dias) order by dias desc) from (
            select 'grabar' as tipo, ds.title as titulo,
                   greatest(0, extract(day from now() - coalesce(ds.grab_flujo_at, ds.updated_at, ds.imported_at))::int) as dias
            from public.del_sections ds
            where ds.doc_id = sp.del_doc_id and ds.para_grabar and ds.kind in ('vsl','anuncios')
              and coalesce(ds.fase,'lanzamiento') = 'optimizacion'
              and coalesce(ds.grab_flujo,'') <> 'grabado'
            union all
            select 'revisar', ds.title,
                   greatest(0, extract(day from now() - coalesce(ds.updated_at, ds.imported_at))::int)
            from public.del_sections ds
            left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = (select v from cid)
            where ds.doc_id = sp.del_doc_id and coalesce(ds.estado_seccion,'') = 'terminado'
              and coalesce(ds.accion_cliente,'') = 'revisar' and not coalesce(gs.revisado, false)
              and coalesce(ds.fase,'lanzamiento') = 'optimizacion'
          ) p
        ), '[]'::jsonb)
      ) as info
      from public.strategy_pages sp
      where sp.client_id = (select v from cid) and sp.status = 'activa'
    ) q
  ), '{}'::jsonb) end;
$function$;

-- Verificacion (simulando la sesion de un cliente con varios funnels):
--   select jsonb_object_keys(public.portal_cliente_embudo_tracks());
--   -- tienen que ser ids spg_* y estar TODOS los funnels, no uno solo.
