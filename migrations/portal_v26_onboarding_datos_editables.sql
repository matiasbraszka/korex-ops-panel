-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v26_onboarding_datos_editables.sql
--
-- El cliente puede CORREGIR sus datos en la pantalla de confirmación, en vez de
-- que le digamos "escribinos por WhatsApp". Mandarlo afuera de la plataforma por
-- un teléfono mal tipeado es pedirle que salga, espere y vuelva — y encima ese
-- dato es justo el que después usamos para escribirle.
--
-- Las correcciones NO se escriben desde el navegador: se guardan como
-- `value_json` de la respuesta `datos_confirmar`, y esta función las aplica en
-- el write-back, con dos categorías bien distintas:
--
--   SE APLICAN SOLAS: empresa · email · teléfono · país.
--     Son datos de contacto que el cliente posee. Si los corrigió es porque los
--     de antes estaban mal, así que van en modo overwrite.
--
--   LAS MIRA UNA PERSONA: nombre · datos del contrato.
--     `clients.name` es la LLAVE con la que la plataforma reconoce al cliente
--     (auth.jwt.email → portal_access → fin_directory → fin_norm(name) →
--     clients). Cambiarlo automáticamente dejaría al cliente afuera de su propio
--     portal sin ningún error visible: entraría y vería una plataforma vacía.
--     Y los datos del contrato son legales y de facturación. Las dos cosas se
--     guardan y generan una tarea para el equipo.
--
-- Idempotente: la tarea usa un id determinista, así re-ejecutar el write-back no
-- llena el tablero de duplicados.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create or replace function public.onboarding_aplicar_datos_confirmados(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_run text; v_datos jsonb; v_cli record;
  v_aplicados text[] := '{}'; v_revisar text[] := '{}';
  v_v text; v_tid text; v_conector text;
begin
  select id into v_run from public.onboarding_runs
   where client_id = p_client_id and estado <> 'archivado' limit 1;
  if v_run is null then return jsonb_build_object('ok', false, 'error', 'sin_run'); end if;

  select value_json->'datos' into v_datos
    from public.onboarding_answers
   where run_id = v_run and qkey = 'datos_confirmar';
  if v_datos is null or jsonb_typeof(v_datos) <> 'object' then
    return jsonb_build_object('ok', true, 'aplicados', '[]'::jsonb);
  end if;

  select id, name, company, email, phone, country, contract_data, conector
    into v_cli from public.clients where id = p_client_id;
  if v_cli.id is null then return jsonb_build_object('ok', false, 'error', 'cliente_inexistente'); end if;
  v_conector := coalesce(v_cli.conector, '');

  -- ── Se aplican solas ───────────────────────────────────────────────────────
  -- array_append explícito y no `v_aplicados || 'empresa'`: con un literal sin
  -- tipo, Postgres intenta parsearlo como array y revienta con "malformed array
  -- literal".
  v_v := btrim(coalesce(v_datos->>'empresa', ''));
  if v_v <> '' and v_v is distinct from coalesce(v_cli.company, '') then
    update public.clients set company = v_v where id = p_client_id;
    v_aplicados := array_append(v_aplicados, 'empresa');
  end if;

  v_v := lower(btrim(coalesce(v_datos->>'email', '')));
  -- Se exige que parezca un email: este campo alimenta los envíos de Resend.
  if v_v <> '' and v_v ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'
     and v_v is distinct from lower(coalesce(v_cli.email, '')) then
    update public.clients set email = v_v where id = p_client_id;
    v_aplicados := array_append(v_aplicados, 'email');
  end if;

  v_v := btrim(coalesce(v_datos->>'telefono', ''));
  if v_v <> '' and v_v is distinct from coalesce(v_cli.phone, '') then
    update public.clients set phone = v_v where id = p_client_id;
    v_aplicados := array_append(v_aplicados, 'telefono');
  end if;

  v_v := btrim(coalesce(v_datos->>'pais', ''));
  if v_v <> '' and v_v is distinct from coalesce(v_cli.country, '') then
    update public.clients set country = v_v where id = p_client_id;
    v_aplicados := array_append(v_aplicados, 'pais');
  end if;

  -- ── Las mira una persona ───────────────────────────────────────────────────
  v_v := btrim(coalesce(v_datos->>'nombre', ''));
  if v_v <> '' and v_v is distinct from coalesce(v_cli.name, '') then
    v_revisar := array_append(v_revisar,
      format('nombre: "%s" -> "%s"', coalesce(v_cli.name,''), v_v));
  end if;

  v_v := btrim(coalesce(v_datos->>'contrato', ''));
  if v_v <> '' and v_v is distinct from coalesce(v_cli.contract_data, '') then
    v_revisar := array_append(v_revisar,
      format('datos del contrato: "%s"', left(v_v, 220)));
  end if;

  if array_length(v_revisar, 1) > 0 then
    v_tid := 'tsk_onbdatos_' || p_client_id;
    insert into public.tasks
      (id, title, client_id, assignee, priority, status, description, created_by)
    values (
      v_tid,
      'Revisar datos que corrigió ' || coalesce(v_cli.name, p_client_id),
      p_client_id, v_conector, 'alta', 'backlog',
      'El cliente corrigió datos sensibles en su onboarding:' || E'\n- '
        || array_to_string(v_revisar, E'\n- ') || E'\n\n'
        || 'NO se aplicaron solos a propósito. clients.name es la llave con la que '
        || 'la plataforma reconoce al cliente (fin_directory → fin_norm(name)): si se '
        || 'cambia sin actualizar los alias, el cliente entra al portal y lo ve vacío. '
        || 'Si el nombre cambia de verdad, corregilo en Operaciones y corré '
        || 'onboarding_vincular() para reparar el vínculo.',
      'onboarding')
    on conflict (id) do update set
      description = excluded.description,
      status = case when public.tasks.status = 'completado' then 'backlog' else public.tasks.status end,
      updated_at = now();
  end if;

  return jsonb_build_object(
    'ok', true,
    'aplicados', to_jsonb(v_aplicados),
    'para_revisar', to_jsonb(v_revisar));
end $function$;

revoke execute on function public.onboarding_aplicar_datos_confirmados(text) from public, anon, authenticated;
grant execute on function public.onboarding_aplicar_datos_confirmados(text) to service_role;

-- ── Engancharla al write-back ────────────────────────────────────────────────
-- Va DESPUÉS del loop de target_column, para que una corrección explícita del
-- cliente le gane a lo que haya escrito cualquier otra pregunta.
create or replace function public.onboarding_writeback(p_client_id text, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_run text; v_txt text; v_len int; v_prev int := 0;
  v_doc text; v_node text; v_cli record;
  v_warn text := null; v_cols int := 0; v_skips text[] := '{}';
  r record; v_val text; v_pages int; v_page text; v_tipo text; v_num numeric;
  v_datos jsonb;
begin
  if not (public.is_team_member()
          or current_setting('request.jwt.claim.role', true) = 'service_role'
          or public.portal_cliente_client() = p_client_id) then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;

  select id into v_run from public.onboarding_runs
   where client_id = p_client_id and estado <> 'archivado' limit 1;
  if v_run is null then return jsonb_build_object('ok', false, 'error', 'sin_run'); end if;

  select id, name into v_cli from public.clients where id = p_client_id;
  if v_cli.id is null then return jsonb_build_object('ok', false, 'error', 'cliente_inexistente'); end if;

  v_txt  := coalesce(public.onboarding_assemble_text(p_client_id), '');
  v_len  := length(v_txt);
  v_doc  := 'onb_' || p_client_id;
  v_node := 'native_onb_' || p_client_id;   -- el prefijo native_ lo salva del borrado
                                            -- nocturno de client-brain-sync

  select coalesce(char_count, 0) into v_prev
    from public.client_brain_docs where client_id = p_client_id and node_id = v_node;

  -- GUARDA ANTI-CATASTROFE: si el cliente vacia respuestas y dejamos char_count
  -- en 0, descubrimiento_status vuelve en silencio a 'pre-llamada' y traba la
  -- estrategia y el avatar de un cliente que ya esta en produccion.
  if coalesce(v_prev,0) > 0 and v_len < (v_prev * 0.30) and not p_force then
    v_warn := format('El documento nuevo (%s chars) es mucho mas corto que el anterior (%s). No se sobrescribio.',
                     v_len, v_prev);
    update public.onboarding_runs set writeback_warning = v_warn where id = v_run;
    perform public._portal_slack(p_client_id,
      '🛑 Onboarding de *'||coalesce(v_cli.name,'Cliente')||'*: '||v_warn||
      ' Revisar antes de forzar el guardado.');
    return jsonb_build_object('ok', false, 'error', 'texto_sospechosamente_corto',
                              'chars', v_len, 'chars_previos', v_prev, 'warning', v_warn);
  end if;

  insert into public.client_brain_docs
    (id, client_id, node_id, doc_kind, title, text, char_count, scope, synced_at)
  values (v_doc, p_client_id, v_node, 'onboarding',
          'Onboarding (plataforma) — ' || coalesce(v_cli.name,''),
          v_txt, v_len, 'client', now())
  on conflict (client_id, node_id) do update set
    doc_kind = 'onboarding', title = excluded.title,
    text = excluded.text, char_count = excluded.char_count, synced_at = now();

  -- El mapeo pregunta->columna es dato editable, pero la lista de columnas
  -- escribibles es CODIGO: un `case` explicito. Armar SQL dinamico desde una
  -- columna de tabla convertiria el editor de preguntas en un vector de
  -- escritura arbitraria sobre clients.
  for r in
    select q.qkey, q.target_kind, q.target_column, q.target_mode, q.qtype,
           btrim(coalesce(a.value_text,'')) as val, a.value_json
      from public.onboarding_questions q
      join public.onboarding_answers a on a.run_id = v_run and a.qkey = q.qkey
     where q.activa and q.target_kind is not null and btrim(coalesce(a.value_text,'')) <> ''
  loop
    v_val := r.val;

    if r.target_kind = 'clients' then
      case r.target_column
        when 'niche' then
          update public.clients set niche = v_val where id = p_client_id
            and (r.target_mode = 'overwrite' or coalesce(niche,'') = '');
        when 'company' then
          update public.clients set company = v_val where id = p_client_id
            and (r.target_mode = 'overwrite' or coalesce(company,'') = '');
        when 'team_name' then
          update public.clients set team_name = v_val where id = p_client_id
            and (r.target_mode = 'overwrite' or coalesce(team_name,'') = '');
        when 'country' then
          update public.clients set country = v_val where id = p_client_id
            and (r.target_mode = 'overwrite' or coalesce(country,'') = '');
        when 'phone' then
          update public.clients set phone = v_val where id = p_client_id
            and (r.target_mode = 'overwrite' or coalesce(phone,'') = '');
        when 'brand_font' then
          update public.clients set brand_font = v_val where id = p_client_id
            and (r.target_mode = 'overwrite' or coalesce(brand_font,'') = '');
        when 'brand_colors' then
          update public.clients set brand_colors = jsonb_build_object(
              'raw', v_val,
              'hex', coalesce((select jsonb_agg(m[1])
                                 from regexp_matches(v_val, '(#[0-9A-Fa-f]{6})', 'g') m), '[]'::jsonb))
           where id = p_client_id
             and (r.target_mode = 'overwrite' or brand_colors is null);
        when 'ads_budget_monthly' then
          v_num := nullif(substring(v_val from '(\d+)'), '')::numeric;
          if v_num is not null then
            update public.clients
               set ads_budget_monthly = v_num,
                   ads_budget_currency = coalesce(nullif(ads_budget_currency,''), 'USD')
             where id = p_client_id
               and (r.target_mode = 'overwrite' or ads_budget_monthly is null);
          end if;
        else
          v_skips := v_skips || (r.qkey || '->clients.' || coalesce(r.target_column,'?'));
          continue;
      end case;
      v_cols := v_cols + 1;

    elsif r.target_kind = 'strategy_pages' then
      -- Solo si el cliente tiene EXACTAMENTE un funnel: con mas de uno no
      -- adivinamos a cual corresponde.
      select count(*) into v_pages from public.strategy_pages where client_id = p_client_id;
      if v_pages <> 1 then
        v_skips := v_skips || (r.qkey || '->' || v_pages || ' funnels');
        continue;
      end if;
      select id into v_page from public.strategy_pages where client_id = p_client_id;

      case r.target_column
        when 'tipo' then
          v_tipo := case lower(v_val)
                      when 'producto'    then 'producto'
                      when 'oportunidad' then 'reclutamiento'
                      when 'ambas'       then 'mixto'
                      else null end;
          if v_tipo is not null then
            update public.strategy_pages set tipo = v_tipo where id = v_page
              and (r.target_mode = 'overwrite' or coalesce(tipo,'') = '');
          end if;
        when 'punto_dif' then
          update public.strategy_pages set punto_dif = v_val where id = v_page
            and (r.target_mode = 'overwrite' or coalesce(punto_dif,'') = '');
        when 'official_domain' then
          update public.strategy_pages
             set official_domain = lower(regexp_replace(v_val, '^https?://(www\.)?|/.*$', '', 'g'))
           where id = v_page and (r.target_mode = 'overwrite' or coalesce(official_domain,'') = '');
        when 'whatsapp_leads' then
          update public.strategy_pages set whatsapp_leads = v_val where id = v_page
            and (r.target_mode = 'overwrite' or coalesce(whatsapp_leads,'') = '');
        else
          v_skips := v_skips || (r.qkey || '->strategy_pages.' || coalesce(r.target_column,'?'));
          continue;
      end case;
      v_cols := v_cols + 1;
    end if;
  end loop;

  -- ── Correcciones del propio cliente en "Confirmá tus datos" ────────────────
  -- Van al final para que le ganen a cualquier otra pregunta: si el cliente se
  -- tomó el trabajo de corregir su teléfono, ese es el bueno.
  v_datos := public.onboarding_aplicar_datos_confirmados(p_client_id);
  if jsonb_array_length(coalesce(v_datos->'aplicados','[]'::jsonb)) > 0 then
    v_cols := v_cols + jsonb_array_length(v_datos->'aplicados');
  end if;
  if jsonb_array_length(coalesce(v_datos->'para_revisar','[]'::jsonb)) > 0 then
    v_warn := coalesce(v_warn || ' | ', '')
      || 'El cliente corrigió datos sensibles (nombre / contrato): quedó tarea para revisarlos a mano.';
  end if;

  if array_length(v_skips, 1) > 0 then
    v_warn := coalesce(v_warn || ' | ', '') || 'Sin aplicar: ' || array_to_string(v_skips, ', ');
  end if;

  update public.onboarding_runs
     set writeback_at = now(), writeback_warning = v_warn
   where id = v_run;

  return jsonb_build_object('ok', true, 'chars', v_len, 'chars_previos', v_prev,
                            'doc_id', v_doc, 'columnas', v_cols,
                            'datos_cliente', v_datos,
                            'sin_aplicar', to_jsonb(v_skips), 'warning', v_warn);
end $function$;

revoke execute on function public.onboarding_writeback(text, boolean) from public, anon;
grant execute on function public.onboarding_writeback(text, boolean) to authenticated, service_role;

-- El copy de la pregunta ya no manda a WhatsApp: ahora se corrige acá.
update public.onboarding_sections
   set subtitulo = 'Esto ya lo tenemos. Mirá que esté bien y, si algo cambió, corregilo.'
 where skey = 'datos';

update public.onboarding_questions
   set sublabel = 'Estos datos nos los pasaste cuando arrancamos. Si alguno cambió, tocá "Corregir".'
 where qkey = 'datos_confirmar';

commit;

notify pgrst, 'reload schema';
