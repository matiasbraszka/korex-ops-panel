-- migrations/branding_v1.sql
--
-- GENERAR BRANDING CON IA. Pedido de Matías (2026-07-31): un botón dentro de la carpeta
-- Branding de Recursos que, de una, deje cargado el branding del cliente: los logos
-- (PNG con fondo transparente, en 3 versiones cada uno — color, negro y blanco) y 3
-- paletas de colores. El equipo borra lo que no le gusta y se queda con lo bueno.
--
-- Todo lo generado va a la tabla que ya existe (funnel_resources, bucket_key 'branding',
-- strategy_id null = nivel cliente). Acá sólo se agrega lo que falta para eso:
--
--   1. funnel_resources.meta  -> QUÉ es cada archivo generado. El campo clave es group_id:
--      agrupa las 3 versiones de un mismo logo, para que borrar una las borre a las tres
--      (si no, borrar un logo son 3 confirmaciones y nadie lo hace).
--
--   2. client_branding_runs   -> QUÉ se INTENTÓ en cada corrida. Hace falta una tabla
--      aparte porque al borrar un recurso su fila desaparece, y con ella se pierde la
--      señal "esto no les gustó". Cruzando lo intentado (acá) contra lo que sigue vivo
--      (funnel_resources.meta.group_id) sale qué conservaron y qué descartaron, que es
--      lo que hace que el botón de regenerar proponga algo distinto en vez de lo mismo.
--
-- Es una migración puramente ADITIVA: una columna nueva que hoy nadie lee, una tabla
-- nueva, una fila de config y dos claves dentro de un jsonb. No toca nada existente.

-- ── 1) Metadato de los recursos generados ────────────────────────────────────
alter table public.funnel_resources add column if not exists meta jsonb;

comment on column public.funnel_resources.meta is
  'Metadato del recurso. En los generados por IA: {gen:"branding", run_id, kind:"logo"|"palette", group_id, variant, idx, concepto, style_tags, hex, colors, ...}. group_id agrupa las 3 versiones de un mismo logo: se borran juntas.';

-- Índices parciales: sólo indexan las filas generadas, que son una minoría del total.
create index if not exists funnel_resources_meta_gen_idx
  on public.funnel_resources ((meta->>'gen')) where meta is not null;
create index if not exists funnel_resources_meta_group_idx
  on public.funnel_resources ((meta->>'group_id')) where meta is not null;

-- ── 2) Corridas de generación ────────────────────────────────────────────────
create table if not exists public.client_branding_runs (
  id           text primary key default 'brun_' || replace(gen_random_uuid()::text, '-', ''),
  client_id    text not null references public.clients(id) on delete cascade,
  modo         text not null default 'nuevo',      -- nuevo | variar | otra_direccion
  n_logos      int  not null default 1,            -- 1 = modo prueba (no gastar de más)
  quality      text not null default 'medium',     -- low | medium | high (calidad de imagen)
  modo_marca   text,                               -- persona | equipo (lo decide la IA)
  nombre_marca text,                               -- el texto exacto que puede ir en el logo
  plan         jsonb not null default '{}'::jsonb, -- salida completa de la IA + rendered[]
  style_ref    text,                               -- id de la ficha de nicho que se usó
  status       text not null default 'planned',    -- planned | rendering | done | error
  error        text,
  cost_usd     numeric not null default 0,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists cbr_client_idx on public.client_branding_runs (client_id, created_at desc);

alter table public.client_branding_runs enable row level security;
do $$ begin
  create policy cbr_rw on public.client_branding_runs for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
revoke all on public.client_branding_runs from anon;
grant select, insert, update, delete on public.client_branding_runs to authenticated;

-- ── 3) Clave de OpenAI (se crea vacía a propósito) ───────────────────────────
-- El valor lo carga Matías aparte, nunca en un .sql que va al repo. Mismo lugar donde
-- ya vive anthropic_api_key, así la edge function las lee igual (no por Deno.env).
insert into public.secure_config (key, value) values ('openai_api_key', '')
  on conflict (key) do nothing;

-- ── 4) Config de costos ──────────────────────────────────────────────────────
-- image_prices: USD por imagen de 1024x1024 en gpt-image-1. El respaldo del código usa
-- el precio ALTO cuando falta la clave: sobreestimar sólo hace que el freno de gasto
-- salte antes, que es el lado seguro.
--
-- branding_daily_cap_usd: tope propio del branding. El tope diario global (daily_cap_usd)
-- lo comparten Anuncios, VSL, Funnels y Descubrimiento; sin un tope propio, unas cuantas
-- regeneraciones en calidad alta se comen el presupuesto de todos los demás agentes.
update public.app_settings
   set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
        'image_prices', jsonb_build_object(
          'gpt-image-1', jsonb_build_object('low', 0.011, 'medium', 0.042, 'high', 0.167)),
        'branding_daily_cap_usd', 2)
 where key = 'api_config';

notify pgrst, 'reload schema';

-- Rollback:
--   drop table if exists public.client_branding_runs;
--   alter table public.funnel_resources drop column if exists meta;
--   delete from public.secure_config where key = 'openai_api_key';
--   update public.app_settings set value = (value - 'image_prices' - 'branding_daily_cap_usd')
--    where key = 'api_config';
