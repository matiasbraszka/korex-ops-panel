-- del_comments_v3_threads — Respuestas (hilos) + identidad de invitado + quote del externo.
--
-- Objetivo (pedido de Matías): que el externo, desde el link compartido, pueda MARCAR texto
-- y comentar esa selección (igual que el equipo en el panel), que el equipo RESPONDA o marque
-- OK/resuelto, y que el invitado VUELVA y vea las respuestas y el estado sin perder su sesión.
--
-- ADITIVA y SEGURA: agrega 2 columnas nullable + un índice, y extiende 2 RPCs públicas.
-- No borra ni cambia datos existentes. Los comentarios actuales quedan como top-level (parent_id null).

-- ── Columnas nuevas ──────────────────────────────────────────────────────────
-- parent_id: respuesta a otro comentario (hilo). FK con CASCADE: al borrar el comentario
-- padre se borran sus respuestas. (A diferencia de section_id, acá SÍ conviene FK: los ids
-- de del_comments son aleatorios y la tabla no se re-sincroniza, así que no hay el problema
-- del importador que motivó evitar FK en section_id.)
alter table public.del_comments add column if not exists parent_id text
  references public.del_comments(id) on delete cascade;
-- guest_id: identidad estable del invitado externo (uuid en su localStorage). Permite que al
-- volver reconozca lo suyo. author_id sigue null para externos (distingue equipo vs externo).
alter table public.del_comments add column if not exists guest_id text;

create index if not exists del_comments_parent_idx on public.del_comments (parent_id);

-- ── share_get: ahora devuelve quote, resolved, parent_id, guest_id e is_team, e incluye
--    TODOS los comentarios de las secciones compartidas (también los resueltos y las
--    respuestas) para que el invitado vea el OK y la conversación al volver. ────────────
create or replace function public.share_get(p_token text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare l public.share_links; res jsonb;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9]{1,40}$' then return jsonb_build_object('ok', false); end if;
  select * into l from public.share_links where token = p_token and revoked = false limit 1;
  if not found then return jsonb_build_object('ok', false); end if;

  if l.kind = 'folder' then
    select jsonb_build_object(
      'ok', true, 'kind', 'folder', 'label', l.label,
      'files', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'title', r.title, 'public_url', r.public_url, 'kind', r.kind,
          'provider', r.provider, 'created_by', r.created_by, 'created_at', r.created_at
        ) order by r.created_at desc)
        from public.funnel_resources r
        where r.client_id = l.client_id
          and r.bucket_key = l.bucket_key
          and r.strategy_id is not distinct from l.strategy_id
          and r.avatar_id  is not distinct from l.avatar_id
          and (l.strategy_id is null or r.version = coalesce(l.version, 1))
      ), '[]'::jsonb)
    ) into res;
    return res;
  end if;

  if l.kind = 'del' then
    select jsonb_build_object(
      'ok', true, 'kind', 'del', 'label', l.label,
      'sections', coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'html', s.html, 'text', s.text) order by s.ord asc)
        from public.del_sections s
        where s.id in (select jsonb_array_elements_text(l.section_ids))
      ), '[]'::jsonb),
      'comments', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', c.id, 'section_id', c.section_id, 'body', c.body,
                 'author_name', c.author_name, 'created_at', c.created_at,
                 'quote', c.quote, 'resolved', c.resolved, 'parent_id', c.parent_id,
                 'guest_id', c.guest_id, 'is_team', (c.author_id is not null)
               ) order by c.created_at asc)
        from public.del_comments c
        where c.section_id in (select jsonb_array_elements_text(l.section_ids))
      ), '[]'::jsonb)
    ) into res;
    return res;
  end if;

  return jsonb_build_object('ok', false);
end $$;
revoke all on function public.share_get(text) from public;
grant execute on function public.share_get(text) to anon, authenticated;

-- ── share_del_comment: ahora acepta quote (frase marcada), parent_id (respuesta) y
--    guest_id (identidad del invitado). Reemplaza la versión de 4 args. ────────────────
drop function if exists public.share_del_comment(text, text, text, text);
create or replace function public.share_del_comment(
  p_token text, p_section_id text, p_body text, p_name text,
  p_quote text default null, p_parent_id text default null, p_guest_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.share_links; v_parent public.del_comments;
        v_id text; v_body text; v_name text; v_quote text; v_guest text;
        v_section text; v_doc text; v_strategy text; v_parent_id text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9]{1,40}$' then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  select * into l from public.share_links where token = p_token and revoked = false and kind = 'del' limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'link'); end if;

  v_body := btrim(coalesce(p_body, ''));
  if length(v_body) = 0 or length(v_body) > 4000 then return jsonb_build_object('ok', false, 'error', 'body'); end if;
  v_name := btrim(coalesce(p_name, '')); if length(v_name) = 0 then v_name := 'Externo'; end if; v_name := left(v_name, 80);
  v_guest := nullif(left(btrim(coalesce(p_guest_id, '')), 60), '');
  v_parent_id := nullif(btrim(coalesce(p_parent_id, '')), '');

  if v_parent_id is not null then
    -- Respuesta: el comentario padre debe existir y estar en una sección compartida por este link.
    select * into v_parent from public.del_comments where id = v_parent_id limit 1;
    if not found then return jsonb_build_object('ok', false, 'error', 'parent'); end if;
    if not (l.section_ids ? v_parent.section_id) then return jsonb_build_object('ok', false, 'error', 'parent_scope'); end if;
    v_section := v_parent.section_id; v_doc := v_parent.doc_id; v_strategy := v_parent.strategy_id;
    v_quote := null; -- las respuestas no llevan cita
  else
    -- Comentario nuevo anclado a una sección compartida (con o sin frase marcada).
    if not (l.section_ids ? p_section_id) then return jsonb_build_object('ok', false, 'error', 'section'); end if;
    v_section := p_section_id; v_doc := l.doc_id; v_strategy := l.strategy_id;
    v_quote := nullif(left(btrim(coalesce(p_quote, '')), 300), '');
  end if;

  v_id := 'dcmt_' || substr(md5(random()::text || clock_timestamp()::text), 1, 18);
  insert into public.del_comments (id, section_id, doc_id, strategy_id, author_id, author_name, body, resolved, created_at, quote, parent_id, guest_id)
  values (v_id, v_section, v_doc, v_strategy, null, v_name, v_body, false, now(), v_quote, v_parent_id, v_guest);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.share_del_comment(text, text, text, text, text, text, text) from public;
grant execute on function public.share_del_comment(text, text, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ── Rollback ────────────────────────────────────────────────────────────────
--   alter table public.del_comments drop column if exists parent_id;
--   alter table public.del_comments drop column if exists guest_id;
--   (y restaurar share_get / share_del_comment desde share_links_v1.sql)
