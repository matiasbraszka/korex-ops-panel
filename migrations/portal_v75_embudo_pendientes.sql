-- ═════════════════════════════════════════════════════════════════════════════
-- portal_v75_embudo_pendientes.sql
--
-- La zona ROJA de cada embudo pasa a ser la LISTA de todo lo que falta DE PARTE
-- DEL CLIENTE (grabar anuncios, grabar VSL, revisar copy, enviar testimonios/fotos…).
-- El front la muestra como lista y, al tocarla, lleva al Inicio (donde se le pide).
--
-- portal_cliente_embudos ahora devuelve, por funnel, `pendientes`: array de
-- {tipo, label}. Un embudo 'antiguo' (Completo) no tiene pendientes.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.portal_cliente_embudos()
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.sid, 'name', f.name,
      'etapa', et.e,
      'progreso', coalesce(av.pct, round((et.e - 1) / 3.0 * 100)::int),
      'activo', (f.status = 'activa'),
      'etiqueta', case
        when f.status = 'antiguo' then 'completo'
        when f.status = 'activa' then 'activo'
        when coalesce(av.pend, false) then 'te_toca'
        when et.e = 4 then 'al_aire'
        else 'en_armado' end,
      'razon', case
        when coalesce(av.grab_pend, false) then 'Esperando aprobar tus grabaciones'
        when coalesce(av.rev_pend, false)  then 'Tienes contenido para revisar'
        when coalesce(av.mat_pend, false)  then 'Falta que subas el material'
        when f.status = 'antiguo' then 'Este embudo ya está terminado'
        else case et.e
          when 1 then 'Estamos escribiendo tus guiones'
          when 2 then case when grab.pend then 'Esperando tus grabaciones' else 'Guiones listos' end
          when 3 then 'Estamos editando tus videos'
          else 'Publicado y corriendo' end end,
      -- Lista de TODO lo que falta de parte del cliente en este embudo (para la zona roja).
      'pendientes', case when f.status = 'antiguo' then '[]'::jsonb else coalesce(pen.items, '[]'::jsonb) end,
      'grabPendiente', jsonb_build_object('pend', coalesce(av.grab_pend, grab.pend), 'dias', grab.dias),
      'pagina', coalesce(nullif(f.official_domain,''), nullif(f.prod_url,''), pag.url),
      'startDate', f.start_date,
      'fechas', jsonb_build_object(
        'guiones', (select to_char(max(coalesce(ds.updated_at, ds.imported_at)),'DD/MM') from public.del_sections ds
                    where ds.strategy_id = f.sid and ds.para_grabar),
        'grabacion', (select to_char(max(fr.created_at),'DD/MM') from public.funnel_resources fr
                      where fr.strategy_id = f.sid and fr.bucket_key in ('vsl_rec','ad_rec')),
        'edicion', (select to_char(max(fr.created_at),'DD/MM') from public.funnel_resources fr
                    where fr.strategy_id = f.sid and fr.bucket_key in ('vsl_edit','ad_edit')),
        'publicado', to_char(f.start_date,'DD/MM'))
    ) order by case when f.status = 'activa' then 1 else 0 end, f.position)
    from (
      select distinct on (sp.strategy_id)
        sp.strategy_id as sid, sp.name, sp.status, sp.position,
        sp.official_domain, sp.prod_url, s.start_date
      from public.strategy_pages sp
      join public.strategies s on s.id = sp.strategy_id
      where sp.client_id = public.portal_cliente_client()
      order by sp.strategy_id, sp.position, sp.id
    ) f
    left join lateral (select public._portal_etapa(f.sid, f.status) e) et on true
    left join (select * from public._portal_avance_funnel(public.portal_cliente_client())) av on av.sid = f.sid
    -- Lista de pendientes del cliente en este funnel (grabar/revisar/material).
    left join lateral (
      select jsonb_agg(item order by ord) as items from (
        select 1 as ord, jsonb_build_object('tipo','grabar','label','Grabar tus anuncios') as item
          where exists(select 1 from public.del_sections ds
                 where ds.strategy_id=f.sid and ds.para_grabar and ds.kind='anuncios'
                   and coalesce(ds.fase,'lanzamiento')='lanzamiento' and coalesce(ds.grab_flujo,'')<>'grabado')
        union all
        select 2, jsonb_build_object('tipo','grabar','label','Grabar tu VSL')
          where exists(select 1 from public.del_sections ds
                 where ds.strategy_id=f.sid and ds.para_grabar and ds.kind='vsl'
                   and coalesce(ds.fase,'lanzamiento')='lanzamiento' and coalesce(ds.grab_flujo,'')<>'grabado')
        union all
        select 3, jsonb_build_object('tipo','revisar','label','Revisar tu copy')
          where exists(select 1 from public.del_sections ds
                 left join public.portal_guion_status gs on gs.section_id=ds.id and gs.client_id=public.portal_cliente_client()
                 where ds.strategy_id=f.sid and coalesce(ds.estado_seccion,'')='terminado' and coalesce(ds.accion_cliente,'')='revisar'
                   and coalesce(ds.fase,'lanzamiento')='lanzamiento' and not coalesce(gs.revisado,false))
        union all
        select 100 + coalesce(pp.orden,0),
               jsonb_build_object('tipo','material','label', coalesce(nullif(btrim(pp.titulo),''), 'Enviar material'))
        from public.portal_pedidos pp
        left join lateral (select count(*) n from public.funnel_resources fr
           where fr.client_id=public.portal_cliente_client() and pp.bucket_key is not null
             and fr.bucket_key=pp.bucket_key and fr.strategy_id=pp.strategy_id) cnt on true
        where pp.client_id=public.portal_cliente_client() and pp.activo and pp.strategy_id=f.sid
          and pp.estado not in ('completo','validado')
          and not (pp.target_count is not null and coalesce(cnt.n,0)>=pp.target_count)
          and not (pp.bucket_key is not null and pp.target_count is null and coalesce(cnt.n,0)>0)
      ) x
    ) pen on true
    left join lateral (
      select (f.status is distinct from 'activa') and exists (
          select 1 from (values ('vsl','vsl_rec','vsl_edit'), ('anuncios','ad_rec','ad_edit')) t(kind, b_rec, b_edit)
           where (select count(*) from public.del_sections ds
                   where ds.strategy_id = f.sid and ds.para_grabar and ds.kind = t.kind)
               > (select count(*) from public.funnel_resources fr
                   where fr.strategy_id = f.sid and fr.bucket_key in (t.b_rec, t.b_edit))
        ) as pend,
        greatest(0, extract(day from now() - (
          select max(coalesce(ds.updated_at, ds.imported_at))
          from public.del_sections ds where ds.strategy_id = f.sid and ds.para_grabar)))::int as dias
    ) grab on true
    left join lateral (
      select coalesce(nullif(sp2.official_domain,''), nullif(sp2.prod_url,'')) as url
      from public.strategy_pages sp2
      where sp2.strategy_id = f.sid and (coalesce(sp2.official_domain,'') <> '' or coalesce(sp2.prod_url,'') <> '')
      limit 1
    ) pag on true
  ), '[]'::jsonb) end;
$$;

commit;

notify pgrst, 'reload schema';
