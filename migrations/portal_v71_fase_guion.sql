-- ═════════════════════════════════════════════════════════════════════════════
-- portal_v71_fase_guion.sql
--
-- Da solidez al modelo de "embudo completo" con una FASE por guión, para que no
-- haya ni falsos completados ni completados que figuran incompletos.
--
--   fase = 'lanzamiento'  → guión que el cliente DEBE grabar para llegar al 100%
--                           (cuenta en el avance / lo frena).
--   fase = 'optimizacion' → guión ADICIONAL (después del 100%). Nunca frena el %;
--                           aparece en la fase de Optimización del embudo.
--
-- Reglas nuevas:
--  · El freno de grabación (grab_pend) solo mira guiones fase='lanzamiento' sin
--    tildar `grabado`. Así, si mañana se suma un guión de lanzamiento nuevo, el
--    embudo deja de estar al 100% (correcto). Los de optimización no afectan.
--  · Backfill único: los guiones de lanzamiento de embudos que YA tienen el
--    editado entregado (ad_edit/vsl_edit) se dan por grabados. Es imposible haber
--    editado sin grabar → destraba los embudos viejos (ej. Sergio Canovas).
--  · Un embudo con status 'antiguo' se muestra como COMPLETO (viejo, terminado),
--    no como "Al aire".
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- 1) La columna de fase por guión.
alter table public.del_sections
  add column if not exists fase text not null default 'lanzamiento';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'del_sections_fase_chk') then
    alter table public.del_sections
      add constraint del_sections_fase_chk check (fase in ('lanzamiento','optimizacion'));
  end if;
end $$;

-- 2) Setter desde Operaciones (desplegable en el DEL).
create or replace function public.del_section_set_fase(p_id text, p_fase text, p_by text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_team_member() then return jsonb_build_object('ok', false, 'error', 'no autorizado'); end if;
  if coalesce(p_fase,'') not in ('lanzamiento','optimizacion') then
    return jsonb_build_object('ok', false, 'error', 'fase inválida');
  end if;
  update public.del_sections set fase = p_fase, updated_at = now(),
         updated_by = coalesce(p_by, updated_by) where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'seccion inexistente'); end if;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.del_section_set_fase(text, text, text) to authenticated, service_role;

-- 3) Backfill único: dar por grabados los guiones de lanzamiento cuyos EDITADOS
--    ya existen (prueba fuerte de que se grabó). Limpia el legado sin trigger.
insert into public.portal_guion_status(client_id, section_id, grabado, updated_at)
select ds.client_id, ds.id, true, now()
from public.del_sections ds
where ds.para_grabar and ds.kind in ('vsl','anuncios')
  and coalesce(ds.fase,'lanzamiento') = 'lanzamiento'
  and ds.client_id is not null
  and exists (select 1 from public.funnel_resources fr
              where fr.strategy_id = ds.strategy_id
                and fr.bucket_key = case ds.kind when 'vsl' then 'vsl_edit' else 'ad_edit' end)
on conflict (client_id, section_id) do update set grabado = true, updated_at = now();

-- 4) Avance por funnel: grab_pend solo cuenta guiones de LANZAMIENTO sin grabar.
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
    select s.id as sid,
      exists(select 1 from public.strategy_pages sp where sp.strategy_id = s.id and sp.status = 'activa') as lanzado
    from public.strategies s where s.client_id = p_client
  ),
  pf as (
    select f.sid, f.lanzado,
      coalesce(pr.done,0) as prod_done, coalesce(pr.total,0) as prod_total,
      exists(select 1 from public.del_sections ds
             where ds.strategy_id = f.sid and ds.para_grabar and ds.kind in ('vsl','anuncios')
               and coalesce(ds.fase,'lanzamiento') = 'lanzamiento') as grab_hay,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = p_client
             where ds.strategy_id = f.sid and ds.para_grabar and ds.kind in ('vsl','anuncios')
               and coalesce(ds.fase,'lanzamiento') = 'lanzamiento'
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

-- 5) Lista "grabá esto" (Inicio / Guiones): solo guiones de LANZAMIENTO.
create or replace function public._portal_grabaciones_json(p_client text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(item order by (item->>'dias')::int desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'tipo', 'grabacion_' || t.doc_tipo,
      'titulo', case t.doc_tipo when 'vsl' then 'Graba tu VSL' else 'Graba tus anuncios' end,
      'descripcion', 'Los guiones ya están escritos en tu documento del embudo ' || t.name ||
        case t.doc_tipo when 'vsl' then '.' else '. Cada uno dura menos de un minuto.' end,
      'dias', greatest(0, extract(day from now() - t.desde))::int,
      'bloqueante', false, 'estado', 'pendiente',
      'strategyId', t.strategy_id, 'docTipo', t.doc_tipo,
      'funnel', t.name, 'funnelNum', public._portal_funnel_num(p_client, t.strategy_id),
      'target', null, 'subidos', 0, 'bucket', t.bucket
    ) as item
    from (
      select s.id as strategy_id, s.name, x.doc_tipo, x.bucket,
        (select max(coalesce(ds.updated_at, ds.imported_at, now()))
           from public.del_sections ds
          where ds.strategy_id = s.id and ds.para_grabar and ds.kind = x.kind) as desde
      from public.strategies s
      cross join (values ('ads','anuncios','ad_rec','ad_edit'), ('vsl','vsl','vsl_rec','vsl_edit')) as x(doc_tipo, kind, bucket, bucket_edit)
      where s.client_id = p_client
        and coalesce(s.status,'') <> 'activa'
        and exists (
          select 1 from public.del_sections ds
          left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = p_client
          where ds.strategy_id = s.id and ds.para_grabar and ds.kind = x.kind
            and coalesce(ds.fase,'lanzamiento') = 'lanzamiento'
            and not coalesce(gs.grabado, false))
    ) t
  ) q;
$$;

grant execute on function public._portal_grabaciones_json(text) to authenticated, service_role;

-- 6) Optimización: "lo nuevo que te pedimos" = guiones de fase OPTIMIZACIÓN
--    sin grabar + páginas nuevas por revisar.
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
            left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = (select v from cid)
            where ds.strategy_id = s.id and ds.para_grabar and ds.kind in ('vsl','anuncios')
              and coalesce(ds.fase,'lanzamiento') = 'optimizacion'
              and not coalesce(gs.grabado, false)
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

-- 7) Embudos: un funnel 'antiguo' se muestra COMPLETO (terminado), no "Al aire".
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
      'etiqueta', case
        when coalesce(av.pend, false) then 'te_toca'
        when f.status = 'antiguo' then 'completo'
        when f.status = 'activa' or et.e = 4 then 'al_aire'
        else 'en_armado' end,
      'razon', case
        when coalesce(av.grab_pend, false) then 'Esperando tus grabaciones'
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
