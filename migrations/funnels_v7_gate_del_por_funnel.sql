-- migrations/funnels_v7_gate_del_por_funnel.sql
--
-- El gate del paso "DEL" del semáforo (cerebro_pipeline_status) pasa a respetar el
-- puntero por-funnel `strategy_pages.del_doc_id` (funnels_v6_del_por_funnel.sql).
--
-- ÚNICO cambio respecto de funnels_v4: la línea `has_del`. Antes resolvía SIEMPRE
-- por strategy_id (la carpeta). Ahora:
--     · si el funnel tiene del_doc_id  → mira ESE doc puntual.
--     · si no (NULL)                   → fallback por strategy_id, idéntico a v4.
-- Todo lo demás de la función es igual. Swap puro de cuerpo, misma firma, cero
-- ventana de error (no hace falta drop function). Como los funnels 1:1 quedaron
-- apuntando al MISMO doc que ya resolvían, su has_del no cambia. Los multi-funnel
-- en NULL siguen por carpeta hasta que se les asigne DEL propio: nada se rompe.
--
-- OJO — el piso 15000 sigue viviendo en 3 lugares que deben coincidir (ver
-- funnels_v4_pipeline_global_y_gate.sql:22-26). Este cambio NO lo toca.
--
-- REQUIERE funnels_v6_del_por_funnel.sql (usa p.del_doc_id).

create or replace function public.cerebro_pipeline_status(p_client_id text default null)
returns table(
  strategy_id text, strategy text, funnel_id text, funnel text,
  stage text, stage_label text, ord integer,
  status text, substate text, detail text, can_generate boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with f as (
    select
      s.id as sid, s.name as sname, coalesce(s.position,0) as spos,
      p.id as fid, p.name as fname, p.position as fpos,
      (p.tipo is not null) as has_tipo,
      -- has_del POR FUNNEL: si hay del_doc_id, mira ese doc; si no, fallback por
      -- strategy_id (la carpeta), como en v4. char_count>=15000 = plantilla vacía no cuenta.
      -- El 15000 es el MISMO numero de descubrimiento_status() y agent-chat.
      exists(select 1 from client_brain_docs d
              where d.doc_kind='del' and d.char_count>=15000
                and case when p.del_doc_id is not null
                         then d.id = p.del_doc_id
                         else d.strategy_id = p.strategy_id end) as has_del,
      -- ¿El funnel tiene AL MENOS un avatar generado? Si los tiene, el DEL se cargó y se usó,
      -- aunque el DEL haya quedado archivado bajo una estrategia hermana (estrategias duplicadas).
      (jsonb_array_length(coalesce(p.avatars,'[]'::jsonb)) > 0) as has_any_avatar,
      (select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a where coalesce(a->>'spec_text','') <> '')>0 as has_avatares,
      (coalesce(p.vsl_script,'') <> '') as vsl_guionado,
      (coalesce(p.vsl_url,'') <> '') as vsl_editado,
      (select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a where coalesce(a->>'ad_script','') <> '')>0 as ads_guionado,
      (select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a where coalesce((a->>'rec_files')::int,0) > 0)>0 as ads_grabado,
      ((select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a where coalesce(a->>'ad_url','') <> '')>0
        or (select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a where coalesce((a->>'edit_files')::int,0) > 0)>0) as ads_editado,
      (coalesce(p.prod_url,'') <> '' or coalesce(p.official_domain,'') <> '') as landing_pub
    from strategy_pages p
    left join strategies s on s.id = p.strategy_id
    where (p_client_id is null or p.client_id = p_client_id)
  ),
  m as (
    select f.*,
      (f.has_del or f.has_any_avatar) as has_del_eff,
      case when f.vsl_editado then 'editado' when f.vsl_guionado then 'guion' else 'nada' end as vsl_sub,
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
      ('del', 2, 'DEL cargado (maestro: avatares + guiones)',
        m.has_del_eff, m.has_tipo, null::text,
        case when m.has_del_eff then 'OK' when m.has_tipo then 'Falta cargar/sincronizar el DEL' else 'Bloqueado: falta definir el tipo de funnel' end),
      ('avatares', 3, 'Avatares con detalle (spec del DEL)',
        m.has_avatares, m.has_del_eff, null::text,
        case when m.has_avatares then 'OK' when m.has_del_eff then 'Listo para armar los avatares' else 'Bloqueado: falta el DEL' end),
      ('vsl', 4, 'VSL del funnel',
        m.vsl_editado, m.has_avatares, m.vsl_sub,
        case m.vsl_sub when 'editado' then 'Editado (link puesto)' when 'guion' then 'Guionado (falta grabar/editar)'
             else (case when m.has_avatares then 'Sin empezar: falta el guión del VSL' else 'Bloqueado: falta armar los avatares' end) end),
      ('anuncios', 5, 'Anuncios por avatar',
        m.ads_editado, m.vsl_guionado, m.ads_sub,
        case m.ads_sub when 'editado' then 'Editados (link/archivos puestos)' when 'grabado' then 'Grabados (falta editar)'
             when 'guion' then 'Copy hecho (falta grabar/editar)'
             else (case when m.vsl_guionado then 'Sin empezar (VSL ya guionado, se puede arrancar)' else 'Bloqueado: falta el guión del VSL de este funnel' end) end),
      ('landing', 6, 'Landing / BCL',
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

-- ── Verificación ─────────────────────────────────────────────────────────────
-- 1. La firma no cambió (los 2 llamadores vivos siguen igual):
--    select count(*) from cerebro_pipeline_status('c_1775304975528_pzu8sk');  -- 18 (3 funnels x 6)
-- 2. Un funnel con del_doc_id apunta a su propio DEL; uno en NULL sigue por carpeta.
--
-- ── Rollback ─────────────────────────────────────────────────────────────────
-- Volver a aplicar funnels_v4_pipeline_global_y_gate.sql tal cual (has_del por strategy_id).
