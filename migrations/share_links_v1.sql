-- share_links_v1 — Links para compartir con EXTERNOS (sin cuenta):
--   · carpetas de recursos (el externo SUBE videos/imágenes, directo a la carpeta)
--   · secciones del DEL (el externo COMENTA solo las secciones elegidas)
-- Patrón: token permanente + RPC SECURITY DEFINER a anon (como booking_calendars.public_token
-- y submit_kpis_publico). anon NUNCA toca tablas directo: solo por estos RPC / la edge
-- function share-upload (service role). Links revocables (revoked). Sin vencimiento/clave.
-- APLICAR en deploy (junto con `supabase functions deploy share-upload`) + `notify pgrst,'reload schema'`.

create table if not exists public.share_links (
  id           text primary key default ('shr_' || substr(md5(random()::text || clock_timestamp()::text), 1, 14)),
  token        text not null unique default substr(md5(random()::text || clock_timestamp()::text || random()::text), 1, 24),
  kind         text not null check (kind in ('folder', 'del')),
  -- folder scope (espeja funnel_resources): client_id + bucket_key + (strategy/avatar/version)
  client_id    text,
  strategy_id  text,
  avatar_id    text,
  bucket_key   text,
  version      integer default 1,
  -- del scope
  doc_id       text,
  section_ids  jsonb not null default '[]'::jsonb,
  label        text,
  created_by   text,
  created_at   timestamptz not null default now(),
  revoked      boolean not null default false
);
create index if not exists share_links_token_idx on public.share_links (token);

alter table public.share_links enable row level security;
drop policy if exists share_links_rw on public.share_links;
create policy share_links_rw on public.share_links
  for all to authenticated using (is_team_member()) with check (is_team_member());
revoke all on public.share_links from anon;
grant all on public.share_links to authenticated;

-- ── Lectura pública por token (carpeta o secciones del DEL) ──────────────────────
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
        select jsonb_agg(jsonb_build_object('id', c.id, 'section_id', c.section_id, 'body', c.body,
                 'author_name', c.author_name, 'created_at', c.created_at) order by c.created_at asc)
        from public.del_comments c
        where c.section_id in (select jsonb_array_elements_text(l.section_ids)) and c.resolved = false
      ), '[]'::jsonb)
    ) into res;
    return res;
  end if;

  return jsonb_build_object('ok', false);
end $$;
revoke all on function public.share_get(text) from public;
grant execute on function public.share_get(text) to anon, authenticated;

-- ── Comentario externo sobre una sección compartida ─────────────────────────────
create or replace function public.share_del_comment(p_token text, p_section_id text, p_body text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.share_links; v_id text; v_body text; v_name text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9]{1,40}$' then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  select * into l from public.share_links where token = p_token and revoked = false and kind = 'del' limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  if not (l.section_ids ? p_section_id) then return jsonb_build_object('ok', false, 'error', 'section'); end if;
  v_body := btrim(coalesce(p_body, ''));
  v_name := btrim(coalesce(p_name, ''));
  if length(v_body) = 0 or length(v_body) > 4000 then return jsonb_build_object('ok', false, 'error', 'body'); end if;
  if length(v_name) = 0 then v_name := 'Externo'; end if;
  v_name := left(v_name, 80);
  v_id := 'dcmt_' || substr(md5(random()::text || clock_timestamp()::text), 1, 18);
  insert into public.del_comments (id, section_id, doc_id, strategy_id, author_id, author_name, body, resolved, created_at)
  values (v_id, p_section_id, l.doc_id, l.strategy_id, null, v_name, v_body, false, now());
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.share_del_comment(text, text, text, text) from public;
grant execute on function public.share_del_comment(text, text, text, text) to anon, authenticated;
