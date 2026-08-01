-- informe_ads_v5_config_estandar
-- Deja la configuración del informe diario en su estado acordado, para poder
-- reconstruirla si alguien la pisa. Todo va con MERGE (`value || '{...}'`), nunca
-- reescribiendo la fila entera: Matías corre varias sesiones en paralelo y un
-- overwrite se lleva puesto lo que esté haciendo la otra.

-- 1) Páginas de gracias: NO son registros.
--    `visita-thankyou-*` dispara DESPUÉS del alta. Contarla es contar dos veces al
--    mismo lead. Aparece en Mónica (808 en 90d), Corina (107), JL Rodriguez (21) y
--    Sergio Canovas (1). Los prelanding ya se filtraban por heurística en el código;
--    esta lista es el ajuste fino sin tocar la función.
--    OJO: el evento principal del cliente (meta_metrics.conversionEvent) manda por
--    encima de esta lista — si el alta real se llamara "gracias-algo", se sigue contando.
update app_settings
set value = value || '{"web_event_exclude":["thankyou","thank-you","thank_you","gracias"]}'::jsonb
where key = 'meta_ads_sync_config';

-- 2) Evento de conversión -> nombre del funnel, para las sub-filas del informe.
--    Sin mapear igual se muestra (el código le saca el prefijo `visita-pagina-vsl-`),
--    así que esto es sólo para que se lea lindo. Un funnel nuevo NO necesita alta acá.
update app_settings
set value = value || '{
  "visita-vsl-summit": "V1 Jonathan",
  "visita-pagina-vsl-martha": "belleza",
  "visita-pagina-vsl-madeleine": "madelaire",
  "visita-pagina-vsl-madres-v1": "madres",
  "visita-pagina-vsl-marca-personal": "marca personal",
  "visita-pagina-travorium-vsl": "travorium",
  "completo-registro-travorium-preregistro": "travorium",
  "visita-pagina-vsl-viajeros": "viajeros",
  "visita-pagina-vsl-monica": "monica",
  "visita-pagina-vsl-prescila": "priscila",
  "visita-pagina-vsl-sergio-aldazabal": "aldazabal",
  "visita-pagina-vsl-sergio-v1": "V1",
  "visitaPaginaVSL": "VSL (viejo)",
  "visita-pagina-vsl-jose-piquer": "jose piquer",
  "visita-pagina-vsl-janeyling": "janeyling",
  "visita-pagina-vsl-skincare": "skincare",
  "visita-pagina-vsl-elite-club": "elite club"
}'::jsonb
where key = 'funnel_names';

-- 3) Un solo emisor en #informe-diario-adds (C0AD8SP97GS).
--    La auditoría de cuentas huérfanas posteaba ahí cada 3 días — y como el conector
--    Meta está caído, lo que posteaba era "Conector Meta caído" CON menciones @, una
--    hora después del informe. Se muda a #marketing.
update app_settings
set value = value || '{"slack_channel":"C0AD6U6J685"}'::jsonb
where key = 'meta_orphan_config';

-- Verificación
select key, jsonb_pretty(value) from app_settings
where key in ('informe_ads_config','meta_ads_sync_config','funnel_names','meta_orphan_config')
order by key;
