-- Red de seguridad: si un funnel cambia o pierde su del_doc_id, el valor viejo
-- queda en papelera_borrados (tabla 'strategy_pages (del_doc_id)') para poder
-- reconectarlo. Motivo: el funnel de Sergio "Padres y Madres" quedó con
-- del_doc_id null y el DEL parecía borrado (2026-07-28).
-- Aplicada a prod vía MCP apply_migration el 2026-07-28.
create or replace function papelera_del_doc_id_cambio()
returns trigger language plpgsql security definer as $$
begin
  if old.del_doc_id is distinct from new.del_doc_id then
    insert into papelera_borrados (tabla, fila_id, client_id, strategy_id, titulo, datos)
    values (
      'strategy_pages (del_doc_id)',
      old.id,
      old.client_id,
      old.strategy_id,
      coalesce(old.name,'') || ' — del_doc_id: ' || coalesce(old.del_doc_id,'(null)') || ' → ' || coalesce(new.del_doc_id,'(null)'),
      jsonb_build_object('funnel_id', old.id, 'del_doc_id_viejo', old.del_doc_id, 'del_doc_id_nuevo', new.del_doc_id)
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_papelera_del_doc_id on strategy_pages;
create trigger trg_papelera_del_doc_id
before update on strategy_pages
for each row execute function papelera_del_doc_id_cambio();
