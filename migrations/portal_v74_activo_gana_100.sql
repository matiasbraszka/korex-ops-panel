-- ═════════════════════════════════════════════════════════════════════════════
-- portal_v74_activo_gana_100.sql
--
-- Pedido de Matías: un embudo puede estar ACTIVO (corriendo) pero NO al 100% —
-- el 100% se GANA cuando el equipo aprueba todo (Marcar grabado + revisiones +
-- material). Antes, status='activa' congelaba el 100% aunque nada estuviera
-- aprobado → salía "100% con guiones sin grabar" (inconsistente).
--
--  · Solo los embudos VIEJOS ('antiguo') quedan grandfathered en 100% (Completo).
--  · 'activa' ahora GANA su % (pipeline + guiones de lanzamiento aprobados como
--    grabado + revisiones + material). Puede quedar en 80%, etc.
--  · La OPTIMIZACIÓN ("lo nuevo que te pedimos") = SOLO guiones fase='optimizacion'
--    (los adicionales, que no cuentan para el 100%). Lo que falte de lanzamiento
--    baja el % y se ve en el recorrido normal, no en optimización.
--  · etiqueta nueva 'activo' (el front lo muestra como "Activo", no "Al aire").
-- ═════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public._portal_avance_funnel(p_client text)
returns table(
  sid text, prod_done int, prod_total int,
  grab_hay boolean, grab_pend boolean, rev_hay boolean, rev_pend boolean,
  mat_hay boolean, mat_pend boolean,
  done int, total int, pct int, pend boolean, completo boolean)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with
  prod as (
    select strategy_id,
           count(*) filter (where status = 'listo') as done,
           count(*) as total
    from public.cerebro_pipeline_status(p_client)
    group by strategy_id
  ),
  funnels as (
    -- SOLO 'antiguo' queda congelado en 100% (viejo/entregado). 'activa' gana su %.
    select s.id as sid,
      exists(select 1 from public.strategy_pages sp where sp.strategy_id = s.id
             and sp.status = 'antiguo') as lanzado
    from public.strategies s where s.client_id = p_client
  ),
  pf as (
    select f.sid, f.lanzado,
      coalesce(pr.done,0) as prod_done, coalesce(pr.total,0) as prod_total,
      exists(select 1 from public.del_sections ds
             where ds.strategy_id = f.sid and ds.para_grabar and ds.kind in ('vsl','anuncios')
               and coalesce(ds.fase,'lanzamiento') = 'lanzamiento') as grab_hay,
      -- Pendiente = guión de lanzamiento que el equipo NO aprobó como grabado.
      exists(select 1 from public.del_sections ds
             where ds.strategy_id = f.sid and ds.para_grabar and ds.kind in ('vsl','anuncios')
               and coalesce(ds.fase,'lanzamiento') = 'lanzamiento'
               and coalesce(ds.grab_flujo,'') <> 'grabado') as grab_pend,
      exists(select 1 from public.del_sections ds
             where ds.strategy_id = f.sid and coalesce(ds.estado_seccion,'') = 'terminado'
               and coalesce(ds.accion_cliente,'') = 'revisar'
               and coalesce(ds.fase,'lanzamiento') = 'lanzamiento') as rev_hay,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = p_client
             where ds.strategy_id = f.sid and coalesce(ds.estado_seccion,'') = 'terminado'
               and coalesce(ds.accion_cliente,'') = 'revisar'
               and coalesce(ds.fase,'lanzamiento') = 'lanzamiento'
               and not coalesce(gs.revisado, false)) as rev_pend,
      exists(select 1 from public.portal_pedidos pp
             where pp.client_id = p_client and pp.activo and pp.strategy_id = f.sid) as mat_hay,
      exists(select 1 from public.portal_pedidos pp
             left join lateral (select count(*) n from public.funnel_resources fr
               where fr.client_id = p_client and pp.bucket_key is not null and fr.bucket_key = pp.bucket_key
                 and fr.strategy_id = pp.strategy_id) cnt on true
             where pp.client_id = p_client and pp.activo and pp.strategy_id = f.sid
               and pp.estado not in ('completo','validado')
               and not (pp.target_count is not null and coalesce(cnt.n,0) >= pp.target_count)
               and not (pp.bucket_key is not null and pp.target_count is null and coalesce(cnt.n,0) > 0)) as mat_pend
    from funnels f
    left join prod pr on pr.strategy_id = f.sid
  ),
  calc as (
    select pf.*,
      case when lanzado then
        prod_total + case when grab_hay then 1 else 0 end + case when rev_hay then 1 else 0 end + case when mat_hay then 1 else 0 end
      else
        prod_done
        + case when grab_hay and not grab_pend then 1 else 0 end
        + case when rev_hay  and not rev_pend  then 1 else 0 end
        + case when mat_hay  and not mat_pend  then 1 else 0 end
      end as done_c,
      prod_total
        + case when grab_hay then 1 else 0 end
        + case when rev_hay  then 1 else 0 end
        + case when mat_hay  then 1 else 0 end as total_c
    from pf
  )
  select sid, prod_done, prod_total, grab_hay, grab_pend, rev_hay, rev_pend, mat_hay, mat_pend,
    done_c, total_c,
    case when lanzado then 100 when total_c = 0 then 0 else round(done_c::numeric / total_c * 100)::int end,
    (not lanzado and (grab_pend or rev_pend or mat_pend)),
    (lanzado or (prod_total > 0 and prod_done = prod_total and not grab_pend and not rev_pend and not mat_pend))
  from calc
  where prod_total > 0 or grab_hay or rev_hay or mat_hay or lanzado;
$$;

grant execute on function public._portal_avance_funnel(text) to authenticated, service_role;

-- Optimización: "lo nuevo" = SOLO guiones fase='optimizacion' sin aprobar (los
-- adicionales). Lo de lanzamiento pendiente baja el % y va en el recorrido normal.
create or replace function public.portal_cliente_optimizacion()
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with cid as (select public.portal_cliente_client() as v)
  select case when (select v from cid) is null then '{}'::jsonb else coalesce((
    select jsonb_object_agg(sid, info) from (
      select s.id as sid, jsonb_build_object(
        'lanzado', true,
        'target', sp.ads_target,
        'entregados', (select count(*) from public.funnel_resources fr
                        where fr.strategy_id = s.id and fr.bucket_key = 'ad_edit'),
        'extras', greatest(0, (select count(*) from public.funnel_resources fr
                        where fr.strategy_id = s.id and fr.bucket_key = 'ad_edit') - coalesce(sp.ads_target, 0)),
        'pendientes', coalesce((
          select jsonb_agg(jsonb_build_object('tipo', tipo, 'titulo', titulo, 'dias', dias) order by dias desc) from (
            select 'grabar' as tipo, ds.title as titulo,
                   greatest(0, extract(day from now() - coalesce(ds.grab_flujo_at, ds.updated_at, ds.imported_at))::int) as dias
            from public.del_sections ds
            where ds.strategy_id = s.id and ds.para_grabar and ds.kind in ('vsl','anuncios')
              and coalesce(ds.fase,'lanzamiento') = 'optimizacion'
              and coalesce(ds.grab_flujo,'') <> 'grabado'
            union all
            select 'revisar', ds.title,
                   greatest(0, extract(day from now() - coalesce(ds.updated_at, ds.imported_at))::int)
            from public.del_sections ds
            left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = (select v from cid)
            where ds.strategy_id = s.id and coalesce(ds.estado_seccion,'') = 'terminado'
              and coalesce(ds.accion_cliente,'') = 'revisar' and not coalesce(gs.revisado, false)
              and coalesce(ds.fase,'lanzamiento') = 'optimizacion'
          ) p
        ), '[]'::jsonb)
      ) as info
      from public.strategies s
      join public.strategy_pages sp on sp.strategy_id = s.id and sp.status = 'activa'
      where s.client_id = (select v from cid)
    ) q
  ), '{}'::jsonb) end;
$$;

grant execute on function public.portal_cliente_optimizacion() to authenticated;

-- Embudos: etiqueta 'activo' (corriendo) separada del %. 'antiguo' → 'completo'.
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
