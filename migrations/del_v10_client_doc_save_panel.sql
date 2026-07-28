-- ─────────────────────────────────────────────────────────────────────────────
-- del_v10_client_doc_save_panel.sql
--
-- El mismo agujero que `del_section_set_meta` (ver del_v9), en otro lado:
-- `client_brain_docs` también tiene RLS sin política de UPDATE, y el editor de
-- los documentos del cliente (personalidad, investigación, los extras del panel)
-- escribía derecho a la tabla. Nunca guardó nada.
--
-- Y no es una sospecha: de 185 documentos, `panel_edited_by` está en cero y
-- `panel_edited_at` nunca se escribió. Ni una sola edición del panel llegó a la
-- base desde que existe el botón.
--
-- Encima el front no miraba el error: la llamada no estaba ni `await`-eada. Sin
-- política, PostgREST devolvía 200 con cero filas — así que aunque lo hubiera
-- mirado, tampoco habría visto nada.
--
-- La RPC aprovecha para poner del lado del servidor la regla que hoy solo vive
-- en la interfaz: el documento de onboarding de la plataforma lo escribe el
-- cliente y se regenera cada dos minutos; si alguien lo edita a mano queda
-- congelado mostrando una foto vieja. Acá se rechaza.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.client_doc_save_panel(
  p_id   text,
  p_html text,
  p_text text,
  p_by   text default null
)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_node text;
begin
  if not public.is_team_member() then
    raise exception 'no autorizado';
  end if;

  select node_id into v_node from public.client_brain_docs where id = p_id;
  if v_node is null and not exists (select 1 from public.client_brain_docs where id = p_id) then
    raise exception 'documento inexistente: %', p_id;
  end if;

  if coalesce(v_node, '') like 'native\_onb\_%' then
    raise exception 'el onboarding de la plataforma lo escribe el cliente; no se edita a mano';
  end if;

  update public.client_brain_docs
     set panel_html      = p_html,
         text            = p_text,
         char_count      = length(coalesce(p_text, '')),
         panel_edited_by = p_by,
         panel_edited_at = now()
   where id = p_id;
end $$;

revoke execute on function public.client_doc_save_panel(text, text, text, text) from public, anon;
grant  execute on function public.client_doc_save_panel(text, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
