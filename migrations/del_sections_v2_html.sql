-- migrations/del_sections_v2_html.sql
--
-- El DEL con su formato: titulos, negritas, colores, tablas y links.
--
-- ── Donde se perdia ──────────────────────────────────────────────────────────
-- No era el importador. Era el script de Google: read_doc usa
-- `dt.getBody().getText()` (crear-carpetas-cliente.gs:297), que devuelve TEXTO
-- PELADO. El formato moria ahi, antes de que nada llegara a la base — por eso un
-- titulo como "CONCLUSIONES DE LA ESTRATEGIA SEGUN TODA ESTA INFORMACION" llegaba
-- como texto en mayusculas: las mayusculas eran lo unico que sobrevivia del enfasis.
--
-- ── El arreglo ───────────────────────────────────────────────────────────────
-- Accion NUEVA en el Apps Script: `read_doc_rich`. Recorre las MISMAS pestañas que
-- read_doc (mismo walk, el que arreglo el bug de "solo leia la primera pestaña")
-- pero serializa la estructura en vez del texto. read_doc NO se toca: de su formato
-- "===== Titulo =====" comen parseDelTabs, resolverVsl, LANDING_RE y pages_copy.
--
-- ── Por que HTML y no ProseMirror JSON ───────────────────────────────────────
-- El plan decia "ProseMirror JSON, nunca HTML", y sigue siendo cierto PARA EL
-- EDITOR: sin modelo de documento no hay comentarios anclados ni historial. Pero
-- para LEER, el HTML alcanza — y no es trabajo tirado: TipTap parsea HTML a su
-- modelo cuando el editor llegue. Asi que el HTML es el paso intermedio honesto,
-- no un atajo que haya que rehacer.
--
-- ── Progresivo a proposito ───────────────────────────────────────────────────
-- La columna arranca NULL. Mientras el Apps Script no este deployado (lo tiene que
-- hacer Matias: el script vive en su cuenta, no en el repo), el lector muestra el
-- `text` de siempre. Cuando se deploye y corra el sync, aparece el formato. No hay
-- ventana rota en el medio.
--
-- ADITIVA E INERTE.

alter table public.del_sections
  add column if not exists html      text,
  add column if not exists html_at   timestamptz;

comment on column public.del_sections.html is
  'La seccion con su formato (titulos, negritas, colores, tablas, links), de read_doc_rich. NULL = todavia no se sincronizo: el lector cae al text plano.';
comment on column public.del_sections.html_at is
  'Cuando se trajo el html. Sirve para ver que DEL quedaron sin sincronizar.';

-- ── Verificacion ─────────────────────────────────────────────────────────────
-- 1. Antes de deployar el Apps Script: todo en NULL, el lector sigue mostrando texto.
--      select count(*) filter (where html is not null) as con_formato,  -- 0
--             count(*)                                 as secciones     -- 548
--        from del_sections;
--
-- 2. Despues de deployar + correr el sync:
--      select count(*) filter (where html is not null) as con_formato,
--             count(*) filter (where html is null)     as sin_sincronizar
--        from del_sections;
--
-- 3. Que el html sea html de verdad y no texto escapado:
--      select title, left(html, 120) from del_sections
--       where html is not null and html ~ '<(h[1-6]|strong|table)' limit 5;
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--    alter table public.del_sections drop column if exists html,
--                                    drop column if exists html_at;
