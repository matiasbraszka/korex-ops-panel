-- migrations/funnels_v6_del_por_funnel.sql
--
-- ── El DEL deja de colgar de la CARPETA y pasa a colgar del FUNNEL ───────────
-- Esta es la "Fase 3" que anticipaban funnels_v2_pipeline_tipo.sql:21-25 y
-- FunnelsView.jsx:1407 ("del_doc_id con FK al funnel").
--
-- HOY: el DEL se resuelve por `strategy_id` (la carpeta de Drive). Como varios
-- funnels cuelgan de la misma carpeta, COMPARTEN el mismo DEL. Ej: Sergio Canovas
-- tiene un solo doc con AVATAR 1 (Emprendedores) y AVATAR 2 (Networkers), y sus
-- dos funnels muestran el documento entero mezclado. Summit Network: 4 funnels, 1 DEL.
--
-- AHORA: cada funnel apunta a SU DEL con `strategy_pages.del_doc_id`. Es un puntero
-- NULLABLE a client_brain_docs. Regla en TODOS los consumidores:
--     del_doc_id si está y el doc existe  →  si no, fallback a strategy_id (=hoy).
-- Por eso esta migración es ADITIVA E INERTE: ningún código la lee todavía (eso
-- llega en la fase de código, con fallback). Nada cambia de comportamiento al aplicar.
--
-- NO interrumpe producción: columna nueva nullable + índice + backfill de los
-- funnels que HOY ya resuelven un único DEL (les pone el puntero al MISMO doc que
-- ven hoy → cero cambio visible). Los multi-funnel quedan NULL a propósito: los
-- asigna/parte Matías a mano desde el panel (fases siguientes).

alter table public.strategy_pages
  add column if not exists del_doc_id text
    references public.client_brain_docs(id) on delete set null;
--  ^ on delete set null: si el DEL se borra del Drive y el sync lo elimina, el
--    funnel vuelve solo al fallback por strategy_id. La FK nunca rompe un insert/update.

create index if not exists strategy_pages_del_doc_id_idx
  on public.strategy_pages(del_doc_id);

comment on column public.strategy_pages.del_doc_id is
  'DEL propio de este funnel (client_brain_docs.id). NULL = resolver por strategy_id (carpeta), como antes. Prioridad: del_doc_id > strategy_id.';

-- ── Backfill: SOLO los funnels que HOY resuelven UN ÚNICO DEL sin ambigüedad ──
-- Autopuebla del_doc_id = ese doc (el mismo que ya ven). Idempotente: solo toca
-- filas con del_doc_id nulo. Los funnels con 0 o >1 DEL candidato quedan NULL.
update public.strategy_pages p
   set del_doc_id = d.id
  from client_brain_docs d
 where p.del_doc_id is null
   and d.strategy_id = p.strategy_id
   and d.doc_kind = 'del'
   and d.char_count >= 15000          -- mismo piso que el gate: una plantilla vacía no cuenta
   and (select count(*) from client_brain_docs d2
         where d2.strategy_id = p.strategy_id and d2.doc_kind = 'del'
           and d2.char_count >= 15000) = 1;   -- SOLO si hay exactamente uno

notify pgrst, 'reload schema';

-- ── Verificación (correr después de aplicar) ─────────────────────────────────
--   -- Cuántos funnels quedaron con puntero (los 1:1):
--   select count(*) filter (where del_doc_id is not null) as con_puntero,
--          count(*) filter (where del_doc_id is null)     as sin_puntero
--     from strategy_pages;
--   -- Los que quedan sin puntero (multi-funnel, a asignar a mano en el panel):
--   select p.client_id, p.name from strategy_pages p
--    where p.del_doc_id is null and p.strategy_id is not null order by 1;
--
-- ── Rollback ─────────────────────────────────────────────────────────────────
--   alter table public.strategy_pages drop column if exists del_doc_id;
--   (Es reversible sin pérdida: la columna es aditiva y ningún dato viejo depende de ella.)
