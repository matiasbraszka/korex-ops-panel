-- ─────────────────────────────────────────────────────────────────────────────
-- PORTAL v17 — acción y estado por pestaña del DEL (pedido de Matías):
-- el tilde 🎬 "Para grabar" se reemplaza por dos desplegables en cada pestaña:
--   · accion_cliente: grabarse | revisar | solo_ver | solo_equipo
--   · estado_seccion: en_construccion | terminado
-- Regla: el cliente solo ve pestañas TERMINADAS y no "solo_equipo".
-- "Grabarse" + "Terminado" ⇒ para_grabar = true (compatibilidad: todas las RPCs
-- v9-v16 siguen leyendo para_grabar; el panel sincroniza los tres campos).
-- El filtro del documento incluye "OR para_grabar" por si algo viejo marcó solo
-- el booleano (curaciones por SQL): nada que hoy se ve deja de verse.
-- Aplicada a prod el 2026-07-25 vía MCP. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.del_sections add column if not exists accion_cliente text;
alter table public.del_sections add column if not exists estado_seccion text;

-- Backfill (solo filas sin valor, para poder re-correr sin pisar):
update public.del_sections set
  accion_cliente = case
    when para_grabar then 'grabarse'
    when kind in ('avatares','estrategia') then 'solo_ver'
    else 'solo_equipo' end
where accion_cliente is null;

update public.del_sections set
  estado_seccion = case
    when para_grabar or kind in ('avatares','estrategia') then 'terminado'
    else 'en_construccion' end
where estado_seccion is null;

-- Documento del portal: filtra por acción/estado (con red de para_grabar).
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
      'accion', coalesce(ds.accion_cliente, case when ds.para_grabar then 'grabarse' else 'solo_ver' end),
      'avatar', coalesce(initcap((regexp_match(ds.title,'avatar\s*\d+','i'))[1]), '')
    ) order by coalesce(ds.orden_grabacion, ds.ord, 0), ds.title), '[]'::jsonb),
    coalesce(array_agg(ds.id), '{}')
    into v_secs, v_ids
  from public.del_sections ds
  left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = v_cid
  where ds.strategy_id = p_strategy and ds.kind = v_kind
    and (
      ds.para_grabar
      or (coalesce(ds.estado_seccion,'') = 'terminado'
          and coalesce(ds.accion_cliente,'solo_equipo') in ('grabarse','revisar','solo_ver'))
    );

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
end $$;
