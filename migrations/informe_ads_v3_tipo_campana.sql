-- informe_ads_v3_tipo_campana
-- Separa los leads de FORMULARIO de Meta (campañas de "clientes potenciales", que se
-- completan dentro de la app y NO generan visitas a una landing) de los leads de PÁGINA
-- WEB (el evento de conversión del píxel en la landing del cliente).
--
-- Por qué: mezclarlos rompe las métricas. Antonio De la Cruz corre los dos tipos y el
-- informe le mostraba "% registro 121,4%" — un número sin sentido, porque dividía los
-- leads de ambas campañas por las visitas de una sola. Separados da 64,3%, que es real.
--
-- La señal viene de los propios `actions` que el sync ya trae de Meta, sin llamadas extra:
--   formulario -> action_type `onsite_conversion.lead_grouped` / `leadgen_grouped`
--   web        -> evento custom del píxel, o `landing_page_view` > 0
-- Un anuncio sin leads ni visitas no tiene evidencia y hereda el tipo de su campaña; si la
-- campaña entera está sin evidencia, queda en NULL (se informa como "sin clasificar").

alter table meta_ad_insights
  add column if not exists leads_form    integer not null default 0,
  add column if not exists leads_web     integer not null default 0,
  add column if not exists campaign_type text;

comment on column meta_ad_insights.leads_form is
  'Leads del formulario nativo de Meta (clientes potenciales). No generan landing_page_views.';
comment on column meta_ad_insights.leads_web is
  'Leads de la landing del cliente (evento de conversión del píxel).';
comment on column meta_ad_insights.campaign_type is
  'formulario | web | NULL (sin evidencia para clasificar ese día).';

-- El informe agrupa por (cliente, tipo) sobre la última foto.
create index if not exists meta_ad_insights_tipo_idx
  on meta_ad_insights (snapshot_date, time_window, campaign_type);
