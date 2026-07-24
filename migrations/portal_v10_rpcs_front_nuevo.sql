-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente v10 — RPCs para el FRONT NUEVO (prototipo "Portal Korex")
-- (Fase C del plan "Portal v2"). Aplicada a prod el 2026-07-24 vía MCP.
--
-- Pantallas → RPC:
--   Inicio          → portal_cliente_inicio()        (lo que te falta + avance)
--   Acceso a Meta   → portal_cliente_meta()          (nº de socio + estado)
--   Documento       → portal_cliente_documento()     (guiones + comentarios + subidas)
--   Comentar        → portal_cliente_comentar()      (cliente logueado, sin token)
--   Embudos         → portal_cliente_embudos()       (estado + % + razón + TU PÁGINA)
--   Material        → portal_cliente_material()      (todo agregado + NUEVO)
--                     portal_cliente_material_visto()
--
-- Además: del_comments.portal_client_id (comentarios DEL CLIENTE, distintos de
-- "externo" y de "equipo") y CIERRE de la RLS de del_comments (antes cualquier
-- authenticated leía/escribía todo; ahora solo el equipo directo, el resto por RPC).
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 0 · del_comments: marca de cliente + RLS cerrada ─────────────────────────
alter table public.del_comments add column if not exists portal_client_id text;

drop policy if exists del_comments_rw on public.del_comments;
drop policy if exists del_comments_team on public.del_comments;
create policy del_comments_team on public.del_comments
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());

-- ── 0b · portal_access: marca de "Material visto" (para el badge NUEVO) ─────
alter table public.portal_access add column if not exists material_visto_at timestamptz;

-- ── 1 · Helpers ──────────────────────────────────────────────────────────────
-- Pedidos del cliente con su conteo real y estado calculado.
create or replace function public._portal_pedidos_json(p_client text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pp.id, 'tipo', pp.tipo, 'titulo', pp.titulo, 'descripcion', coalesce(pp.descripcion,''),
    'bucket', pp.bucket_key, 'target', pp.target_count,
    'subidos', coalesce(cnt.n, 0),
    'bloqueante', pp.bloqueante,
    'dias', greatest(0, extract(day from now() - pp.pedido_at))::int,
    'estado', case
        when pp.estado in ('validado','completo') then pp.estado
        when pp.target_count is not null and coalesce(cnt.n,0) >= pp.target_count then 'completo'
        when pp.bucket_key is not null and pp.target_count is null and coalesce(cnt.n,0) > 0 then 'completo'
        else pp.estado end,
    'strategyId', pp.strategy_id
  ) order by pp.orden, pp.pedido_at), '[]'::jsonb)
  from public.portal_pedidos pp
  left join lateral (
    select count(*) n from public.funnel_resources fr
    where fr.client_id = p_client and pp.bucket_key is not null and fr.bucket_key = pp.bucket_key
      and ((pp.strategy_id is null and fr.strategy_id is null) or fr.strategy_id = pp.strategy_id)
  ) cnt on true
  where pp.client_id = p_client and pp.activo;
$$;

-- Grabaciones que faltan, derivadas de los guiones marcados "para grabar":
-- un item por funnel y tipo (ads / vsl) que tenga guiones y cero archivos.
create or replace function public._portal_grabaciones_json(p_client text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(item order by (item->>'dias')::int desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'tipo', 'grabacion_' || t.doc_tipo,
      'titulo', case t.doc_tipo when 'vsl' then 'Graba tu VSL' else 'Graba tus anuncios' end,
      'descripcion', 'Los guiones ya están escritos en tu documento del embudo ' || t.name ||
        case t.doc_tipo when 'vsl' then '.' else '. Cada uno dura menos de un minuto.' end,
      'dias', greatest(0, extract(day from now() - t.desde))::int,
      'bloqueante', false, 'estado', 'pendiente',
      'strategyId', t.strategy_id, 'docTipo', t.doc_tipo,
      'target', null, 'subidos', 0, 'bucket', t.bucket
    ) as item
    from (
      -- v10b: si ya hay grabaciones O ediciones de ese tipo, no se pide grabar
      -- (las grabaciones pueden haber entrado por Drive, no por el portal).
      select s.id as strategy_id, s.name, x.doc_tipo, x.bucket,
        (select max(coalesce(ds.updated_at, ds.imported_at, now()))
           from public.del_sections ds
          where ds.strategy_id = s.id and ds.para_grabar and ds.kind = x.kind) as desde
      from public.strategies s
      cross join (values ('ads','anuncios','ad_rec','ad_edit'), ('vsl','vsl','vsl_rec','vsl_edit')) as x(doc_tipo, kind, bucket, bucket_edit)
      where s.client_id = p_client
        and coalesce(s.status,'') <> 'activa'
        and exists (select 1 from public.del_sections ds
                    where ds.strategy_id = s.id and ds.para_grabar and ds.kind = x.kind)
        and not exists (select 1 from public.funnel_resources fr
                        where fr.strategy_id = s.id and fr.bucket_key in (x.bucket, x.bucket_edit))
    ) t
  ) q;
$$;

-- ── 2 · INICIO ───────────────────────────────────────────────────────────────
create or replace function public.portal_cliente_inicio()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_cid text; v_name text; v_prog int; v_done boolean; v_ped jsonb; v_grab jsonb; v_wa text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;
  select name into v_name from public.clients where id = v_cid;

  select coalesce(round(avg((e-1)/3.0)*100)::int, 0), coalesce(bool_and(e = 4), false) and count(*) > 0
    into v_prog, v_done
  from (select public._portal_etapa(s.id, s.status) e from public.strategies s where s.client_id = v_cid) q;

  v_ped  := public._portal_pedidos_json(v_cid);
  v_grab := public._portal_grabaciones_json(v_cid);
  select value->>'whatsapp_equipo' into v_wa from public.app_settings where key = 'portal_config';

  return jsonb_build_object(
    'name', v_name,
    'progreso', case when v_done then 100 else v_prog end,
    'todosTerminados', v_done,
    'whatsapp', coalesce(v_wa, ''),
    -- Lo que te falta: primero las grabaciones (derivadas), después los pedidos abiertos.
    'pendientes', v_grab || coalesce((
      select jsonb_agg(p) from jsonb_array_elements(v_ped) p
      where p->>'estado' in ('pendiente','cliente_dice_listo')), '[]'::jsonb),
    -- Lo ya entregado (para tacharlo con el tilde verde).
    'completados', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', p->>'titulo'))
      from jsonb_array_elements(v_ped) p
      where p->>'estado' in ('completo','validado')), '[]'::jsonb)
  );
end $$;

-- ── 3 · ACCESO A META ────────────────────────────────────────────────────────
create or replace function public.portal_cliente_meta()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.portal_cliente_client() is null then null else jsonb_build_object(
    'partnerId', coalesce((select value->>'meta_partner_id' from public.app_settings where key='portal_config'), ''),
    'whatsapp',  coalesce((select value->>'whatsapp_equipo' from public.app_settings where key='portal_config'), ''),
    'estado', coalesce((
      select case
          when pp.estado in ('completo','validado') then 'validado'
          else pp.estado end
      from public.portal_pedidos pp
      where pp.client_id = public.portal_cliente_client() and pp.tipo = 'acceso_meta' and pp.activo
      order by pp.pedido_at desc limit 1), 'sin_pedido')
  ) end;
$$;

-- ── 4 · DOCUMENTO (Ads / VSL de un funnel): guiones + comentarios + subidas ──
create or replace function public.portal_cliente_documento(p_strategy text, p_tipo text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_cid text; v_kind text; v_bucket text; v_name text;
  v_secs jsonb; v_ids text[]; v_coms jsonb; v_avatars jsonb; v_sub jsonb; v_next jsonb;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;
  select name into v_name from public.strategies where id = p_strategy and client_id = v_cid;
  if v_name is null then return null; end if;
  v_kind   := case when p_tipo = 'vsl' then 'vsl' else 'anuncios' end;
  v_bucket := case when p_tipo = 'vsl' then 'vsl_rec' else 'ad_rec' end;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ds.id, 'titulo', ds.title,
      'texto', coalesce(ds.text,''), 'html', coalesce(ds.html,''),
      'grabado', coalesce(gs.grabado, false),
      'avatar', coalesce(initcap((regexp_match(ds.title,'avatar\s*\d+','i'))[1]), '')
    ) order by coalesce(ds.orden_grabacion, ds.ord, 0), ds.title), '[]'::jsonb),
    coalesce(array_agg(ds.id), '{}')
    into v_secs, v_ids
  from public.del_sections ds
  left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = v_cid
  where ds.strategy_id = p_strategy and ds.kind = v_kind and ds.para_grabar;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', dc.id, 'sectionId', dc.section_id, 'body', dc.body, 'quote', dc.quote,
      'parentId', dc.parent_id, 'resolved', dc.resolved,
      'authorName', coalesce(dc.author_name, 'Alguien'),
      'isTeam', dc.author_id is not null,
      'isCliente', dc.portal_client_id is not null,
      'createdAt', dc.created_at
    ) order by dc.created_at), '[]'::jsonb) into v_coms
  from public.del_comments dc where dc.section_id = any(v_ids);

  -- Avatares del funnel (para elegir la carpeta de anuncios al subir).
  select coalesce(jsonb_agg(jsonb_build_object('id', a->>'id', 'name', a->>'name') order by a->>'name'), '[]'::jsonb)
    into v_avatars
  from (
    select distinct on (a->>'id') a
    from public.strategy_pages sp,
         jsonb_array_elements(case when jsonb_typeof(sp.avatars)='array' then sp.avatars else '[]'::jsonb end) a
    where sp.strategy_id = p_strategy and coalesce(a->>'id','') <> ''
  ) q;

  select jsonb_build_object(
    'count', (select count(*) from public.funnel_resources where strategy_id = p_strategy and bucket_key = v_bucket),
    'items', coalesce(jsonb_agg(jsonb_build_object('titulo', fr.title, 'fecha', to_char(fr.created_at,'DD/MM'))
              order by fr.created_at desc), '[]'::jsonb))
    into v_sub
  from (select title, created_at from public.funnel_resources
        where strategy_id = p_strategy and bucket_key = v_bucket
        order by created_at desc limit 12) fr;

  -- "SIGUIENTE": el otro documento del mismo funnel, o el primer documento del
  -- próximo funnel con guiones para grabar.
  if p_tipo <> 'vsl' and exists (select 1 from public.del_sections ds
      where ds.strategy_id = p_strategy and ds.kind = 'vsl' and ds.para_grabar) then
    v_next := jsonb_build_object('strategyId', p_strategy, 'tipo', 'vsl', 'label', 'VSL · ' || v_name);
  else
    select jsonb_build_object('strategyId', s.id, 'tipo',
             case when exists (select 1 from public.del_sections d2 where d2.strategy_id = s.id and d2.kind='anuncios' and d2.para_grabar)
                  then 'ads' else 'vsl' end,
             'label', s.name)
      into v_next
    from public.strategies s
    where s.client_id = v_cid and s.id <> p_strategy
      and exists (select 1 from public.del_sections d2 where d2.strategy_id = s.id and d2.para_grabar and d2.kind in ('vsl','anuncios'))
    order by s.position limit 1;
  end if;

  return jsonb_build_object(
    'funnel', jsonb_build_object('id', p_strategy, 'name', v_name),
    'tipo', case when p_tipo = 'vsl' then 'vsl' else 'ads' end,
    'bucket', v_bucket,
    'secciones', v_secs,
    'comentarios', v_coms,
    'avatars', v_avatars,
    'subidas', v_sub,
    'siguiente', v_next
  );
end $$;

-- ── 5 · COMENTAR (cliente logueado, sin token) ───────────────────────────────
create or replace function public.portal_cliente_comentar(
  p_section_id text, p_body text, p_quote text default null, p_parent_id text default null
) returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_cid text; v_name text; v_sec record; v_id text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null or btrim(coalesce(p_body,'')) = '' then return jsonb_build_object('ok', false); end if;
  select id, doc_id, strategy_id, title into v_sec
  from public.del_sections where id = p_section_id and client_id = v_cid;
  if v_sec.id is null then return jsonb_build_object('ok', false); end if;
  select name into v_name from public.clients where id = v_cid;

  v_id := 'dc_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.del_comments (id, section_id, doc_id, strategy_id, author_id, author_name, body, quote, parent_id, portal_client_id, resolved, created_at)
  values (v_id, p_section_id, v_sec.doc_id, v_sec.strategy_id, null, coalesce(v_name,'Cliente'),
          btrim(p_body), nullif(btrim(coalesce(p_quote,'')),''), nullif(p_parent_id,''), v_cid, false, now());

  -- Aviso por Slack UNA vez por ráfaga (si comentó hace <10 min, no repetimos).
  if not public._portal_evento_reciente(v_cid, 'comentario', 10) then
    perform public._portal_slack(v_cid, '💬 *'||coalesce(v_name,'Cliente')||'* comentó en “'||coalesce(v_sec.title,'un guion')||'”: '||left(btrim(p_body), 120));
  end if;
  insert into public.portal_eventos (client_id, tipo, payload)
  values (v_cid, 'comentario', jsonb_build_object('section_id', p_section_id, 'titulo', v_sec.title, 'body', left(btrim(p_body), 200)));

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ── 6 · EMBUDOS ──────────────────────────────────────────────────────────────
create or replace function public.portal_cliente_embudos()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name,
      'etapa', et.e,
      'progreso', round((et.e - 1) / 3.0 * 100)::int,
      'etiqueta', case
        when s.status = 'activa' or et.e = 4 then 'al_aire'
        when grab.pend then 'te_toca'
        else 'en_armado' end,
      'razon', case et.e
        when 1 then 'Estamos escribiendo tus guiones'
        when 2 then case when grab.pend then 'Esperando tus grabaciones' else 'Guiones listos' end
        when 3 then 'Estamos editando tus videos'
        else 'Publicado y corriendo' end,
      'grabPendiente', jsonb_build_object('pend', grab.pend, 'dias', grab.dias),
      'pagina', pag.url,
      'startDate', s.start_date
    ) order by case when s.status = 'activa' then 1 else 0 end, s.position)
    from public.strategies s
    left join lateral (select public._portal_etapa(s.id, s.status) e) et on true
    left join lateral (
      select (s.status is distinct from 'activa') and exists (
          select 1 from public.del_sections ds
          where ds.strategy_id = s.id and ds.para_grabar and ds.kind in ('vsl','anuncios')
            and not exists (select 1 from public.funnel_resources fr
                            where fr.strategy_id = s.id
                              and fr.bucket_key in (
                                case ds.kind when 'vsl' then 'vsl_rec' else 'ad_rec' end,
                                case ds.kind when 'vsl' then 'vsl_edit' else 'ad_edit' end))
        ) as pend,
        greatest(0, extract(day from now() - (
          select max(coalesce(ds.updated_at, ds.imported_at))
          from public.del_sections ds where ds.strategy_id = s.id and ds.para_grabar)))::int as dias
    ) grab on true
    left join lateral (
      select coalesce(nullif(sp.official_domain,''), nullif(sp.prod_url,'')) as url
      from public.strategy_pages sp
      where sp.strategy_id = s.id and (coalesce(sp.official_domain,'') <> '' or coalesce(sp.prod_url,'') <> '')
      limit 1
    ) pag on true
    where s.client_id = public.portal_cliente_client()
  ), '[]'::jsonb) end;
$$;

-- ── 7 · MATERIAL (todo lo del cliente en un lugar) ───────────────────────────
create or replace function public.portal_cliente_material()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_cid text; v_visto timestamptz;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;
  select pa.material_visto_at into v_visto
  from public.portal_access pa
  where pa.enabled and lower(pa.login_email) = lower(nullif(auth.jwt()->>'email',''))
  limit 1;

  return jsonb_build_object(
    -- Grabaciones por funnel y tipo: FALTA / SUBIDO.
    'grabaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'funnel', t.name, 'strategyId', t.sid, 'tipo', t.doc_tipo,
        'titulo', case t.doc_tipo when 'vsl' then 'VSL grabado' else 'Anuncios grabados' end,
        'subidos', t.n,
        'estado', case when t.n > 0 or t.ed > 0 then 'subido' else 'falta' end,
        'dias', t.dias, 'ultimo', t.ultimo
      ) order by t.pos, t.doc_tipo)
      from (
        select s.id sid, s.name, s.position pos, x.doc_tipo,
          (select count(*) from public.funnel_resources fr where fr.strategy_id = s.id and fr.bucket_key = x.bucket) n,
          (select count(*) from public.funnel_resources fr where fr.strategy_id = s.id and fr.bucket_key = x.bucket_edit) ed,
          (select fr.title from public.funnel_resources fr where fr.strategy_id = s.id and fr.bucket_key = x.bucket order by fr.created_at desc limit 1) ultimo,
          greatest(0, extract(day from now() - (select max(coalesce(ds.updated_at, ds.imported_at)) from public.del_sections ds
             where ds.strategy_id = s.id and ds.para_grabar and ds.kind = x.kind)))::int dias
        from public.strategies s
        cross join (values ('ads','anuncios','ad_rec','ad_edit'), ('vsl','vsl','vsl_rec','vsl_edit')) x(doc_tipo, kind, bucket, bucket_edit)
        where s.client_id = v_cid
          and (exists (select 1 from public.del_sections ds where ds.strategy_id = s.id and ds.para_grabar and ds.kind = x.kind)
            or exists (select 1 from public.funnel_resources fr where fr.strategy_id = s.id and fr.bucket_key = x.bucket))
      ) t), '[]'::jsonb),
    -- Materiales de marca (pedidos con carpeta): contador X de Y.
    'marca', coalesce((
      select jsonb_agg(p) from jsonb_array_elements(public._portal_pedidos_json(v_cid)) p
      where p->>'tipo' <> 'acceso_meta' and p->>'bucket' is not null), '[]'::jsonb),
    -- Accesos: el estado del pedido de Meta.
    'accesoMeta', coalesce((
      select case when pp.estado in ('completo','validado') then 'validado' else pp.estado end
      from public.portal_pedidos pp
      where pp.client_id = v_cid and pp.tipo = 'acceso_meta' and pp.activo
      order by pp.pedido_at desc limit 1), 'sin_pedido'),
    -- Lo que te devolvemos: ediciones publicadas al cliente, con badge NUEVO.
    'devoluciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'funnel', s.name, 'strategyId', s.id, 'count', d.n,
        'ultimo', to_char(d.ult, 'DD/MM'),
        'nuevo', d.ult > coalesce(v_visto, 'epoch'::timestamptz),
        'items', d.items
      ) order by d.ult desc)
      from (
        select fr.strategy_id, count(*) n, max(fr.created_at) ult,
          jsonb_agg(jsonb_build_object('titulo', fr.title, 'url', fr.public_url, 'kind', fr.kind)
            order by fr.created_at desc) items
        from public.funnel_resources fr
        where fr.client_id = v_cid and fr.bucket_key in ('vsl_edit','ad_edit')
          and coalesce(fr.visible_cliente, false)
        group by fr.strategy_id
      ) d join public.strategies s on s.id = d.strategy_id), '[]'::jsonb),
    -- Páginas al aire (las mismas de Embudos).
    'paginas', coalesce((
      select jsonb_agg(jsonb_build_object('funnel', s.name, 'url', u.url))
      from public.strategies s
      join lateral (
        select coalesce(nullif(sp.official_domain,''), nullif(sp.prod_url,'')) url
        from public.strategy_pages sp
        where sp.strategy_id = s.id and (coalesce(sp.official_domain,'') <> '' or coalesce(sp.prod_url,'') <> '')
        limit 1
      ) u on true
      where s.client_id = v_cid and s.status = 'activa'), '[]'::jsonb)
  );
end $$;

-- El front la llama al abrir Material (después de leer los "NUEVO").
create or replace function public.portal_cliente_material_visto()
returns jsonb language sql volatile security definer set search_path = public, pg_temp as $$
  update public.portal_access
     set material_visto_at = now()
   where enabled and lower(login_email) = lower(nullif(auth.jwt()->>'email',''));
  select jsonb_build_object('ok', true);
$$;

grant execute on function
  public.portal_cliente_inicio(),
  public.portal_cliente_meta(),
  public.portal_cliente_documento(text, text),
  public.portal_cliente_comentar(text, text, text, text),
  public.portal_cliente_embudos(),
  public.portal_cliente_material(),
  public.portal_cliente_material_visto()
to authenticated;
