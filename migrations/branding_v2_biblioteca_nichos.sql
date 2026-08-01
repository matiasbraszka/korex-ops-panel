-- migrations/branding_v2_biblioteca_nichos.sql
--
-- ⚠️  ESTE ARCHIVO YA SE APLICÓ Y QUEDÓ VIEJO. NO LO VUELVAS A CORRER.
--
--     Las fichas que están vivas en la base son mejores que estas: se reescribieron a partir
--     del branding REAL de los clientes (scripts/branding-corpus-analizar.mjs, que mira las
--     imágenes) y después se les sumó la paleta estándar de cada nicho que definió Matías
--     (scripts/branding-estandar-nichos.mjs). Re-correr este .sql las pisaría con la versión
--     inicial, escrita a mano y sin ver el material.
--
--     Para editarlas: Marketing › Biblioteca, o los dos scripts de arriba. La base manda.
--     Este archivo queda como registro de cómo arrancó la biblioteca.
--
-- BIBLIOTECA DE ESTILO POR NICHO para el botón "Generar branding".
--
-- Es lo que hace que un cliente de salud no termine con el logo de una fintech. Cada ficha
-- se le pasa VERBATIM al director de arte (Claude) antes de que decida paletas y logos.
--
-- Vive en marketing_ad_library con part='branding_nicho' en vez de en una tabla propia:
-- esa tabla ya tiene niche / niche_tags / content / status / position, ya la edita el equipo
-- desde el panel sin necesidad de deploy, y agent-chat ya usa el mismo patrón de discriminar
-- corpus por 'part'. Una constante en el código obligaría a deployar para cambiar un color.
--
-- niche_tags es lo que salva los nichos mal cargados: hay clientes con niche='zinzino' o
-- 'bitradex' (el nombre de la empresa en vez del rubro). Los tags los pescan igual.
--
-- Estas fichas son el punto de partida. Cuando un branding salga feo, se corrige LA FICHA
-- (desde el panel, sin deploy) y el próximo cliente de ese nicho sale mejor.

delete from public.marketing_ad_library where part = 'branding_nicho';

insert into public.marketing_ad_library (id, part, niche, niche_tags, title, content, status, position) values

('bn_general', 'branding_nicho', 'general',
 array['general','network marketing','mlm','multinivel','negocio','emprendimiento','liderazgo'],
 'Branding — base para cualquier nicho',
$$NICHO: General (cuando no matchea ninguno específico)

REGISTRO: autoridad tranquila. El líder no grita, no promete millones, no muestra Lamborghinis.
La marca tiene que parecer la de un profesional serio que además es cercano.

FAMILIAS CROMÁTICAS QUE FUNCIONAN:
- Azul profundo (#12294A, #1B3A61) con un neutro cálido (#F2EFE9) y un acento sobrio (#C9922E).
- Verde petróleo (#123F3A, #1C5C55) con crema (#F4F1EA).
- Grafito (#1E2128) con un solo acento saturado (#D9531E o #2E7D6F).

EVITAR SIEMPRE: degradados neón, dorado brillante tipo casino, rojo puro (#FF0000), negro
absoluto sobre blanco absoluto sin ningún acento, combinaciones de más de dos matices fuertes.

FAMILIAS DE FORMA: monogramas geométricos de trazo uniforme; marcas de contención (el símbolo
dentro de un escudo, círculo o hexágono muy simplificado); formas construidas con un solo trazo
continuo. Todo tiene que leerse bien a 24 px de alto.

SÍMBOLOS PROHIBIDOS EN TODOS LOS NICHOS: globos terráqueos, apretones de manos, siluetas de
personas tomadas de la mano, flechas ascendentes genéricas, engranajes, bombillas de luz.
Son el cliché del multinivel y hacen que la marca parezca de 2008.

TIPOGRAFÍA: sans geométrica o humanista, peso medium o semibold, interletrado generoso.
Nada de scripts caligráficos, nada de serif condensada, nada de itálicas.$$,
 'approved', 0),

('bn_salud', 'branding_nicho', 'salud',
 array['salud','health','medicina','wellness','suplementos','superpatch','parches','dolor','energia'],
 'Branding — Salud',
$$NICHO: Salud

REGISTRO: calma y confianza, nunca urgencia. Quien compra salud está cansado de que le vendan
milagros. La marca tiene que transmitir "esto es serio y me va a cuidar", no "esto te cura ya".

FAMILIAS CROMÁTICAS QUE FUNCIONAN:
- Verde profundo (#1B5E4A, #2F6B4F) con arena (#EFE7DA) y un acento cobre suave (#C97B4A).
- Azul agua sereno (#1E6E8C, #2B8CA6) con blanco roto (#F6F4F0).
- Verde salvia apagado (#6E8B72) con carbón (#242A26).

EVITAR: verde lima saturado, rosa chicle, degradados neón, azul eléctrico. Todo eso lee como
suplemento barato de góndola.

FAMILIAS DE FORMA: orgánicas, curvas continuas. Hoja, gota u onda MUY abstraídas — tan
abstraídas que no se reconozca el objeto literal, solo el gesto. Simetría suave.

SÍMBOLOS PROHIBIDOS: cruces médicas, caduceos, estetoscopios, corazones anatómicos, píldoras,
ADN. Leen como farmacia o como clínica, no como un líder con autoridad propia.

TIPOGRAFÍA: sans humanista, peso medium, interletrado generoso. Bordes ligeramente redondeados.$$,
 'approved', 1),

('bn_bienestar', 'branding_nicho', 'bienestar',
 array['bienestar','wellbeing','vitalhealth','estilo de vida','habitos','balance','longevidad','zinzino'],
 'Branding — Bienestar',
$$NICHO: Bienestar

REGISTRO: equilibrio y cotidianidad. No es medicina, es una vida mejor sostenida en el tiempo.
Más cálido y más humano que Salud; menos clínico.

FAMILIAS CROMÁTICAS QUE FUNCIONAN:
- Terracota apagada (#B5654A) con crema (#F3EDE4) y verde oliva (#6B7355).
- Verde eucalipto (#4F7A6B) con arena tostada (#E4D8C6).
- Ocre suave (#C89F5C) con carbón cálido (#2B2723).

EVITAR: la paleta de spa genérica (lavanda + blanco + gris claro), pasteles lavados sin
contraste, y cualquier cosa que parezca etiqueta de aceite esencial.

FAMILIAS DE FORMA: arcos, círculos incompletos, líneas concéntricas, formas que sugieran
respiración o ciclo. Trazo de peso medio, nunca fino y frágil.

SÍMBOLOS PROHIBIDOS: flores de loto, mandalas, personas en posición de yoga, siluetas
meditando, mariposas. Son el cliché absoluto del rubro.

TIPOGRAFÍA: sans humanista de formas abiertas, o una serif de transición muy limpia si el
líder tiene un perfil más editorial. Peso regular o medium.$$,
 'approved', 2),

('bn_nutricion', 'branding_nicho', 'nutricion',
 array['nutricion','nutrition','nutrivida','alimentacion','dieta','peso','farmasi','vida divina'],
 'Branding — Nutrición',
$$NICHO: Nutrición

REGISTRO: frescura y método. Quien busca nutrición ya probó dietas que no funcionaron; la
marca tiene que verse ordenada y confiable, no aspiracional ni culposa.

FAMILIAS CROMÁTICAS QUE FUNCIONAN:
- Verde hoja profundo (#2F6B3C) con hueso (#F5F2E9) y un acento mandarina (#D9762B).
- Verde bosque (#1F4D35) con amarillo mostaza apagado (#D4A63C).
- Berenjena (#4A2B44) con verde claro (#8FB08A) — para un perfil más femenino sin caer en rosa.

EVITAR: rojo apetito tipo cadena de comida rápida, degradados verde-amarillo, y el clásico
verde+blanco de packaging de supermercado.

FAMILIAS DE FORMA: geometría vegetal simplificada (una hoja reducida a dos arcos), formas
contenidas en círculo, marcas de tipo sello. Deben sobrevivir impresas en una etiqueta chica.

SÍMBOLOS PROHIBIDOS: manzanas, cintas métricas, siluetas "antes y después", tenedores,
platos, básculas. Todo eso vende dieta, y el negocio no es dieta.

TIPOGRAFÍA: sans geométrica limpia, peso semibold. Alternativa: una sans con leve contraste
de trazo si se busca algo más premium.$$,
 'approved', 3),

('bn_finanzas', 'branding_nicho', 'finanzas',
 array['finanzas','financiero','jifu','educacion financiera','libertad financiera','ingresos','dinero'],
 'Branding — Finanzas',
$$NICHO: Finanzas / Educación financiera

REGISTRO: rigor y sobriedad. Es el nicho donde más rápido se pierde credibilidad: cualquier
cosa que huela a "hacete rico" mata la marca. Tiene que parecer una consultora, no una promesa.

FAMILIAS CROMÁTICAS QUE FUNCIONAN:
- Azul noche (#0B1E3F, #1E3A6E) con hueso (#F5F2EC) y un acento ámbar contenido (#C9922E).
- Grafito (#1C1F26) con verde billete profundo (#1F5A45).
- Azul pizarra (#2C4A63) con gris cálido (#E8E4DD).

EVITAR: dorado brillante o metalizado, negro con dorado (lee a casino), verde fosforescente,
gráficos de vela japonesa, degradados. El oro es el error más común y más caro de este nicho.

FAMILIAS DE FORMA: monogramas de trazo firme y ángulos rectos, marcas construidas sobre una
retícula visible, formas de contención tipo escudo o sello muy simplificado. Simetría estricta.

SÍMBOLOS PROHIBIDOS: signos de peso o dólar, monedas, lingotes, toros, gráficos de barras
ascendentes, cohetes, flechas subiendo. Todos gritan "esquema" y ninguno construye autoridad.

TIPOGRAFÍA: sans neogrotesca de peso medium o una serif de transición con buen contraste si
el líder tiene perfil de autor/formador. Interletrado ajustado, nunca expandido.$$,
 'approved', 4),

('bn_inversiones', 'branding_nicho', 'inversiones',
 array['inversiones','inversion','crypto','cripto','trading','bitradex','aitech','exchange','blockchain','forex'],
 'Branding — Inversiones y cripto',
$$NICHO: Inversiones / Cripto / Trading

REGISTRO: precisión técnica. El público es escéptico y ya vio cien proyectos caerse. La marca
tiene que verse como infraestructura seria, no como oportunidad.

FAMILIAS CROMÁTICAS QUE FUNCIONAN:
- Negro azulado (#0E1116) con cian contenido (#2FA8C4) y gris claro (#D7DBE0).
- Azul medianoche (#101B33) con violeta profundo (#4B3B8F).
- Grafito (#1A1D23) con un solo acento verde técnico (#2E9E6B).

EVITAR: degradados violeta-cian tipo cripto 2021, neones, hologramas, dorado, y cualquier
referencia a monedas físicas. Todo eso envejeció mal y hoy lee a estafa.

FAMILIAS DE FORMA: geometría modular y angular, formas construidas por repetición de una
unidad, simetría rotacional, ángulos de 30/60/90 grados. Trazo uniforme, nada orgánico.

SÍMBOLOS PROHIBIDOS: la B de Bitcoin y cualquier símbolo de moneda, toros y osos, cohetes,
velas japonesas, cadenas de bloques literales, robots. Sin excepción.

TIPOGRAFÍA: sans geométrica o técnica, peso medium, formas cerradas. Se admite una mono para
un detalle secundario, nunca para el nombre principal.$$,
 'approved', 5),

('bn_seguros', 'branding_nicho', 'seguros',
 array['seguros','seguro','seguros de vida','insur','proteccion','patrimonio','prevision'],
 'Branding — Seguros',
$$NICHO: Seguros

REGISTRO: solidez y permanencia. Se vende tranquilidad a largo plazo, así que la marca tiene
que verse estable y sin moda: algo que dentro de diez años siga pareciendo vigente.

FAMILIAS CROMÁTICAS QUE FUNCIONAN:
- Azul institucional profundo (#14355E) con gris perla (#E6E8EB) y un acento borgoña (#8C2F3A).
- Verde pino (#1F4438) con crema (#F1EDE4).
- Azul acero (#33495F) con arena (#DCD5C8).

EVITAR: colores brillantes o saturados, degradados, cualquier cosa juvenil o "startup".
Este es el único nicho donde verse conservador es una ventaja, no un defecto.

FAMILIAS DE FORMA: escudos y formas de contención muy simplificadas, arcos que sugieran
cobijo, monogramas de trazo grueso y estable. Base ancha, centro de gravedad bajo.

SÍMBOLOS PROHIBIDOS: paraguas (el cliché absoluto del rubro), manos sosteniendo familias,
casas, corazones, cruces. Un escudo abstracto sí sirve; un escudo heráldico literal no.

TIPOGRAFÍA: serif de transición o sans neogrotesca de peso semibold. Nada redondeado, nada
geométrico moderno. Formal sin ser antiguo.$$,
 'approved', 6),

('bn_viajes', 'branding_nicho', 'viajes',
 array['viajes','turismo','incruises','cruceros','travel','vacaciones','experiencias'],
 'Branding — Viajes',
$$NICHO: Viajes

REGISTRO: apertura y experiencia. Es el nicho más permisivo estéticamente, pero también donde
es más fácil terminar con una agencia de turismo genérica. Tiene que verse curado, no masivo.

FAMILIAS CROMÁTICAS QUE FUNCIONAN:
- Azul océano profundo (#0F3F5C) con coral apagado (#D97A5B) y arena (#F0E6D6).
- Turquesa contenido (#2A8C8C) con blanco cálido (#F7F3EC).
- Índigo (#2B3A6B) con dorado arena (#C9A15C).

EVITAR: el degradado atardecer (naranja-rosa-violeta), palmeras, azul cielo saturado, y la
paleta tropical completa. Todo eso es agencia de viajes de shopping.

FAMILIAS DE FORMA: horizontes reducidos a líneas, arcos superpuestos, formas que sugieran
movimiento sin ser literales, brújulas MUY abstraídas (solo la rosa, sin la caja).

SÍMBOLOS PROHIBIDOS: aviones, valijas, palmeras, mapas del mundo, pines de ubicación, barcos
literales, pasaportes. Son el inventario completo del cliché del rubro.

TIPOGRAFÍA: sans geométrica de formas abiertas, o una serif elegante si el posicionamiento es
de viajes premium. Interletrado amplio para dar sensación de espacio.$$,
 'approved', 7),

('bn_belleza', 'branding_nicho', 'belleza',
 array['belleza','beauty','cosmetica','skincare','riman','piel','maquillaje','estetica'],
 'Branding — Belleza y cosmética',
$$NICHO: Belleza / Cosmética

REGISTRO: refinamiento sobrio. El rubro está saturado de marcas que se parecen entre sí; la
diferencia la hace la contención, no el brillo.

FAMILIAS CROMÁTICAS QUE FUNCIONAN:
- Nude profundo (#B08968) con hueso (#F5EFE7) y carbón cálido (#2E2A26).
- Rosa terroso apagado (#B57B7B) con crema (#F2EAE2).
- Verde jade oscuro (#2C4F45) con dorado champagne mate (#C7A87A).

EVITAR: rosa chicle, dorado brillante, degradados perlados, tipografía script, y cualquier
cosa con brillo o destello. Nada de imitar packaging de perfumería masiva.

FAMILIAS DE FORMA: monogramas de trazo fino con alto contraste, formas simétricas y
contenidas, arcos suaves. Es el único nicho donde el trazo fino funciona bien.

SÍMBOLOS PROHIBIDOS: labios, ojos con pestañas, rostros de perfil, flores realistas, coronas,
diamantes. Son intercambiables entre mil marcas y no dicen nada del líder.

TIPOGRAFÍA: serif didona o de alto contraste para el nombre, o una sans muy fina con
interletrado muy abierto. Nunca negrita, nunca redondeada.$$,
 'approved', 8);

update public.marketing_ad_library
   set char_count = length(content)
 where part = 'branding_nicho';

notify pgrst, 'reload schema';

-- Rollback:
--   delete from public.marketing_ad_library where part = 'branding_nicho';
