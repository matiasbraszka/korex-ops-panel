-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v40_onboarding_documento_seco_y_solo_nuevos.sql
--
-- Dos cosas, las dos por el mismo motivo: el documento del DEL es una
-- herramienta interna, no una pieza de comunicación.
--
-- 1 · SE SACA LA ARENGA. El documento repetía los remates de cada bloque
--     ("Con esto ya podemos escribir tu VSL y tus anuncios", "Terminaste, ahora
--     empezamos nosotros"). Eso está escrito para el cliente mientras contesta;
--     en el DEL solo mete ruido y puede leerse como una instrucción al equipo.
--     Queda el esqueleto: bloque, paso, pregunta, respuesta.
--
-- 2 · EL ONBOARDING NUEVO ES SOLO PARA CLIENTES NUEVOS. `portal_onboarding_estado`
--     llamaba a `_onboarding_run`, que CREA el run si no existe. Resultado: un
--     cliente viejo — que ya hizo su onboarding por el camino anterior — abría su
--     portal y se le fabricaba uno nuevo, con su pestaña de 107 preguntas sin
--     responder colgando del DEL. Pasó con Sergio Cánovas.
--
--     Ahora esa función solo LEE. El run se crea por los dos caminos explícitos
--     que ya existen: el trigger de alta de cliente (`onboarding_preparar`) y la
--     invitación desde el panel (`onboarding-invitar`). Quien no tenga run, no ve
--     onboarding — y `portal_cliente_inicio` ya contempla ese caso
--     (`{existe:false, completo:true}`), así que no le traba nada del portal.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1 · El documento, sin arenga ─────────────────────────────────────────────
create or replace function public.onboarding_sync_texto(p_client_id text, p_force boolean default false)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_run      record;
  v_doc      text := 'onb_' || p_client_id;
  v_node     text := 'native_onb_' || p_client_id;
  v_nombre   text;
  v_prev     int := 0;
  v_len      int := 0;
  r          record;
  q          record;
  rb         record;
  v_txt      text;
  v_shtml    text;
  v_html     text := '';
  v_cab      text;
  v_cabtxt   text;
  v_filas    text := '';
  v_pend     text := '';
  v_bloque   text := null;
  v_color    text;
  v_secs     int := 0;
  v_hechas   int;
  v_total    int;
  v_th       int := 0;
  v_tt       int := 0;
  v_pct      int := 0;
  v_tabla    boolean;
  v_resp     text;
  v_compl    text;
  v_ids      text[] := '{}';
  v_id       text;
  v_paleta   text[] := array['#4878FF', '#7C3AED', '#EA580C', '#0D9488'];
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

  select coalesce(sum(length(btrim(a.value_text))), 0) into v_len
    from public.onboarding_answers a
    join public.onboarding_questions qq on qq.qkey = a.qkey and qq.activa
    join public.onboarding_sections s on s.skey = qq.skey and s.activa and s.bkey is not null
   where a.run_id = v_run.id and btrim(coalesce(a.value_text, '')) <> ''
     and public._onboarding_visible(v_run.id, qq.visible_si);

  if v_prev > 0 and v_len < v_prev * 0.30 and not p_force then
    update public.onboarding_runs
       set writeback_warning = 'Las respuestas pasaron de ' || v_prev || ' a '
                             || v_len || ' caracteres. No se reescribio.'
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

  for r in
    select s.skey, s.orden, s.badge, s.titulo,
           b.bkey, b.nombre as bnombre, bo.n as bnum
      from public.onboarding_sections s
      join public.onboarding_bloques b on b.bkey = s.bkey and coalesce(b.activa, true)
      join (select bkey, row_number() over (order by orden) as n
              from public.onboarding_bloques where coalesce(activa, true)) bo
        on bo.bkey = b.bkey
     where s.activa and s.bkey is not null
     order by b.orden, s.orden
  loop
    v_color := v_paleta[((r.bnum - 1) % array_length(v_paleta, 1)) + 1];

    -- Solo el nombre del bloque. El remate ("Con esto ya podemos escribir tu
    -- VSL…") es para el cliente mientras contesta, no para quien lee acá.
    if v_bloque is distinct from r.bkey then
      v_bloque := r.bkey;
      v_pend :=
        '<h1 style="margin:34px 0 4px;padding-top:16px;border-top:2px solid #EEF1F6;'
        || 'font-size:19px;font-weight:800;letter-spacing:-.015em;color:'
        || v_color || '">' || public._onb_esc(r.bnombre) || '</h1>';
    end if;

    v_txt := ''; v_shtml := ''; v_hechas := 0; v_total := 0; v_tabla := false;

    for q in
      -- Una pregunta sin `label` (la agenda del paso 00 no lo necesita en el
      -- portal, la pantalla tiene su propio encabezado) dejaba un "P: " vacío.
      select qs.qkey, qs.qtype, qs.largo_objetivo,
             coalesce(nullif(btrim(qs.label), ''), nullif(btrim(qs.cabecera), ''), qs.qkey) as label,
             a.value_text, a.source
        from public.onboarding_questions qs
        left join public.onboarding_answers a
               on a.run_id = v_run.id and a.qkey = qs.qkey
       where qs.skey = r.skey and qs.activa
         and qs.qtype not in ('info', 'resumen')
         and public._onboarding_visible(v_run.id, qs.visible_si)
       order by qs.pantalla, qs.orden
    loop
      v_resp  := btrim(coalesce(q.value_text, ''));
      v_total := v_total + 1;
      if v_resp <> '' then v_hechas := v_hechas + 1; end if;

      v_txt := v_txt
        || case when v_txt = '' then '' else E'\n\n' end
        || 'P: ' || q.label
        || case when q.source in ('voz', 'mixto') then ' [respuesta hablada]' else '' end
        || E'\n' || 'R: ' || case when v_resp <> '' then v_resp else '(sin responder)' end;

      if q.qtype = 'abierta' then
        if v_tabla then v_shtml := v_shtml || '</table>'; v_tabla := false; end if;
        v_shtml := v_shtml
          || '<h3 style="margin:16px 0 5px;font-size:13.5px;font-weight:700;color:#1A1D26">'
          || public._onb_esc(q.label)
          || case when q.source in ('voz', 'mixto')
                  then '<span style="margin-left:8px;padding:1px 6px;border-radius:5px;background:#F3E8FF;'
                       || 'color:#7C3AED;font-size:9.5px;font-weight:800;letter-spacing:.06em;'
                       || 'text-transform:uppercase">hablado</span>'
                  else '' end
          || '</h3>';
        if v_resp <> '' then
          v_shtml := v_shtml
            || '<p style="margin:0 0 4px;padding:11px 14px;border-left:3px solid ' || v_color
            || ';background:#F8FAFF;font-size:13.5px;line-height:1.62;color:#2A2E3A;'
            || 'white-space:pre-wrap">' || public._onb_esc(v_resp) || '</p>';
        else
          v_shtml := v_shtml
            || '<p style="margin:0 0 4px;padding:9px 14px;border-left:3px solid #EDEFF3;'
            || 'background:#FCFCFD;font-size:12.5px;color:#C3C9D4;font-style:italic">'
            || 'Sin responder</p>';
        end if;
      else
        if not v_tabla then
          v_shtml := v_shtml
            || '<table style="display:table;width:100%;table-layout:fixed;'
            || 'border-collapse:collapse;margin:8px 0 4px">';
          v_tabla := true;
        end if;
        v_shtml := v_shtml
          || '<tr><td style="width:40%;min-width:0;border:none;border-bottom:1px solid #F1F3F7;'
          || 'padding:7px 12px 7px 0;font-size:12.5px;line-height:1.45;color:#6B7280;'
          || 'vertical-align:top;word-break:break-word">'
          || public._onb_esc(q.label) || '</td>'
          || '<td style="min-width:0;border:none;border-bottom:1px solid #F1F3F7;padding:7px 0;'
          || 'font-size:13px;line-height:1.5;vertical-align:top;word-break:break-word;'
          || case when v_resp <> '' then 'font-weight:600;color:#1A1D26">' || public._onb_valor_html(v_resp)
                  else 'color:#C3C9D4;font-style:italic">—' end
          || '</td></tr>';
      end if;
    end loop;

    if v_total = 0 then continue; end if;
    if v_tabla then v_shtml := v_shtml || '</table>'; end if;

    v_th := v_th + v_hechas;
    v_tt := v_tt + v_total;

    v_shtml :=
      '<h2 style="margin:24px 0 2px;font-size:16.5px;font-weight:800;letter-spacing:-.01em;color:#0D1117">'
      || '<span style="padding:2px 8px;margin-right:9px;border-radius:6px;background:' || v_color
      || '14;color:' || v_color || ';font-size:12.5px;font-weight:800">'
      || public._onb_esc(r.badge) || '</span>' || public._onb_esc(r.titulo) || '</h2>'
      || '<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.03em;color:'
      || case when v_hechas = 0 then '#C3C9D4' when v_hechas = v_total then '#16A34A' else '#B45309' end
      || '">' || case when v_hechas = 0 then 'Sin responder todavía'
                      else v_hechas || ' de ' || v_total || ' respondidas' end
      || '</p>' || v_shtml;

    v_html := v_html || v_pend || v_shtml;
    v_pend := '';

    v_txt := '[' || v_hechas || ' de ' || v_total || ' respondidas]' || E'\n\n' || v_txt;
    v_id  := 'dsec_' || v_doc || '_' || r.orden;
    v_ids := v_ids || v_id;

    insert into public.del_sections
      (id, doc_id, client_id, ord, title, kind, text, html, char_count, source, updated_at)
    values (v_id, v_doc, p_client_id, r.orden,
            left(r.badge || ' · ' || r.titulo, 60), 'onboarding',
            v_txt, null, length(v_txt), 'onboarding', now())
    on conflict (id) do update
      set doc_id = excluded.doc_id, client_id = excluded.client_id, ord = excluded.ord,
          title = excluded.title, kind = excluded.kind, text = excluded.text,
          html = null, char_count = excluded.char_count,
          source = excluded.source, updated_at = now();
    v_secs := v_secs + 1;
  end loop;

  select string_agg('· ' || btrim(a.value_text), E'\n' order by qs.orden)
    into v_compl
    from public.onboarding_answers a
    join public.onboarding_questions qs on qs.qkey = a.qkey
   where a.run_id = v_run.id and qs.qkey in ('claims_no', 'palabras_no')
     and btrim(coalesce(a.value_text, '')) <> '';

  if v_compl is not null then
    v_txt := 'Lo que sigue lo declaro el cliente. NO se puede contradecir en '
          || 'copy, VSL ni anuncios.' || E'\n\n' || v_compl;
    v_html := v_html
      || '<h1 style="margin:34px 0 8px;padding-top:16px;border-top:2px solid #EEF1F6;'
      || 'font-size:19px;font-weight:800;letter-spacing:-.015em;color:#B42318">'
      || 'Restricciones de comunicación</h1>'
      || '<p style="margin:0;padding:12px 15px;border-left:3px solid #EF4444;background:#FEF2F2;'
      || 'font-size:13px;line-height:1.6;color:#7F1D1D;white-space:pre-wrap">'
      || '<strong style="color:#B42318">Lo declaró el cliente. No se puede contradecir en copy, '
      || 'VSL ni anuncios.</strong>' || E'\n' || public._onb_esc(v_compl) || '</p>';

    v_id  := 'dsec_' || v_doc || '_9000';
    v_ids := v_ids || v_id;
    insert into public.del_sections
      (id, doc_id, client_id, ord, title, kind, text, html, char_count, source, updated_at)
    values (v_id, v_doc, p_client_id, 9000,
            'RESTRICCIONES DE COMUNICACION (COMPLIANCE)', 'onboarding',
            v_txt, null, length(v_txt), 'onboarding', now())
    on conflict (id) do update
      set ord = 9000, title = excluded.title, text = excluded.text, html = null,
          char_count = excluded.char_count, source = excluded.source, updated_at = now();
    v_secs := v_secs + 1;
  end if;

  v_pct := case when v_tt > 0 then round(v_th::numeric * 100 / v_tt) else 0 end;

  for rb in
    select b.bkey, b.nombre, bo.n as bnum,
           count(*) as total,
           count(*) filter (where btrim(coalesce(a.value_text, '')) <> '') as hechas
      from public.onboarding_bloques b
      join (select bkey, row_number() over (order by orden) as n
              from public.onboarding_bloques where coalesce(activa, true)) bo
        on bo.bkey = b.bkey
      join public.onboarding_sections s on s.bkey = b.bkey and s.activa
      join public.onboarding_questions qs on qs.skey = s.skey and qs.activa
                                         and qs.qtype not in ('info', 'resumen')
      left join public.onboarding_answers a on a.run_id = v_run.id and a.qkey = qs.qkey
     where coalesce(b.activa, true)
       and public._onboarding_visible(v_run.id, qs.visible_si)
     group by b.bkey, b.nombre, bo.n, b.orden
     order by b.orden
  loop
    v_color := v_paleta[((rb.bnum - 1) % array_length(v_paleta, 1)) + 1];
    v_filas := v_filas
      || '<tr><td style="width:52%;min-width:0;border:none;border-left:3px solid ' || v_color
      || ';padding:7px 0 7px 11px;vertical-align:top;word-break:break-word;'
      || 'font-size:13px;font-weight:700;color:#1A1D26">' || public._onb_esc(rb.nombre) || '</td>'
      || '<td style="min-width:0;border:none;padding:7px 12px;font-size:12.5px;color:#6B7280;'
      || 'vertical-align:top">' || rb.hechas || ' de ' || rb.total || '</td>'
      || '<td style="min-width:0;border:none;padding:7px 0;font-size:12.5px;font-weight:700;'
      || 'vertical-align:top;color:'
      || case when rb.hechas = 0 then '#9098A4' when rb.hechas = rb.total then '#16A34A' else '#B45309' end
      || '">' || case when rb.hechas = 0 then 'Sin empezar'
                      when rb.hechas = rb.total then 'Completo' else 'En curso' end
      || '</td></tr>';
  end loop;

  v_cab :=
    '<p style="margin:0 0 3px;font-size:10.5px;font-weight:800;letter-spacing:.14em;'
    || 'text-transform:uppercase;color:#9098A4">Onboarding</p>'
    || '<h1 style="margin:0 0 7px;font-size:26px;font-weight:800;letter-spacing:-.02em;color:#0D1117">'
    || public._onb_esc(coalesce(v_nombre, p_client_id)) || '</h1>'
    || '<p style="margin:0 0 14px;font-size:12.5px;color:#6B7280">'
    || '<strong style="color:' || case when v_pct = 100 then '#16A34A' else '#4878FF' end
    || ';font-size:13px">' || v_pct || '%</strong> · ' || v_th || ' de ' || v_tt
    || ' respuestas · actualizado el '
    || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY') || ' a las '
    || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI') || '</p>'
    || case when v_filas = '' then ''
            else '<table style="display:table;width:100%;table-layout:fixed;'
                 || 'border-collapse:collapse;margin:0">' || v_filas || '</table>'
       end;

  v_cabtxt := 'Cliente: ' || coalesce(v_nombre, p_client_id) || E'\n'
           || 'Avance: ' || v_th || ' de ' || v_tt || ' respuestas (' || v_pct || '%)' || E'\n'
           || 'Actualizado: '
           || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI')
           || ' (hora AR)';

  v_id  := 'dsec_' || v_doc || '_0';
  v_ids := v_ids || v_id;
  insert into public.del_sections
    (id, doc_id, client_id, ord, title, kind, text, html, char_count, source, updated_at)
  values (v_id, v_doc, p_client_id, 0, 'Resumen del onboarding', 'onboarding',
          v_cabtxt, null, length(v_cabtxt), 'onboarding', now())
  on conflict (id) do update
    set ord = 0, title = excluded.title, text = excluded.text, html = null,
        char_count = excluded.char_count, source = excluded.source, updated_at = now();
  v_secs := v_secs + 1;

  delete from public.del_sections ds
   where ds.doc_id = v_doc and not (ds.id = any(v_ids));

  update public.client_brain_docs
     set panel_html = v_cab || v_html,
         panel_edited_by = null, panel_edited_at = null, synced_at = now()
   where id = v_doc;

  update public.onboarding_runs
     set texto_sync_at = now(), chars_respuestas = v_len, writeback_warning = null
   where id = v_run.id;

  return jsonb_build_object('ok', true, 'secciones', v_secs, 'respuestas', v_len,
                            'pct', v_pct,
                            'chars', (select char_count from public.client_brain_docs where id = v_doc));
end $$;

-- ── 2 · El portal solo LEE el run; no lo fabrica ─────────────────────────────
-- Único cambio respecto de la versión anterior: las tres líneas del principio.
create or replace function public.portal_onboarding_estado()
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cid text; v_run text; v_r record; v_cli record; p record;
  v_prefill jsonb; v_agenda jsonb;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;

  -- NO se crea el run acá. Un cliente viejo entrando a su portal no debe
  -- estrenar un onboarding que ya hizo por el camino anterior. El run nace en
  -- el alta del cliente (`onboarding_preparar`) o en la invitación del panel.
  select id into v_run from public.onboarding_runs
   where client_id = v_cid and estado <> 'archivado' limit 1;
  if v_run is null then return null; end if;

  update public.onboarding_runs set last_seen_at = now() where id = v_run;

  select * into v_r from public.onboarding_runs where id = v_run;
  select id, name, company, niche, email, phone, country, contract_data, conector
    into v_cli from public.clients where id = v_cid;
  select * into p from public.onboarding_progreso(v_run);

  v_prefill := jsonb_build_object(
    'nombre', v_cli.name, 'empresa', coalesce(nullif(v_cli.company,''), v_cli.niche),
    'nicho', v_cli.niche, 'email', v_cli.email, 'telefono', v_cli.phone,
    'pais', v_cli.country, 'contrato', v_cli.contract_data, 'conector', v_cli.conector
  );

  v_agenda := jsonb_build_object(
    'estado', v_r.agenda_estado,
    'at', v_r.agenda_at,
    'motivo', v_r.agenda_motivo,
    'grabacion', v_r.grabacion_fecha,
    'meetingLink', (select a.meeting_link from public.appointments a
                     where a.id = v_r.agenda_appointment_id)
  );

  return jsonb_build_object(
    'runId', v_run,
    'estado', v_r.estado,
    'completo', v_r.estado = 'completado',
    'progreso', p.progreso,
    'requeridas', p.requeridas,
    'respondidas', p.respondidas,
    'faltan', to_jsonb(p.faltan),
    'bloqueantes', p.bloqueantes,
    'bloques', p.bloques,
    'agenda', v_agenda,
    'prefill', v_prefill,
    'respuestas', coalesce((
      select jsonb_object_agg(a.qkey, jsonb_build_object(
        'valor', a.value_text, 'valorJson', a.value_json, 'source', a.source,
        'flag', a.flag, 'updatedAt', a.updated_at))
      from public.onboarding_answers a where a.run_id = v_run), '{}'::jsonb)
  );
end $$;

commit;

-- ── 3 · Limpieza: el onboarding que se le fabricó a un cliente viejo ─────────
-- Sergio Cánovas es cliente desde abril y ya hizo su onboarding por el camino
-- anterior. Su run se creó solo al abrir el portal.
--
-- Las cuatro condiciones juntas son deliberadas: cliente anterior al arranque
-- del onboarding nuevo, run que NADIE invitó (`invitado_at` nulo, `invite_count`
-- en cero) y sin una sola respuesta. Un cliente nuevo recién dado de alta
-- también tiene el run sin invitar y sin respuestas — la fecha es lo que lo
-- protege.
-- Se ARCHIVA en vez de borrarse: `portal_onboarding_estado` y
-- `onboarding_sync_texto` ya filtran `estado <> 'archivado'`, así que el cliente
-- deja de ver el onboarding y el documento deja de regenerarse — sin tirar una
-- fila de un cliente real. Las secciones sí se borran (quedan en la papelera).
delete from public.del_sections
 where doc_id in (
   select 'onb_' || r.client_id
     from public.onboarding_runs r
     join public.clients c on c.id = r.client_id
    where r.invitado_at is null
      and coalesce(r.invite_count, 0) = 0
      and c.created_at < '2026-07-20'::timestamptz
      and not exists (select 1 from public.onboarding_answers a
                       where a.run_id = r.id and btrim(coalesce(a.value_text, '')) <> ''));

update public.onboarding_runs r
   set estado = 'archivado'
  from public.clients c
 where c.id = r.client_id
   and r.invitado_at is null
   and coalesce(r.invite_count, 0) = 0
   and c.created_at < '2026-07-20'::timestamptz
   and not exists (select 1 from public.onboarding_answers a
                    where a.run_id = r.id and btrim(coalesce(a.value_text, '')) <> '');

-- Queda la fila vacía de `client_brain_docs` (la pestaña sin contenido en el
-- DEL). Borrarla es una decisión de Matías, no mía: es un cliente real.
--   delete from public.client_brain_docs where id = 'onb_c_1775304975528_pzu8sk';

notify pgrst, 'reload schema';
