-- migrations/portal_v91_embudo_corto.sql
--
-- Que el portal del cliente entienda un embudo CORTO.
--
-- Con los pasos por versión (del_v5_versiones_pasos.sql), un funnel puede no llevar
-- Pre-landing, o ir directo a formulario. El track "Landing" del portal no se enteraba:
--
--   land_copy := exists(... d.kind = 'pg_landing')
--
-- O sea que preguntaba por UNA página concreta. Si el embudo no la lleva, land_copy
-- queda en false para siempre y el track se clava en la fase 1 ("Copy") aunque el
-- formulario esté escrito, aprobado y publicado. El cliente ve su embudo trabado.
--
-- El arreglo es preguntar por lo que el track realmente representa: "¿hay copy escrito
-- de alguna de las páginas de este embudo?". Con las cuatro páginas da lo mismo que
-- antes; con un embudo corto, funciona.
--
-- Se edita la función VIVA: portal_v88_modo_grabador.sql la reescribió en caliente
-- (cambió del_sections por _portal_ds_visibles) y esa versión no está en ningún .sql.

do $$
declare v_def text; v_nuevo text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'portal_cliente_embudo_tracks' limit 1;
  if v_def is null then raise exception 'portal_cliente_embudo_tracks no existe'; end if;

  v_nuevo := replace(v_def,
    'exists(select 1 from public._portal_ds_visibles() d where d.doc_id=sp.del_doc_id and d.kind=''pg_landing'') as land_copy',
    'exists(select 1 from public._portal_ds_visibles() d where d.doc_id=sp.del_doc_id'
    || ' and d.kind in (''pg_prelanding'',''pg_landing'',''pg_formulario'',''pg_thankyou'')) as land_copy');

  if v_nuevo = v_def then
    raise exception 'No encontré land_copy en portal_cliente_embudo_tracks (¿ya está parcheada?)';
  end if;
  execute v_nuevo;
end
$$;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   -- Con sesión de cliente, que ningún embudo con formulario escrito quede en fase 1:
--   select * from public.portal_cliente_embudo_tracks();
--
-- ROLLBACK: mismo bloque al revés (volver a d.kind='pg_landing').
