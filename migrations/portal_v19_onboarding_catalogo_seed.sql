-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente v19 — ONBOARDING: catálogo (tramos + preguntas)
-- Aplicada a prod el 2026-07-25 vía MCP: 7 tramos, 66 preguntas (53 requeridas).
--
-- Reemplaza las ~70 preguntas del prototipo por 7 tramos y ~40 preguntas que
-- se responden en ~40 minutos. Tres cambios de fondo respecto del prototipo:
--
--  1) El MATERIAL va segundo, no último. Es la causa directa de que hoy el
--     cliente no suba nada: se le pide cuando ya está agotado.
--  2) Las preguntas de HISTORIA dejan de ser 14 numeradas consecutivas (que se
--     leen como interrogatorio y producen respuestas de 40 caracteres) y pasan
--     a ser 8 con nombre propio, con micrófono y con ejemplo.
--  3) Nada que el sistema ya sepa se vuelve a preguntar: el tramo 'datos' se
--     prellena desde crear-venta y solo se confirma.
--
-- El `on conflict do update ... where updated_by is null` NO pisa lo que el
-- equipo ya editó desde el panel de operaciones.
--
-- Los `ejemplo` de acá son provisorios: se reemplazan sin deploy desde el
-- editor de ops cuando esté el documento de respuestas modelo.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Tramos ───────────────────────────────────────────────────────────────────
insert into public.onboarding_sections (skey, titulo, subtitulo, promesa, minutos, checkpoint, desbloquea, orden) values
  ('agenda',   'Agendá tu sesión',      'Primero lo primero: reservá el día en que nos vemos.',
   'Listo. Ya tenés tu lugar reservado.', 2, false, null, 0),

  ('datos',    'Confirmá tus datos',    'Esto ya lo tenemos. Solo mirá que esté bien.',
   'Perfecto. Con esto ya sabemos a quién le estamos hablando.', 2, false, null, 1),

  ('material', 'Tu material',           'Juntá esto ahora y lo vas subiendo mientras seguís respondiendo.',
   'Con tu logo y tus fotos ya podemos empezar a diseñar.', 6, true, '/material', 2),

  ('historia', 'Tu historia',           'Esta es la parte más importante. Contala hablando.',
   'Con esto ya podemos escribir tu video de ventas.', 14, true, null, 3),

  ('negocio',  'Tu negocio y tu oferta','Qué vendés, a qué precio y por qué te eligen.',
   'Ya sabemos qué vamos a promocionar y cómo.', 9, true, '/embudos', 4),

  ('gente',    'Tu gente',              'A quién queremos que le llegue tu anuncio.',
   'Con esto armamos la segmentación de tus anuncios.', 7, false, null, 5),

  ('cierre',   'Últimos detalles',      'Links, presupuesto y fecha de grabación. Es rápido.',
   'Terminaste. Ahora empezamos nosotros.', 4, false, null, 6)
on conflict (skey) do update set
  titulo = excluded.titulo, subtitulo = excluded.subtitulo, promesa = excluded.promesa,
  minutos = excluded.minutos, checkpoint = excluded.checkpoint,
  desbloquea = excluded.desbloquea, orden = excluded.orden
where public.onboarding_sections.updated_by is null;


-- ── Preguntas ────────────────────────────────────────────────────────────────
-- peso: 0 no cuenta · 1 corta · 2 media · 3 la que más pesa
-- ≈ segundos hablando = min_chars / 14
with q(qkey, skey, orden, grupo, label, sublabel, ayuda_md, ejemplo, chips, qtype, opciones,
       voz, requerida, min_chars, peso, minutos, visible_si, bucket_key, target_count,
       target_kind, target_column, target_mode, plantilla_ord, plantilla_ref) as (values

-- ═══ TRAMO: DATOS (prellenado desde crear-venta, solo se confirma) ═══════════
('datos_confirmar','datos',10,null,
 '¿Está todo bien?',
 'Estos datos nos los pasaste cuando arrancamos. Si algo cambió, corregilo.',
 'Los usamos para tu contrato y tus facturas.','', '[]','confirmar','[]',
 false,true,0,1,1,null,null,null,null,null,'fill',10,'1. Sobre tu negocio'),

('datos_edad','datos',20,'datos_rapidos',
 '¿Qué edad tenés?','','','', '[]','numero','[]',
 false,true,0,1,1,null,null,null,null,null,'fill',131,'1.3 Historia de vida / 12'),

('datos_anos_negocio','datos',21,'datos_rapidos',
 '¿Hace cuánto arrancaste en este negocio?','En años. Si es menos de uno, poné 1.','','', '[]','numero','[]',
 false,true,0,1,1,null,null,null,null,null,'fill',122,'1.3 Historia de vida / 2'),

('datos_red_tamano','datos',22,'datos_rapidos',
 '¿Cuántas personas hay hoy en tu red?','Un número aproximado alcanza.','','', '[]','numero','[]',
 false,true,0,1,1,null,null,null,null,null,'fill',127,'1.3 Historia de vida / 7'),

-- ═══ TRAMO: MATERIAL (segundo lugar, sube en background) ═════════════════════
('material_logo','material',10,null,
 'Tu logo',
 'En la mejor calidad que tengas. Si tenés el archivo original (.ai, .svg o PNG con fondo transparente), mejor.',
 'Con esto todo lo que publiquemos sale con tu identidad.','', '[]','subida','[]',
 false,true,0,2,2,null,'branding',1,null,null,'fill',810,'8. Necesitamos del cliente'),

('material_colores','material',20,'marca',
 '¿Cuáles son los colores de tu marca?',
 'Si sabés los códigos exactos, pegalos. Si no, describilos: "azul oscuro y dorado".',
 '','Azul marino (#0B1E3F) y dorado (#C9A227). Fondo siempre blanco.', '[]','color','[]',
 false,true,0,1,1,null,null,null,'clients','brand_colors','overwrite',811,'8. Necesitamos del cliente'),

('material_tipografia','material',21,'marca',
 '¿Usás alguna tipografía en particular?',
 'Si no tenés, dejalo vacío y elegimos nosotros.','',
 'Montserrat para títulos, Open Sans para el texto.', '[]','corta','[]',
 false,false,0,1,1,null,null,null,'clients','brand_font','overwrite',812,'8. Necesitamos del cliente'),

('material_fotos_autoridad','material',30,null,
 '5 fotos tuyas',
 'Que se te vea bien la cara. Con fotos del celular alcanza — no hace falta sesión de fotos.',
 'Las usamos en la portada de tus videos y en tu página.','', '[]','subida','[]',
 false,true,0,2,2,null,'autoridad',5,null,null,'fill',813,'8. Necesitamos del cliente'),

('material_estilo_vida','material',40,null,
 'Fotos de tu vida',
 'Viajes, familia, eventos, premios. Lo que muestre cómo vivís hoy.',
 'Son las que más conectan en los anuncios.','', '[]','subida','[]',
 false,false,0,1,1,null,'estilo_vida',null,null,null,'fill',814,'8. Necesitamos del cliente'),

('material_empresa','material',50,null,
 'Material de tu empresa',
 'PDF de la empresa, plan de compensación, catálogo, fotos de eventos corporativos.',
 '','', '[]','subida','[]',
 false,false,0,1,1,null,'empresa',null,null,null,'fill',815,'8. Necesitamos del cliente'),

('material_presentaciones','material',60,null,
 '¿Tenés presentaciones grabadas?',
 'Links de YouTube, Vimeo o donde estén. Una por línea.','',
 'https://youtube.com/watch?v=... — presentación del plan, 45 min', '[]','corta','[]',
 false,false,0,1,1,null,null,null,null,null,'fill',816,'8. Necesitamos del cliente'),

-- ═══ TRAMO: HISTORIA (el corazón — todo con micrófono) ═══════════════════════
('historia_antes_del_negocio','historia',10,null,
 '¿A qué te dedicabas antes de esto?',
 'Contanos de dónde venís: tu trabajo, tus estudios, cómo era tu vida antes.',
 'Esto es lo que hace que la gente se vea reflejada en vos. Cuanto más parecido a tu público sea tu "antes", mejor funciona.',
 'Trabajé 14 años como enfermera en un hospital público. Turnos de 12 horas, guardias los fines de semana, y aun así no me alcanzaba para pagar el alquiler y la escuela de mis dos hijos. Me levantaba a las 5 de la mañana y volvía cuando ya estaban dormidos. Llegué a tener tres trabajos: el hospital, cuidados a domicilio los sábados y vendía ropa por catálogo. Estaba agotada todo el tiempo y sentía que por más que trabajara, nunca iba a salir de ahí. Lo que más me dolía no era el dinero, era perderme la infancia de mis hijos.',
 '["a qué te dedicabas","cuántas horas trabajabas","qué te dolía de esa vida"]','abierta','[]',
 true,true,900,3,3,null,null,null,null,null,'fill',121,'1.3 Historia de vida / 1'),

('historia_por_que_empece','historia',20,null,
 '¿Por qué empezaste este negocio?',
 'Contanos qué estaba pasando en tu vida cuando decidiste meterte.',
 'No hace falta que suene bonito. Contalo como se lo contarías a un amigo. Esta respuesta es la que abre tu video de ventas.',
 'Fue en marzo de 2019. Mi hijo menor tuvo un problema de salud y necesitaba un tratamiento que no cubría la obra social. Costaba lo que yo ganaba en cuatro meses. Tuve que pedirle plata prestada a mi hermana y todavía me acuerdo de la vergüenza que sentí. Esa noche entendí que el problema no era que trabajara poco, era que estaba cambiando tiempo por dinero y el tiempo se me estaba acabando. Una compañera del hospital me venía hablando del negocio hacía meses y yo la evitaba, pensaba que era una estafa. La llamé al día siguiente. Empecé sin creerla del todo, con miedo a que se rieran de mí, pero con la certeza de que no podía seguir como estaba.',
 '["qué pasó exactamente","cómo te sentías","qué te decidió"]','abierta','[]',
 true,true,1200,3,3,null,null,null,null,null,'fill',123,'1.3 Historia de vida / 3'),

('historia_que_cambio','historia',30,null,
 '¿Qué cambió en tu vida desde que empezaste?',
 'Lo que ganaste en dinero y en cosas, pero sobre todo lo que ganaste que no se compra.',
 'Contá las tres cosas: qué lograste en plata, qué lograste que no es plata, y cómo es tu día hoy comparado con antes.',
 'En plata: hoy facturo entre 6.000 y 8.000 dólares por mes, tengo mi casa propia desde hace dos años y cambié el auto. Pero lo que de verdad cambió es otra cosa. Dejé el hospital en enero de 2021 y ese día lloré en el estacionamiento. Hoy llevo a mis hijos al colegio todas las mañanas y los busco. El año pasado nos fuimos los tres a Cancún, el primer viaje de mi vida en avión, y pagué todo sin pedirle plata a nadie. Mi hija me dijo "mamá, ahora estás siempre" y esa frase vale más que cualquier cifra. También cambió algo adentro mío: dejé de pedir permiso. Antes tenía que rogar por un franco para un acto escolar; hoy decido yo.',
 '["cuánto facturás hoy","qué cosas conseguiste","cómo es tu día ahora"]','abierta','[]',
 true,true,1200,3,3,null,null,null,null,null,'fill',124,'1.3 Historia de vida / 4-6'),

('historia_que_quiero_lograr','historia',40,null,
 '¿Qué querés lograr de acá en adelante?',
 'Tu próximo objetivo con este negocio.','',
 'Quiero llegar a 15.000 dólares mensuales en los próximos 18 meses y armar un equipo de 50 personas que facturen de verdad, no que estén anotadas y nada más. Y quiero comprarle la casa a mi mamá, que alquila desde que enviudó.',
 '[]','abierta','[]',
 true,true,500,2,2,null,null,null,null,null,'fill',125,'1.3 Historia de vida / 3'),

('historia_como_lo_explicas','historia',50,null,
 '¿Cómo le explicás tu negocio a alguien que no lo conoce?',
 'Como se lo dirías a un vecino en el ascensor, en un minuto.',
 'Esto se convierte casi textual en uno de tus anuncios. Decilo con tus palabras, sin tecnicismos.',
 'Le digo: ayudo a personas que están cansadas de cambiar horas por plata a armar un ingreso desde el celular, sin dejar lo que hacen hoy. Trabajo con una empresa de nutrición que tiene 30 años en el mercado, y lo que hago es enseñarle a la gente a vender esos productos y a formar su propio equipo. No es magia ni es rápido: al principio le dedicás una hora por día y en seis meses, si le ponés, ya tenés un ingreso que se nota. Yo empecé igual, trabajando de enfermera.',
 '[]','abierta','[]',
 true,true,600,2,2,null,null,null,null,null,'fill',133,'1.3 Historia de vida / 13'),

('edificacion','historia',60,null,
 'Si alguien de tu equipo te presenta ante un invitado, ¿qué debería decir de vos?',
 'Tus logros, tu recorrido, por qué te tienen que escuchar.',
 'Esto lo usamos en la introducción de tu video. No te achiques: acá corresponde contar lo que lograste.',
 'Que llevo 6 años en el negocio, que soy diamante desde 2023 y que armé un equipo de más de 400 personas en cuatro países. Que fui enfermera y que dejé el hospital gracias a esto, porque eso es lo que más le llega a la gente. Que doy capacitación todos los martes hace tres años sin faltar uno solo, y que estuve en el escenario del evento anual de la empresa en Miami el año pasado.',
 '[]','abierta','[]',
 true,true,500,2,2,null,null,null,null,null,'fill',201,'2. Autoridad y Marca personal'),

('diferencial_por_que_vos','historia',70,null,
 'Si alguien está eligiendo entre vos y otra persona del mismo negocio, ¿por qué se queda con vos?',
 'Qué hacés vos que los demás no hacen.',
 'Esta es la pregunta que más nos sirve de todo el onboarding. Pensá en lo que te dicen las personas que ya están en tu equipo.',
 'Porque yo no desaparezco después de que firman. La mayoría te suma y te deja sola con un PDF. Yo tengo un grupo de WhatsApp donde respondo todos los días, hago una llamada grupal los martes a las 20h desde hace tres años, y a cada persona nueva la acompaño en sus primeras cinco ventas: me conecto con ella y hacemos la venta juntas. También armé un manual propio de 40 páginas con los guiones que a mí me funcionaron, que no es material de la empresa, es mío. Y algo que me dicen mucho: que soy honesta con los números. No prometo que se van a hacer millonarias en tres meses, les digo exactamente cuánto tardé yo y cuánto trabajé.',
 '["qué hacés que otros no","qué te dicen los de tu equipo","qué armaste vos mismo"]','abierta','[]',
 true,true,900,3,3,null,null,null,null,null,'fill',202,'2. Autoridad y Marca personal'),

('equipo_nombre','historia',80,'equipo',
 '¿Tu equipo tiene nombre?','Si no tiene, dejalo vacío.','','Equipo Libertad', '[]','corta','[]',
 false,false,0,1,1,null,null,null,'clients','team_name','fill',105,'1. Sobre tu negocio'),

('equipo_como_surgio','historia',81,null,
 '¿Cómo se armó tu equipo y qué lo hace distinto?',
 'Cómo empezó, qué valores tiene, qué se lleva alguien que entra.',
 '','Arrancó en 2020 con tres amigas del hospital a las que les conté lo que estaba haciendo. Hoy somos 400 y pico en Argentina, Chile, México y España. Lo que nos define es que nadie se queda solo: tenemos un sistema de madrinas donde cada persona nueva tiene una asignada durante sus primeros 90 días. Somos muy de celebrar lo chico, la primera venta se festeja igual que un ascenso de rango. Y hay una regla que no se negocia: no se vende con mentiras ni se promete lo que no se puede cumplir. Eché a dos personas por eso. Quien entra se lleva formación real, un grupo que responde, y la tranquilidad de que si se cae, hay alguien que lo levanta.',
 '["cómo empezó","qué valores tienen","qué se lleva el que entra"]','abierta','[]',
 true,true,800,2,2,null,null,null,null,null,'fill',106,'1. Sobre tu negocio'),

-- ═══ TRAMO: NEGOCIO (motor + oferta) ═════════════════════════════════════════
('motor','negocio',10,null,
 '¿Qué querés que pase cuando alguien vea tu anuncio?',
 'Elegí una. Según lo que elijas, te hacemos unas preguntas u otras.',
 'Si elegís "las dos", te vamos a pedir que nos digas cuál es la más importante — porque el anuncio tiene que tener un solo mensaje principal.','',
 '[]','opciones',
 '[{"value":"producto","label":"Que compre mi producto","hint":"Vender productos a clientes"},
   {"value":"oportunidad","label":"Que se sume a mi equipo","hint":"Reclutar socios para el negocio"},
   {"value":"ambas","label":"Las dos cosas","hint":"Producto y oportunidad"}]',
 false,true,0,2,1,null,null,null,'strategy_pages','tipo','fill',101,'1. Sobre tu negocio'),

('motor_primario','negocio',11,null,
 '¿Cuál es la más importante de las dos?',
 'La que elijas es la que va a llevar el peso del anuncio.','','',
 '[]','opciones',
 '[{"value":"producto","label":"Vender el producto"},
   {"value":"oportunidad","label":"Sumar gente al equipo"}]',
 false,true,0,1,1,'{"qkey":"motor","in":["ambas"]}',null,null,null,null,'fill',102,'1. Sobre tu negocio'),

('producto_que_es','negocio',20,null,
 '¿Qué producto querés promocionar?',
 'Qué es, para qué sirve y qué le pasa a la persona después de usarlo.',
 '','Es un pack de nutrición celular de 30 días: un batido de proteína vegetal para el desayuno, un té termogénico y un aloe para el sistema digestivo. Está pensado para mujeres de 35 a 55 que se sienten hinchadas, sin energía y que ya probaron dietas que no les funcionaron. En 30 días la mayoría baja entre 3 y 6 kilos, pero lo que más nos dicen es que duermen mejor y que dejaron de tener el bajón de las 4 de la tarde. No es una dieta: no tenés que dejar de comer lo que te gusta, reemplazás una comida y listo.',
 '[]','abierta','[]',
 true,true,600,2,2,'{"qkey":"motor","in":["producto","ambas"]}',null,null,null,null,'fill',301,'3. Oferta y objetivos'),

('problema_que_resuelves','negocio',30,null,
 '¿Qué problema le resolvés a tu cliente?',
 'Qué le está pasando hoy, antes de conocerte.',
 'Escribilo como lo diría esa persona, no como lo dirías vos.',
 'La mayoría llega diciendo lo mismo: "me miro al espejo y no me reconozco". Son mujeres que subieron 10 o 15 kilos después de los embarazos o de la menopausia, que están todo el día cansadas, que se levantan ya sin energía. Probaron de todo: la dieta de la nutricionista que abandonaron a la semana, el gimnasio al que fueron un mes, las pastillas que compraron por Instagram. Cada intento fallido les dejó la sensación de que el problema son ellas, que no tienen fuerza de voluntad. Y hay algo que casi ninguna dice en voz alta: dejaron de ir a eventos, de sacarse fotos, de tener intimidad con su pareja. El problema no es el peso, es que se están perdiendo la vida.',
 '["qué le pasa hoy","qué ya probó","qué siente"]','abierta','[]',
 true,true,700,3,2,null,null,null,null,null,'fill',103,'1. Sobre tu negocio'),

('oferta_especifica','negocio',40,null,
 '¿Qué le vamos a ofrecer exactamente?',
 'Producto o paquete, precio, qué incluye y en qué condiciones.',
 '','El pack de inicio de 30 días a 89 dólares con envío gratis a todo el país. Incluye los tres productos, un plan de comidas en PDF que armé yo, y el acceso a mi grupo de WhatsApp de seguimiento donde estoy todos los días. La primera compra tiene 15% de descuento si se suscriben a la recompra mensual, que pueden cancelar cuando quieran sin permanencia. Si compran dos packs (para ellas y una amiga), el segundo sale a 75.',
 '[]','abierta','[]',
 true,true,600,2,2,null,null,null,null,null,'fill',302,'3. Oferta y objetivos'),

('tickets','negocio',50,'precios',
 '¿Cuánto cuestan tus productos?',
 'El de entrada, el paquete para arrancar el negocio, y el más caro.','',
 'Entrada 89 USD · Paquete de negocio 350 USD · El más alto 1.200 USD', '[]','money','[]',
 false,true,0,1,1,null,null,null,null,null,'fill',503,'5. Canales y producto'),

('garantia','negocio',51,'precios',
 '¿Hay garantía?','Cuánto tiempo y en qué condiciones. Si no hay, escribí "no hay".','',
 '30 días de devolución. Si no está conforme, devuelve los envases aunque estén vacíos y se le reintegra el 100%.',
 '[]','corta','[]',
 false,true,0,1,1,null,null,null,null,null,'fill',303,'3. Oferta y objetivos'),

('oportunidad_diferencial','negocio',60,null,
 '¿Por qué alguien elegiría esta oportunidad y no otra?',
 'Qué tiene tu empresa y tu modelo que las demás no tienen.',
 '','La empresa tiene 31 años y opera en 94 países, no es una startup que puede desaparecer. El plan de compensación paga desde la primera venta, no tenés que llegar a un rango para cobrar: eso hace que la gente vea plata en su primera semana y no abandone. No hay obligación de compra mensual mínima, que es lo que hunde a la gente en otras compañías. Los productos se venden solos porque son de consumo diario y la recompra es del 68%, o sea que armás un ingreso que se repite sin salir a buscar clientes nuevos todos los meses. Y algo que valoro mucho: la empresa tiene certificación de calidad propia y estudios clínicos publicados, así que no tengo que vender humo.',
 '[]','abierta','[]',
 true,true,800,3,2,'{"qkey":"motor","in":["oportunidad","ambas"]}',null,null,null,null,'fill',304,'3. Oferta y objetivos'),

('acompanamiento_y_sistema','negocio',70,null,
 '¿Qué acompañamiento le das a quien entra a tu equipo?',
 'Qué recibe concretamente y con qué sistema lo seguís.',
 '','Los primeros 90 días tiene una madrina asignada que le responde por WhatsApp todos los días. La primera semana hacemos una videollamada de una hora donde armamos juntas su lista de contactos y su primer mensaje. Le doy mi manual de 40 páginas con los guiones. Todos los martes a las 20h hay capacitación en vivo por Zoom, y quedan grabadas en un Drive al que tiene acceso. Sus primeras cinco ventas las hacemos juntas: se conecta conmigo y yo la acompaño en la llamada. Después pasa al grupo general, donde seguimos midiendo con una planilla semanal quién hizo cuántos contactos.',
 '[]','abierta','[]',
 true,true,600,2,2,'{"qkey":"motor","in":["oportunidad","ambas"]}',null,null,null,null,'fill',203,'2. Autoridad y Marca personal'),

('proceso_de_ventas','negocio',80,null,
 '¿Cómo es tu proceso de venta hoy, de principio a fin?',
 'Desde que alguien te escribe hasta que compra.',
 '','Me escriben por Instagram o por WhatsApp, casi siempre preguntando el precio. Yo no doy precio de entrada: les hago tres preguntas para entender qué les pasa (hace cuánto que están así, qué probaron, cuánto quieren bajar). Si veo que califica, le mando un audio de dos minutos contándole mi caso y le propongo una videollamada de 20 minutos. En la llamada le muestro el plan, le cuento testimonios parecidos al suyo y ahí sí le paso el precio. Cierro alrededor del 40% de las llamadas. A las que no cierran las paso a una lista y les mando contenido una vez por semana; varias compran dos o tres meses después.',
 '[]','abierta','[]',
 true,true,700,2,2,null,null,null,null,null,'fill',502,'5. Canales y producto'),

('testimonios_relato','negocio',90,null,
 'Contanos 3 casos de personas a las que les fue bien',
 'Nombre, cómo estaba antes, qué logró y en cuánto tiempo.',
 'No necesitás tener los videos ahora. Contanos los casos y después te ayudamos a grabarlos.',
 'Marcela, 48 años, de Rosario. Llegó pesando 89 kilos, con presión alta y tomando medicación. En 5 meses bajó 17 kilos y el médico le sacó una de las pastillas. Hoy es clienta y además me compra para revender.
Vanina, 34, dos hijos chicos. No le importaba tanto el peso, estaba con agotamiento y caída de pelo post parto. A los dos meses me mandó un audio llorando porque se pudo poner el vestido de su casamiento. Bajó 8 kilos.
Fernando, 52, el único hombre del grupo. Camionero, comía en la ruta, tenía prediabetes. Bajó 22 kilos en 8 meses y el último análisis le dio valores normales. Es el que más testimonios me genera porque nadie le cree que es el mismo de la foto.',
 '["nombre y edad","cómo estaba antes","qué logró y en cuánto"]','abierta','[]',
 true,true,900,3,3,null,null,null,null,null,'fill',310,'3.1 Testimonios'),

('testimonios_fecha','negocio',91,null,
 '¿Para cuándo podés tener 3 testimonios grabados en video?',
 'Horizontal, con buena luz. Con el celular alcanza. Elegí una fecha realista.',
 'Esto no te frena el onboarding, pero sí frena tu página: sin testimonios la landing convierte bastante menos.','',
 '[]','fecha','[]',
 false,true,0,1,1,null,null,null,null,null,'fill',311,'3.1 Testimonios'),

('objeciones_para_no_entrar','negocio',100,null,
 '¿Qué te dicen los que NO compran o NO se suman?',
 'Las 3 a 5 excusas que más escuchás.',
 'Cada objeción que nos cuentes la respondemos dentro de tu video. Si no nos las decís, la gente se queda con la duda y no compra.',
 '"Lo tengo que hablar con mi marido" es la número uno, y en realidad significa que no está convencida ella.
"No tengo tiempo", que me lo dicen las que están más desesperadas justamente por falta de tiempo.
"Yo no sirvo para vender" — esta es la más fuerte en la parte de negocio, tienen miedo al ridículo delante de sus conocidos.
"¿Esto no es una pirámide?" — casi nadie lo dice así de frontal, lo insinúan.
"Ya probé de todo y nada me funcionó", que es más miedo a fracasar de nuevo que una objeción de precio.',
 '[]','abierta','[]',
 true,true,700,3,2,null,null,null,null,null,'fill',701,'7. Competencia y diferenciadores'),

('competencia_referentes','negocio',110,'competencia',
 '¿A quiénes seguís o considerás tu competencia?',
 'Nombres, cuentas de Instagram o links. Uno por línea.','',
 '@lauranutricion (misma empresa, España) · @vidaplenamlm · Gabriela Ruiz de la competencia directa',
 '[]','corta','[]',
 false,true,0,1,1,null,null,null,null,null,'fill',702,'7. Competencia y diferenciadores'),

('competencia_diferencia','negocio',111,null,
 '¿Qué querés destacar frente a ellos?','','',
 'Ellos venden el "bajá 10 kilos en 10 días" y viven de la foto del antes y después. Yo quiero que se note que acá no hay milagro: hay un método de 30 días, un acompañamiento real y resultados que se sostienen. Y quiero destacar que yo soy enfermera, tengo formación en salud, no soy alguien que se puso a vender batidos de un día para el otro.',
 '[]','abierta','[]',
 true,true,400,2,1,null,null,null,null,null,'fill',703,'7. Competencia y diferenciadores'),

('tono_y_claims','negocio',120,null,
 '¿Hay algo que NO podemos decir?',
 'Palabras prohibidas por tu empresa, promesas que no se pueden hacer, o cosas que no van con vos.',
 'Toda empresa de este rubro tiene reglas. Si no las sabés con certeza, escribí lo que sí sepas y lo revisamos en la reunión.',
 'La empresa prohíbe decir "cura", "trata", "adelgaza" y mencionar cualquier enfermedad. No se pueden mostrar cifras de ingresos propias sin el descargo legal. No se puede usar el logo de la empresa en anuncios pagos. Y algo mío: no quiero anuncios con mujeres en bikini ni fotos que hagan sentir mal a nadie por su cuerpo. Tampoco quiero que se prometa "libertad financiera en 6 meses", me parece una falta de respeto.',
 '[]','abierta','[]',
 true,true,400,2,2,null,null,null,null,null,'fill',704,'7. Competencia y diferenciadores'),

('punto_dif','negocio',130,null,
 '¿Qué pensás que va a convencer más a tu público?',
 'Elegí las que creas más fuertes en tu caso.','','',
 '[]','chips_multi',
 '[{"value":"historia","label":"Mi historia personal"},
   {"value":"testimonios","label":"Los casos de otros"},
   {"value":"autoridad","label":"Mi trayectoria y mis logros"},
   {"value":"producto","label":"Lo bueno que es el producto"}]',
 false,true,0,1,1,null,null,null,'strategy_pages','punto_dif','fill',104,'1. Sobre tu negocio'),

('campana_que_funciono','negocio',140,'campanas',
 '¿Alguna campaña de publicidad que te haya funcionado?',
 'Si nunca hiciste, escribí "nunca hice".','',
 'Hice un sorteo en Instagram en 2023 que me trajo 300 seguidores y 12 ventas. El anuncio era un video mío hablando a cámara contando mi caso, sin producción, grabado con el celular en la cocina. Gasté 80 dólares en 10 días.',
 '[]','abierta','[]',
 true,false,400,1,1,null,null,null,null,null,'fill',110,'1.1 Experiencias pasadas'),

('campana_que_fallo','negocio',141,'campanas',
 '¿Y alguna que no te funcionó?','','',
 'Puse 200 dólares en anuncios con una foto del producto y el precio. Cero ventas. Después entendí que a nadie le importa el producto, les importa lo que les pasa a ellas.',
 '[]','abierta','[]',
 true,false,300,1,1,null,null,null,null,null,'fill',111,'1.1 Experiencias pasadas'),

-- ═══ TRAMO: GENTE (el avatar, sin decir "avatar") ════════════════════════════
('avatar_ultimas_3_personas','gente',10,null,
 'Pensá en las últimas 3 personas que se sumaron o te compraron',
 'Contanos quiénes eran y qué les estaba pasando en ese momento.',
 'Esta es la respuesta más valiosa del onboarding. No pienses en "mi público objetivo": pensá en tres personas de carne y hueso y contá sus casos.',
 'La primera fue Carolina, 41 años, docente de primaria en Mar del Plata, casada, dos hijos adolescentes. Me escribió a las 11 de la noche un domingo. Estaba desbordada: doble turno en la escuela, la casa, y sentía que se le estaba yendo la vida. Lo que la decidió no fue bajar de peso, fue verme a mí que había dejado el hospital.
El segundo fue Damián, 37, tenía un local de repuestos que le iba mal después de la pandemia. Buscaba un ingreso extra y le daba vergüenza que sus amigos se enteraran. Tardó tres semanas en decidirse y me preguntó cuatro veces si era una pirámide.
La tercera, Silvina, 55, se acababa de jubilar y estaba deprimida porque sentía que ya no servía para nada. Ella no vino por la plata, vino porque quería pertenecer a algo. Es la que más vende hoy.',
 '["quién era","qué le estaba pasando","qué la decidió"]','abierta','[]',
 true,true,1300,3,4,null,null,null,null,null,'fill',107,'1. Sobre tu negocio'),

('avatar_frases_que_dicen','gente',20,null,
 '¿Qué frases te dicen textualmente?',
 'Las que más se repiten cuando te escriben o cuando hablás con ellos.',
 'Copiá sus palabras exactas, no las resumas. Esas frases van a aparecer literal en tus anuncios y es lo que hace que la gente sienta "esto habla de mí".',
 '"No me reconozco cuando me miro al espejo."
"Estoy cansada de estar cansada."
"Ya probé de todo y siempre vuelvo al mismo lugar."
"No tengo tiempo ni para mí."
"Necesito algo que pueda hacer desde casa, con los chicos."
"¿Y esto realmente funciona o es como todo?"
"Me da vergüenza que mis amigas se enteren."
"Quiero dejar de depender de mi sueldo."
"Trabajo todo el día y no me alcanza."',
 '[]','abierta','[]',
 true,true,900,3,3,null,null,null,null,null,'fill',108,'1. Sobre tu negocio'),

('avatar_botones','gente',30,null,
 '¿Qué es lo que más busca tu gente?',
 'Elegí las 3 más fuertes.','','',
 '[]','chips_multi',
 '[{"value":"tiempo","label":"Tener más tiempo"},
   {"value":"ingreso","label":"Un ingreso extra"},
   {"value":"libertad","label":"Libertad financiera"},
   {"value":"viajar","label":"Viajar"},
   {"value":"desarrollo","label":"Crecer como persona"},
   {"value":"jubilacion","label":"Asegurar su jubilación"},
   {"value":"contribucion","label":"Ayudar a otros"}]',
 false,true,0,1,1,null,null,null,null,null,'fill',109,'1. Sobre tu negocio'),

('red_cualidades','gente',40,null,
 '¿Qué tienen en común las personas que mejor te funcionan?',
 'No lo que buscás en teoría: lo que ves en los que realmente rinden.',
 '','Las que mejor funcionan son las que ya venían vendiendo algo, aunque sea ropa por catálogo o tortas por encargo: no les da vergüenza ofrecer. Casi todas tienen entre 35 y 50 y algo que las aprieta, una deuda, un hijo que empieza la facultad, algo concreto. Y son las que preguntan mucho al principio, las que te llenan de mensajes. Las que dicen "sí, dale, mándame todo" y no preguntan nada, no arrancan nunca.',
 '[]','abierta','[]',
 true,true,500,2,2,null,null,null,null,null,'fill',128,'1.3 Historia de vida / 8'),

('avatar_si_quiero','gente',50,null,
 '¿A quién SÍ querés que le llegue tu anuncio?',
 'Describí a la persona ideal.','',
 'Mujeres de 35 a 55, mamás, que trabajan en relación de dependencia o que tienen un emprendimiento chico. Que estén en Argentina, Chile o Uruguay. Que hayan intentado bajar de peso antes y no lo hayan logrado. Que sean activas en redes, que comenten cosas, no las que solo miran. Y sobre todo: gente que quiera resolver algo, no gente que quiera quejarse.',
 '[]','abierta','[]',
 true,true,600,2,2,null,null,null,null,null,'fill',130,'1.3 Historia de vida / 10'),

('avatar_no_quiero','gente',60,null,
 '¿A quién NO querés que le llegue?',
 'El tipo de persona que preferís evitar.',
 'Esto lo usamos para excluir gente de tus anuncios y que no gastes plata en quien no te sirve.',
 'No quiero gente que busca hacerse rica sin trabajar, los que preguntan "¿cuánto gano sin hacer nada?". Tampoco los que ya están en otra compañía y quieren cambiar cada seis meses, esos rompen el equipo. No quiero menores de 25 en general, porque no tienen la disciplina ni la red de contactos. Y no quiero a los que vienen a discutir si esto es una estafa: no me interesa convencer a nadie.',
 '[]','abierta','[]',
 true,true,600,2,2,null,null,null,null,null,'fill',129,'1.3 Historia de vida / 9'),

('avatar_zona','gente',70,'segmentacion',
 '¿En qué países o zonas querés vender?','','','Argentina (sobre todo Buenos Aires y Rosario), Chile y Uruguay',
 '[]','corta','[]',
 false,true,0,1,1,null,null,null,null,null,'fill',401,'4. Audiencia y segmentación'),

-- ═══ TRAMO: CIERRE ═══════════════════════════════════════════════════════════
('web_estado','cierre',10,'web',
 '¿Tenés página web?','','','',
 '[]','opciones',
 '[{"value":"si","label":"Sí, y te paso el link"},
   {"value":"si_sin_acceso","label":"Tengo pero no sé entrar"},
   {"value":"no","label":"No tengo"}]',
 false,true,0,1,1,null,null,null,null,null,'fill',501,'5. Canales y producto'),

('web_url','cierre',11,'web',
 'Pasanos el link','','','https://minegocio.com',
 '[]','url','[]',
 false,false,0,1,1,'{"qkey":"web_estado","in":["si"]}',null,null,null,null,'fill',501,'5. Canales y producto'),

('dominio_deseado','cierre',20,'dominio',
 '¿Qué dirección web querés para tu página?',
 'Sin www ni https. Por ejemplo: mariagonzalez.com','',
 'mariagonzaleznutricion.com', '[]','corta','[]',
 false,true,0,1,1,null,null,null,'strategy_pages','official_domain','fill',504,'5. Canales y producto'),

('dominio_alt','cierre',21,'dominio',
 'Dos alternativas por si esa no está disponible','','',
 'mariagonzalez.net · nutricionconmaria.com', '[]','corta','[]',
 false,false,0,1,1,null,null,null,null,null,'fill',504,'5. Canales y producto'),

('facebook_url','cierre',30,'redes',
 'Link de tu página de Facebook',
 'La página del negocio, no tu perfil personal.','',
 'https://facebook.com/mariagonzaleznutricion', '[]','url','[]',
 false,true,0,1,1,null,null,null,null,null,'fill',402,'4. Audiencia y segmentación'),

('instagram_url','cierre',31,'redes',
 'Link de tu Instagram','','','https://instagram.com/mariagonzalez.nutri',
 '[]','url','[]',
 false,true,0,1,1,null,null,null,null,null,'fill',402,'4. Audiencia y segmentación'),

('whatsapp_leads','cierre',40,'whatsapp',
 '¿A qué WhatsApp querés que te lleguen los interesados?',
 'Con código de país.','','+54 9 341 555 1234',
 '[]','telefono','[]',
 false,true,0,1,1,null,null,null,'strategy_pages','whatsapp_leads','fill',505,'5. Canales y producto'),

('whatsapp_quien_atiende','cierre',41,'whatsapp',
 '¿Quién contesta ese WhatsApp?','Tu nombre, o el de la persona que se encargue.','','Yo misma, de 9 a 21h',
 '[]','corta','[]',
 false,true,0,1,1,null,null,null,null,null,'fill',505,'5. Canales y producto'),

('presupuesto_ads','cierre',50,null,
 '¿Cuánto podés invertir por mes en publicidad?',
 'Es lo que se le paga a Meta, aparte de nuestro servicio.',
 'No hay respuesta incorrecta. Si todavía no lo definiste, decilo y lo vemos juntos en la reunión.','',
 '[]','opciones',
 '[{"value":"300-500","label":"Entre 300 y 500 USD"},
   {"value":"500-1000","label":"Entre 500 y 1.000 USD"},
   {"value":"1000-3000","label":"Entre 1.000 y 3.000 USD"},
   {"value":"3000+","label":"Más de 3.000 USD"},
   {"value":"indefinido","label":"Todavía no lo definí"}]',
 false,true,0,1,1,null,null,null,'clients','ads_budget_monthly','fill',305,'3. Oferta y objetivos'),

('tiene_pixel','cierre',60,'tecnico',
 '¿Tenés el Pixel de Meta instalado?',
 'Si no sabés qué es, poné "no sé" — lo resolvemos en la reunión.','','',
 '[]','opciones',
 '[{"value":"si","label":"Sí"},{"value":"no","label":"No"},{"value":"nose","label":"No sé qué es"}]',
 false,true,0,1,1,null,null,null,null,null,'fill',403,'4. Audiencia y segmentación'),

('tiene_bbdd','cierre',61,'tecnico',
 '¿Tenés listas de emails o teléfonos de clientes?',
 'Sirven para buscar gente parecida a los que ya te compraron.','','',
 '[]','opciones',
 '[{"value":"si","label":"Sí"},{"value":"no","label":"No"}]',
 false,true,0,1,1,null,null,null,null,null,'fill',404,'4. Audiencia y segmentación'),

('lead_magnet','cierre',62,'tecnico',
 '¿Tenés algo gratis para regalar?',
 'Un ebook, una clase, una guía. Si no tenés, lo armamos nosotros.','',
 'Una guía en PDF de 7 días de desayunos saludables', '[]','corta','[]',
 false,false,0,1,1,null,null,null,null,null,'fill',306,'3. Oferta y objetivos'),

('calificacion_preguntas','cierre',70,null,
 '¿Qué te gustaría saber de alguien antes de hablarle?',
 'Dos o tres preguntas que te ayuden a saber si vale la pena la llamada.',
 'Las ponemos en el formulario que completan antes de contactarte.',
 '¿Hace cuánto que estás intentando bajar de peso? · ¿Cuánto podrías invertir por mes en tu salud? · ¿Con qué disponibilidad contás para las videollamadas?',
 '[]','corta','[]',
 false,true,0,1,1,null,null,null,null,null,'fill',601,'6. Formularios de captación'),

('compliance','cierre',80,null,
 '¿Tu empresa tiene que aprobar la publicidad antes de publicarla?',
 'Marcá lo que corresponda.','',
 '', '[]','chips_multi',
 '[{"value":"aprueba_todo","label":"Sí, revisan todo antes"},
   {"value":"solo_logo","label":"Solo si uso su logo o su nombre"},
   {"value":"claims","label":"Hay frases prohibidas"},
   {"value":"libre","label":"No, puedo publicar libre"},
   {"value":"nose","label":"No sé, mi empresa no me dijo nada"}]',
 false,true,0,1,1,null,null,null,null,null,'fill',705,'7. Competencia y diferenciadores'),

('compliance_contacto','cierre',81,null,
 '¿Con quién hay que hablar para esas aprobaciones?',
 'Nombre y contacto, si lo tenés.','','Departamento de Marketing — legal@empresa.com, tardan unos 5 días',
 '[]','corta','[]',
 false,false,0,1,1,'{"qkey":"compliance","in":["aprueba_todo","solo_logo","claims"]}',null,null,null,null,'fill',705,'7. Competencia y diferenciadores'),

('quien_graba','cierre',90,'grabacion',
 '¿Quién va a grabar los videos?','','','',
 '[]','opciones',
 '[{"value":"yo","label":"Yo"},
   {"value":"equipo","label":"Alguien de mi equipo"},
   {"value":"ia","label":"Quiero que lo haga la IA"}]',
 false,true,0,1,1,null,null,null,null,null,'fill',506,'5. Canales y producto'),

('heygen','cierre',91,'grabacion',
 '¿Nos autorizás a crear un clon de tu imagen con IA?',
 'Grabás una vez y después podemos generar variantes de tus anuncios sin que grabes de nuevo. Si después no te gusta, lo apagamos.','','',
 '[]','opciones',
 '[{"value":"si","label":"Sí, adelante"},
   {"value":"no","label":"No, prefiero grabar yo"},
   {"value":"despues","label":"Lo decido después"}]',
 false,true,0,1,1,null,null,null,null,null,'fill',112,'1.2 Autorización Heygen'),

('fecha_grabacion','cierre',92,'grabacion',
 '¿Qué día podés grabar tus videos?',
 'Reservá una fecha firme. Necesitás una hora y un lugar con buena luz.','','',
 '[]','fecha','[]',
 false,true,0,1,1,null,null,null,null,null,'fill',507,'5. Canales y producto'),

('delegado_nombre','cierre',100,'delegado',
 '¿Hay alguien de tu equipo que nos pueda ayudar con esto?',
 'Opcional. Alguien que nos pase material o responda dudas cuando vos no puedas.','','María José, mi asistente',
 '[]','corta','[]',
 false,false,0,1,1,null,null,null,null,null,'fill',817,'8. Necesitamos del cliente'),

('delegado_whatsapp','cierre',101,'delegado',
 'Su WhatsApp','','','+54 9 341 555 9876',
 '[]','telefono','[]',
 false,false,0,1,1,'{"qkey":"delegado_nombre","in":[]}',null,null,null,null,'fill',817,'8. Necesitamos del cliente')

)
insert into public.onboarding_questions (
  qkey, skey, orden, grupo, label, sublabel, ayuda_md, ejemplo, chips, qtype, opciones,
  voz, requerida, min_chars, peso, minutos, visible_si, bucket_key, target_count,
  target_kind, target_column, target_mode, plantilla_ord, plantilla_ref)
select q.qkey, q.skey, q.orden, q.grupo, q.label, q.sublabel, q.ayuda_md, q.ejemplo,
       q.chips::jsonb, q.qtype, q.opciones::jsonb,
       q.voz, q.requerida, q.min_chars, q.peso, q.minutos,
       nullif(q.visible_si,'')::jsonb, q.bucket_key, q.target_count,
       q.target_kind, q.target_column, q.target_mode, q.plantilla_ord, q.plantilla_ref
from q
on conflict (qkey) do update set
  skey = excluded.skey, orden = excluded.orden, grupo = excluded.grupo,
  label = excluded.label, sublabel = excluded.sublabel, ayuda_md = excluded.ayuda_md,
  ejemplo = excluded.ejemplo, chips = excluded.chips, qtype = excluded.qtype,
  opciones = excluded.opciones, voz = excluded.voz, requerida = excluded.requerida,
  min_chars = excluded.min_chars, peso = excluded.peso, minutos = excluded.minutos,
  visible_si = excluded.visible_si, bucket_key = excluded.bucket_key,
  target_count = excluded.target_count, target_kind = excluded.target_kind,
  target_column = excluded.target_column, target_mode = excluded.target_mode,
  plantilla_ord = excluded.plantilla_ord, plantilla_ref = excluded.plantilla_ref
-- No pisa lo que el equipo ya editó desde el panel.
where public.onboarding_questions.updated_by is null;

-- `delegado_whatsapp` depende de que delegado_nombre tenga CUALQUIER contenido.
-- visible_si con "in" vacío no sirve para eso: se resuelve con "no_vacio".
update public.onboarding_questions
   set visible_si = '{"qkey":"delegado_nombre","no_vacio":true}'::jsonb
 where qkey = 'delegado_whatsapp' and updated_by is null;

notify pgrst, 'reload schema';
