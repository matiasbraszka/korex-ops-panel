-- migrations/funnel_resources_v5_destacadas.sql
--
-- "Destacadas": las que el EQUIPO quiere ver primero en una carpeta.
--
-- Ya existe `favorita`, pero es otra cosa y no se puede reusar: la elige el CLIENTE
-- desde su portal, es EXCLUYENTE (una sola por client_id + bucket_key, ver
-- portal_v19_fotos_favorita_testimonios.sql:35-52) y solo se ofrece en el pedido de
-- fotos de autoridad. Si el equipo marcara ahí, le pisaría la elección al cliente.
--
-- Por eso una columna aparte, que admite varias por carpeta y no le toca nada al
-- portal. En la carpeta el orden pasa a ser: destacadas → favorita del cliente →
-- por título.
--
-- ADITIVA e INERTE: default false, nadie la lee hasta que el panel la muestre.

alter table public.funnel_resources
  add column if not exists destacada boolean not null default false;

comment on column public.funnel_resources.destacada is
  'La marcó el EQUIPO para que aparezca primero en la carpeta. Admite varias. '
  'Distinta de `favorita`, que es la única que elige el CLIENTE desde su portal.';

-- Índice parcial: solo indexa las marcadas, que son pocas.
create index if not exists funnel_resources_destacada_idx
  on public.funnel_resources (client_id, bucket_key)
  where destacada;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   select count(*) filter (where destacada) as destacadas,
--          count(*) filter (where favorita)  as favoritas_del_cliente
--     from public.funnel_resources;
--
-- ROLLBACK:
--   drop index if exists public.funnel_resources_destacada_idx;
--   alter table public.funnel_resources drop column if exists destacada;
