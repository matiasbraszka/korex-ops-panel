-- migrations/panorama_v7_anuncios_editados.sql
--
-- Falta saber si están los ANUNCIOS EDITADOS de cada funnel (pedido de Matías).
--
-- El Panorama muestra el VSL editado pero nunca miró los anuncios: clients_panorama()
-- no nombra 'ad_edit' en ninguna versión (v2, v3, v4). O sea que la columna donde el
-- equipo entrega el grueso del trabajo no aparecía en el tablero de "qué falta".
--
-- La regla no se inventa acá: es la misma que ya usa el semáforo del pipeline en
-- cerebro_pipeline_del_anuncios.sql:30-32 — hay anuncio editado si el avatar tiene
-- ad_url, o tiene edit_files, o hay algún archivo en la carpeta ad_edit. Se agrega
-- además el conteo y el objetivo (strategy_pages.ads_target, lo que el equipo se
-- comprometió a entregar) para poder mostrar "3 de 15" y no solo un tilde.
--
-- Se edita la función VIVA (pg_get_functiondef + replace) en vez de recrearla desde
-- el .sql del repo: v4 es la última versión versionada, pero si alguien parchó algo
-- en caliente después, recrear desde el archivo lo pisaría en silencio.
--
-- OJO, limitación heredada: igual que vsl_editado y testimonios_files, esto cuenta
-- por strategy_id (la CARPETA de Drive), que los funnels hermanos comparten. Dos
-- funnels de la misma carpeta van a mostrar el mismo número. Es anterior a este
-- cambio; se deja igual para que el Panorama no diga una cosa distinta según la
-- columna.

do $$
declare v_def text; v_nuevo text; v_add text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'clients_panorama' limit 1;
  if v_def is null then raise exception 'clients_panorama no existe'; end if;

  if position('''ads_editado''' in v_def) > 0 then
    raise notice 'clients_panorama ya trae ads_editado: no se toca';
    return;
  end if;

  v_add :=
    '''ads_editado'', ((select count(*) from jsonb_array_elements(coalesce(p.avatars,''[]''::jsonb)) a where coalesce(a->>''ad_url'','''') <> '''')>0'
    || ' or (select count(*) from jsonb_array_elements(coalesce(p.avatars,''[]''::jsonb)) a where coalesce((a->>''edit_files'')::int,0) > 0)>0'
    || ' or exists(select 1 from funnel_resources fr where fr.strategy_id=p.strategy_id and fr.bucket_key=''ad_edit'')),' || chr(10)
    || '        ''ads_entregados'', (select count(*)::int from funnel_resources fr where fr.strategy_id=p.strategy_id and fr.bucket_key=''ad_edit''),' || chr(10)
    || '        ''ads_target'', p.ads_target,' || chr(10)
    || '        ';

  -- Ancla única dentro del objeto de cada FUNNEL (el otro 'testimonios_files' vive
  -- en el bloque de estrategia y no sirve como ancla).
  v_nuevo := replace(v_def,
    '        ''tiene_pixel'', (coalesce(p.pixel_code,'''') <> ''''',
    '        ' || v_add || '''tiene_pixel'', (coalesce(p.pixel_code,'''') <> ''''');

  if v_nuevo = v_def then
    raise exception 'No encontré dónde enganchar ads_editado en clients_panorama';
  end if;
  execute v_nuevo;
end
$$;

comment on function public.clients_panorama() is
  'Panorama "qué hay / qué falta" de toda la agencia, por cliente y estrategia. '
  'OJO: vsl_editado, ads_editado, ads_entregados y testimonios_files se cuentan por '
  'strategy_id (la carpeta de Drive), que los funnels hermanos comparten: dos funnels '
  'de la misma carpeta muestran el mismo número. Para un solo funnel, panorama_funnel().';

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   select f->>'name', f->>'ads_editado', f->>'ads_entregados', f->>'ads_target'
--     from public.clients_panorama() cp,
--          jsonb_array_elements(cp.estrategias) e, jsonb_array_elements(e->'funnels') f
--    limit 10;
--   -- Y que coincida con panorama_funnel() para los mismos funnels.
--
-- ROLLBACK: volver a aplicar migrations/panorama_v4_crm_prod.sql.
