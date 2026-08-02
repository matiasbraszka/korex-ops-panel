-- accesos_v1_crm_produccion.sql
--
-- Pedido de Matias: "en los accesos del cliente algunas credenciales del CRM
-- PRODUCCION siguen estando mal, fijate cuales estan mal para corregirlas, y los
-- que no tengan sus accesos al CRM PRODUCCION colocaselos".
--
-- Se audito la lista de 25 filas que paso contra `clients.links` (category
-- 'acceso'). Resultado:
--
--   14 coincidian exactas  -> no se tocan.
--    1 con la clave MAL    -> Marta Torrico (la base decia 'Torrico2026.').
--    2 cargadas con la ETIQUETA equivocada -> existian pero el panel las contaba
--      como faltantes: el Panorama busca una etiqueta que diga 'crm' Y 'produc'
--      (ver clients_panorama), y estaban como "Metodo Korex" y "CRM" a secas.
--    7 no tenian NINGUN acceso de produccion cargado -> se cargan.
--
-- Las claves vienen con espacios de sobra del copiado (Jose Piquer traia una
-- tirada larguisima de espacios antes de la clave): se guardan con btrim.
--
-- NO se toca ningun otro link del cliente: se reemplaza solo la fila de CRM
-- produccion y se conserva el resto del array tal cual (laboratorio, Gmail marca
-- blanca, forms, etc.).

do $mig$
declare
  r record;
  v_links jsonb;
  v_otros jsonb;
  v_fila jsonb;
  n_upd int := 0; n_ins int := 0;
begin
  for r in
    select * from (values
      -- (client_id,                     usuario,                              clave)
      ('c_1775304975528_pe11ka', 'marthatorrico@sarexlabs.com',        'MartatorricoBBC26*'),  -- clave mal en la base
      ('c_1775304975528_ci40ns', 'hello@jacquiemarquez.com',           'rootAdmin2026'),       -- etiqueta "Metodo Korex"
      ('c_1775304975528_i7wpl7', 'theawakeningsanctuary@gmail.com',    'rootAdmin2026'),       -- etiqueta "CRM"
      ('c_1777477572874_hdkcr7', 'ajcruzemprende@gmail.com',           'admin1234.'),          -- faltaba
      ('c_1780874493120_19fbxk', 'aldazabal_pool@hotmail.com',         'Sergio.123'),          -- faltaba
      ('c_1781537622066_9et1pr', 'eliasblascoibanez@gmail.com',        'rootAdmin2026'),       -- faltaba
      ('c_1781546055319_vuvnw2', 'Fabianacarrascocueto@gmail.com',     'rootAdmin2026'),       -- faltaba
      ('c_1783336326029_lwvluw', 'Lilianavegacarvajal@gmail.com',      'rootAdmin2026'),       -- faltaba
      ('c_1783357462096_xxomib', 'aitechone.io@gmail.com',             'rootAdmin2026'),       -- faltaba
      ('c_1782406022964_xr15du', 'rafaelbonilla@mediadorallinone.com', 'rootAdmin2026')        -- faltaba
    ) as t(client_id, usuario, clave)
  loop
    select coalesce(links, '[]'::jsonb) into v_links from public.clients where id = r.client_id;
    if v_links is null then
      raise exception 'Cliente inexistente: %', r.client_id;
    end if;

    -- Todo lo que NO sea el acceso de produccion del CRM queda intacto. Se saca
    -- tambien la fila mal etiquetada ("Metodo Korex" / "CRM") reconociendola por
    -- la URL de produccion, para no dejar duplicados.
    select coalesce(jsonb_agg(l), '[]'::jsonb) into v_otros
      from jsonb_array_elements(v_links) l
     where not (
       coalesce(l->>'category','') = 'acceso'
       and (
         (l->>'label' ~* 'crm' and l->>'label' ~* 'produc')
         or (coalesce(l->>'url','') ~* '^https?://(www\.)?metodokorex\.com/?$'
             and coalesce(l->>'label','') !~* 'sandbox|laborator|testing|forms')
       )
     );

    v_fila := jsonb_build_object(
      'category', 'acceso',
      'label',    'CRM KOREX | PRODUCCIÓN',
      'url',      'https://metodokorex.com',
      'email',    btrim(r.usuario),
      'password', btrim(r.clave),
      'notes',    '');

    update public.clients set links = v_otros || jsonb_build_array(v_fila)
     where id = r.client_id;

    if jsonb_array_length(v_links) = jsonb_array_length(v_otros) then n_ins := n_ins + 1;
    else n_upd := n_upd + 1; end if;
  end loop;

  raise notice 'CRM produccion: % corregidos, % cargados nuevos', n_upd, n_ins;
end $mig$;

-- Verificacion:
--   select c.name, l->>'label', l->>'email', l->>'password'
--     from public.clients c, jsonb_array_elements(c.links) l
--    where l->>'label' = 'CRM KOREX | PRODUCCIÓN' order by 1;
--
--   -- y que el Panorama los cuente (tiene_crm_prod):
--   select client_name, tiene_crm_prod from public.clients_panorama() order by 2, 1;
