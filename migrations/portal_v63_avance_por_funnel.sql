-- ═════════════════════════════════════════════════════════════════════════════
-- portal_v63_avance_por_funnel.sql
--
-- Hace que el avance POR FUNNEL (pestaña Embudos) use el mismo motor exacto que
-- el % del proyecto (v62): pipeline interno + freno por deuda del cliente. Así no
-- queda un funnel mostrando "100% · al aire" mientras el cliente todavía adeuda
-- grabar, revisar el copy o subir material.
--
-- Refactor: una sola función por-funnel (_portal_avance_funnel) que devuelve, por
-- funnel, los pasos hechos/total, el % y si el cliente tiene algo pendiente. La
-- reusan _portal_avance (proyecto) y portal_cliente_embudos (por funnel). Una
-- sola fuente de verdad.
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
    select s.id as sid from public.strategies s where s.client_id = p_client
  ),
  pf as (
    select f.sid,
      coalesce(pr.done,0) as prod_done, coalesce(pr.total,0) as prod_total,
      exists(select 1 from public.del_sections ds
             where ds.strategy_id = f.sid and ds.para_grabar and ds.kind in ('vsl','anuncios')) as grab_hay,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = p_client
             where ds.strategy_id = f.sid and ds.para_grabar and ds.kind in ('vsl','anuncios')
               and not coalesce(gs.grabado, false)) as grab_pend,
      exists(select 1 from public.del_sections ds
             where ds.strategy_id = f.sid and coalesce(ds.estado_seccion,'') = 'terminado'
               and coalesce(ds.accion_cliente,'') = 'revisar') as rev_hay,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = p_client
             where ds.strategy_id = f.sid and coalesce(ds.estado_seccion,'') = 'terminado'
               and coalesce(ds.accion_cliente,'') = 'revisar' and not coalesce(gs.revisado, false)) as rev_pend,
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
      prod_done
        + case when grab_hay and not grab_pend then 1 else 0 end
        + case when rev_hay  and not rev_pend  then 1 else 0 end
        + case when mat_hay  and not mat_pend  then 1 else 0 end as done_c,
      prod_total
        + case when grab_hay then 1 else 0 end
        + case when rev_hay  then 1 else 0 end
        + case when mat_hay  then 1 else 0 end as total_c
    from pf
  )
  select sid, prod_done, prod_total, grab_hay, grab_pend, rev_hay, rev_pend, mat_hay, mat_pend,
    done_c, total_c,
    case when total_c = 0 then 0 else round(done_c::numeric / total_c * 100)::int end,
    (grab_pend or rev_pend or mat_pend),
    (prod_total > 0 and prod_done = prod_total and not grab_pend and not rev_pend and not mat_pend)
  from calc
  where prod_total > 0 or grab_hay or rev_hay or mat_hay;
$$;

grant execute on function public._portal_avance_funnel(text) to authenticated, service_role;

-- ── Proyecto: agrega los funnels + pedidos generales (sin funnel) ───────────
create or replace function public._portal_avance(p_client text)
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with af as (select * from public._portal_avance_funnel(p_client)),
  gen as (
    select
      exists(select 1 from public.portal_pedidos pp
             where pp.client_id = p_client and pp.activo and pp.strategy_id is null) as gen_hay,
      exists(select 1 from public.portal_pedidos pp
             left join lateral (select count(*) n from public.funnel_resources fr
               where fr.client_id = p_client and pp.bucket_key is not null and fr.bucket_key = pp.bucket_key
                 and fr.strategy_id is null) cnt on true
             where pp.client_id = p_client and pp.activo and pp.strategy_id is null
               and pp.estado not in ('completo','validado')
               and not (pp.target_count is not null and coalesce(cnt.n,0) >= pp.target_count)
               and not (pp.bucket_key is not null and pp.target_count is null and coalesce(cnt.n,0) > 0)) as gen_pend
  )
  select jsonb_build_object(
    'pct', case when (coalesce((select sum(total) from af),0) + case when (select gen_hay from gen) then 1 else 0 end) = 0
                then 0
                else round(
                  (coalesce((select sum(done) from af),0) + case when (select gen_hay from gen) and not (select gen_pend from gen) then 1 else 0 end)::numeric
                  / (coalesce((select sum(total) from af),0) + case when (select gen_hay from gen) then 1 else 0 end) * 100)::int end,
    'done', (select count(*) from af) > 0
            and coalesce((select bool_and(completo) from af), false)
            and not (select gen_pend from gen)
  );
$$;

-- ── Embudos: el % por funnel usa el avance real; la etiqueta marca "te toca"
--    cuando el cliente adeuda algo (aunque el funnel esté al aire) ────────────
create or replace function public.portal_cliente_embudos()
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.sid, 'name', f.name,
      'etapa', et.e,
      -- % real (pipeline + deuda). Si el funnel no está en el motor, cae al viejo.
      'progreso', coalesce(av.pct, round((et.e - 1) / 3.0 * 100)::int),
      'etiqueta', case
        when coalesce(av.pend, false) then 'te_toca'
        when f.status = 'activa' or et.e = 4 then 'al_aire'
        else 'en_armado' end,
      'razon', case
        when coalesce(av.grab_pend, false) then 'Esperando tus grabaciones'
        when coalesce(av.rev_pend, false)  then 'Tienes contenido para revisar'
        when coalesce(av.mat_pend, false)  then 'Falta que subas el material'
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
