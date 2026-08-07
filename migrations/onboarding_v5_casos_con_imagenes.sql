-- migrations/onboarding_v5_casos_con_imagenes.sql
--
-- ADJUNTAR IMÁGENES EN LOS CASOS DE ÉXITO (4A producto y 4B oportunidad).
--
-- Los testimonios son el material donde la captura vale más que la descripción: el
-- antes/después, el mensaje de WhatsApp del cliente contento, la foto del cheque.
-- Escribirlo "a mano" pierde justamente la prueba.
--
-- No hace falta un tipo de pregunta nuevo: alcanza con darle a la pregunta de texto
-- una carpeta (`bucket_key`). El portal ahora, cuando una pregunta `abierta` tiene
-- carpeta, muestra el texto Y una zona compacta para adjuntar (Campo.jsx).
--
-- Dónde caen: `portal_cliente_registrar_recurso` con carpeta 'testimonios' y sin
-- funnel las guarda a nivel CLIENTE, que en el panel es la carpeta
-- «Testimonios del cliente» (FunnelsView.jsx:111) — la misma donde ya llegan los
-- testimonios del paso 18. No se inventa un lugar nuevo.
--
-- Se aceptan solo imágenes: los videos de testimonio tienen su propio paso (18),
-- con su cupo y su seguimiento; mezclarlos acá rompería ese conteo.

update public.onboarding_questions
   set bucket_key       = 'testimonios',
       archivo_cta      = 'Adjuntar capturas o fotos',
       archivo_hint     = 'Opcional: el antes/después, el mensaje del cliente, la captura de resultados. '
                       || 'Van a la carpeta de Testimonios junto con el resto de tu material.',
       archivo_accept   = 'image/*',
       archivo_multiple = true,
       updated_at       = now()
 where qkey in ('producto_casos', 'op_casos');

-- De paso: pregunta vacía que quedó de una prueba en el constructor. Está activa y
-- sin texto, o sea que al cliente le aparece un campo en blanco sin saber qué poner.
-- Se desactiva (nunca se borra: las respuestas dadas se conservan).
update public.onboarding_questions
   set activa = false, updated_at = now()
 where qkey = 'p4a_p15' and coalesce(btrim(label), '') = '';

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   select qkey, qtype, bucket_key, archivo_accept from onboarding_questions
--    where qkey in ('producto_casos','op_casos');   -- abierta · testimonios · image/*
--
-- ROLLBACK: bucket_key = null en esas dos (y activa = true en p4a_p15).
