-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v31_onboarding_texto_en_vivo.sql
--
-- Hasta acá el texto del onboarding se escribía UNA sola vez, al llegar al
-- 100%, y solo dentro de `client_brain_docs.text` — un bloque de 40 KB sin
-- estructura. El equipo no podía ver nada hasta que el cliente terminara, y
-- cuando terminaba veía un muro de texto.
--
-- Ahora se escribe A MEDIDA QUE RESPONDE y como SECCIONES: una fila de
-- `del_sections` por paso del onboarding, con su título y su orden. Eso hace
-- que aparezca en el DEL como aparece cualquier otra sección, que se pueda
-- leer de a pedazos y que el operador vea dónde va el cliente sin abrir la base.
--
-- Cómo queda el circuito:
--
--   el cliente responde
--        └─▶ trigger: marca el run como sucio (una columna, sin costo)
--             └─▶ cron cada 2 min: onboarding_sync_pendientes()
--                  └─▶ onboarding_sync_texto(): reescribe las del_sections
--                       └─▶ trigger del_sections_sync_text (ya existía):
--                            reensambla client_brain_docs.text
--
-- Por qué la cola y no un trigger directo por respuesta: son 125 preguntas por
-- cliente, y reescribir un documento de ~40 KB en cada tecleo son 125 pasadas
-- de escritura por cliente para un texto que nadie está mirando en ese
-- instante. Con la cola son ~20 y el operador lo ve con dos minutos de retraso,
-- que para este uso es "en vivo".
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 0 · Un tercer origen de sección ──────────────────────────────────────────
-- `source` estaba cerrado a import|panel. Distinguir las del onboarding es lo
-- que permite reescribirlas enteras sin tocar lo que el equipo editó a mano, y
-- lo que las exceptúa de la regla "gana Drive" del trigger espejo.
alter table public.del_sections drop constraint if exists del_sections_source_chk;
alter table public.del_sections add constraint del_sections_source_chk
  check (source = any (array['import'::text, 'panel'::text, 'onboarding'::text]));

-- ── 1 · Que el espejo acepte secciones del onboarding ────────────────────────
-- La guarda existente dice: si el documento no tiene NINGUNA sección hecha
-- desde el panel y su texto ya mide 15.000+, no toques nada (regla "gana
-- Drive", para no pisar un DEL importado con una edición parcial). Las
-- secciones del onboarding son igual de propias que las del panel, así que
-- entran en la misma excepción.
create or replace function public.trg_del_sections_sync_text()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_doc text := coalesce(new.doc_id, old.doc_id);
  v_es_propio boolean;
  v_len_actual int;
  v_txt text;
begin
  if v_doc is null then return null; end if;
  select exists(select 1 from del_sections
                 where doc_id = v_doc and source in ('panel', 'onboarding'))
    into v_es_propio;
  select coalesce(length(text), 0) from client_brain_docs where id = v_doc into v_len_actual;
  if not v_es_propio and coalesce(v_len_actual, 0) >= 15000 then
    return null;
  end if;
  v_txt := public.del_assemble_text(v_doc);
  update client_brain_docs
     set text = coalesce(v_txt, ''), char_count = length(coalesce(v_txt, ''))
   where id = v_doc;
  return null;
end $$;

-- ── 2 · La cola ──────────────────────────────────────────────────────────────
create or replace function public.trg_onboarding_answer_dirty()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  update public.onboarding_runs
     set texto_dirty_at = now()
   where id = coalesce(new.run_id, old.run_id);
  return null;
end $$;

drop trigger if exists onboarding_answers_dirty on public.onboarding_answers;
create trigger onboarding_answers_dirty
  after insert or update or delete on public.onboarding_answers
  for each row execute function public.trg_onboarding_answer_dirty();

-- ── 3 · El documento ─────────────────────────────────────────────────────────
-- Una sección por paso. El formato del cuerpo es el que ya consumen los
-- agentes (`P:` / `R:`), y las respuestas van LITERALES: el strategy-analyzer
-- necesita ocho a doce citas textuales del cliente y "prolijearlas" destruye
-- exactamente ese activo. Lo hablado se marca, porque son las mejores citas.
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
  select coalesce(char_count, 0) into v_prev from public.client_brain_docs where id = v_doc;

  -- Cuánto va a medir el documento nuevo, antes de tocar nada.
  select coalesce(sum(length(btrim(a.value_text))), 0) into v_len
    from public.onboarding_answers a
    join public.onboarding_questions q on q.qkey = a.qkey and q.activa
    join public.onboarding_sections s on s.skey = q.skey and s.activa and s.bkey is not null
   where a.run_id = v_run.id and btrim(coalesce(a.value_text, '')) <> ''
     and public._onboarding_visible(v_run.id, q.visible_si);

  -- Guarda anti-catástrofe. Un cliente que vacía sus respuestas dejaría el
  -- documento en cero, y `descubrimiento_status` volvería en silencio a
  -- "pre-llamada": estrategia y avatar de un cliente que ya está en producción
  -- se traban sin que nadie se entere de por qué.
  if v_prev > 0 and v_len < v_prev * 0.30 and not p_force then
    update public.onboarding_runs
       set writeback_warning = 'El texto nuevo mide ' || v_len || ' contra ' || v_prev
                             || ' del anterior. No se escribió.'
     where id = v_run.id;
    begin
      perform public._portal_slack(p_client_id,
        '🛑 Onboarding: el documento nuevo mide ' || v_len || ' caracteres contra '
        || v_prev || ' del anterior. No se sobreescribió. Revisar antes de forzar.');
    exception when others then null;
    end;
    return jsonb_build_object('ok', false, 'error', 'texto_sospechosamente_corto',
                             'chars', v_len, 'chars_previos', v_prev);
  end if;

  -- El documento. `native_` en el node_id es lo que lo salva del borrado
  -- nocturno de client-brain-sync, que limpia todo lo que no tenga contraparte
  -- en Drive salvo ese prefijo.
  insert into public.client_brain_docs
    (id, client_id, node_id, doc_kind, title, text, char_count, scope, synced_at)
  values (v_doc, p_client_id, v_node, 'onboarding',
          'Onboarding (plataforma) — ' || coalesce(v_nombre, p_client_id),
          '', 0, 'client', now())
  on conflict (client_id, node_id) do update
    set doc_kind = 'onboarding', title = excluded.title, synced_at = now();

  -- Se borra TODO y se reescribe. Dos razones: se van solas las secciones
  -- fantasma (un paso desactivado, o cuyas respuestas se borraron), y el índice
  -- único (doc_id, ord) es DEFERRABLE, así que no sirve de árbitro para un
  -- `on conflict` y un upsert fila por fila no es posible.
  --
  -- Es seguro barrer el documento entero porque `onb_<cliente>` lo crea y lo
  -- mantiene solo el onboarding: el DEL del panel escribe en `panel_html` de
  -- client_brain_docs, no en las secciones de este documento.
  delete from public.del_sections ds where ds.doc_id = v_doc;

  for r in
    select s.skey, s.orden, s.badge, s.titulo,
           string_agg(
             'P: ' || q.label ||
             case when a.source in ('voz', 'mixto') then ' [respuesta hablada]' else '' end
             || E'\n' || 'R: ' || btrim(a.value_text),
             E'\n\n' order by q.pantalla, q.orden) as cuerpo
      from public.onboarding_sections s
      join public.onboarding_questions q on q.skey = s.skey and q.activa
      join public.onboarding_answers a on a.run_id = v_run.id and a.qkey = q.qkey
     where s.activa and s.bkey is not null
       and btrim(coalesce(a.value_text, '')) <> ''
       and q.qtype not in ('info', 'resumen')
       and public._onboarding_visible(v_run.id, q.visible_si)
     group by s.skey, s.orden, s.badge, s.titulo
     order by s.orden
  loop
    -- El título tiene que entrar en el formato de marcadores `===== X =====`,
    -- que el importador corta a 60 caracteres y no admite `=` ni saltos.
    insert into public.del_sections
      (id, doc_id, client_id, ord, title, kind, text, char_count, source, updated_at)
    values ('dsec_' || v_doc || '_' || r.orden, v_doc, p_client_id, r.orden,
            left(r.badge || ' · ' || r.titulo, 60), 'onboarding',
            r.cuerpo, length(r.cuerpo), 'onboarding', now())
    v_secs := v_secs + 1;
  end loop;

  -- Las restricciones de comunicación van aparte y al final, con un encabezado
  -- que no deja lugar a interpretación: es lo que ningún copy puede contradecir.
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
            v_cuerpo, length(v_cuerpo), 'onboarding', now())
    v_secs := v_secs + 1;
  end if;

  -- Si no quedó ninguna sección, el trigger espejo no corrió: hay que dejar el
  -- documento vacío a mano para que no se quede con el contenido anterior.
  if v_secs = 0 then
    update public.client_brain_docs set text = '', char_count = 0, synced_at = now()
     where id = v_doc;
  end if;

  update public.onboarding_runs
     set texto_sync_at = now(), writeback_warning = null
   where id = v_run.id;

  return jsonb_build_object('ok', true, 'secciones', v_secs,
                            'chars', (select char_count from public.client_brain_docs where id = v_doc));
end $$;

revoke execute on function public.onboarding_sync_texto(text, boolean) from public, anon;
grant  execute on function public.onboarding_sync_texto(text, boolean) to authenticated, service_role;

-- ── 4 · El barrido ───────────────────────────────────────────────────────────
create or replace function public.onboarding_sync_pendientes()
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare r record; v_n int := 0; v_err int := 0;
begin
  for r in
    select client_id from public.onboarding_runs
     where texto_dirty_at is not null
       and texto_dirty_at > coalesce(texto_sync_at, 'epoch'::timestamptz)
       -- Un onboarding entregado no se reescribe solo. Si hay que rehacerlo,
       -- es con el botón del panel, a propósito y con el force a la vista.
       and estado <> 'completado'
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
  return jsonb_build_object('ok', true, 'sincronizados', v_n, 'errores', v_err);
end $$;

revoke execute on function public.onboarding_sync_pendientes() from public, anon, authenticated;
grant  execute on function public.onboarding_sync_pendientes() to service_role;

-- ── 5 · El write-back se queda solo con lo suyo ──────────────────────────────
-- Ya no arma el documento: lo delega. Sigue haciendo lo que nadie más hace,
-- que es volcar respuestas a columnas de `clients` y `strategy_pages` y
-- aplicar los datos que el cliente corrigió.
--
-- El mapeo de `foco` cambia: el v1 esperaba 'producto'/'oportunidad'/'ambas' y
-- el v2 guarda 'prod100'/'op100'/'ambas_op'/'ambas_prod'. Sin esto, el tipo de
-- funnel se quedaba vacío y alguien lo ponía a mano — que es el bug que este
-- ejercicio venía a cerrar.
create or replace function public.onboarding_writeback(
  p_client_id text,
  p_force     boolean default false
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_run record; v_sync jsonb; r record;
  v_aplicados text[] := '{}'; v_skips text[] := '{}';
  v_val text; v_funnels int; v_sp text; v_datos jsonb;
begin
  if not (public.is_team_member()
          or current_setting('request.jwt.claim.role', true) = 'service_role'
          or public.portal_cliente_client() = p_client_id) then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;

  select * into v_run from public.onboarding_runs
   where client_id = p_client_id and estado <> 'archivado'
   order by created_at desc limit 1;
  if v_run.id is null then return jsonb_build_object('ok', false, 'error', 'sin_run'); end if;

  v_sync := public.onboarding_sync_texto(p_client_id, p_force);
  if (v_sync->>'ok')::boolean is not true then return v_sync; end if;

  select count(*) into v_funnels from public.strategy_pages where client_id = p_client_id;
  select id into v_sp from public.strategy_pages where client_id = p_client_id limit 1;

  for r in
    select q.qkey, q.target_kind, q.target_column, q.target_mode,
           btrim(a.value_text) as val
      from public.onboarding_questions q
      join public.onboarding_answers a on a.qkey = q.qkey and a.run_id = v_run.id
     where q.activa and q.target_kind is not null
       and btrim(coalesce(a.value_text, '')) <> ''
  loop
    v_val := r.val;

    if r.target_kind = 'clients' then
      -- La lista de columnas escribibles es CÓDIGO, no dato. El mapeo vive en
      -- la tabla y lo edita el constructor, pero si la lista viviera ahí
      -- también, el editor de preguntas se convertiría en un permiso de
      -- escritura arbitraria sobre `clients`.
      case r.target_column
        when 'company' then
          update public.clients set company = v_val where id = p_client_id
            and (r.target_mode = 'overwrite' or coalesce(company, '') = '');
        when 'niche' then
          update public.clients set niche = v_val where id = p_client_id
            and (r.target_mode = 'overwrite' or coalesce(niche, '') = '');
        when 'team_name' then
          update public.clients set team_name = v_val where id = p_client_id
            and (r.target_mode = 'overwrite' or coalesce(team_name, '') = '');
        when 'country' then
          update public.clients set country = v_val where id = p_client_id
            and (r.target_mode = 'overwrite' or coalesce(country, '') = '');
        when 'phone' then
          update public.clients set phone = v_val where id = p_client_id
            and (r.target_mode = 'overwrite' or coalesce(phone, '') = '');
        when 'brand_font' then
          update public.clients set brand_font = v_val where id = p_client_id
            and (r.target_mode = 'overwrite' or coalesce(brand_font, '') = '');
        when 'brand_colors' then
          update public.clients set brand_colors = jsonb_build_object(
            'raw', v_val,
            'hex', coalesce((select jsonb_agg(arr[1])
                               from regexp_matches(v_val, '(#[0-9A-Fa-f]{6})', 'g') as t(arr)), '[]'::jsonb))
           where id = p_client_id;
        when 'ads_budget_monthly' then
          update public.clients
             set ads_budget_monthly = nullif(substring(v_val from '(\d+)'), '')::numeric,
                 ads_budget_currency = coalesce(nullif(ads_budget_currency, ''), 'USD')
           where id = p_client_id and substring(v_val from '(\d+)') is not null;
        else
          v_skips := array_append(v_skips, r.qkey || '->clients.' || coalesce(r.target_column, '?'));
          continue;
      end case;
      v_aplicados := array_append(v_aplicados, r.qkey);

    elsif r.target_kind = 'strategy_pages' then
      -- Con más de un funnel no adivina cuál: deja constancia y sigue.
      if v_funnels <> 1 then
        v_skips := array_append(v_skips, r.qkey || '->' || v_funnels || ' funnels');
        continue;
      end if;
      case r.target_column
        when 'tipo' then
          update public.strategy_pages
             set tipo = case
                   when v_val in ('prod100')                 then 'producto'
                   when v_val in ('op100')                   then 'reclutamiento'
                   when v_val in ('ambas_op', 'ambas_prod')  then 'mixto'
                   else tipo end
           where id = v_sp and (r.target_mode = 'overwrite' or coalesce(tipo, '') = '');
        when 'punto_dif' then
          update public.strategy_pages set punto_dif = v_val where id = v_sp
            and (r.target_mode = 'overwrite' or coalesce(punto_dif, '') = '');
        when 'official_domain' then
          update public.strategy_pages
             set official_domain = regexp_replace(regexp_replace(v_val, '^https?://', ''), '/.*$', '')
           where id = v_sp and (r.target_mode = 'overwrite' or coalesce(official_domain, '') = '');
        when 'whatsapp_leads' then
          update public.strategy_pages set whatsapp_leads = v_val where id = v_sp
            and (r.target_mode = 'overwrite' or coalesce(whatsapp_leads, '') = '');
        else
          v_skips := array_append(v_skips, r.qkey || '->strategy_pages.' || coalesce(r.target_column, '?'));
          continue;
      end case;
      v_aplicados := array_append(v_aplicados, r.qkey);
    end if;
  end loop;

  -- Lo que el cliente corrigió de sus propios datos gana sobre todo lo demás,
  -- así que va último.
  begin
    v_datos := public.onboarding_aplicar_datos_confirmados(p_client_id);
  exception when others then v_datos := null;
  end;

  update public.onboarding_runs set writeback_at = now() where id = v_run.id;

  return jsonb_build_object(
    'ok', true,
    'chars', v_sync->'chars',
    'secciones', v_sync->'secciones',
    'aplicados', to_jsonb(v_aplicados),
    'omitidos', to_jsonb(v_skips),
    'datos', v_datos
  );
end $$;

revoke execute on function public.onboarding_writeback(text, boolean) from public, anon;
grant  execute on function public.onboarding_writeback(text, boolean) to authenticated, service_role;

commit;

-- ── 6 · El cron ──────────────────────────────────────────────────────────────
select cron.unschedule('onboarding-sync-texto')
 where exists (select 1 from cron.job where jobname = 'onboarding-sync-texto');

select cron.schedule('onboarding-sync-texto', '*/2 * * * *',
                     $$select public.onboarding_sync_pendientes();$$);

notify pgrst, 'reload schema';
