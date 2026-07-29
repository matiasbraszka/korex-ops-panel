-- fin_csm_v1 — Rol CSM (Account Manager) en comisiones.
--
-- Aditivo: columnas csm_name/csm_start_date en fin_client_terms + vista fin_income_calc y
-- función fin_recompute extendidas para calcular/atribuir la comisión del CSM (role_key='csm').
-- El CSM cobra de SETUP, CRM y PUBLICIDAD (a diferencia de consultor/marketing, que son CRM/PUBLICIDAD).
-- Sin datos de CSM cargados, ab=0 para todos → NO cambia ninguna comisión existente.
--
-- El % del CSM por cliente/tipo se carga en la matriz de Acuerdos (role_key='csm' en
-- fin_commission_rules); la PERSONA se asigna en fin_client_terms.csm_name + csm_start_date.
-- Aplicar en prod por MCP/CLI. Tras aplicar, correr select public.fin_recompute();

alter table public.fin_client_terms
  add column if not exists csm_name text,
  add column if not exists csm_start_date date;

create or replace view public.fin_income_calc as
 WITH inc AS (
         SELECT i.id, i.sheet_row, lower(i.client_name_sheet) AS cl,
            upper(COALESCE(i.income_type, ''::text)) AS htype,
            COALESCE(i.net_usd, 0::numeric) AS e,
            i.conector_name_sheet AS con, i.afiliado_name AS afi, i.income_date,
                CASE WHEN i.collected_by = 'Cliente'::text THEN 'Cliente'::text ELSE 'Korex'::text END AS coll
           FROM fin_incomes i
        ), cum AS (
         SELECT inc.id, inc.sheet_row, inc.cl, inc.htype, inc.e, inc.con, inc.afi, inc.income_date, inc.coll,
            sum(CASE WHEN inc.htype = 'PUBLICIDAD'::text THEN 0::numeric ELSE inc.e END)
              OVER (PARTITION BY inc.cl ORDER BY inc.sheet_row ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumnet
           FROM inc
        ), t AS (
         SELECT lower(fin_client_terms.sheet_client_name) AS cl,
            COALESCE(fin_client_terms.umbral_base, 0::numeric) AS umbral,
            fin_client_terms.consultor_name, fin_client_terms.marketing_name, fin_client_terms.csm_name,
            fin_client_terms.consultor_start_date, fin_client_terms.marketing_start_date, fin_client_terms.csm_start_date
           FROM fin_client_terms
        ), v AS (
         SELECT cum.id, cum.sheet_row, cum.cl, cum.htype, cum.e, cum.con, cum.afi, cum.income_date, cum.coll, cum.cumnet,
            t.umbral, t.consultor_name, t.marketing_name, t.csm_name,
            t.consultor_start_date, t.marketing_start_date, t.csm_start_date,
                CASE
                    WHEN cum.htype = ''::text THEN ''::text
                    WHEN cum.htype = 'SETUP'::text THEN 'SETUP'::text
                    WHEN cum.htype = 'PUBLICIDAD'::text THEN 'PUBLICIDAD'::text
                    WHEN COALESCE(t.umbral, 0::numeric) < cum.cumnet THEN 'CRM'::text
                    ELSE 'SETUP'::text
                END AS veff
           FROM cum LEFT JOIN t USING (cl)
        ), r AS (
         SELECT lower(fin_commission_rules.sheet_client_name) AS cl,
            fin_commission_rules.income_type, fin_commission_rules.role_key, fin_commission_rules.collected_by, fin_commission_rules.pct
           FROM fin_commission_rules
        ), vv AS (
         SELECT v.id, v.sheet_row, v.cl, v.htype, v.e, v.con, v.afi, v.income_date, v.coll, v.cumnet,
            v.umbral, v.consultor_name, v.marketing_name, v.csm_name,
            v.consultor_start_date, v.marketing_start_date, v.csm_start_date, v.veff,
                CASE
                    WHEN v.coll = 'Cliente'::text AND (EXISTS ( SELECT 1 FROM r WHERE r.cl = v.cl AND r.income_type = v.veff AND r.collected_by = 'Cliente'::text)) THEN 'Cliente'::text
                    ELSE 'Korex'::text
                END AS eff_coll
           FROM v
        ), amt AS (
         SELECT vv.id, vv.sheet_row, vv.cl, vv.htype, vv.e, vv.con, vv.afi, vv.income_date, vv.coll, vv.eff_coll, vv.cumnet,
            vv.umbral, vv.consultor_name, vv.marketing_name, vv.csm_name,
            vv.consultor_start_date, vv.marketing_start_date, vv.csm_start_date, vv.veff,
                CASE WHEN vv.veff = 'CRM'::text THEN vv.e * COALESCE(( SELECT r.pct FROM r WHERE r.cl = vv.cl AND r.income_type = 'CRM'::text AND r.role_key = 'cliente'::text AND r.collected_by = vv.eff_coll), 0::numeric) ELSE 0::numeric END AS w,
                CASE WHEN vv.con IS NOT NULL AND btrim(vv.con) <> ''::text THEN vv.e * COALESCE(( SELECT r.pct FROM r WHERE r.cl = vv.cl AND r.income_type = vv.veff AND r.role_key = 'conector'::text AND r.collected_by = vv.eff_coll), 0::numeric) ELSE 0::numeric END AS x,
                CASE WHEN vv.htype = 'CRM'::text AND vv.afi IS NOT NULL AND btrim(vv.afi) <> ''::text AND lower(btrim(vv.afi)) <> 'korex'::text THEN vv.e * COALESCE(( SELECT r.pct FROM r WHERE r.cl = vv.cl AND r.income_type = 'CRM'::text AND r.role_key = 'afiliado'::text AND r.collected_by = vv.eff_coll), 0::numeric) ELSE 0::numeric END AS y,
                CASE WHEN (vv.afi IS NULL OR btrim(vv.afi) = ''::text) AND vv.htype = 'CRM'::text THEN vv.e * COALESCE(( SELECT r.pct FROM r WHERE r.cl = vv.cl AND r.income_type = 'CRM'::text AND r.role_key = 'afiliado'::text AND r.collected_by = vv.eff_coll), 0::numeric) ELSE 0::numeric END AS ac,
                CASE WHEN vv.consultor_name IS NOT NULL AND vv.consultor_start_date IS NOT NULL AND vv.income_date >= vv.consultor_start_date AND (vv.veff = ANY (ARRAY['CRM'::text, 'PUBLICIDAD'::text])) THEN vv.e * COALESCE(( SELECT r.pct FROM r WHERE r.cl = vv.cl AND r.income_type = vv.veff AND r.role_key = 'consultor'::text AND r.collected_by = vv.eff_coll), 0::numeric) ELSE 0::numeric END AS z,
                CASE WHEN vv.marketing_name IS NOT NULL AND vv.marketing_start_date IS NOT NULL AND vv.income_date >= vv.marketing_start_date AND (vv.veff = ANY (ARRAY['CRM'::text, 'PUBLICIDAD'::text])) THEN vv.e * COALESCE(( SELECT r.pct FROM r WHERE r.cl = vv.cl AND r.income_type = vv.veff AND r.role_key = 'marketing'::text AND r.collected_by = vv.eff_coll), 0::numeric) ELSE 0::numeric END AS aa,
                CASE WHEN vv.csm_name IS NOT NULL AND vv.csm_start_date IS NOT NULL AND vv.income_date >= vv.csm_start_date AND (vv.veff = ANY (ARRAY['SETUP'::text, 'CRM'::text, 'PUBLICIDAD'::text])) THEN vv.e * COALESCE(( SELECT r.pct FROM r WHERE r.cl = vv.cl AND r.income_type = vv.veff AND r.role_key = 'csm'::text AND r.collected_by = vv.eff_coll), 0::numeric) ELSE 0::numeric END AS ab
           FROM vv
        )
 SELECT id, htype, veff, e, w, x, y, ac, z, aa,
        CASE
            WHEN (( SELECT r.pct FROM r WHERE r.cl = amt.cl AND r.income_type = amt.veff AND r.role_key = 'korex_pct'::text AND r.collected_by = amt.eff_coll)) IS NOT NULL THEN e * (( SELECT r.pct FROM r WHERE r.cl = amt.cl AND r.income_type = amt.veff AND r.role_key = 'korex_pct'::text AND r.collected_by = amt.eff_coll))
            WHEN htype = 'PUBLICIDAD'::text THEN (e - (w + x + y + z + aa + ab)) * 0.15
            ELSE e - (w + x + y + z + aa + ac + ab)
        END AS f,
        ab
   FROM amt;
-- Nota: 'ab' va al FINAL del SELECT porque CREATE OR REPLACE VIEW no permite insertar
-- una columna en el medio (solo agregar al final). fin_recompute referencia por nombre, no posición.

create or replace function public.fin_recompute()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n integer;
begin
  delete from public.fin_commission_entries where source = 'engine';
  insert into public.fin_commission_entries (income_id, role_key, amount, source, status, notes)
  select id,'cliente', round(w::numeric,2),'engine','accrued',null from public.fin_income_calc where abs(w)>0.005
  union all select id,'conector', round(x::numeric,2),'engine','accrued',null from public.fin_income_calc where abs(x)>0.005
  union all select id,'afiliado', round(y::numeric,2),'engine','accrued','pagado' from public.fin_income_calc where y>0.005
  union all select id,'afiliado', round(ac::numeric,2),'engine','accrued','reservado (sin afiliado, fondo cliente)' from public.fin_income_calc where y<=0.005 and ac>0.005
  union all select id,'consultor',round(z::numeric,2),'engine','accrued',null from public.fin_income_calc where abs(z)>0.005
  union all select id,'marketing',round(aa::numeric,2),'engine','accrued',null from public.fin_income_calc where abs(aa)>0.005
  union all select id,'csm',      round(ab::numeric,2),'engine','accrued',null from public.fin_income_calc where abs(ab)>0.005
  union all select id,'korex',    round(f::numeric,2),'engine','accrued',null from public.fin_income_calc
  union all select id,'cliente',  round((e-(x+z+aa+ab)-f)::numeric,2),'engine','accrued','presupuesto publicidad' from public.fin_income_calc where htype='PUBLICIDAD' and abs(e-(x+z+aa+ab)-f)>0.005;
  get diagnostics n = row_count;
  update public.fin_incomes i
    set effective_type = nullif(c.veff,''), korex_real = round(c.f::numeric,2)
    from public.fin_income_calc c where c.id = i.id;
  return n;
end $function$;

-- Rollback: quitar 'ab' de la vista y de fin_recompute (restaurar desde la definición previa),
-- y opcionalmente: alter table fin_client_terms drop column csm_name, drop column csm_start_date;
