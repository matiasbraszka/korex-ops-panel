-- portal_v20 — Los embudos del portal muestran el NOMBRE DEL FUNNEL, no el de la carpeta.
-- APLICADA a prod el 2026-07-27 (vía MCP apply_migration).
--
-- Bug que arregla (reporte de Matías con Marta Torrico): el portal mostraba
-- "Reclutamiento | Marca Personal" y hasta una carpeta fantasma sin funnel, porque
-- portal_cliente_embudos() y portal_cliente_funnels() recorrían public.strategies
-- (las CARPETAS viejas del Drive) y mostraban s.name. La capa "estrategia" ya no
-- existe para el usuario: todo va por funnels (strategy_pages).
--
-- El fix: iterar los FUNNELS del cliente. El `id` expuesto SIGUE siendo el
-- strategy_id (la carpeta técnica) porque todo el resto del portal — grabaciones,
-- guiones, deep-links /embudo/:id y /documento/:id — filtra por ese id. Si dos
-- funnels comparten carpeta (clientes aún no migrados a 1 DEL = 1 funnel) se toma
-- el primero por posición, así no hay ids duplicados en la lista. Carpetas sin
-- funnel ya no aparecen.

create or replace function public.portal_cliente_embudos()
returns jsonb language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.sid, 'name', f.name,
      'etapa', et.e,
      'progreso', round((et.e - 1) / 3.0 * 100)::int,
      'etiqueta', case
        when f.status = 'activa' or et.e = 4 then 'al_aire'
        when grab.pend then 'te_toca'
        else 'en_armado' end,
      'razon', case et.e
        when 1 then 'Estamos escribiendo tus guiones'
        when 2 then case when grab.pend then 'Esperando tus grabaciones' else 'Guiones listos' end
        when 3 then 'Estamos editando tus videos'
        else 'Publicado y corriendo' end,
      'grabPendiente', jsonb_build_object('pend', grab.pend, 'dias', grab.dias),
      'pagina', coalesce(nullif(f.official_domain,''), nullif(f.prod_url,''), pag.url),
      'startDate', f.start_date
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
    left join lateral (
      select (f.status is distinct from 'activa') and exists (
          select 1 from public.del_sections ds
          where ds.strategy_id = f.sid and ds.para_grabar and ds.kind in ('vsl','anuncios')
            and not exists (select 1 from public.funnel_resources fr
                            where fr.strategy_id = f.sid
                              and fr.bucket_key in (
                                case ds.kind when 'vsl' then 'vsl_rec' else 'ad_rec' end,
                                case ds.kind when 'vsl' then 'vsl_edit' else 'ad_edit' end))
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

create or replace function public.portal_cliente_funnels()
returns jsonb language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.sid, 'name', f.name, 'status', f.status,
      'estadoLabel', case f.status when 'activa' then 'Activo' when 'borrador' then 'En construcción' else coalesce(f.status,'') end,
      'esPrioridad', coalesce(f.prioridad, false),
      'guionesTotal', gt.n, 'guionesGrabados', gg.n, 'pendientes', pc.n,
      'etapa', public._portal_etapa(f.sid, f.status),
      'startDate', f.start_date
    ) order by f.position)
    from (
      select distinct on (sp.strategy_id)
        sp.strategy_id as sid, sp.name, sp.status, sp.position, sp.client_id,
        s.start_date, s.prioridad, s.visual_resources
      from public.strategy_pages sp
      join public.strategies s on s.id = sp.strategy_id
      where sp.client_id = public.portal_cliente_client()
      order by sp.strategy_id, sp.position, sp.id
    ) f
    left join lateral (select count(*) n from public.del_sections ds
       where ds.strategy_id=f.sid and ds.kind in ('vsl','anuncios') and ds.para_grabar) gt on true
    left join lateral (select count(*) n from public.del_sections ds
       join public.portal_guion_status gs on gs.section_id=ds.id and gs.client_id=f.client_id
       where ds.strategy_id=f.sid and ds.kind in ('vsl','anuncios') and ds.para_grabar and gs.grabado) gg on true
    left join lateral (select count(*) n from jsonb_array_elements(
       case when jsonb_typeof(f.visual_resources)='array' then f.visual_resources else '[]'::jsonb end) v
       where coalesce((v->>'ok')::boolean,false)=false) pc on true
  ), '[]'::jsonb) end;
$$;
