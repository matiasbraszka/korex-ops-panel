-- funnels_v10_pipeline_sin_del — saca el paso "DEL" del semáforo (quedó del modelo viejo).
--
-- El pipeline real hoy es: Estrategia → Avatares → VSL → Anuncios → Landing (5 pasos).
-- El paso "DEL" era un artefacto de cuando el DEL/Estrategia era una capa aparte; ya no
-- corresponde mostrarlo como escalón del funnel. Nada gatea sobre stage='del' (las
-- referencias a 'del' en el código son al DOCUMENTO doc_kind='del', no a este paso).
--
-- Efecto colateral (buscado): el "Avance" del portal (v62/v63) cuenta los pasos de este
-- motor; al pasar de 6 a 5 pasos de producción, el avance se recalcula solo.
--
-- Único cambio de lógica: el prerrequisito de "Avatares" pasa de has_del a has_tipo
-- (con el tipo definido ya se pueden armar los avatares).

CREATE OR REPLACE FUNCTION public.cerebro_pipeline_status(p_client_id text DEFAULT NULL::text)
 RETURNS TABLE(strategy_id text, strategy text, funnel_id text, funnel text, stage text, stage_label text, ord integer, status text, substate text, detail text, can_generate boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with f as (
    select
      s.id as sid, s.name as sname, coalesce(s.position,0) as spos,
      p.id as fid, p.name as fname, p.position as fpos,
      (p.tipo is not null) as has_tipo,
      (jsonb_array_length(coalesce(p.avatars,'[]'::jsonb)) > 0) as has_any_avatar,
      (select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a where coalesce(a->>'spec_text','') <> '')>0 as has_avatares,
      (coalesce(p.vsl_script,'') <> ''
        or exists(select 1 from del_sections ds join client_brain_docs cbd on cbd.id=ds.doc_id
                  where cbd.strategy_id=p.strategy_id and cbd.doc_kind='del' and ds.kind='vsl'
                    and length(regexp_replace(coalesce(ds.html,''),'<[^>]+>','','g')) > 300)) as vsl_guionado,
      (coalesce(p.vsl_url,'') <> ''
        or exists(select 1 from funnel_resources fr where fr.strategy_id=p.strategy_id and fr.bucket_key='vsl_edit')) as vsl_editado,
      exists(select 1 from funnel_resources fr where fr.strategy_id=p.strategy_id and fr.bucket_key='vsl_rec') as vsl_grabado,
      (select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a where coalesce(a->>'ad_script','') <> '')>0 as ads_guionado,
      (select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a where coalesce((a->>'rec_files')::int,0) > 0)>0 as ads_grabado,
      ((select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a where coalesce(a->>'ad_url','') <> '')>0
        or (select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a where coalesce((a->>'edit_files')::int,0) > 0)>0
        or exists(select 1 from funnel_resources fr where fr.strategy_id=p.strategy_id and fr.bucket_key='ad_edit')) as ads_editado,
      (coalesce(p.prod_url,'') <> '' or coalesce(p.official_domain,'') <> '') as landing_pub
    from strategy_pages p
    left join strategies s on s.id = p.strategy_id
    where (p_client_id is null or p.client_id = p_client_id)
  ),
  m as (
    select f.*,
      case when f.vsl_editado then 'editado' when f.vsl_grabado then 'grabado' when f.vsl_guionado then 'guion' else 'nada' end as vsl_sub,
      case when f.ads_editado then 'editado'
           when f.ads_grabado then 'grabado'
           when f.ads_guionado then 'guion' else 'nada' end as ads_sub,
      case when f.landing_pub then 'disenado' else 'nada' end as landing_sub
    from f
  ),
  g as (
    select m.*, v.stage, v.ord, v.label, v.done, v.prereq_ok, v.substate, v.detail
    from m cross join lateral (values
      ('estrategia', 1, 'Tipo de funnel definido (Reclutamiento/Producto)',
        m.has_tipo, true, null::text,
        case when m.has_tipo then 'OK' else 'Falta definir el tipo de funnel (Reclutamiento/Producto)' end),
      ('avatares', 2, 'Avatares con detalle',
        m.has_avatares, m.has_tipo, null::text,
        case when m.has_avatares then 'OK' when m.has_tipo then 'Listo para armar los avatares' else 'Bloqueado: falta definir el tipo de funnel' end),
      ('vsl', 3, 'VSL del funnel',
        m.vsl_editado, m.has_avatares, m.vsl_sub,
        case m.vsl_sub when 'editado' then 'Editado (link o video puesto)' when 'grabado' then 'Grabado (falta editar)' when 'guion' then 'Guionado (falta grabar/editar)'
             else (case when m.has_avatares then 'Sin empezar: falta el guión del VSL' else 'Bloqueado: falta armar los avatares' end) end),
      ('anuncios', 4, 'Anuncios por avatar',
        m.ads_editado, m.vsl_guionado, m.ads_sub,
        case m.ads_sub when 'editado' then 'Editados (link/archivos puestos)' when 'grabado' then 'Grabados (falta editar)'
             when 'guion' then 'Copy hecho (falta grabar/editar)'
             else (case when m.vsl_guionado then 'Sin empezar (VSL ya guionado, se puede arrancar)' else 'Bloqueado: falta el guión del VSL de este funnel' end) end),
      ('landing', 5, 'Landing / BCL',
        m.landing_pub, m.vsl_guionado, m.landing_sub,
        case m.landing_sub when 'disenado' then 'Diseñada (link de producción/publicidad)'
             else (case when m.vsl_guionado then 'Sin empezar (se puede diseñar)' else 'Bloqueado: falta el guión del VSL de este funnel' end) end)
    ) v(stage, ord, label, done, prereq_ok, substate, detail)
  )
  select sid, sname, fid, fname, stage, label, ord,
    case when done then 'listo' when prereq_ok then 'pendiente' else 'bloqueado' end,
    substate, detail, (not done and prereq_ok)
  from g order by spos, fpos, ord;
$function$;

notify pgrst, 'reload schema';
