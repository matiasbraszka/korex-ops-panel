-- fin_v2_sin_comision.sql
--
-- Pedido: al cargar un pago de PUBLICIDAD, poder marcar que ese ingreso no genera
-- comisiones: va INTEGRO al presupuesto de publicidad del cliente.
--
-- Aclaracion importante sobre la pasarela: el descuento de Stripe YA estaba resuelto.
-- Todas las comisiones se calculan sobre `net_usd`, que es el bruto menos el fee de
-- la pasarela (lo calcula el front al cargar el ingreso y lo refina contra el cargo
-- real de Stripe). Asi que "despues de haber restado las comisiones de Stripe" ya se
-- cumplia; lo que faltaba era el interruptor.
--
-- Va sobre el INGRESO, no sobre el egreso: `fin_expenses` no participa del motor de
-- comisiones. El egreso es la plata saliendo a Meta; el ingreso es la carga de saldo.
--
-- Con sin_comision = true:
--   * los 7 montos por rol (cliente, conector, afiliado, reserva, consultor,
--     marketing, csm) quedan en 0;
--   * korex_real (f) queda en 0 -- OJO: sin esta rama, PUBLICIDAD se llevaba igual
--     el 15% de lo que sobra, y el pedido es que vaya integro;
--   * fin_recompute() genera entonces un unico entry de 'presupuesto publicidad'
--     por el neto completo, porque calcula e-(x+z+aa+ab)-f = e-0-0 = e.
--
-- Base: migrations/fin_csm_v1.sql (verificado contra la definicion viva con
-- pg_get_viewdef antes de escribir esto: coinciden).

alter table public.fin_incomes
  add column if not exists sin_comision boolean not null default false;

comment on column public.fin_incomes.sin_comision is
  'Ingreso que no genera comisiones: el neto va integro al presupuesto de publicidad del cliente. Se marca desde el modal de Ingresos.';

-- CREATE OR REPLACE VIEW no permite insertar columnas en el medio ni cambiar tipos:
-- la columna nueva (sin_comision) va al FINAL del select, despues de ab.
create or replace view public.fin_income_calc as
 WITH inc AS (
         SELECT i.id,
            i.sheet_row,
            lower(i.client_name_sheet) AS cl,
            upper(COALESCE(i.income_type, ''::text)) AS htype,
            COALESCE(i.net_usd, 0::numeric) AS e,
            i.conector_name_sheet AS con,
            i.afiliado_name AS afi,
            i.income_date,
            COALESCE(i.sin_comision, false) AS sc,
                CASE
                    WHEN i.collected_by = 'Cliente'::text THEN 'Cliente'::text
                    ELSE 'Korex'::text
                END AS coll
           FROM fin_incomes i
        ), cum AS (
         SELECT inc.id, inc.sheet_row, inc.cl, inc.htype, inc.e, inc.con, inc.afi,
            inc.income_date, inc.sc, inc.coll,
            sum(
                CASE
                    WHEN inc.htype = 'PUBLICIDAD'::text THEN 0::numeric
                    ELSE inc.e
                END) OVER (PARTITION BY inc.cl ORDER BY inc.sheet_row ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumnet
           FROM inc
        ), t AS (
         SELECT lower(fin_client_terms.sheet_client_name) AS cl,
            COALESCE(fin_client_terms.umbral_base, 0::numeric) AS umbral,
            fin_client_terms.consultor_name,
            fin_client_terms.marketing_name,
            fin_client_terms.csm_name,
            fin_client_terms.consultor_start_date,
            fin_client_terms.marketing_start_date,
            fin_client_terms.csm_start_date
           FROM fin_client_terms
        ), v AS (
         SELECT cum.id, cum.sheet_row, cum.cl, cum.htype, cum.e, cum.con, cum.afi,
            cum.income_date, cum.sc, cum.coll, cum.cumnet,
            t.umbral, t.consultor_name, t.marketing_name, t.csm_name,
            t.consultor_start_date, t.marketing_start_date, t.csm_start_date,
                CASE
                    WHEN cum.htype = ''::text THEN ''::text
                    WHEN cum.htype = 'SETUP'::text THEN 'SETUP'::text
                    WHEN cum.htype = 'PUBLICIDAD'::text THEN 'PUBLICIDAD'::text
                    WHEN COALESCE(t.umbral, 0::numeric) < cum.cumnet THEN 'CRM'::text
                    ELSE 'SETUP'::text
                END AS veff
           FROM cum
             LEFT JOIN t USING (cl)
        ), r AS (
         SELECT lower(fin_commission_rules.sheet_client_name) AS cl,
            fin_commission_rules.income_type,
            fin_commission_rules.role_key,
            fin_commission_rules.collected_by,
            fin_commission_rules.pct
           FROM fin_commission_rules
        ), vv AS (
         SELECT v.id, v.sheet_row, v.cl, v.htype, v.e, v.con, v.afi, v.income_date,
            v.sc, v.coll, v.cumnet, v.umbral, v.consultor_name, v.marketing_name,
            v.csm_name, v.consultor_start_date, v.marketing_start_date,
            v.csm_start_date, v.veff,
                CASE
                    WHEN v.coll = 'Cliente'::text AND (EXISTS ( SELECT 1
                       FROM r
                      WHERE r.cl = v.cl AND r.income_type = v.veff AND r.collected_by = 'Cliente'::text)) THEN 'Cliente'::text
                    ELSE 'Korex'::text
                END AS eff_coll
           FROM v
        ), amt AS (
         SELECT vv.id, vv.sheet_row, vv.cl, vv.htype, vv.e, vv.con, vv.afi,
            vv.income_date, vv.sc, vv.coll, vv.eff_coll, vv.cumnet, vv.umbral,
            vv.consultor_name, vv.marketing_name, vv.csm_name,
            vv.consultor_start_date, vv.marketing_start_date, vv.csm_start_date,
            vv.veff,
                CASE
                    WHEN vv.sc THEN 0::numeric
                    WHEN vv.veff = 'CRM'::text THEN vv.e * COALESCE(( SELECT r.pct
                       FROM r
                      WHERE r.cl = vv.cl AND r.income_type = 'CRM'::text AND r.role_key = 'cliente'::text AND r.collected_by = vv.eff_coll), 0::numeric)
                    ELSE 0::numeric
                END AS w,
                CASE
                    WHEN vv.sc THEN 0::numeric
                    WHEN vv.con IS NOT NULL AND btrim(vv.con) <> ''::text THEN vv.e * COALESCE(( SELECT r.pct
                       FROM r
                      WHERE r.cl = vv.cl AND r.income_type = vv.veff AND r.role_key = 'conector'::text AND r.collected_by = vv.eff_coll), 0::numeric)
                    ELSE 0::numeric
                END AS x,
                CASE
                    WHEN vv.sc THEN 0::numeric
                    WHEN vv.htype = 'CRM'::text AND vv.afi IS NOT NULL AND btrim(vv.afi) <> ''::text AND lower(btrim(vv.afi)) <> 'korex'::text THEN vv.e * COALESCE(( SELECT r.pct
                       FROM r
                      WHERE r.cl = vv.cl AND r.income_type = 'CRM'::text AND r.role_key = 'afiliado'::text AND r.collected_by = vv.eff_coll), 0::numeric)
                    ELSE 0::numeric
                END AS y,
                CASE
                    WHEN vv.sc THEN 0::numeric
                    WHEN (vv.afi IS NULL OR btrim(vv.afi) = ''::text) AND vv.htype = 'CRM'::text THEN vv.e * COALESCE(( SELECT r.pct
                       FROM r
                      WHERE r.cl = vv.cl AND r.income_type = 'CRM'::text AND r.role_key = 'afiliado'::text AND r.collected_by = vv.eff_coll), 0::numeric)
                    ELSE 0::numeric
                END AS ac,
                CASE
                    WHEN vv.sc THEN 0::numeric
                    WHEN vv.consultor_name IS NOT NULL AND vv.consultor_start_date IS NOT NULL AND vv.income_date >= vv.consultor_start_date AND (vv.veff = ANY (ARRAY['CRM'::text, 'PUBLICIDAD'::text])) THEN vv.e * COALESCE(( SELECT r.pct
                       FROM r
                      WHERE r.cl = vv.cl AND r.income_type = vv.veff AND r.role_key = 'consultor'::text AND r.collected_by = vv.eff_coll), 0::numeric)
                    ELSE 0::numeric
                END AS z,
                CASE
                    WHEN vv.sc THEN 0::numeric
                    WHEN vv.marketing_name IS NOT NULL AND vv.marketing_start_date IS NOT NULL AND vv.income_date >= vv.marketing_start_date AND (vv.veff = ANY (ARRAY['CRM'::text, 'PUBLICIDAD'::text])) THEN vv.e * COALESCE(( SELECT r.pct
                       FROM r
                      WHERE r.cl = vv.cl AND r.income_type = vv.veff AND r.role_key = 'marketing'::text AND r.collected_by = vv.eff_coll), 0::numeric)
                    ELSE 0::numeric
                END AS aa,
                CASE
                    WHEN vv.sc THEN 0::numeric
                    WHEN vv.csm_name IS NOT NULL AND vv.csm_start_date IS NOT NULL AND vv.income_date >= vv.csm_start_date AND (vv.veff = ANY (ARRAY['SETUP'::text, 'CRM'::text, 'PUBLICIDAD'::text])) THEN vv.e * COALESCE(( SELECT r.pct
                       FROM r
                      WHERE r.cl = vv.cl AND r.income_type = vv.veff AND r.role_key = 'csm'::text AND r.collected_by = vv.eff_coll), 0::numeric)
                    ELSE 0::numeric
                END AS ab
           FROM vv
        )
 SELECT id,
    htype,
    veff,
    e,
    w,
    x,
    y,
    ac,
    z,
    aa,
        CASE
            WHEN sc THEN 0::numeric
            WHEN (( SELECT r.pct
               FROM r
              WHERE r.cl = amt.cl AND r.income_type = amt.veff AND r.role_key = 'korex_pct'::text AND r.collected_by = amt.eff_coll)) IS NOT NULL THEN e * (( SELECT r.pct
               FROM r
              WHERE r.cl = amt.cl AND r.income_type = amt.veff AND r.role_key = 'korex_pct'::text AND r.collected_by = amt.eff_coll))
            WHEN htype = 'PUBLICIDAD'::text THEN (e - (w + x + y + z + aa + ab)) * 0.15
            ELSE e - (w + x + y + z + aa + ac + ab)
        END AS f,
    ab,
    sc AS sin_comision
   FROM amt;

-- fin_recompute() NO se toca: la ultima linea del insert ya calcula
-- e-(x+z+aa+ab)-f, que con todo en 0 devuelve el neto entero.
