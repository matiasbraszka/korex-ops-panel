-- migrations/agenda_v9_cache_freebusy.sql
--
-- La página pública de reserva tardaba entre 3 y 11 segundos en mostrar horarios.
-- Medido sobre los logs de la edge function `agenda-publica` (7 días):
--     mediana 2.835 ms · p75 4.799 ms · p90 10.688 ms · máximo 10.688 ms
--
-- El tiempo no es nuestro: para saber qué horas están ocupadas hay que preguntarle
-- a los Google Calendars del equipo, y eso pasa por un Apps Script externo
-- (callCalendarScript, timeout de 60 s). Apps Script arranca frío y tarda lo que tarda.
-- Todo lo demás de la función corre en ~200 ms.
--
-- Esta tabla guarda la respuesta de esa consulta para no repetirla en cada visita:
--   · menos de 10 min  → se usa tal cual (instantáneo)
--   · entre 10 min y 6 h → se devuelve YA y se refresca por atrás (el visitante no espera)
--   · más de 6 h        → se consulta de nuevo y se espera
--
-- Reservar NUNCA usa la caché: agenda-publica revalida el hueco con datos frescos
-- antes de crear el evento, así que un horario que se ocupó en el medio se rechaza
-- al confirmar en vez de agendarse encima.
--
-- Solo la escribe la edge function (service role). Ni anon ni authenticated la ven:
-- adentro hay la agenda ocupada del equipo.

create table if not exists public.booking_freebusy_cache (
  cache_key  text primary key,           -- emails del equipo + rango del mes
  busy       jsonb not null,             -- [{s,e}] en epoch ms
  fetched_at timestamptz not null default now()
);

comment on table public.booking_freebusy_cache is
  'Caché de la consulta de ocupación a Google Calendar (agenda-publica). Descartable: borrarla solo hace que la próxima visita tarde lo de antes.';

alter table public.booking_freebusy_cache enable row level security;
revoke all on public.booking_freebusy_cache from anon, authenticated;

-- Las filas viejas no molestan (son unas pocas por calendario y mes) pero tampoco
-- sirven: el mes que ya pasó no se vuelve a consultar.
create index if not exists booking_freebusy_cache_fetched_idx
  on public.booking_freebusy_cache (fetched_at);

notify pgrst, 'reload schema';

-- ROLLBACK: drop table if exists public.booking_freebusy_cache;
--   (la función vuelve sola a consultar Google en cada visita)
