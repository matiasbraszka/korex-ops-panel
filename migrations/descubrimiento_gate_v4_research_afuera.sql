-- descubrimiento_status v4 — el research vuelve a hacerse AFUERA
--
-- Decision de Mati (2026-07-16): "los research o investigaciones los vamos a hacer por fuera".
-- Esto revierte el v3, que habia habilitado el research en el chat con busqueda web.
--
-- Por que importa que el gate diga la verdad: el detail de cada etapa entra CRUDO al prompt del
-- agente. Si el gate le dice "tenes busqueda web habilitada" y la edge fn no le pasa la
-- herramienta, el agente cree que puede buscar, no puede, y completa de memoria. Un research
-- inventado se ve igual de prolijo que uno real y contamina la estrategia y el avatar que salen
-- despues. Por eso el gate y el codigo tienen que decir lo mismo: es la misma proteccion de
-- tres capas que el v2 (corpus `ejecuta` + gate `can_generate` + la edge fn no carga la skill).
--
-- Estado despues de este v4:
--   research    -> AFUERA (Claude Code con la skill korex-preonboarding-research)
--   competencia -> AFUERA (necesita el Ad Library de Meta)
--   onboarding / estrategia / avatar -> se producen en el chat
-- El agente coordina 5, produce 3.

create or replace function public.descubrimiento_status(p_client_id text)
returns table(stage text, stage_label text, ord integer, status text, detail text, can_generate boolean, momento text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with c as (
    select
      exists (select 1 from client_brain_docs d
              where d.client_id = p_client_id and d.doc_kind = 'investigacion'
                and coalesce(d.char_count, 0) > 0) as has_research,
      exists (select 1 from discovery_ads a where a.client_id = p_client_id) as has_competencia,
      exists (select 1 from client_brain_docs d
              where d.client_id = p_client_id and d.doc_kind = 'onboarding'
                and coalesce(d.char_count, 0) > 0) as has_onboarding,
      exists (select 1 from client_brain_docs d
              where d.client_id = p_client_id and d.doc_kind = 'del'
                and coalesce(d.char_count, 0) > 0) as has_del,
      exists (select 1 from strategies s
              join strategy_pages p on p.strategy_id = s.id
              cross join lateral jsonb_array_elements(coalesce(p.avatars, '[]'::jsonb)) a
              where s.client_id = p_client_id
                and coalesce(a->>'spec_text', '') <> '') as has_avatares
  ),
  m as (
    select c.*, case when c.has_onboarding then 'post-llamada' else 'pre-llamada' end as mom
    from c
  ),
  g as (
    select m.*, v.stage, v.ord, v.label, v.done, v.prereq_ok, v.detail
    from m cross join lateral (values
      ('research', 1, 'Research del lider y su empresa (fuentes publicas)',
        m.has_research, true,
        case when m.has_research then 'OK — hay investigacion cargada'
             else 'FALTA, y NO se hace desde el chat: la metodologia son 15-20 busquedas web y aca no hay buscador. Lo corre una persona con la skill korex-preonboarding-research y despues se sube al Drive del cliente. NO lo produzcas ni lo aproximes de memoria: armale el pedido con los datos que identifican al lider (nombre completo, empresa, red social, pais, foco) y pedi los que falten.' end),

      ('competencia', 2, 'Research de la competencia (ad library)',
        m.has_competencia, true,
        case when m.has_competencia then 'OK — hay ads de competidores cargados'
             else 'FALTA, y NO se hace desde el chat: necesita leer el Ad Library de Meta. Todavia no esta construida esa carga. No inventes que anuncios corre la competencia.' end),

      ('onboarding', 3, 'Consolidacion del onboarding',
        m.has_onboarding, true,
        case when m.has_onboarding then 'OK — el onboarding esta cargado'
             else 'Sin empezar: falta la llamada de onboarding (la aporta el consultor)' end),

      ('estrategia', 4, 'Analisis estrategico (foco + top de avatares)',
        m.has_del, (m.has_research and m.has_onboarding),
        case when m.has_del then 'OK — el DEL esta cargado'
             when (m.has_research and m.has_onboarding) then 'Listo para hacer el analisis estrategico'
             when not m.has_onboarding and not m.has_research then 'Bloqueado: faltan el research y el onboarding'
             when not m.has_onboarding then 'Bloqueado: falta el onboarding (todavia es pre-llamada)'
             else 'Bloqueado: falta el research del lider y la empresa' end),

      ('avatar', 5, 'Avatar builder (hoja psicologica del avatar elegido)',
        m.has_avatares, m.has_del,
        case when m.has_avatares then 'OK — hay avatares con spec desarrollada'
             when m.has_del then 'Listo para profundizar el avatar que eligio el analisis estrategico'
             else 'Bloqueado: falta el analisis estrategico (paso 4)' end)
    ) v(stage, ord, label, done, prereq_ok, detail)
  )
  select stage, label, ord,
    case when done then 'listo' when prereq_ok then 'pendiente' else 'bloqueado' end,
    detail,
    -- Los dos pasos de pre-llamada se hacen AFUERA: por mas que el prerrequisito este OK, el
    -- agente no los puede producir. `can_generate` es lo que lo frena a nivel dato, sin depender
    -- de que el modelo obedezca el texto.
    (not done and prereq_ok and stage not in ('research', 'competencia')),
    mom
  from g order by ord;
$function$;
