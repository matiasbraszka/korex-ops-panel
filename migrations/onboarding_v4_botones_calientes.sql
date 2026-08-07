-- migrations/onboarding_v4_botones_calientes.sql
--
-- BOTONES CALIENTES: separar los de PRODUCTO de los de OPORTUNIDAD, explicar qué son,
-- y dejar escribir uno propio.
--
-- El problema: los pasos 4A (Tu producto) y 4B (Tu oportunidad de negocio) ofrecían
-- EXACTAMENTE las mismas siete opciones — tiempo extra, ingreso extra, libertad
-- financiera, viajar, desarrollo personal, jubilación, contribución.
--
-- Esas siete son los botones del NEGOCIO: los motivos por los que alguien se suma a
-- una oportunidad. En 4B están bien. En 4A no describen a nadie: nadie compra un
-- producto de bienestar para asegurarse la jubilación. O sea que el cliente marcaba
-- chips que no decían nada de su comprador, y eso es lo que después leen los agentes
-- para escribir los anuncios de producto.
--
-- Un botón caliente es el motivo emocional por el que alguien actúa: no el problema
-- que tiene (eso es el dolor) ni lo que hace el producto (eso es el beneficio), sino
-- LO QUE QUIERE QUE LE PASE. Dolor y botón caliente son el mismo eje en las dos puntas;
-- por eso en el DEL las dos preguntas van pegadas.
--
-- Además, las dos listas suman "Otros", que abre un campo libre en el portal
-- (Campo.jsx → Chispas). Una lista cerrada obliga a encajar en una casilla que a veces
-- no es la de esa persona, y eso se le nota al copy.

-- ── 4A · Tu producto ─────────────────────────────────────────────────────────
update public.onboarding_questions
   set sublabel = 'El botón caliente es el motivo emocional por el que alguien compra: '
                || 'no el problema que tiene ni lo que hace el producto, sino lo que quiere '
                || 'que le pase. Si el dolor es «me levanto agotada», el botón caliente es '
                || '«quiero volver a tener energía». Marca solo los que de verdad mueven a tu gente.',
       opciones = jsonb_build_array(
         jsonb_build_object('value','verse_mejor',   'label','Verse mejor',                      'hint','Recuperar la imagen que tenía, que se le note'),
         jsonb_build_object('value','energia',       'label','Tener energía',                    'hint','Dejar de arrastrarse, llegar entero al final del día'),
         jsonb_build_object('value','salud',         'label','Salud y prevención',               'hint','Envejecer bien, no terminar como terminó alguien de su familia'),
         jsonb_build_object('value','cuerpo',        'label','Cambiar su cuerpo',                'hint','Bajar de peso, tonificar, volver a entrar en su ropa'),
         jsonb_build_object('value','descanso',      'label','Dormir y descansar',               'hint','Descansar de verdad y levantarse distinto'),
         jsonb_build_object('value','confianza',     'label','Confianza y autoestima',           'hint','Volver a mirarse al espejo sin esquivar'),
         jsonb_build_object('value','dolor_fisico',  'label','Sacarse una molestia de encima',   'hint','Dolores, digestión, piel: convivir con eso lo tiene cansado'),
         jsonb_build_object('value','volver_hacer',  'label','Volver a hacer lo que dejó',       'hint','Jugar con los hijos, entrenar, salir sin pensarlo'),
         jsonb_build_object('value','dejar_probar',  'label','Dejar de probar cosas que fallan', 'hint','Cansancio de gastar en diez soluciones que no funcionaron'),
         jsonb_build_object('value','otros',         'label','Otros',                            'hint','Escríbelo con tus palabras')
       ),
       updated_at = now()
 where qkey = 'av_prod_botones';

-- ── 4B · Tu oportunidad de negocio ───────────────────────────────────────────
-- Las siete de siempre (acá SÍ corresponden) + la explicación y "Otros".
update public.onboarding_questions
   set sublabel = 'El botón caliente es el motivo emocional por el que alguien se suma al '
                || 'negocio: no su problema de hoy ni lo que ofrece la empresa, sino lo que '
                || 'quiere que cambie en su vida. Si el dolor es «no me alcanza el sueldo», el '
                || 'botón caliente es «quiero un ingreso extra». Marca solo los que de verdad '
                || 'mueven a tu gente.',
       opciones = jsonb_build_array(
         jsonb_build_object('value','tiempo',       'label','Tiempo extra',         'hint','Dejar de vivir corriendo, estar más con los suyos'),
         jsonb_build_object('value','ingreso',      'label','Ingreso extra',        'hint','Que llegue a fin de mes sin ahogarse'),
         jsonb_build_object('value','libertad',     'label','Libertad financiera',  'hint','Dejar de depender de un sueldo o un jefe'),
         jsonb_build_object('value','viajar',       'label','Viajar',               'hint','Conocer, moverse, no pedir permiso para eso'),
         jsonb_build_object('value','desarrollo',   'label','Desarrollo personal',  'hint','Crecer, aprender, convertirse en otra persona'),
         jsonb_build_object('value','jubilacion',   'label','Jubilación',           'hint','Asegurar el futuro, no depender de nadie de grande'),
         jsonb_build_object('value','contribucion', 'label','Contribución',         'hint','Ayudar a otros, dejar algo'),
         jsonb_build_object('value','otros',        'label','Otros',                'hint','Escríbelo con tus palabras')
       ),
       updated_at = now()
 where qkey = 'av_op_botones';

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   select qkey, jsonb_array_length(opciones) from onboarding_questions
--    where qkey in ('av_prod_botones','av_op_botones');   -- 10 y 8
--
-- ROLLBACK: las siete de siempre en las dos y sublabel = null.
