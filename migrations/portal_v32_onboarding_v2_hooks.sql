-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v32_onboarding_v2_hooks.sql
--
-- El HTML le promete cosas concretas al cliente cuando termina:
--
--   «arrancamos hoy mismo el procedimiento de creación de cuentas FB/IG»
--   «si tu empresa exige compliance, el trámite arranca hoy en paralelo»
--   «tu dominio entró en proceso, la URL se congela hoy»
--   «tu grabación quedó agendada con fecha firme»
--
-- Hoy no dispara ninguna. Son promesas escritas en una pantalla que nadie del
-- equipo ve. Esto las convierte en tareas reales, y solo cuando corresponde:
-- cada una mira la respuesta que la justifica.
--
-- Los ids son DETERMINISTAS (`tsk_onb_<slug>_<cliente>`). El v1 usaba
-- gen_random_uuid(), así que si un cliente volvía a completar —cosa que puede
-- pasar, porque editar una respuesta reabre el write-back— aparecían tareas
-- duplicadas y alguien las cerraba a mano.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1 · Alta de tarea idempotente ────────────────────────────────────────────
create or replace function public._onboarding_tarea(
  p_client   text,
  p_slug     text,
  p_titulo   text,
  p_desc     text,
  p_due      date default null,
  p_prio     text default 'alta'
) returns text
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_id text; v_asig text;
begin
  v_id := 'tsk_onb_' || p_slug || '_' || p_client;
  select coalesce(conector, '') into v_asig from public.clients where id = p_client;

  insert into public.tasks (id, title, client_id, assignee, priority, status,
                            description, due_date, created_by)
  values (v_id, p_titulo, p_client, v_asig, p_prio, 'backlog', p_desc,
          to_char(p_due, 'YYYY-MM-DD'), 'onboarding')
  on conflict (id) do update
    set title = excluded.title, description = excluded.description,
        due_date = coalesce(excluded.due_date, public.tasks.due_date);
  return v_id;
end $$;

revoke execute on function public._onboarding_tarea(text, text, text, text, date, text)
  from public, anon, authenticated;
grant execute on function public._onboarding_tarea(text, text, text, text, date, text)
  to service_role;

-- ── 2 · El cierre ────────────────────────────────────────────────────────────
create or replace function public.portal_onboarding_completar()
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cid text; v_run record; p record; v_wb jsonb; v_nombre text;
  v_faltan jsonb; v_due date; v_tareas int := 0;
  v_resp jsonb;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok', false, 'error', 'sin_cliente'); end if;

  select * into v_run from public.onboarding_runs
   where client_id = v_cid and estado <> 'archivado' limit 1;
  if v_run.id is null then return jsonb_build_object('ok', false, 'error', 'sin_run'); end if;

  select * into p from public.onboarding_progreso(v_run.id);

  -- Qué falta, con label y sección, para que la UI lleve directo ahí en vez de
  -- decir "te falta algo".
  if p.progreso < 100 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'qkey', q.qkey, 'label', q.label, 'skey', q.skey,
             'seccion', s.badge || ' · ' || s.titulo) order by s.orden, q.pantalla, q.orden), '[]'::jsonb)
      into v_faltan
      from public.onboarding_questions q
      join public.onboarding_sections s on s.skey = q.skey
     where q.qkey = any(p.faltan);

    return jsonb_build_object('ok', false, 'error', 'faltan',
      'progreso', p.progreso, 'faltan', v_faltan, 'bloqueantes', p.bloqueantes);
  end if;

  -- Si la guarda anti-catástrofe frena el write-back NO se cierra el run:
  -- cerrarlo dejaría al cliente creyendo que terminó, con el cerebro vacío.
  v_wb := public.onboarding_writeback(v_cid, false);
  if not coalesce((v_wb->>'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'writeback_fallo', 'detalle', v_wb);
  end if;

  update public.onboarding_runs
     set estado = 'completado', completado_at = now(),
         progreso = 100, respondidas = p.respondidas, requeridas = p.requeridas
   where id = v_run.id;

  select name into v_nombre from public.clients where id = v_cid;

  insert into public.portal_eventos (client_id, tipo, payload)
  values (v_cid, 'onboarding_completo', jsonb_build_object(
    'respondidas', p.respondidas, 'requeridas', p.requeridas,
    'chars', v_wb->>'chars', 'agenda_at', v_run.agenda_at));

  -- Las respuestas que deciden qué tareas nacen.
  select coalesce(jsonb_object_agg(a.qkey, a.value_text), '{}'::jsonb) into v_resp
    from public.onboarding_answers a
   where a.run_id = v_run.id
     and a.qkey in ('compliance', 'fanpage', 'bloqueos', 'dominio_quien',
                    'sesion_meta', 'heygen', 'bbdd');

  v_due := coalesce(v_run.agenda_at::date, current_date + 3);

  perform public._onboarding_tarea(v_cid, 'revisar',
    'Revisar onboarding y arrancar Descubrimiento — ' || coalesce(v_nombre, ''),
    'El cliente completó el onboarding en la plataforma ('
      || coalesce(v_wb->>'chars', '?') || ' caracteres, '
      || coalesce(v_wb->>'secciones', '?') || ' secciones). El documento está en el '
      || 'cerebro con doc_kind=onboarding, así que el paso 4 de Descubrimiento quedó destrabado.',
    v_due);
  v_tareas := v_tareas + 1;

  if v_run.agenda_estado = 'agendado' then
    perform public._onboarding_tarea(v_cid, 'sesion',
      'Sesión de onboarding con ' || coalesce(v_nombre, ''),
      'Repasar respuestas, profundizar lo que quedó flojo y dejar configurado el acceso a Meta.',
      v_due);
  else
    perform public._onboarding_tarea(v_cid, 'agendar',
      'Agendar a mano la sesión de onboarding de ' || coalesce(v_nombre, ''),
      'El cliente terminó el onboarding pero no pudo agendar desde la plataforma'
        || coalesce(' (' || nullif(v_run.agenda_motivo, '') || ')', '') || '.',
      null);
  end if;
  v_tareas := v_tareas + 1;

  -- La grabación es el único paso que depende del cliente. Si eligió fecha, el
  -- seguimiento nace con esa fecha encima.
  if v_run.grabacion_fecha is not null then
    perform public._onboarding_tarea(v_cid, 'grabacion',
      'Seguimiento para que el cliente se grabe el día '
        || to_char(v_run.grabacion_fecha, 'DD/MM'),
      'Fecha que eligió ' || coalesce(v_nombre, 'el cliente')
        || ' en el onboarding. Confirmarle el horario, pasarle el guion y '
        || 'recordárselo el día anterior.'
        || case when v_resp->>'heygen' ilike 'Sí%' or v_resp->>'heygen' = 'si'
                then ' Autorizó HeyGen: una sola grabación alcanza.' else '' end,
      v_run.grabacion_fecha);
    v_tareas := v_tareas + 1;
  end if;

  -- «Si tu empresa exige compliance, el trámite arrancó hoy.» El "no lo sé"
  -- también genera tarea: averiguarlo ahora cuesta una semana; descubrirlo el
  -- día del lanzamiento cuesta el lanzamiento.
  if v_resp->>'compliance' is not null and v_resp->>'compliance' <> '' then
    if lower(v_resp->>'compliance') like '%compliance%' or lower(v_resp->>'compliance') like '%no lo s%' then
      perform public._onboarding_tarea(v_cid, 'compliance',
        'Iniciar el trámite de compliance de ' || coalesce(v_nombre, ''),
        'El cliente declaró: "' || (v_resp->>'compliance') || '". El trámite puede tardar '
          || 'semanas, así que arranca ahora en paralelo y no en el sprint de lanzamiento. '
          || 'Los datos de contacto y los tiempos están en el documento del onboarding.',
        current_date + 1);
      v_tareas := v_tareas + 1;
    end if;
  end if;

  -- «Una cuenta nueva necesita unos 4 días de maduración.»
  if lower(coalesce(v_resp->>'fanpage', '')) like '%no tengo%'
     or lower(coalesce(v_resp->>'bloqueos', '')) like '%no tengo cuenta%' then
    perform public._onboarding_tarea(v_cid, 'cuentas',
      'Crear y calentar cuentas FB/IG de ' || coalesce(v_nombre, ''),
      'El cliente no tiene FanPage o no tiene cuenta publicitaria. Arrancar el '
        || 'procedimiento estándar de creación: carga de seguidores y calentamiento. '
        || 'Necesita unos 4 días de maduración antes de pautar.',
      current_date + 1);
    v_tareas := v_tareas + 1;
  end if;

  -- «Congelar la URL hoy nos deja montar tu landing en paralelo.»
  if lower(coalesce(v_resp->>'dominio_quien', '')) like '%registran ustedes%' then
    perform public._onboarding_tarea(v_cid, 'dominio',
      'Registrar el dominio de ' || coalesce(v_nombre, ''),
      'El cliente pidió que lo registremos nosotros. El dominio elegido y las dos '
        || 'alternativas están en el documento del onboarding.',
      current_date + 1);
    v_tareas := v_tareas + 1;
  end if;

  if lower(coalesce(v_resp->>'sesion_meta', '')) like '%agendar%' then
    perform public._onboarding_tarea(v_cid, 'meta',
      'Agendar la sesión de Meta de ' || coalesce(v_nombre, ''),
      'El cliente pidió agendar la configuración de Meta Business (30 min).',
      v_due, 'media');
    v_tareas := v_tareas + 1;
  end if;

  if lower(coalesce(v_resp->>'bbdd', '')) like '%ayuda%' then
    perform public._onboarding_tarea(v_cid, 'bbdd',
      'Ayudar a exportar la base de datos de ' || coalesce(v_nombre, ''),
      'El cliente tiene base de clientes pero no sabe exportarla. Con ella se arman '
        || 'audiencias similares y baja el coste por lead desde la primera semana.',
      v_due, 'media');
    v_tareas := v_tareas + 1;
  end if;

  perform public._portal_slack(v_cid,
    '🎉 *' || coalesce(v_nombre, 'Cliente') || '* terminó su onboarding en la plataforma.' || E'\n'
    || '• ' || p.respondidas || '/' || p.requeridas || ' respuestas · '
    || coalesce(v_wb->>'chars', '?') || ' caracteres al cerebro' || E'\n'
    || case when v_run.agenda_at is not null
            then '• Sesión agendada para el '
                 || to_char(v_run.agenda_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM a las HH24:MI')
                 || ' (hora AR)' || E'\n'
            else '• ⚠️ Sin sesión agendada — hay que agendarla a mano' || E'\n' end
    || case when v_run.grabacion_fecha is not null
            then '• Grabación con fecha firme: ' || to_char(v_run.grabacion_fecha, 'DD/MM') || E'\n'
            else '' end
    || '• ' || v_tareas || ' tareas creadas · Descubrimiento paso 4 destrabado.');

  return jsonb_build_object('ok', true, 'progreso', 100,
                            'chars', v_wb->>'chars',
                            'agendaAt', v_run.agenda_at,
                            'grabacion', v_run.grabacion_fecha,
                            'tareas', v_tareas);
end $$;

revoke execute on function public.portal_onboarding_completar() from public, anon;
grant  execute on function public.portal_onboarding_completar() to authenticated, service_role;

-- ── 3 · La fecha de grabación ────────────────────────────────────────────────
-- El paso 20 pide solo el día, sin horario ni reserva de calendario: el equipo
-- confirma la hora por WhatsApp. Se guarda en el run —no solo como respuesta—
-- para que el panel y la tarea la puedan leer sin parsear texto.
create or replace function public.portal_onboarding_grabacion(p_fecha date)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_cid text; v_run text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok', false, 'error', 'sin_cliente'); end if;
  v_run := public._onboarding_run(v_cid);
  if v_run is null then return jsonb_build_object('ok', false, 'error', 'sin_run'); end if;

  if p_fecha is not null and p_fecha < current_date then
    return jsonb_build_object('ok', false, 'error', 'fecha_pasada');
  end if;

  update public.onboarding_runs set grabacion_fecha = p_fecha where id = v_run;
  return jsonb_build_object('ok', true, 'fecha', p_fecha);
end $$;

revoke execute on function public.portal_onboarding_grabacion(date) from public, anon;
grant  execute on function public.portal_onboarding_grabacion(date) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
