-- perf_v5: los permisos se verifican UNA vez por consulta, no una por fila.
--
-- ORIGEN — test de velocidad del 30/07/2026.
-- Leer las 1.416 filas de `tasks` tardaba 340 ms. La tabla pesa 2 MB: deberian ser
-- 3 ms. El costo no eran los datos. Sus dos politicas llaman a has_permission() y
-- Postgres las evaluaba una vez POR FILA. Medido: una llamada cuesta 0,15 ms;
-- 1.416 llamadas cuestan 216 ms. Con dos politicas, ~430 ms de puro
-- "¿este usuario puede ver esto?" sobre la misma respuesta.
--
-- Y `tasks` se carga cada vez que alguien abre el panel. En pg_stat_statements,
-- solo leer tareas acumulaba mas de 21 horas de tiempo de base.
--
-- Mismo problema en korex_mercury_meta_spend() (pantalla Cuentas): 910 ms por
-- llamada, 26.348 llamadas = 8 horas. Su tabla tenia la politica `is_admin()` sin
-- envolver: 2.473 filas x ~0,35 ms = ~870 ms. Exactamente lo que tardaba.
--
-- SOLUCION: la estandar de Supabase (advisor auth_rls_initplan) — envolver la
-- llamada en un subselect para que el planificador la evalue una sola vez
-- (InitPlan). Ya estaba aplicada en 34 politicas (perf_v3 y las de soporte); esta
-- la extiende a las 110 que faltaban, en 72 tablas.
--
-- NO cambia quien ve que. Las 110 solo pasan constantes a la funcion, nunca
-- columnas de la fila; las condiciones que si dependen de la fila
-- (user_id = auth.uid(), categoria = 'ventas') quedan FUERA del subselect.
-- Verificado tras aplicar: 237 de 237 politicas con significado identico, 0
-- politicas perdidas.
--
-- RESULTADO MEDIDO (como usuario autenticado real, no como admin de la base):
--   tareas ....................... 340 ms -> 2,4 ms
--   gasto de Facebook (Cuentas) ... 910 ms -> 33 ms
--   clientes / equipo / sprints ... todos por debajo de 5 ms
--
-- Respaldo previo: public.rls_backup_20260730 (las 237 politicas como estaban).
-- Nota: NO cubre las politicas que pasan columnas a la funcion (por ejemplo
-- soporte_conv_access(id, 'read') en las tablas wa_*). Esas son inherentemente por
-- fila y no se pueden envolver sin romperlas.

create temp table _objetivo on commit drop as
select tablename, policyname, qual, with_check
from pg_policies
where schemaname = 'public'
  and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ '(has_permission|is_admin|has_role|auth\.uid)'
  and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) !~ '\( *SELECT';

do $$
declare
  r record;
  q text;
  c text;
  sentencia text;
  n int := 0;
begin
  for r in select * from _objetivo loop
    q := r.qual;
    c := r.with_check;

    if q is not null then
      q := regexp_replace(q, 'has_permission\(([^()]*)\)', '(select has_permission(\1))', 'g');
      q := regexp_replace(q, 'has_role\(([^()]*)\)', '(select has_role(\1))', 'g');
      q := replace(q, 'is_admin()', '(select is_admin())');
      q := replace(q, 'auth.uid()', '(select auth.uid())');
    end if;

    if c is not null then
      c := regexp_replace(c, 'has_permission\(([^()]*)\)', '(select has_permission(\1))', 'g');
      c := regexp_replace(c, 'has_role\(([^()]*)\)', '(select has_role(\1))', 'g');
      c := replace(c, 'is_admin()', '(select is_admin())');
      c := replace(c, 'auth.uid()', '(select auth.uid())');
    end if;

    sentencia := format('alter policy %I on public.%I', r.policyname, r.tablename);
    if q is not null then sentencia := sentencia || format(' using (%s)', q); end if;
    if c is not null then sentencia := sentencia || format(' with check (%s)', c); end if;

    execute sentencia;
    n := n + 1;
  end loop;
  raise notice 'politicas optimizadas: %', n;
end $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK: recrear cada politica desde public.rls_backup_20260730, que guarda
-- roles, cmd, qual y with_check exactos de antes de esta migracion.
--
-- COMO VERIFICAR que no cambio quien ve que (debe dar 0 y 237):
--   with norm as (
--     select 'ahora' as cuando, tablename, policyname, cmd, roles::text as roles,
--       regexp_replace(regexp_replace(lower(coalesce(qual,'')||'|'||coalesce(with_check,'')),
--         '\s+as\s+[a-z_]+','','g'), '(select|[()\s])','','g') as huella
--     from pg_policies where schemaname='public'
--     union all
--     select 'antes', tablename, policyname, cmd, roles,
--       regexp_replace(regexp_replace(lower(coalesce(qual,'')||'|'||coalesce(with_check,'')),
--         '\s+as\s+[a-z_]+','','g'), '(select|[()\s])','','g')
--     from public.rls_backup_20260730)
--   select count(*) filter (where a.huella <> b.huella) as distintas,
--          count(*) filter (where a.huella = b.huella)  as identicas
--   from norm a join norm b using (tablename, policyname)
--   where a.cuando='ahora' and b.cuando='antes';
-- ---------------------------------------------------------------------------
