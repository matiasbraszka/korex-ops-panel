-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v39_onboarding_documento_maquetado.sql
--
-- El documento de onboarding deja de ser un bloque de texto plano y pasa a ser
-- un documento maquetado: portada con el avance por bloque, un encabezado por
-- bloque, un H2 por paso, las respuestas largas en tarjeta y las cortas en
-- tabla pregunta/respuesta. Es lo que el equipo lee para conocer al cliente.
--
-- DÓNDE VIVE CADA COSA (importante, y no es intercambiable):
--
--   client_brain_docs.panel_html  → la maqueta. La leen las personas.
--   client_brain_docs.text        → 'P: … / R: …' plano. Lo leen los agentes.
--   del_sections.text             → las piezas de ese texto plano.
--   del_sections.html             → SE DEJA VACÍO A PROPÓSITO.
--
-- Lo último no es un olvido: `del_assemble_text` prefiere `html` sobre `text`
-- cuando el html no está vacío, y lo aplana reemplazando cada etiqueta por un
-- espacio. Si maquetáramos ahí, `client_brain_docs.text` — que es de donde el
-- extractor de los agentes saca las respuestas — se convertiría en una sopa de
-- una sola línea sin la estructura P:/R:. La maqueta va en `panel_html`, que
-- nadie aplana.
--
-- De paso, se deja de borrar y reinsertar las 23 secciones en cada pasada. El
-- trigger `trg_papelera_dsec` guarda una copia de CADA fila borrada: un cliente
-- contestando durante hora y media generaba ~1.000 filas de papelera por
-- onboarding. Ahora se hace upsert por id (el pkey NO es deferrable; el que sí
-- lo es, y por eso no sirve de árbitro, es `del_sections_doc_ord_uq`) y solo se
-- borra lo que realmente dejó de existir.
--
-- La plantilla es el catálogo: no hay HTML escrito a mano en ningún lado. Si
-- desde el constructor se edita una pregunta, se agrega o se reordena un paso,
-- el documento de todos los clientes en curso se rearma con esa forma —
-- `onboarding_refrescar_documentos()` es lo que dispara ese repaso. Los
-- onboardings ya entregados no se tocan.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── Helpers de escapado ──────────────────────────────────────────────────────
-- Todo lo que escribió el cliente pasa por acá antes de entrar al html. El
-- sanitizador del panel es la segunda barrera, no la primera.
create or replace function public._onb_esc(p text)
returns text language sql immutable
set search_path to 'public', 'pg_temp'
as $$
  select replace(replace(replace(replace(coalesce(p, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

-- Una respuesta corta con saltos de línea (opciones múltiples, archivos) se ve
-- mucho mejor como lista que como un renglón con separadores.
create or replace function public._onb_valor_html(p text)
returns text language sql immutable
set search_path to 'public', 'pg_temp'
as $$
  select case
    when btrim(coalesce(p, '')) = '' then ''
    when position(E'\n' in btrim(p)) = 0 then public._onb_esc(btrim(p))
    else '<ul style="margin:0;padding-left:16px">'
         || coalesce((select string_agg('<li style="margin:1px 0">' || public._onb_esc(btrim(l)) || '</li>', '')
                        from unnest(string_to_array(btrim(p), E'\n')) l
                       where btrim(l) <> ''), '')
         || '</ul>'
  end
$$;

comment on function public._onb_esc(text) is
  'Escapa texto del cliente para meterlo en el html del documento de onboarding.';

-- ── El documento ─────────────────────────────────────────────────────────────
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
  v_txt      text;      -- cuerpo plano del paso
  v_shtml    text;      -- cuerpo maquetado del paso
  v_html     text := '';  -- cuerpo maquetado del documento
  v_cab      text;      -- portada maquetada
  v_cabtxt   text;      -- portada en plano
  v_filas    text := '';  -- filas de la tabla de bloques
  v_pend     text := '';  -- encabezado de bloque todavía sin emitir
  v_bloque   text := null;
  v_color    text;
  v_secs     int := 0;
  v_hechas   int;
  v_total    int;
  v_th       int := 0;
  v_tt       int := 0;
  v_pct      int := 0;
  v_tabla    boolean;   -- ¿venimos escribiendo una tabla de respuestas cortas?
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

  -- Guarda: un cliente que borra sus respuestas no puede vaciar el documento
  -- del que dependen estrategia y avatar.
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

  -- ── Un paso por sección, en orden de bloque ────────────────────────────────
  for r in
    select s.skey, s.orden, s.badge, s.titulo,
           b.bkey, b.nombre as bnombre, b.titulo as btitulo, bo.n as bnum
      from public.onboarding_sections s
      join public.onboarding_bloques b on b.bkey = s.bkey and coalesce(b.activa, true)
      join (select bkey, row_number() over (order by orden) as n
              from public.onboarding_bloques where coalesce(activa, true)) bo
        on bo.bkey = b.bkey
     where s.activa and s.bkey is not null
     order by b.orden, s.orden
  loop
    v_color := v_paleta[((r.bnum - 1) % array_length(v_paleta, 1)) + 1];

    -- El encabezado del bloque queda pendiente hasta que haya un paso real que
    -- mostrar: un bloque entero oculto por condiciones no deja un título huérfano.
    if v_bloque is distinct from r.bkey then
      v_bloque := r.bkey;
      v_pend :=
        '<p style="margin:34px 0 3px;padding-top:16px;border-top:2px solid #EEF1F6;'
        || 'font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:'
        || v_color || '">' || public._onb_esc(r.bnombre) || '</p>'
        || '<h1 style="margin:0 0 2px;font-size:20px;font-weight:800;letter-spacing:-.015em;color:#0D1117">'
        || public._onb_esc(r.btitulo) || '</h1>';
    end if;

    v_txt := ''; v_shtml := ''; v_hechas := 0; v_total := 0; v_tabla := false;

    for q in
      -- Una pregunta sin `label` (la agenda del paso 00 no lo necesita en el
      -- portal, la pantalla tiene su propio encabezado) dejaba un "P: " vacío en
      -- el documento. Acá siempre hay algo que leer.
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

      -- Texto plano para los agentes: el formato que ya consumen, intacto.
      v_txt := v_txt
        || case when v_txt = '' then '' else E'\n\n' end
        || 'P: ' || q.label
        || case when q.source in ('voz', 'mixto') then ' [respuesta hablada]' else '' end
        || E'\n' || 'R: ' || case when v_resp <> '' then v_resp else '(sin responder)' end;

      if q.qtype = 'abierta' then
        -- Respuesta de desarrollo: título propio y tarjeta. Es lo que se lee.
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
        -- Respuesta corta (opción, dato, archivo): fila de tabla. Se escanea.
        if not v_tabla then
          -- `display:table` pisa el `display:block` de `.del-rich table` (que existe
          -- para que una tabla ancha scrollee sola). Acá no hace falta: con
          -- `table-layout:fixed` las columnas respetan el ancho y el texto envuelve.
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

    -- Encabezado del paso: badge, título y cuántas lleva contestadas.
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

    -- html se deja NULL a propósito: `del_assemble_text` lo preferiría sobre
    -- `text` y aplanaría el P:/R: que leen los agentes. Ver la cabecera.
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

  -- ── Compliance: lo único que el documento marca en rojo ────────────────────
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
      || '<p style="margin:34px 0 3px;padding-top:16px;border-top:2px solid #EEF1F6;'
      || 'font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;'
      || 'color:#B42318">Compliance</p>'
      || '<h1 style="margin:0 0 8px;font-size:20px;font-weight:800;letter-spacing:-.015em;color:#0D1117">'
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

  -- ── Portada: dónde está parado el cliente, de un vistazo ───────────────────
  v_pct := case when v_tt > 0 then round(v_th::numeric * 100 / v_tt) else 0 end;

  for rb in
    select b.bkey, b.nombre, b.titulo, bo.n as bnum,
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
     group by b.bkey, b.nombre, b.titulo, bo.n, b.orden
     order by b.orden
  loop
    v_color := v_paleta[((rb.bnum - 1) % array_length(v_paleta, 1)) + 1];
    v_filas := v_filas
      || '<tr><td style="width:52%;min-width:0;border:none;border-left:3px solid ' || v_color
      || ';padding:8px 0 8px 11px;vertical-align:top;word-break:break-word">'
      || '<strong style="font-size:13px;color:#1A1D26">' || public._onb_esc(rb.nombre) || '</strong><br>'
      || '<span style="font-size:11px;color:#9098A4">' || public._onb_esc(rb.titulo) || '</span></td>'
      || '<td style="min-width:0;border:none;padding:8px 12px;font-size:12.5px;color:#6B7280;'
      || 'vertical-align:top">' || rb.hechas || ' de ' || rb.total || '</td>'
      || '<td style="min-width:0;border:none;padding:8px 0;font-size:12.5px;font-weight:700;'
      || 'vertical-align:top;color:'
      || case when rb.hechas = 0 then '#9098A4' when rb.hechas = rb.total then '#16A34A' else '#B45309' end
      || '">' || case when rb.hechas = 0 then 'Sin empezar'
                      when rb.hechas = rb.total then 'Completo' else 'En curso' end
      || '</td></tr>';
  end loop;

  v_cab :=
    '<p style="margin:0 0 3px;font-size:10.5px;font-weight:800;letter-spacing:.14em;'
    || 'text-transform:uppercase;color:#4878FF">Onboarding · lo completó el cliente</p>'
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

  -- Solo se borra lo que dejó de existir (un paso desactivado, una condición que
  -- se cerró). Sin esto la papelera se llenaba con 23 filas cada dos minutos.
  delete from public.del_sections ds
   where ds.doc_id = v_doc and not (ds.id = any(v_ids));

  -- La maqueta. Es de sistema, no de nadie: por eso se limpia la firma de edición.
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

-- La única pregunta del catálogo sin etiqueta. En el portal no hace falta (la
-- pantalla de agenda tiene su propio encabezado), pero en el documento sí.
update public.onboarding_questions
   set label = 'Sesión de onboarding agendada', updated_at = now()
 where qkey = 'sesion' and btrim(coalesce(label, '')) = '';

-- ── El constructor rearma los documentos en curso ────────────────────────────
-- La plantilla ES el catálogo. Si se edita una pregunta, se agrega un paso o se
-- reordena un bloque, el documento del cliente tiene que reflejarlo sin esperar
-- a que el cliente vuelva a escribir. Marca sucios los runs en curso y el cron
-- de dos minutos hace el resto. Los `completado` quedan afuera: un onboarding
-- entregado no se reabre ni se recalcula.
create or replace function public.onboarding_refrescar_documentos()
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_n int;
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;
  update public.onboarding_runs
     set texto_dirty_at = now()
   where estado not in ('completado', 'archivado');
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'runs', v_n);
end $$;

revoke execute on function public.onboarding_refrescar_documentos() from public, anon;
grant  execute on function public.onboarding_refrescar_documentos() to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
