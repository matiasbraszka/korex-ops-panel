-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v43_guias_pedidos_por_embudo.sql
--
-- 1 · GUÍAS: no mostrar las que están vacías. Hay una ("Ventas") sin contenido, y
--     en la hoja nueva de Guías del portal se vería como una guía que se abre en
--     blanco.
--
-- 2 · PEDIDOS CON EMBUDO: `portal_pedidos.strategy_id` existe desde siempre y
--     `_portal_pedidos_json` ya cuenta los archivos con el alcance correcto, pero
--     no devolvía el NOMBRE del embudo, así que el cliente veía dos peticiones
--     iguales sin saber cuál era de cuál.
--
-- 3 · EL SEMBRADOR NO PODÍA SEMBRAR POR EMBUDO. Deduplicaba por `tipo` a secas,
--     así que dos peticiones del mismo tipo para dos embudos distintos se
--     pisaban. Es el mismo bug de ayer (tres carpetas con el mismo tipo), un
--     nivel más abajo: ahora la comprobación incluye el embudo.
--
-- 4 · TESTIMONIOS, 3 POR EMBUDO. Se da de baja la petición general que quedó ayer
--     y pasa a haber una por embudo, con el texto adaptado: si el embudo es de
--     producto, los testimonios son de ANTES Y DESPUÉS.
--
-- 5 · LOS DOS VSL. `portal_cliente_embudos` daba por entregada la grabación con
--     que existiera UN archivo en la carpeta del embudo: si el cliente tenía dos
--     guiones y subía uno, el embudo figuraba completo. Ahora se cuenta: hacen
--     falta tantos archivos como guiones marcados para grabar.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1 · Guías con contenido ──────────────────────────────────────────────────
create or replace function public.portal_cliente_guias()
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'titulo', g.title, 'html', g.html, 'texto', g.text)
           order by g.orden, g.created_at)
    from public.del_guias_globales g
    where g.activo and coalesce(g.html, '') <> ''
  ), '[]'::jsonb) end;
$$;

-- ── 2 · El nombre del embudo viaja con cada petición ─────────────────────────
create or replace function public._portal_pedidos_json(p_client text)
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pp.id, 'tipo', pp.tipo, 'titulo', pp.titulo, 'descripcion', coalesce(pp.descripcion,''),
    'bucket', pp.bucket_key, 'target', pp.target_count,
    'subidos', coalesce(cnt.n, 0),
    'bloqueante', pp.bloqueante,
    'dias', greatest(0, extract(day from now() - pp.pedido_at))::int,
    'pedidoAt', pp.pedido_at,
    'estado', case
        when pp.estado in ('validado','completo') then pp.estado
        when pp.target_count is not null and coalesce(cnt.n,0) >= pp.target_count then 'completo'
        when pp.bucket_key is not null and pp.target_count is null and coalesce(cnt.n,0) > 0 then 'completo'
        else pp.estado end,
    'strategyId', pp.strategy_id,
    'funnel', fn.name,
    'funnelTipo', fn.tipo
  ) order by pp.orden, pp.pedido_at), '[]'::jsonb)
  from public.portal_pedidos pp
  left join lateral (
    select count(*) n from public.funnel_resources fr
    where fr.client_id = p_client and pp.bucket_key is not null and fr.bucket_key = pp.bucket_key
      and ((pp.strategy_id is null and fr.strategy_id is null) or fr.strategy_id = pp.strategy_id)
  ) cnt on true
  left join lateral (
    select sp.name, sp.tipo from public.strategy_pages sp
     where pp.strategy_id is not null and sp.strategy_id = pp.strategy_id
     order by sp.position, sp.id limit 1
  ) fn on true
  where pp.client_id = p_client and pp.activo
    and not (pp.tipo = 'acceso_meta' and public._portal_meta_configurada(p_client));
$$;

-- ── 3 · El sembrador general solo mira las peticiones SIN embudo ─────────────
create or replace function public.portal_pedidos_seed(p_client text)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_item jsonb;
begin
  if not exists (select 1 from public.clients where id = p_client) then return; end if;
  for v_item in
    select * from jsonb_array_elements(coalesce(
      (select value from public.app_settings where key = 'portal_pedidos_template'), '[]'::jsonb))
  loop
    if v_item->>'tipo' = 'acceso_meta' and public._portal_meta_configurada(p_client) then
      continue;
    end if;
    -- `strategy_id is null`: la plantilla es de peticiones del CLIENTE. Sin esta
    -- condición, una petición por embudo del mismo tipo hacía que el sembrador
    -- creyera que ya estaba y no creara nunca la del cliente (y al revés).
    if not exists (
      select 1 from public.portal_pedidos
      where client_id = p_client and tipo = v_item->>'tipo' and strategy_id is null and activo
    ) then
      insert into public.portal_pedidos (client_id, tipo, titulo, descripcion, bucket_key, target_count, bloqueante, orden, created_by)
      values (p_client, v_item->>'tipo', v_item->>'titulo', coalesce(v_item->>'descripcion',''),
              nullif(v_item->>'bucket_key',''), nullif(v_item->>'target_count','')::int,
              coalesce((v_item->>'bloqueante')::boolean,false), coalesce((v_item->>'orden')::int,0), 'seed');
    end if;
  end loop;
end $$;

-- ── 4 · Testimonios: una petición por embudo ────────────────────────────────
create or replace function public.portal_pedidos_seed_funnels(p_client text)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare f record;
begin
  if not exists (select 1 from public.clients where id = p_client) then return; end if;

  for f in
    select distinct on (sp.strategy_id) sp.strategy_id as sid, sp.tipo
      from public.strategy_pages sp
     where sp.client_id = p_client and coalesce(sp.status, '') <> 'antiguo'
     order by sp.strategy_id, sp.position, sp.id
  loop
    if not exists (
      select 1 from public.portal_pedidos
       where client_id = p_client and tipo = 'material_testimonios'
         and strategy_id = f.sid and activo
    ) then
      -- El título va genérico a propósito: el embudo lo pone el chip del portal
      -- con el nombre en vivo, así no queda viejo si le cambian el nombre.
      insert into public.portal_pedidos
        (client_id, strategy_id, tipo, titulo, descripcion, bucket_key, target_count, bloqueante, orden, created_by)
      values (p_client, f.sid, 'material_testimonios', 'Testimonios de tus clientes',
              case when coalesce(f.tipo,'') = 'producto'
                   then 'Mínimo 3, enfocados en el antes y el después. Sirven imágenes; en lo posible, videos.'
                   else 'Mínimo 3 videos horizontales de personas contando el resultado que consiguieron.' end,
              'testimonios', 3, false, 9, 'seed_funnel');
    end if;
  end loop;
end $$;

revoke execute on function public.portal_pedidos_seed_funnels(text) from public, anon;
grant  execute on function public.portal_pedidos_seed_funnels(text) to authenticated, service_role;

-- Un embudo nuevo trae su petición de testimonios sin que nadie haga nada.
-- Aditivo: si falla, el embudo se crea igual.
create or replace function public.trg_strategy_pages_pedidos()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  begin
    perform public.portal_pedidos_seed_funnels(new.client_id);
  exception when others then null;
  end;
  return null;
end $$;

drop trigger if exists strategy_pages_pedidos on public.strategy_pages;
create trigger strategy_pages_pedidos
  after insert on public.strategy_pages
  for each row execute function public.trg_strategy_pages_pedidos();

-- ── 5 · Los dos VSL: se cuenta, no se pregunta si hay alguno ────────────────
create or replace function public.portal_cliente_embudos()
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
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
      -- Antes: "existe algún guion para grabar SIN ningún archivo en la carpeta".
      -- Con dos guiones de VSL y un solo video subido, el `not exists` se apagaba
      -- para los dos y el embudo figuraba entregado. Ahora se comparan cantidades:
      -- falta mientras haya más guiones para grabar que archivos en su carpeta.
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

-- ── 6 · Plantilla: la aclaración del estilo de vida, y fuera los testimonios ─
update public.app_settings
   set value = (
     select jsonb_agg(e order by (e->>'orden')::int)
       from jsonb_array_elements(value) e
      where e->>'tipo' <> 'material_testimonios')
 where key = 'portal_pedidos_template';

update public.app_settings
   set value = (
     select jsonb_agg(
       case when e->>'bucket_key' = 'estilo_vida'
            then jsonb_set(e, '{descripcion}',
                   to_jsonb('Fotos y videos de tu día a día, viajes, familia, entrenando. '
                         || 'Si se graban más de una persona, cárganos contenido de las dos.'))
            else e end
       order by (e->>'orden')::int)
     from jsonb_array_elements(value) e)
 where key = 'portal_pedidos_template';

commit;

-- ── 7 · Datos: aplicar a los clientes que ya existen ────────────────────────
-- La descripción nueva del estilo de vida (el sembrador no toca filas creadas).
update public.portal_pedidos
   set descripcion = 'Fotos y videos de tu día a día, viajes, familia, entrenando. '
                  || 'Si se graban más de una persona, cárganos contenido de las dos.'
 where tipo = 'material_estilo' and activo;

-- La petición general de testimonios se da de baja: ahora va por embudo.
update public.portal_pedidos
   set activo = false
 where tipo = 'material_testimonios' and strategy_id is null and activo;

-- Y se siembran las de cada embudo.
do $$
declare r record;
begin
  for r in select id from public.clients where coalesce(status, 'active') = 'active' loop
    perform public.portal_pedidos_seed_funnels(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
