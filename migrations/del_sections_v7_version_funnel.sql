-- migrations/del_sections_v7_version_funnel.sql
--
-- Versionado A NIVEL FUNNEL (rediseño pedido por Matías). En vez de chips de estado
-- por sección (que resultó un lío), el DEL se ve por VERSIÓN completa: "Este funnel
-- V1" por defecto, y un botón "+" agrega "Este funnel V2" con su propio juego de
-- VSL / Anuncios / Landings, vacío y listo para configurar. Se cambia de versión con
-- un clic y se ve solo esa. El avatar y la estrategia NO versionan (se ven en todas).
--
-- del_version_add crea la versión N+1: una sección vacía por cada categoría que
-- versiona, para que al cambiar a V2 estén todos los casilleros listos para escribir.

create or replace function public.del_version_add(p_doc_id text, p_by text default null)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_cli text; v_strat text; v_new int; v_ord int; k text;
  v_kinds  text[] := array['vsl','anuncios','pg_prelanding','pg_landing','pg_formulario','pg_thankyou'];
  v_labels jsonb  := '{"vsl":"VSL","anuncios":"Anuncios","pg_prelanding":"Pre-landing","pg_landing":"Landing","pg_formulario":"Formulario","pg_thankyou":"Thank you"}';
begin
  select client_id, strategy_id into v_cli, v_strat from client_brain_docs where id = p_doc_id;
  if v_cli is null then raise exception 'DEL inexistente: %', p_doc_id; end if;
  perform del_claim(p_doc_id);

  select coalesce(max(version), 1) + 1 into v_new  from del_sections where doc_id = p_doc_id;
  select coalesce(max(ord), 0)         into v_ord  from del_sections where doc_id = p_doc_id;

  foreach k in array v_kinds loop
    v_ord := v_ord + 1;
    insert into del_sections (id, doc_id, client_id, strategy_id, ord, title, kind, text, html,
                              char_count, source, version, status, updated_at, updated_by)
    values ('dsecp_' || replace(gen_random_uuid()::text, '-', ''),
            p_doc_id, v_cli, v_strat, v_ord, v_labels->>k, k, '', '', 0,
            'panel', v_new, 'activa', now(), p_by);
  end loop;

  return v_new;
end
$function$;

revoke all   on function public.del_version_add(text, text) from public, anon;
grant execute on function public.del_version_add(text, text) to authenticated;

notify pgrst, 'reload schema';
