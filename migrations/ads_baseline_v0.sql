-- ============================================================================
-- BASELINE DOCUMENTAL — NO APLICAR. (Motor de métricas, PR0 — 2026-07-28)
-- Fotografía del esquema REAL en producción de las tablas de métricas de ads
-- que existían sin DDL versionado. Sirve de referencia histórica; el motor
-- nuevo se define en ads_engine_v1.sql.
-- ============================================================================

-- meta_ad_insights — escrita por la edge fn meta-ads-sync (nivel anuncio).
-- OJO: no tiene fecha real del dato, solo snapshot_date + time_window.
-- create table meta_ad_insights (
--   id bigint not null,
--   client_id text, ad_account_id text,
--   campaign_name text, adset_name text,
--   ad_id text not null, ad_name text, creative_id text, video_id text,
--   thumbnail_url text, permalink text,
--   time_window text not null, snapshot_date date not null,
--   spend numeric, impressions bigint, reach bigint, frequency numeric,
--   clicks bigint, inline_link_clicks bigint, ctr numeric, cpl numeric, leads bigint,
--   video_3s bigint, thruplay bigint, video_avg_time_watched numeric, video_duration numeric,
--   hook_rate numeric, hold_rate numeric, retention jsonb, score numeric,
--   transcript jsonb, is_winner boolean not null, won_at timestamptz,
--   synced_at timestamptz not null, cpm numeric, engagement bigint, engagement_rate numeric,
--   effective_status text, issues text, country text
-- );  -- unique (ad_id, time_window, snapshot_date)

-- fbcrm_spend_daily — escrita por fbcrm-cpl-daily (rollup cuenta×día).
-- Modelo correcto de serie diaria (date real), pero FX invertido hasta PR1.
-- create table fbcrm_spend_daily (
--   id uuid not null, date date not null,
--   ad_account_id text not null, ad_account_name text, client_name text, currency text,
--   spend_native numeric, spend_usd numeric, spend_usd_taxed numeric,
--   impressions bigint, clicks bigint, leads_count integer, cpl_usd numeric,
--   created_at timestamptz not null, updated_at timestamptz not null
-- );

-- fbcrm_spend_form_daily — ídem, por formulario de leads.
-- create table fbcrm_spend_form_daily (
--   id uuid not null, date date not null, ad_account_id text not null,
--   client_name text, form_id text not null, form_name text, currency text,
--   spend_native numeric, spend_usd numeric, spend_usd_taxed numeric,
--   impressions bigint, clicks bigint, leads_count integer, cpl_usd numeric,
--   created_at timestamptz, updated_at timestamptz
-- );

-- fbcrm_pages — SEGUNDO registro de cuentas (por client_name string, no client_id).
-- Solo 2 de 18 filas tienen ad_account_id. Se consolida en ads_accounts (PR2).
-- create table fbcrm_pages (
--   id uuid not null, page_id text not null, page_name text,
--   client_name text, ad_account_id text, currency text,
--   page_access_token text, active boolean not null, created_at timestamptz not null
-- );

-- api_usage — bitácora genérica; meta-ads-sync deja ahí meta.errors por corrida.
-- create table api_usage (
--   id bigint not null, created_at timestamptz not null, fn text not null,
--   model text not null, input_tokens int not null, output_tokens int not null,
--   cost_usd numeric not null, client_id text, funnel_id text,
--   status text not null, error text, meta jsonb
-- );

-- ads_runway_alerts — dedup de la alerta de saldo (lee dme_daily, no Meta).
-- create table ads_runway_alerts (
--   client_id text not null, last_tier text, last_runway numeric,
--   last_alerted_at timestamptz, updated_at timestamptz not null
-- );

-- meta_account_status_snapshot — residuo de la era del conector MCP.
-- create table meta_account_status_snapshot (
--   account_id text not null, client_id text, client_name text, status text,
--   has_payment_method boolean, is_ads_mcp_enabled boolean,
--   not_queryable_reason text, error_code text,
--   last_seen_at timestamptz not null, last_change_at timestamptz not null
-- );

-- dme_daily — métricas manuales del DME (jsonb metrics), fuera del motor en fase 1.
-- create table dme_daily (
--   id uuid not null, client_id text not null, date date not null,
--   metrics jsonb not null, note text, updated_by text,
--   created_at timestamptz not null, updated_at timestamptz not null
-- );
