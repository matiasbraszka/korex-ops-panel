-- perf_v6: korex_mercury_meta_spend() sin ILIKE.
--
-- ILIKE 'facebook' (sin comodines) es exactamente una igualdad sin distinguir
-- mayusculas, asi que lower(...) = 'facebook' da el mismo resultado y es un pelin
-- mas barato de evaluar. Verificado: 16 cuentas y 34.966,22 de total, identico
-- antes y despues.
--
-- HISTORIA (para que nadie repita el error): esta migracion nacio con un indice de
-- expresion sobre lower(counterparty_name), con la teoria de que los 910 ms de la
-- funcion eran falta de indice. Era falso. La causa real era la politica
-- `is_admin()` de mercury_transactions evaluandose una vez por fila — la arregla
-- perf_v5, y sin ningun indice la funcion paso de 910 ms a 33 ms.
--
-- El indice se quito en perf_v9: el 28% de las filas coincide con el filtro, asi
-- que el planificador siempre prefiere recorrer la tabla (nunca lo uso), y
-- mercury_transactions recibe millones de escrituras del sync que el indice
-- encarecia a cambio de nada.
--
-- Moraleja: antes de agregar un indice, mirar el plan. Si el filtro deja pasar mas
-- de ~20% de las filas, el indice no se va a usar.

create or replace function public.korex_mercury_meta_spend()
returns table(account_id text, meta_spend numeric)
language sql
stable
set search_path to 'public', 'pg_catalog'
as $function$
  select account_id,
         sum(case when amount < 0 then -amount else 0 end) as meta_spend
  from public.mercury_transactions
  where lower(counterparty_name) = 'facebook'
    and status not in ('failed', 'cancelled')
  group by account_id;
$function$;

-- ---------------------------------------------------------------------------
-- ROLLBACK: volver a crear la funcion con "counterparty_name ilike 'facebook'".
-- ---------------------------------------------------------------------------
