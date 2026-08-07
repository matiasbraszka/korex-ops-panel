-- Limpieza de mojibake en el corpus del agente de Anuncios (marketing_ad_library).
--
-- El corpus de Anuncios (part='example' y part='blueprint_section') se ingirió por una vía
-- que rompió los emojis: la codificación se degradó y de cada emoji (🏆, 👇, 🙌🏼, etc.)
-- sobrevivió solo un byte huérfano que quedó como 'ð' (y a veces '¼'/'¾' del modificador de
-- tono de piel). Las continuaciones del emoji se perdieron en la ingesta, así que el emoji
-- original es IRRECUPERABLE — no se puede saber cuál era. La corrección correcta es quitar la
-- basura: el copy lee perfecto sin esos emojis, y mucho mejor que enseñándole al agente a
-- escribir 'ð'.
--
-- Alcance medido antes de aplicar:
--   - example:           90/159 filas con mojibake
--   - blueprint_section: 25/38  filas con mojibake
--   - Total 'ð': 115 filas.  Todos los '¼'/'¾' aparecen SOLO en filas que también tienen 'ð'
--     (0 casos de '¼' legítimo tipo "¼ de kilo") → el borrado en bloque es seguro.
--   - VSL (vsl_guion/vsl_ficha) y Copy de Funnels (cf_pagina/cf_ficha): 0 mojibake, no se tocan.
--
-- Quita clusters de orphans y el espacio que quedaba pegado ("ð En 2 años" -> "En 2 años").

update marketing_ad_library
set content = regexp_replace(content, '[ðÿ¼¾]+ ?', '', 'g')
where part in ('example','blueprint_section')
  and content ~ '[ðÿ¼¾]';

-- Verificación esperada: 0
-- select count(*) from marketing_ad_library
-- where part in ('example','blueprint_section') and content ~ '[ðÿ¼¾]';
