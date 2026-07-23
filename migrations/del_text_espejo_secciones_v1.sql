-- del_text_espejo_secciones_v1 — client_brain_docs.text refleja del_sections para los DEL del panel.
--
-- PROBLEMA (fuga agentes↔DEL): cambiamos el DEL al sistema nativo (del_sections por funnel), pero
-- TODAS las funciones IA leen el DEL de client_brain_docs.text (el extractor cerebro-generate-avatars,
-- cerebro-avatares y el paso "del" de descubrimiento). Los DEL nativos creados en el panel (split de
-- Oscar, Fabiana/Ricardo, Jose Piquer, etc.) tienen .text VACÍO — su contenido vive solo en del_sections.
-- Resultado: el extractor lee un DEL vacío y no puede sacar avatares / guión VSL / copys de páginas, así
-- que los agentes trabajan sin DEL para esos funnels.
--
-- FIX: .text pasa a ser un ESPEJO de del_sections para los DEL gestionados por el panel (los que tienen
-- alguna sección source='panel', o los nativos con .text vacío). Los DEL puramente de Drive (sin secciones
-- de panel y con .text ya poblado del sync) NO se tocan: ahí el .text del Drive sigue mandando. Es el mismo
-- criterio de cutover que ya usan del_sections_import() y del-rich-sync ("si hay panel, panel gana").
--
-- Con esto NO hay que tocar ninguna edge function: el extractor y los agentes siguen leyendo .text, pero
-- ahora .text tiene el DEL nativo. Tras aplicarlo, hay que re-correr "Generar avatares del DEL" en los
-- funnels afectados para refrescar strategy_pages.{avatars,vsl_script,pages_copy} desde el DEL ya visible.

-- 1) Ensamblador: del_sections → texto plano con marcadores de sección (igual formato que el sync).
create or replace function public.del_assemble_text(p_doc_id text)
returns text language sql stable set search_path to 'public' as $$
  select string_agg(
    '===== ' || coalesce(ds.title,'(sin título)') || ' =====' || E'\n' ||
    case when coalesce(ds.html,'') <> '' then
      btrim(
        regexp_replace(
          regexp_replace(
            replace(replace(replace(replace(replace(ds.html,
              '&nbsp;',' '), '&amp;','&'), '&lt;','<'), '&gt;','>'), '&#39;',''''),
          '<[^>]+>', ' ', 'g'),        -- saca tags
        '[ \t]+\n', E'\n', 'g')        -- limpia espacios antes de salto
      )
    else coalesce(ds.text,'') end,
    E'\n\n' order by ds.ord)
  from del_sections ds
  where ds.doc_id = p_doc_id and coalesce(ds.status,'activa') <> 'archivada';
$$;

-- 2) Trigger: mantiene client_brain_docs.text = del_assemble_text para los DEL del panel.
create or replace function public.trg_del_sections_sync_text()
returns trigger language plpgsql set search_path to 'public' as $$
declare
  v_doc text := coalesce(new.doc_id, old.doc_id);
  v_es_panel boolean;
  v_len_actual int;
  v_txt text;
begin
  if v_doc is null then return null; end if;
  select exists(select 1 from del_sections where doc_id = v_doc and source = 'panel') into v_es_panel;
  select coalesce(length(text),0) from client_brain_docs where id = v_doc into v_len_actual;
  -- DEL de Drive (sin secciones de panel) con .text ya poblado: no se toca, manda el Drive.
  if not v_es_panel and coalesce(v_len_actual,0) >= 15000 then
    return null;
  end if;
  v_txt := public.del_assemble_text(v_doc);
  update client_brain_docs
     set text = coalesce(v_txt,''), char_count = length(coalesce(v_txt,''))
   where id = v_doc;
  return null;
end $$;

drop trigger if exists del_sections_sync_text on public.del_sections;
create trigger del_sections_sync_text
  after insert or update or delete on public.del_sections
  for each row execute function public.trg_del_sections_sync_text();

-- 3) Backfill único: llena .text de los DEL del panel que hoy lo tienen vacío/corto pero con secciones.
update client_brain_docs c
   set text = public.del_assemble_text(c.id),
       char_count = length(public.del_assemble_text(c.id))
 where c.doc_kind = 'del'
   and coalesce(length(c.text),0) < 15000
   and exists (select 1 from del_sections ds where ds.doc_id = c.id
               and coalesce(ds.status,'activa') <> 'archivada'
               and coalesce(length(ds.html), length(ds.text), 0) > 0);
