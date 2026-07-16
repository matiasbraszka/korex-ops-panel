-- descubrimiento_status v5 — un DEL plantilla no es un DEL
--
-- Lo destapo probando el paso 4 contra Alex Reynoso (2026-07-16). El agente lo vio solo:
--
--   "revisando el contenido del DEL adjunto, las secciones de Anuncios, VSL, Landing,
--    Testimonios y Formulario estan vacias o con placeholders (NOMBRE, -, campos sin llenar)"
--
-- ...y el gate igual decia `estrategia = listo`. El bug: has_del se calculaba con
-- `char_count > 0`, y en Korex el DEL se crea desde una plantilla cuando arranca el funnel y se
-- llena despues. O sea que un DEL vacio no es una anomalia: es el estado NORMAL de un cliente
-- recien arrancado, y lo estabamos contando como trabajo hecho.
--
-- Por que importa mas de lo que parece: `avatar` (paso 5) tiene como prerrequisito has_del. Con
-- el DEL plantilla dando true, el gate habilitaba el avatar builder sobre un documento con
-- placeholders. Es exactamente lo que prohibe la regla de oro del SOP — "un artefacto no arranca
-- hasta que su prerrequisito esta congelado" — y el modo mas caro de romperlo, porque el avatar
-- sale prolijo y nadie nota que se construyo sobre nada.
--
-- El corte: los datos no dejan lugar a duda. Distribucion real de los 36 DEL cargados:
--
--     2.511  DEL Alex Reynoso | Vitalhealth | Reclutamiento #2   <- plantilla
--     2.511  DEL Alex Reynoso PRODUCTO | Vitalhealth             <- plantilla
--     2.678  DEL cristian steinkeller | Ai tech                  <- plantilla
--     7.593  DEL Liliana Vega Carvajal | zinzino                 <- apenas empezado
--    ------- salto de 4x, sin nada en el medio -------
--    30.449  Documento en limpio Priscilla Esquerra, Riman       <- DEL de verdad
--    30.589  DEL Castor BitradeX Exchange                        <- DEL de verdad
--       ...  (hasta 138.658; el promedio real es 56.609)
--
-- 15.000 cae en el medio del vacio. No es un numero fino: es un piso grosero para separar "hay
-- una plantilla" de "hay un analisis", que es la unica distincion que hace falta.
--
-- A proposito NO se le pone piso a onboarding ni a investigacion: ahi no hay evidencia de
-- plantillas vacias y los tamanos legitimos varian mucho (un "Onboarding General" corto y bien
-- llenado es valido). Poner un piso sin evidencia bloquearia clientes buenos.

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
      -- 15.000 = el piso que separa la plantilla del analisis (ver cabecera).
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
             -- El caso que motiva el v5: hay archivo, pero es la plantilla.
             when coalesce(m.del_chars, 0) > 0 and (m.has_research and m.has_onboarding)
               then 'HAY un DEL en el Drive pero esta SIN LLENAR: son ' || m.del_chars || ' caracteres y un DEL de verdad arranca en 30.000. Es la plantilla con los campos vacios. Tratalo como NO hecho: el analisis estrategico hay que producirlo. No leas la plantilla como si fuera un analisis ni copies sus placeholders.'
             when (m.has_research and m.has_onboarding) then 'Listo para hacer el analisis estrategico'
             when not m.has_onboarding and not m.has_research then 'Bloqueado: faltan el research y el onboarding'
             when not m.has_onboarding then 'Bloqueado: falta el onboarding (todavia es pre-llamada)'
             else 'Bloqueado: falta el research del lider y la empresa' end),

      ('avatar', 5, 'Avatar builder (hoja psicologica del avatar elegido)',
        m.has_avatares, m.has_del,
        case when m.has_avatares then 'OK — hay avatares con spec desarrollada'
             when m.has_del then 'Listo para profundizar el avatar que eligio el analisis estrategico'
             when coalesce(m.del_chars, 0) > 0
               then 'Bloqueado: el DEL del Drive es la plantilla sin llenar (' || m.del_chars || ' caracteres). NO alcanza para elegir un avatar: primero hay que hacer el analisis estrategico (paso 4).'
             else 'Bloqueado: falta el analisis estrategico (paso 4)' end)
    ) v(stage, ord, label, done, prereq_ok, detail)
  )
  select stage, label, ord,
    case when done then 'listo' when prereq_ok then 'pendiente' else 'bloqueado' end,
    detail,
    (not done and prereq_ok and stage not in ('research', 'competencia')),
    mom
  from g order by ord;
$function$;
