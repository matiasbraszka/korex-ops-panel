-- migrations/del_sections_v3_editable.sql
--
-- El DEL se vuelve EDITABLE en el panel, sin que el importador pise el trabajo.
--
-- ── El problema que resuelve ─────────────────────────────────────────────────
-- del_sections_import() hace DELETE + INSERT: relee el Doc y reemplaza las
-- secciones. del-rich-sync reescribe el html por match de titulo. Si el equipo
-- edita una seccion en el panel y despues corre cualquiera de los dos, el trabajo
-- DESAPARECE sin aviso.
--
-- ── La solucion: cutover por DEL, automatico ─────────────────────────────────
-- El primer cambio (editar/agregar/borrar una seccion) ADOPTA el DEL entero: sus
-- secciones pasan a source='panel'. Desde ahi, el importador y el rich-sync NO lo
-- tocan mas — ese DEL vive en el panel. Es el "poner el Doc en solo lectura" del
-- plan, pero por DEL y disparado por el primer edit, no un paso manual.
--
-- Los DEL que nadie tocó siguen sincronizandose del Doc como hoy.
--
-- ── Lo que esta edicion NO hace todavia ──────────────────────────────────────
-- No propaga al Google Doc ni a client_brain_docs.text (que es de donde comen los
-- agentes y el gate de descubrimiento). Editar aca acomoda la COPIA del panel. La
-- flecha inversa (que el panel alimente a los agentes) es un paso posterior, con
-- su propio commit. Por ahora: "acomodar los DEL" = ordenar la copia de lectura.
--
-- ADITIVA. Las 3 columnas nuevas arrancan con el default 'import' en las 548
-- secciones de hoy: nada cambia de comportamiento hasta el primer edit.

alter table public.del_sections
  add column if not exists source     text not null default 'import',
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by text;

do $$ begin
  alter table public.del_sections
    add constraint del_sections_source_chk check (source in ('import', 'panel'));
exception when duplicate_object then null; end $$;

-- La unica de (doc_id, ord) pasa a DEFERRABLE: agregar una seccion en el medio
-- corre los ord de las de abajo (+1), y sin deferir eso viola la unica a mitad
-- del UPDATE. Deferida, la validacion espera al fin de la transaccion.
do $$ begin
  alter table public.del_sections drop constraint if exists del_sections_doc_id_ord_key;
  alter table public.del_sections
    add constraint del_sections_doc_ord_uq unique (doc_id, ord) deferrable initially deferred;
exception when duplicate_table then null; end $$;

comment on column public.del_sections.source is
  'import = viene del Doc, la sincroniza el importador. panel = la adoptó el panel al editarla; el importador ya no la toca.';

-- ── El importador ya no pisa lo que el panel adoptó ──────────────────────────
-- Se reescribe SOLO el where: salta cualquier DEL que tenga al menos una seccion
-- source='panel'. El resto del cuerpo es identico a del_sections_v1.
create or replace function public.del_sections_import(p_doc_id text default null)
returns table(doc text, secciones bigint, chars_origen int, chars_importados bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  -- No borra las secciones de un DEL adoptado por el panel.
  delete from del_sections s
   where (p_doc_id is null or s.doc_id = p_doc_id)
     and not exists (select 1 from del_sections e where e.doc_id = s.doc_id and e.source = 'panel');

  insert into del_sections (id, doc_id, client_id, strategy_id, ord, title, kind, text, char_count)
  select
    'dsec_' || d.id || '_' || c.ord,
    d.id, d.client_id, d.strategy_id, c.ord,
    c.titulo,
    del_section_kind(c.titulo),
    c.cuerpo,
    length(c.cuerpo)
  from client_brain_docs d
  cross join lateral (
    select
      t.ord,
      trim(regexp_replace(split_part(t.chunk, E'\x02', 1), '\s+', ' ', 'g')) as titulo,
      split_part(t.chunk, E'\x02', 2)                                        as cuerpo
    from regexp_split_to_table(
           regexp_replace(d.text, '=====\s*([^=\n]{1,60}?)\s*=====', E'\x01\\1\x02', 'g'),
           E'\x01'
         ) with ordinality as t(chunk, ord)
  ) c
  where d.doc_kind = 'del'
    and (p_doc_id is null or d.id = p_doc_id)
    -- No reimporta un DEL adoptado por el panel.
    and not exists (select 1 from del_sections e where e.doc_id = d.id and e.source = 'panel')
    and c.titulo <> '';

  return query
    select d.title, count(s.id), d.char_count, coalesce(sum(s.char_count), 0)
      from client_brain_docs d
      left join del_sections s on s.doc_id = d.id
     where d.doc_kind = 'del' and (p_doc_id is null or d.id = p_doc_id)
     group by d.id, d.title, d.char_count
     order by d.title;
end
$function$;

-- ── Adoptar un DEL: sus secciones pasan a 'panel' ────────────────────────────
-- Lo llaman las 3 operaciones de edicion antes de tocar nada. Idempotente.
create or replace function public.del_claim(p_doc_id text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $function$
  update del_sections set source = 'panel'
   where doc_id = p_doc_id and source <> 'panel';
$function$;

-- El largo en texto plano de un html (para char_count). Aprox: saca las etiquetas.
create or replace function public.del_plain_len(p_html text)
returns int language sql immutable as $function$
  select length(regexp_replace(coalesce(p_html, ''), '<[^>]*>', '', 'g'))
$function$;

-- ── Guardar el contenido de una seccion ──────────────────────────────────────
create or replace function public.del_section_save(p_id text, p_html text, p_by text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_doc text;
begin
  select doc_id into v_doc from del_sections where id = p_id;
  if v_doc is null then raise exception 'seccion inexistente: %', p_id; end if;
  perform del_claim(v_doc);
  update del_sections
     set html = p_html,
         char_count = del_plain_len(p_html),
         source = 'panel',
         updated_at = now(),
         updated_by = p_by
   where id = p_id;
end
$function$;

-- ── Agregar una seccion (despues de p_after_ord; NULL = al final) ─────────────
create or replace function public.del_section_add(
  p_doc_id text, p_title text, p_kind text default 'otros',
  p_after_ord int default null, p_by text default null
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_cli text; v_strat text; v_ord int; v_id text;
begin
  select client_id, strategy_id into v_cli, v_strat from client_brain_docs where id = p_doc_id;
  if v_cli is null then raise exception 'DEL inexistente: %', p_doc_id; end if;
  perform del_claim(p_doc_id);

  if p_after_ord is null then
    select coalesce(max(ord), 0) + 1 into v_ord from del_sections where doc_id = p_doc_id;
  else
    v_ord := p_after_ord + 1;
    -- Corre las de abajo para hacer lugar (la unica es deferrable: no falla).
    update del_sections set ord = ord + 1 where doc_id = p_doc_id and ord >= v_ord;
  end if;

  v_id := 'dsecp_' || replace(gen_random_uuid()::text, '-', '');
  insert into del_sections (id, doc_id, client_id, strategy_id, ord, title, kind, text, html, char_count, source, updated_at, updated_by)
  values (v_id, p_doc_id, v_cli, v_strat, v_ord,
          coalesce(nullif(trim(p_title), ''), 'Sección nueva'),
          coalesce(nullif(p_kind, ''), 'otros'),
          '', '', 0, 'panel', now(), p_by);
  return v_id;
end
$function$;

-- ── Borrar una seccion ───────────────────────────────────────────────────────
create or replace function public.del_section_delete(p_id text, p_by text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_doc text;
begin
  select doc_id into v_doc from del_sections where id = p_id;
  if v_doc is null then return; end if;
  -- Adoptar ANTES de borrar: si no, y era la unica seccion 'panel', el DEL dejaria
  -- de estar adoptado y el importador volveria a agregar la que acabamos de borrar.
  perform del_claim(v_doc);
  delete from del_sections where id = p_id;
end
$function$;

-- ── Renombrar el titulo de una seccion ───────────────────────────────────────
create or replace function public.del_section_rename(p_id text, p_title text, p_by text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_doc text;
begin
  select doc_id into v_doc from del_sections where id = p_id;
  if v_doc is null then raise exception 'seccion inexistente: %', p_id; end if;
  perform del_claim(v_doc);
  update del_sections
     set title = coalesce(nullif(trim(p_title), ''), title),
         source = 'panel', updated_at = now(), updated_by = p_by
   where id = p_id;
end
$function$;

-- Postgres le da EXECUTE a PUBLIC por defecto al crear una funcion. Como estas son
-- SECURITY DEFINER (saltan RLS), eso dejaria que un ANONIMO edite un DEL. Se lo
-- sacamos a public/anon y se lo damos SOLO al usuario logueado del panel.
revoke all on function public.del_section_save(text, text, text)             from public, anon;
revoke all on function public.del_section_add(text, text, text, int, text)   from public, anon;
revoke all on function public.del_section_delete(text, text)                 from public, anon;
revoke all on function public.del_section_rename(text, text, text)           from public, anon;
revoke all on function public.del_claim(text)                                from public, anon;
grant execute on function public.del_section_save(text, text, text)          to authenticated;
grant execute on function public.del_section_add(text, text, text, int, text) to authenticated;
grant execute on function public.del_section_delete(text, text)              to authenticated;
grant execute on function public.del_section_rename(text, text, text)        to authenticated;

-- PostgREST cachea el esquema: sin esto, los RPC nuevos dan 404 hasta el proximo
-- reinicio. El NOTIFY lo fuerza a releer ahora.
notify pgrst, 'reload schema';

-- ── Verificacion ─────────────────────────────────────────────────────────────
-- 1. Nada cambió todavia: las 548 siguen 'import'.
--      select source, count(*) from del_sections group by source;   -- import 548
--
-- 2. Simular un edit y ver que el DEL queda adoptado (usar un id real):
--      select del_section_save('dsec_<algo>', '<p>probando</p>', 'test');
--      select doc_id, count(*) filter (where source='panel') as adoptadas
--        from del_sections where doc_id = (select doc_id from del_sections where id='dsec_<algo>')
--        group by doc_id;   -- TODAS las del doc en panel
--
-- 3. Que el importador ya no lo toca:
--      select * from del_sections_import('<ese doc_id>');  -- no borra ni reimporta
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--    Volver a aplicar del_sections_v1.sql (importador sin el guard) y:
--    drop function if exists del_section_save, del_section_add, del_section_delete,
--                            del_section_rename, del_claim, del_plain_len;
--    alter table del_sections drop column if exists source, drop column if exists updated_at,
--                             drop column if exists updated_by;
