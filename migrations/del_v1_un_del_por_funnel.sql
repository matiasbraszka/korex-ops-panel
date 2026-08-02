-- del_v1_un_del_por_funnel.sql   [APLICADA EN PROD 2026-08-02]
--
-- Regla de Matias: "todos los funnels deben llevar a su propio DEL, jamas pasara
-- que dos funnels van al mismo DEL".
--
-- Habia UN solo caso en las 62 filas, y aparecio al migrar el portal a funnels
-- ([portal_v80] / [portal_v81]): el funnel "Ricardo Nunez — Reclutamiento"
-- (spg_ricardo_jifu_001, cliente Fabiana Carrasco) apuntaba al DEL de Fabiana
-- (cbd_1Jw0jylba94ZEGnAw1T2sbw0HQjgZWZTLli5XAyoDyDo). Se noto porque el avance de
-- Fabiana se movio de 79% a 69% al calcular por del_doc_id: el funnel de Ricardo
-- heredaba los pendientes de Fabiana.
--
-- El documento es de Fabiana sin ninguna duda: sus secciones se llaman "Avatar
-- Fabiana", "Anuncios Fabiana", "VSL Fabiana" (el doc del Drive se titula "DEL |
-- Fabiana, Ricardo | Jifu, para Reclutamiento" — cubria a los dos, que es de donde
-- viene el enredo). NO se copia nada: se le crea a Ricardo un DEL propio y vacio
-- para que el equipo lo llene. Duplicar las 12 secciones habria metido material
-- ajeno en su funnel.
--
-- La forma del documento es la misma que usa crear-venta para el DEL nativo
-- (doc_kind='del', scope='funnel', node_id='native_<id>', text vacio).

do $mig$
declare
  v_funnel   text := 'spg_ricardo_jifu_001';
  v_doc_ajeno text := 'cbd_1Jw0jylba94ZEGnAw1T2sbw0HQjgZWZTLli5XAyoDyDo';
  v_client   text;
  v_strategy text;
  v_nuevo    text;
begin
  select client_id, strategy_id into v_client, v_strategy
    from public.strategy_pages where id = v_funnel and del_doc_id = v_doc_ajeno;

  if v_client is null then
    raise notice 'El funnel ya no apunta al DEL ajeno: nada que hacer';
    return;
  end if;

  v_nuevo := 'del_' || extract(epoch from now())::bigint || substr(md5(random()::text), 1, 10);

  insert into public.client_brain_docs
    (id, client_id, node_id, doc_kind, title, text, char_count, strategy_id, scope, synced_at)
  values
    (v_nuevo, v_client, 'native_' || v_nuevo, 'del',
     'Ricardo Núñez — Reclutamiento — DEL', '', 0, v_strategy, 'funnel', now());

  update public.strategy_pages set del_doc_id = v_nuevo where id = v_funnel;

  raise notice 'Funnel % ahora usa su propio DEL %', v_funnel, v_nuevo;
end $mig$;

-- El candado: de ahora en mas, dos funnels no pueden compartir DEL.
-- Es un indice UNIQUE parcial: ignora los NULL (un funnel sin DEL todavia asignado
-- es valido; dos apuntando al mismo, no).
create unique index if not exists strategy_pages_del_doc_id_uniq
  on public.strategy_pages (del_doc_id)
  where del_doc_id is not null;

comment on index public.strategy_pages_del_doc_id_uniq is
  'Un DEL por funnel. Regla de negocio: dos funnels NUNCA comparten documento.';

-- Verificado en prod despues de aplicar:
--   * 0 funnels compartiendo del_doc_id (antes: 1 par).
--   * El candado se probo a proposito: reasignar el DEL de Fabiana al funnel de
--     Ricardo devuelve unique_violation.
--   * Avance de Fabiana, ya separado:
--       Fabiana — Jovenes adultos latinos  75% (6/8, con grabacion y revision pendientes)
--       Ricardo Nunez — Reclutamiento      83% (5/6, sin pendientes)
--     El 83% de Ricardo sale del pipeline de produccion; su DEL esta vacio, asi que
--     todavia no tiene guiones ni revisiones que contar.
