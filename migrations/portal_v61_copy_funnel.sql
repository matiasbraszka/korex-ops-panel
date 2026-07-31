-- ═════════════════════════════════════════════════════════════════════════════
-- portal_v61_copy_funnel.sql
--
-- "Revisar el copy del funnel": el cliente revisa el copy de las páginas del
-- embudo (Pre-landing, Landing, Formulario, Thank you) TODAS JUNTAS, como una
-- sola categoría, no una pestaña por página.
--
-- Reutiliza todo lo que ya existe (leer → comentar → aprobar / pedir cambios).
-- El único agregado es un nuevo "tipo de documento" = 'copy' que AGRUPA las 4
-- páginas, y una tarjeta agrupada en "Lo que te falta".
--
-- Ojo: aprobar una PÁGINA no la manda a grabación (una página no se graba). El
-- portal_cliente_toggle_revisado (v53) ya lo maneja bien: solo pasa a grabación
-- si el kind es vsl/anuncios; una página aprobada queda simplemente "revisada".
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── El documento: ahora entiende p_tipo = 'copy' (las 4 páginas juntas) ──────
create or replace function public.portal_cliente_documento(p_strategy text, p_tipo text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cid text; v_tipo text; v_kind text; v_kinds text[]; v_bucket text; v_name text; v_titulo text;
  v_solo_grabar boolean; v_hay_grabar boolean;
  v_secs jsonb; v_ids text[]; v_coms jsonb; v_avatars jsonb; v_sub jsonb; v_next jsonb;
  v_docs jsonb; v_otros jsonb;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;
  select name into v_name from public.strategies where id = p_strategy and client_id = v_cid;
  if v_name is null then return null; end if;

  v_tipo := case when p_tipo in ('vsl','avatar','estrategia','copy') then p_tipo else 'ads' end;
  v_kind := case v_tipo when 'ads' then 'anuncios' when 'vsl' then 'vsl'
                        when 'avatar' then 'avatares' when 'copy' then 'pg_landing'
                        else 'estrategia' end;
  -- 'copy' agrupa las 4 páginas del funnel (en orden real del embudo).
  v_kinds := case v_tipo
    when 'copy' then array['pg_prelanding','pg_landing','pg_formulario','pg_thankyou']
    else array[v_kind] end;
  v_solo_grabar := v_tipo in ('ads','vsl');
  v_bucket := case v_tipo when 'vsl' then 'vsl_rec' when 'ads' then 'ad_rec' else null end;

  v_hay_grabar := false;
  if v_solo_grabar then
    select exists (select 1 from public.del_sections d
                    where d.strategy_id = p_strategy and d.kind = v_kind and d.para_grabar)
      into v_hay_grabar;
  end if;

  -- Secciones visibles. Para 'copy' agrego `pagina` (nombre limpio) y `paginaNum`
  -- (1..4) para que el portal las muestre como páginas numeradas del embudo.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ds.id, 'titulo', ds.title,
      'texto', coalesce(ds.text,''), 'html', coalesce(ds.html,''),
      'grabado', coalesce(gs.grabado, false),
      'revisado', coalesce(gs.revisado, false),
      'accion', coalesce(ds.accion_cliente, case when ds.para_grabar then 'grabarse' else 'solo_ver' end),
      'kind', ds.kind,
      'pagina', case ds.kind
        when 'pg_prelanding' then 'Pre-landing' when 'pg_landing' then 'Landing'
        when 'pg_formulario' then 'Formulario' when 'pg_thankyou' then 'Thank you page' else null end,
      'paginaNum', case ds.kind
        when 'pg_prelanding' then 1 when 'pg_landing' then 2
        when 'pg_formulario' then 3 when 'pg_thankyou' then 4 else null end,
      'avatar', coalesce(initcap((regexp_match(ds.title,'avatar\s*\d+','i'))[1]), '')
    ) order by
      case ds.kind when 'pg_prelanding' then 1 when 'pg_landing' then 2
                   when 'pg_formulario' then 3 when 'pg_thankyou' then 4 else 5 end,
      coalesce(ds.orden_grabacion, ds.ord, 0), ds.title), '[]'::jsonb),
    coalesce(array_agg(ds.id), '{}')
    into v_secs, v_ids
  from public.del_sections ds
  left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = v_cid
  where ds.strategy_id = p_strategy and ds.kind = any(v_kinds)
    and public._portal_seccion_visible(ds.para_grabar, ds.estado_seccion, ds.accion_cliente);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', dc.id, 'sectionId', dc.section_id, 'body', dc.body, 'quote', dc.quote,
      'parentId', dc.parent_id, 'resolved', dc.resolved,
      'authorName', coalesce(dc.author_name, 'Alguien'),
      'isTeam', dc.author_id is not null,
      'isCliente', dc.portal_client_id is not null,
      'createdAt', dc.created_at
    ) order by dc.created_at), '[]'::jsonb) into v_coms
  from public.del_comments dc where dc.section_id = any(v_ids);

  v_titulo := case v_tipo
    when 'ads' then 'Anuncios — ' || v_name
    when 'vsl' then 'VSL — ' || v_name
    when 'copy' then 'Copy del funnel — ' || v_name
    when 'avatar' then coalesce((select ds.title from public.del_sections ds
        where ds.strategy_id = p_strategy and ds.kind = 'avatares'
        order by ds.ord limit 1), 'Avatares')
    else 'Embudo ' || v_name end;

  select jsonb_build_object(
    'ads', jsonb_build_object(
      'existe', exists (select 1 from public.del_sections d
                         where d.strategy_id = p_strategy and d.kind = 'anuncios'
                           and public._portal_seccion_visible(d.para_grabar, d.estado_seccion, d.accion_cliente)),
      'titulo', 'Anuncios',
      'pendiente', (select count(*) from public.del_sections d
                     where d.strategy_id = p_strategy and d.kind = 'anuncios' and d.para_grabar)
                 > (select count(*) from public.funnel_resources fr
                     where fr.strategy_id = p_strategy and fr.bucket_key in ('ad_rec','ad_edit')),
      'listo', exists (select 1 from public.funnel_resources fr where fr.strategy_id = p_strategy and fr.bucket_key in ('ad_rec','ad_edit'))),
    'vsl', jsonb_build_object(
      'existe', exists (select 1 from public.del_sections d
                         where d.strategy_id = p_strategy and d.kind = 'vsl'
                           and public._portal_seccion_visible(d.para_grabar, d.estado_seccion, d.accion_cliente)),
      'titulo', 'VSL',
      'pendiente', (select count(*) from public.del_sections d
                     where d.strategy_id = p_strategy and d.kind = 'vsl' and d.para_grabar)
                 > (select count(*) from public.funnel_resources fr
                     where fr.strategy_id = p_strategy and fr.bucket_key in ('vsl_rec','vsl_edit')),
      'listo', exists (select 1 from public.funnel_resources fr where fr.strategy_id = p_strategy and fr.bucket_key in ('vsl_rec','vsl_edit'))),
    'copy', jsonb_build_object(
      'existe', exists (select 1 from public.del_sections d
                         where d.strategy_id = p_strategy
                           and d.kind in ('pg_prelanding','pg_landing','pg_formulario','pg_thankyou')
                           and public._portal_seccion_visible(d.para_grabar, d.estado_seccion, d.accion_cliente)),
      'titulo', 'Copy del funnel',
      'pendiente', exists (select 1 from public.del_sections d
        left join public.portal_guion_status g on g.section_id = d.id and g.client_id = v_cid
        where d.strategy_id = p_strategy
          and d.kind in ('pg_prelanding','pg_landing','pg_formulario','pg_thankyou')
          and coalesce(d.estado_seccion,'') = 'terminado' and coalesce(d.accion_cliente,'') = 'revisar'
          and not coalesce(g.revisado, false))),
    'avatar', jsonb_build_object(
      'existe', exists (select 1 from public.del_sections d where d.strategy_id = p_strategy and d.kind='avatares'
        and (coalesce(d.accion_cliente,'solo_ver') <> 'solo_equipo' and coalesce(d.estado_seccion,'terminado') = 'terminado')),
      'titulo', coalesce((select ds.title from public.del_sections ds
          where ds.strategy_id = p_strategy and ds.kind='avatares' order by ds.ord limit 1), 'Avatares')),
    'estrategia', jsonb_build_object(
      'existe', exists (select 1 from public.del_sections d where d.strategy_id = p_strategy and d.kind='estrategia'
        and (coalesce(d.accion_cliente,'solo_ver') <> 'solo_equipo' and coalesce(d.estado_seccion,'terminado') = 'terminado')))
  ) into v_docs;

  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.position), '[]'::jsonb)
    into v_otros
  from public.strategies s
  where s.client_id = v_cid and s.id <> p_strategy
    and exists (select 1 from public.del_sections d where d.strategy_id = s.id and d.para_grabar and d.kind in ('vsl','anuncios'));

  if v_solo_grabar then
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
    'hayGrabar', v_hay_grabar,
    'secciones', v_secs,
    'comentarios', v_coms,
    'avatars', coalesce(v_avatars, '[]'::jsonb),
    'subidas', coalesce(v_sub, jsonb_build_object('count', 0, 'items', '[]'::jsonb)),
    'siguiente', v_next,
    'docs', v_docs,
    'otros', v_otros
  );
end $function$;

-- ── "Lo que te falta": una tarjeta AGRUPADA de copy por embudo ──────────────
-- Las 4 páginas del funnel entran como UN pendiente ('Revisar el copy del
-- funnel'), no cuatro. Se suma a las revisiones de anuncios/vsl/avatar/estrategia.
create or replace function public._portal_revisiones_json(p_client text)
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(item order by (item->>'dias')::int desc), '[]'::jsonb) from (
    -- (a) Revisiones "simples": un kind = un documento (anuncios/vsl/avatar/estrategia).
    select jsonb_build_object(
      'id', 'revision_' || t.strategy_id || '_' || t.doc_tipo,
      'tipo', 'revision',
      'titulo', t.titulo,
      'descripcion', 'Embudo ' || t.name || '. ' || case when t.n = 1
        then 'Léelo y márcalo como revisado. Si algo no encaja, selecciona el texto y déjanos un comentario.'
        else 'Son ' || t.n || '. Léelos y márcalos como revisados; si algo no encaja, selecciona el texto y déjanos un comentario.' end,
      'dias', greatest(0, extract(day from now() - t.desde))::int,
      'bloqueante', false, 'estado', 'pendiente',
      'strategyId', t.strategy_id, 'docTipo', t.doc_tipo,
      'funnel', t.name, 'funnelNum', public._portal_funnel_num(p_client, t.strategy_id),
      'pendientes', t.n, 'target', null, 'subidos', 0
    ) as item
    from (
      select s.id as strategy_id, s.name, x.doc_tipo,
             case x.doc_tipo when 'ads' then 'Revisa tus anuncios'
                             when 'vsl' then 'Revisa tu VSL'
                             when 'avatar' then 'Revisa tu avatar'
                             else 'Revisa la estrategia' end as titulo,
             count(*) as n,
             min(coalesce(ds.updated_at, ds.imported_at, now())) as desde
      from public.strategies s
      cross join (values ('ads','anuncios'), ('vsl','vsl'),
                         ('avatar','avatares'), ('estrategia','estrategia')) as x(doc_tipo, kind)
      join public.del_sections ds on ds.strategy_id = s.id and ds.kind = x.kind
      left join public.portal_guion_status gs
        on gs.section_id = ds.id and gs.client_id = p_client
      where s.client_id = p_client
        and coalesce(ds.estado_seccion, '') = 'terminado'
        and coalesce(ds.accion_cliente, '') = 'revisar'
        and not coalesce(ds.para_grabar, false)
        and not coalesce(gs.revisado, false)
      group by s.id, s.name, x.doc_tipo

      union all

      -- (b) Copy del funnel: las 4 páginas AGRUPADAS en un solo pendiente.
      select s.id as strategy_id, s.name, 'copy' as doc_tipo,
             'Revisar el copy del funnel' as titulo,
             count(*) as n,
             min(coalesce(ds.updated_at, ds.imported_at, now())) as desde
      from public.strategies s
      join public.del_sections ds on ds.strategy_id = s.id
        and ds.kind in ('pg_prelanding','pg_landing','pg_formulario','pg_thankyou')
      left join public.portal_guion_status gs
        on gs.section_id = ds.id and gs.client_id = p_client
      where s.client_id = p_client
        and coalesce(ds.estado_seccion, '') = 'terminado'
        and coalesce(ds.accion_cliente, '') = 'revisar'
        and not coalesce(gs.revisado, false)
      group by s.id, s.name
    ) t
  ) q;
$$;

commit;

notify pgrst, 'reload schema';
