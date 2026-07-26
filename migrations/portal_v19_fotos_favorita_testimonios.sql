-- portal_v19 — Fotos por tipo, foto favorita del cliente y testimonios por funnel
-- APLICADA a prod el 2026-07-26 (vía MCP apply_migration + updates directos).
--
-- 1) La plantilla de pedidos por defecto (app_settings.portal_pedidos_template)
--    pasó de 3 a 5 pedidos: autoridad (5 fotos, bloqueante) · estilo de vida
--    (hasta 10) · productos/empresa (1-10, sin target) · logo+colores · acceso
--    a Meta. Los clientes que ya tenían el pedido viejo "Sube 5 fotos tuyas"
--    recibieron el retitulado + los dos pedidos nuevos por backfill.
--
-- 2) Foto favorita: el cliente elige desde el portal cuál de sus fotos de
--    autoridad va en su página; ops la ve con la estrella en la carpeta.

alter table funnel_resources add column if not exists favorita boolean not null default false;

create or replace function public.portal_cliente_fotos(p_bucket text)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $$
declare v_cid text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', fr.id, 'url', fr.public_url, 'titulo', fr.title, 'favorita', fr.favorita
    ) order by fr.favorita desc, fr.created_at desc)
    from public.funnel_resources fr
    where fr.client_id = v_cid and fr.bucket_key = p_bucket
      and coalesce(fr.mime_type,'') ilike 'image%'
      and coalesce(fr.public_url,'') <> ''
  ), '[]'::jsonb);
end $$;

create or replace function public.portal_cliente_foto_favorita(p_id text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_cid text; v_bucket text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok', false); end if;
  select bucket_key into v_bucket from public.funnel_resources where id = p_id and client_id = v_cid;
  if v_bucket is null then return jsonb_build_object('ok', false); end if;
  update public.funnel_resources set favorita = false
   where client_id = v_cid and bucket_key = v_bucket and favorita;
  update public.funnel_resources set favorita = true where id = p_id;
  insert into public.portal_eventos (client_id, tipo, payload)
  values (v_cid, 'foto_favorita', jsonb_build_object('resource_id', p_id, 'bucket', v_bucket));
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.portal_cliente_fotos(text) to authenticated;
grant execute on function public.portal_cliente_foto_favorita(text) to authenticated;

-- 3) Pedido derivado de TESTIMONIOS por funnel: aparece en el Inicio del portal
--    cuando el avatar del funnel está definido (sección avatar terminada con
--    contenido) y todavía no hay nada en la carpeta testimonios del funnel.
--    (Se suma a los derivados de grabación dentro de _portal_grabaciones_json;
--    ver la definición completa aplicada en la migración remota homónima.)

-- 4) La guía "Qué testimonios enviarnos" quedó insertada en del_guias_globales
--    (orden 3) con el contenido adaptado del docx de Matías
--    (Guia_testimonios_funnels_version_completa), en formato editable del DEL.
--
-- v19b (mismo día): la condición del pedido de testimonios buscaba kind='avatar'
-- pero los DEL reales usan kind='avatares' — la función acepta los dos.
--
-- Reparación DEL Marta (2026-07-26, sin migración): la desconexión de Drive del
-- 23/07 re-importó el Doc completo al funnel viejo y pisó la separación 1 DEL =
-- 1 funnel. Se rehizo moviendo del_sections por id (7 pestañas → strat_marta_madres,
-- 18 → strat_marta_belleza; 15 quedan en el Reclutamiento viejo con los duplicados
-- de la re-importación, a depurar por el equipo).
