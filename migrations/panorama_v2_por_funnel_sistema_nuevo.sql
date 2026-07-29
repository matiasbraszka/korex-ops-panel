-- panorama_v2_por_funnel_sistema_nuevo — el Panorama lee el SISTEMA NUEVO (DEL nativo + funnel_resources)
-- y trae los datos por FUNNEL, no por columnas legacy.
--
-- Cambios vs v1:
--  1. tiene_avatar / vsl_guionado / vsl_editado: además de las columnas viejas de strategy_pages
--     (avatars jsonb, vsl_script, vsl_url), ahora reconocen el contenido que vive en el DEL nativo
--     (del_sections del funnel: kind='avatares'/'vsl' con texto real) y las carpetas nativas
--     (funnel_resources bucket vsl_edit). Mismo criterio que el semáforo del pipeline (v8/v9):
--     el check se pone en verde si el entregable existe en el sistema nuevo.
--  2. testimonios: pasa a ser POR FUNNEL (no un recurso general del cliente). Sale de las carpetas
--     nativas del funnel (funnel_resources bucket='testimonios') o de la sección de testimonios del
--     DEL del funnel. Se agrega al objeto de cada funnel; el front lo muestra alineado por funnel.
--  3. created_at: se agrega la fecha de creación del funnel al objeto, para mostrarla en el panorama.
--
-- Nota: no cambia la firma (RETURNS TABLE) — solo el contenido del jsonb 'estrategias' → CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.clients_panorama()
 RETURNS TABLE(client_id text, client_name text, company text, niche text, n_estrategias integer, tiene_logo boolean, tiene_colores boolean, imagenes_files integer, testimonios_files integer, estrategias jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with recursive cl as (
    select id, name, company, niche from clients where drive_folder_url is not null
  ),
  recsub as (
    select n.client_id, n.id as folder_id,
      case
        when n.name ~* 'branding|logo' then 'branding'
        when n.name ~* 'foto|imagen|video|autoridad' then 'imagenes'
        when n.name ~* 'testimon' then 'testimonios'
        when n.name ~* 'informaci|empresa' then 'info'
        else 'otros' end as cat
    from client_drive_nodes n
    join client_drive_nodes r on r.id = n.parent_id and r.node_type='folder' and r.name ~* 'recursos'
    where n.node_type='folder'
  ),
  tree as (
    select rs.client_id, rs.cat, c.id as node_id, c.node_type, c.name as node_name
    from recsub rs join client_drive_nodes c on c.parent_id = rs.folder_id
    union all
    select t.client_id, t.cat, c.id, c.node_type, c.name
    from tree t join client_drive_nodes c on c.parent_id = t.node_id
  ),
  cnt as (
    select client_id, cat,
      sum(case when node_type <> 'folder' then 1 else 0 end)::int as files,
      sum(case when node_name ~* 'color|paleta' then 1 else 0 end)::int as color_files
    from tree group by client_id, cat
  ),
  res as (
    select client_id,
      bool_or(cat='branding' and files>0) as tiene_logo,
      bool_or(color_files>0) as tiene_colores,
      coalesce(sum(files) filter (where cat='imagenes'),0)::int as imagenes_files,
      coalesce(sum(files) filter (where cat='testimonios'),0)::int as testimonios_files
    from cnt group by client_id
  ),
  fun as (
    select p.strategy_id, count(*)::int as n,
      sum(case when coalesce(p.official_domain,'')='' and coalesce(p.prod_url,'')='' then 1 else 0 end)::int as sin_dom,
      bool_or(
        jsonb_array_length(coalesce(p.avatars,'[]'::jsonb)) > 0
        or exists(select 1 from del_sections ds where ds.doc_id=p.del_doc_id and ds.kind='avatares'
                  and length(regexp_replace(coalesce(ds.html,''),'<[^>]+>','','g')) > 200)
      ) as tiene_avatar,
      bool_or(
        coalesce(p.vsl_script,'') <> ''
        or exists(select 1 from del_sections ds where ds.doc_id=p.del_doc_id and ds.kind='vsl'
                  and length(regexp_replace(coalesce(ds.html,''),'<[^>]+>','','g')) > 300)
      ) as vsl_guionado,
      jsonb_agg(jsonb_build_object(
        'name', p.name,
        'created_at', p.created_at,
        'dominio', nullif(coalesce(nullif(p.official_domain,''), nullif(p.prod_url,''), ''), ''),
        'tiene_avatar', (jsonb_array_length(coalesce(p.avatars,'[]'::jsonb)) > 0
          or exists(select 1 from del_sections ds where ds.doc_id=p.del_doc_id and ds.kind='avatares'
                    and length(regexp_replace(coalesce(ds.html,''),'<[^>]+>','','g')) > 200)),
        'vsl_guionado', (coalesce(p.vsl_script,'') <> ''
          or exists(select 1 from del_sections ds where ds.doc_id=p.del_doc_id and ds.kind='vsl'
                    and length(regexp_replace(coalesce(ds.html,''),'<[^>]+>','','g')) > 300)),
        'vsl_editado', (coalesce(p.vsl_url,'') <> ''
          or exists(select 1 from funnel_resources fr where fr.strategy_id=p.strategy_id and fr.bucket_key='vsl_edit')),
        'testimonios_files', (select count(*)::int from funnel_resources fr where fr.strategy_id=p.strategy_id and fr.bucket_key='testimonios'),
        'tiene_testimonios', exists(select 1 from funnel_resources fr where fr.strategy_id=p.strategy_id and fr.bucket_key='testimonios'),
        'tiene_pixel', (coalesce(p.pixel_code,'') <> '' or coalesce(p.pixel_id,'') <> ''),
        'tiene_clarity', coalesce(p.clarity_id,'') <> '',
        'tiene_eventos', jsonb_array_length(coalesce(p.conversion_events,'[]'::jsonb)) > 0
      ) order by p.position) as arr
    from strategy_pages p group by p.strategy_id
  ),
  del as (
    select strategy_id, bool_or(doc_kind='del' and coalesce(char_count,0) > 0) as del_ok
    from client_brain_docs where strategy_id is not null group by strategy_id
  ),
  estr as (
    select s.client_id, count(*)::int as n,
      jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name,
        'tipo', case when s.name ~* 'producto' then 'Producto' when s.name ~* 'reclutamiento' then 'Reclutamiento' else null end,
        'del_ok', coalesce(d.del_ok, false),
        'n_funnels', coalesce(f.n,0),
        'n_sin_dominio', coalesce(f.sin_dom,0),
        'funnels', coalesce(f.arr,'[]'::jsonb),
        'tiene_avatar', coalesce(f.tiene_avatar,false),
        'vsl_guionado', coalesce(f.vsl_guionado,false),
        'tiene_logo', coalesce(rc.tiene_logo,false),
        'tiene_colores', coalesce(rc.tiene_colores,false),
        'imagenes_files', coalesce(rc.imagenes_files,0),
        'testimonios_files', coalesce(rc.testimonios_files,0)
      ) order by s.position) as arr
    from strategies s
    left join fun f on f.strategy_id = s.id
    left join del d on d.strategy_id = s.id
    left join res rc on rc.client_id = s.client_id
    group by s.client_id
  )
  select cl.id, cl.name, cl.company, cl.niche,
    coalesce(estr.n,0),
    coalesce(res.tiene_logo,false), coalesce(res.tiene_colores,false),
    coalesce(res.imagenes_files,0), coalesce(res.testimonios_files,0),
    coalesce(estr.arr,'[]'::jsonb)
  from cl
  left join estr on estr.client_id = cl.id
  left join res on res.client_id = cl.id
  order by cl.name;
$function$;
