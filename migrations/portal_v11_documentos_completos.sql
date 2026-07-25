-- ─────────────────────────────────────────────────────────────────────────────
-- PORTAL v11 — fidelidad total al prototipo "Portal Korex":
--   1) portal_cliente_documento acepta 4 tipos de documento:
--        ads (anuncios para_grabar) · vsl (vsl para_grabar) ·
--        avatar (kind 'avatares', solo lectura) · estrategia (kind 'estrategia').
--      Además devuelve `titulo`, `docs` (para el cajón ☰ del documento) y
--      `otros` (los demás embudos con guiones).
--   2) portal_cliente_material: las devoluciones llevan bucket y fecha por item
--      (la pantalla "Lo que editamos" separa Anuncios de VSL y muestra la fecha).
-- Aplicada a prod el 2026-07-24 vía MCP. Idempotente (create or replace).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.portal_cliente_documento(p_strategy text, p_tipo text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_cid text; v_tipo text; v_kind text; v_bucket text; v_name text; v_titulo text;
  v_solo_grabar boolean;
  v_secs jsonb; v_ids text[]; v_coms jsonb; v_avatars jsonb; v_sub jsonb; v_next jsonb;
  v_docs jsonb; v_otros jsonb;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;
  select name into v_name from public.strategies where id = p_strategy and client_id = v_cid;
  if v_name is null then return null; end if;

  v_tipo := case when p_tipo in ('vsl','avatar','estrategia') then p_tipo else 'ads' end;
  v_kind := case v_tipo when 'ads' then 'anuncios' when 'vsl' then 'vsl'
                        when 'avatar' then 'avatares' else 'estrategia' end;
  v_solo_grabar := v_tipo in ('ads','vsl');
  v_bucket := case v_tipo when 'vsl' then 'vsl_rec' when 'ads' then 'ad_rec' else null end;

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
  where ds.strategy_id = p_strategy and ds.kind = v_kind
    and (not v_solo_grabar or ds.para_grabar);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', dc.id, 'sectionId', dc.section_id, 'body', dc.body, 'quote', dc.quote,
      'parentId', dc.parent_id, 'resolved', dc.resolved,
      'authorName', coalesce(dc.author_name, 'Alguien'),
      'isTeam', dc.author_id is not null,
      'isCliente', dc.portal_client_id is not null,
      'createdAt', dc.created_at
    ) order by dc.created_at), '[]'::jsonb) into v_coms
  from public.del_comments dc where dc.section_id = any(v_ids);

  -- Título del documento (el header del prototipo).
  v_titulo := case v_tipo
    when 'ads' then 'Anuncios — ' || v_name
    when 'vsl' then 'VSL — ' || v_name
    when 'avatar' then coalesce((select ds.title from public.del_sections ds
        where ds.strategy_id = p_strategy and ds.kind = 'avatares'
        order by ds.ord limit 1), 'Avatares')
    else 'Embudo ' || v_name end;

  -- El cajón ☰: qué documentos tiene este embudo y en qué estado.
  select jsonb_build_object(
    'ads', jsonb_build_object(
      'existe', exists (select 1 from public.del_sections d where d.strategy_id = p_strategy and d.kind='anuncios' and d.para_grabar),
      'titulo', 'Anuncios',
      'pendiente', exists (select 1 from public.del_sections d where d.strategy_id = p_strategy and d.kind='anuncios' and d.para_grabar)
        and not exists (select 1 from public.funnel_resources fr where fr.strategy_id = p_strategy and fr.bucket_key in ('ad_rec','ad_edit')),
      'listo', exists (select 1 from public.funnel_resources fr where fr.strategy_id = p_strategy and fr.bucket_key in ('ad_rec','ad_edit'))),
    'vsl', jsonb_build_object(
      'existe', exists (select 1 from public.del_sections d where d.strategy_id = p_strategy and d.kind='vsl' and d.para_grabar),
      'titulo', 'VSL',
      'pendiente', exists (select 1 from public.del_sections d where d.strategy_id = p_strategy and d.kind='vsl' and d.para_grabar)
        and not exists (select 1 from public.funnel_resources fr where fr.strategy_id = p_strategy and fr.bucket_key in ('vsl_rec','vsl_edit')),
      'listo', exists (select 1 from public.funnel_resources fr where fr.strategy_id = p_strategy and fr.bucket_key in ('vsl_rec','vsl_edit'))),
    'avatar', jsonb_build_object(
      'existe', exists (select 1 from public.del_sections d where d.strategy_id = p_strategy and d.kind='avatares'),
      'titulo', coalesce((select ds.title from public.del_sections ds
          where ds.strategy_id = p_strategy and ds.kind='avatares' order by ds.ord limit 1), 'Avatares')),
    'estrategia', jsonb_build_object(
      'existe', exists (select 1 from public.del_sections d where d.strategy_id = p_strategy and d.kind='estrategia'))
  ) into v_docs;

  -- Otros embudos del cliente con guiones para grabar.
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.position), '[]'::jsonb)
    into v_otros
  from public.strategies s
  where s.client_id = v_cid and s.id <> p_strategy
    and exists (select 1 from public.del_sections d where d.strategy_id = s.id and d.para_grabar and d.kind in ('vsl','anuncios'));

  if v_solo_grabar then
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

    -- "SIGUIENTE": el otro documento del mismo funnel, o el primero del próximo.
    if v_tipo = 'ads' and exists (select 1 from public.del_sections ds
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
  end if;

  return jsonb_build_object(
    'funnel', jsonb_build_object('id', p_strategy, 'name', v_name),
    'tipo', v_tipo,
    'titulo', v_titulo,
    'bucket', v_bucket,
    'secciones', v_secs,
    'comentarios', v_coms,
    'avatars', coalesce(v_avatars, '[]'::jsonb),
    'subidas', coalesce(v_sub, jsonb_build_object('count', 0, 'items', '[]'::jsonb)),
    'siguiente', v_next,
    'docs', v_docs,
    'otros', v_otros
  );
end $$;

-- ── Material: devoluciones con bucket + fecha por item ───────────────────────
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
    'marca', coalesce((
      select jsonb_agg(p) from jsonb_array_elements(public._portal_pedidos_json(v_cid)) p
      where p->>'tipo' <> 'acceso_meta' and p->>'bucket' is not null), '[]'::jsonb),
    'accesoMeta', coalesce((
      select case when pp.estado in ('completo','validado') then 'validado' else pp.estado end
      from public.portal_pedidos pp
      where pp.client_id = v_cid and pp.tipo = 'acceso_meta' and pp.activo
      order by pp.pedido_at desc limit 1), 'sin_pedido'),
    'devoluciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'funnel', s.name, 'strategyId', s.id, 'count', d.n,
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
      ) d join public.strategies s on s.id = d.strategy_id), '[]'::jsonb),
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
