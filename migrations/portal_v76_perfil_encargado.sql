-- ═════════════════════════════════════════════════════════════════════════════
-- portal_v76_perfil_encargado.sql
--
-- PERFIL DEL ENCARGADO DE GRABACIÓN.
-- El colaborador con rol "Encargado de grabarse" completa su mini-onboarding
-- (historia de vida + autoridad). Hasta ahora eso quedaba solo como una sección
-- suelta en el DEL más grande del cliente. Ahora, además, se le arma un PERFIL
-- propio: un documento `colab_<id>` en client_brain_docs (doc_kind='colaborador'),
-- análogo al doc de onboarding del cliente (`onb_<client>`).
--
-- ¿Para qué? Ese perfil es lo que van a LEER los agentes de IA (anuncios, VSL,
-- landing) cuando se elija "quién se graba": su historia y personalidad son el
-- insumo más importante para escribir a la medida de esa persona. Y aparece en
-- el panel junto al Onboarding / Investigación / DEL del cliente, como una ficha
-- aparte del encargado.
--
-- ADITIVA: no rompe el flujo actual. Se sigue creando la sección en el DEL (para
-- no perder compatibilidad) y ADEMÁS se arma/actualiza el documento-perfil.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · Armar/actualizar el documento-perfil del colaborador ──────────────────
-- Recibe el HTML y el texto plano ya construidos (P:/R) desde `completar`, para
-- no duplicar la lógica de armado. Idempotente por (client_id, node_id).
create or replace function public._portal_colab_perfil_build(
  p_collab_id text, p_html text, p_text text
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

grant execute on function public._portal_colab_perfil_build(text, text, text)
  to authenticated, service_role;

-- ── 2 · Completar el mini-onboarding: sección en el DEL + PERFIL propio ────────
-- Igual que antes (arma HTML/texto desde los pares, crea la sección en el DEL más
-- grande del cliente), y ADEMÁS arma el documento-perfil `colab_<id>` con el mismo
-- contenido, para que lo lean los agentes y se vea como ficha aparte.
create or replace function public.portal_collab_onb_completar(p_answers jsonb, p_pares jsonb, p_titulo text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp
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

  -- NUEVO: armar/actualizar el documento-perfil del encargado (lo lee la IA).
  v_perfil := public._portal_colab_perfil_build(v_row.id, v_html, btrim(v_text));

  select nullif(value ->> 'video_bienvenida', '') into v_video
  from public.app_settings where key = 'onboarding_config';

  return jsonb_build_object('ok', true, 'video', coalesce(v_video, ''),
                            'seccion_creada', v_doc is not null,
                            'perfil_doc', v_perfil);
end $$;

grant execute on function public.portal_collab_onb_completar(jsonb, jsonb, text)
  to authenticated, service_role;

-- ── 3 · Backfill: armar el perfil de los encargados que YA completaron ─────────
-- Reconstruye el perfil desde las respuestas ya guardadas (onboarding_answers).
-- Usa la sección del DEL que ya se les creó (su HTML/texto) como fuente.
do $$
declare c record; v_html text; v_text text;
begin
  for c in
    select pc.id, pc.onboarding_section_id
    from public.portal_collaborators pc
    where pc.onboarding_done_at is not null
      and not exists (select 1 from public.client_brain_docs d
                      where d.id = 'colab_' || pc.id)
  loop
    select html, text into v_html, v_text
    from public.del_sections where id = c.onboarding_section_id;
    perform public._portal_colab_perfil_build(c.id, coalesce(v_html, ''), coalesce(v_text, ''));
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';

-- Rollback:
--   delete from public.client_brain_docs where doc_kind = 'colaborador';
--   (y restaurar portal_collab_onb_completar desde portal_v52_colab_onboarding.sql)
