-- ═════════════════════════════════════════════════════════════════════════════
-- Portal · Mini-onboarding de HISTORIA del colaborador "Encargado de grabarse"
--
-- Cuando alguien se registra como colaborador con rol "Encargado de grabarse"
-- (el que graba los anuncios), al entrar hace un mini-onboarding OBLIGATORIO de
-- su historia de vida + autoridad. Al terminar:
--   · se guarda una SECCIÓN nueva "Onboarding de {nombre}" en el DEL del cliente
--     (el doc del más grande), para que aparezca junto a las demás secciones.
--   · se le desbloquea la plataforma y ve el video de bienvenida.
--
-- Las respuestas viven en portal_collaborators (jsonb) y el gate se resuelve por
-- el email del JWT (el colaborador comparte identidad de cliente vía person_id,
-- pero acá lo distinguimos por su propio email en portal_collaborators).
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.portal_collaborators
  add column if not exists onboarding_answers  jsonb,
  add column if not exists onboarding_done_at   timestamptz,
  add column if not exists onboarding_section_id text,
  add column if not exists onboarding_doc_id     text;

-- Escapa HTML para armar la sección desde texto plano sin inyección de tags.
create or replace function public._kx_html_escape(t text)
returns text language sql immutable as $$
  select replace(replace(replace(coalesce(t,''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;

-- ¿Quién soy? Lo llama el portal al entrar. Para un cliente normal devuelve
-- es_colaborador=false (rápido). Para un colaborador dice si le falta el
-- mini-onboarding (solo "Encargado de grabarse").
create or replace function public.portal_collab_yo()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_email text; v_row public.portal_collaborators; v_video text;
begin
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then return jsonb_build_object('ok', true, 'es_colaborador', false); end if;

  select * into v_row from public.portal_collaborators
  where lower(email) = v_email and enabled
  order by created_at desc limit 1;

  if v_row.id is null then return jsonb_build_object('ok', true, 'es_colaborador', false); end if;

  select nullif(value ->> 'video_bienvenida', '') into v_video
  from public.app_settings where key = 'onboarding_config';

  return jsonb_build_object(
    'ok', true,
    'es_colaborador', true,
    'nombre', v_row.full_name,
    'rol', v_row.role,
    'onboarding_done', v_row.onboarding_done_at is not null,
    'necesita_onboarding', (v_row.role ilike 'Encargado de grabar%' and v_row.onboarding_done_at is null),
    'respuestas', coalesce(v_row.onboarding_answers, '{}'::jsonb),
    'video', coalesce(v_video, '')
  );
end $$;

-- Autoguardado de respuestas (para no perder lo escrito). No completa nada.
create or replace function public.portal_collab_onb_guardar(p_answers jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare v_email text;
begin
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then return jsonb_build_object('ok', false, 'error', 'sin_sesion'); end if;
  update public.portal_collaborators
    set onboarding_answers = coalesce(p_answers, '{}'::jsonb)
  where lower(email) = v_email and enabled;
  return jsonb_build_object('ok', true);
end $$;

-- Termina el mini-onboarding: arma la sección en el DEL del cliente y marca hecho.
-- p_pares = array de {grupo, q, a} en orden (las vacías se omiten).
create or replace function public.portal_collab_onb_completar(p_answers jsonb, p_pares jsonb, p_titulo text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_email text; v_row public.portal_collaborators;
  v_html text := ''; v_text text := ''; v_grupo text := ''; e jsonb;
  v_title text; v_doc text; v_strategy text; v_ord int; v_secid text; v_video text;
  v_g text; v_q text; v_a text;
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

  update public.portal_collaborators
    set onboarding_answers = coalesce(p_answers, onboarding_answers),
        onboarding_done_at = now(),
        onboarding_section_id = v_secid,
        onboarding_doc_id = v_doc
  where id = v_row.id;

  select nullif(value ->> 'video_bienvenida', '') into v_video
  from public.app_settings where key = 'onboarding_config';

  return jsonb_build_object('ok', true, 'video', coalesce(v_video, ''), 'seccion_creada', v_doc is not null);
end $$;

grant execute on function
  public.portal_collab_yo(),
  public.portal_collab_onb_guardar(jsonb),
  public.portal_collab_onb_completar(jsonb, jsonb, text)
to authenticated, service_role;
