-- migrations/del_v9_auditoria_deshacer.sql
--
-- Deshacer el borrado de una AUDITORÍA, con su encabezado.
--
-- Agujero que dejó del_v8: la ficha de una auditoría (fecha, período, alcance,
-- equipo, visibilidad) vive en del_auditorias con "on delete cascade" contra la
-- sección. El trigger de papelera guarda la fila de del_sections, así que deshacer
-- devolvía la auditoría SIN encabezado: sin fecha, sin quiénes la hicieron y otra
-- vez privada. Deshacer tiene que dejar todo como estaba, no a medias.
--
-- La papelera se llena por trigger y solo cubre del_sections y client_brain_docs.
-- En vez de sumarle un trigger más a una tabla caliente, la ficha se guarda a mano
-- en el mismo baúl (tabla = 'del_auditorias') justo antes de borrar la sección, y
-- se recupera al restaurarla. Misma ventana de 24 horas, mismo lugar.

-- ── Al borrar: guardar la ficha ─────────────────────────────────────────────
do $$
declare v_def text; v_nuevo text;
begin
  select pg_get_functiondef('public.del_section_delete(text,text)'::regprocedure) into v_def;

  if position('del_auditorias' in v_def) > 0 then
    raise notice 'del_section_delete ya guarda la ficha de auditoría: no se toca';
    return;
  end if;
  if position('  delete from del_sections where id = p_id;' in v_def) = 0 then
    raise exception 'del_section_delete no tiene la forma esperada: abortado';
  end if;

  v_nuevo := replace(v_def,
    '  delete from del_sections where id = p_id;',
    E'  -- La ficha de la auditoría se cae por cascade con la sección. Se guarda antes\n'
    '  -- en la papelera para que deshacer la devuelva completa (ver del_v9).\n'
    '  insert into public.papelera_borrados (tabla, fila_id, titulo, datos)\n'
    '  select ''del_auditorias'', a.section_id,\n'
    '         (select ds.title from public.del_sections ds where ds.id = a.section_id),\n'
    '         to_jsonb(a)\n'
    '    from public.del_auditorias a where a.section_id = p_id;\n'
    '\n'
    '  delete from del_sections where id = p_id;');

  execute v_nuevo;
  raise notice 'del_section_delete actualizada';
end $$;

-- ── Al deshacer: devolverla ─────────────────────────────────────────────────
do $$
declare v_def text; v_nuevo text; v_ancla text;
begin
  select pg_get_functiondef('public.del_section_restaurar(text)'::regprocedure) into v_def;

  if position('del_auditorias' in v_def) > 0 then
    raise notice 'del_section_restaurar ya devuelve la ficha: no se toca';
    return;
  end if;

  v_ancla := '  return jsonb_build_object(''ok'', true, ''titulo'', v_datos->>''title'');';
  if position(v_ancla in v_def) = 0 then
    raise exception 'del_section_restaurar no tiene la forma esperada: abortado';
  end if;

  v_nuevo := replace(v_def, v_ancla,
    E'  -- Si era una auditoría, su encabezado vuelve con ella. `on conflict do nothing`\n'
    '  -- por si alguien ya la volvió a cargar a mano en el medio: no se le pisa.\n'
    '  insert into public.del_auditorias\n'
    '  select r.*\n'
    '    from (select pb.datos as d\n'
    '            from public.papelera_borrados pb\n'
    '           where pb.tabla = ''del_auditorias'' and pb.fila_id = p_id\n'
    '             and pb.borrado_at > now() - interval ''24 hours''\n'
    '           order by pb.borrado_at desc\n'
    '           limit 1) x,\n'
    '         lateral jsonb_populate_record(null::public.del_auditorias, x.d) r\n'
    '  on conflict (section_id) do nothing;\n'
    '\n' || v_ancla);

  execute v_nuevo;
  raise notice 'del_section_restaurar actualizada';
end $$;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   Crear una auditoría con equipo y visible_cliente = true, borrarla, restaurarla
--   y comprobar que la ficha vuelve idéntica. (Se corrió en un bloque con rollback
--   antes de dejar esto acá.)
--
-- ROLLBACK: volver a aplicar las definiciones previas de del_section_delete
-- (del_v5_versiones_pasos.sql) y del_section_restaurar (del_v7_deshacer_borrado.sql).
