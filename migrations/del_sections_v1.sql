-- migrations/del_sections_v1.sql
--
-- El DEL deja de ser UN CHORIZO DE TEXTO y pasa a ser secciones.
--
-- Es el primer paso de la Etapa B (el DEL adentro del panel). Sin esto no hay
-- forma de mostrarlo por secciones, ni de comentar una, ni de editarla despues.
--
-- ── El contrato de formato ───────────────────────────────────────────────────
-- Apps Script (crear-carpetas-cliente.gs:299, action "read_doc") lee TODAS las
-- pestañas del Google Doc y las serializa como:
--
--     ===== Titulo de la pestaña =====
--     <cuerpo>
--
-- VERIFICADO 2026-07-17: los 36 DEL tienen el marcador. Los 36. Por eso el
-- importador parte por REGLA FIJA y no necesita IA para nada.
--
-- Medido: 548 secciones en 36 DEL = 15,2 por DEL, 2.037.919 caracteres.
--
-- ── Por que 12 kinds y no los 9 de la maqueta ────────────────────────────────
-- Los DEL NO estan estandarizados: 218 nombres distintos para 548 secciones
-- ("landing page vsl" 17 veces / "landing vsl" 5 / "landing 1 pasos" 23 = la
-- misma idea escrita de 3 formas). Con los 9 slots de la maqueta, 102 secciones
-- (19%) se quedaban sin lugar. Dos casos se comian ese 19% enterito:
--
--   · "Estado del pipeline" (29 de 36) -> es la tabla que el equipo mantiene A
--     MANO en el Doc y que el riel del panel YA CALCULA SOLO. Se importa con su
--     kind propio para que se vea que existe, pero es la seccion que se MUERE en
--     el cutover: es la prueba de que el panel reemplaza al Doc.
--   · "Mensajes pre-armados" (29 de 36) -> contenido real, sin lugar en la
--     maqueta. Se le da el suyo.
--
-- Con esos dos + el cajon 'otros', lo que no encaja baja de 19% a 7,3% (40
-- secciones, 37 nombres distintos: feedback, branding, competidores, copy para
-- ebook, fotos y recursos...). Ninguna se pierde: 'otros' las guarda con su
-- titulo real. Un importador que tira el 7% del documento no es un importador.
--
-- ── Que NO decide esta migracion ─────────────────────────────────────────────
-- Si el DEL es de un funnel o de una campaña. Hoy es de la CARPETA (strategy_id)
-- y 8 carpetas lo comparten entre varios funnels — y esta bien: Summit Network
-- tiene 4 funnels con un DEL porque son 4 segmentos de una estrategia. Las
-- secciones cuelgan del DOC, no del funnel: quien lo ve es una decision de
-- pantalla, posterior. Esta migracion no la prejuzga.
--
-- ADITIVA E INERTE: tabla nueva que ningun codigo lee todavia. No cambia nada.

create table if not exists public.del_sections (
  id          text primary key,
  doc_id      text not null references public.client_brain_docs(id) on delete cascade,
  client_id   text not null references public.clients(id) on delete cascade,
  strategy_id text,
  ord         int  not null,          -- orden en el documento (respeta las pestañas)
  title       text not null,          -- el titulo TAL CUAL, sin normalizar
  kind        text not null,          -- el canonico (ver del_section_kind)
  text        text not null default '',
  char_count  int  not null default 0,
  imported_at timestamptz not null default now(),
  unique (doc_id, ord)
);

create index if not exists del_sections_doc_idx      on public.del_sections(doc_id);
create index if not exists del_sections_client_idx   on public.del_sections(client_id);
create index if not exists del_sections_strategy_idx on public.del_sections(strategy_id);
create index if not exists del_sections_kind_idx     on public.del_sections(kind);

-- Mismo criterio que client_brain_docs: lee el que esta logueado, escribe SOLO el
-- importador (que es security definer). Sin policies de INSERT/UPDATE a proposito.
alter table public.del_sections enable row level security;
drop policy if exists del_sections_read on public.del_sections;
create policy del_sections_read on public.del_sections
  for select to authenticated using (true);

-- ── El mapa: 218 nombres -> 12 secciones ─────────────────────────────────────
-- EL ORDEN DE LOS CASE IMPORTA y no es arbitrario:
--   · "VSL Avatar 1" es el guion del VSL, no una seccion de avatares -> vsl gana.
--   · "Ads avatar 2" es un anuncio -> anuncios gana.
--   · "Analisis de avatar" no matchea ninguno de los dos -> cae en avatares.
-- Mover un case de lugar reclasifica secciones. Si se toca, re-correr la
-- verificacion de abajo y comparar los conteos.
create or replace function public.del_section_kind(p_title text)
returns text
language sql
immutable
as $function$
  select case
    when p_title ~* 'estado del pipeline'     then 'pipeline_viejo'
    when p_title ~* 'mensaje'                 then 'mensajes'
    when p_title ~* '\mvsl|gui[oó]n'          then 'vsl'
    when p_title ~* 'anuncio|\mads\M'         then 'anuncios'
    when p_title ~* 'avatar'                  then 'avatares'
    when p_title ~* 'pre-?landing'            then 'pg_prelanding'
    when p_title ~* 'thank|\mtyp\M|gracias'   then 'pg_thankyou'
    when p_title ~* 'formulario'              then 'pg_formulario'
    when p_title ~* 'testimonio'              then 'pg_testimonios'
    when p_title ~* 'landing|\mbcl\M'         then 'pg_landing'
    when p_title ~* 'estrategia|an[aá]lisis'  then 'estrategia'
    else 'otros'
  end
$function$;

-- ── El importador ────────────────────────────────────────────────────────────
-- Idempotente: borra e importa de nuevo. Sin argumento hace los 36; con un
-- doc_id, solo ese.
--
-- El truco del corte: un split comun por el marcador PIERDE el titulo (se lo come
-- el separador). Asi que primero se reemplaza "===== T =====" por
-- "\x01 T \x02" (dos caracteres de control que no pueden aparecer en un Doc), se
-- parte por \x01, y cada pedazo queda "titulo\x02cuerpo".
--
-- WITH ORDINALITY y no row_number(): garantiza el orden real de las pestañas.
-- Con row_number() over () el orden es tecnicamente indefinido.
create or replace function public.del_sections_import(p_doc_id text default null)
returns table(doc text, secciones bigint, chars_origen int, chars_importados bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  delete from del_sections s
   where p_doc_id is null or s.doc_id = p_doc_id;

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
    -- El primer pedazo es lo que va ANTES del primer marcador (preambulo). En los
    -- 36 DEL viene vacio, pero si algun dia trae algo se descarta a proposito: no
    -- pertenece a ninguna pestaña.
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

-- ── Verificacion (correr despues de aplicar) ─────────────────────────────────
-- 1. Importar todo y ver el reporte por DEL:
--      select * from del_sections_import();
--    'chars_importados' siempre da MENOS que 'chars_origen': la diferencia son los
--    marcadores "===== ... =====" y los saltos de linea que los rodean, que no son
--    contenido. Una diferencia GRANDE en un DEL puntual si es sospechosa.
--
-- 2. Nada se perdio: cada DEL tiene secciones, y la suma cierra.
--      select count(*) as dels, sum(secciones) as secciones_total
--        from del_sections_import();
--      -- esperado: 36 DEL / ~548 secciones
--
--      select count(*) from client_brain_docs d
--       where d.doc_kind='del'
--         and not exists (select 1 from del_sections s where s.doc_id = d.id);
--      -- esperado: 0  (ningun DEL quedo sin importar)
--
-- 3. El reparto por seccion:
--      select kind, count(*) from del_sections group by kind order by 2 desc;
--      -- esperado ~: vsl 88 · anuncios 64 · pg_thankyou 64 · pg_formulario 51 ·
--      --   avatares 41 · otros 40 · pg_prelanding 39 · pg_landing 35 ·
--      --   estrategia 34 · mensajes 33 · pg_testimonios 30 · pipeline_viejo 29
--
-- 4. Lo que quedo en 'otros' (tiene que ser cola larga de una sola aparicion):
--      select title, count(*) from del_sections where kind='otros'
--       group by title order by 2 desc limit 20;
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--    drop function if exists public.del_sections_import(text);
--    drop function if exists public.del_section_kind(text);
--    drop table if exists public.del_sections;
