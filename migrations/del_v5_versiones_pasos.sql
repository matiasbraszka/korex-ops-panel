-- migrations/del_v5_versiones_pasos.sql
--
-- Las versiones del DEL pasan a tener TÍTULO, NOTA y PASOS PROPIOS.
--
-- Punto 4: "que se pueda poner una nota de en qué cambia esta versión respecto a las
-- otras, y un título para distinguirlas, sin perder la estructura V1/V2/V3".
-- Punto 3: "que se puedan borrar pasos — si el funnel no lleva Pre-landing, que no
-- esté; y si saco Pre-landing y Landing y dejo solo Formulario, que el sistema
-- entienda que el embudo se acortó". Los pasos son POR VERSIÓN: la V1 puede llevar
-- las cuatro páginas y la V2 ir directo al formulario.
--
-- La tabla del_versions ya existe (del_v4_versiones_meta.sql). Acá se le enseña al
-- sistema a usarla.
--
-- Se parte de la definición VIVA de del_version_add, no del .sql del repo: la que
-- corre en producción tiene un tercer parámetro (p_scope) que nunca se versionó.
--
-- Hay que DROPear las dos firmas viejas antes de crear la nueva: con parámetros por
-- defecto, una llamada de 3 argumentos matchearía las dos y Postgres la rechazaría
-- por ambigua.

drop function if exists public.del_version_add(text, text);
drop function if exists public.del_version_add(text, text, text);

create or replace function public.del_version_add(
  p_doc_id text,
  p_by     text default null,
  p_scope  text default 'completa',
  p_titulo text default null,
  p_nota   text default null,
  p_pasos  text[] default null
)
returns int
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cli text; v_strat text; v_new int; v_ord int; k text;
  v_kinds  text[];
  v_labels jsonb := '{"estrategia":"Estrategia","vsl":"VSL","anuncios":"Anuncios","pg_prelanding":"Pre-landing","pg_landing":"Landing VSL","pg_formulario":"Formulario","pg_thankyou":"Thank you","pg_testimonios":"Testimonios"}';
begin
  select client_id, strategy_id into v_cli, v_strat from client_brain_docs where id = p_doc_id;
  if v_cli is null then raise exception 'DEL inexistente: %', p_doc_id; end if;
  perform del_claim(p_doc_id);

  -- Qué pasos lleva la versión nueva. Si vienen explícitos (el panel deja elegir),
  -- mandan esos. Si no, se mantiene el comportamiento de siempre:
  --   'paginas'  = cambia solo el recorrido de páginas; VSL y anuncios se comparten
  --                con la V1 y no se generan carpetas nuevas.
  --   'completa' = relanzamiento, con VSL y anuncios nuevos.
  if p_pasos is not null and array_length(p_pasos, 1) > 0 then
    v_kinds := p_pasos;
  elsif p_scope = 'paginas' then
    v_kinds := array['pg_prelanding','pg_landing','pg_formulario','pg_thankyou'];
  else
    v_kinds := array['estrategia','vsl','anuncios','pg_prelanding','pg_landing','pg_formulario','pg_thankyou'];
  end if;

  select coalesce(max(version), 1) + 1 into v_new  from del_sections where doc_id = p_doc_id;
  select coalesce(max(ord), 0)         into v_ord  from del_sections where doc_id = p_doc_id;

  foreach k in array v_kinds loop
    v_ord := v_ord + 1;
    insert into del_sections (id, doc_id, client_id, strategy_id, ord, title, kind, text, html,
                              char_count, source, version, status, updated_at, updated_by)
    values ('dsecp_' || replace(gen_random_uuid()::text, '-', ''),
            p_doc_id, v_cli, v_strat, v_ord, coalesce(v_labels->>k, k), k, '', '', 0,
            'panel', v_new, 'activa', now(), p_by);
  end loop;

  insert into public.del_versions (doc_id, version, titulo, nota, pasos, created_by)
  values (p_doc_id, v_new, nullif(btrim(coalesce(p_titulo,'')), ''),
          nullif(btrim(coalesce(p_nota,'')), ''), v_kinds, p_by)
  on conflict (doc_id, version) do update
    set titulo = excluded.titulo, nota = excluded.nota, pasos = excluded.pasos;

  return v_new;
end
$function$;

revoke all   on function public.del_version_add(text, text, text, text, text, text[]) from public, anon;
grant execute on function public.del_version_add(text, text, text, text, text, text[]) to authenticated;

-- ── Editar el título y la nota de una versión que ya existe ─────────────────
create or replace function public.del_version_set_meta(
  p_doc_id text, p_version int, p_titulo text default null, p_nota text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_team_member() then raise exception 'no autorizado'; end if;
  if p_version is null or p_version < 1 then raise exception 'version invalida: %', p_version; end if;
  insert into public.del_versions (doc_id, version, titulo, nota)
  values (p_doc_id, p_version, nullif(btrim(coalesce(p_titulo,'')), ''), nullif(btrim(coalesce(p_nota,'')), ''))
  on conflict (doc_id, version) do update
    set titulo = excluded.titulo, nota = excluded.nota;
end
$function$;

revoke all   on function public.del_version_set_meta(text, int, text, text) from public, anon;
grant execute on function public.del_version_set_meta(text, int, text, text) to authenticated;

-- ── Qué pasos lleva una versión ─────────────────────────────────────────────
-- Sacar un paso NO borra contenido: solo deja de listarlo. Si esa categoría tiene
-- secciones escritas en esa versión, se rechaza — para eso está el borrado de
-- secciones, que es una decisión distinta y avisa lo que se lleva puesto.
create or replace function public.del_version_set_pasos(
  p_doc_id text, p_version int, p_pasos text[])
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_con_texto text;
begin
  if not public.is_team_member() then raise exception 'no autorizado'; end if;
  if p_version is null or p_version < 1 then raise exception 'version invalida: %', p_version; end if;

  select string_agg(distinct ds.kind, ', ')
    into v_con_texto
    from public.del_sections ds
   where ds.doc_id = p_doc_id
     and ds.version = p_version
     and not (ds.kind = any(coalesce(p_pasos, array[]::text[])))
     and length(btrim(coalesce(ds.text, ''))) > 0;

  if v_con_texto is not null then
    raise exception 'No puedo sacar % de la V%: todavía tiene contenido escrito. Borrá esas secciones primero.',
      v_con_texto, p_version;
  end if;

  insert into public.del_versions (doc_id, version, pasos)
  values (p_doc_id, p_version, p_pasos)
  on conflict (doc_id, version) do update set pasos = excluded.pasos;
end
$function$;

revoke all   on function public.del_version_set_pasos(text, int, text[]) from public, anon;
grant execute on function public.del_version_set_pasos(text, int, text[]) to authenticated;

-- ── Borrar una versión también borra su ficha ───────────────────────────────
create or replace function public.del_version_delete(p_doc_id text, p_version integer, p_by text default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_n int;
begin
  if p_version is null or p_version <= 1 then
    raise exception 'No se puede borrar la versión base (V1) ni una versión inválida: %', p_version;
  end if;
  perform del_claim(p_doc_id);
  delete from del_sections where doc_id = p_doc_id and version = p_version;
  get diagnostics v_n = row_count;
  delete from public.del_versions where doc_id = p_doc_id and version = p_version;
  return v_n;
end
$function$;

-- ── Sacar una sección también saca su paso, si era la última de esa categoría ─
-- Sin esto, borrar la única Pre-landing de la V2 la haría volver vacía al minuto
-- siguiente: el menú del DEL dibuja las categorías estándar aunque no tengan nada.
create or replace function public.del_section_delete(p_id text, p_by text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_doc text; v_kind text; v_ver int; v_quedan int;
begin
  select doc_id, kind, version into v_doc, v_kind, v_ver from del_sections where id = p_id;
  if v_doc is null then return; end if;
  -- Adoptar ANTES de borrar: si no, y era la única sección 'panel', el DEL dejaría
  -- de estar adoptado y el importador volvería a agregar la que acabamos de borrar.
  perform del_claim(v_doc);
  delete from del_sections where id = p_id;

  select count(*) into v_quedan
    from del_sections where doc_id = v_doc and version = v_ver and kind = v_kind;

  if v_quedan = 0 then
    update public.del_versions
       set pasos = array_remove(pasos, v_kind)
     where doc_id = v_doc and version = v_ver and pasos is not null;
  end if;
end
$function$;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   -- Que la firma nueva exista y la vieja no:
--   select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname like 'del_version%';
--
--   -- Alta de versión con título/nota/pasos y borrado, dentro de un bloque que
--   -- termine en `raise exception` para que revierta solo.
--
-- ROLLBACK: volver a aplicar la definición viva anterior de del_version_add
-- (3 parámetros) y de del_section_delete (del_sections_v3_editable.sql:175-190).
