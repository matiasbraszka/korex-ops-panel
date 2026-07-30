-- perf_v7: los 31 indices que faltaban en claves foraneas.
--
-- Sin ellos, cualquier busqueda "traeme los hijos de X" (los pagos de un cliente,
-- los posts de una campana, las cuotas de un ingreso) recorre la tabla hija
-- entera. Y borrar o actualizar el padre tambien obliga a un recorrido completo
-- del hijo para verificar la integridad.
--
-- Reportado por el advisor de rendimiento de Supabase (unindexed_foreign_keys):
-- 31 antes, 0 despues.
--
-- Se generan desde el catalogo (pg_constraint) en vez de escribirlos a mano: solo
-- claves foraneas de UNA columna que hoy no tienen ningun indice que empiece por
-- ella. Es idempotente: volver a correrla no crea nada de mas.
--
-- Contrapartida honesta: cada indice hace las escrituras un pelin mas lentas y
-- ocupa espacio. En tablas de este tamano (miles de filas) es despreciable frente
-- a lo que se gana leyendo. Ojo con el caso contrario — ver perf_v6/perf_v9, donde
-- un indice sobre una tabla muy escrita no aportaba nada y se quito.

do $$
declare
  r record;
  nombre text;
  n int := 0;
begin
  for r in
    select c.conrelid::regclass::text as tabla,
           a.attname as columna
    from pg_constraint c
    join unnest(c.conkey) with ordinality k(attnum, ord) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f'
      and c.connamespace = 'public'::regnamespace
      and array_length(c.conkey, 1) = 1
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indkey[0] = a.attnum
      )
  loop
    -- Nombre acotado a 63 caracteres (limite de identificador en Postgres).
    nombre := left('idx_' || replace(r.tabla, '.', '_') || '_' || r.columna, 63);
    execute format('create index if not exists %I on %s (%I)', nombre, r.tabla, r.columna);
    n := n + 1;
  end loop;
  raise notice 'indices de clave foranea creados: %', n;
end $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK: drop index de cada idx_<tabla>_<columna> creado aca. Ninguno cambia
-- datos: borrarlos solo devuelve la lentitud, no rompe nada.
--
-- NOTA: recien creados apareceran como "unused_index" en el advisor. Es esperable
-- (nunca se usaron todavia), no un error. Revisar de nuevo en unas semanas.
-- ---------------------------------------------------------------------------
