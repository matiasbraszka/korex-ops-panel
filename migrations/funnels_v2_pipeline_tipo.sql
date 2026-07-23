-- migrations/funnels_v2_pipeline_tipo.sql
--
-- El riel de pasos deja de adivinar el tipo con una regex.
--
-- cerebro_pipeline_status es el motor que alimenta el semaforo de 6 pasos del
-- funnel (PipelineSemaforo en FunnelsView.jsx:342), el "% listo" y el "que lo
-- frena". Ya estaba VIVO en produccion pero NO en el repo: esta definicion se
-- exporto de la base el 2026-07-17 con pg_get_functiondef.
--
-- Que cambia (solo TRES cosas del cuerpo):
--   1. La fuente: manda el FUNNEL. Antes era `from strategies s join
--      strategy_pages p`; ahora `from strategy_pages p left join strategies s`,
--      filtrando por p.client_id (la columna que agrego funnels_v1_aplanado).
--      strategies queda como LEFT JOIN porque todavia se necesita para una cosa:
--      resolver el DEL (ver punto 3).
--   2. Paso 1: `(s.name ~* '(reclutamiento|producto)')` -> `(p.tipo is not null)`.
--      Muere la regex. El paso 1 se llamaba "Estrategia definida" y era una
--      adivinanza sobre el nombre de una carpeta de Drive; ahora es un campo.
--      Efecto real: los 2 funnels de Jose Luis Rivas ("Producto sin pre-landing",
--      "Producto V2 Con pre-landing") dejan de figurar mal.
--   3. has_del: NO SE TOCA. Sigue resolviendo por strategy_id porque es ahi donde
--      client_brain_docs realmente vive. Es la costura honesta del aplanado:
--      dos funnels en la misma carpeta de Drive comparten DEL. Ya es asi hoy --
--      el aplanado no lo empeora, lo hace visible. Se resuelve en la Fase 3
--      (del_documents con FK al funnel).
--
-- POR QUE NO SE CAMBIA LA FIRMA: `create or replace function` no puede cambiar
-- el tipo de retorno. Cambiar los OUT params exigiria `drop function` primero,
-- y en esa ventana el riel tira error para todos. Asi que la firma queda
-- IDENTICA: strategy_id y strategy se siguen devolviendo (ahora significan "la
-- carpeta del Drive"). El front solo usa funnel_id y ord (FunnelsView:1275), asi
-- que no le molesta. Swap puro de cuerpo, cero ventana de error.
--
-- REQUIERE funnels_v1_aplanado.sql aplicado antes (usa p.client_id y p.tipo).
--
-- OJO: este es el UNICO paso de la Fase 1 que no es inerte -- cambia el
-- comportamiento en vivo apenas se aplica. Por eso lleva el cuerpo viejo
-- COMPLETO al final para revertir en un solo paso.

create or replace function public.cerebro_pipeline_status(p_client_id text)
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
      -- ANTES: (s.name ~* '(reclutamiento|producto)')  <- la regex sobre el nombre de la carpeta
      (p.tipo is not null) as has_tipo,
      -- has_del sigue por strategy_id: es donde client_brain_docs vive (ver cabecera).
      exists(select 1 from client_brain_docs d where d.strategy_id=p.strategy_id and d.doc_kind='del' and d.char_count>0) as has_del,
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
    -- ANTES: from strategies s join strategy_pages p on p.strategy_id=s.id where s.client_id=p_client_id
    from strategy_pages p
    left join strategies s on s.id = p.strategy_id
    where p.client_id = p_client_id
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
-- Jose Luis Rivas: sus 2 funnels de producto deben pasar el paso 1 (antes fallaban
-- por la regex). Esperado: has_tipo ok -> stage 'estrategia' = 'listo'.
-- select funnel, stage, status, detail from public.cerebro_pipeline_status('c_1775304975528_mi1b8c') where stage='estrategia';
--
-- Sergio Canovas (el piloto): 3 funnels x 6 pasos = 18 filas.
-- select count(*) from public.cerebro_pipeline_status('c_1775304975528_pzu8sk');
--
-- Los 2 funnels sin tipo siguen en 'pendiente' en el paso 1. Es CORRECTO: la
-- informacion no existe. No es una regresion -- la regex tambien fallaba.
--
-- Comparar antes/despues en un cliente sano (deberia dar identico):
-- select * from public.cerebro_pipeline_status('c_1775304975528_z5uiq7') order by funnel, ord;

-- ── Rollback: el cuerpo VIEJO, tal cual estaba en prod al 2026-07-17 ─────────
-- create or replace function public.cerebro_pipeline_status(p_client_id text)
--  returns table(strategy_id text, strategy text, funnel_id text, funnel text, stage text, stage_label text, ord integer, status text, substate text, detail text, can_generate boolean)
--  language sql stable security definer set search_path to 'public'
-- as $function$
--   with f as (
--     select
--       s.id as sid, s.name as sname, s.position as spos,
--       p.id as fid, p.name as fname, p.position as fpos,
--       (s.name ~* '(reclutamiento|producto)') as has_tipo,
--       exists(select 1 from client_brain_docs d where d.strategy_id=s.id and d.doc_kind='del' and d.char_count>0) as has_del,
--       (jsonb_array_length(coalesce(p.avatars,'[]'::jsonb)) > 0) as has_any_avatar,
--       (select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a where coalesce(a->>'spec_text','') <> '')>0 as has_avatares,
--       (coalesce(p.vsl_script,'') <> '') as vsl_guionado,
--       (coalesce(p.vsl_url,'') <> '') as vsl_editado,
--       (select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a where coalesce(a->>'ad_script','') <> '')>0 as ads_guionado,
--       (select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a where coalesce((a->>'rec_files')::int,0) > 0)>0 as ads_grabado,
--       ((select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a where coalesce(a->>'ad_url','') <> '')>0
--         or (select count(*) from jsonb_array_elements(coalesce(p.avatars,'[]'::jsonb)) a where coalesce((a->>'edit_files')::int,0) > 0)>0) as ads_editado,
--       (coalesce(p.prod_url,'') <> '' or coalesce(p.official_domain,'') <> '') as landing_pub
--     from strategies s
--     join strategy_pages p on p.strategy_id=s.id
--     where s.client_id=p_client_id
--   ),
--   m as (
--     select f.*,
--       (f.has_del or f.has_any_avatar) as has_del_eff,
--       case when f.vsl_editado then 'editado' when f.vsl_guionado then 'guion' else 'nada' end as vsl_sub,
--       case when f.ads_editado then 'editado' when f.ads_grabado then 'grabado'
--            when f.ads_guionado then 'guion' else 'nada' end as ads_sub,
--       case when f.landing_pub then 'disenado' else 'nada' end as landing_sub
--     from f
--   ),
--   g as (
--     select m.*, v.stage, v.ord, v.label, v.done, v.prereq_ok, v.substate, v.detail
--     from m cross join lateral (values
--       ('estrategia', 1, 'Estrategia definida (Reclutamiento/Producto)',
--         m.has_tipo, true, null::text,
--         case when m.has_tipo then 'OK' else 'Falta definir el tipo de estrategia' end),
--       ('del', 2, 'DEL cargado (maestro: avatares + guiones)',
--         m.has_del_eff, m.has_tipo, null::text,
--         case when m.has_del_eff then 'OK' when m.has_tipo then 'Falta cargar/sincronizar el DEL' else 'Bloqueado: falta definir la estrategia' end),
--       ('avatares', 3, 'Avatares con detalle (spec del DEL)',
--         m.has_avatares, m.has_del_eff, null::text,
--         case when m.has_avatares then 'OK' when m.has_del_eff then 'Listo para armar los avatares' else 'Bloqueado: falta el DEL' end),
--       ('vsl', 4, 'VSL del funnel',
--         m.vsl_editado, m.has_avatares, m.vsl_sub,
--         case m.vsl_sub when 'editado' then 'Editado (link puesto)' when 'guion' then 'Guionado (falta grabar/editar)'
--              else (case when m.has_avatares then 'Sin empezar: falta el guión del VSL' else 'Bloqueado: falta armar los avatares' end) end),
--       ('anuncios', 5, 'Anuncios por avatar',
--         m.ads_editado, m.vsl_guionado, m.ads_sub,
--         case m.ads_sub when 'editado' then 'Editados (link/archivos puestos)' when 'grabado' then 'Grabados (falta editar)'
--              when 'guion' then 'Copy hecho (falta grabar/editar)'
--              else (case when m.vsl_guionado then 'Sin empezar (VSL ya guionado, se puede arrancar)' else 'Bloqueado: falta el guión del VSL de este funnel' end) end),
--       ('landing', 6, 'Landing / BCL',
--         m.landing_pub, m.vsl_guionado, m.landing_sub,
--         case m.landing_sub when 'disenado' then 'Diseñada (link de producción/publicidad)'
--              else (case when m.vsl_guionado then 'Sin empezar (se puede diseñar)' else 'Bloqueado: falta el guión del VSL de este funnel' end) end)
--     ) v(stage, ord, label, done, prereq_ok, substate, detail)
--   )
--   select sid, sname, fid, fname, stage, label, ord,
--     case when done then 'listo' when prereq_ok then 'pendiente' else 'bloqueado' end,
--     substate, detail, (not done and prereq_ok)
--   from g order by spos, fpos, ord;
-- $function$;
