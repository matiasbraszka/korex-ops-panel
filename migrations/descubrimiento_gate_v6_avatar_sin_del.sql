-- descubrimiento_status v6 — el avatar builder NO necesita el DEL
--
-- El v5 dejo el paso 5 con `prereq_ok = has_del`: sin un DEL lleno, bloqueado. Esta mal, y lo
-- dice la propia skill del avatar builder cuando explica como se determina el boton caliente:
--
--   1. En el onboarding: que menciono mas el cliente sobre su publico?
--   2. En la historia del lider: que transformacion vivio?
--   3. En el perfil del avatar del Strategy Analyzer: cual es su dolor principal?
--
-- Dos de las tres senales salen del ONBOARDING y de la historia del lider (la investigacion).
-- Del analisis estrategico sale UNA sola cosa: CUAL es el avatar. Y eso lo puede decir la
-- persona en el chat — de hecho es lo que hace: "profundizame este avatar".
--
-- O sea: el DEL no es el insumo del paso 5, es el papelito donde el paso 4 anoto que avatar
-- gano. Exigirlo bloqueaba al equipo por no tener el papelito, teniendo toda la materia prima.
--
-- Que cambia:
--   prereq_ok: has_del  ->  has_onboarding
--
-- El onboarding es el prerrequisito real: es de donde sale la psicologia. Sin la voz del
-- cliente no hay boton caliente, ni deseos ocultos, ni miedos — habria que inventarlos, que es
-- lo unico que estos candados existen para evitar.
--
-- Lo que el v5 SI protegia se mantiene, y se refuerza aguas abajo: un DEL plantilla no se lee
-- como si fuera un analisis. Antes eso se lograba bloqueando el paso entero; ahora el paso
-- corre y la plantilla directamente NO se manda al modelo (agent-chat filtra por el mismo piso
-- de 15.000). Se protege lo mismo sin frenar a nadie.
--
-- El paso 4 NO cambia: sigue produciendo el DEL, y cuando el DEL existe el paso 5 lo usa como
-- contexto (dice que avatar gano y su perfil base). Simplemente ya no es obligatorio.

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
      -- 15.000 = el piso que separa la plantilla del analisis (ver cabecera del v5).
      exists (select 1 from client_brain_docs d
              where d.client_id = p_client_id and d.doc_kind = 'del'
                and coalesce(d.char_count, 0) >= 15000) as has_del,
      -- Que exista una plantilla se guarda aparte para poder DECIRLO en el detail. Sin esto el
      -- agente ve "no hay DEL", el equipo ve el archivo en el Drive, y nadie entiende nada.
      (select max(coalesce(d.char_count, 0)) from client_brain_docs d
        where d.client_id = p_client_id and d.doc_kind = 'del') as del_chars,
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
             -- Hay archivo, pero es la plantilla.
             when coalesce(m.del_chars, 0) > 0 and (m.has_research and m.has_onboarding)
               then 'HAY un DEL en el Drive pero esta SIN LLENAR: son ' || m.del_chars || ' caracteres y un DEL de verdad arranca en 30.000. Es la plantilla con los campos vacios. Tratalo como NO hecho: el analisis estrategico hay que producirlo. No leas la plantilla como si fuera un analisis ni copies sus placeholders.'
             when (m.has_research and m.has_onboarding) then 'Listo para hacer el analisis estrategico'
             when not m.has_onboarding and not m.has_research then 'Bloqueado: faltan el research y el onboarding'
             when not m.has_onboarding then 'Bloqueado: falta el onboarding (todavia es pre-llamada)'
             else 'Bloqueado: falta el research del lider y la empresa' end),

      -- v6: el prerrequisito es el ONBOARDING, no el DEL (ver cabecera).
      ('avatar', 5, 'Avatar builder (hoja psicologica del avatar elegido)',
        m.has_avatares, m.has_onboarding,
        case when m.has_avatares then 'OK — hay avatares con spec desarrollada'
             when m.has_del
               then 'Listo. El analisis estrategico ya esta hecho: profundiza el avatar que eligio (si te piden otro, hacelo igual y decilo).'
             -- El caso normal hoy: el equipo sabe que avatar quiere y todavia no escribio el DEL.
             when m.has_onboarding
               then 'Listo, y NO hace falta el DEL: la psicologia sale del onboarding y de la investigacion, que estan cargados. Lo unico que aporta el DEL es CUAL avatar, y eso te lo dice la persona. Si no te lo dijo, preguntalo — no lo elijas vos ni lo supongas. Si ademas te lo describen (segmentacion, dolor), tomalo como el perfil base y profundizalo; no lo trates como un veredicto de rubrica ni digas que gano una comparacion que nadie corrio.'
             else 'Bloqueado: falta el onboarding. Sin la voz del cliente no hay boton caliente, ni deseos ocultos, ni miedos: habria que inventarlos.' end)
    ) v(stage, ord, label, done, prereq_ok, detail)
  )
  select stage, label, ord,
    case when done then 'listo' when prereq_ok then 'pendiente' else 'bloqueado' end,
    detail,
    (not done and prereq_ok and stage not in ('research', 'competencia')),
    mom
  from g order by ord;
$function$;
