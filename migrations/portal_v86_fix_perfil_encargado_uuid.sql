-- migrations/portal_v86_fix_perfil_encargado_uuid.sql
--
-- El encargado de grabación completaba todo su cuestionario y al enviarlo daba error;
-- las respuestas no llegaban a ningún lado.
--
-- Causa: `portal_collaborators.id` es **uuid**, pero `_portal_colab_perfil_build`
-- (portal_v76) declaró el parámetro como **text**. Entonces la llamada de
-- `portal_collab_onb_completar`:
--
--     v_perfil := public._portal_colab_perfil_build(v_row.id, v_html, btrim(v_text));
--
-- explota con «function _portal_colab_perfil_build(uuid, unknown, unknown) does not
-- exist»: Postgres no convierte uuid a text solo. Y como esa llamada está al FINAL,
-- después de crear la sección del DEL y de guardar las respuestas, el error tira abajo
-- toda la transacción: se pierde TODO lo que el encargado escribió.
--
-- Nunca funcionó desde que salió v76: los dos colaboradores dados de alta tienen
-- onboarding_done_at en null. No es una regresión de esta semana.
--
-- Fix: la función pasa a recibir uuid, que es lo que realmente es. Dentro no cambia
-- nada más — `'colab_' || v_row.id` ya funcionaba (text || uuid es válido).
-- Se borra la versión vieja en text: la llamaba una sola función y con uuid nunca
-- resolvió, así que dejar las dos solo invita a que se elija la equivocada.

begin;

drop function if exists public._portal_colab_perfil_build(text, text, text);

create or replace function public._portal_colab_perfil_build(
  p_collab_id uuid, p_html text, p_text text
) returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_row   public.portal_collaborators;
  v_doc   text;
  v_node  text;
  v_title text;
  v_html  text;
begin
  select * into v_row from public.portal_collaborators where id = p_collab_id;
  if v_row.id is null then return null; end if;

  v_doc  := 'colab_' || v_row.id;
  v_node := 'native_colab_' || v_row.id;
  v_title := 'Perfil de ' || coalesce(v_row.full_name, 'encargado')
             || ' · ' || coalesce(nullif(v_row.role, ''), 'Encargado de grabación');

  -- Maqueta linda para el panel (encabezado + el HTML de respuestas).
  v_html := '<p style="margin:0 0 3px;font-size:10.5px;font-weight:800;letter-spacing:.14em;'
         || 'text-transform:uppercase;color:#9098A4">Encargado de grabación</p>'
         || '<h1 style="margin:0 0 4px;font-size:24px;font-weight:800;letter-spacing:-.02em;color:#0D1117">'
         || public._kx_html_escape(coalesce(v_row.full_name, 'Encargado')) || '</h1>'
         || '<p style="margin:0 0 16px;font-size:12.5px;color:#6B7280">'
         || public._kx_html_escape(coalesce(nullif(v_row.role, ''), 'Encargado de grabación'))
         || ' · quien se graba en cámara</p>'
         || coalesce(nullif(btrim(p_html), ''), '<p style="color:#9098A4">Sin respuestas todavía.</p>');

  insert into public.client_brain_docs
    (id, client_id, node_id, doc_kind, title, text, char_count, scope, panel_html, synced_at)
  values
    (v_doc, v_row.client_id, v_node, 'colaborador', v_title,
     btrim(coalesce(p_text, '')), length(btrim(coalesce(p_text, ''))), 'client',
     v_html, now())
  on conflict (client_id, node_id) do update
    set doc_kind = 'colaborador', title = excluded.title, text = excluded.text,
        char_count = excluded.char_count, panel_html = excluded.panel_html,
        panel_edited_by = null, panel_edited_at = null, synced_at = now();

  return v_doc;
end $$;

-- Mismos permisos que tenía la versión en text.
grant execute on function public._portal_colab_perfil_build(uuid, text, text)
  to anon, authenticated, service_role;

-- El perfil es un extra: que no vuelva a tirar abajo el guardado de las respuestas.
-- Si algún día falla, el encargado igual manda lo suyo y queda avisado en los logs.
create or replace function public.portal_collab_onb_completar(
  p_answers jsonb, p_pares jsonb, p_titulo text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_email text; v_row public.portal_collaborators;
  v_html text := ''; v_text text := ''; v_grupo text := ''; e jsonb;
  v_title text; v_doc text; v_strategy text; v_ord int; v_secid text; v_video text;
  v_g text; v_q text; v_a text; v_perfil text;
begin
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then return jsonb_build_object('ok', false, 'error', 'sin_sesion'); end if;

  select * into v_row from public.portal_collaborators
  where lower(email) = v_email and enabled
  order by created_at desc limit 1;
  if v_row.id is null then return jsonb_build_object('ok', false, 'error', 'no_colaborador'); end if;

  v_title := coalesce(nullif(btrim(p_titulo), ''),
                      'Onboarding de ' || coalesce(v_row.full_name, 'colaborador'));

  -- Armar HTML + texto plano desde los pares (omite respuestas vacías).
  for e in select * from jsonb_array_elements(coalesce(p_pares, '[]'::jsonb)) loop
    v_g := coalesce(e ->> 'grupo', '');
    v_q := coalesce(e ->> 'q', '');
    v_a := btrim(coalesce(e ->> 'a', ''));
    if v_a = '' then continue; end if;
    if v_g <> v_grupo then
      v_grupo := v_g;
      v_html := v_html || '<h3>' || public._kx_html_escape(v_grupo) || '</h3>';
      v_text := v_text || E'\n===== ' || v_grupo || E' =====\n';
    end if;
    v_html := v_html || '<p><strong>' || public._kx_html_escape(v_q) || '</strong><br>' || public._kx_html_escape(v_a) || '</p>';
    v_text := v_text || 'P: ' || v_q || E'\nR: ' || v_a || E'\n\n';
  end loop;

  -- DEL destino: el doc 'del' más grande del cliente (mismo criterio que el gate).
  select id, strategy_id into v_doc, v_strategy
  from public.client_brain_docs
  where client_id = v_row.client_id and doc_kind = 'del'
  order by char_count desc nulls last limit 1;

  if v_doc is not null then
    select coalesce(max(ord), 0) + 1 into v_ord from public.del_sections where doc_id = v_doc;
    v_secid := 'dsecp_' || replace(gen_random_uuid()::text, '-', '');
    insert into public.del_sections
      (id, doc_id, client_id, strategy_id, ord, title, kind, text, html, char_count, source, updated_at, updated_by)
    values
      (v_secid, v_doc, v_row.client_id, v_strategy, v_ord, v_title, 'otros',
       btrim(v_text), v_html, length(btrim(v_text)), 'panel', now(), 'colaborador');
  end if;

  -- Guardar respuestas + marcar hecho.
  update public.portal_collaborators
    set onboarding_answers = coalesce(p_answers, onboarding_answers),
        onboarding_done_at = now(),
        onboarding_section_id = v_secid,
        onboarding_doc_id = v_doc
  where id = v_row.id;

  -- Perfil del encargado (lo lee la IA). Va en su propio bloque: si falla, las
  -- respuestas YA quedaron guardadas arriba y no se pierde el trabajo de la persona.
  begin
    v_perfil := public._portal_colab_perfil_build(v_row.id, v_html, btrim(v_text));
  exception when others then
    v_perfil := null;
    raise warning 'portal_collab_onb_completar: no se pudo armar el perfil de % → % (%)',
      v_row.id, sqlerrm, sqlstate;
  end;

  select nullif(value ->> 'video_bienvenida', '') into v_video
  from public.app_settings where key = 'onboarding_config';

  return jsonb_build_object('ok', true, 'video', coalesce(v_video, ''),
                            'seccion_creada', v_doc is not null,
                            'perfil_doc', v_perfil);
end $$;

grant execute on function public.portal_collab_onb_completar(jsonb, jsonb, text)
  to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   Simular la sesión del encargado y llamar a portal_collab_onb_completar dentro
--   de un DO que termina con raise exception (revierte). Tiene que devolver ok:true
--   y perfil_doc = 'colab_<uuid>'.
--
-- ROLLBACK: volver a portal_v76_perfil_encargado.sql (versión text) — pero entonces
-- vuelve el error.
