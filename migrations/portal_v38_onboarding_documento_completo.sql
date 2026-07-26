-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v38_onboarding_documento_completo.sql
--
-- La pestaña de onboarding del DEL pasa a tener el cuestionario ENTERO desde el
-- día cero —los 23 pasos y sus preguntas— y las respuestas se van llenando
-- adentro a medida que el cliente contesta.
--
-- Antes solo aparecían los pasos que ya tenían alguna respuesta. Un cliente
-- recién creado mostraba una pestaña vacía, y uno a mitad de camino mostraba
-- pedazos sueltos: el equipo no podía ver qué falta sin abrir el panel del
-- cliente y contarlo. Ahora el documento se lee como el cuestionario que es,
-- con los huecos a la vista.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LO QUE HAY QUE ARREGLAR JUNTO, O ESTO ROMPE DESCUBRIMIENTO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `descubrimiento_status` destraba su paso 4 así:
--
--     has_onboarding = existe un doc doc_kind='onboarding' con char_count > 0
--
-- Con el cuestionario completo escrito de entrada, ese documento pesa ~13 KB
-- desde el minuto cero, sin una sola respuesta. O sea: Descubrimiento se
-- destrabaría para todos los clientes nuevos aunque no hayan contestado nada, y
-- el equipo arrancaría la estrategia sobre un documento de preguntas vacías.
--
-- Se arregla mirando lo que importa: que haya RESPUESTAS. Los 61 clientes cuyo
-- documento de onboarding viene de Drive siguen con la regla vieja —no tienen
-- respuestas en esta tabla y su documento sí es contenido real—, así que la
-- condición se parte por origen: el prefijo `native_onb_` distingue el nuestro.
--
-- Por lo mismo, la guarda anti-catástrofe deja de medir el documento y pasa a
-- medir los caracteres RESPONDIDOS. Con el andamiaje adentro, un cliente que
-- borra todo hace caer el texto de 40 KB a 13 KB —un 32%, apenas por encima del
-- umbral— y la guarda no se enteraba.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- Cuánto escribió el cliente, sin contar el andamiaje. Es contra esto que se
-- compara para detectar un borrado masivo.
alter table public.onboarding_runs
  add column if not exists chars_respuestas int not null default 0;

-- ── 1 · El documento, con el cuestionario completo ───────────────────────────
create or replace function public.onboarding_sync_texto(
  p_client_id text,
  p_force     boolean default false
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_run     record;
  v_doc     text := 'onb_' || p_client_id;
  v_node    text := 'native_onb_' || p_client_id;
  v_nombre  text;
  v_prev    int := 0;
  v_len     int := 0;
  r         record;
  v_cuerpo  text;
  v_secs    int := 0;
  v_compl   text;
begin
  if not (public.is_team_member()
          or current_setting('request.jwt.claim.role', true) = 'service_role'
          or public.portal_cliente_client() = p_client_id) then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;

  select * into v_run from public.onboarding_runs
   where client_id = p_client_id and estado <> 'archivado'
   order by created_at desc limit 1;
  if v_run.id is null then
    return jsonb_build_object('ok', false, 'error', 'sin_run');
  end if;

  select name into v_nombre from public.clients where id = p_client_id;
  v_prev := coalesce(v_run.chars_respuestas, 0);

  -- Lo que el cliente escribió de verdad.
  select coalesce(sum(length(btrim(a.value_text))), 0) into v_len
    from public.onboarding_answers a
    join public.onboarding_questions q on q.qkey = a.qkey and q.activa
    join public.onboarding_sections s on s.skey = q.skey and s.activa and s.bkey is not null
   where a.run_id = v_run.id and btrim(coalesce(a.value_text, '')) <> ''
     and public._onboarding_visible(v_run.id, q.visible_si);

  -- Guarda anti-catástrofe: mide RESPUESTAS, no el peso del documento.
  if v_prev > 0 and v_len < v_prev * 0.30 and not p_force then
    update public.onboarding_runs
       set writeback_warning = 'Las respuestas pasaron de ' || v_prev || ' a '
                             || v_len || ' caracteres. No se reescribió.'
     where id = v_run.id;
    begin
      perform public._portal_slack(p_client_id,
        'Onboarding: las respuestas del cliente pasaron de ' || v_prev || ' a '
        || v_len || ' caracteres. No se reescribio el documento. Revisar antes de forzar.');
    exception when others then null;
    end;
    return jsonb_build_object('ok', false, 'error', 'respuestas_borradas',
                             'chars', v_len, 'chars_previos', v_prev);
  end if;

  insert into public.client_brain_docs
    (id, client_id, node_id, doc_kind, title, text, char_count, scope, synced_at)
  values (v_doc, p_client_id, v_node, 'onboarding',
          'Onboarding (plataforma) — ' || coalesce(v_nombre, p_client_id),
          '', 0, 'client', now())
  on conflict (client_id, node_id) do update
    set doc_kind = 'onboarding', title = excluded.title, synced_at = now();

  delete from public.del_sections ds where ds.doc_id = v_doc;

  -- UNA SECCIÓN POR PASO, esté contestado o no. `left join` a las respuestas:
  -- eso es lo que hace que el cuestionario entero esté a la vista y los huecos
  -- se lean como huecos.
  for r in
    select s.skey, s.orden, s.badge, s.titulo,
           count(*) filter (where btrim(coalesce(a.value_text, '')) <> '') as contestadas,
           count(*) as total,
           string_agg(
             'P: ' || q.label ||
             case when a.source in ('voz', 'mixto') then ' [respuesta hablada]' else '' end
             || E'\n' || 'R: ' ||
             case when btrim(coalesce(a.value_text, '')) <> ''
                  then btrim(a.value_text)
                  else '(sin responder)' end,
             E'\n\n' order by q.pantalla, q.orden) as cuerpo
      from public.onboarding_sections s
      join public.onboarding_questions q on q.skey = s.skey and q.activa
                                        and q.qtype not in ('info', 'resumen')
      left join public.onboarding_answers a on a.run_id = v_run.id and a.qkey = q.qkey
     where s.activa and s.bkey is not null
       and public._onboarding_visible(v_run.id, q.visible_si)
     group by s.skey, s.orden, s.badge, s.titulo
     order by s.orden
  loop
    -- Una línea de estado arriba de cada sección: el equipo ve de un vistazo
    -- por dónde va sin tener que contar las respuestas a ojo.
    v_cuerpo := '[' || r.contestadas || ' de ' || r.total || ' respondidas]'
             || E'\n\n' || r.cuerpo;

    insert into public.del_sections
      (id, doc_id, client_id, ord, title, kind, text, char_count, source, updated_at)
    values ('dsec_' || v_doc || '_' || r.orden, v_doc, p_client_id, r.orden,
            left(r.badge || ' · ' || r.titulo, 60), 'onboarding',
            v_cuerpo, length(v_cuerpo), 'onboarding', now());
    v_secs := v_secs + 1;
  end loop;

  select string_agg('· ' || btrim(a.value_text), E'\n' order by q.orden)
    into v_compl
    from public.onboarding_answers a
    join public.onboarding_questions q on q.qkey = a.qkey
   where a.run_id = v_run.id and q.qkey in ('claims_no', 'palabras_no')
     and btrim(coalesce(a.value_text, '')) <> '';

  if v_compl is not null then
    v_cuerpo := 'Lo que sigue lo declaró el cliente. NO se puede contradecir en '
             || 'copy, VSL ni anuncios.' || E'\n\n' || v_compl;
    insert into public.del_sections
      (id, doc_id, client_id, ord, title, kind, text, char_count, source, updated_at)
    values ('dsec_' || v_doc || '_9000', v_doc, p_client_id, 9000,
            'RESTRICCIONES DE COMUNICACIÓN (COMPLIANCE)', 'onboarding',
            v_cuerpo, length(v_cuerpo), 'onboarding', now());
    v_secs := v_secs + 1;
  end if;

  update public.onboarding_runs
     set texto_sync_at = now(), chars_respuestas = v_len, writeback_warning = null
   where id = v_run.id;

  return jsonb_build_object('ok', true, 'secciones', v_secs, 'respuestas', v_len,
                            'chars', (select char_count from public.client_brain_docs where id = v_doc));
end $$;

revoke execute on function public.onboarding_sync_texto(text, boolean) from public, anon;
grant  execute on function public.onboarding_sync_texto(text, boolean) to authenticated, service_role;

-- ── 2 · El cliente nuevo nace con el cuestionario puesto ─────────────────────
create or replace function public.onboarding_preparar(p_client_id text)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_run text; v_nombre text;
begin
  select name into v_nombre from public.clients where id = p_client_id;
  if v_nombre is null then
    return jsonb_build_object('ok', false, 'error', 'sin_cliente');
  end if;

  v_run := public._onboarding_run(p_client_id);
  -- Escribe el cuestionario entero, sin respuestas. Es lo que hace que la
  -- pestaña exista y se pueda leer desde el momento en que se crea el cliente.
  perform public.onboarding_sync_texto(p_client_id);

  return jsonb_build_object('ok', true, 'run', v_run, 'doc', 'onb_' || p_client_id);
end $$;

revoke execute on function public.onboarding_preparar(text) from public, anon;
grant  execute on function public.onboarding_preparar(text) to authenticated, service_role;

-- ── 3 · El gate mira respuestas, no peso ─────────────────────────────────────
-- Se recrea entera y se cambia UNA sola expresión, `has_onboarding`. Todo lo
-- demás —las cinco etapas, sus prerrequisitos y sus textos— queda idéntico.
create or replace function public.descubrimiento_status(p_client_id text)
returns table(stage text, stage_label text, ord integer, status text, detail text,
              can_generate boolean, momento text)
language sql stable security definer
set search_path to 'public'
as $$
  with c as (
    select
      exists (select 1 from client_brain_docs d
              where d.client_id = p_client_id and d.doc_kind = 'investigacion'
                and coalesce(d.char_count, 0) > 0) as has_research,
      exists (select 1 from discovery_ads a where a.client_id = p_client_id) as has_competencia,
      -- El documento de onboarding cuenta si tiene contenido REAL. Para el que
      -- escribe la plataforma (native_onb_) eso significa que el cliente haya
      -- contestado algo: el cuestionario en blanco pesa ~13 KB y destrabaría
      -- este paso sin una sola respuesta. Los 61 que vienen de Drive siguen con
      -- la regla de siempre, porque ahí el peso sí es contenido.
      exists (select 1 from client_brain_docs d
              where d.client_id = p_client_id and d.doc_kind = 'onboarding'
                and coalesce(d.char_count, 0) > 0
                and (d.node_id not like 'native\_onb\_%'
                     or exists (select 1 from onboarding_answers a
                                 where a.client_id = p_client_id
                                   and btrim(coalesce(a.value_text, '')) <> ''))
             ) as has_onboarding,
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
             when coalesce(m.del_chars, 0) > 0 and (m.has_research and m.has_onboarding)
               then 'HAY un DEL en el Drive pero esta SIN LLENAR: son ' || m.del_chars || ' caracteres y un DEL de verdad arranca en 30.000. Es la plantilla con los campos vacios. Tratalo como NO hecho: el analisis estrategico hay que producirlo. No leas la plantilla como si fuera un analisis ni copies sus placeholders.'
             when (m.has_research and m.has_onboarding) then 'Listo para hacer el analisis estrategico'
             when not m.has_onboarding and not m.has_research then 'Bloqueado: faltan el research y el onboarding'
             when not m.has_onboarding then 'Bloqueado: falta el onboarding (todavia es pre-llamada)'
             else 'Bloqueado: falta el research del lider y la empresa' end),

      ('avatar', 5, 'Avatar builder (hoja psicologica del avatar elegido)',
        m.has_avatares, m.has_onboarding,
        case when m.has_avatares then 'OK — hay avatares con spec desarrollada'
             when m.has_del
               then 'Listo. El analisis estrategico ya esta hecho: profundiza el avatar que eligio (si te piden otro, hacelo igual y decilo).'
             when m.has_onboarding
               then 'Listo. NO hace falta el DEL: la psicologia sale del onboarding y de la investigacion, que estan cargados. Lo unico que aporta el DEL es CUAL avatar. Si te lo nombraron, ESE es el insumo y alcanza: escribi la hoja completa. Si el paso 4 no esta hecho, decilo en UNA linea al final y segui. Si NO te lo nombraron, preguntá cual — no lo elijas vos.'
             else 'Bloqueado: falta el onboarding. Sin la voz del cliente no hay boton caliente, ni deseos ocultos, ni miedos: habria que inventarlos.' end)
    ) v(stage, ord, label, done, prereq_ok, detail)
  )
  select stage, label, ord,
    case when done then 'listo' when prereq_ok then 'pendiente' else 'bloqueado' end,
    detail,
    (not done and prereq_ok and stage not in ('research', 'competencia')),
    mom
  from g order by ord;
$$;

commit;

notify pgrst, 'reload schema';
