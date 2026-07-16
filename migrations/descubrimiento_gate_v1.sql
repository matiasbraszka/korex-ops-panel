-- descubrimiento_gate_v1.sql
-- El gate del Agente de Descubrimiento (subagente `descubrimiento`).
--
-- Es el equivalente aguas arriba de cerebro_pipeline_status(): mismo contrato de salida
-- (stage / ord / status / detail / can_generate) y misma doctrina — el orden Korex no se
-- respeta por memoria del modelo, lo hace cumplir un motor deterministico en la base.
--
-- Dos diferencias con cerebro_pipeline_status, y las dos son a proposito:
--
--   1) Es a nivel CLIENTE, no funnel. El descubrimiento corre ANTES de que existan
--      estrategias, funnels y avatares: el avatar es su SALIDA (paso 5), no su entrada.
--      Pedirle un funnel para arrancar seria pedirle el resultado del paso 5 para poder
--      hacer el paso 1.
--
--   2) Termina justo donde cerebro_pipeline_status empieza. El paso 4 (estrategia) produce
--      el DEL y el paso 5 (avatar) produce avatars[].spec_text, que son las etapas `del` y
--      `avatares` de aquel gate. Encadenan: descubrimiento -> produccion.
--
-- Devuelve ademas `momento`, que resuelve la seccion 4 del doc del agente ("pre-llamada" vs
-- "post-llamada"). No se le pregunta al modelo ni se deduce del chat: se calcula por si
-- existe el onboarding. En pre-llamada, estrategia y avatar NO son posibles todavia.
--
-- Estados (identicos a cerebro_pipeline_status):
--   listo      -> ya esta hecho (se puede rehacer)
--   pendiente  -> prerrequisitos OK, se puede producir
--   bloqueado  -> falta algo aguas arriba. El agente NO produce y dice que falta.

-- 1) Los ads de competidores que trae el Ad Library API (paso 2 del descubrimiento).
--    La tabla se crea vacia aca y no en la fase de competencia para que el gate pueda
--    referenciarla sin romperse: sin filas, el paso 2 simplemente figura `pendiente`.
create table if not exists public.discovery_ads (
  id           text primary key,          -- dads_<ad_id de meta>
  client_id    text not null references public.clients(id) on delete cascade,
  page_id      text,
  page_name    text,
  ad_title     text,                      -- ad_creative_link_titles[0]
  ad_body      text,                      -- ad_creative_bodies[0] (puede venir vacio: ver riesgo 1 del plan)
  snapshot_url text,                      -- ad_snapshot_url: la unica forma segura de ver el creativo
  countries    text[] default '{}'::text[],
  started_at   timestamptz,               -- ad_delivery_start_time
  raw          jsonb,                     -- la fila cruda de ads_archive, por si Meta agrega campos
  synced_at    timestamptz not null default now()
);
create index if not exists discovery_ads_client_idx on public.discovery_ads (client_id, synced_at desc);

alter table public.discovery_ads enable row level security;
drop policy if exists discovery_ads_read on public.discovery_ads;
create policy discovery_ads_read on public.discovery_ads for select
  using (public.has_permission('marketing', '*', 'read'));
drop policy if exists discovery_ads_write on public.discovery_ads;
create policy discovery_ads_write on public.discovery_ads for all
  using (public.has_permission('marketing', '*', 'write'))
  with check (public.has_permission('marketing', '*', 'write'));

-- 2) El gate.
create or replace function public.descubrimiento_status(p_client_id text)
returns table (
  stage text, stage_label text, ord integer,
  status text, detail text, can_generate boolean, momento text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with c as (
    select
      -- Los inputs de las skills YA viven en la base: los sincroniza drive-sync desde el
      -- Doc de Drive del cliente. char_count>0 y no solo "existe la fila": una fila con
      -- text vacio significa que el sync todavia no leyo el documento (falta read_doc en
      -- el Apps Script), y eso NO es un research hecho.
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
      -- Mismo criterio que cerebro_pipeline_status.has_avatares: un avatar sin spec_text es
      -- un titulo, no un avatar desarrollado.
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
             else 'Sin empezar: falta la investigacion del lider y la empresa' end),

      -- Corre EN PARALELO al research: no depende de el (seccion 3 del doc).
      ('competencia', 2, 'Research de la competencia (ad library)',
        m.has_competencia, true,
        case when m.has_competencia then 'OK — hay ads de competidores cargados'
             else 'Sin empezar: no hay ads de competidores cargados' end),

      -- Bisagra. Su prerrequisito es la llamada, que no vive en la base: por eso prereq_ok
      -- es true y nunca figura "bloqueado". Si no hay onboarding, es que la llamada no paso.
      ('onboarding', 3, 'Consolidacion del onboarding',
        m.has_onboarding, true,
        case when m.has_onboarding then 'OK — el onboarding esta cargado'
             else 'Sin empezar: falta la llamada de onboarding (la aporta el consultor)' end),

      -- LA BISAGRA del doc: sin esto no hay avatar.
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
    (not done and prereq_ok),
    mom
  from g order by ord;
$function$;

revoke all on function public.descubrimiento_status(text) from public;
grant execute on function public.descubrimiento_status(text) to anon, authenticated;

comment on function public.descubrimiento_status(text) is
  'Gate del Agente de Descubrimiento, a nivel cliente. Aguas arriba de cerebro_pipeline_status(): termina donde ese empieza (paso 4 produce el DEL, paso 5 los avatares). `momento` = pre/post-llamada segun exista el onboarding.';

-- ============================================================================
-- Verificacion (no destructiva)
-- ============================================================================

-- 1) Cliente completo (research + onboarding + del): estrategia debe dar 'listo',
--    momento 'post-llamada'.
-- select * from public.descubrimiento_status('c_1781546055319_vuvnw2');  -- Fabiana Carrasco

-- 2) Cliente sin nada: research/competencia/onboarding 'pendiente', estrategia y avatar
--    'bloqueado', momento 'pre-llamada'.
-- select * from public.descubrimiento_status('c_1775304975528_bf0w0m');  -- Pablo Valladolid

-- 3) Panorama: en que paso esta cada cliente y cual es el proximo que se puede hacer.
-- select c.name, s.momento,
--        min(s.ord) filter (where s.status = 'pendiente') as proximo_paso,
--        count(*) filter (where s.status = 'listo')       as pasos_listos,
--        count(*) filter (where s.status = 'bloqueado')   as pasos_bloqueados
-- from clients c cross join lateral public.descubrimiento_status(c.id) s
-- group by c.name, s.momento order by pasos_listos desc;
