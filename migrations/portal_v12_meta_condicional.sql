-- ─────────────────────────────────────────────────────────────────────────────
-- PORTAL v12 — pedido de "Acceso a Meta" CONDICIONAL (pedido de Matías):
-- si operaciones ya tiene una cuenta publicitaria cargada para el cliente
-- (clients.meta_ads con al menos una cuenta), el portal NO le pide el acceso:
--   · _portal_pedidos_json lo excluye (no sale en Inicio ni en pendientes),
--   · portal_pedidos_seed no lo siembra al activar el portal,
--   · portal_cliente_meta y material devuelven 'validado' (por si entra directo).
-- Aplicada a prod el 2026-07-25 vía MCP. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public._portal_meta_configurada(p_client text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_array_length(coalesce(
    (select case when jsonb_typeof(c.meta_ads)='array' then c.meta_ads else '[]'::jsonb end
       from public.clients c where c.id = p_client), '[]'::jsonb)) > 0;
$$;

-- Pedidos: el de acceso_meta desaparece si la cuenta ya está configurada.
create or replace function public._portal_pedidos_json(p_client text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pp.id, 'tipo', pp.tipo, 'titulo', pp.titulo, 'descripcion', coalesce(pp.descripcion,''),
    'bucket', pp.bucket_key, 'target', pp.target_count,
    'subidos', coalesce(cnt.n, 0),
    'bloqueante', pp.bloqueante,
    'dias', greatest(0, extract(day from now() - pp.pedido_at))::int,
    'estado', case
        when pp.estado in ('validado','completo') then pp.estado
        when pp.target_count is not null and coalesce(cnt.n,0) >= pp.target_count then 'completo'
        when pp.bucket_key is not null and pp.target_count is null and coalesce(cnt.n,0) > 0 then 'completo'
        else pp.estado end,
    'strategyId', pp.strategy_id
  ) order by pp.orden, pp.pedido_at), '[]'::jsonb)
  from public.portal_pedidos pp
  left join lateral (
    select count(*) n from public.funnel_resources fr
    where fr.client_id = p_client and pp.bucket_key is not null and fr.bucket_key = pp.bucket_key
      and ((pp.strategy_id is null and fr.strategy_id is null) or fr.strategy_id = pp.strategy_id)
  ) cnt on true
  where pp.client_id = p_client and pp.activo
    and not (pp.tipo = 'acceso_meta' and public._portal_meta_configurada(p_client));
$$;

-- Seed: no sembrar acceso_meta si ya hay cuenta configurada.
create or replace function public.portal_pedidos_seed(p_client text)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
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
    if not exists (
      select 1 from public.portal_pedidos
      where client_id = p_client and tipo = v_item->>'tipo' and activo
    ) then
      insert into public.portal_pedidos (client_id, tipo, titulo, descripcion, bucket_key, target_count, bloqueante, orden, created_by)
      values (p_client, v_item->>'tipo', v_item->>'titulo', coalesce(v_item->>'descripcion',''),
              nullif(v_item->>'bucket_key',''), nullif(v_item->>'target_count','')::int,
              coalesce((v_item->>'bloqueante')::boolean,false), coalesce((v_item->>'orden')::int,0), 'seed');
    end if;
  end loop;
end $$;

-- Material: el acceso a Meta figura confirmado si ops ya tiene la cuenta.
-- (misma función v11; solo cambia el cálculo de accesoMeta)
create or replace function public.portal_cliente_material()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_cid text; v_visto timestamptz;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;
  select pa.material_visto_at into v_visto
  from public.portal_access pa
  where pa.enabled and lower(pa.login_email) = lower(nullif(auth.jwt()->>'email',''))
  limit 1;

  return jsonb_build_object(
    'grabaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'funnel', t.name, 'strategyId', t.sid, 'tipo', t.doc_tipo,
        'titulo', case t.doc_tipo when 'vsl' then 'VSL grabado' else 'Anuncios grabados' end,
        'subidos', t.n,
        'estado', case when t.n > 0 or t.ed > 0 then 'subido' else 'falta' end,
        'dias', t.dias, 'ultimo', t.ultimo
      ) order by t.pos, t.doc_tipo)
      from (
        select s.id sid, s.name, s.position pos, x.doc_tipo,
          (select count(*) from public.funnel_resources fr where fr.strategy_id = s.id and fr.bucket_key = x.bucket) n,
          (select count(*) from public.funnel_resources fr where fr.strategy_id = s.id and fr.bucket_key = x.bucket_edit) ed,
          (select fr.title from public.funnel_resources fr where fr.strategy_id = s.id and fr.bucket_key = x.bucket order by fr.created_at desc limit 1) ultimo,
          greatest(0, extract(day from now() - (select max(coalesce(ds.updated_at, ds.imported_at)) from public.del_sections ds
             where ds.strategy_id = s.id and ds.para_grabar and ds.kind = x.kind)))::int dias
        from public.strategies s
        cross join (values ('ads','anuncios','ad_rec','ad_edit'), ('vsl','vsl','vsl_rec','vsl_edit')) x(doc_tipo, kind, bucket, bucket_edit)
        where s.client_id = v_cid
          and (exists (select 1 from public.del_sections ds where ds.strategy_id = s.id and ds.para_grabar and ds.kind = x.kind)
            or exists (select 1 from public.funnel_resources fr where fr.strategy_id = s.id and fr.bucket_key = x.bucket))
      ) t), '[]'::jsonb),
    'marca', coalesce((
      select jsonb_agg(p) from jsonb_array_elements(public._portal_pedidos_json(v_cid)) p
      where p->>'tipo' <> 'acceso_meta' and p->>'bucket' is not null), '[]'::jsonb),
    'accesoMeta', case when public._portal_meta_configurada(v_cid) then 'validado' else coalesce((
      select case when pp.estado in ('completo','validado') then 'validado' else pp.estado end
      from public.portal_pedidos pp
      where pp.client_id = v_cid and pp.tipo = 'acceso_meta' and pp.activo
      order by pp.pedido_at desc limit 1), 'sin_pedido') end,
    'devoluciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'funnel', s.name, 'strategyId', s.id, 'count', d.n,
        'ultimo', to_char(d.ult, 'DD/MM'),
        'nuevo', d.ult > coalesce(v_visto, 'epoch'::timestamptz),
        'items', d.items
      ) order by d.ult desc)
      from (
        select fr.strategy_id, count(*) n, max(fr.created_at) ult,
          jsonb_agg(jsonb_build_object('titulo', fr.title, 'url', fr.public_url, 'kind', fr.kind,
            'bucket', fr.bucket_key, 'fecha', to_char(fr.created_at,'DD/MM'))
            order by fr.created_at desc) items
        from public.funnel_resources fr
        where fr.client_id = v_cid and fr.bucket_key in ('vsl_edit','ad_edit')
          and coalesce(fr.visible_cliente, false)
        group by fr.strategy_id
      ) d join public.strategies s on s.id = d.strategy_id), '[]'::jsonb),
    'paginas', coalesce((
      select jsonb_agg(jsonb_build_object('funnel', s.name, 'url', u.url))
      from public.strategies s
      join lateral (
        select coalesce(nullif(sp.official_domain,''), nullif(sp.prod_url,'')) url
        from public.strategy_pages sp
        where sp.strategy_id = s.id and (coalesce(sp.official_domain,'') <> '' or coalesce(sp.prod_url,'') <> '')
        limit 1
      ) u on true
      where s.client_id = v_cid and s.status = 'activa'), '[]'::jsonb)
  );
end $$;

-- Pantalla Acceso a Meta: si ops ya configuró la cuenta → "Acceso confirmado".
create or replace function public.portal_cliente_meta()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.portal_cliente_client() is null then null else jsonb_build_object(
    'partnerId', coalesce((select value->>'meta_partner_id' from public.app_settings where key='portal_config'), ''),
    'whatsapp',  coalesce((select value->>'whatsapp_equipo' from public.app_settings where key='portal_config'), ''),
    'estado', case when public._portal_meta_configurada(public.portal_cliente_client()) then 'validado'
      else coalesce((
        select case
            when pp.estado in ('completo','validado') then 'validado'
            else pp.estado end
        from public.portal_pedidos pp
        where pp.client_id = public.portal_cliente_client() and pp.tipo = 'acceso_meta' and pp.activo
        order by pp.pedido_at desc limit 1), 'sin_pedido') end
  ) end;
$$;
