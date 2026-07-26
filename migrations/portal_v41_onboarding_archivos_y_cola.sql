-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v41_onboarding_archivos_y_cola.sql
--
-- 1 · LAS PREGUNTAS DE ARCHIVOS DECÍAN "SIN RESPONDER" AUNQUE EL CLIENTE HUBIERA
--     SUBIDO TODO. Los campos de archivo no escriben una fila en
--     `onboarding_answers` — suben a Bunny/Storage y registran el recurso en
--     `funnel_resources`. El documento leía solo `value_text`, así que el paso 18
--     (todo el material) salía en blanco por más que el cliente hubiera cargado
--     20 fotos, y el contador del paso las daba por no hechas.
--
--     Ahora el documento cuenta los archivos donde realmente están —
--     `funnel_resources` por `bucket_key`, la misma fuente que usa
--     `_onboarding_lleno` para el porcentaje del portal— y dice cuántos hay y en
--     qué carpeta.
--
-- 2 · EL PORCENTAJE DE LA PORTADA sale de `onboarding_progreso`, que es
--     exactamente el número que ve el cliente en su pantalla. Antes lo calculaba
--     el documento por su cuenta sobre TODAS las preguntas, mientras el portal lo
--     calcula sobre las obligatorias: dos números distintos para la misma cosa,
--     que es la peor manera de perder la confianza en un tablero.
--
-- 3 · LA COLA no puede pisarse a sí misma. pg_cron dispara cada 2 minutos sin
--     esperar a que termine la pasada anterior; con muchos clientes contestando a
--     la vez, dos pasadas podían reescribir el mismo documento al mismo tiempo.
--     Un lock consultivo lo cierra: si ya hay una corriendo, la nueva se va.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

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
  v_arch     int;
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
      select qs.qkey, qs.qtype, qs.largo_objetivo, qs.bucket_key, qs.target_count,
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

      -- Los campos de archivo no dejan respuesta escrita: suben a Bunny/Storage
      -- y quedan en `funnel_resources` con el `bucket_key` de la pregunta. Si se
      -- mira solo `value_text`, el paso del material sale en blanco aunque el
      -- cliente haya cargado todo.
      if q.qtype in ('archivos', 'subida') and coalesce(q.bucket_key, '') <> '' then
        select count(*) into v_arch
          from public.funnel_resources fr
         where fr.client_id = p_client_id and fr.bucket_key = q.bucket_key;
        v_resp := case when v_arch > 0
                       then v_arch || case when v_arch = 1 then ' archivo' else ' archivos' end
                            || ' en la carpeta «' || q.bucket_key || '»'
                       else '' end;
      end if;

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

  -- El porcentaje sale de donde sale el del cliente. Que el equipo lea un número
  -- y el cliente vea otro es peor que no mostrar ninguno.
  select p.progreso into v_pct from public.onboarding_progreso(v_run.id) p;
  v_pct := coalesce(v_pct, 0);

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
    || ';font-size:13px">' || v_pct || '% completado</strong> · ' || v_th || ' de ' || v_tt
    || ' preguntas con respuesta · actualizado el '
    || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY') || ' a las '
    || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI') || '</p>'
    || case when v_filas = '' then ''
            else '<table style="display:table;width:100%;table-layout:fixed;'
                 || 'border-collapse:collapse;margin:0">' || v_filas || '</table>'
       end;

  v_cabtxt := 'Cliente: ' || coalesce(v_nombre, p_client_id) || E'\n'
           || 'Avance: ' || v_pct || '% completado · ' || v_th || ' de ' || v_tt
           || ' preguntas con respuesta' || E'\n'
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

-- ── La cola no se pisa a sí misma ────────────────────────────────────────────
-- pg_cron dispara cada 2 minutos sin esperar a que termine la pasada anterior.
-- Con muchos clientes contestando a la vez, dos pasadas podían reescribir el
-- mismo documento al mismo tiempo. Si ya hay una corriendo, la nueva se va.
create or replace function public.onboarding_sync_pendientes()
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare r record; v_n int := 0; v_err int := 0;
begin
  if not pg_try_advisory_lock(hashtext('onboarding_sync_pendientes')::bigint) then
    return jsonb_build_object('ok', true, 'saltada', true);
  end if;

  for r in
    select client_id from public.onboarding_runs
     where texto_dirty_at is not null
       and texto_dirty_at > coalesce(texto_sync_at, 'epoch'::timestamptz)
       and estado not in ('completado', 'archivado')
     order by texto_dirty_at
     limit 50
  loop
    begin
      perform public.onboarding_sync_texto(r.client_id);
      v_n := v_n + 1;
    exception when others then
      v_err := v_err + 1;
    end;
  end loop;

  perform pg_advisory_unlock(hashtext('onboarding_sync_pendientes')::bigint);
  return jsonb_build_object('ok', true, 'sincronizados', v_n, 'errores', v_err);
end $fn$;

commit;

notify pgrst, 'reload schema';