-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente v21 — ONBOARDING: write-back
-- Aplicada a prod el 2026-07-25 vía MCP. Los permisos finales los fija v24.
--
-- Convierte las respuestas en las dos cosas que el sistema realmente consume:
--
--   (a) client_brain_docs con doc_kind='onboarding' — lo que leen agent-chat
--       (presupuesto de 340.000 chars en los pasos onboarding/estrategia/avatar),
--       korex-strategy-analyzer y korex-avatar-builder. Y lo que exige el gate
--       descubrimiento_status (doc_kind='onboarding' and char_count > 0).
--
--   (b) columnas estructuradas de clients y strategy_pages.
--
-- Por qué RPC y no trigger: un trigger por respuesta reescribiría un documento
-- de ~70 KB unas 40 veces por cliente y tocaría `clients` otras tantas,
-- contaminando cualquier auditoría colgada de esa tabla. Esto corre una vez al
-- cerrar, y se puede re-ejecutar a mano desde el panel cuantas veces haga falta.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1 · Columnas nuevas (aditivas, inertes para el resto del sistema) ───────
alter table public.clients        add column if not exists brand_colors jsonb;
alter table public.clients        add column if not exists brand_font text;
alter table public.clients        add column if not exists ads_budget_monthly numeric;
alter table public.clients        add column if not exists ads_budget_currency text;
alter table public.strategy_pages add column if not exists whatsapp_leads text;

comment on column public.clients.brand_colors is
  'Colores de marca declarados por el cliente en el onboarding: {"raw":"…","hex":["#0B1E3F"]}';
comment on column public.clients.ads_budget_monthly is
  'Presupuesto mensual de publicidad declarado en el onboarding (cota inferior del rango elegido).';

-- ── 2 · Ensamblador del documento ────────────────────────────────────────────
-- Mismo formato de marcadores que del_assemble_text: '===== Título =====' y
-- bloques separados por línea en blanco. Así el clipper de agent-chat y el
-- parseo de las skills funcionan sin un solo cambio.
--
-- El orden es el de la PLANTILLA OFICIAL (plantilla_ord), no el del formulario:
-- korex-onboarding-filler y korex-strategy-analyzer esperan encontrar las cosas
-- donde siempre estuvieron.
--
-- Las respuestas van LITERALES. El strategy-analyzer necesita 8-12 citas
-- textuales del cliente; "prolijear" el registro destruye exactamente eso.
create or replace function public.onboarding_assemble_text(p_client_id text)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_run text; v_out text := ''; v_sec text := ''; r record; v_marca text;
begin
  select id into v_run from public.onboarding_runs
   where client_id = p_client_id and estado <> 'archivado' limit 1;
  if v_run is null then return null; end if;

  for r in
    select q.qkey, q.label, q.plantilla_ref, q.qtype,
           coalesce(a.value_text,'') as val, a.source, a.audio_path
      from public.onboarding_questions q
      join public.onboarding_answers a on a.run_id = v_run and a.qkey = q.qkey
     where q.activa
       and btrim(coalesce(a.value_text,'')) <> ''
       and public._onboarding_visible(v_run, q.visible_si)
     order by q.plantilla_ord, q.orden
  loop
    -- Encabezado de sección cuando cambia el bloque de la plantilla oficial.
    -- 'compliance' se grita a propósito: es lo único que el modelo no puede pasar por alto.
    if split_part(r.plantilla_ref, ' / ', 1) <> v_sec then
      v_sec := split_part(r.plantilla_ref, ' / ', 1);
      v_out := v_out || case when v_out = '' then '' else E'\n\n' end
            || '===== ' || coalesce(nullif(v_sec,''), 'Otros') || ' =====' || E'\n';
    end if;

    -- Las respuestas habladas son las mejores citas literales: se marcan para
    -- que el analista sepa que puede citarlas textual.
    v_marca := case when r.source in ('voz','mixto') then ' [respuesta hablada]' else '' end;

    v_out := v_out || E'\n' || 'P: ' || r.label || v_marca || E'\n'
                   || 'R: ' || btrim(r.val) || E'\n';
  end loop;

  -- Restricciones de comunicación al final y en mayúsculas: es lo que más
  -- caro sale si el modelo lo ignora.
  select btrim(coalesce(a.value_text,'')) into v_marca
    from public.onboarding_answers a where a.run_id = v_run and a.qkey = 'tono_y_claims';
  if coalesce(v_marca,'') <> '' then
    v_out := v_out || E'\n\n===== RESTRICCIONES DE COMUNICACIÓN (COMPLIANCE) =====' || E'\n'
          || 'Lo que sigue lo declaró el cliente. NO se puede contradecir en copy, VSL ni anuncios.' || E'\n'
          || v_marca || E'\n';
  end if;

  return btrim(v_out);
end $$;

-- ── 3 · Write-back ───────────────────────────────────────────────────────────
create or replace function public.onboarding_writeback(p_client_id text, p_force boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_run text; v_txt text; v_len int; v_prev int := 0;
  v_doc text; v_node text; v_cli record;
  v_warn text := null; v_cols int := 0; v_skips text[] := '{}';
  r record; v_val text; v_pages int; v_page text; v_tipo text; v_num numeric;
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

  -- ── (a) Documento del cerebro ──────────────────────────────────────────────
  v_txt  := coalesce(public.onboarding_assemble_text(p_client_id), '');
  v_len  := length(v_txt);
  v_doc  := 'onb_' || p_client_id;
  v_node := 'native_onb_' || p_client_id;   -- el prefijo native_ lo salva del borrado
                                            -- nocturno de client-brain-sync (index.ts:206)

  select coalesce(char_count, 0) into v_prev
    from public.client_brain_docs where client_id = p_client_id and node_id = v_node;

  -- GUARDA ANTI-CATÁSTROFE. Si el cliente vacía respuestas y dejamos char_count
  -- en 0, descubrimiento_status vuelve en silencio a 'pre-llamada' y traba la
  -- estrategia y el avatar de un cliente que ya está en producción.
  if coalesce(v_prev,0) > 0 and v_len < (v_prev * 0.30) and not p_force then
    v_warn := format('El documento nuevo (%s chars) es mucho más corto que el anterior (%s). No se sobrescribió.',
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

  -- ── (b) Columnas estructuradas ─────────────────────────────────────────────
  -- El mapeo pregunta→columna es dato editable (onboarding_questions.target_column),
  -- pero la lista de columnas escribibles es CÓDIGO: un `case` explícito. Armar
  -- SQL dinámico desde una columna de tabla convertiría el editor de preguntas
  -- del panel en un vector de escritura arbitraria sobre clients.
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
          -- El valor es un rango ('500-1000', '3000+'): guardamos la cota inferior.
          v_num := nullif(substring(v_val from '(\d+)'), '')::numeric;
          if v_num is not null then
            update public.clients
               set ads_budget_monthly = v_num,
                   ads_budget_currency = coalesce(nullif(ads_budget_currency,''), 'USD')
             where id = p_client_id
               and (r.target_mode = 'overwrite' or ads_budget_monthly is null);
          end if;
        else
          v_skips := v_skips || (r.qkey || '→clients.' || coalesce(r.target_column,'?'));
          continue;
      end case;
      v_cols := v_cols + 1;

    elsif r.target_kind = 'strategy_pages' then
      -- Solo si el cliente tiene EXACTAMENTE un funnel. Con más de uno no
      -- adivinamos a cuál corresponde: se avisa y lo resuelve una persona.
      select count(*) into v_pages from public.strategy_pages where client_id = p_client_id;
      if v_pages <> 1 then
        v_skips := v_skips || (r.qkey || '→' || v_pages || ' funnels');
        continue;
      end if;
      select id into v_page from public.strategy_pages where client_id = p_client_id;

      case r.target_column
        when 'tipo' then
          -- El valor del formulario habla el idioma del cliente; la columna, el del sistema.
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
          v_skips := v_skips || (r.qkey || '→strategy_pages.' || coalesce(r.target_column,'?'));
          continue;
      end case;
      v_cols := v_cols + 1;
    end if;
  end loop;

  if array_length(v_skips, 1) > 0 then
    v_warn := coalesce(v_warn || ' | ', '') || 'Sin aplicar: ' || array_to_string(v_skips, ', ');
  end if;

  update public.onboarding_runs
     set writeback_at = now(), writeback_warning = v_warn
   where id = v_run;

  return jsonb_build_object('ok', true, 'chars', v_len, 'chars_previos', v_prev,
                            'doc_id', v_doc, 'columnas', v_cols,
                            'sin_aplicar', to_jsonb(v_skips), 'warning', v_warn);
end $$;

grant execute on function
  public.onboarding_assemble_text(text),
  public.onboarding_writeback(text, boolean)
to authenticated;

notify pgrst, 'reload schema';
