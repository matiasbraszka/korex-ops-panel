-- ============================================================================
-- MOTOR DE MÉTRICAS v1 (PR2) — fundaciones. Aplicada a prod vía MCP 2026-07-28.
-- Una sola config, un solo registro de cuentas, una serie diaria canónica con
-- fecha REAL del dato, bitácora de corridas y vistas de consumo.
-- ============================================================================

-- 1) Config única del motor. Convención FX: spend_usd = spend_native * rate.
create table if not exists motor_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into motor_config (key, value) values
  ('tax_factor', '1.07625'),
  ('fx_rates', '{"USD":1, "EUR":1.087, "MXN":0.0571, "ARS":0.000909, "CLP":0.00102, "COP":0.000238}'),
  ('fx_convention', '"spend_usd = spend_native * rate (multiplicar). Tasas manuales; actualiza el equipo."'),
  ('throttle_ms', '1500'),
  ('usage_abort_pct', '90'),
  ('alert_channel', '"#informe-diario-adds"'),
  ('default_lead_action_types', '["lead","offsite_conversion.fb_pixel_lead","onsite_web_lead","leadgen_grouped","onsite_conversion.lead_grouped"]')
on conflict (key) do nothing;

-- 2) Registro único de cuentas publicitarias.
create table if not exists ads_accounts (
  account_id text primary key,              -- sin prefijo act_
  client_id  text not null references clients(id) on delete cascade,
  name       text,
  currency   text not null default 'USD',   -- moneda de la CUENTA
  status     text not null default 'activa',-- activa | pausada | interna
  managed_by text not null default 'korex', -- korex | cliente (cliente = no se mide ni suma)
  use_token  boolean default true,
  lead_action_types text[],                 -- override por cuenta; null = default del motor
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed: clients.meta_ads (fuente principal, ya saneada en PR1)
insert into ads_accounts (account_id, client_id, name, currency, status, managed_by, use_token)
select distinct on (regexp_replace(a->>'account_id', '^act_', ''))
  regexp_replace(a->>'account_id', '^act_', ''),
  c.id,
  a->>'name',
  coalesce(nullif(a->>'currency',''), 'USD'),
  coalesce(nullif(a->>'status',''), 'activa'),
  coalesce(nullif(a->>'managed_by',''), 'korex'),
  coalesce((a->>'use_token')::boolean, true)
from clients c, jsonb_array_elements(coalesce(c.meta_ads,'[]'::jsonb)) a
where coalesce(a->>'account_id','') <> ''
on conflict (account_id) do nothing;

-- Seed adicional: fbcrm_pages con cuenta y cliente resoluble por nombre
insert into ads_accounts (account_id, client_id, name, currency, notes)
select p.ad_account_id, c.id, p.client_name, coalesce(p.currency,'USD'), 'importada de fbcrm_pages'
from fbcrm_pages p
join clients c on lower(c.name) = lower(p.client_name)
where coalesce(p.ad_account_id,'') <> ''
on conflict (account_id) do nothing;

-- 3) Bitácora de corridas del motor (mata los fallos invisibles).
create table if not exists ads_sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',   -- running | ok | partial | failed
  dates_fetched jsonb,
  accounts_total int default 0,
  accounts_ok int default 0,
  accounts_failed int default 0,
  calls int default 0,
  max_usage_pct numeric default 0,
  errors jsonb default '[]'::jsonb
);

-- 4) LA serie canónica: gasto por cuenta × día (fecha real del dato).
create table if not exists ads_spend_daily (
  account_id text not null references ads_accounts(account_id) on delete cascade,
  date date not null,
  client_id text not null,
  spend_native numeric not null default 0,
  currency text not null,
  fx_rate numeric not null default 1,       -- tasa usada ese día (auditable)
  spend_usd numeric not null default 0,     -- = spend_native * fx_rate
  tax_factor numeric not null default 1,
  spend_usd_taxed numeric not null default 0,
  impressions bigint default 0,
  clicks bigint default 0,
  leads integer default 0,
  lead_detail jsonb,
  sync_run_id bigint references ads_sync_runs(id),
  fetched_at timestamptz not null default now(),
  primary key (account_id, date)
);
create index if not exists ads_spend_daily_client_date on ads_spend_daily (client_id, date);

-- Backfill histórico desde fbcrm_spend_daily (sus USD son correctos: usaba la
-- convención inversa consistente con su propia tabla de tasas).
insert into ads_spend_daily (account_id, date, client_id, spend_native, currency, fx_rate,
                             spend_usd, tax_factor, spend_usd_taxed, impressions, clicks, leads)
select f.ad_account_id, f.date, aa.client_id,
       coalesce(f.spend_native,0), coalesce(f.currency,'USD'),
       case when coalesce(f.spend_native,0) > 0 then round(coalesce(f.spend_usd,0)/f.spend_native, 6) else 1 end,
       coalesce(f.spend_usd,0), 1.07625, coalesce(f.spend_usd_taxed,0),
       coalesce(f.impressions,0), coalesce(f.clicks,0), coalesce(f.leads_count,0)
from fbcrm_spend_daily f
join ads_accounts aa on aa.account_id = f.ad_account_id
on conflict (account_id, date) do nothing;

-- 5) Vistas canónicas.
create or replace view v_client_ad_spend as
select s.client_id, c.name as client_name, s.date,
       sum(s.spend_native) as spend_native_mixto,
       sum(s.spend_usd) as spend_usd,
       sum(s.spend_usd_taxed) as spend_usd_taxed,
       sum(s.impressions) as impressions, sum(s.clicks) as clicks, sum(s.leads) as leads
from ads_spend_daily s
join ads_accounts a on a.account_id = s.account_id
join clients c on c.id = s.client_id
where a.managed_by = 'korex' and a.status <> 'interna'
group by s.client_id, c.name, s.date;

create or replace view v_ads_coverage as
select c.id as client_id, c.name,
       count(a.account_id) filter (where a.managed_by='korex' and a.status='activa') as cuentas_korex,
       case
         when count(a.account_id) filter (where a.managed_by='korex' and a.status='activa') = 0 then 'sin_cuenta'
         when not exists (
           select 1 from ads_spend_daily s
           join ads_accounts a2 on a2.account_id = s.account_id and a2.managed_by='korex'
           where s.client_id = c.id and s.date = current_date - 1)
         then 'sin_datos_ayer'
         else 'medido'
       end as estado_medicion
from clients c
left join ads_accounts a on a.client_id = c.id
where c.status = 'active'
group by c.id, c.name;

-- 6) RPCs de consumo (panel).
create or replace function get_client_spend(p_client_id text, p_from date, p_to date)
returns setof v_client_ad_spend language sql stable security definer set search_path to 'public' as $$
  select * from v_client_ad_spend where client_id = p_client_id and date between p_from and p_to order by date;
$$;
create or replace function get_spend_summary(p_days int default 7)
returns table(client_id text, client_name text, spend_usd_taxed numeric, leads bigint, cpl numeric, spend_ayer numeric, leads_ayer bigint)
language sql stable security definer set search_path to 'public' as $$
  select v.client_id, v.client_name,
         round(sum(v.spend_usd_taxed), 2),
         sum(v.leads),
         case when sum(v.leads) > 0 then round(sum(v.spend_usd_taxed)/sum(v.leads), 2) else null end,
         round(sum(v.spend_usd_taxed) filter (where v.date = current_date - 1), 2),
         sum(v.leads) filter (where v.date = current_date - 1)
  from v_client_ad_spend v
  where v.date >= current_date - p_days
  group by v.client_id, v.client_name;
$$;

-- 7) Seguridad: el equipo lee; escriben solo las funciones del motor (service role).
alter table motor_config enable row level security;
alter table ads_accounts enable row level security;
alter table ads_sync_runs enable row level security;
alter table ads_spend_daily enable row level security;
create policy motor_config_team_read on motor_config for select using (is_team_member());
create policy ads_accounts_team_read on ads_accounts for select using (is_team_member());
create policy ads_sync_runs_team_read on ads_sync_runs for select using (is_team_member());
create policy ads_spend_daily_team_read on ads_spend_daily for select using (is_team_member());
grant execute on function get_client_spend(text, date, date) to authenticated;
grant execute on function get_spend_summary(int) to authenticated;
