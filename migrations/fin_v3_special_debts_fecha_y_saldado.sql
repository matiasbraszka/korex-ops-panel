-- fin_v3_special_debts_fecha_y_saldado.sql
--
-- Pedido: "se tienen que poder modificar las deudas, falta fecha de la deuda y
-- poner cuando este saldado".
--
-- Aclaracion de alcance (decidido con Matias): esto aplica SOLO a las deudas
-- ESPECIALES. Las otras vistas de Deuda (Por rol, Afiliados, Cliente -> Korex,
-- Fondos) NO son editables: son un calculo vivo deuda = generado - pagado que sale
-- del motor de comisiones. Ahi "saldar" es registrar un pago en Pagos (fin_payouts),
-- que ya tiene su fecha.
--
-- fin_special_debts ya era una tabla real (obligaciones excepcionales fuera del
-- reparto: reembolsos, ajustes, transferencias fallidas), pero se cargaba a mano en
-- Supabase y el panel solo la leia. Ahora se administra desde Finanzas > Deuda >
-- Especiales.

alter table public.fin_special_debts
  add column if not exists debt_date    date,
  add column if not exists status       text not null default 'pendiente',
  add column if not exists settled_date date,
  add column if not exists updated_at   timestamptz not null default now();

-- Solo dos estados. 'saldada' es el equivalente de "ya se cobro / ya se pago".
alter table public.fin_special_debts
  drop constraint if exists fin_special_debts_status_chk;
alter table public.fin_special_debts
  add constraint fin_special_debts_status_chk
  check (status in ('pendiente', 'saldada'));

-- Las 7 filas que ya existian no tenian fecha: se toma la de carga como referencia.
update public.fin_special_debts
   set debt_date = created_at::date
 where debt_date is null;

comment on column public.fin_special_debts.debt_date    is 'Cuando se origino la deuda (no cuando se cargo en el panel).';
comment on column public.fin_special_debts.status       is 'pendiente | saldada';
comment on column public.fin_special_debts.settled_date is 'Cuando quedo saldada. Se completa solo al marcarla.';

-- Coherencia: saldada exige fecha de saldado, y pendiente no debe tenerla.
create or replace function public._fin_special_debt_touch()
returns trigger language plpgsql as $$
begin
  if new.status = 'saldada' and new.settled_date is null then
    new.settled_date := current_date;
  elsif new.status <> 'saldada' then
    new.settled_date := null;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists fin_special_debts_touch on public.fin_special_debts;
create trigger fin_special_debts_touch
  before insert or update on public.fin_special_debts
  for each row execute function public._fin_special_debt_touch();

create index if not exists fin_special_debts_status_idx
  on public.fin_special_debts (status, debt_date desc);
