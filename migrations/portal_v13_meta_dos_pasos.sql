-- ─────────────────────────────────────────────────────────────────────────────
-- PORTAL v13 — Meta en 2 pasos (decisión de Matías):
-- el cliente ya no configura nada solo; define su Facebook/Instagram y agenda
-- una sesión de 15 minutos con el equipo.
--   · portal_cliente_meta devuelve `agenda` (link de agenda, app_settings
--     portal_config.agenda_url; si falta, el front cae a WhatsApp).
--   · Se actualiza el texto del pedido acceso_meta (plantilla + pedidos vivos).
-- Aplicada a prod el 2026-07-25 vía MCP. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.portal_cliente_meta()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.portal_cliente_client() is null then null else jsonb_build_object(
    'partnerId', coalesce((select value->>'meta_partner_id' from public.app_settings where key='portal_config'), ''),
    'whatsapp',  coalesce((select value->>'whatsapp_equipo' from public.app_settings where key='portal_config'), ''),
    'agenda',    coalesce((select value->>'agenda_url' from public.app_settings where key='portal_config'), ''),
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

-- Texto nuevo del pedido en la plantilla estándar.
update public.app_settings
set value = (
  select jsonb_agg(
    case when item->>'tipo' = 'acceso_meta'
      then jsonb_set(item, '{descripcion}',
        to_jsonb('No configuras nada solo: define tu Facebook e Instagram y agenda una sesión de 15 minutos con nosotros.'::text))
      else item end)
  from jsonb_array_elements(value) item
)
where key = 'portal_pedidos_template' and jsonb_typeof(value) = 'array';

-- Y en los pedidos ya sembrados que siguen abiertos.
update public.portal_pedidos
set descripcion = 'No configuras nada solo: define tu Facebook e Instagram y agenda una sesión de 15 minutos con nosotros.'
where tipo = 'acceso_meta' and activo and estado in ('pendiente','cliente_dice_listo');
