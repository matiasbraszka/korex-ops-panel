-- migrations/funnels_v1_aplanado.sql
--
-- EL FUNNEL ES LA UNIDAD. Se jubila el concepto de "estrategia" en la interfaz.
--
-- Por qué: de 40 estrategias, 26 de 33 clientes tienen UNA sola -> la capa no
-- agrupa nada. Y sus nombres guardan un solo bit: son literalmente
-- "Reclutamiento" (32 funnels) o "Producto" (11), mas a veces una fecha que ya
-- vive en strategies.start_date. Solo 3 llevan algo propio ("Diabetes",
-- "Marca Personal", "[A DEFINIR]") y las 3 tienen un unico funnel: se pasan a
-- mano al nombre del funnel. Por eso NO se agrega una columna "campaign":
-- no hay campañas que guardar.
--
-- Lo que NO se hace, y es deliberado: la tabla `strategies` NO se toca y
-- `strategy_id` NO se borra. Esa columna nunca fue "una estrategia": es el
-- PUNTERO A LA CARPETA DEL DRIVE. drive-sync la deriva del nombre de la carpeta
-- ("Estrategia #N | Tipo | fecha") y propaga strategy_id a ~8.100 nodos de
-- client_drive_nodes; ademas de ella cuelgan los 36 DEL de client_brain_docs.
-- Borrarla seria catastrofico por dos motivos:
--   1. strategy_pages.strategy_id es ON DELETE CASCADE -> borrar una estrategia
--      BORRA SUS FUNNELS (con avatares, guiones y copys adentro).
--   2. drive-sync la recrearia vacia en el sync de las 06:00 -> quedaria la
--      carpeta sin el trabajo.
-- Asi que se jubila el CONCEPTO en la UI, no el ancla del Drive.
--
-- Lo unico que se muda al funnel es lo que el equipo mira: de que cliente es,
-- y si es de reclutamiento o de producto.
--
-- Aditiva, idempotente y NULLABLE. Se aplica VIVA en Supabase (no en main).
-- Es INERTE: ningun codigo lee estas columnas todavia. El front las empieza a
-- usar recien en U5a.
--
-- Rollback al final del archivo.

-- ── 1. Las dos columnas ──────────────────────────────────────────────────────

alter table public.strategy_pages
  add column if not exists client_id text references public.clients(id) on delete cascade,
  add column if not exists tipo text check (tipo in ('reclutamiento','producto'));

create index if not exists strategy_pages_client_id_idx on public.strategy_pages(client_id);

comment on column public.strategy_pages.client_id is
  'De que cliente es el funnel. DERIVADO de strategies.client_id por trigger: no se escribe a mano.';
comment on column public.strategy_pages.tipo is
  'reclutamiento | producto. Reemplaza la regex sobre strategies.name. NULL = falta definirlo (se elige en el panel).';

-- ── 2. client_id es DERIVADO, no una segunda fuente de verdad ────────────────
-- Se calcula desde strategies.client_id, asi que no puede divergir: nadie lo
-- escribe. Esto es lo que permite validar en la DB que una tarea y su funnel
-- sean del mismo cliente (ver tareas_sprint_v9_funnel_id.sql).

create or replace function public.strategy_pages_fill_client_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.client_id := (select client_id from public.strategies where id = new.strategy_id);
  return new;
end
$$;

drop trigger if exists strategy_pages_fill_client_id_trg on public.strategy_pages;
create trigger strategy_pages_fill_client_id_trg
  before insert or update of strategy_id on public.strategy_pages
  for each row execute function public.strategy_pages_fill_client_id();

-- ── 3. Backfill de client_id (47 filas) ──────────────────────────────────────

update public.strategy_pages p
   set client_id = s.client_id
  from public.strategies s
 where s.id = p.strategy_id
   and p.client_id is null;

-- ── 4. Backfill de tipo ──────────────────────────────────────────────────────
-- El nombre del FUNNEL gana sobre el de la estrategia, y eso ARREGLA UN BUG REAL:
-- los funnels "Producto sin pre-landing" y "Producto V2 Con pre-landing" (cliente
-- Jose Luis Rivas) cuelgan de una estrategia llamada "Reclutamiento", asi que la
-- regex vieja (s.name ~* 'reclutamiento|producto', que sigue viva en
-- cerebro_pipeline_status hasta U4) los etiqueta RECLUTAMIENTO. Estan mal hoy.
--
-- \m y \M son limites de palabra: evitan que "reproducto" o similares matcheen.

update public.strategy_pages p
   set tipo = case
     when p.name ~* '\mproducto\M'      then 'producto'
     when p.name ~* '\mreclutamiento\M' then 'reclutamiento'
     when s.name ~* '\mproducto\M'      then 'producto'
     when s.name ~* '\mreclutamiento\M' then 'reclutamiento'
   end
  from public.strategies s
 where s.id = p.strategy_id
   and p.tipo is null;

-- Lo que quede NULL (2 funnels: los de las estrategias "Diabetes" y "[A DEFINIR]")
-- se define A MANO en el panel. Es correcto que se vea "falta definir el tipo":
-- es informacion que hoy no existe, y la regex tampoco la tenia.

-- ── Verificacion (correr despues de aplicar) ─────────────────────────────────
-- select tipo, count(*) from public.strategy_pages group by 1 order by 2 desc;
--   esperado: reclutamiento ~32 | producto ~13 | null 2
--   (producto sube de 11 a 13: son los 2 de Jose Luis Rivas que estaban mal)
--
-- select count(*) from public.strategy_pages where client_id is null;  -- esperado: 0
--
-- Los 2 que cambian de etiqueta:
-- select p.name as funnel, s.name as carpeta_drive, p.tipo
--   from public.strategy_pages p join public.strategies s on s.id = p.strategy_id
--  where p.name ~* '\mproducto\M' and s.name ~* '\mreclutamiento\M';

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- drop trigger if exists strategy_pages_fill_client_id_trg on public.strategy_pages;
-- drop function if exists public.strategy_pages_fill_client_id();
-- drop index if exists public.strategy_pages_client_id_idx;
-- alter table public.strategy_pages drop column if exists client_id;
-- alter table public.strategy_pages drop column if exists tipo;
