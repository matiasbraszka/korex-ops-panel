-- migrations/panorama_v6_por_funnel.sql
--
-- El Panorama de UN funnel, para poder mostrarlo dentro de la ficha de la tarea.
--
-- Hoy el Panorama vive en clients_panorama(): recorre TODOS los clientes, arma el
-- árbol de Drive de cada uno y devuelve todo junto. Sirve para la pantalla, pero
-- llamarla desde una tarea sería recorrer la agencia entera para pintar diez
-- renglones. Esta función hace lo mismo para un solo funnel.
--
-- Las reglas son literalmente las de clients_panorama v4 (panorama_v4_crm_prod.sql:66-84),
-- copiadas para que los dos digan lo mismo:
--   · tiene_avatar   → hay avatares cargados en el funnel O una sección 'avatares'
--                      del DEL con más de 200 caracteres de texto real
--   · vsl_guionado   → hay vsl_script O una sección 'vsl' con más de 300 caracteres
--   · vsl_editado    → hay vsl_url O algún recurso en la carpeta vsl_edit
--   · ads_editado    → (nuevo acá) la misma regla que usa el semáforo del pipeline
--                      en cerebro_pipeline_del_anuncios.sql:30-32
--
-- OJO, limitación heredada: vsl_editado, ads_editado y testimonios se cuentan por
-- strategy_id, que es la CARPETA de Drive y la comparten los funnels hermanos. Dos
-- funnels de la misma carpeta muestran el mismo número. Es un problema anterior a
-- esta función; se deja igual para no decir una cosa acá y otra en el Panorama.
--
-- ADITIVA: crea una función nueva, no toca clients_panorama().

create or replace function public.panorama_funnel(p_funnel_id text)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select case when not public.is_team_member() then null else (
    select jsonb_build_object(
      'funnel_id',   p.id,
      'nombre',      p.name,
      'tipo',        p.tipo,
      'estado',      p.status,
      'cliente',     c.name,
      'dominio',     nullif(coalesce(nullif(p.official_domain,''), nullif(p.prod_url,''), ''), ''),
      'del_ok',      exists (select 1 from public.client_brain_docs d
                              where d.id = p.del_doc_id and coalesce(d.char_count,0) > 0),
      'tiene_avatar', (
        jsonb_array_length(coalesce(p.avatars,'[]'::jsonb)) > 0
        or exists (select 1 from public.del_sections ds
                    where ds.doc_id = p.del_doc_id and ds.kind = 'avatares'
                      and length(regexp_replace(coalesce(ds.html,''),'<[^>]+>','','g')) > 200)),
      'vsl_guionado', (
        coalesce(p.vsl_script,'') <> ''
        or exists (select 1 from public.del_sections ds
                    where ds.doc_id = p.del_doc_id and ds.kind = 'vsl'
                      and length(regexp_replace(coalesce(ds.html,''),'<[^>]+>','','g')) > 300)),
      'ads_guionado', exists (select 1 from public.del_sections ds
                               where ds.doc_id = p.del_doc_id and ds.kind = 'anuncios'
                                 and length(regexp_replace(coalesce(ds.html,''),'<[^>]+>','','g')) > 200),
      'vsl_editado', (
        coalesce(p.vsl_url,'') <> ''
        or exists (select 1 from public.funnel_resources fr
                    where fr.strategy_id = p.strategy_id and fr.bucket_key = 'vsl_edit')),
      'vsl_url', nullif(coalesce(p.vsl_url,''), ''),
      'ads_editado', (
        (select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a
          where coalesce(a->>'ad_url','') <> '') > 0
        or (select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a
             where coalesce((a->>'edit_files')::int,0) > 0) > 0
        or exists (select 1 from public.funnel_resources fr
                    where fr.strategy_id = p.strategy_id and fr.bucket_key = 'ad_edit')),
      'ads_entregados', (select count(*)::int from public.funnel_resources fr
                          where fr.strategy_id = p.strategy_id and fr.bucket_key = 'ad_edit'),
      'ads_target', p.ads_target,
      'testimonios_files', (select count(*)::int from public.funnel_resources fr
                             where fr.strategy_id = p.strategy_id and fr.bucket_key = 'testimonios'),
      'tiene_pixel',   (coalesce(p.pixel_code,'') <> '' or coalesce(p.pixel_id,'') <> ''),
      'tiene_clarity', coalesce(p.clarity_id,'') <> '',
      'tiene_eventos', jsonb_array_length(coalesce(p.conversion_events,'[]'::jsonb)) > 0,
      -- Lo que está esperando al cliente ahora mismo, para no tener que abrir el DEL.
      'guiones_para_grabar', (select count(*)::int from public.del_sections ds
                               where ds.doc_id = p.del_doc_id and ds.para_grabar
                                 and ds.kind in ('vsl','anuncios')
                                 and coalesce(ds.fase,'lanzamiento') = 'lanzamiento'
                                 and coalesce(ds.grab_flujo,'') <> 'grabado'),
      'esperando_revision', (select count(*)::int from public.del_sections ds
                              left join public.portal_guion_status gs
                                     on gs.section_id = ds.id and gs.client_id = p.client_id
                             where ds.doc_id = p.del_doc_id
                               and coalesce(ds.estado_seccion,'') = 'terminado'
                               and coalesce(ds.accion_cliente,'') = 'revisar'
                               and not coalesce(gs.revisado, false))
    )
    from public.strategy_pages p
    left join public.clients c on c.id = p.client_id
    where p.id = p_funnel_id
  ) end;
$function$;

comment on function public.panorama_funnel(text) is
  'El Panorama (qué hay / qué falta) de UN solo funnel. Mismas reglas que '
  'clients_panorama(), sin recorrer toda la agencia. Lo usa el bloque de Panorama '
  'dentro de la ficha de la tarea. Devuelve null si quien llama no es del equipo.';

revoke all   on function public.panorama_funnel(text) from public, anon;
grant execute on function public.panorama_funnel(text) to authenticated;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   select public.panorama_funnel(id) from public.strategy_pages limit 1;
--   -- Y que coincida con lo que dice el Panorama grande para ese mismo funnel.
--
-- ROLLBACK: drop function if exists public.panorama_funnel(text);
