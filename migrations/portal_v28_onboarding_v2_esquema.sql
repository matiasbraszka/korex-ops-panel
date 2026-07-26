-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v28_onboarding_v2_esquema.sql
--
-- Esquema para el onboarding v2 (el que rehizo Matías, entregado como
-- onboarding-korex-standalone.html). Todo aditivo: ni una columna se borra ni
-- se renombra, así que el onboarding v1 que está en prod sigue funcionando
-- mientras se siembra el nuevo catálogo en v29.
--
-- Tres cambios de fondo respecto de v1:
--
--   1. Aparece un nivel arriba de la sección: el BLOQUE. El v1 tenía tramos
--      sueltos; el v2 los agrupa en 4 bloques y es el bloque —no el tramo— el
--      que desbloquea pestañas del portal. Tabla nueva `onboarding_bloques`.
--
--   2. La sección pasa a ser un PASO (23 de ellos) con identidad visual propia:
--      badge ('00', '4A', '21' — no es un número, es una etiqueta), eyebrow,
--      icono y la frase de "Para qué sirve" de la portada.
--
--   3. Las pantallas dejan de deducirse. En v1 `pantallasDe()` agrupaba por
--      `grupo` con heurísticas (min_chars >= 800 va sola, subida va sola…), y
--      eso hacía que mover una pregunta cambiara el agrupamiento de otra sin
--      que nadie lo pidiera. Ahora hay una columna `pantalla` explícita: dos
--      preguntas con el mismo (skey, pantalla) comparten pantalla y punto.
--
-- Sobre `largo_objetivo` vs `min_chars`: en v1 `min_chars` era el MÍNIMO para
-- que la respuesta contara. En el HTML el número es el OBJETIVO y el mínimo es
-- el 60% de ese objetivo. Meter los dos sentidos en la misma columna es la
-- clase de ambigüedad que en tres meses nadie recuerda, así que entra una
-- columna nueva y `min_chars` queda muerta (v29 la siembra en 0). El 60% vive
-- en un solo helper, no en la tabla.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1 · Bloques ──────────────────────────────────────────────────────────────
create table if not exists public.onboarding_bloques (
  bkey        text primary key,
  orden       int  not null default 0,
  nombre      text not null,                      -- 'Bloque 2 · Estrategia'
  corto       text not null default '',           -- 'Estrategia' (sidebar, badge)
  titulo      text not null default '',           -- el remate: 'Con esto ya podemos escribir tu VSL'
  descripcion text not null default '',
  desbloquea  text[] not null default '{}',       -- rutas del portal: {/guiones,/embudos}
  activa      boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

alter table public.onboarding_bloques enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'onboarding_bloques'
       and policyname = 'onboarding_bloques_team'
  ) then
    create policy onboarding_bloques_team on public.onboarding_bloques
      for all to authenticated
      using (public.is_team_member()) with check (public.is_team_member());
  end if;
end $$;

grant select, insert, update, delete on public.onboarding_bloques to authenticated;

-- ── 2 · La sección pasa a ser un paso ────────────────────────────────────────
alter table public.onboarding_sections
  add column if not exists bkey              text,
  add column if not exists badge             text not null default '',
  add column if not exists eyebrow           text not null default '',
  add column if not exists para_que          text not null default '',
  add column if not exists icono             text not null default '',
  add column if not exists una_por_pantalla  boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'onboarding_sections_bkey_fk'
  ) then
    alter table public.onboarding_sections
      add constraint onboarding_sections_bkey_fk
      foreign key (bkey) references public.onboarding_bloques(bkey)
      on update cascade on delete set null;
  end if;
end $$;

-- ── 3 · Preguntas ────────────────────────────────────────────────────────────
alter table public.onboarding_questions
  -- agrupamiento explícito en pantallas (reemplaza a `grupo` + heurísticas)
  add column if not exists pantalla          int  not null default 0,
  -- separador con título dentro de una pantalla ('Avatar del producto')
  add column if not exists cabecera          text not null default '',
  add column if not exists cabecera_sub      text not null default '',
  -- qtype = 'info': tarjeta oscura, no es un campo, no se responde
  add column if not exists info_kicker       text not null default '',
  add column if not exists info_titulo       text not null default '',
  add column if not exists info_cuerpo       text not null default '',
  -- el largo que PEDIMOS. El mínimo para contar es round(0.6 * largo_objetivo)
  add column if not exists largo_objetivo    int  not null default 0,
  -- tope de selección para chips_multi (el paquete de branding es max 1)
  add column if not exists max_opciones      int,
  add column if not exists input_mode        text not null default '',
  add column if not exists min_altura        int,
  -- textos del dropzone
  add column if not exists archivo_cta       text not null default '',
  add column if not exists archivo_hint      text not null default '',
  add column if not exists archivo_accept    text not null default '',
  add column if not exists archivo_multiple  boolean not null default true,
  -- agenda: true = solo día, sin horario (la fecha de grabación)
  add column if not exists solo_dia          boolean not null default false;

comment on column public.onboarding_questions.min_chars is
  'MUERTA desde v28. El largo pedido vive en largo_objetivo y el mínimo es el 60% de ese valor, calculado en _onboarding_lleno() y en progreso.js.';

comment on column public.onboarding_questions.grupo is
  'MUERTA desde v28. El agrupamiento en pantallas es explícito: columna pantalla.';

comment on column public.onboarding_questions.qtype is
  'abierta | corta | numero | money | fecha | url | email | telefono | color | opciones | chips_multi | si_no | subida | confirmar | info | presupuesto | agenda | resumen | archivos';

create index if not exists onboarding_questions_pantalla_idx
  on public.onboarding_questions (skey, pantalla, orden) where activa;

-- ── 4 · Runs ─────────────────────────────────────────────────────────────────
-- La cola de sincronización del documento. Un trigger marca `texto_dirty_at`
-- en cada respuesta (una columna, barato) y el cron de v31 sincroniza los runs
-- donde dirty > sync. Sin la cola habría que reescribir un documento de ~40 KB
-- 119 veces por cliente.
alter table public.onboarding_runs
  add column if not exists texto_dirty_at   timestamptz,
  add column if not exists texto_sync_at    timestamptz,
  -- paso 20: fecha firme de grabación (solo día, sin reserva de calendario)
  add column if not exists grabacion_fecha  date;

create index if not exists onboarding_runs_texto_dirty_idx
  on public.onboarding_runs (texto_dirty_at)
  where texto_dirty_at is not null and estado <> 'completado';

commit;

notify pgrst, 'reload schema';
