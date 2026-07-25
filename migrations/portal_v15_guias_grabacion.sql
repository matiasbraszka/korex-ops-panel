-- ─────────────────────────────────────────────────────────────────────────────
-- PORTAL v15 — guías de grabación (pedido de Matías):
-- en el documento de guiones, un botón "?" abre la guía en video de cómo
-- grabarse (una para anuncios, otra para el VSL). Los links viven en
-- app_settings.portal_config (guia_ads_url / guia_vsl_url) y los sirve la
-- RPC nueva portal_cliente_config() (también whatsapp y agenda, por si el
-- front los necesita sin pasar por /meta).
-- Aplicada a prod el 2026-07-25 vía MCP. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

update public.app_settings
set value = coalesce(value,'{}'::jsonb) || jsonb_build_object(
  'guia_ads_url', 'https://drive.google.com/file/d/1ad0-7akANcn75xIklZsa6qJhfHwY6kXh/view?usp=sharing',
  'guia_vsl_url', 'https://drive.google.com/file/d/1ObCVIf50f5WN2XZUShRGXnRW1XmG3q5T/view?usp=sharing')
where key = 'portal_config';

create or replace function public.portal_cliente_config()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.portal_cliente_client() is null then null else jsonb_build_object(
    'whatsapp', coalesce((select value->>'whatsapp_equipo' from public.app_settings where key='portal_config'), ''),
    'agenda',   coalesce((select value->>'agenda_url' from public.app_settings where key='portal_config'), ''),
    'guiaAds',  coalesce((select value->>'guia_ads_url' from public.app_settings where key='portal_config'), ''),
    'guiaVsl',  coalesce((select value->>'guia_vsl_url' from public.app_settings where key='portal_config'), '')
  ) end;
$$;

grant execute on function public.portal_cliente_config() to authenticated;
