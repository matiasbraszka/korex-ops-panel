-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v45_documento_existe_y_pendiente.sql
--
-- Una pestaña de VSL o anuncios puesta en "Revisar" o "Solo ver" quedaba
-- INALCANZABLE para el cliente.
--
-- La lista de secciones de `portal_cliente_documento` ya aceptaba esas dos
-- acciones (terminado + grabarse/revisar/solo_ver), pero la tarjeta que lleva al
-- documento — `docs.ads.existe` / `docs.vsl.existe` — se calculaba con
-- `para_grabar`, que solo se enciende con Grabarse + Terminado. Resultado: la
-- sección estaba adentro de un documento al que no había forma de entrar, salvo
-- que OTRA sección del mismo tipo estuviera marcada para grabar. Para `avatares`
-- y `estrategia` la comprobación ya era la correcta; solo VSL y anuncios estaban
-- mal.
--
-- De paso, `pendiente` pasa a contar en vez de mirar si existe UN archivo, igual
-- que `portal_cliente_embudos` desde v43: con dos guiones y un solo video subido,
-- el pendiente se apagaba de más.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- La regla de "¿esto lo ve el cliente?", en un solo lugar. Estaba escrita tres
-- veces con tres criterios distintos; de ahí venía el agujero.
create or replace function public._portal_seccion_visible(
  p_para_grabar boolean, p_estado text, p_accion text)
returns boolean
language sql immutable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(p_para_grabar, false)
      or (coalesce(p_estado, '') = 'terminado'
          and coalesce(p_accion, 'solo_equipo') in ('grabarse', 'revisar', 'solo_ver'));
$$;

create or replace function public.portal_cliente_documento(p_strategy text, p_tipo text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
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
      'accion', coalesce(ds.accion_cliente, case when ds.para_grabar then 'grabarse' else 'solo_ver' end),
      'avatar', coalesce(initcap((regexp_match(ds.title,'avatar\s*\d+','i'))[1]), '')
    ) order by coalesce(ds.orden_grabacion, ds.ord, 0), ds.title), '[]'::jsonb),
    coalesce(array_agg(ds.id), '{}')
    into v_secs, v_ids
  from public.del_sections ds
  left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = v_cid
  where ds.strategy_id = p_strategy and ds.kind = v_kind
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
    when 'avatar' then coalesce((select ds.title from public.del_sections ds
        where ds.strategy_id = p_strategy and ds.kind = 'avatares'
        order by ds.ord limit 1), 'Avatares')
    else 'Embudo ' || v_name end;

  -- `existe` = ¿hay algo que el cliente pueda abrir? Misma regla que la lista de
  -- secciones de arriba, si no la tarjeta no aparece y la pestaña queda muerta.
  -- `pendiente` = ¿le falta grabar? Eso sí sigue siendo cosa de `para_grabar`,
  -- pero contando: N guiones para grabar piden N archivos.
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
    'secciones', v_secs,
    'comentarios', v_coms,
    'avatars', coalesce(v_avatars, '[]'::jsonb),
    'subidas', coalesce(v_sub, jsonb_build_object('count', 0, 'items', '[]'::jsonb)),
    'siguiente', v_next,
    'docs', v_docs,
    'otros', v_otros
  );
end $function$;

commit;

notify pgrst, 'reload schema';
