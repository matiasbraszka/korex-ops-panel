-- ═════════════════════════════════════════════════════════════════════════════
-- portal_v69_embudo_tracks.sql — VSL/Anuncios/Landing divididos en sub-fases.
--
-- En vez de un solo segmento por pieza, cada pieza muestra su recorrido interno,
-- pintado por responsabilidad (verde=hecho · rojo=tu parte · gris=Korex):
--   VSL / Anuncios: Recursos → Guión → Revisión → Grabación → Edición
--   Landing:        Recursos → Copy → Revisión → Diseño
-- Estrategia y Avatares quedan como pasos simples. Un funnel LANZADO = todo verde.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- Helper: estado de una sub-fase según el índice actual del recorrido.
--   i < cur  → 'hecho' (verde) · i = cur → dueño ('cliente'/'korex') · i > cur → 'pendiente'
create or replace function public._portal_fase(p_label text, p_i int, p_cur int, p_owner text)
returns jsonb language sql immutable
as $$
  select jsonb_build_object('label', p_label, 'estado',
    case when p_i < p_cur then 'hecho' when p_i = p_cur then p_owner else 'pendiente' end);
$$;

create or replace function public.portal_cliente_embudo_tracks()
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with cid as (select public.portal_cliente_client() as v),
  sig as (
    select s.id as sid,
      (sp.status = 'activa') as lanzado,
      -- VSL
      (coalesce(sp.vsl_script,'') <> '' or exists(select 1 from public.del_sections d where d.strategy_id=s.id and d.kind='vsl')) as vsl_guion,
      exists(select 1 from public.funnel_resources fr where fr.strategy_id=s.id and fr.bucket_key='vsl_rec') as vsl_grab,
      (coalesce(sp.vsl_url,'') <> '' or exists(select 1 from public.funnel_resources fr where fr.strategy_id=s.id and fr.bucket_key='vsl_edit')) as vsl_edit,
      exists(select 1 from public.del_sections d left join public.portal_guion_status g on g.section_id=d.id and g.client_id=s.client_id
             where d.strategy_id=s.id and d.kind='vsl' and coalesce(d.estado_seccion,'')='terminado' and coalesce(d.accion_cliente,'')='revisar' and not coalesce(g.revisado,false)) as vsl_revp,
      exists(select 1 from public.del_sections d left join public.portal_guion_status g on g.section_id=d.id and g.client_id=s.client_id
             where d.strategy_id=s.id and d.kind='vsl' and d.para_grabar and not coalesce(g.grabado,false)) as vsl_grabp,
      -- Anuncios
      (exists(select 1 from public.del_sections d where d.strategy_id=s.id and d.kind='anuncios')
        or (select count(*) from jsonb_array_elements(coalesce(sp.avatars,'[]'::jsonb)) a where coalesce(a->>'ad_script','')<>'')>0) as ads_guion,
      (exists(select 1 from public.funnel_resources fr where fr.strategy_id=s.id and fr.bucket_key='ad_rec')
        or (select count(*) from jsonb_array_elements(coalesce(sp.avatars,'[]'::jsonb)) a where coalesce((a->>'rec_files')::int,0)>0)>0) as ads_grab,
      (exists(select 1 from public.funnel_resources fr where fr.strategy_id=s.id and fr.bucket_key='ad_edit')
        or (select count(*) from jsonb_array_elements(coalesce(sp.avatars,'[]'::jsonb)) a where coalesce((a->>'edit_files')::int,0)>0 or coalesce(a->>'ad_url','')<>'')>0) as ads_edit,
      exists(select 1 from public.del_sections d left join public.portal_guion_status g on g.section_id=d.id and g.client_id=s.client_id
             where d.strategy_id=s.id and d.kind='anuncios' and coalesce(d.estado_seccion,'')='terminado' and coalesce(d.accion_cliente,'')='revisar' and not coalesce(g.revisado,false)) as ads_revp,
      exists(select 1 from public.del_sections d left join public.portal_guion_status g on g.section_id=d.id and g.client_id=s.client_id
             where d.strategy_id=s.id and d.kind='anuncios' and d.para_grabar and not coalesce(g.grabado,false)) as ads_grabp,
      -- Landing
      exists(select 1 from public.del_sections d where d.strategy_id=s.id and d.kind='pg_landing') as land_copy,
      (coalesce(sp.prod_url,'') <> '' or coalesce(sp.official_domain,'') <> '') as land_pub,
      exists(select 1 from public.del_sections d left join public.portal_guion_status g on g.section_id=d.id and g.client_id=s.client_id
             where d.strategy_id=s.id and d.kind in ('pg_prelanding','pg_landing','pg_formulario','pg_thankyou')
               and coalesce(d.estado_seccion,'')='terminado' and coalesce(d.accion_cliente,'')='revisar' and not coalesce(g.revisado,false)) as land_revp,
      -- Estrategia / Avatares (de strategy_pages)
      (sp.tipo is not null) as estr_done,
      ((select count(*) from jsonb_array_elements(coalesce(sp.avatars,'[]'::jsonb)) a where coalesce(a->>'spec_text','')<>'')>0) as avat_done,
      -- Recursos/material pendiente del funnel
      exists(select 1 from public.portal_pedidos pp
             left join lateral (select count(*) n from public.funnel_resources fr
               where fr.client_id=s.client_id and pp.bucket_key is not null and fr.bucket_key=pp.bucket_key and fr.strategy_id=pp.strategy_id) cnt on true
             where pp.client_id=s.client_id and pp.activo and pp.strategy_id=s.id and pp.estado not in ('completo','validado')
               and not (pp.target_count is not null and coalesce(cnt.n,0)>=pp.target_count)
               and not (pp.bucket_key is not null and pp.target_count is null and coalesce(cnt.n,0)>0)) as mat_pend
    from public.strategies s
    join public.strategy_pages sp on sp.strategy_id = s.id
    where s.client_id = (select v from cid)
  ),
  -- El paso ACTUAL de cada pieza = la primera sub-fase con trabajo PENDIENTE
  -- (no la más avanzada). Ej: si faltan grabaciones aunque ya haya editados,
  -- la pieza queda trabada en Grabación (rojo).
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
$$;

grant execute on function public._portal_fase(text, int, int, text) to authenticated, service_role;
grant execute on function public.portal_cliente_embudo_tracks() to authenticated;

commit;

notify pgrst, 'reload schema';
