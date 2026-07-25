-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente v20 — ONBOARDING: RPCs
-- Aplicada a prod el 2026-07-25 vía MCP. Los permisos finales los fija v24.
--
-- Mismo contrato que el resto del portal: security definer, search_path fijo,
-- grant a authenticated, y la primera línea siempre resuelve el cliente con
-- portal_cliente_client(). El cliente nunca toca las tablas directo.
--
-- Regla de oro del guardado: NUNCA se rechaza una escritura del cliente. Si hay
-- edición concurrente (celular + notebook), la última gana y se devuelve
-- conflict:true para que la UI avise. Rechazar sería perder lo que escribió.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1 · Catálogo (idéntico para todos los clientes; el front lo cachea) ──────
create or replace function public.portal_onboarding_catalogo()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'version', (select coalesce(max(greatest(s.updated_at, q.updated_at)), now())
                  from public.onboarding_sections s
                  left join public.onboarding_questions q on q.skey = s.skey),
    'secciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'skey', s.skey, 'titulo', s.titulo, 'subtitulo', s.subtitulo,
        'promesa', s.promesa, 'intro', s.intro_md, 'video', s.video_url,
        'minutos', s.minutos, 'checkpoint', s.checkpoint, 'desbloquea', s.desbloquea,
        'preguntas', coalesce((
          select jsonb_agg(jsonb_build_object(
            'qkey', q.qkey, 'grupo', q.grupo, 'label', q.label, 'sublabel', q.sublabel,
            'ayuda', q.ayuda_md, 'ejemplo', q.ejemplo, 'chips', q.chips,
            'placeholder', q.placeholder, 'video', q.video_url,
            'tipo', q.qtype, 'opciones', q.opciones, 'voz', q.voz,
            'requerida', q.requerida, 'minChars', q.min_chars, 'peso', q.peso,
            'minutos', q.minutos, 'visibleSi', q.visible_si,
            'bucket', q.bucket_key, 'target', q.target_count
          ) order by q.orden)
          from public.onboarding_questions q
          where q.skey = s.skey and q.activa), '[]'::jsonb)
      ) order by s.orden)
      from public.onboarding_sections s where s.activa), '[]'::jsonb)
  );
$$;

-- ── 2 · Estado del cliente (respuestas + progreso + agenda + prefill) ────────
create or replace function public.portal_onboarding_estado()
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_cid text; v_run text; v_r record; v_cli record; p record;
  v_prefill jsonb; v_agenda jsonb;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;

  v_run := public._onboarding_run(v_cid);
  if v_run is null then return null; end if;

  update public.onboarding_runs set last_seen_at = now() where id = v_run;

  select * into v_r from public.onboarding_runs where id = v_run;
  select id, name, company, niche, email, phone, country, contract_data, conector
    into v_cli from public.clients where id = v_cid;
  select * into p from public.onboarding_progreso(v_run);

  -- Lo que el sistema YA sabe: se muestra para confirmar, no se vuelve a preguntar.
  v_prefill := jsonb_build_object(
    'nombre', v_cli.name, 'empresa', coalesce(nullif(v_cli.company,''), v_cli.niche),
    'nicho', v_cli.niche, 'email', v_cli.email, 'telefono', v_cli.phone,
    'pais', v_cli.country, 'contrato', v_cli.contract_data, 'conector', v_cli.conector
  );

  v_agenda := jsonb_build_object(
    'estado', v_r.agenda_estado,
    'at', v_r.agenda_at,
    'motivo', v_r.agenda_motivo,
    'meetingLink', (select a.meeting_link from public.appointments a
                     where a.id = v_r.agenda_appointment_id)
  );

  return jsonb_build_object(
    'runId', v_run,
    'estado', v_r.estado,
    'progreso', p.progreso,
    'requeridas', p.requeridas,
    'respondidas', p.respondidas,
    'faltan', to_jsonb(p.faltan),
    'bloqueantes', p.bloqueantes,
    'agenda', v_agenda,
    'prefill', v_prefill,
    'respuestas', coalesce((
      select jsonb_object_agg(a.qkey, jsonb_build_object(
        'valor', a.value_text, 'valorJson', a.value_json, 'source', a.source,
        'flag', a.flag, 'updatedAt', a.updated_at))
      from public.onboarding_answers a where a.run_id = v_run), '{}'::jsonb)
  );
end $$;

-- ── 3 · Autosave de UNA respuesta ────────────────────────────────────────────
create or replace function public.portal_onboarding_guardar(
  p_qkey       text,
  p_value_text text,
  p_value_json jsonb default null,
  p_source     text default 'texto',
  p_flag       text default null,
  p_transcript text default null,
  p_audio_path text default null,
  p_audio_ms   int  default null,
  p_expected   timestamptz default null    -- último updated_at que conoce el front
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_cid text; v_run text; v_val text; v_prev timestamptz; v_conflict boolean := false;
  v_estado text; v_first boolean := false; v_nombre text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok', false, 'error', 'sin_cliente'); end if;

  if not exists (select 1 from public.onboarding_questions where qkey = p_qkey and activa) then
    return jsonb_build_object('ok', false, 'error', 'pregunta_desconocida');
  end if;

  v_run := public._onboarding_run(v_cid);
  if v_run is null then return jsonb_build_object('ok', false, 'error', 'sin_run'); end if;

  -- Tope defensivo: una respuesta hablada de 10 minutos ronda los 8.000 chars.
  v_val := left(coalesce(p_value_text, ''), 20000);

  select updated_at into v_prev from public.onboarding_answers
   where run_id = v_run and qkey = p_qkey;
  if p_expected is not null and v_prev is not null and v_prev > p_expected then
    v_conflict := true;   -- se editó en otro dispositivo; igual escribimos
  end if;

  select estado into v_estado from public.onboarding_runs where id = v_run;
  v_first := (v_estado = 'invitado');

  insert into public.onboarding_answers as oa
    (run_id, client_id, qkey, value_text, value_json, source, flag,
     transcript, audio_path, audio_ms, answered_at)
  values (v_run, v_cid, p_qkey, v_val, p_value_json, coalesce(p_source,'texto'), p_flag,
          p_transcript, p_audio_path, p_audio_ms,
          case when btrim(v_val) <> '' then now() end)
  on conflict (run_id, qkey) do update set
    value_text  = excluded.value_text,
    value_json  = coalesce(excluded.value_json, oa.value_json),
    source      = case when oa.source <> excluded.source and oa.source <> 'equipo'
                       then 'mixto' else excluded.source end,
    flag        = excluded.flag,
    transcript  = coalesce(excluded.transcript, oa.transcript),
    audio_path  = coalesce(excluded.audio_path, oa.audio_path),
    audio_ms    = coalesce(excluded.audio_ms, oa.audio_ms),
    revision    = oa.revision + 1,
    answered_at = coalesce(oa.answered_at, excluded.answered_at),
    updated_at  = now();

  -- Primera escritura del cliente: arranca el run y se avisa al equipo.
  if v_first then
    update public.onboarding_runs
       set estado = 'en_curso', started_at = coalesce(started_at, now()), last_seen_at = now()
     where id = v_run;
    insert into public.portal_eventos (client_id, tipo, payload)
    values (v_cid, 'onboarding_inicio', jsonb_build_object('run', v_run));
    select name into v_nombre from public.clients where id = v_cid;
    perform public._portal_slack(v_cid,
      '📝 *'||coalesce(v_nombre,'Cliente')||'* empezó a completar su onboarding.');
  else
    update public.onboarding_runs set last_seen_at = now() where id = v_run;
  end if;

  -- Si ya estaba completado y sigue editando, el documento del cerebro queda viejo.
  if v_estado = 'completado' then
    update public.onboarding_runs set writeback_at = null where id = v_run;
  end if;

  return public._onboarding_refrescar(v_run)
       || jsonb_build_object('ok', true, 'conflict', v_conflict,
                             'needsWriteback', v_estado = 'completado');
end $$;

-- ── 4 · Guardado en lote (flush al reconectar / al cerrar) ───────────────────
create or replace function public.portal_onboarding_guardar_lote(p_items jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare it jsonb; v_ok int := 0; v_err int := 0; v_res jsonb;
begin
  if public.portal_cliente_client() is null then
    return jsonb_build_object('ok', false, 'error', 'sin_cliente');
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_res := public.portal_onboarding_guardar(
      it->>'qkey', it->>'valor', it->'valorJson',
      coalesce(it->>'source','texto'), it->>'flag',
      it->>'transcript', it->>'audioPath', nullif(it->>'audioMs','')::int, null);
    if coalesce((v_res->>'ok')::boolean, false) then v_ok := v_ok + 1; else v_err := v_err + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'guardadas', v_ok, 'fallidas', v_err);
end $$;

-- ── 5 · Cierre de tramo (evento; no valida nada duro) ───────────────────────
create or replace function public.portal_onboarding_seccion_completa(p_skey text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_cid text; v_run text; v_tit text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok', false); end if;
  v_run := public._onboarding_run(v_cid);
  select titulo into v_tit from public.onboarding_sections where skey = p_skey;
  insert into public.portal_eventos (client_id, tipo, payload)
  values (v_cid, 'onboarding_seccion', jsonb_build_object('skey', p_skey, 'titulo', v_tit));
  return public._onboarding_refrescar(v_run) || jsonb_build_object('ok', true);
end $$;

-- ── 6 · Paso 0 · Agenda ──────────────────────────────────────────────────────
-- Datos que necesita la pantalla para llamar a la edge function `agenda-publica`
-- (el sistema de agenda de Soporte). El cliente no tipea nada: nombre, email y
-- teléfono salen de su ficha.
create or replace function public.portal_onboarding_agenda_datos()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_cid text; v_cli record; v_token text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;
  select name, email, phone, country into v_cli from public.clients where id = v_cid;
  select value->>'onboarding_calendar_token' into v_token
    from public.app_settings where key = 'portal_config';
  return jsonb_build_object(
    'token', v_token,
    'nombre', v_cli.name, 'email', v_cli.email,
    'telefono', v_cli.phone, 'pais', v_cli.country
  );
end $$;

-- Registra la reserva ya creada por `agenda-publica`. Idempotente.
create or replace function public.portal_onboarding_agenda_registrar(p_appointment_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_cid text; v_run text; v_start timestamptz; v_nombre text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok', false); end if;
  v_run := public._onboarding_run(v_cid);

  select start_at into v_start from public.appointments where id = p_appointment_id;
  if v_start is null then return jsonb_build_object('ok', false, 'error', 'cita_inexistente'); end if;

  update public.onboarding_runs
     set agenda_estado = 'agendado', agenda_appointment_id = p_appointment_id,
         agenda_at = v_start, agenda_motivo = null
   where id = v_run;

  insert into public.portal_eventos (client_id, tipo, payload)
  values (v_cid, 'onboarding_agendado', jsonb_build_object('appointment', p_appointment_id, 'at', v_start));

  select name into v_nombre from public.clients where id = v_cid;
  perform public._portal_slack(v_cid,
    '📅 *'||coalesce(v_nombre,'Cliente')||'* agendó su sesión de onboarding para el '
    ||to_char(v_start at time zone 'America/Argentina/Buenos_Aires','DD/MM à HH24:MI')||' (hora AR).');

  return public._onboarding_refrescar(v_run) || jsonb_build_object('ok', true, 'at', v_start);
end $$;

-- Escape hatch: el sistema de agenda no responde, no hay disponibilidad cargada,
-- o el cliente ya agendó por otro lado. Nunca dejamos el onboarding congelado
-- por un problema de calendario.
create or replace function public.portal_onboarding_agenda_omitir(p_motivo text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_cid text; v_run text; v_nombre text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok', false); end if;
  v_run := public._onboarding_run(v_cid);

  update public.onboarding_runs
     set agenda_estado = 'omitido', agenda_motivo = coalesce(p_motivo, 'sin_motivo')
   where id = v_run and agenda_estado <> 'agendado';

  insert into public.portal_eventos (client_id, tipo, payload)
  values (v_cid, 'onboarding_agenda_omitida', jsonb_build_object('motivo', p_motivo));

  select name into v_nombre from public.clients where id = v_cid;
  perform public._portal_slack(v_cid,
    '⚠️ *'||coalesce(v_nombre,'Cliente')||'* no pudo agendar su sesión desde la plataforma'
    ||coalesce(' ('||nullif(p_motivo,'')||')','')||'. Hay que agendarla a mano.');

  return public._onboarding_refrescar(v_run) || jsonb_build_object('ok', true);
end $$;

-- ── 7 · Lado equipo ──────────────────────────────────────────────────────────
create or replace function public.onboarding_admin_estado(p_client_id text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_run text; v_r record; p record;
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;
  select id into v_run from public.onboarding_runs
   where client_id = p_client_id and estado <> 'archivado' limit 1;
  if v_run is null then
    return jsonb_build_object('ok', true, 'existe', false);
  end if;
  select * into v_r from public.onboarding_runs where id = v_run;
  select * into p from public.onboarding_progreso(v_run);

  return jsonb_build_object(
    'ok', true, 'existe', true, 'runId', v_run, 'estado', v_r.estado,
    'progreso', p.progreso, 'requeridas', p.requeridas, 'respondidas', p.respondidas,
    'faltan', to_jsonb(p.faltan), 'bloqueantes', p.bloqueantes,
    'agenda', jsonb_build_object('estado', v_r.agenda_estado, 'at', v_r.agenda_at,
                                 'motivo', v_r.agenda_motivo),
    'invitadoAt', v_r.invitado_at, 'inviteCount', v_r.invite_count,
    'inviteCanal', v_r.invite_canal, 'inviteError', v_r.invite_last_error,
    'startedAt', v_r.started_at, 'lastSeenAt', v_r.last_seen_at,
    'completadoAt', v_r.completado_at, 'writebackAt', v_r.writeback_at,
    'writebackWarning', v_r.writeback_warning,
    'respuestas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'qkey', q.qkey, 'seccion', q.skey, 'label', q.label, 'minChars', q.min_chars,
        'valor', coalesce(a.value_text,''), 'chars', length(coalesce(a.value_text,'')),
        'source', a.source, 'flag', a.flag, 'updatedAt', a.updated_at)
        order by q.plantilla_ord)
      from public.onboarding_questions q
      left join public.onboarding_answers a on a.run_id = v_run and a.qkey = q.qkey
      where q.activa), '[]'::jsonb)
  );
end $$;

-- Verifica y REPARA el vínculo cliente ↔ fin_directory ↔ portal_access.
--
-- Este es el modo de falla número uno de todo el onboarding: portal_cliente_client()
-- resuelve comparando fin_norm(clients.name) contra fin_directory.nombre + aliases,
-- y crear-venta escribe esos dos campos desde inputs distintos del formulario de
-- venta. Un cliente que no matchea entra a la plataforma y la ve VACÍA, sin error
-- y sin aviso. Por eso onboarding-invitar llama a esta función ANTES de mandar
-- nada, y si devuelve vinculo_ok=false no invita: avisa al equipo.
create or replace function public.onboarding_vincular(p_client_id text, p_email text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_cli record; v_person uuid; v_email text; v_norm text;
  v_keys text[]; v_ok boolean := false; v_reparado boolean := false;
begin
  if not (public.is_team_member() or current_setting('request.jwt.claim.role', true) = 'service_role') then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;

  select id, name, email into v_cli from public.clients where id = p_client_id;
  if v_cli.id is null then return jsonb_build_object('ok', false, 'error', 'cliente_inexistente'); end if;

  v_email := lower(btrim(coalesce(nullif(p_email,''), v_cli.email, '')));
  v_norm  := public.fin_norm(v_cli.name);
  v_person := public._portal_person_de_cliente(p_client_id);

  -- 1 · No hay persona en el directorio: la creamos (el trigger provisiona la cuenta).
  if v_person is null then
    if v_email = '' or v_email not like '%_@_%.__%' then
      return jsonb_build_object('ok', false, 'error', 'falta_email',
        'detail', 'El cliente no tiene email cargado y no se pasó ninguno.');
    end if;
    insert into public.fin_directory (nombre, email, tipo)
    values (v_cli.name, v_email, 'Cliente')
    returning id into v_person;
    v_reparado := true;
  else
    -- 2 · Hay persona pero sin email: lo completamos.
    if (select coalesce(email,'') from public.fin_directory where id = v_person) = '' then
      if v_email = '' or v_email not like '%_@_%.__%' then
        return jsonb_build_object('ok', false, 'error', 'falta_email',
          'detail', 'Su ficha del directorio no tiene email.');
      end if;
      update public.fin_directory set email = v_email where id = v_person;
      v_reparado := true;
    end if;
  end if;

  -- 3 · LA REPARACIÓN CLAVE: si el nombre del cliente no está entre las claves
  --     normalizadas de la persona, lo agregamos como alias.
  select array_agg(public.fin_norm(x)) into v_keys
    from (select nombre as x from public.fin_directory where id = v_person
          union all
          select unnest(coalesce(aliases,'{}')) from public.fin_directory where id = v_person) t;

  if v_norm is not null and not (v_norm = any(coalesce(v_keys,'{}'))) then
    update public.fin_directory
       set aliases = array(select distinct e from unnest(coalesce(aliases,'{}') || v_cli.name) e)
     where id = v_person;
    v_reparado := true;
  end if;

  -- 4 · Asegura la fila de portal_access.
  if not exists (select 1 from public.portal_access where person_id = v_person) then
    perform public.portal_provision_account(v_person);
  end if;

  -- 5 · Verificación del ida y vuelta: ¿la persona resuelve de nuevo a este cliente?
  select array_agg(public.fin_norm(x)) into v_keys
    from (select nombre as x from public.fin_directory where id = v_person
          union all
          select unnest(coalesce(aliases,'{}')) from public.fin_directory where id = v_person) t;
  v_ok := v_norm = any(coalesce(v_keys,'{}'));

  return jsonb_build_object(
    'ok', v_ok, 'vinculo_ok', v_ok, 'reparado', v_reparado,
    'person_id', v_person,
    'login_email', (select login_email from public.portal_access
                     where person_id = v_person and enabled limit 1),
    'password', (select shared_secret from public.portal_access
                  where person_id = v_person and enabled limit 1),
    'auth_user_id', (select auth_user_id from public.portal_access
                      where person_id = v_person and enabled limit 1),
    'error', case when v_ok then null else 'sin_vinculo' end
  );
end $$;

grant execute on function
  public.portal_onboarding_catalogo(),
  public.portal_onboarding_estado(),
  public.portal_onboarding_guardar(text, text, jsonb, text, text, text, text, int, timestamptz),
  public.portal_onboarding_guardar_lote(jsonb),
  public.portal_onboarding_seccion_completa(text),
  public.portal_onboarding_agenda_datos(),
  public.portal_onboarding_agenda_registrar(uuid),
  public.portal_onboarding_agenda_omitir(text),
  public.onboarding_admin_estado(text),
  public.onboarding_vincular(text, text)
to authenticated;

notify pgrst, 'reload schema';
