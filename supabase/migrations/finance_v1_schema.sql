-- =============================================================================
-- Finance F1 — Esquema base del área "Finanzas" (espejo del Sheet "MKA - Finanzas y Costos")
-- =============================================================================
-- Principios:
--   * Todo vive bajo el prefijo fin_ y NO toca ninguna tabla/flujo existente.
--   * Normalizado: una fuente de verdad por dato. Las reglas de % viven en
--     fin_commission_rules (matriz cliente x tipo x rol), no duplicadas.
--   * fin_commission_entries es el LIBRO de reparto (1 fila por beneficiario por
--     ingreso) — base del motor, de la conciliación y (a futuro) del portal partners.
--   * RLS en todas: equipo finance/admin ve y escribe todo vía has_permission().
--     El acceso restringido por-persona (portal partners) se agrega en F5.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Trigger genérico de updated_at
-- ---------------------------------------------------------------------------
create or replace function public.fin_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) fin_roles — catálogo de roles que cobran comisión (data-driven)
-- ---------------------------------------------------------------------------
create table if not exists public.fin_roles (
  key        text primary key,                 -- 'conector','consultor','marketing','afiliado','cliente','korex'
  label      text not null,
  position   int  not null default 0,
  is_korex   boolean not null default false,   -- el remanente (no es una persona externa)
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.fin_roles (key, label, position, is_korex) values
  ('conector',  'Conector',  1, false),
  ('consultor', 'Consultor', 2, false),
  ('marketing', 'Marketing', 3, false),
  ('afiliado',  'Afiliado',  4, false),
  ('cliente',   'Cliente',   5, false),
  ('korex',     'Korex',     6, true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2) fin_people — personas que cobran comisión (partners) y opcionalmente loguean
-- ---------------------------------------------------------------------------
create table if not exists public.fin_people (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  email          text,
  kind           text not null default 'external',  -- 'external' | 'team'
  team_member_id text references public.team_members(id) on delete set null,
  client_id      text references public.clients(id)      on delete set null, -- cuando la persona ES un cliente/networker
  user_id        uuid,                                -- link a auth.users para login (se usa en F5)
  active         boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists fin_people_email_uniq
  on public.fin_people (lower(email)) where email is not null;
create index if not exists fin_people_user_id on public.fin_people (user_id) where user_id is not null;

create trigger fin_people_touch before update on public.fin_people
  for each row execute function public.fin_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3) fin_client_terms — bloque por cliente de "Acuerdos" (asignaciones + umbral)
-- ---------------------------------------------------------------------------
create table if not exists public.fin_client_terms (
  id                  uuid primary key default gen_random_uuid(),
  client_id           text not null references public.clients(id) on delete cascade,
  sheet_client_name   text,            -- Acuerdos!K (para casar en el import)
  service_value       numeric,         -- Acuerdos!L (Valor servicio)
  umbral_base         numeric,         -- Acuerdos!Z (gatillo SETUP -> CRM)
  agreement_date      date,            -- Acuerdos!J
  payment_method      text,
  conector_person_id  uuid references public.fin_people(id) on delete set null,
  consultor_person_id uuid references public.fin_people(id) on delete set null,
  marketing_person_id uuid references public.fin_people(id) on delete set null,
  afiliado_person_id  uuid references public.fin_people(id) on delete set null,
  conector_start_date  date,           -- validez por fecha (FILTER del Sheet)
  consultor_start_date date,
  marketing_start_date date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (client_id)
);
create trigger fin_client_terms_touch before update on public.fin_client_terms
  for each row execute function public.fin_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4) fin_commission_rules — % por (cliente x tipo de ingreso x rol)
--    Espeja Acuerdos P..AA. pct = porcentaje tal cual el Sheet (la escala
--    —entero vs fracción— se fija en el importador/motor en F1.3/F1.4).
-- ---------------------------------------------------------------------------
create table if not exists public.fin_commission_rules (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null references public.clients(id) on delete cascade,
  income_type text not null check (income_type in ('SETUP','CRM','PUBLICIDAD')),
  role_key    text not null references public.fin_roles(key),
  pct         numeric not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, income_type, role_key)
);
create trigger fin_commission_rules_touch before update on public.fin_commission_rules
  for each row execute function public.fin_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5) fin_incomes — ledger transaccional (= hoja "Ingresos")
-- ---------------------------------------------------------------------------
create table if not exists public.fin_incomes (
  id                  uuid primary key default gen_random_uuid(),
  sheet_row           int,             -- fila original en Ingresos (trazabilidad del import)
  income_date         date,            -- B Fecha
  month_date          date,            -- A Fecha Mes
  client_id           text references public.clients(id) on delete set null,
  payer_name          text,            -- M Usuario (quien paga; puede no ser el cliente)
  client_name_sheet   text,            -- N Cliente (resuelto en el Sheet)
  conector_name_sheet text,            -- O Conector (resuelto en el Sheet)
  income_type         text check (income_type in ('SETUP','CRM','PUBLICIDAD')), -- H
  effective_type      text,            -- V "SETUP O CRM" resuelto por umbral
  amount_eur          numeric,         -- C
  amount_usd          numeric,         -- D
  net_usd             numeric,         -- E (post-fee Stripe)
  korex_real          numeric,         -- F "Ingreso real Korex" del Sheet (golden)
  payment_method      text,            -- G
  status              text,            -- J Depositado / Parcial
  setter              text,            -- K
  closer              text,            -- L
  currency            text,            -- moneda de origen de la venta
  -- flags manuales del Sheet
  facturado           boolean default false,  -- Q
  organizado_finanzas boolean default false,  -- R
  llego_mercury       boolean default false,  -- S
  cargado_software    boolean default false,  -- U
  raw                 jsonb,           -- fila cruda del import (red de seguridad)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists fin_incomes_client on public.fin_incomes (client_id);
create index if not exists fin_incomes_date   on public.fin_incomes (income_date);
create unique index if not exists fin_incomes_sheet_row on public.fin_incomes (sheet_row) where sheet_row is not null;
create trigger fin_incomes_touch before update on public.fin_incomes
  for each row execute function public.fin_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6) fin_commission_entries — LIBRO de reparto (1 fila por beneficiario x ingreso)
--    Espeja Ingresos W..AA (montos por rol) pero normalizado y trazable.
-- ---------------------------------------------------------------------------
create table if not exists public.fin_commission_entries (
  id         uuid primary key default gen_random_uuid(),
  income_id  uuid not null references public.fin_incomes(id) on delete cascade,
  role_key   text not null references public.fin_roles(key),
  person_id  uuid references public.fin_people(id) on delete set null,
  pct        numeric,                       -- % aplicado
  amount     numeric not null default 0,    -- monto (USD)
  source     text not null default 'engine' check (source in ('engine','sheet','manual')),
  status     text not null default 'accrued' check (status in ('accrued','paid','void')),
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists fin_entries_income on public.fin_commission_entries (income_id);
create index if not exists fin_entries_person on public.fin_commission_entries (person_id);
create index if not exists fin_entries_role   on public.fin_commission_entries (role_key);
create index if not exists fin_entries_source on public.fin_commission_entries (source);

-- ---------------------------------------------------------------------------
-- 7) fin_payouts — pagos reales a partners (= hoja "Comisiones"). Deuda = entries - payouts
-- ---------------------------------------------------------------------------
create table if not exists public.fin_payouts (
  id                     uuid primary key default gen_random_uuid(),
  person_id              uuid references public.fin_people(id) on delete set null,
  paid_on                date,
  period                 text,            -- ej '2026-05'
  amount                 numeric not null default 0,
  currency               text not null default 'USD',
  fund                   text,            -- fondo / concepto
  mercury_transaction_id text,            -- conciliación (sin FK dura)
  notes                  text,
  created_at             timestamptz not null default now()
);
create index if not exists fin_payouts_person on public.fin_payouts (person_id);

-- ---------------------------------------------------------------------------
-- 8) fin_expenses — egresos (= hoja "Gastos")
-- ---------------------------------------------------------------------------
create table if not exists public.fin_expenses (
  id                     uuid primary key default gen_random_uuid(),
  expense_date           date,
  amount                 numeric not null default 0,
  currency               text not null default 'USD',
  category               text,
  reason                 text,
  detail                 text,
  client_id              text references public.clients(id) on delete set null,
  paid_by                text,
  mercury_transaction_id text,
  raw                    jsonb,
  created_at             timestamptz not null default now()
);
create index if not exists fin_expenses_date   on public.fin_expenses (expense_date);
create index if not exists fin_expenses_client on public.fin_expenses (client_id);

-- =============================================================================
-- RLS — equipo finance/admin ve y escribe todo (has_permission ya incluye is_admin)
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'fin_roles','fin_people','fin_client_terms','fin_commission_rules',
    'fin_incomes','fin_commission_entries','fin_payouts','fin_expenses'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t||'_read', t);
    execute format('drop policy if exists %I on public.%I;', t||'_write', t);
    execute format($f$create policy %I on public.%I for select using (public.has_permission('finance','*','read'));$f$, t||'_read', t);
    execute format($f$create policy %I on public.%I for all using (public.has_permission('finance','*','write')) with check (public.has_permission('finance','*','write'));$f$, t||'_write', t);
  end loop;
end $$;

-- =============================================================================
-- RBAC — rol 'finance' + permiso del módulo (mismo patrón que operations/sales/soporte)
-- =============================================================================
insert into public.roles (name, description)
values ('finance', 'Acceso al área de Finanzas: ingresos, comisiones, egresos y conciliación.')
on conflict (name) do nothing;

insert into public.role_permissions (role, module, submodule, can_read, can_write)
values ('finance', 'finance', '*', true, true)
on conflict do nothing;
