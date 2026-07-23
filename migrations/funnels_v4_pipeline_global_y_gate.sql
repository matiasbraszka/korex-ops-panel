-- migrations/funnels_v4_pipeline_global_y_gate.sql
--
-- Dos cambios al motor de pasos, en UNA sola reescritura (es la misma funcion:
-- hacerlo en dos migraciones seria reescribirla dos veces por gusto).
--
-- ── 1. El riel MIENTE EN VERDE ── 🔴 bug vivo, 2 funnels ─────────────────────
-- El paso "DEL cargado" se daba por listo con char_count>0. Pero el DEL se crea
-- desde una PLANTILLA al arrancar el funnel y se llena despues, asi que una
-- plantilla vacia ya contaba como DEL cargado.
--
-- El gate de los agentes (descubrimiento_status v5/v6) resolvio esto hace rato
-- subiendo el piso a 15000. Este motor se quedo con el criterio viejo -> el riel
-- y los agentes se CONTRADICEN: el panel dice "DEL cargado ✓" en verde y el
-- agente se niega a trabajar sobre el mismo funnel.
--
-- Medido 2026-07-17, los 2 afectados son justo los de mas tareas del sistema:
--   · cristian steinkeller · "AI TECH"      · DEL 2.678 chars · 0 avatares · 27 tareas
--   · Liliana Vega         · "Liliana Vega" · DEL 7.593 chars · 0 avatares · 22 tareas
-- Ninguno tiene avatares, asi que el OR de has_del_eff no los rescata: los dos
-- pasan a decir "Falta cargar/sincronizar el DEL", que es la verdad.
--
-- OJO — EL 15000 AHORA VIVE EN 3 LUGARES Y TIENEN QUE DECIR LO MISMO:
--   · migrations/descubrimiento_gate_v6_avatar_sin_del.sql  (el gate)
--   · supabase/functions/agent-chat/index.ts  (const DEL_MINIMO)
--   · aca
-- No hay forma de compartir la constante entre SQL y TS. Si cambia, cambian los 3.
--
-- ── 2. El motor se vuelve GLOBAL, sin romper a nadie ─────────────────────────
-- El kanban necesita los 47 funnels de todos los clientes. Llamar esta funcion 35
-- veces (una por cliente) seria inviable.
--
-- La firma NO cambia: mismo nombre, mismo tipo de argumento (text), mismo tipo de
-- retorno. Solo se le agrega un DEFAULT. Eso significa:
--   · cerebro_pipeline_status('c_123')  -> sigue igual, exactamente como hoy.
--     Los 2 llamadores vivos (FunnelsView.jsx:1262, AgentesPage.jsx:57) NO cambian.
--   · cerebro_pipeline_status()         -> los 47 funnels x 6 pasos = ~282 filas.
-- Swap puro de cuerpo, cero ventana de error (no hace falta drop function).
--
-- POR QUE NO clients_panorama(): existe y ya es global, pero no esta versionada en
-- el repo y su funnels[] no expone funnel_id ni el estado por paso. Sirve para
-- recursos, no para el %.
-- POR QUE NO calcularlo en JS: strategyPages ya tiene los 47 en memoria
-- (AppContext.jsx:2290), pero duplicaria las reglas de los gates en dos lugares
-- que se desincronizan -- que es EXACTAMENTE el bug que arregla el punto 1.
--
-- REQUIERE funnels_v1_aplanado.sql (usa p.client_id y p.tipo).

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
      -- has_del sigue por strategy_id: es donde client_brain_docs vive.
      -- char_count>=15000 (ANTES: >0) -> una plantilla vacia ya no cuenta como DEL.
      -- El 15000 es el MISMO numero de descubrimiento_status() y agent-chat.
      exists(select 1 from client_brain_docs d where d.strategy_id=p.strategy_id and d.doc_kind='del' and d.char_count>=15000) as has_del,
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
    -- ANTES: where p.client_id = p_client_id
    -- Sin argumento -> todos los funnels (el kanban). Con argumento -> identico a hoy.
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

-- ── Verificacion (correr despues de aplicar) ─────────────────────────────────
-- 1. GLOBAL: sin argumento trae los 47 funnels x 6 pasos.
--    select count(*) as filas, count(distinct funnel_id) as funnels
--      from cerebro_pipeline_status();                       -- ~282 / 47
--
-- 2. NO SE ROMPIO EL LLAMADO DE A UN CLIENTE (lo que usan FunnelsView y AgentesPage):
--    select count(*) from cerebro_pipeline_status('c_1775304975528_pzu8sk');  -- 18 (3 funnels x 6)
--
-- 3. EL RIEL DEJO DE MENTIR (verificado 2026-07-17 al aplicar):
--    select funnel, status, detail from cerebro_pipeline_status()
--     where stage='del' and funnel in ('AI TECH','Liliana Vega');
--    -- ANTES: listo / 'OK'  (en verde, sobre una plantilla vacia)
--    -- AHORA: bloqueado / 'Bloqueado: falta definir el tipo de funnel'
--
--    OJO, el mensaje NO es "Falta cargar/sincronizar el DEL" como se esperaba, y
--    esta bien que no lo sea: estos 2 funnels son TAMBIEN los 2 unicos sin tipo, y
--    el tipo es el prerequisito del paso del DEL. El riel ahora senala lo PRIMERO
--    que hay que arreglar, no lo segundo.
--
--    Por que antes decia 'listo' aunque les faltara el tipo: el case evalua
--    `done` ANTES que `prereq_ok` -- con has_del_eff=true ganaba 'listo' y se
--    comia el bloqueo. Al bajar has_del_eff a false, el prereq vuelve a mandar.
--
--    Los 2 son justo los de mas trabajo encima: 27 tareas abiertas (AI TECH) y
--    22 (Liliana Vega). El panel les decia que el DEL estaba listo.
--
-- 4. Solo esos 2 cambiaron (40 listo / 5 pendiente / 2 bloqueado = 47):
--    select status, count(*) from cerebro_pipeline_status()
--     where stage='del' group by status;
--
-- ── Rollback ────────────────────────────────────────────────────────────────
-- Volver a aplicar funnels_v2_pipeline_tipo.sql tal cual: restaura char_count>0 y
-- la firma sin default (el kanban deja de andar, el resto queda como hoy).
