-- migrations/del_v2_candado_cliente.sql
--
-- CANDADO: un funnel solo puede apuntar al DEL de SU MISMO cliente, y una sección solo
-- puede colgar de un documento de SU MISMO cliente. Hasta hoy no había NADA que lo impidiera.
--
-- Ya pasó una vez — del_v1_un_del_por_funnel.sql:1-21 documenta el funnel "Ricardo Núñez —
-- Reclutamiento" (cliente Fabiana Carrasco) apuntando al DEL de Fabiana. Se detectó porque
-- el avance de Fabiana saltó de 79% a 69%. Se arregló A MANO, para ese par, y se agregó un
-- UNIQUE(del_doc_id) que impide que DOS funnels compartan un DEL — pero no impide que un
-- funnel apunte al DEL de OTRO CLIENTE, que es el caso peligroso.
--
-- Por qué importa: del_section_add (del_sections_v3_editable.sql:141-172) COPIA el client_id
-- del documento destino sin validarlo. O sea que una sección creada contra el documento
-- equivocado nace estampada con el cliente ajeno y queda indistinguible de una legítima —
-- la evidencia del error se borra sola. Y del_section_move_doc tiene una guarda que compara
-- justamente ese client_id ya contaminado, así que la deja pasar.
--
-- Se resuelve con CLAVES FORÁNEAS COMPUESTAS y no con un trigger: Postgres las verifica
-- siempre, en cualquier camino de escritura (panel, RPC, edge function, SQL a mano), y no
-- hay forma de saltearlas.
--
-- Estado previo verificado inmediatamente antes de aplicar: 0 funnels con DEL de otro
-- cliente, 0 secciones con cliente distinto al del doc, 0 client_id nulos en ambos lados.

-- Par referenciable (id, client_id). Necesario para poder apuntarle una FK compuesta.
do $$
begin
  alter table public.client_brain_docs
    add constraint client_brain_docs_id_client_uq unique (id, client_id);
exception when duplicate_table or duplicate_object then null;
end $$;

-- Un funnel solo puede apuntar a un DEL de su mismo cliente.
-- OJO con el `on delete set null`: en una FK compuesta, sin la lista de columnas, Postgres
-- pondría en NULL TAMBIÉN client_id — que lo llena un trigger desde strategies y no debe
-- vaciarse nunca. La lista explícita (del_doc_id) existe desde PG 15; acá corre PG 17.
do $$
begin
  alter table public.strategy_pages
    add constraint strategy_pages_del_doc_mismo_cliente
    foreign key (del_doc_id, client_id)
    references public.client_brain_docs (id, client_id)
    on update cascade
    on delete set null (del_doc_id);
exception when duplicate_table or duplicate_object then null;
end $$;

-- Una sección solo puede colgar de un documento de su mismo cliente.
-- Ambas columnas son NOT NULL, así que la restricción se evalúa siempre (con MATCH SIMPLE,
-- que es el default, un NULL en cualquiera de las dos la saltearía).
do $$
begin
  alter table public.del_sections
    add constraint del_sections_doc_mismo_cliente
    foreign key (doc_id, client_id)
    references public.client_brain_docs (id, client_id)
    on update cascade
    on delete cascade;
exception when duplicate_table or duplicate_object then null;
end $$;

notify pgrst, 'reload schema';

-- Verificación — esto TIENE que fallar:
--   update public.strategy_pages set del_doc_id =
--     (select id from public.client_brain_docs where client_id <> strategy_pages.client_id limit 1)
--   where id = '<algún funnel>';
--   -- ERROR: viola la llave foránea «strategy_pages_del_doc_mismo_cliente»
--
-- ROLLBACK:
--   alter table public.del_sections    drop constraint if exists del_sections_doc_mismo_cliente;
--   alter table public.strategy_pages  drop constraint if exists strategy_pages_del_doc_mismo_cliente;
--   alter table public.client_brain_docs drop constraint if exists client_brain_docs_id_client_uq;
