-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v46_revisar_guiones.sql
--
-- "Revisar" estaba a medias: una pestaña marcada así se guardaba bien y el
-- cliente podía comentarla, pero nada se lo decía. No aparecía en la Home, no se
-- distinguía de un guion a grabar dentro del documento, y no había forma de
-- saber si la había leído.
--
-- Se completa el circuito con tres piezas:
--   1. `portal_guion_status.revisado` — el gemelo de `grabado`, que ya existía.
--   2. `portal_cliente_toggle_revisado` — el botón "Revisado" debajo del guion,
--      con su aviso a #notificaciones-clientes.
--   3. `_portal_revisiones_json` — lo pendiente de revisar entra a "Lo que te
--      falta" de la Home, como una petición más.
--
-- Solo cuenta `accion_cliente = 'revisar'`. "Solo ver" es exactamente eso: mirar,
-- sin nada que devolver.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.portal_guion_status
  add column if not exists revisado    boolean not null default false,
  add column if not exists revisado_at timestamptz;

-- ── El botón "Revisado" ─────────────────────────────────────────────────────
create or replace function public.portal_cliente_toggle_revisado(p_section_id text, p_revisado boolean)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_cid text; v_sec record; v_emb text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok', false); end if;
  select title, strategy_id into v_sec
    from public.del_sections where id = p_section_id and client_id = v_cid;
  if v_sec.title is null then return jsonb_build_object('ok', false); end if;

  insert into public.portal_guion_status(client_id, section_id, revisado, revisado_at, updated_at)
  values (v_cid, p_section_id, coalesce(p_revisado, false),
          case when p_revisado then now() end, now())
  on conflict (client_id, section_id) do update
    set revisado = excluded.revisado, revisado_at = excluded.revisado_at, updated_at = now();

  if coalesce(p_revisado, false) then
    v_emb := public._portal_embudo_nombre(v_sec.strategy_id);
    perform public._portal_slack(v_cid,
      public._portal_aviso_cab(v_cid) || ' · 👀 marcó como revisado *' || v_sec.title || '*'
      || coalesce(' · embudo ' || v_emb, ''));
    insert into public.portal_eventos (client_id, tipo, payload)
    values (v_cid, 'guion_revisado', jsonb_build_object(
            'section_id', p_section_id, 'titulo', v_sec.title, 'embudo', v_emb));
  end if;

  return jsonb_build_object('ok', true, 'revisado', coalesce(p_revisado, false));
end $$;

revoke all   on function public.portal_cliente_toggle_revisado(text, boolean) from public, anon;
grant execute on function public.portal_cliente_toggle_revisado(text, boolean) to authenticated;

-- ── Lo que le falta revisar, para la Home ───────────────────────────────────
-- Mismo formato que `_portal_grabaciones_json`: la Home ya sabe dibujar estas
-- tarjetas, así que entran sin tocar el layout.
create or replace function public._portal_revisiones_json(p_client text)
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(item order by (item->>'dias')::int desc), '[]'::jsonb) from (
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
    ) t
  ) q;
$$;

-- ── La Home suma lo pendiente de revisar ────────────────────────────────────
create or replace function public.portal_cliente_inicio()
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cid text; v_name text; v_prog int; v_done boolean; v_ped jsonb; v_grab jsonb; v_wa text;
  v_rev jsonb; v_run record; v_onb jsonb; p record;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;
  select name into v_name from public.clients where id = v_cid;

  select coalesce(round(avg((e-1)/3.0)*100)::int, 0), coalesce(bool_and(e = 4), false) and count(*) > 0
    into v_prog, v_done
  from (select public._portal_etapa(s.id, s.status) e from public.strategies s where s.client_id = v_cid) q;

  v_ped  := public._portal_pedidos_json(v_cid);
  v_grab := public._portal_grabaciones_json(v_cid);
  v_rev  := public._portal_revisiones_json(v_cid);
  select value->>'whatsapp_equipo' into v_wa from public.app_settings where key = 'portal_config';

  select * into v_run from public.onboarding_runs
   where client_id = v_cid and estado <> 'archivado' limit 1;

  if v_run.id is null then
    v_onb := jsonb_build_object('existe', false, 'completo', true);
  else
    select * into p from public.onboarding_progreso(v_run.id);
    v_onb := jsonb_build_object(
      'existe', true,
      'completo', v_run.estado = 'completado',
      'estado', v_run.estado,
      'pct', p.progreso,
      'requeridas', p.requeridas,
      'respondidas', p.respondidas,
      'agendaEstado', v_run.agenda_estado,
      'agendaAt', v_run.agenda_at,
      'bloques', p.bloques,
      'desbloqueadas', coalesce((
        select jsonb_agg(distinct r)
          from jsonb_array_elements(p.bloques) b,
               jsonb_array_elements_text(b->'desbloquea') r
         where (b->>'total')::int > 0
           and (b->>'hechas')::int >= (b->>'total')::int
      ), '[]'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'name', v_name,
    'progreso', case when v_done then 100 else v_prog end,
    'todosTerminados', v_done,
    'whatsapp', coalesce(v_wa, ''),
    'onboarding', v_onb,
    -- Revisar va primero: es rápido y desbloquea lo que sigue.
    'pendientes', v_rev || v_grab || coalesce((
      select jsonb_agg(p2) from jsonb_array_elements(v_ped) p2
      where p2->>'estado' in ('pendiente','cliente_dice_listo')), '[]'::jsonb),
    'completados', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', p2->>'titulo'))
      from jsonb_array_elements(v_ped) p2
      where p2->>'estado' in ('completo','validado')), '[]'::jsonb)
  );
end $$;

-- ── El documento: quién está revisado y si hay algo que grabar ──────────────
-- `revisado` por sección (para pintar el botón) y `hayGrabar` a nivel documento:
-- sin eso el portal mostraba el cargador de "subí tus grabaciones" al pie de un
-- documento que era solo de lectura.
create or replace function public.portal_cliente_documento(p_strategy text, p_tipo text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cid text; v_tipo text; v_kind text; v_bucket text; v_name text; v_titulo text;
  v_solo_grabar boolean; v_hay_grabar boolean;
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

  select exists (select 1 from public.del_sections d
                  where d.strategy_id = p_strategy and d.kind = v_kind and d.para_grabar)
    into v_hay_grabar;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ds.id, 'titulo', ds.title,
      'texto', coalesce(ds.text,''), 'html', coalesce(ds.html,''),
      'grabado', coalesce(gs.grabado, false),
      'revisado', coalesce(gs.revisado, false),
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

commit;

notify pgrst, 'reload schema';
