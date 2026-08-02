-- portal_v82_documento_por_funnel.sql
--
-- Cierra el ultimo tramo de [portal_v80] / [portal_v81].
--
-- EL BUG: portal_cliente_embudos pasó a devolver `id` = id del FUNNEL
-- (strategy_pages.id), pero las pantallas de adentro siguen llamando RPCs que
-- buscaban ese id en `strategies`. Resultado: la RPC devolvia null, el helper
-- rpc() del portal caia al MOCK y el cliente veia contenido de demostracion
-- ("Reclutamiento", guiones inventados) en vez del suyo.
--
-- Recorrido roto:  Embudos -> /embudo/<funnel> -> /documento/<funnel>/ads
--                                             -> /entregables/<funnel>
--
-- LA REGLA: el funnel es la unidad, y cada funnel tiene su propio DEL.
--   * secciones del DEL  -> por del_doc_id  (propio del funnel)
--   * recursos y material -> por strategy_id (la carpeta, compartida)
--
-- Las RPCs aceptan LAS DOS COSAS: si les llega un id de funnel trabajan con ese
-- funnel; si les llega un id de carpeta (enlaces viejos, notificaciones ya
-- enviadas) resuelven al primer funnel de esa carpeta. Asi nada que ya este
-- circulando se rompe.

-- ── 1) portal_cliente_documento ──────────────────────────────────────────────
-- Se edita la definicion VIVA con replace (misma tecnica que portal_v79b/v81):
-- son ~200 lineas y transcribirlas a mano es justamente el riesgo que se evita.
do $mig$
declare d text; o text; n int;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
   where n2.nspname = 'public' and p.proname = 'portal_cliente_documento';
  if d is null then raise exception 'portal_cliente_documento no existe'; end if;
  o := d;

  -- Variables nuevas: el funnel resuelto, su carpeta y su documento.
  d := replace(d,
    '  v_docs jsonb; v_otros jsonb;',
    '  v_docs jsonb; v_otros jsonb;
  v_funnel text; v_strat text; v_doc text;');

  -- Entrada: normalizar p_strategy a un funnel. `order by (sp.id = p_strategy)
  -- desc` hace que, si el id ES un funnel, gane ese; si es una carpeta, cae al
  -- primero de la carpeta por posicion.
  d := replace(d,
    '  select name into v_name from public.strategies where id = p_strategy and client_id = v_cid;
  if v_name is null then return null; end if;',
    '  select sp.id, sp.strategy_id, sp.del_doc_id, sp.name
    into v_funnel, v_strat, v_doc, v_name
    from public.strategy_pages sp
   where sp.client_id = v_cid and (sp.id = p_strategy or sp.strategy_id = p_strategy)
   order by (sp.id = p_strategy) desc, sp.position nulls last, sp.id
   limit 1;
  if v_funnel is null then
    -- Carpeta sin ningun funnel (caso raro: carpeta de Drive huerfana).
    select name into v_name from public.strategies where id = p_strategy and client_id = v_cid;
    if v_name is null then return null; end if;
    v_strat := p_strategy;
  end if;');

  -- Secciones del DEL -> por documento del funnel.
  d := replace(d, 'ds.strategy_id = p_strategy', 'ds.doc_id = v_doc');
  d := replace(d, 'd.strategy_id = p_strategy',  'd.doc_id = v_doc');

  -- Recursos y material -> por carpeta.
  d := replace(d, 'fr.strategy_id = p_strategy',      'fr.strategy_id = v_strat');
  d := replace(d, 'where strategy_id = p_strategy',   'where strategy_id = v_strat');

  -- Avatares: los define el propio funnel, no la carpeta.
  d := replace(d, 'sp.strategy_id = p_strategy', 'sp.id = v_funnel');

  -- El id que el portal usa para navegar tiene que ser el del funnel.
  d := replace(d,
    '''funnel'', jsonb_build_object(''id'', p_strategy, ''name'', v_name)',
    '''funnel'', jsonb_build_object(''id'', coalesce(v_funnel, p_strategy), ''name'', v_name)');
  d := replace(d,
    'v_next := jsonb_build_object(''strategyId'', p_strategy, ''tipo'', ''vsl''',
    'v_next := jsonb_build_object(''strategyId'', coalesce(v_funnel, p_strategy), ''tipo'', ''vsl''');

  -- "Otros embudos" y "siguiente": ahora son otros FUNNELS, no otras carpetas.
  d := replace(d,
    '  from public.strategies s
  where s.client_id = v_cid and s.id <> p_strategy
    and exists (select 1 from public.del_sections d where d.strategy_id = s.id and d.para_grabar and d.kind in (''vsl'',''anuncios''));',
    '  from public.strategy_pages s
  where s.client_id = v_cid and s.id is distinct from v_funnel
    and exists (select 1 from public.del_sections d
                 where d.doc_id = s.del_doc_id and d.para_grabar and d.kind in (''vsl'',''anuncios''));');

  d := replace(d,
    '      from public.strategies s
      where s.client_id = v_cid and s.id <> p_strategy
        and exists (select 1 from public.del_sections d2 where d2.strategy_id = s.id and d2.para_grabar and d2.kind in (''vsl'',''anuncios''))
      order by s.position limit 1;',
    '      from public.strategy_pages s
      where s.client_id = v_cid and s.id is distinct from v_funnel
        and exists (select 1 from public.del_sections d2 where d2.doc_id = s.del_doc_id and d2.para_grabar and d2.kind in (''vsl'',''anuncios''))
      order by s.position nulls last, s.id limit 1;');

  d := replace(d,
    'case when exists (select 1 from public.del_sections d2 where d2.strategy_id = s.id and d2.kind=''anuncios'' and d2.para_grabar)',
    'case when exists (select 1 from public.del_sections d2 where d2.doc_id = s.del_doc_id and d2.kind=''anuncios'' and d2.para_grabar)');

  -- Guardas: si algo no coincidio, abortar sin tocar produccion.
  if d = o then raise exception 'Ningun patron coincidio: abortado'; end if;
  n := (length(d) - length(replace(d, 'p_strategy', ''))) / length('p_strategy');
  -- Quedan solo los usos legitimos: la firma, la resolucion de entrada y los
  -- coalesce() de salida. Si aparece alguno mas, es un filtro sin migrar.
  if n > 9 then
    raise exception 'Quedaron % usos de p_strategy sin migrar: abortado', n;
  end if;
  if position('strategy_id = s.id' in d) > 0 then
    raise exception 'Quedo un filtro por carpeta sin migrar: abortado';
  end if;

  execute d;
end $mig$;

-- ── 2) portal_cliente_carpeta_embudo ────────────────────────────────────────
-- Pantalla "Entregables" (grabaciones / ediciones). Es corta, se reescribe
-- entera. Los recursos viven por CARPETA, asi que lo unico que cambia es que
-- ahora tambien acepta un id de funnel.
create or replace function public.portal_cliente_carpeta_embudo(p_strategy text, p_tipo text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_cid text; v_strat text; v_name text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;

  -- Acepta id de funnel o de carpeta.
  select sp.strategy_id, sp.name into v_strat, v_name
    from public.strategy_pages sp
   where sp.client_id = v_cid and (sp.id = p_strategy or sp.strategy_id = p_strategy)
   order by (sp.id = p_strategy) desc, sp.position nulls last, sp.id
   limit 1;

  if v_strat is null then
    select s.id, s.name into v_strat, v_name
      from public.strategies s where s.id = p_strategy and s.client_id = v_cid;
    if v_strat is null then return null; end if;
  end if;

  return jsonb_build_object(
    'funnel', v_name,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'titulo', fr.title, 'url', fr.public_url, 'kind', fr.kind, 'bucket', fr.bucket_key,
        'fecha', to_char(fr.created_at,'DD/MM'),
        'thumb', case when fr.provider = 'bunny' then fr.storage_path end
      ) order by fr.created_at desc)
      from public.funnel_resources fr
      where fr.strategy_id = v_strat
        and coalesce(fr.public_url,'') <> ''
        and fr.bucket_key in (
          case when p_tipo = 'grabaciones' then 'vsl_rec' else 'vsl_edit' end,
          case when p_tipo = 'grabaciones' then 'ad_rec' else 'ad_edit' end)
    ), '[]'::jsonb));
end $function$;

-- ── 3) Los enlaces que arma el propio backend ───────────────────────────────
-- portal_cliente_guiones y _portal_revisiones_json arman los `strategyId` con
-- los que la Home y la pestaña Guiones abren un documento. Si siguen emitiendo
-- la carpeta, un cliente con varios funnels en la misma carpeta (Daniel Serrano
-- tiene 3, Korex 2) abre el documento del funnel equivocado.

create or replace function public.portal_cliente_guiones()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', ds.id,
      'strategyId', sp.id,
      'docTipo', case ds.kind when 'vsl' then 'vsl' else 'ads' end,
      'funnel', sp.name,
      'titulo', ds.title,
      -- Qué le pedimos con esta pestaña. Lo decide el DEL, no la pantalla.
      'tarea', case when ds.para_grabar then 'grabar' else 'revisar' end,
      'snippet', left(regexp_replace(coalesce(ds.text,''), '\s+', ' ', 'g'), 160),
      'palabras', coalesce(array_length(regexp_split_to_array(btrim(coalesce(ds.text,'')), E'\\s+'), 1), 0),
      'grabado', coalesce(gs.grabado, false),
      'revisado', coalesce(gs.revisado, false),
      -- "Entregado" es de las de grabar; en una de revisar no significa nada.
      'entregado', ds.para_grabar and exists (
        select 1 from public.funnel_resources fr
        where fr.strategy_id = sp.strategy_id
          and fr.bucket_key in (case ds.kind when 'vsl' then 'vsl_rec' else 'ad_rec' end,
                                case ds.kind when 'vsl' then 'vsl_edit' else 'ad_edit' end))
    ) order by
      case when sp.status = 'activa' then 1 else 0 end,
      sp.position,
      case ds.kind when 'anuncios' then 0 else 1 end,
      coalesce(ds.orden_grabacion, ds.ord, 0), ds.title)
    from public.strategy_pages sp
    join public.del_sections ds on ds.doc_id = sp.del_doc_id
    left join public.portal_guion_status gs
      on gs.section_id = ds.id and gs.client_id = public.portal_cliente_client()
    where sp.client_id = public.portal_cliente_client()
      and ds.kind in ('anuncios','vsl')
      and (ds.para_grabar
           or (coalesce(ds.estado_seccion,'') = 'terminado'
               and coalesce(ds.accion_cliente,'') = 'revisar'))
  ), '[]'::jsonb) end;
$function$;

create or replace function public._portal_revisiones_json(p_client text)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(jsonb_agg(item order by (item->>'dias')::int desc), '[]'::jsonb) from (
    -- (a) Revisiones "simples": un kind = un documento (anuncios/vsl/avatar/estrategia).
    select jsonb_build_object(
      'id', 'revision_' || t.funnel_id || '_' || t.doc_tipo,
      'tipo', 'revision',
      'titulo', t.titulo,
      'descripcion', 'Embudo ' || t.name || '. ' || case when t.n = 1
        then 'Léelo y márcalo como revisado. Si algo no encaja, selecciona el texto y déjanos un comentario.'
        else 'Son ' || t.n || '. Léelos y márcalos como revisados; si algo no encaja, selecciona el texto y déjanos un comentario.' end,
      'dias', greatest(0, extract(day from now() - t.desde))::int,
      'bloqueante', false, 'estado', 'pendiente',
      'strategyId', t.funnel_id, 'docTipo', t.doc_tipo,
      'funnel', t.name, 'funnelNum', public._portal_funnel_num(p_client, t.funnel_id),
      'pendientes', t.n, 'target', null, 'subidos', 0
    ) as item
    from (
      select sp.id as funnel_id, sp.name, x.doc_tipo,
             case x.doc_tipo when 'ads' then 'Revisa tus anuncios'
                             when 'vsl' then 'Revisa tu VSL'
                             when 'avatar' then 'Revisa tu avatar'
                             else 'Revisa la estrategia' end as titulo,
             count(*) as n,
             min(coalesce(ds.updated_at, ds.imported_at, now())) as desde
      from public.strategy_pages sp
      cross join (values ('ads','anuncios'), ('vsl','vsl'),
                         ('avatar','avatares'), ('estrategia','estrategia')) as x(doc_tipo, kind)
      join public.del_sections ds on ds.doc_id = sp.del_doc_id and ds.kind = x.kind
      left join public.portal_guion_status gs
        on gs.section_id = ds.id and gs.client_id = p_client
      where sp.client_id = p_client
        and coalesce(ds.estado_seccion, '') = 'terminado'
        and coalesce(ds.accion_cliente, '') = 'revisar'
        and not coalesce(ds.para_grabar, false)
        and not coalesce(gs.revisado, false)
      group by sp.id, sp.name, x.doc_tipo

      union all

      -- (b) Copy del funnel: las 4 páginas AGRUPADAS en un solo pendiente.
      select sp.id as funnel_id, sp.name, 'copy' as doc_tipo,
             'Revisar el copy del funnel' as titulo,
             count(*) as n,
             min(coalesce(ds.updated_at, ds.imported_at, now())) as desde
      from public.strategy_pages sp
      join public.del_sections ds on ds.doc_id = sp.del_doc_id
        and ds.kind in ('pg_prelanding','pg_landing','pg_formulario','pg_thankyou')
      left join public.portal_guion_status gs
        on gs.section_id = ds.id and gs.client_id = p_client
      where sp.client_id = p_client
        and coalesce(ds.estado_seccion, '') = 'terminado'
        and coalesce(ds.accion_cliente, '') = 'revisar'
        and not coalesce(gs.revisado, false)
      group by sp.id, sp.name
    ) t
  ) q;
$function$;

-- Verificacion sugerida (con un cliente de varios funnels, ej. Daniel Serrano):
--   select jsonb_array_length(public._portal_revisiones_json('<client_id>'));
--   -- y que cada 'strategyId' exista en strategy_pages:
--   select r->>'strategyId' from jsonb_array_elements(public._portal_revisiones_json('<client_id>')) r;
