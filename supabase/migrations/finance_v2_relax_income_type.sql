-- El Tipo (H) del Sheet admite valores fuera de SETUP/CRM/PUBLICIDAD (ej "Comisiones").
-- fin_incomes guarda el H crudo; las reglas (fin_commission_rules) sí quedan acotadas.
alter table public.fin_incomes drop constraint if exists fin_incomes_income_type_check;
comment on column public.fin_incomes.income_type is 'Tipo crudo del Sheet (H): SETUP/CRM/PUBLICIDAD u otros como "Comisiones". El tipo efectivo va en effective_type.';
