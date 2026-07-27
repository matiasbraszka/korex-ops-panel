-- portal_v21 — Detalle del embudo: fechas por etapa + carpeta de grabaciones/ediciones.
-- APLICADA a prod el 2026-07-27 (vía MCP apply_migration).
--
-- Pedido de Matías: en el pipeline del embudo del portal, (1) cada etapa muestra la
-- fecha en la que se entregó, (2) "Ver tus grabaciones" abre la carpeta real de
-- grabaciones de ese embudo, (3) la Edición igual, y (4) Publicado linkea la landing.
--
-- 1) portal_cliente_embudos() suma 'fechas' {guiones, grabacion, edicion, publicado}
--    (DD/MM, null si esa etapa no tiene material en el sistema — clientes viejos).
-- 2) portal_cliente_carpeta(strategy, tipo): los archivos del cliente para ese embudo.
--    tipo 'grabaciones' → vsl_rec + ad_rec · tipo 'ediciones' → vsl_edit + ad_edit.
--    Ediciones muestra TODO el bucket (el toggle visible_cliente sigue mandando solo
--    en "Lo que te devolvemos" del Material, con su badge NUEVO).

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

create or replace function public.portal_cliente_carpeta_embudo(p_strategy text, p_tipo text)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $$
declare v_cid text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;
  -- El embudo tiene que ser DEL CLIENTE logueado (nunca ver carpetas ajenas).
  if not exists (select 1 from public.strategies s where s.id = p_strategy and s.client_id = v_cid) then
    return null;
  end if;
  return jsonb_build_object(
    'funnel', coalesce(
      (select sp.name from public.strategy_pages sp where sp.strategy_id = p_strategy order by sp.position, sp.id limit 1),
      (select s.name from public.strategies s where s.id = p_strategy)),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'titulo', fr.title, 'url', fr.public_url, 'kind', fr.kind, 'bucket', fr.bucket_key,
        'fecha', to_char(fr.created_at,'DD/MM'),
        'thumb', case when fr.provider = 'bunny' then fr.storage_path end
      ) order by fr.created_at desc)
      from public.funnel_resources fr
      where fr.strategy_id = p_strategy
        and coalesce(fr.public_url,'') <> ''
        and fr.bucket_key in (
          case when p_tipo = 'grabaciones' then 'vsl_rec' else 'vsl_edit' end,
          case when p_tipo = 'grabaciones' then 'ad_rec' else 'ad_edit' end)
    ), '[]'::jsonb));
end $$;

grant execute on function public.portal_cliente_carpeta_embudo(text, text) to authenticated;
