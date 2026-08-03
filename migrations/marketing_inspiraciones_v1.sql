-- migrations/marketing_inspiraciones_v1.sql
--
-- BANCO DE INSPIRACIONES — biblioteca de anuncios en IMAGEN.
--
-- Matías guarda anuncios que le gustan y hoy viven sueltos en su computadora. Esto los mete
-- en el panel (Marketing › Configuración de agentes › Banco de inspiraciones): se suben, se
-- ven en galería, se abren a pantalla completa, se descargan, y quedan ordenados por nicho.
--
-- NO está conectado a ningún agente. A propósito. Va en la configuración de agentes porque
-- a futuro va a alimentar un agente que genere creativos, pero hoy no se inyecta en ningún
-- prompt. Por eso NO reusamos marketing_ad_library: esa tabla ES el corpus que los agentes
-- leen, y meter las imágenes ahí las conectaría sin querer.
--
-- EL PEDIDO EXPLÍCITO FUE "que las imágenes estén seguras, que no se pierdan". Eso se
-- resuelve en tres capas, no con una convención de código:
--   1. Bucket PRIVADO con allowed_mime_types y file_size_limit (el navegador se puede
--      saltear, esto no).
--   2. Sin policy de UPDATE ni de DELETE sobre storage.objects: un archivo subido no se
--      puede pisar ni borrar desde la app. Nunca.
--   3. REVOKE DELETE sobre la tabla: aunque alguien escriba .delete() por error, Postgres
--      lo rechaza. El borrado del panel es lógico (deleted_at) y el archivo queda.
--
-- Aplicar UNA sola vez. Idempotente igual (create if not exists / on conflict).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Helper de slug
-- ─────────────────────────────────────────────────────────────────────────────
-- Sin unaccent (exige extensión). translate() es carácter a carácter, así que maneja bien
-- los acentos multibyte. La misma lógica está replicada en JS (inspiraciones.js › slugify)
-- para el alta de nichos desde el panel: si se toca una, tocar la otra.
--
-- OJO: las dos listas de translate() tienen que tener EXACTAMENTE la misma cantidad de
-- caracteres. Si la segunda es más corta, Postgres no falla: BORRA los sobrantes y corre
-- el resto un lugar, así que 'Ñ' terminaba saliendo como otra letra. 14 y 14.
create or replace function public.mkt_slug(txt text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select trim(both '-' from regexp_replace(
    lower(translate(coalesce(txt, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
    '[^a-z0-9]+', '-', 'g'));
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Catálogo de nichos
-- ─────────────────────────────────────────────────────────────────────────────
-- Tabla propia y no app_settings porque queremos FK real desde las imágenes: es lo que
-- garantiza que no exista una imagen apuntando a un nicho que no está.
create table if not exists public.marketing_niches (
  slug       text primary key,                    -- 'salud', 'crypto'
  label      text not null,                       -- 'Salud'  (lo que ve Matías)
  tags       text[] not null default '{}',        -- sinónimos: pescan los nichos mal cargados
  color      text,                                -- color del chip en la galería
  sort       int not null default 100,
  active     boolean not null default true,       -- baja lógica: nunca se borra un nicho
  created_at timestamptz not null default now()
);

comment on table public.marketing_niches is
  'Catálogo de nichos del banco de inspiraciones. Sembrado desde las fichas de branding '
  '(marketing_ad_library part=branding_nicho) + los nichos vivos de clients.niche. '
  'Se amplía desde el panel; la baja es active=false, nunca delete.';

-- Semilla paso 1: los canónicos, copiados de las fichas de branding VIVAS en la base
-- (marketing_ad_library where part='branding_nicho'). Los tags vienen de ahí porque ya
-- fueron escritos para el problema real: hay clientes con niche='zinzino' o 'bitradex',
-- que son el nombre de la empresa y no el rubro.
insert into public.marketing_niches (slug, label, tags, color, sort) values
  ('general',     'General',              array['general','network marketing','mlm','multinivel','negocio','emprendimiento','liderazgo'], '#6B7280', 0),
  ('salud',       'Salud',                array['salud','health','medicina','wellness','suplementos','superpatch','parches','dolor','energia'], '#1B5E4A', 1),
  ('bienestar',   'Bienestar',            array['bienestar','wellbeing','vitalhealth','estilo de vida','habitos','balance','longevidad','zinzino'], '#4F7A6B', 2),
  ('nutricion',   'Nutrición',            array['nutricion','nutrition','nutrivida','alimentacion','dieta','peso','farmasi','vida divina'], '#2F6B3C', 3),
  ('finanzas',    'Finanzas',             array['finanzas','financiero','jifu','educacion financiera','libertad financiera','ingresos','dinero'], '#1E3A6E', 4),
  ('inversiones', 'Inversiones',          array['inversiones','inversion','trading','forex'], '#2FA8C4', 5),
  ('seguros',     'Seguros',              array['seguros','seguro','seguros de vida','insur','proteccion','patrimonio','prevision'], '#14355E', 6),
  ('viajes',      'Viajes',               array['viajes','turismo','incruises','cruceros','travel','vacaciones','experiencias'], '#0F3F5C', 7),
  ('belleza',     'Belleza y cosmética',  array['belleza','beauty','cosmetica','skincare','riman','piel','maquillaje','estetica'], '#B08968', 8),
  ('crypto',      'Cripto',               array['crypto','cripto','blockchain','bitcoin','web3','exchange','token','defi','bitradex','aitech'], '#7C3AED', 9)
on conflict (slug) do nothing;

-- Semilla paso 2: cualquier nicho vivo de un cliente que NO esté cubierto ni por slug ni
-- por tag. Hoy no devuelve ninguno (los 11 valores de clients.niche entran en los 10 de
-- arriba); queda para que el catálogo no se atrase solo cuando entre un cliente de un rubro
-- nuevo. distinct on evita que dos escrituras distintas del mismo nicho choquen entre sí.
insert into public.marketing_niches (slug, label, tags, sort)
select distinct on (public.mkt_slug(c.niche))
       public.mkt_slug(c.niche),
       initcap(trim(c.niche)),
       array[lower(trim(c.niche))],
       200
  from public.clients c
 where coalesce(trim(c.niche), '') <> ''
   and public.mkt_slug(c.niche) <> ''
   and not exists (
     select 1 from public.marketing_niches n
      where n.slug = public.mkt_slug(c.niche)
         or lower(trim(c.niche)) = any(n.tags))
on conflict (slug) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. El banco
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.marketing_inspirations (
  id           text primary key default 'insp_' || replace(gen_random_uuid()::text, '-', ''),

  -- El archivo. El bucket es privado, así que NO hay public_url: la URL se firma al vuelo.
  storage_path text not null unique,
  mime_type    text not null,
  size_bytes   bigint,
  width        int,
  height       int,
  checksum     text,   -- sha-256 hex. Sirve para avisar "esta ya está". Sin constraint:
                       -- bloquearlo por SQL impediría subir a propósito una variante.

  -- Clasificación
  niche_slug   text references public.marketing_niches(slug)
                 on update cascade on delete restrict,
  title        text not null default 'Sin título',
  notes        text,                              -- "por qué me gusta": lo que va a leer el
                                                  -- agente de imágenes cuando exista
  tags         text[] not null default '{}',      -- testimonio, antes-despues, texto-grande…
  starred      boolean not null default false,

  -- Procedencia
  source       text,                              -- meta_ad_library | competencia | propio…
  source_url   text,
  client_id    text references public.clients(id) on delete set null,
  brand        text,                              -- marca/anunciante si no es cliente nuestro

  meta         jsonb not null default '{}',       -- escotilla: cuando el agente GENERE
                                                  -- imágenes acá van prompt/modelo/seed

  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,                       -- baja lógica: el archivo se conserva
  deleted_by   text
);

comment on table public.marketing_inspirations is
  'Banco de inspiraciones: anuncios en imagen que el equipo guarda como referencia. '
  'Un nicho por imagen (niche_slug); los matices van en tags. Borrado SIEMPRE lógico '
  '(deleted_at): el DELETE está revocado a authenticated a propósito.';

-- Índices. Los dos primeros son parciales sobre deleted_at is null porque TODA consulta
-- del panel filtra así.
create index if not exists mi_created_idx  on public.marketing_inspirations (created_at desc, id desc) where deleted_at is null;
create index if not exists mi_niche_idx    on public.marketing_inspirations (niche_slug, created_at desc, id desc) where deleted_at is null;
create index if not exists mi_checksum_idx on public.marketing_inspirations (checksum) where deleted_at is null;
create index if not exists mi_tags_idx     on public.marketing_inspirations using gin (tags);
create index if not exists mi_client_idx   on public.marketing_inspirations (client_id);

-- updated_at al día sin que el front se acuerde de mandarlo.
create or replace function public.mi_touch_updated()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mi_touch_updated_trg on public.marketing_inspirations;
create trigger mi_touch_updated_trg
  before update on public.marketing_inspirations
  for each row execute function public.mi_touch_updated();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Permisos
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.marketing_niches       enable row level security;
alter table public.marketing_inspirations enable row level security;

-- has_permission va envuelto en (select ...) para que Postgres lo evalúe UNA vez por
-- consulta y no una vez por fila. Sin eso, el advisor auth_rls_initplan lo marca y una
-- galería de 500 filas paga el chequeo 500 veces (ver perf_v5_rls_initplan_110_politicas).
-- INSERT y UPDATE por separado en vez de un `for all`: `for all` también cubre el SELECT,
-- así que cada lectura evaluaría has_permission DOS veces (el advisor lo marca como
-- multiple_permissive_policies). Y el DELETE no necesita policy porque está revocado.
drop policy if exists mn_read   on public.marketing_niches;
drop policy if exists mn_write  on public.marketing_niches;
drop policy if exists mn_insert on public.marketing_niches;
drop policy if exists mn_update on public.marketing_niches;
create policy mn_read on public.marketing_niches for select to authenticated
  using ((select public.has_permission('marketing', '*', 'read')));
create policy mn_insert on public.marketing_niches for insert to authenticated
  with check ((select public.has_permission('marketing', '*', 'write')));
create policy mn_update on public.marketing_niches for update to authenticated
  using ((select public.has_permission('marketing', '*', 'write')))
  with check ((select public.has_permission('marketing', '*', 'write')));

drop policy if exists mi_read   on public.marketing_inspirations;
drop policy if exists mi_write  on public.marketing_inspirations;
drop policy if exists mi_insert on public.marketing_inspirations;
drop policy if exists mi_update on public.marketing_inspirations;
create policy mi_read on public.marketing_inspirations for select to authenticated
  using ((select public.has_permission('marketing', '*', 'read')));
create policy mi_insert on public.marketing_inspirations for insert to authenticated
  with check ((select public.has_permission('marketing', '*', 'write')));
create policy mi_update on public.marketing_inspirations for update to authenticated
  using ((select public.has_permission('marketing', '*', 'write')))
  with check ((select public.has_permission('marketing', '*', 'write')));

-- El candado de "que no se pierdan". Los grants son más fuertes que las policies: aunque
-- el día de mañana alguien escriba .delete() en el front, Postgres lo rechaza. El borrado
-- real solo existe con service_role.
revoke all on public.marketing_inspirations from anon;
revoke all on public.marketing_niches       from anon;
grant select, insert, update on public.marketing_inspirations to authenticated;
grant select, insert, update on public.marketing_niches       to authenticated;
revoke delete on public.marketing_inspirations from authenticated;
revoke delete on public.marketing_niches       from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. El bucket
-- ─────────────────────────────────────────────────────────────────────────────
-- Privado: las miniaturas se sirven con URL firmada. allowed_mime_types y file_size_limit
-- son la validación REAL (la del navegador se puede saltear con la consola).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing-inspiraciones', 'marketing-inspiraciones', false, 15728640,
        array['image/png','image/jpeg','image/jpg','image/webp','image/gif'])
on conflict (id) do update
   set public             = false,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists mkt_insp_read   on storage.objects;
drop policy if exists mkt_insp_insert on storage.objects;
create policy mkt_insp_read on storage.objects for select to authenticated
  using (bucket_id = 'marketing-inspiraciones' and (select public.has_permission('marketing', '*', 'read')));
create policy mkt_insp_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'marketing-inspiraciones' and (select public.has_permission('marketing', '*', 'write')));
-- A propósito NO hay policy de UPDATE ni de DELETE para este bucket: un archivo subido no
-- se puede pisar ni borrar desde la app.

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoría de huérfanos (archivo en Storage sin fila en la tabla).
-- Como revocamos el DELETE, los huérfanos no se limpian solos: son unos KB invisibles.
-- Correr con service_role si alguna vez hace falta auditar:
--
--   select o.name, o.created_at
--     from storage.objects o
--    where o.bucket_id = 'marketing-inspiraciones'
--      and not exists (select 1 from public.marketing_inspirations i
--                       where i.storage_path = o.name);
--
-- ROLLBACK (solo si hay que dar marcha atrás antes de que se cargue nada):
--   drop table if exists public.marketing_inspirations;
--   drop table if exists public.marketing_niches;
--   drop function if exists public.mi_touch_updated();
--   drop function if exists public.mkt_slug(text);
--   drop policy if exists mkt_insp_read on storage.objects;
--   drop policy if exists mkt_insp_insert on storage.objects;
--   delete from storage.buckets where id = 'marketing-inspiraciones';
-- ─────────────────────────────────────────────────────────────────────────────
