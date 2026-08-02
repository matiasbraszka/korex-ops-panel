-- panorama_v5_links_directos.sql
--
-- Pedido: "Asi como en la seccion Panorama vas al pixel directo, vas al VSL EDITADO
-- directo y logo y branding — todo acceso directo al lugar donde esta puesto, para
-- encontrarlo rapido y poder volver al paso anterior facilmente."
--
-- El Panorama ya sabe saltar a Pixel, Clarity, Eventos, Dominio y Cuenta ads. El
-- resto (Logo, Colores, Imagenes, Avatar, VSL guion, VSL editado, DEL) eran un
-- tilde muerto: te decian que existe pero no adonde.
--
-- Para el VSL editado hace falta el link en si, no el booleano: si el video ya esta
-- en Voomly conviene abrirlo directo en vez de mandar a la carpeta. Por eso se
-- agrega vsl_url al payload. El resto de los saltos son internos y no necesitan
-- datos nuevos.
--
-- CUIDADO: clients_panorama() es larga y arma un jsonb anidado. Esto NO la reescribe:
-- agrega la clave nueva al objeto de cada funnel con jsonb_set sobre el resultado,
-- para no tener que transcribir la funcion entera (que es justo como se rompen estas
-- cosas). Si en el futuro se toca la funcion de raiz, conviene mover 'vsl_url' al
-- jsonb_build_object del funnel, al lado de 'vsl_editado', y borrar este wrapper.

-- Se define aparte y el frontend la usa cuando necesita el link.
create or replace function public.panorama_vsl_links(p_client text default null)
returns table (strategy_id text, funnel_id text, vsl_url text)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select sp.strategy_id, sp.id, nullif(sp.vsl_url, '')
  from public.strategy_pages sp
  where (p_client is null or sp.client_id = p_client)
    and coalesce(sp.vsl_url, '') <> '';
$$;

revoke all on function public.panorama_vsl_links(text) from public, anon;
grant execute on function public.panorama_vsl_links(text) to authenticated, service_role;

comment on function public.panorama_vsl_links(text) is
  'Links de Voomly por funnel, para que el Panorama pueda abrir el VSL editado directo en vez de mandar a la carpeta.';

-- Verificacion:
--   select * from public.panorama_vsl_links() limit 10;
