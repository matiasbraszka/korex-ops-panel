-- Banco de inspiraciones -> también Banco de GANADORES.
--
-- Hasta hoy el banco guardaba imágenes de referencia sueltas (para un futuro agente de
-- imágenes). Matías pidió poder cargar el ANUNCIO GANADOR real — imagen o video — con sus
-- métricas, el tiempo que estuvo activo, el copy y por qué ganó, para que el agente de
-- Anuncios lo use como referencia de oro (el equivalente de las fichas de Voomly del VSL).
--
-- El agente lee TEXTO, no mira el creativo: lo que lo entrena es `ad_copy` (el copy escrito o
-- la transcripción del video) + las métricas + el `notes` (por qué ganó). El archivo se guarda
-- igual, para que el equipo lo vea y para el futuro agente de imágenes.
--
-- Todo aditivo: no rompe nada de lo que ya carga el banco.

alter table public.marketing_inspirations
  add column if not exists es_ganador   boolean not null default false,
  add column if not exists ad_copy      text,      -- el copy del anuncio (escrito o transcripción del video)
  add column if not exists activo_desde date,       -- período en que corrió CON estas métricas
  add column if not exists activo_hasta date,
  add column if not exists metrics       jsonb not null default '{}'::jsonb;
  -- metrics = { cpl, hook_rate, retencion_seg, ctr, frecuencia, cpm } — todos opcionales, se
  -- cargan los que se tengan. Números crudos; la UI les pone el formato (%, US$, seg).

-- El agente busca ganadores por nicho: índice parcial solo sobre los ganadores vivos.
create index if not exists mkt_inspir_ganador_idx
  on public.marketing_inspirations (niche_slug)
  where es_ganador and deleted_at is null;

comment on column public.marketing_inspirations.es_ganador is
  'true = anuncio ganador cargado a mano (con métricas y copy); false = inspiración de referencia suelta.';
comment on column public.marketing_inspirations.ad_copy is
  'El copy del anuncio: texto escrito para imágenes, transcripción para videos. Es lo que lee el agente de Anuncios.';
comment on column public.marketing_inspirations.metrics is
  'Métricas del anuncio: cpl, hook_rate, retencion_seg, ctr, frecuencia, cpm. Opcionales.';
