-- migrations/portal_v93_auditorias.sql
--
-- Las AUDITORÍAS del DEL, en la plataforma del cliente.
--
-- Complementa del_v8_auditorias.sql, que creó la tabla y el encabezado. Acá se abre
-- el camino para que el cliente las lea: un tipo de documento más ('auditoria'),
-- junto a anuncios, VSL, avatares, estrategia y copy.
--
-- Dos diferencias con los otros documentos, las dos a propósito:
--
--   · La VISIBILIDAD sale de del_auditorias.visible_cliente y NO de la regla de
--     siempre (_portal_seccion_visible, o sea terminado + acción distinta de "solo
--     equipo"). Una auditoría no tiene circuito de aprobación: se publica o no. Un
--     solo interruptor, en un solo lugar.
--
--   · El EQUIPO viaja resuelto: nombre, foto, iniciales y color de cada persona que
--     la hizo. El portal no puede leer team_members (y no debería), así que la
--     función —que es SECURITY DEFINER— arma el dato acá. Solo salen esos cinco
--     campos: ni mail, ni teléfono, ni sueldo.
--
-- Se ordenan por fecha de auditoría, la más nueva primero: al cliente le importa la
-- última conclusión, no la primera.
--
-- OJO: portal_cliente_documento no está entera en ningún .sql del repo — se editó en
-- vivo varias veces. Esta definición parte de pg_get_functiondef de la versión que
-- estaba corriendo (portal_v91 + los cambios de arriba), no del último .sql.

CREATE OR REPLACE FUNCTION public.portal_cliente_documento(p_strategy text, p_tipo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cid text; v_tipo text; v_kind text; v_kinds text[]; v_bucket text; v_name text; v_titulo text;
  v_solo_grabar boolean; v_hay_grabar boolean;
  v_secs jsonb; v_ids text[]; v_coms jsonb; v_avatars jsonb; v_sub jsonb; v_next jsonb;
  v_docs jsonb; v_otros jsonb;
  v_funnel text; v_strat text; v_doc text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;
  select sp.id, sp.strategy_id, sp.del_doc_id, sp.name
    into v_funnel, v_strat, v_doc, v_name
    from public._portal_sp_visibles() sp
   where sp.client_id = v_cid and (sp.id = p_strategy or sp.id = v_funnel)
   order by (sp.id = p_strategy) desc, sp.position nulls last, sp.id
   limit 1;
  if v_funnel is null then
    -- Carpeta sin ningun funnel (caso raro: carpeta de Drive huerfana).
    select name into v_name from public.strategies where id = p_strategy and client_id = v_cid;
    if v_name is null then return null; end if;
    v_strat := p_strategy;
  end if;

  v_tipo := case when p_tipo in ('vsl','avatar','estrategia','copy','auditoria') then p_tipo else 'ads' end;
  v_kind := case v_tipo when 'ads' then 'anuncios' when 'vsl' then 'vsl'
                        when 'avatar' then 'avatares' when 'copy' then 'pg_landing'
                        when 'auditoria' then 'auditoria'
                        else 'estrategia' end;
  -- 'copy' agrupa las 4 páginas del funnel (en orden real del embudo).
  v_kinds := case v_tipo
    when 'copy' then array['pg_prelanding','pg_landing','pg_formulario','pg_thankyou']
    else array[v_kind] end;
  v_solo_grabar := v_tipo in ('ads','vsl');
  v_bucket := case v_tipo when 'vsl' then 'vsl_rec' when 'ads' then 'ad_rec' else null end;

  v_hay_grabar := false;
  if v_solo_grabar then
    select exists (select 1 from public._portal_ds_visibles() d
                    where d.doc_id = v_doc and d.kind = v_kind and d.para_grabar)
      into v_hay_grabar;
  end if;

  -- Secciones visibles. Para 'copy' agrego `pagina` (nombre limpio) y `paginaNum`
  -- (1..4) para que el portal las muestre como páginas numeradas del embudo.
  -- Para 'auditoria' agrego la ficha entera (fecha, período, alcance, equipo).
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ds.id, 'titulo', ds.title,
      'texto', coalesce(ds.text,''), 'html', coalesce(ds.html,''),
      'grabado', coalesce(gs.grabado, false),
      'revisado', coalesce(gs.revisado, false),
      'accion', coalesce(ds.accion_cliente, case when ds.para_grabar then 'grabarse' else 'solo_ver' end),
      'kind', ds.kind,
      'pagina', case ds.kind
        when 'pg_prelanding' then 'Pre-landing' when 'pg_landing' then 'Landing VSL'
        when 'pg_formulario' then 'Formulario' when 'pg_thankyou' then 'Thank you page' else null end,
      'paginaNum', case ds.kind
        when 'pg_prelanding' then 1 when 'pg_landing' then 2
        when 'pg_formulario' then 3 when 'pg_thankyou' then 4 else null end,
      'auditoria', aud.ficha,
      'avatar', coalesce(initcap((regexp_match(ds.title,'avatar\s*\d+','i'))[1]), '')
    ) order by
      -- Las auditorías, la más reciente arriba. Para el resto esto es null en todas
      -- las filas y no cambia nada.
      aud.fecha desc nulls last,
      case ds.kind when 'pg_prelanding' then 1 when 'pg_landing' then 2
                   when 'pg_formulario' then 3 when 'pg_thankyou' then 4 else 5 end,
      coalesce(ds.orden_grabacion, ds.ord, 0), ds.title), '[]'::jsonb),
    coalesce(array_agg(ds.id), '{}')
    into v_secs, v_ids
  from public._portal_ds_visibles() ds
  left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = v_cid
  left join lateral (
    select a.fecha,
           jsonb_build_object(
             'fecha', a.fecha, 'desde', a.desde, 'hasta', a.hasta, 'alcance', a.alcance,
             'equipo', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'nombre', tm.name, 'foto', tm.avatar_url,
                        'iniciales', tm.initials, 'color', tm.color, 'rol', tm.role)
                      order by e.i)
                 from unnest(a.equipo) with ordinality as e(mid, i)
                 join public.team_members tm on tm.id = e.mid), '[]'::jsonb)
           ) as ficha
      from public.del_auditorias a
     where a.section_id = ds.id
  ) aud on true
  where ds.doc_id = v_doc and ds.kind = any(v_kinds)
    and (case when v_tipo = 'auditoria'
              -- Una auditoría se ve solo si el equipo la publicó a propósito.
              then exists (select 1 from public.del_auditorias a2
                            where a2.section_id = ds.id and a2.visible_cliente)
              else public._portal_seccion_visible(ds.para_grabar, ds.estado_seccion, ds.accion_cliente)
         end);

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
    when 'auditoria' then 'Auditorías — ' || v_name
    when 'avatar' then coalesce((select ds.title from public._portal_ds_visibles() ds
        where ds.doc_id = v_doc and ds.kind = 'avatares'
        order by ds.ord limit 1), 'Avatares')
    else 'Embudo ' || v_name end;

  select jsonb_build_object(
    'ads', jsonb_build_object(
      'existe', exists (select 1 from public._portal_ds_visibles() d
                         where d.doc_id = v_doc and d.kind = 'anuncios'
                           and public._portal_seccion_visible(d.para_grabar, d.estado_seccion, d.accion_cliente)),
      'titulo', 'Anuncios',
      'pendiente', (select count(*) from public._portal_ds_visibles() d
                     where d.doc_id = v_doc and d.kind = 'anuncios' and d.para_grabar)
                 > (select count(*) from public.funnel_resources fr
                     where fr.strategy_id = v_strat and fr.bucket_key in ('ad_rec','ad_edit')),
      'listo', exists (select 1 from public.funnel_resources fr where fr.strategy_id = v_strat and fr.bucket_key in ('ad_rec','ad_edit'))),
    'vsl', jsonb_build_object(
      'existe', exists (select 1 from public._portal_ds_visibles() d
                         where d.doc_id = v_doc and d.kind = 'vsl'
                           and public._portal_seccion_visible(d.para_grabar, d.estado_seccion, d.accion_cliente)),
      'titulo', 'VSL',
      'pendiente', (select count(*) from public._portal_ds_visibles() d
                     where d.doc_id = v_doc and d.kind = 'vsl' and d.para_grabar)
                 > (select count(*) from public.funnel_resources fr
                     where fr.strategy_id = v_strat and fr.bucket_key in ('vsl_rec','vsl_edit')),
      'listo', exists (select 1 from public.funnel_resources fr where fr.strategy_id = v_strat and fr.bucket_key in ('vsl_rec','vsl_edit'))),
    'copy', jsonb_build_object(
      'existe', exists (select 1 from public._portal_ds_visibles() d
                         where d.doc_id = v_doc
                           and d.kind in ('pg_prelanding','pg_landing','pg_formulario','pg_thankyou')
                           and public._portal_seccion_visible(d.para_grabar, d.estado_seccion, d.accion_cliente)),
      'titulo', 'Copy del funnel',
      'pendiente', exists (select 1 from public._portal_ds_visibles() d
        left join public.portal_guion_status g on g.section_id = d.id and g.client_id = v_cid
        where d.doc_id = v_doc
          and d.kind in ('pg_prelanding','pg_landing','pg_formulario','pg_thankyou')
          and coalesce(d.estado_seccion,'') = 'terminado' and coalesce(d.accion_cliente,'') = 'revisar'
          and not coalesce(g.revisado, false))),
    'auditoria', jsonb_build_object(
      'existe', exists (select 1 from public._portal_ds_visibles() d
                          join public.del_auditorias a on a.section_id = d.id
                         where d.doc_id = v_doc and d.kind = 'auditoria' and a.visible_cliente),
      'titulo', 'Auditorías',
      'n', (select count(*) from public._portal_ds_visibles() d
              join public.del_auditorias a on a.section_id = d.id
             where d.doc_id = v_doc and d.kind = 'auditoria' and a.visible_cliente)),
    'avatar', jsonb_build_object(
      'existe', exists (select 1 from public._portal_ds_visibles() d where d.doc_id = v_doc and d.kind='avatares'
        and (coalesce(d.accion_cliente,'solo_ver') <> 'solo_equipo' and coalesce(d.estado_seccion,'terminado') = 'terminado')),
      'titulo', coalesce((select ds.title from public._portal_ds_visibles() ds
          where ds.doc_id = v_doc and ds.kind='avatares' order by ds.ord limit 1), 'Avatares')),
    'estrategia', jsonb_build_object(
      'existe', exists (select 1 from public._portal_ds_visibles() d where d.doc_id = v_doc and d.kind='estrategia'
        and (coalesce(d.accion_cliente,'solo_ver') <> 'solo_equipo' and coalesce(d.estado_seccion,'terminado') = 'terminado')))
  ) into v_docs;

  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.position), '[]'::jsonb)
    into v_otros
  from public._portal_sp_visibles() s
  where s.client_id = v_cid and s.id is distinct from v_funnel
    and exists (select 1 from public._portal_ds_visibles() d
                 where d.doc_id = s.del_doc_id and d.para_grabar and d.kind in ('vsl','anuncios'));

  if v_solo_grabar then
    select coalesce(jsonb_agg(jsonb_build_object('id', a->>'id', 'name', a->>'name') order by a->>'name'), '[]'::jsonb)
      into v_avatars
    from (
      select distinct on (a->>'id') a
      from public._portal_sp_visibles() sp,
           jsonb_array_elements(case when jsonb_typeof(sp.avatars)='array' then sp.avatars else '[]'::jsonb end) a
      where sp.id = v_funnel and coalesce(a->>'id','') <> ''
    ) q;

    select jsonb_build_object(
      'count', (select count(*) from public.funnel_resources where strategy_id = v_strat and bucket_key = v_bucket),
      'items', coalesce(jsonb_agg(jsonb_build_object('titulo', fr.title, 'fecha', to_char(fr.created_at,'DD/MM'))
                order by fr.created_at desc), '[]'::jsonb))
      into v_sub
    from (select title, created_at from public.funnel_resources
          where strategy_id = v_strat and bucket_key = v_bucket
          order by created_at desc limit 12) fr;

    if v_tipo = 'ads' and exists (select 1 from public._portal_ds_visibles() ds
        where ds.doc_id = v_doc and ds.kind = 'vsl' and ds.para_grabar) then
      v_next := jsonb_build_object('strategyId', coalesce(v_funnel, p_strategy), 'tipo', 'vsl', 'label', 'VSL · ' || v_name);
    else
      select jsonb_build_object('strategyId', s.id, 'tipo',
               case when exists (select 1 from public._portal_ds_visibles() d2 where d2.doc_id = s.del_doc_id and d2.kind='anuncios' and d2.para_grabar)
                    then 'ads' else 'vsl' end,
               'label', s.name)
        into v_next
      from public._portal_sp_visibles() s
      where s.client_id = v_cid and s.id is distinct from v_funnel
        and exists (select 1 from public._portal_ds_visibles() d2 where d2.doc_id = s.del_doc_id and d2.para_grabar and d2.kind in ('vsl','anuncios'))
      order by s.position nulls last, s.id limit 1;
    end if;
  end if;

  return jsonb_build_object(
    'funnel', jsonb_build_object('id', coalesce(v_funnel, p_strategy), 'name', v_name),
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

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
-- Los otros cinco tipos tienen que devolver EXACTAMENTE lo mismo que antes: el
-- único agregado es la clave 'auditoria' en docs y 'auditoria' (null) en cada
-- sección. Se comprueba comparando contra la definición anterior sobre los funnels
-- reales, con la sesión de un cliente simulada.
--
-- ROLLBACK: volver a aplicar la definición previa (portal_v91_embudo_corto.sql +
-- la edición en vivo), que quedó guardada antes de correr esto.
