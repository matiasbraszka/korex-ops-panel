-- share_v2 — Compartir GUÍAS y DOCUMENTOS del cliente como página pública de solo lectura.
-- APLICADA a prod el 2026-07-27 (vía MCP apply_migration).
--
-- Pedido de Matías: las guías y los documentos generales del cliente deben tener las
-- mismas funciones que las pestañas del DEL (renombrar, PDF, compartir). El share ya
-- existía por `kind` (folder/del); se suman tres kinds que devuelven un shape único
-- 'pagina' {title, html, text} para que /compartir/:token los muestre en solo lectura:
--   · 'guia'      → del_guias_globales (doc_id = id de la guía)
--   · 'doc_extra' → del_client_extra_docs (documentos propios del panel)
--   · 'doc_brain' → client_brain_docs (docs del cliente; usa panel_html o text)

create or replace function public.share_get(p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
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

  -- Páginas sueltas (solo lectura): guías globales y documentos del cliente.
  if l.kind = 'guia' then
    select jsonb_build_object('ok', true, 'kind', 'pagina', 'label', l.label,
      'title', g.title, 'html', coalesce(g.html, ''), 'text', coalesce(g.text, ''))
    into res from public.del_guias_globales g where g.id::text = l.doc_id;
    return coalesce(res, jsonb_build_object('ok', false));
  end if;

  if l.kind = 'doc_extra' then
    select jsonb_build_object('ok', true, 'kind', 'pagina', 'label', l.label,
      'title', d.title, 'html', coalesce(d.html, ''), 'text', '')
    into res from public.del_client_extra_docs d where d.id::text = l.doc_id;
    return coalesce(res, jsonb_build_object('ok', false));
  end if;

  if l.kind = 'doc_brain' then
    select jsonb_build_object('ok', true, 'kind', 'pagina', 'label', l.label,
      'title', d.title, 'html', coalesce(d.panel_html, ''), 'text', coalesce(d.text, ''))
    into res from public.client_brain_docs d where d.id = l.doc_id;
    return coalesce(res, jsonb_build_object('ok', false));
  end if;

  return jsonb_build_object('ok', false);
end $$;

-- El check de kind solo permitía folder/del — se amplía (aplicado como share_v2b).
alter table public.share_links drop constraint share_links_kind_check;
alter table public.share_links add constraint share_links_kind_check
  check (kind = any (array['folder'::text, 'del'::text, 'guia'::text, 'doc_extra'::text, 'doc_brain'::text]));
