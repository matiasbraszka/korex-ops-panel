-- strategy_pages_pages_copy_v1 — copy de las páginas del funnel, extraído del DEL.
--
-- Igual que vsl_script: NO se edita a mano. La fuente de verdad es el Google Doc (DEL).
-- Se actualiza el documento y se aprieta "Generar avatares del DEL". El texto se copia
-- VERBATIM (la IA solo identifica QUÉ pestaña es cada página; el código corta).
--
-- Para qué: el agente de anuncios escribía a ciegas sobre el destino. La pre-landing es la
-- primera pantalla que ve la persona apenas hace clic en el anuncio: si su titular y el
-- anuncio no se sienten la misma conversación, el lead rebota. Estas secciones YA estaban
-- en el DEL y se descartaban (ver LANDING_RE en cerebro-generate-avatars).
--
-- Forma: objeto con clave por página. Solo aparecen las que SE ENCONTRARON.
--   {"prelanding": {"title":"Antesala", "text":"…"},
--    "landing":    {"title":"Landing parte 1 + Landing parte 2", "text":"…"},
--    "formulario": {…}, "thankyou": {…}, "testimonios": {…}}
--
-- `title` = la(s) pestaña(s) REAL(es) del DEL de donde salió (el copy de una página puede estar
-- repartido en varias). Sirve para auditar: si se equivocó de sección, se ve de dónde la sacó.
--
-- Claves válidas: prelanding | landing | formulario | thankyou | testimonios.
-- El FEEDBACK no entra: es lo que el EQUIPO anota sobre las páginas (esas hojas del DEL suelen
-- decir "MODIFICACIONES DE LA PRE-LANDING…"), no algo que la persona vea. No es del recorrido.
-- La pre-landing es la más importante para los agentes: por eso clave fija y no un array,
-- así se lee con pages_copy->'prelanding' sin tener que buscar.
--
-- Si el DEL trae versión VIEJA y NUEVA del mismo tipo, gana la NUEVA (misma regla que ya aplican
-- los anuncios y la VSL). Una página vacía, en construcción, o que es solo un título suelto NO se
-- guarda: no existe todavía. Un funnel con 3 de 6 páginas es un resultado válido y esperado.
alter table public.strategy_pages
  add column if not exists pages_copy jsonb not null default '{}'::jsonb,
  -- Red de "Deshacer", gemela de vsl_script_backup: el panel guarda acá el estado
  -- ANTERIOR justo antes de que la IA lo pise.
  add column if not exists pages_copy_backup jsonb;

-- Sin índice: nunca se filtra por este campo, se lee siempre por el id del funnel.
-- Sin cambios de RLS: las políticas de strategy_pages son a nivel tabla, la columna hereda.
