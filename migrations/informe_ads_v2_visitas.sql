-- informe_ads_v2_visitas.sql
--
-- El informe diario de Meta Ads mostraba solo Gasto/Leads/CPL. Faltaban Visitas a la
-- pagina de destino (landing_page_view), y sin ese numero no se pueden calcular:
--   % de carga    = visitas / clicks   (de los que clickearon, cuantos cargaron la landing)
--   % de registro = leads   / visitas  (de los que cargaron, cuantos se registraron)
--
-- CTR, CPM y clicks YA estaban en la tabla (se guardaban sin mostrarse). Visitas no:
-- meta-ads-sync traia el array `actions` de Meta pero solo sacaba leads y video, nunca
-- el landing_page_view. Esta columna la agrega; la llena meta-ads-sync v22 en adelante.
--
-- Aditiva y reversible: columna nueva con default 0, no toca datos existentes. Las filas
-- viejas quedan en 0 hasta la proxima corrida de la sync (07:50 BUE).

alter table public.meta_ad_insights
  add column if not exists landing_page_views integer not null default 0;

comment on column public.meta_ad_insights.landing_page_views is
  'Visitas a la pagina de destino (action landing_page_view). Base de % de carga (visitas/clicks) y % de registro (leads/visitas). Lo llena meta-ads-sync v22+.';
