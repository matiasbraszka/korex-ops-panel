-- migrations/del_sections_v6_versiones.sql
--
-- VERSIONADO de assets dentro del DEL (pedido de Matías).
--
-- Regla de negocio: 1 avatar por funnel, IGUAL en todas las versiones → el avatar
-- NUNCA versiona. Lo que sí versiona (a veces sí, a veces no) es todo lo que deriva
-- del avatar: VSL, Anuncios, Pre-landing, Landing, Formulario, Thank you.
--
-- En vez del hack de hoy (crear un funnel " V2" aparte, que duplica el avatar y
-- ensucia la carpeta), la versión es un ATRIBUTO de la sección. Un funnel = un DEL;
-- adentro, cada asset puede tener varias versiones y una marcada "en vivo".
--
-- Dos columnas nuevas por sección:
--   version : entero (1, 2, 3…) = la iteración del asset.
--   status  : activa | test | borrador | archivada
--
--   activa    = corriendo ahora (lo que está en vivo del funnel).
--   test      = variante A/B que convive con la activa (tráfico dividido).
--   borrador  = la próxima versión, preparándose (todavía no salió).
--   archivada = versión vieja, se guarda de referencia.
--
-- "Lo que está en vivo" = las secciones status='activa'. El sistema no adivina: lee
-- el flag. ADITIVA: las 500+ secciones de hoy arrancan version=1, status='activa'
-- → nada cambia de comportamiento hasta que alguien cree una V2.

alter table public.del_sections
  add column if not exists version int  not null default 1,
  add column if not exists status  text not null default 'activa';

do $$ begin
  alter table public.del_sections
    add constraint del_sections_status_chk check (status in ('activa','test','borrador','archivada'));
exception when duplicate_object then null; end $$;

comment on column public.del_sections.version is
  'Iteración del asset (1,2,3…). El avatar no versiona; VSL/Anuncios/Páginas sí.';
comment on column public.del_sections.status is
  'activa=en vivo · test=A/B contra la activa · borrador=preparándose · archivada=versión vieja.';

-- ── Crear una versión nueva a partir de una sección (V+1, arranca en borrador) ───
-- Clona la sección (misma categoría, mismo título, copia el contenido) con la
-- próxima versión de ese asset y status='borrador'. Queda justo debajo de la origen.
create or replace function public.del_section_new_version(p_id text, p_by text default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_doc text; v_cli text; v_strat text; v_kind text; v_title text; v_html text; v_text text;
  v_ord int; v_ver int; v_id text;
begin
  select doc_id, client_id, strategy_id, kind, title, html, text, ord
    into v_doc, v_cli, v_strat, v_kind, v_title, v_html, v_text, v_ord
    from del_sections where id = p_id;
  if v_doc is null then raise exception 'sección inexistente: %', p_id; end if;
  perform del_claim(v_doc);

  -- Próxima versión de ESTE asset = misma categoría dentro del mismo DEL.
  select coalesce(max(version), 0) + 1 into v_ver
    from del_sections where doc_id = v_doc and kind = v_kind;

  -- Hago lugar: corro las de abajo (+1). La única (doc_id,ord) es deferrable → no falla.
  update del_sections set ord = ord + 1 where doc_id = v_doc and ord > v_ord;

  v_id := 'dsecp_' || replace(gen_random_uuid()::text, '-', '');
  insert into del_sections (id, doc_id, client_id, strategy_id, ord, title, kind, text, html,
                            char_count, source, version, status, updated_at, updated_by)
  values (v_id, v_doc, v_cli, v_strat, v_ord + 1, v_title, v_kind,
          coalesce(v_text, ''), coalesce(v_html, ''), del_plain_len(coalesce(v_html, '')),
          'panel', v_ver, 'borrador', now(), p_by);
  return v_id;
end
$function$;

-- ── Marcar una versión "en vivo" (archiva la que estaba en vivo del mismo asset) ─
-- Es el "sale la V2": la nueva pasa a activa y la anterior activa de esa categoría
-- pasa a archivada. Los test conviven; solo se toca la que estaba activa.
create or replace function public.del_section_go_live(p_id text, p_by text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_doc text; v_kind text;
begin
  select doc_id, kind into v_doc, v_kind from del_sections where id = p_id;
  if v_doc is null then raise exception 'sección inexistente: %', p_id; end if;
  perform del_claim(v_doc);
  update del_sections set status = 'archivada', updated_at = now(), updated_by = p_by
   where doc_id = v_doc and kind = v_kind and status = 'activa' and id <> p_id;
  update del_sections set status = 'activa', source = 'panel', updated_at = now(), updated_by = p_by
   where id = p_id;
end
$function$;

-- ── Cambiar el estado de una sección (borrador ↔ test ↔ archivada) ──────────────
-- Para "en vivo" usar del_section_go_live (que archiva la anterior). Este es el
-- cambio libre entre los otros estados.
create or replace function public.del_section_set_status(p_id text, p_status text, p_by text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_doc text;
begin
  if p_status not in ('activa','test','borrador','archivada') then
    raise exception 'status inválido: %', p_status;
  end if;
  select doc_id into v_doc from del_sections where id = p_id;
  if v_doc is null then raise exception 'sección inexistente: %', p_id; end if;
  perform del_claim(v_doc);
  update del_sections set status = p_status, source = 'panel', updated_at = now(), updated_by = p_by
   where id = p_id;
end
$function$;

-- SECURITY DEFINER: se lo sacamos a public/anon, solo el usuario logueado del panel.
revoke all   on function public.del_section_new_version(text, text)       from public, anon;
revoke all   on function public.del_section_go_live(text, text)           from public, anon;
revoke all   on function public.del_section_set_status(text, text, text)  from public, anon;
grant execute on function public.del_section_new_version(text, text)      to authenticated;
grant execute on function public.del_section_go_live(text, text)          to authenticated;
grant execute on function public.del_section_set_status(text, text, text) to authenticated;

-- PostgREST cachea el esquema: sin esto los RPC nuevos dan 404 hasta el próximo reinicio.
notify pgrst, 'reload schema';
