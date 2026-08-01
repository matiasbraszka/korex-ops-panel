-- ═════════════════════════════════════════════════════════════════════════════
-- share_v2_rpcs.sql — Compartir (carpetas/DEL/páginas) vía RPC, no escritura
-- directa a la tabla.
--
-- BUG: "compartir no hace nada". La auditoría de seguridad puso RLS + quitó el
-- grant de anon en `share_links`, y el panel escribía DIRECTO a la tabla con
-- `sbFetch` (que además SE TRAGA los errores y devuelve null → clic sin efecto).
--
-- Fix (patrón de la auditoría: mover escrituras a RPCs SECURITY DEFINER):
--   share_link_create(p jsonb) · share_link_list(p jsonb) · share_link_revoke(id)
-- Chequean is_team_member() y corren como owner (no dependen del grant/RLS de la
-- tabla). El front las llama con supabase.rpc y muestra el error si algo falla.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.share_link_create(p jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id text; v_token text;
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'No tenés permiso (¿sesión vencida? volvé a entrar).');
  end if;
  insert into public.share_links(kind, client_id, strategy_id, avatar_id, bucket_key, version, doc_id, section_ids, label, created_by)
  values (
    p->>'kind',
    nullif(p->>'client_id',''), nullif(p->>'strategy_id',''), nullif(p->>'avatar_id',''),
    nullif(p->>'bucket_key',''), coalesce((p->>'version')::int, 1), nullif(p->>'doc_id',''),
    coalesce(p->'section_ids', '[]'::jsonb), nullif(p->>'label',''), nullif(p->>'created_by','')
  )
  returning id, token into v_id, v_token;
  return jsonb_build_object('ok', true, 'id', v_id, 'token', v_token);
end $$;

grant execute on function public.share_link_create(jsonb) to authenticated, service_role;

create or replace function public.share_link_list(p jsonb)
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $$
  select case when not public.is_team_member() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sl.id, 'token', sl.token, 'section_ids', sl.section_ids,
      'strategy_id', sl.strategy_id, 'avatar_id', sl.avatar_id, 'created_at', sl.created_at
    ) order by sl.created_at desc)
    from public.share_links sl
    where sl.revoked = false
      and sl.kind = (p->>'kind')
      and ((p->>'client_id') is null or sl.client_id is not distinct from nullif(p->>'client_id',''))
      and ((p->>'bucket_key') is null or sl.bucket_key is not distinct from nullif(p->>'bucket_key',''))
      and ((p->>'doc_id') is null or sl.doc_id is not distinct from nullif(p->>'doc_id',''))
  ), '[]'::jsonb) end;
$$;

grant execute on function public.share_link_list(jsonb) to authenticated, service_role;

create or replace function public.share_link_revoke(p_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'No tenés permiso.');
  end if;
  update public.share_links set revoked = true where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.share_link_revoke(text) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
