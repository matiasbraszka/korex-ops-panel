-- migrations/tareas_sprint_v9_funnel_id.sql
--
-- funnel_id: a que FUNNEL pertenece la tarea.
--
-- La tarea NO se muda: sigue viviendo donde siempre (seccion Tareas y ficha del
-- cliente). funnel_id es un vinculo OPCIONAL que ademas la hace aparecer dentro
-- del funnel. Nullable a proposito: hay tareas de cliente que no son de ningun
-- funnel (cobrar una factura, llamada de seguimiento, renovar contrato).
--
-- ON DELETE SET NULL, NUNCA cascade: si se borra un funnel, la tarea SOBREVIVE
-- (mismo criterio que sprint_id en tareas_sprint_v1.sql).
--
-- REQUIERE funnels_v1_aplanado.sql aplicado antes: el guard y el backfill se
-- apoyan en strategy_pages.client_id, que esa migracion agrega.
--
-- Aditiva e idempotente. Se aplica VIVA en Supabase (no en main).
-- Rollback al final.

-- ── 1. La columna ────────────────────────────────────────────────────────────

alter table public.tasks
  add column if not exists funnel_id text
    references public.strategy_pages(id) on delete set null;

create index if not exists tasks_funnel_id_idx
  on public.tasks(funnel_id) where funnel_id is not null;

comment on column public.tasks.funnel_id is
  'Funnel al que pertenece la tarea. NULL = tarea del cliente sin funnel (cobranza, seguimiento). El trigger garantiza que sea del mismo cliente que la tarea.';

-- ── 2. Guard: la tarea y el funnel SIEMPRE del mismo cliente ─────────────────
-- Cubre dos casos:
--   (a) la UI ofrece un funnel de otro cliente (no deberia, pero)
--   (b) la tarea se reasigna a otro cliente -> el funnel quedaria huerfano
--
-- Se ANULA EN SILENCIO en vez de tirar error, y esto es deliberado: dbSaveTask
-- (AppContext.jsx:303) es fire-and-forget -- manda el PATCH y no mira el
-- resultado. Un raise haria que la tarea "se revierta sola" en pantalla sin que
-- nadie sepa por que: exactamente el bug que el repo ya documento en
-- lastTaskWriteRef. Anular es la falla silenciosa correcta: el dato malo no
-- entra, y la UI (que filtra el selector por cliente) nunca deberia mandarlo.

create or replace function public.tasks_funnel_client_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.funnel_id is not null
     and (select client_id from public.strategy_pages where id = new.funnel_id)
         is distinct from new.client_id
  then
    new.funnel_id := null;
  end if;
  return new;
end
$$;

drop trigger if exists tasks_funnel_client_guard_trg on public.tasks;
create trigger tasks_funnel_client_guard_trg
  before insert or update of funnel_id, client_id on public.tasks
  for each row execute function public.tasks_funnel_client_guard();

-- ── 3. Backfill: SOLO las tareas ABIERTAS ────────────────────────────────────
-- De los 19 clientes que tienen un unico funnel, sus tareas se pueden asignar
-- solas. Pero se backfillean SOLO LAS ABIERTAS (257), no las 551 totales.
--
-- Por que dejar afuera las 294 cerradas: no toda tarea es de un funnel
-- ("cobrar la factura", "llamada de seguimiento"). Auto-asignarlas fabrica datos
-- falsos. En una tarea CERRADA ese error es ruido invisible que nadie va a
-- corregir nunca; en una ABIERTA se ve y se arregla la primera vez que alguien
-- la abre. Y el bloque de tareas del funnel es sobre trabajo vivo, no arqueologia.
-- (Decision de Matias, 2026-07-17.)
--
-- Las 81 abiertas de clientes multi-funnel quedan NULL: se eligen a mano en el
-- drawer. No se adivina.
-- Las 309 de los 5 clientes sin funnels quedan NULL para siempre. Es correcto.

with solo as (
  select client_id, min(id) as fid
    from public.strategy_pages
   where client_id is not null
   group by client_id
  having count(*) = 1
)
update public.tasks t
   set funnel_id = solo.fid
  from solo
 where solo.client_id = t.client_id
   and t.funnel_id is null
   and coalesce(t.status,'') <> 'done';

-- ── Verificacion (correr despues de aplicar) ─────────────────────────────────
-- select count(*) from public.tasks where funnel_id is not null;   -- esperado: 257
--
-- Ninguna tarea puede apuntar a un funnel de otro cliente (esperado: 0):
-- select count(*) from public.tasks t join public.strategy_pages p on p.id = t.funnel_id
--  where p.client_id is distinct from t.client_id;
--
-- Test del guard (esperado: funnel_id queda en null, sin error):
-- update public.tasks set funnel_id = '<id de funnel de OTRO cliente>' where id = '<una tarea>';

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- Ojo: revertir el backfill borra la asignacion a mano que se haya hecho despues.
-- Snapshotear antes si ya se uso:
--   create table tasks_funnel_bak as select id, funnel_id from public.tasks where funnel_id is not null;
--
-- drop trigger if exists tasks_funnel_client_guard_trg on public.tasks;
-- drop function if exists public.tasks_funnel_client_guard();
-- drop index if exists public.tasks_funnel_id_idx;
-- alter table public.tasks drop column if exists funnel_id;
