
const BLOCKS = [
  { name: 'Bloque 1 · Arranque', short: 'Arranque', title: 'Ya estás dentro, formalmente.', desc: 'Tu sesión reservada, tus datos y tu contrato. Lo administrativo terminó — ahora viene lo que construye tu negocio.', unlock: '' },
  { name: 'Bloque 2 · Estrategia', short: 'Estrategia', title: 'Con esto ya podemos escribir tu VSL y tus anuncios.', desc: 'Tu foco, tu oferta, tu gente y tu historia. Es el corazón del proyecto y ya está cerrado.', unlock: 'Guiones y Embudos en tu panel' },
  { name: 'Bloque 3 · Operación', short: 'Operación', title: 'Tu infraestructura queda lista para el día 0.', desc: 'Dominio, WhatsApp, accesos y compliance. Todo lo que suele frenar un lanzamiento, resuelto de entrada.', unlock: '' },
  { name: 'Bloque 4 · Materiales y arranque', short: 'Materiales', title: 'Terminaste. Ahora empezamos nosotros.', desc: '', unlock: 'Material y Avance del proyecto' }
];

const BOTONES = [
  { v: 'tiempo', label: 'Tiempo extra' }, { v: 'ingreso', label: 'Ingreso extra' },
  { v: 'libertad', label: 'Libertad financiera' }, { v: 'viajar', label: 'Viajar' },
  { v: 'desarrollo', label: 'Desarrollo personal' }, { v: 'jubilacion', label: 'Jubilación' },
  { v: 'contribucion', label: 'Contribución' }
];
const SEXO = [{ v: 'mujeres', label: 'Mayormente mujeres' }, { v: 'hombres', label: 'Mayormente hombres' }, { v: 'mixto', label: 'Mixto' }];
const EDADES = [{ v: '18-25', label: '18 a 25' }, { v: '25-35', label: '25 a 35' }, { v: '35-45', label: '35 a 45' }, { v: '45-55', label: '45 a 55' }, { v: '55+', label: '55 o más' }];

const STEPS = [
  {
    b: 0, badge: '00', eyebrow: 'Primero lo primero', title: 'Agenda tu sesión de onboarding',
    desc: 'Reserva ahora la videollamada en la que repasamos todo esto contigo. Completa el resto del onboarding antes de esa reunión: la usamos para resolver dudas, no para responderlo ahí.',
    screens: [{ fields: [{ k: 'sesion', t: 'sch', req: true, agenda: true }] }]
  },
  {
    b: 0, badge: '01', eyebrow: 'Sección 0 · datos administrativos', title: 'Empecemos por ti',
    desc: 'Lo justo para formalizar el inicio: con estos datos armamos tu contrato y tu factura. Dos minutos y pasamos a lo importante.',
    screens: [{
      fields: [
        {
          k: 'datos_enviados', t: 'p', req: true, label: '¿Enviaste los datos para firmar el contrato y realizar la factura?',
          opts: [
            { v: 'si', label: 'Sí, ya los envié', desc: 'Seguimos con la parte importante' },
            { v: 'no', label: 'No — los dejo aquí', desc: 'Cuatro campos y listo' }
          ]
        },
        { k: 'dat_nombre', t: 's', req: true, cond: a => a.datos_enviados === 'no', label: 'Nombre completo', ph: 'María Fernanda González Ruiz' },
        { k: 'dat_documento', t: 's', req: true, cond: a => a.datos_enviados === 'no', label: 'Número del documento de identidad', sub: 'DNI, CI, NIF, RFC o el que corresponda en tu país.', ph: '27.845.112' },
        { k: 'dat_email', t: 's', req: true, cond: a => a.datos_enviados === 'no', label: 'E-mail', sub: 'A esta dirección te llega el contrato para firmar.', ph: 'maria@marianutricion.com' },
        { k: 'dat_direccion', t: 'a', req: true, cond: a => a.datos_enviados === 'no', label: 'Dirección completa, con código postal y país', minH: 100, ph: 'Av. Pellegrini 1420, piso 3 · Rosario, Santa Fe · CP 2000 · Argentina' },
        { t: 'i', infoKicker: 'Por qué te lo pedimos ahora', infoTitle: 'La firma arranca tu reloj de 15 días', infoBody: 'Es lo que nos habilita a comprar tu dominio, abrir tu cuenta publicitaria y poner al equipo a escribir. Todo lo demás de este onboarding avanza en paralelo, pero la entrega se cuenta desde la firma.' }
      ]
    }]
  },
  {
    b: 1, badge: '03', eyebrow: 'Sección 1 · el rumbo', title: '¿Cuál es tu foco?',
    desc: 'Solo una opción puede ser el foco principal. Esto ordena todo lo que viene: si eliges oportunidad, empezamos por ahí. Igual completarás lo básico del otro pilar para que entendamos tu empresa al 100%.',
    screens: [{
      fields: [{
        k: 'foco', t: 'p', req: true, label: 'Elige tu foco principal',
        opts: [
          { v: 'op100', label: 'Oportunidad de negocio 100%', desc: 'Todo el foco en reclutar para tu equipo' },
          { v: 'prod100', label: 'Venta de producto 100%', desc: 'Todo el foco en vender lo que ofreces' },
          { v: 'ambas_op', label: 'Ambas — primero oportunidad', desc: 'Reclutamiento como prioridad, producto después' },
          { v: 'ambas_prod', label: 'Ambas — primero producto', desc: 'Producto como prioridad, oportunidad después' }
        ]
      }]
    }]
  },
  {
    b: 1, badge: '04', eyebrow: 'Sección 2 · lo esencial', title: 'Tu negocio',
    desc: 'Información general que aplica a ambos focos. Con esto entendemos qué haces y a quién ayudas.',
    screens: [{
      fields: [
        { k: 'negocio_nombre', t: 's', req: true, label: 'Nombre de tu negocio o proyecto', ph: 'María González Nutrición' },
        {
          k: 'negocio_paises', t: 'a', req: true, label: '¿En qué países opera la empresa y dónde tienes más actividad hoy?', minH: 100, ph: 'La empresa en 94 países · mi actividad: Argentina (70%), Chile, México',
          ex: 'La empresa opera en 94 países. Yo tengo actividad real en Argentina (el 70% de mi equipo, sobre todo Rosario y Buenos Aires), Chile, México y una línea chica en España que arrancó el año pasado.'
        },
        {
          k: 'negocio_destino', t: 'a', req: true, label: 'Destino / Transformación: ¿a qué ayuda tu negocio exactamente, en una frase?',
          sub: 'Una sola frase, en el idioma de tu cliente.', minH: 90, len: 200,
          ex: 'Ayudo a mujeres de 35 a 55 que se sienten hinchadas y sin energía a recuperar su cuerpo y su cabeza en 30 días, sin dejar de comer lo que les gusta.'
        },
        {
          k: 'negocio_explicacion', t: 'o', req: true, len: 700, label: '¿Cómo le explicarías el negocio a alguien que no lo conoce, en 2-3 minutos?',
          sub: 'Puedes escribirlo o, mejor aún, grabarlo con tus palabras.',
          rem: ['qué haces', 'para quién', 'cómo gana dinero la gente'],
          ex: 'Le digo: ayudo a personas que están cansadas de cambiar horas por dinero a armar un ingreso desde el celular, sin dejar lo que hacen hoy. Trabajo con una empresa de nutrición que tiene 30 años en el mercado, y lo que hago es enseñarle a la gente a vender esos productos y a formar su propio equipo. No es magia ni es rápido: al principio le dedicas una hora por día y en seis meses, si le pones, ya tienes un ingreso que se nota. Yo empecé igual, trabajando de enfermera en un hospital público.'
        }
      ]
    }]
  },
  {
    b: 1, badge: '05', eyebrow: 'Sección 3 · tu gente', title: 'Tu equipo y comunidad',
    desc: 'Aplica sobre todo si tu foco incluye oportunidad de negocio, pero complétala igual.',
    screens: [{
      fields: [
        { k: 'redes_personales', t: 'a', req: true, label: 'Tu Instagram, redes y web personales', sub: 'Si son más de una persona, pongan el de todos. Si eres dueño de empresa, los de la empresa.', minH: 90, ph: 'https://instagram.com/…', ex: 'Instagram personal: @maria.gonzalez.nutri (12.400 seguidores)\nInstagram del equipo: @equipolibertad.ar\nFacebook: /marianutricionrosario\nTikTok: @marianutri (recién arranqué)\nWeb: todavía no tengo' },
        { k: 'red_tamano', t: 'a', req: true, label: '¿Cuántas personas hay en tu red hoy? ¿En qué países, principalmente?', minH: 90, ph: '412 en total, 90 activas · 70% Argentina, 15% Chile, 10% México', ex: 'Somos 412 personas en total, pero activas de verdad unas 90. El 70% en Argentina, 15% en Chile, 10% en México y algunas sueltas en España.' },
        { k: 'equipo_nombre', t: 'a', label: 'Si tu equipo tiene nombre, ¿cuál es? ¿Cómo surgió?', minH: 90, ph: 'Equipo Libertad — lo elegimos entre las tres primeras que sumé', ex: 'Se llama Equipo Libertad. Salió de una charla con las tres primeras chicas que sumé: las tres queríamos lo mismo, dejar de pedir permiso para ir a un acto escolar. Lo votamos por WhatsApp en 2020 y quedó.' },
        {
          k: 'equipo_valores', t: 'o', req: true, len: 800, label: '¿Qué valores definen a tu equipo? ¿Qué aporta a los nuevos integrantes?',
          rem: ['cómo empezó', 'qué valores tienen', 'qué se lleva el que entra'],
          ex: 'Lo que nos define es que nadie se queda solo: tenemos un sistema de madrinas donde cada persona nueva tiene una asignada durante sus primeros 90 días. Somos muy de celebrar lo chico, la primera venta se festeja igual que un ascenso de rango. Y hay una regla que no se negocia: no se vende con mentiras ni se promete lo que no se puede cumplir. Eché a dos personas por eso. Quien entra se lleva formación real, un grupo que responde todos los días, y la tranquilidad de que si se cae, hay alguien que lo levanta.'
        },
        {
          k: 'equipo_cualidades', t: 'a', req: true, len: 500, label: '¿Qué cualidades tienen las personas que mejor funcionan en tu equipo?',
          sub: 'No lo que buscas en teoría: lo que ves en los que realmente rinden.', minH: 110,
          ex: 'Las que mejor funcionan son las que ya venían vendiendo algo, aunque sea ropa por catálogo o tortas por encargo: no les da vergüenza ofrecer. Casi todas tienen entre 35 y 50 y algo que las aprieta, una deuda, un hijo que empieza la facultad, algo concreto. Y son las que preguntan mucho al principio, las que te llenan de mensajes. Las que dicen «sí, dale, mándame todo» y no preguntan nada, no arrancan nunca.'
        },
        {
          k: 'equipo_no_quiero', t: 'a', req: true, len: 500, label: '¿A qué tipo de persona NO quieres atraer?',
          sub: 'Con esto excluimos gente de tus anuncios y no gastas dinero en quien no te sirve.', minH: 110,
          ex: 'No quiero gente que busca hacerse rica sin trabajar, los que preguntan «¿cuánto gano sin hacer nada?». Tampoco los que ya están en otra compañía y quieren cambiar cada seis meses, esos rompen el equipo. No quiero menores de 25 en general, porque no tienen la disciplina ni la red de contactos. Y no quiero a los que vienen a discutir si esto es una estafa: no me interesa convencer a nadie.'
        },
        {
          k: 'por_que_contigo', t: 'o', req: true, len: 900, label: '¿Por qué se unen contigo y no con otro líder de la misma empresa?',
          sub: 'Piensa en lo que te dicen las personas que ya están en tu equipo.',
          rem: ['qué haces que otros no', 'qué te dicen los tuyos', 'qué armaste tú mismo'],
          ex: 'Porque yo no desaparezco después de que firman. La mayoría te suma y te deja sola con un PDF. Yo tengo un grupo de WhatsApp donde respondo todos los días, hago una llamada grupal los martes a las 20h desde hace tres años, y a cada persona nueva la acompaño en sus primeras cinco ventas: me conecto con ella y hacemos la venta juntas. También armé un manual propio de 40 páginas con los guiones que a mí me funcionaron, que no es material de la empresa, es mío. Y algo que me dicen mucho: que soy honesta con los números. No prometo que se van a hacer millonarias en tres meses, les digo exactamente cuánto tardé yo y cuánto trabajé.'
        },
        {
          k: 'acompanamiento', t: 'o', req: true, len: 700, label: '¿Qué acompañamiento concreto das a quien entra a tu equipo?',
          sub: 'Rituales, llamadas semanales, contenido, grupo de WhatsApp, sistema de duplicación, mentoría…',
          ex: 'Los primeros 90 días tiene una madrina asignada que le responde por WhatsApp todos los días. La primera semana hacemos una videollamada de una hora donde armamos juntas su lista de contactos y su primer mensaje. Le doy mi manual de 40 páginas con los guiones. Todos los martes a las 20h hay capacitación en vivo por Zoom, y quedan grabadas en un Drive al que tiene acceso. Sus primeras cinco ventas las hacemos juntas: se conecta conmigo y yo la acompaño en la llamada. Después pasa al grupo general, donde medimos con una planilla semanal quién hizo cuántos contactos.'
        }
      ]
    }]
  },
  {
    b: 1, badge: '4A', eyebrow: 'Sección 4A · tu oferta de producto', title: 'Tu producto',
    desc: 'Completa si tu foco incluye producto. Si es oportunidad 100%, danos al menos lo básico para entender tu empresa.',
    screens: [{
      fields: [
        {
          k: 'producto_principal', t: 'a', req: true, label: '¿Cuál es el producto principal que quieres ofrecer?', minH: 120, len: 600,
          ex: 'Es un pack de nutrición celular de 30 días: un batido de proteína vegetal para el desayuno, un té termogénico y un aloe para el sistema digestivo. Está pensado para mujeres de 35 a 55 que se sienten hinchadas, sin energía y que ya probaron dietas que no les funcionaron. No es una dieta: reemplazas una comida y listo.'
        },
        {
          k: 'producto_beneficios', t: 'a', req: true, label: 'Beneficios concretos: ¿cuál es el «después» tras usar este producto?', minH: 110, len: 500,
          ex: 'En 30 días la mayoría baja entre 3 y 6 kilos, pero lo que más me dicen es que duermen mejor y que se les fue el bajón de las 4 de la tarde. Dejan de sentirse hinchadas en la primera semana. Y hay algo que no está en el folleto: se vuelven a sacar fotos.'
        },
        {
          k: 'producto_diferencial', t: 'a', req: true, label: 'Valor diferencial: ¿en qué se diferencia de lo que ya existe?', minH: 110, len: 500,
          ex: 'La empresa tiene certificación de calidad propia y estudios clínicos publicados, no es un batido de marca blanca. Y del lado mío: no vendo el producto suelto, va con un plan de comidas que armé yo y un grupo de seguimiento donde estoy todos los días. Lo que hace la diferencia no es el polvo, es que nadie lo hace sola.'
        },
        { k: 'producto_usuarios', t: 's', req: true, label: '¿Cuántas personas ya lo han usado (aprox.)?', ph: '180 clientas mías, y unas 40.000 en el país', inputMode: 'text' },
        { k: 'producto_mercado', t: 'a', req: true, label: 'Mercado al que te diriges', minH: 90, ph: 'Mujeres de 35 a 55, mamás, Argentina · Chile · Uruguay', ex: 'Mujeres de 35 a 55, mamás, que trabajan en relación de dependencia o tienen un emprendimiento chico. Argentina, Chile y Uruguay. Que ya intentaron bajar de peso antes y no lo lograron.' },
        { k: 'producto_precio', t: 's', req: true, label: 'Precio del producto', ph: 'Pack de inicio 89 USD · recompra mensual 75 USD' },
        { k: 'producto_condiciones', t: 'a', req: true, len: 300, label: 'Condiciones (envíos, suscripción, recompra…)', minH: 100, ex: 'Envío gratis a todo el país en 48-72 h. La primera compra tiene 15% de descuento si se suscriben a la recompra mensual, que se puede cancelar cuando quieran sin permanencia. Si compran dos packs, el segundo sale a 75.' },
        { k: 'producto_garantia', t: 'a', req: true, len: 220, label: '¿Hay garantía? ¿Tiempo y condiciones?', minH: 90, ex: '30 días de devolución. Si no está conforme, devuelve los envases aunque estén vacíos y se le reintegra el 100%. Lo cubre la empresa, no yo.' },
        { head: 'Avatar del producto', headSub: 'Piensa en quien ya lo compró, no en quien te gustaría que lo compre.', k: 'av_prod_sexo', t: 'p', req: true, label: 'Sexo', opts: SEXO },
        { k: 'av_prod_edad', t: 'c', req: true, label: 'Rango de edad', opts: EDADES },
        { k: 'av_prod_laboral', t: 'a', req: true, label: 'Situación laboral', minH: 90, ph: 'Docentes, enfermeras, empleadas administrativas · sueldo fijo', ex: 'Docentes, enfermeras, empleadas administrativas y algunas con un emprendimiento chico de comida o ropa. Casi todas con sueldo fijo que no les alcanza y doble jornada en casa.' },
        {
          k: 'av_prod_dolores', t: 'a', req: true, label: 'Dolores principales', sub: 'Escríbelo como lo dice esa persona, no como lo dirías tú.', minH: 130, len: 700,
          ex: 'La mayoría llega diciendo lo mismo: «me miro al espejo y no me reconozco». Subieron 10 o 15 kilos después de los embarazos o de la menopausia, están todo el día cansadas, se levantan ya sin energía. Probaron de todo: la dieta de la nutricionista que abandonaron a la semana, el gimnasio al que fueron un mes, las pastillas que compraron por Instagram. Cada intento fallido les dejó la sensación de que el problema son ellas, que no tienen fuerza de voluntad. Y hay algo que casi ninguna dice en voz alta: dejaron de ir a eventos, de sacarse fotos, de tener intimidad con su pareja.'
        },
        { k: 'av_prod_botones', t: 'c', req: true, label: 'Botones calientes — marca los que apliquen', opts: BOTONES },
        {
          k: 'producto_casos', t: 'o', req: true, len: 900, label: 'Casos de éxito del producto (antes / después)',
          sub: 'Idealmente en video, pero ahora cuéntanoslos. Importante: que sean del mismo avatar al que nos dirigimos.',
          rem: ['nombre y edad', 'cómo estaba antes', 'qué logró y en cuánto'],
          ex: 'Marcela, 48 años, de Rosario. Llegó pesando 89 kilos, con presión alta y tomando medicación. En 5 meses bajó 17 kilos y el médico le sacó una de las pastillas.\n\nVanina, 34, dos hijos chicos. No le importaba tanto el peso, estaba con agotamiento y caída de pelo post parto. A los dos meses me mandó un audio llorando porque se pudo poner el vestido de su casamiento. Bajó 8 kilos.\n\nFernando, 52, camionero, comía en la ruta, tenía prediabetes. Bajó 22 kilos en 8 meses y el último análisis le dio valores normales. Nadie le cree que es el mismo de la foto.'
        }
      ]
    }]
  },
  {
    b: 1, badge: '4B', eyebrow: 'Sección 4B · tu oferta de oportunidad', title: 'Tu oportunidad de negocio',
    desc: 'Completa si tu foco incluye oportunidad. Si es producto 100%, danos al menos lo básico.',
    screens: [{
      fields: [
        {
          k: 'op_explicacion', t: 'o', req: true, len: 700, label: '¿Cómo explicas con tus palabras en qué consiste esta oportunidad?',
          ex: 'Es armar tu propio negocio de nutrición sin tener que fabricar nada ni poner un local. Vendes productos de una empresa que ya tiene 31 años y, cuando le enseñas a otra persona a hacer lo mismo, cobras también por lo que ella vende. Se puede hacer desde el celular, una hora por día, sin dejar tu trabajo. No es un empleo: no tienes jefe ni horario, pero tampoco tienes sueldo asegurado — cobras por lo que haces.'
        },
        {
          k: 'op_que_busca', t: 'a', req: true, label: '¿Qué busca realmente la persona para querer formar parte?', minH: 120, len: 600,
          ex: 'No buscan «un negocio», buscan salir de algo. La mayoría quiere dejar de contar los días hasta el 10 y poder decidir su tiempo: llevar a los chicos al colegio, no pedir permiso para un acto escolar. Muchas también buscan pertenecer a algo, sentirse útiles otra vez — sobre todo las que se acaban de jubilar o quedaron sin trabajo.'
        },
        {
          k: 'op_diferencial', t: 'a', req: true, label: 'Valor diferencial y «highlights» frente a lo que ya existe', minH: 130, len: 800,
          ex: 'La empresa tiene 31 años y opera en 94 países, no es una startup que puede desaparecer. El plan de compensación paga desde la primera venta, no tienes que llegar a un rango para cobrar: la gente ve dinero en su primera semana y no abandona. No hay obligación de compra mensual mínima, que es lo que hunde a la gente en otras compañías. La recompra del producto es del 68%, o sea que armas un ingreso que se repite sin salir a buscar clientes nuevos todos los meses.'
        },
        { k: 'op_mercado', t: 'a', req: true, label: 'Mercado al que nos dirigimos', minH: 90, ph: 'Mujeres y hombres de 30 a 55 · Argentina, Chile y México', ex: 'Mujeres y hombres de 30 a 55, en Argentina, Chile y México, con trabajo pero sin margen: enfermeras, docentes, empleados de comercio, choferes. Gente que ya vendió algo alguna vez, aunque sea ropa por catálogo.' },
        { k: 'op_precio', t: 'a', req: true, label: 'Precio / modalidades para entrar', minH: 100, ph: 'Kit básico 180 USD · kit de negocio 350 USD · sin cuota mensual', ex: 'Kit de inicio básico 180 USD (incluye producto para el primer mes y la licencia). Kit de negocio 350 USD, que es el que recomiendo porque ya te deja stock para vender. Y hay uno de 1.200 USD para quien quiere arrancar con equipo. No hay cuota mensual obligatoria.' },
        { head: 'Avatar de la oportunidad', headSub: 'Piensa en quien ya está en tu equipo, no en quien te gustaría sumar.', k: 'av_op_sexo', t: 'p', req: true, label: 'Sexo', opts: SEXO },
        { k: 'av_op_edad', t: 'c', req: true, label: 'Rango de edad', opts: EDADES },
        { k: 'av_op_laboral', t: 'a', req: true, label: 'Situación laboral', minH: 90, ph: 'Empleadas con sueldo que no alcanza, comerciantes, jubiladas recientes', ex: 'Empleadas con sueldo fijo que no alcanza, algunas con doble trabajo. También comerciantes que quedaron golpeados después de la pandemia y jubiladas recientes.' },
        {
          k: 'av_op_dolores', t: 'a', req: true, label: 'Dolores principales', sub: 'Sus palabras exactas, sin pulir.', minH: 130, len: 700,
          ex: '«Trabajo todo el día y no me alcanza.» «Estoy cansada de estar cansada.» «Quiero dejar de depender de mi sueldo.» «No tengo tiempo ni para mí.» «Me da vergüenza que mis amigas se enteren.» «¿Y esto realmente funciona o es como todo?» Y la que más duele: sienten que a esta altura de su vida ya no van a poder cambiar nada.'
        },
        { k: 'av_op_botones', t: 'c', req: true, label: 'Botones calientes — marca los que apliquen', opts: BOTONES },
        {
          k: 'op_casos', t: 'o', req: true, len: 900, label: 'Casos de éxito de la oportunidad (cómo les cambió la vida)',
          sub: 'Personas distintas a las del producto. Nombre, cómo estaban antes, qué lograron y en cuánto tiempo.',
          rem: ['quién era', 'cómo estaba antes', 'qué logró y en cuánto'],
          ex: 'Carolina, 41, docente de primaria en Mar del Plata. Entró en 2022 con doble turno en la escuela y sintiendo que se le iba la vida. Hoy factura 2.500 USD por mes y dejó uno de los dos turnos.\n\nDamián, 37, tenía un local de repuestos que le iba mal después de la pandemia. Le daba vergüenza que sus amigos se enteraran; tardó tres semanas en decidirse. En un año armó un equipo de 30 personas y se permitió un viaje con la familia.\n\nSilvina, 55, recién jubilada y deprimida porque sentía que ya no servía para nada. No vino por el dinero, vino por pertenecer a algo. Hoy es la que más vende del equipo.'
        }
      ]
    }]
  },
  {
    b: 1, badge: '06', eyebrow: 'Nuevo · para no adivinar a mitad de camino', title: '¿Por qué frente empezamos?',
    desc: 'Elegiste trabajar los dos pilares. Si de la estrategia salen dos avatares, saber cuál lanza primero nos evita frenar el diseño con consultas — y a ti, esperas.',
    screens: [{
      fields: [{
        k: 'frente', t: 'p', req: true, cond: a => a.foco === 'ambas_op' || a.foco === 'ambas_prod', label: 'Elige el frente que lanza primero',
        opts: [
          { v: 'op', label: 'Primero el de oportunidad', desc: 'Lanzamos el funnel de reclutamiento y luego el de producto' },
          { v: 'prod', label: 'Primero el de producto', desc: 'Lanzamos el funnel de producto y luego el de reclutamiento' },
          { v: 'korex', label: 'El que esté más listo', desc: 'Confío en el criterio de Korex: arranca el que tenga más activos cerrados' }
        ]
      }]
    }]
  },
  {
    b: 1, badge: '07', eyebrow: 'Sección 5 · cómo suena tu marca', title: 'Comunicación y tono',
    desc: 'Esto define cómo hablan tus anuncios — y qué nunca deben decir. Los claims que marques como prohibidos se convierten en un filtro que revisa cada anuncio antes de grabarlo, para que Meta no te rechace nada.',
    screens: [{
      fields: [
        { k: 'tono', t: 'a', req: true, len: 300, label: 'Ángulo y tono', sub: 'Ej: formal, cercano, motivacional, analítico, comunidad que se apoya…', minH: 100, ex: 'Cercano y directo, sin humo. Quiero que suene a una amiga que sabe de salud, no a una gurú. Me sirve el tono de comunidad («acá nadie se queda sola») y me molesta el tono de coach que grita. Nada de urgencia falsa.' },
        { k: 'palabras_no', t: 'a', req: true, len: 250, label: 'Palabras o expresiones que NO quieres que aparezcan', minH: 100, ex: 'No quiero «adelgazar», «dieta milagro», «cuerpo perfecto», «antes y después» como titular, ni nada que haga sentir mal a nadie por su cuerpo. Tampoco «libertad financiera en 6 meses»: me parece una falta de respeto.' },
        { k: 'claims_si', t: 'a', req: true, len: 250, label: 'Claims o promesas PERMITIDOS por tu empresa', minH: 100, ex: 'Se puede decir «ayuda a mejorar la digestión», «acompaña un estilo de vida saludable», «reemplazo de una comida». Se pueden mostrar testimonios si van con el descargo «resultados individuales».' },
        { k: 'claims_no', t: 'a', req: true, len: 300, label: 'Claims o promesas NO PERMITIDOS', sub: 'Alimenta el filtro anti-baneo que revisa cada anuncio antes de grabarlo.', minH: 110, ex: 'La empresa prohíbe decir «cura», «trata», «adelgaza» y mencionar cualquier enfermedad. No se pueden mostrar cifras de ingresos propias sin el descargo legal. No se puede usar el logo de la empresa en anuncios pagos. Y nada de «ingresos garantizados».' },
        {
          k: 'frases_cierre', t: 'o', req: true, len: 900, label: 'Frases que ya te funcionaron para cerrar gente',
          sub: 'Escríbelas tal cual las dices, sin pulir — esto es oro puro para los anuncios.',
          ex: '«No te estoy ofreciendo un trabajo más, te estoy ofreciendo dejar de pedir permiso.»\n«Yo también pensé que era una estafa. Estuve seis meses evitando a la persona que me lo contó.»\n«No necesitas saber vender, necesitas saber contar lo que te pasó.»\n«¿Qué es lo peor que puede pasar? Que aprendas algo y no funcione. ¿Y lo mejor?»\n«Si sigues igual dentro de un año, no va a ser por falta de una oportunidad.»'
        },
        {
          k: 'objeciones', t: 'o', req: true, len: 700, label: 'Top 3-5 objeciones que más escuchas de prospectos',
          sub: 'Cada objeción que nos cuentes la respondemos dentro de tu video.',
          ex: '«Lo tengo que hablar con mi marido» es la número uno, y en realidad significa que no está convencida ella.\n«No tengo tiempo», que me lo dicen justamente las que están más desesperadas por falta de tiempo.\n«Yo no sirvo para vender» — la más fuerte en la parte de negocio: tienen miedo al ridículo delante de sus conocidos.\n«¿Esto no es una pirámide?» — casi nadie lo dice así de frontal, lo insinúan.\n«Ya probé de todo y nada me funcionó», que es más miedo a fracasar de nuevo que una objeción de precio.'
        }
      ]
    }]
  },
  {
    b: 1, badge: '08', eyebrow: 'Sección 6 · el terreno', title: 'Competencia y diferenciadores',
    desc: 'Nos ayuda a posicionarte con claridad frente a quien ya está ahí.',
    screens: [{
      fields: [
        { k: 'competencia', t: 'a', req: true, label: '¿Quiénes son tus principales competidores o referentes que te inspiran?', sub: 'Nombres, cuentas o links. Uno por línea.', minH: 110, ph: '@lauranutricion\n@vidaplenamlm\nGabriela Ruiz', ex: '@lauranutricion — misma empresa, España, muy buena en video\n@vidaplenamlm — competencia directa, hacen mucho «antes y después»\nGabriela Ruiz — otra compañía, la referente del rubro en Argentina\nMe inspira @doctormacarena por cómo explica sin vender' },
        { k: 'ventajas', t: 'a', req: true, label: '¿Qué ventajas competitivas quieres destacar frente a ellos?', minH: 110, len: 500, ex: 'Ellos venden el «baja 10 kilos en 10 días» y viven de la foto del antes y después. Yo quiero que se note que acá no hay milagro: hay un método de 30 días, un acompañamiento real y resultados que se sostienen. Y quiero destacar que soy enfermera, tengo formación en salud: no soy alguien que se puso a vender batidos de un día para el otro.' }
      ]
    }]
  },
  {
    b: 1, badge: '09', eyebrow: 'Sección 7 · la más importante de todas', title: 'Tu historia y autoridad',
    desc: 'Esta sección alimenta tu autoridad y tu conexión con la audiencia — y la conexión vende. En vez de escribir, háblanos: graba cada respuesta como si te estuvieran entrevistando. Lo transcribimos palabra por palabra, sin pulir. Cuanto más real y con más datos concretos, mejor.',
    hist: true,
    screens: [
      {
        fields: [{
          k: 'h1', t: 'o', req: true, len: 900, label: '¿A qué te dedicabas antes de este negocio? De dónde vienes',
          rem: ['a qué te dedicabas', 'cuántas horas trabajabas', 'qué te dolía de esa vida'],
          ex: 'Trabajé 14 años como enfermera en un hospital público. Turnos de 12 horas, guardias los fines de semana, y aun así no me alcanzaba para pagar el alquiler y la escuela de mis dos hijos. Me levantaba a las 5 de la mañana y volvía cuando ya estaban dormidos. Llegué a tener tres trabajos: el hospital, cuidados a domicilio los sábados y vendía ropa por catálogo. Estaba agotada todo el tiempo y sentía que por más que trabajara, nunca iba a salir de ahí. Lo que más me dolía no era el dinero, era perderme la infancia de mis hijos.'
        }]
      },
      {
        fields: [{
          k: 'h2', t: 'a', req: true, minH: 90, label: '¿Hace cuánto iniciaste en el negocio que haces hoy?', ph: 'Marzo de 2019, van 7 años',
          ex: 'Arranqué en marzo de 2019, así que van poco más de 7 años. Los primeros ocho meses fueron casi nulos, empecé a facturar en serio a fines de 2019.'
        }]
      },
      {
        fields: [{
          k: 'h3', t: 'o', req: true, len: 1200, label: '¿Por qué empezaste? Cuenta tu dolor, tu botón caliente — con contexto real',
          sub: 'Esta respuesta es la que abre tu video de ventas. No hace falta que suene bonito.',
          rem: ['qué pasó exactamente', 'cómo te sentías', 'qué te decidió'],
          ex: 'Fue en marzo de 2019. Mi hijo menor tuvo un problema de salud y necesitaba un tratamiento que no cubría la obra social. Costaba lo que yo ganaba en cuatro meses. Tuve que pedirle dinero prestado a mi hermana y todavía me acuerdo de la vergüenza que sentí. Esa noche entendí que el problema no era que trabajara poco, era que estaba cambiando tiempo por dinero y el tiempo se me estaba acabando. Una compañera del hospital me venía hablando del negocio hacía meses y yo la evitaba, pensaba que era una estafa. La llamé al día siguiente. Empecé sin creerla del todo, con miedo a que se rieran de mí, pero con la certeza de que no podía seguir como estaba.'
        }]
      },
      {
        fields: [{
          k: 'h4', t: 'o', req: true, len: 700, label: '¿Qué resultados de dinero y materiales has logrado?',
          sub: 'Con números concretos. Si tu empresa no permite mostrar cifras, igual cuéntanoslas: nosotros sabemos cómo decirlo sin romper la norma.',
          ex: 'Hoy facturo entre 6.000 y 8.000 dólares por mes, con meses de 11.000 en campaña. Tengo mi casa propia desde hace dos años, la pagué con el negocio. Cambié el auto en 2024. El año pasado me llevé a mis dos hijos a Cancún, el primer viaje de mi vida en avión, y pagué todo sin pedirle dinero a nadie. También le pago la prepaga a mi mamá.'
        }]
      },
      {
        fields: [{
          k: 'h5', t: 'o', req: true, len: 700, label: '¿Qué resultados NO materiales has logrado?',
          sub: 'Lo que ganaste que no se compra. Suele ser lo que más conecta.',
          ex: 'Dejé el hospital en enero de 2021 y ese día lloré en el estacionamiento. Hoy llevo a mis hijos al colegio todas las mañanas y los busco. Mi hija me dijo «mamá, ahora estás siempre» y esa frase vale más que cualquier cifra. Y cambió algo adentro mío: dejé de pedir permiso. Antes tenía que rogar por un franco para un acto escolar; hoy decido yo. Me volví alguien a quien otras mujeres le piden consejo, y eso no lo tenía.'
        }]
      },
      {
        fields: [{
          k: 'h6', t: 'o', req: true, len: 700, label: '¿Qué estilo de vida te permitió? Cuenta una anécdota',
          sub: 'Una escena concreta, con día y lugar. Las anécdotas se ven; los adjetivos no.',
          ex: 'En octubre del año pasado mi hijo tenía el acto de fin de curso un martes a las 10 de la mañana. Antes eso era imposible: significaba pedir un franco tres semanas antes y que me lo negaran. Ese día lo llevé, me quedé en la primera fila, filmé todo y después nos fuimos a desayunar los tres. Volví a casa a las 12 y trabajé dos horas desde el celular. Eso es lo que cambió: no la casa ni el auto, es poder estar donde tengo que estar.'
        }]
      },
      {
        fields: [{
          k: 'h7', t: 'a', req: true, minH: 90, label: '¿Cuántas personas tienes en tu red?', ph: '412 en total, unas 90 activas, en 4 países',
          ex: '412 personas en total, unas 90 activas de verdad. En cuatro países: Argentina, Chile, México y España.'
        }]
      },
      {
        fields: [{
          k: 'h8', t: 'a', req: true, len: 500, minH: 120, label: '¿Qué cualidades tienen mayoritariamente esas personas?',
          ex: 'Son mujeres de 35 a 50, casi todas mamás, con trabajo pero sin margen. Muchas ya habían vendido algo antes: ropa por catálogo, tortas, cosmética. Tienen en común que no les da vergüenza ofrecer y que necesitan algo concreto: una deuda, un hijo que empieza la facultad. Y las mejores son las que preguntan mucho al principio.'
        }]
      },
      {
        fields: [{
          k: 'h9', t: 'a', req: true, len: 500, minH: 120, label: '¿A qué tipo de persona NO quieres en tu negocio?',
          ex: 'A los que buscan hacerse ricos sin trabajar, los del «¿cuánto gano sin hacer nada?». Tampoco a los que ya están en otra compañía y cambian cada seis meses: rompen el equipo. No quiero menores de 25 en general. Y no quiero a los que vienen a discutir si esto es una estafa: no me interesa convencer a nadie.'
        }]
      },
      {
        fields: [{
          k: 'h10', t: 'a', req: true, len: 600, minH: 120, label: '¿A quién SÍ quieres en tu negocio?',
          ex: 'Mujeres de 35 a 55, mamás, que trabajan en relación de dependencia o tienen un emprendimiento chico. En Argentina, Chile o Uruguay. Que sean activas en redes, que comenten cosas, no las que solo miran. Y sobre todo: gente que quiera resolver algo, no gente que quiera quejarse.'
        }]
      },
      {
        fields: [{
          k: 'h11', t: 'o', req: true, len: 900, label: '¿Puntos diferenciales frente a otras oportunidades similares?',
          sub: 'Lo que hace que alguien se quede contigo y no con otro líder de la misma empresa.',
          ex: 'Yo no desaparezco después de que firman. La mayoría te suma y te deja sola con un PDF. Tengo un grupo de WhatsApp donde respondo todos los días, una llamada grupal los martes a las 20h desde hace tres años, y a cada persona nueva la acompaño en sus primeras cinco ventas. Armé un manual propio de 40 páginas que no es material de la empresa, es mío. Y soy honesta con los números: no prometo millones en tres meses, digo exactamente cuánto tardé yo.'
        }]
      },
      {
        fields: [{ k: 'h12', t: 's', req: true, label: '¿Qué edad tienes?', ph: '43', inputMode: 'numeric' }]
      },
      {
        fields: [{
          k: 'h13', t: 'o', req: true, len: 600, label: '¿Cómo le explicas a alguien, en breve, el negocio que haces?',
          sub: 'Como se lo dirías a un vecino en el ascensor. Esto se convierte casi textual en uno de tus anuncios.',
          ex: 'Le digo: ayudo a personas que están cansadas de cambiar horas por dinero a armar un ingreso desde el celular, sin dejar lo que hacen hoy. Trabajo con una empresa de nutrición que tiene 30 años en el mercado, y lo que hago es enseñarle a la gente a vender esos productos y a formar su propio equipo. No es magia ni es rápido: al principio le dedicas una hora por día y en seis meses, si le pones, ya tienes un ingreso que se nota. Yo empecé igual, trabajando de enfermera.'
        }]
      },
      {
        fields: [{
          k: 'h14', t: 'o', len: 600, label: '¿Algo más que quieras que sepamos?',
          sub: 'Lo que no te preguntamos y crees que importa.',
          ex: 'Dos cosas. Una: no quiero que se me venda como «la enfermera que se hizo rica», porque no es verdad y me da vergüenza. Prefiero «la enfermera que dejó el hospital». Y dos: mi hija mayor tiene 16 y a veces aparece en mis videos; me gustaría que no se use su cara en anuncios pagos.'
        }]
      },
      {
        head2: '7.2 · Autoridad pública',
        fields: [
          { head: 'Autoridad pública', headSub: 'Lo usamos en la introducción de tu video. No te achiques: acá corresponde contar lo que lograste.', k: 'aut_hitos', t: 'a', req: true, len: 250, minH: 110, label: 'Hitos, premios, entrevistas, conferencias', ex: 'Soy rango diamante desde 2023. Gané el premio a mejor equipo del país en 2024. Hablé en el escenario del evento anual de la empresa en Miami el año pasado, delante de 4.000 personas.' },
          { k: 'aut_medios', t: 'a', minH: 100, label: 'Apariciones en medios, podcasts, eventos', ph: 'Radio 2 Rosario (2 veces) · podcast Mujeres que Facturan, 2024', ex: 'Me entrevistaron en el programa de la mañana de Radio 2 de Rosario (dos veces), y estuve en el podcast «Mujeres que Facturan» en 2024. Nada de TV todavía.' },
          { k: 'aut_reconocimientos', t: 'a', minH: 100, label: 'Reconocimientos en la empresa o industria', ph: 'Top 10 de facturación del país 3 años seguidos · Líder Formadora 2024', ex: 'Top 10 de facturación del país tres años seguidos. Reconocimiento «Líder Formadora» 2024 por cantidad de personas que subieron de rango en mi equipo. Y soy una de las 12 personas del consejo de líderes de la compañía en Argentina.' }
        ]
      }
    ]
  },
  {
    b: 1, badge: '10', eyebrow: 'Sección 8 · tus formularios de captación', title: 'Calificación del lead',
    desc: 'Define cómo filtramos a la gente que entra por tus anuncios.',
    screens: [{
      fields: [
        {
          k: 'objetivo_lead', t: 'p', req: true, label: '¿Cuál es tu objetivo actual?',
          opts: [
            { v: 'volumen', label: 'Más volumen', desc: 'Atraer más leads aunque sean menos cualificados' },
            { v: 'calidad', label: 'Más calidad', desc: 'Cualificar en el embudo: llegan menos pero mejores al cierre' }
          ]
        },
        {
          k: 'preguntas_lead', t: 'a', req: true, label: '¿Qué preguntas te ayudarían a cerrar más fácil cuando el prospecto llega?',
          sub: 'Dos o tres. Las ponemos en el formulario que completan antes de contactarte.', minH: 120,
          ph: '¿Hace cuánto que intentas resolver esto?\n¿Cuánto podrías invertir por mes?\n¿Cuántas horas al día le dedicarías?',
          ex: '¿Hace cuánto que estás intentando resolver esto?\n¿Cuánto podrías invertir por mes en tu salud o en tu negocio?\n¿Cuántas horas por día le podrías dedicar?\n¿Estás en Argentina, Chile o Uruguay?'
        }
      ]
    }]
  },
  {
    b: 1, badge: '11', eyebrow: 'Sección 9 · lo que ya probaste', title: 'Experiencias en marketing',
    desc: 'Aprendemos de lo que ya funcionó y evitamos repetir lo que no.',
    screens: [{
      fields: [
        { k: 'camp_ok', t: 'a', len: 350, label: '¿Alguna campaña que te haya dado BUENOS resultados?', sub: 'Cuéntanos al detalle cómo la hicieron. Si nunca hiciste, dilo.', minH: 120, ex: 'Hice un sorteo en Instagram en 2023 que me trajo 300 seguidores y 12 ventas. El anuncio era un video mío hablando a cámara contando mi caso, sin producción, grabado con el celular en la cocina. Gasté 80 dólares en 10 días. Lo que creo que funcionó fue que no parecía publicidad.' },
        { k: 'camp_no', t: 'a', len: 300, label: '¿Campañas que NO dieron resultados?', sub: 'Por encima, qué errores se cometieron.', minH: 110, ex: 'Puse 200 dólares en anuncios con una foto del producto y el precio. Cero ventas. Después entendí que a nadie le importa el producto, les importa lo que les pasa a ellas. También probé con una agencia que me hizo videos muy producidos y no funcionaron: se veían a kilómetros que eran un anuncio.' }
      ]
    }]
  },
  {
    b: 2, badge: '12', eyebrow: 'Sección 10 · tu activo más valioso', title: 'Audiencia y segmentación',
    desc: 'Tu base de datos es oro: con ella Meta encuentra a personas parecidas a tus mejores clientes y baja tu coste por lead.',
    screens: [{
      fields: [
        {
          k: 'bbdd', t: 'p', req: true, label: '¿Tienes bases de datos de emails o teléfonos de clientes?',
          sub: 'Con ellas creamos audiencias «similares» y llegamos más fácil al público correcto.',
          opts: [{ v: 'si', label: 'Sí, la subo a mi carpeta' }, { v: 'ayuda', label: 'Sí, pero necesito ayuda para exportarla' }, { v: 'no', label: 'No tengo' }]
        },
        {
          k: 'pixel', t: 'p', req: true, label: '¿Tienes Pixel de Meta o eventos de conversión instalados?',
          opts: [{ v: 'si', label: 'Sí, ya instalado' }, { v: 'no', label: 'No / no lo sé', desc: 'Nosotros lo configuramos' }]
        }
      ]
    }]
  },
  {
    b: 2, badge: '13', eyebrow: 'Sección 11 · tu operación actual', title: 'Canales, proceso y presupuesto',
    desc: 'Cómo vendes hoy y con qué recursos cuentas.',
    screens: [{
      fields: [
        { k: 'web', t: 'a', label: '¿Tienes web o landing activa? Enlace/s', minH: 90, ph: 'https://minegocio.com\nlinktr.ee/miusuario', ex: 'Tengo una tienda vieja en Tiendanube que no uso: marianutricion.mitiendanube.com. Y un linktree que sí uso: linktr.ee/marianutri' },
        {
          k: 'proceso_venta', t: 'o', req: true, len: 700, label: '¿Cómo es tu proceso de ventas completo, de desconocido a cliente?',
          ex: 'Me escriben por Instagram o WhatsApp, casi siempre preguntando el precio. Yo no doy precio de entrada: les hago tres preguntas para entender qué les pasa. Si veo que califica, le mando un audio de dos minutos contándole mi caso y le propongo una videollamada de 20 minutos. En la llamada le muestro el plan, le cuento testimonios parecidos al suyo y ahí sí le paso el precio. Cierro alrededor del 40% de las llamadas. A las que no cierran las paso a una lista y les mando contenido una vez por semana; varias compran dos o tres meses después.'
        },
        { k: 'quien_graba', t: 'p', req: true, label: '¿Quién graba los anuncios?', opts: [{ v: 'yo', label: 'Yo' }, { v: 'equipo', label: 'Alguien de mi equipo' }, { v: 'ia', label: 'Quiero que lo haga la IA' }] },
        { k: 'lead_magnet', t: 'a', label: '¿Tienes algo gratis para regalar?', sub: 'Un PDF, una clase, una guía. Si no tienes, lo armamos nosotros.', minH: 90, ph: 'Guía en PDF de 7 días de desayunos saludables', ex: 'Tengo una guía en PDF de 7 días de desayunos saludables que armé yo, la uso en Instagram y funciona bien. También hago un reto de 5 días por WhatsApp dos veces al año.' },
        { k: 'objetivo_campana', t: 'a', req: true, len: 250, label: 'Objetivo principal de la campaña', minH: 90, ex: 'Quiero 20 personas nuevas por mes en llamada, calificadas, para cerrar 8. Hoy consigo 5 o 6 llamadas por mes y todas son de mi círculo o referidos.' },
        { k: 'presupuesto', t: 'bud', req: true, label: 'Presupuesto mensual para publicidad', sub: 'Es lo que se le paga a Meta, aparte de nuestro servicio.' }
      ]
    }]
  },
  {
    b: 2, badge: '14', eyebrow: 'Sección 12 · dónde vivirá tu landing', title: 'Tu dominio',
    desc: 'Definir esto ahora nos deja congelar la URL el día 0 — y eso desbloquea todo el montaje en paralelo mientras tú sigues con lo tuyo.',
    screens: [{
      fields: [
        { k: 'dominio', t: 's', req: true, label: 'Nombre de dominio deseado para la landing', sub: 'Sin www ni https. Ej: tunegocio.com', ph: 'marianutricion.com' },
        { k: 'dominio_propio', t: 'p', req: true, label: '¿Ya eres propietario de ese dominio?', opts: [{ v: 'si', label: 'Sí, ya lo tengo registrado' }, { v: 'no', label: 'No, todavía no lo registré' }] },
        { k: 'dominio_donde', t: 's', cond: a => a.dominio_propio === 'si', label: '¿Dónde está registrado?', sub: 'Te pediremos acceso o un cambio de DNS — lo coordinamos por el grupo.', ph: 'GoDaddy / Namecheap / Hostinger' },
        {
          k: 'dominio_quien', t: 'p', req: true, cond: a => a.dominio_propio === 'no', label: '¿Quién lo registra?',
          opts: [{ v: 'korex', label: 'Lo registran ustedes', desc: 'Compra y configuración en una sola tarea — lo más rápido' }, { v: 'yo', label: 'Lo registro yo', desc: 'Te pasamos las instrucciones exactas' }]
        },
        { k: 'dominio_alt', t: 's', req: true, label: '2 alternativas por si tu preferido no está disponible', ph: 'marianutricion.com.ar, nutricionconmaria.com' }
      ]
    }]
  },
  {
    b: 2, badge: '15', eyebrow: 'Sección 13 · contacto directo', title: 'Tu WhatsApp',
    desc: 'Este número irá en los botones de contacto de tu landing y tus anuncios. Verifícalo bien — un dígito mal cuesta leads.',
    screens: [{
      fields: [
        { k: 'whatsapp', t: 's', req: true, label: 'Número de WhatsApp para los botones', sub: 'Con código de país. Ej: +34 600 123 456 / +54 9 11 1234 5678', ph: '+54 9 341 555 1234', inputMode: 'tel' },
        {
          k: 'whatsapp_quien', t: 'p', req: true, label: '¿Quién atiende ese WhatsApp cuando lleguen los leads?',
          opts: [{ v: 'yo', label: 'Yo directamente' }, { v: 'equipo', label: 'Alguien de mi equipo', desc: 'Dinos quién en el campo de abajo' }]
        },
        { k: 'whatsapp_persona', t: 's', cond: a => a.whatsapp_quien === 'equipo', label: '¿Quién y en qué horario?', ph: 'María José, mi asistente, de 9 a 21h' }
      ]
    }]
  },
  {
    b: 2, badge: '16', eyebrow: 'Nuevo · para no frenar el lanzamiento', title: 'Accesos a Meta y redes',
    desc: 'Estos accesos suelen aparecer al final y frenan el lanzamiento días enteros. Los resolvemos ahora, de una vez, y tu campaña no espera a nadie.',
    screens: [{
      fields: [
        {
          k: 'bm', t: 'p', req: true, label: '¿Tienes Business Manager de Meta?',
          opts: [{ v: 'si', label: 'Sí — comparto el acceso', desc: 'Te pediremos el ID en la sesión de configuración' }, { v: 'no', label: 'No / no lo sé', desc: 'Lo creamos contigo en la sesión' }]
        },
        {
          k: 'bloqueos', t: 'p', req: true, label: '¿Tu cuenta publicitaria tiene o tuvo bloqueos, rechazos o restricciones?',
          sub: 'Saberlo ahora nos evita descubrirlo el día del lanzamiento.',
          opts: [{ v: 'limpia', label: 'No, está limpia' }, { v: 'problemas', label: 'Sí, tuvo problemas', desc: 'Cuéntanos brevemente abajo' }, { v: 'sin_cuenta', label: 'No tengo cuenta publicitaria', desc: 'Activamos hoy el proceso estándar de creación' }]
        },
        { k: 'bloqueos_detalle', t: 'a', cond: a => a.bloqueos === 'problemas', label: '¿Qué pasó?', len: 200, minH: 100, ex: 'En 2023 me rechazaron tres anuncios por «promesas de salud» y me restringieron la cuenta una semana. Después de eso no volví a pautar. Nunca me la inhabilitaron del todo.' },
        {
          k: 'fanpage', t: 'p', req: true, label: '¿Tienes FanPage de Facebook vinculada a tu Instagram?',
          opts: [{ v: 'si', label: 'Sí, ya vinculadas' }, { v: 'nose', label: 'Tengo FanPage pero no sé si está vinculada' }, { v: 'no', label: 'No tengo FanPage', desc: 'La creamos ahora, no en el sprint de lanzamiento' }]
        },
        { t: 'i', infoKicker: 'Se activa el proceso de creación de cuentas', infoTitle: 'Una cuenta nueva necesita unos 4 días de maduración', infoBody: 'Al finalizar tu onboarding arrancamos hoy mismo el procedimiento estándar de creación de cuentas FB/IG: carga de seguidores y calentamiento. Por eso lo disparamos ahora y no en el sprint de lanzamiento. No tienes que hacer nada más.' },
        {
          k: 'sesion_meta', t: 'p', req: true, label: 'Agenda tu sesión de configuración de Meta con nuestro equipo',
          sub: '30 minutos: dejamos Business Manager, cuenta, FanPage y accesos cerrados de una vez.',
          opts: [{ v: 'agendar', label: 'Agendar ahora', desc: 'Elegirás fecha junto con la de tu grabación, al final' }, { v: 'grupo', label: 'Coordinarlo por el grupo de WhatsApp' }]
        }
      ]
    }]
  },
  {
    b: 2, badge: '17', eyebrow: 'Nuevo · el trámite que corre en paralelo', title: 'Compliance de tu empresa',
    desc: 'Algunas empresas exigen aprobar la publicidad de sus distribuidores antes de publicarla — un trámite que puede tardar semanas. Si es tu caso, lo iniciamos HOY en paralelo, para que no frene nada.',
    screens: [{
      fields: [
        {
          k: 'compliance', t: 'p', req: true, label: '¿Tu empresa exige aprobar la publicidad antes de publicarla?',
          opts: [{ v: 'si', label: 'Sí, tiene proceso de compliance' }, { v: 'no', label: 'No que yo sepa' }, { v: 'nose', label: 'No lo sé', desc: 'Lo averiguamos contigo esta semana — mejor ahora que después' }]
        },
        { k: 'compliance_contacto', t: 's', cond: a => a.compliance === 'si', label: 'Contacto de compliance', ph: 'Depto. de Marketing — legal@empresa.com' },
        { k: 'compliance_tiempos', t: 's', cond: a => a.compliance === 'si', label: '¿Qué tiempos suele manejar?', ph: 'Unos 5 días hábiles' },
        { k: 'compliance_material', t: 'a', len: 200, label: '¿Tienes materiales o claims YA aprobados por tu empresa?', sub: 'Si existen aprobaciones previas, las reutilizamos y ganamos semanas.', minH: 100, ex: 'Tengo un PDF con los claims aprobados de 2024 y tres videos de producto que la empresa autorizó para redes. Los subo a la carpeta.' }
      ]
    }]
  },
  {
    b: 3, badge: '18', eyebrow: 'Sección 14 · tu material', title: 'Sube tus archivos',
    desc: 'Arrastra aquí lo que tengas. Se sube directo a tu carpeta. Lo que no tengas hoy lo marcas como pendiente y tu landing sale igual: la completamos en cuanto llegue (V1 → V2). Fecha límite de materiales: día 3.',
    screens: [
      {
        fields: [
          { k: 'logo', t: 'p', req: true, label: 'Logo', opts: [{ v: 'si', label: 'Tengo logo', desc: 'Lo subo en PNG y alta resolución' }, { v: 'no', label: 'No tengo', desc: '¿Alrededor de quién lo hacemos: tu nombre, el del equipo o el de la empresa?' }] },
          { k: 'logo_alrededor', t: 's', cond: a => a.logo === 'no', label: '¿Alrededor de qué nombre lo armamos?', ph: 'Mi nombre: María González' },
          { k: 'paleta', t: 'p', req: true, label: 'Paleta de colores', opts: [{ v: 'empresa', label: 'Uso los colores de la empresa' }, { v: 'propios', label: 'Mis colores preferidos son…' }, { v: 'branding', label: 'Tengo branding, lo adjunto' }] },
          { k: 'paleta_detalle', t: 's', cond: a => a.paleta === 'propios', label: '¿Cuáles?', ph: 'Azul marino (#0B1E3F) y dorado (#C9A227), fondo blanco' },
          { k: 'tipografia', t: 'p', req: true, label: 'Tipografía', opts: [{ v: 'si', label: 'Tengo, la subo a la carpeta' }, { v: 'no', label: 'No tengo, definan ustedes' }] },
          { t: 'i', infoKicker: '¿Sin branding propio?', infoTitle: 'Usa un paquete Korex por nicho y arranca hoy', infoBody: 'Paquetes de identidad ya validados por sector: paleta, tipografías y estilo listos desde el día 0. Tu funnel no espera decisiones de diseño — y si luego quieres algo a medida, se ajusta en la V2.' },
          { k: 'paquete', t: 'c', max: 1, label: 'Elige un paquete si quieres arrancar con uno', opts: [{ v: 'mlm', label: 'Networkers / MLM' }, { v: 'cripto', label: 'Inversión / Cripto' }, { v: 'viajes', label: 'Viajes / Lifestyle' }, { v: 'salud', label: 'Salud / Bienestar' }, { v: 'belleza', label: 'Belleza / Estética' }] }
        ]
      },
      {
        fields: [
          { head: 'Tus fotos', headSub: 'Con fotos del celular alcanza: buena luz, de frente, sin filtros.', k: 'material_autoridad', t: 'f', req: true, multiple: true, accept: 'image/*', label: 'Fotos tuyas de autoridad', sub: '5 fotos donde se te vea bien la cara. Las usamos en la portada de tus videos y en tu página.', fileCta: 'Sube tus fotos', fileHint: 'Puedes subirlas todas juntas.' },
          { k: 'material_lifestyle', t: 'f', multiple: true, accept: 'image/*', label: 'Fotos de tu estilo de vida', sub: 'Viajes, familia, eventos, premios. Son las que más conectan en los anuncios.', fileCta: 'Sube las que quieras', fileHint: 'Sin límite. Cuantas más, mejor.' },
          { k: 'material_producto', t: 'f', multiple: true, accept: 'image/*', label: 'Fotos de tu producto', sub: 'El producto solo, en uso, y el pack completo si lo tienes.', fileCta: 'Sube las fotos de producto', fileHint: 'Si las tiene tu empresa, sirven igual.' },
          { k: 'material_empresa_files', t: 'f', multiple: true, accept: '*', label: 'PDF o material de tu empresa', sub: 'Presentación, plan de compensación, catálogo, fotos de eventos corporativos.', fileCta: 'Sube el material', fileHint: 'PDF, imágenes, links en un documento: lo que tengas.' }
        ]
      },
      {
        fields: [
          { t: 'i', infoKicker: 'Guion para tus 3 testimonios', infoTitle: 'Qué le pides a cada persona', infoBody: 'Un video horizontal corto respondiendo: nombre y edad, a qué se dedicaba, país · en qué situación estaba antes · cómo te conoció y hace cuánto · qué dudas o creencias limitantes tenía · cómo está ahora, qué logró y cómo se siente. Que cada persona sepa que es un testimonio y dé su consentimiento. De producto por un lado y de oportunidad por el otro: tienen que ser personas distintas.' },
          { k: 'material_testimonios', t: 'f', multiple: true, accept: 'video/*,image/*', label: 'Tus 3 testimonios', sub: 'Video horizontal, con buena luz. Si todavía no los tienes, sigue de largo y súbelos cuando estén.', fileCta: 'Sube tus testimonios', fileHint: 'Video u — si es en texto — captura más la foto de la persona.' }
        ]
      }
    ]
  },
  {
    b: 3, badge: '19', eyebrow: 'Nuevo · para no frenarnos cuando no estás', title: 'Tu delegado y tu comunicación',
    desc: 'Sabemos que lideras y viajas mucho. Si tienes una persona de confianza que pueda decidir por ti en el día a día, el proyecto no se detiene cuando tú no puedes responder. Si trabajas solo, sáltate los tres primeros campos.',
    screens: [{
      fields: [
        { k: 'delegado_nombre', t: 's', label: 'Nombre de tu persona delegada', ph: 'María José Ferrari' },
        { k: 'delegado_wa', t: 's', label: 'Su WhatsApp', ph: '+54 9 341 555 9876', inputMode: 'tel' },
        { k: 'delegado_horario', t: 's', label: '¿En qué horario suele estar disponible?', ph: 'De 9 a 18h, hora Argentina' },
        {
          k: 'compromiso', t: 'p', req: true, label: 'Compromiso de respuesta',
          sub: 'Las reglas del servicio piden respuestas rápidas — sobre todo en la etapa de grabación.',
          opts: [{ v: '24', label: 'Respondemos en menos de 24 h', desc: 'Tú o tu delegado — lo que llegue primero' }, { v: '48', label: 'Necesito hasta 48 h', desc: 'Lo tendremos en cuenta en el cronograma' }]
        },
        {
          k: 'imagen', t: 'p', req: true, label: '¿Autorizas el uso de tu imagen y resultados en la comunicación de Korex?',
          sub: 'Nace de cuidar tu marca: nunca publicamos nada tuyo sin tu permiso.',
          opts: [{ v: 'si', label: 'Sí, con mi consentimiento previo caso por caso' }, { v: 'no', label: 'No, mantener mi proyecto privado' }]
        },
        { k: 'grupo_reglas', t: 'a', len: 300, label: '¿Qué podemos publicar en tu grupo o comunidad y qué no?', sub: 'Definirlo ahora evita malentendidos: separamos siempre el estado real de tu proyecto de cualquier comunicación comercial.', minH: 110, ex: 'En el grupo del equipo pueden publicar avisos de capacitación y material de formación. No quiero que se publique nada de facturación ni de resultados de otras personas, ni promociones de Korex. Si hay algo comercial, me lo mandan a mí primero.' }
      ]
    }]
  },
  {
    b: 3, badge: '20', eyebrow: 'Sección 15 + agenda · lo que más acelera tu entrega', title: 'Tu grabación y HeyGen',
    desc: 'Tu grabación es el único paso que solo puedes dar tú — todo lo demás lo adelantamos en paralelo. Reservándola ahora, tu reloj de 15 días arranca con fecha real. Y HeyGen nos permite generar anuncios sin pedirte grabar una y otra vez.',
    screens: [{
      fields: [
        { t: 'i', infoKicker: 'Antes de decidir', infoTitle: 'Mira el ejemplo de 40 segundos', infoBody: 'Así se ve un cliente nuestro grabado una sola vez y después hablando en tres anuncios distintos, con distinto guion. No es un robot con tu cara: es tu grabación reutilizada.' },
        {
          k: 'heygen', t: 'p', req: true, label: '¿Nos autorizas a usar HeyGen con tu imagen?',
          opts: [{ v: 'si', label: 'Sí, autorizo HeyGen', desc: 'Generamos anuncios sin regrabar cada vez' }, { v: 'no', label: 'No, prefiero grabar todo manualmente' }]
        },
        { k: 'grabacion', t: 'sch', req: true, soloDia: true, label: 'Reserva tu fecha firme de grabación', sub: 'Necesitas una hora libre y un lugar con buena luz. Con el celular alcanza.' }
      ]
    }]
  },
  {
    b: 3, badge: '21', eyebrow: 'Último paso · el control de calidad', title: 'Revisemos que no falte nada',
    desc: 'Tu reloj de 15 días solo arranca cuando lo crítico está completo. Esto es lo que tienes cerrado y lo que queda pendiente — lo pendiente no te frena, pero cuanto antes llegue, antes despega todo.',
    screens: [{ fields: [{ k: 'qc', t: 'sum' }] }]
  }
];

const CHECKLIST = [
  'Los casos de 3 personas a las que les fue bien contigo',
  'Tu logo, en la mejor calidad que tengas',
  'Los colores de tu marca',
  '5 fotos tuyas con buena luz, donde se te vea bien',
  'Opcional: fotos de tu día a día, viajes, familia'
];

const DONE_CHECKS = [
  { t: 'Tu alta quedó registrada', d: 'tu proyecto ya existe en nuestro sistema con tu equipo asignado' },
  { t: 'Tus datos quedaron registrados', d: 'tu contrato sale a firma hoy mismo' },
  { t: 'Tu grabación quedó agendada', d: 'con fecha firme y plan B definido' },
  { t: 'Tu dominio entró en proceso', d: 'la URL de tu funnel se congela hoy' },
  { t: 'Tus claims prohibidos ya son un filtro activo', d: 'ningún anuncio saldrá fuera de norma' },
  { t: 'Si tu empresa exige compliance, el trámite arrancó hoy', d: 'en paralelo, sin frenar nada' }
];

const PHASES = [
  { when: 'Días 1-3 · ya en marcha', title: 'Estrategia y guiones', desc: 'Definimos tus avatares, tu oferta y escribimos tus anuncios y tu VSL.', accent: '#5B7CF5' },
  { when: 'Días 3-5 · tu parte', title: 'Tu grabación', desc: 'El único paso que depende de ti. Ya está agendado. Todo lo demás avanza en paralelo.', accent: '#F97316' },
  { when: 'Días 1-7 · en paralelo', title: 'Construcción de tu embudo', desc: 'Tu landing se monta mientras grabas — no espera a nada.', accent: '#8B5CF6' },
  { when: 'Días 8-10 · lanzamiento', title: 'Salimos a pauta', desc: 'Ensamblamos, probamos todo de punta a punta y encendemos las campañas.', accent: '#06B6D4' },
  { when: 'Días 10-15 · crecimiento', title: 'Optimización y resultados', desc: 'Monitoreamos, ajustamos y te reportamos. Aquí empieza lo bueno.', accent: '#22C55E' }
];

const ICONS = {
  "10": "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  "11": "M12 8v4l3 2M3.05 11a9 9 0 1 1 .5 4M3 4v5h5",
  "12": "M12 3c4.97 0 9 1.34 9 3s-4.03 3-9 3-9-1.34-9-3 4.03-3 9-3zM3 6v12c0 1.66 4.03 3 9 3s9-1.34 9-3V6M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3",
  "13": "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  "14": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.6 5.5 3.6 9s-1.1 6.5-3.6 9c-2.5-2.5-3.6-5.5-3.6-9S9.5 5.5 12 3z",
  "15": "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
  "16": "M21 2l-2 2M11.4 11.6a5 5 0 1 1-7.1 7.1 5 5 0 0 1 7.1-7.1zM11.4 11.6L15.5 7.5M15.5 7.5l3 3L22 7l-3-3-3.5 3.5z",
  "17": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  "18": "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  "19": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM16 11l2 2 4-4",
  "20": "M23 7l-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z",
  "21": "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4l-10 10-3-3",
  "00": "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  "01": "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  "02": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 16c1.5-2 2.5-2 3.5 0s2 2 3.5-1",
  "03": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11.6a.4.4 0 1 0 0 .8.4.4 0 0 0 0-.8z",
  "04": "M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2 12h20",
  "05": "M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  "4A": "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9",
  "4B": "M22 7l-8.5 8.5-4-4L2 19M16 7h6v6",
  "06": "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15 6H9a3 3 0 0 0-3 3v3",
  "07": "M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6",
  "08": "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
  "09": "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3"
};

const WHY = {
  '00': 'Reservar la llamada ahora te asegura el lugar en la agenda del equipo — y todo lo demás avanza en paralelo.',
  '01': 'Con esto emitimos tu contrato y tu factura, y no volvemos a molestarte con papeles.',
  '02': 'La firma es lo que arranca tu reloj de 15 días de entrega.',
  '03': 'Define el mensaje principal de tus anuncios: producto u oportunidad, nunca los dos a la vez.',
  '04': 'Es la base de todo lo que vamos a escribir: qué haces y a quién ayudas.',
  '05': 'Alimenta el bloque de comunidad de tu video y filtra a quién queremos atraer.',
  '4A': 'Con esto armamos tu oferta de producto y el avatar al que le hablan los anuncios.',
  '4B': 'Con esto armamos tu oferta de oportunidad y el guion de reclutamiento.',
  '06': 'Saber cuál lanza primero evita frenar el diseño para consultarte a mitad de camino.',
  '07': 'Define cómo suenan tus anuncios y activa el filtro que evita que Meta te rechace nada.',
  '08': 'Nos posiciona con claridad frente a quien ya está en tu mercado.',
  '09': 'Es la materia prima de tu video de ventas: tus palabras, sin pulir, son las que venden.',
  '10': 'Configura el formulario que la gente completa antes de llegar a tu WhatsApp.',
  '11': 'Reutilizamos lo que ya te funcionó y evitamos repetir lo que te costó dinero.',
  '12': 'Tu base de datos y tu Pixel bajan el coste por lead desde la primera semana.',
  '13': 'Con esto calculamos tu inversión diaria y diseñamos el embudo sobre tu proceso real.',
  '14': 'Congelar la URL hoy nos deja montar tu landing en paralelo.',
  '15': 'Es el número al que van a llegar los interesados: un dígito mal cuesta leads.',
  '16': 'Los accesos son lo que más retrasa lanzamientos. Resolverlos ahora te ahorra días.',
  '17': 'Si tu empresa aprueba publicidad, el trámite arranca hoy en paralelo.',
  '18': 'Tu material es lo que hace que todo salga con tu identidad y tu cara.',
  '19': 'Una persona que pueda decidir por ti evita que el proyecto se detenga cuando viajas.',
  '20': 'Tu grabación es el único paso que solo puedes dar tú. Reservarla pone fecha real al lanzamiento.',
  '21': 'Repasamos qué está cerrado y qué falta antes de arrancar el reloj.'
};

const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const SLOTS = ['09:00', '11:00', '14:00', '16:00', '18:00'];
const STORE = 'mk-onboarding-v2';

class Component extends DCLogic {
  state = {
    view: 'welcome', si: 0, answers: {}, files: {}, openEx: {},
    rec: null, recSec: 0, transcribing: null, writeMode: {}, fromVoice: {},
    saving: false, savedAt: null, wide: true, vid: 0, vidOn: false
  };

  componentDidMount() {
    this.measure();
    this._onResize = () => this.measure();
    window.addEventListener('resize', this._onResize);
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { saved = null; }
    if (saved && saved.answers) this.setState({ answers: saved.answers, si: saved.si || 0, view: saved.view || 'welcome', savedAt: saved.at || null });
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._onResize);
    if (this._recTimer) clearInterval(this._recTimer);
    if (this._trTimer) clearTimeout(this._trTimer);
    if (this._svTimer) clearTimeout(this._svTimer);
    if (this._vidTimer) clearInterval(this._vidTimer);
  }

  vidToggle = () => {
    if (this._vidTimer) clearInterval(this._vidTimer);
    if (this.state.vidOn) { this.setState({ vidOn: false }); return; }
    this.setState({ vidOn: true });
    this._vidTimer = setInterval(() => this.setState(s => {
      const n = s.vid + 1;
      if (n >= 90) { clearInterval(this._vidTimer); return { vid: 90, vidOn: false }; }
      return { vid: n };
    }), 1000);
  };

  measure() { const w = window.innerWidth >= 900; if (w !== this.state.wide) this.setState({ wide: w }); }

  persist(extra) {
    const s = Object.assign({ answers: this.state.answers, si: this.state.si, view: this.state.view, at: Date.now() }, extra || {});
    try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { }
    this.setState({ saving: true });
    if (this._svTimer) clearTimeout(this._svTimer);
    this._svTimer = setTimeout(() => this.setState({ saving: false, savedAt: Date.now() }), 520);
  }

  set(k, v) { this.setState(s => ({ answers: Object.assign({}, s.answers, { [k]: v }) }), () => this.persist()); }
  val(k) { const v = this.state.answers[k]; return v === undefined || v === null ? '' : v; }

  filled(f) {
    if (!f.k) return true;
    const v = this.state.answers[f.k];
    if (f.t === 'c' || f.t === 'chk') return Array.isArray(v) && v.length > 0;
    if (f.t === 'f') return (this.state.files[f.k] || []).length > 0;
    if (f.t === 'sch') return !!(v && v.day);
    if (f.t === 'sum') return true;
    if (f.len) return typeof v === 'string' && v.trim().length >= this.minLen(f);
    return typeof v === 'string' ? v.trim().length > 0 : !!v;
  }

  minLen(f) { return Math.round((f.len || 0) * 0.6); }

  visFields(sc) { const a = this.state.answers; return sc.fields.filter(f => !f.cond || f.cond(a)); }

  flat() {
    const out = [];
    STEPS.forEach((st, i) => {
      let vis = 0;
      st.screens.forEach(sc => { vis += this.visFields(sc).length; });
      if (vis > 0) out.push({ kind: 'cover', i, st });
      st.screens.forEach((sc, j) => {
        const fs = this.visFields(sc);
        if (!fs.length) return;
        out.push({ kind: 'q', i, st, sc, fs, sub: st.screens.length > 1 ? j : -1 });
      });
    });
    return out;
  }

  reqStats() {
    let total = 0, done = 0;
    const a = this.state.answers;
    STEPS.forEach(st => st.screens.forEach(sc => sc.fields.forEach(f => {
      if (!f.req || !f.k) return;
      if (f.cond && !f.cond(a)) return;
      total++; if (this.filled(f)) done++;
    })));
    return { total, done };
  }

  stepStats(i) {
    let total = 0, done = 0;
    const a = this.state.answers;
    STEPS[i].screens.forEach(sc => sc.fields.forEach(f => {
      if (!f.k || f.t === 'sum') return;
      if (f.cond && !f.cond(a)) return;
      total++; if (this.filled(f)) done++;
    }));
    return { total, done };
  }

  go(i) {
    const list = this.flat();
    const n = Math.max(0, Math.min(i, list.length - 1));
    this.setState({ si: n, view: 'flow' }, () => { this.persist(); this.scrollTop(); });
  }

  scrollTop() { try { const els = document.querySelectorAll('div'); for (const el of els) { if (el.scrollHeight > el.clientHeight + 40 && getComputedStyle(el).overflowY === 'auto') { el.scrollTop = 0; return; } } } catch (e) { } }

  next = () => {
    const list = this.flat();
    if (this.state.si >= list.length - 1) { this.setState({ view: 'done' }, () => this.persist({ view: 'done' })); return; }
    this.go(this.state.si + 1);
  };

  back = () => {
    if (this.state.si === 0) { this.setState({ view: 'welcome' }); return; }
    this.go(this.state.si - 1);
  };

  start = () => this.go(this.state.si || 0);
  goHub = () => this.setState({ view: 'hub' }, () => this.scrollTop());
  resume = () => this.go(this.state.si);
  goPanel = () => this.setState({ view: 'welcome' });

  startRec = (k) => {
    this.setState(s => ({ rec: k, recSec: 0, writeMode: Object.assign({}, s.writeMode, { [k]: true }) }));
    if (this._recTimer) clearInterval(this._recTimer);
    this._recTimer = setInterval(() => this.setState(s => ({ recSec: s.recSec + 1 })), 1000);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this._live = false;
    if (SR) {
      try {
        const r = new SR();
        r.lang = 'es-419'; r.continuous = true; r.interimResults = true;
        this._base = this.val(k);
        r.onresult = (e) => {
          let txt = '';
          for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
          this._live = true;
          this.set(k, (this._base ? this._base + ' ' : '') + txt.trim());
        };
        r.onerror = () => { };
        r.start();
        this._sr = r;
      } catch (e) { this._sr = null; }
    }
  };

  stopRec = (k, demo) => {
    if (this._recTimer) clearInterval(this._recTimer);
    if (this._sr) { try { this._sr.stop(); } catch (e) { } this._sr = null; }
    const hadLive = this._live;
    this.setState({ rec: null, transcribing: k });
    this._trTimer = setTimeout(() => {
      if (!hadLive && !this.val(k)) this.set(k, demo || '');
      this.setState(s => ({ transcribing: null, fromVoice: Object.assign({}, s.fromVoice, { [k]: true }) }));
    }, 1400);
  };

  toggleMulti = (k, v, max) => {
    const cur = Array.isArray(this.state.answers[k]) ? this.state.answers[k].slice() : [];
    const i = cur.indexOf(v);
    if (i >= 0) cur.splice(i, 1);
    else { if (max && cur.length >= max) cur.length = 0; cur.push(v); }
    this.set(k, cur);
  };

  addFiles = (k, e) => {
    const list = Array.from(e.target.files || []).map(f => ({ name: f.name, size: (f.size / 1024 > 1024 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.round(f.size / 1024) + ' KB') }));
    if (!list.length) return;
    this.setState(s => ({ files: Object.assign({}, s.files, { [k]: (s.files[k] || []).concat(list) }) }), () => this.persist());
    e.target.value = '';
  };

  rmFile = (k, i) => this.setState(s => {
    const arr = (s.files[k] || []).slice(); arr.splice(i, 1);
    return { files: Object.assign({}, s.files, { [k]: arr }) };
  }, () => this.persist());

  meter(len, target, min) {
    const r = target ? len / target : 0;
    const w = Math.min(100, Math.max(len > 0 ? 5 : 0, r * 100)) + '%';
    if (len === 0) return { w: '0%', c: '#D0D5DD', l: 'Mínimo ' + min + ' caracteres' };
    if (len < min) return { w, c: '#EAB308', l: 'Faltan ' + (min - len) + ' caracteres' };
    if (r < 1) return { w, c: '#22C55E', l: 'Muy buena respuesta' };
    return { w: '100%', c: '#22C55E', l: 'Excelente' };
  }

  days() {
    const out = []; let i = 1;
    while (out.length < 6) {
      const x = new Date(Date.now() + i * 86400000);
      if (x.getDay() !== 0 && x.getDay() !== 6) out.push(x);
      i++;
    }
    return out;
  }

  buildField(f, num, hideLabel) {
    const k = f.k, v = k ? this.val(k) : '';
    const o = {
      num: num ? String(num) : '', label: f.label || '', sub: f.sub || '', hasLabel: !!f.label && !hideLabel,
      optional: !!(f.label && !f.req), head: f.head || '', headSub: f.headSub || '',
      value: v, placeholder: f.ph || '', minH: (f.minH || 120) + 'px',
      isInfo: false, isText: false, isArea: false, isMicHero: false, isPick: false, isChips: false,
      isCheck: false, isFile: false, isBudget: false, isSchedule: false, isSummary: false,
      recording: false, transcribing: false, hasEx: false, hasRemember: false, hasMeter: false
    };

    if (f.t === 'i') {
      o.isInfo = true; o.infoKicker = f.infoKicker; o.infoTitle = f.infoTitle; o.infoBody = f.infoBody;
      return o;
    }

    if (f.t === 'o' || f.t === 'a') {
      const rec = this.state.rec === k, tr = this.state.transcribing === k;
      const hasText = typeof v === 'string' && v.length > 0;
      o.recording = rec; o.transcribing = tr;
      o.isMicHero = false;
      o.isArea = !rec && !tr;
      o.showMic = !!f.len;
      o.padB = f.len ? '62px' : '15px';
      o.fromVoice = !!this.state.fromVoice[k];
      o.speakHint = f.len ? 'unos ' + Math.round(f.len / 14) + ' s' : 'y lo transcribimos';
      o.timer = Math.floor(this.state.recSec / 60) + ':' + String(this.state.recSec % 60).padStart(2, '0');
      o.bars = Array.from({ length: 18 }, (_, i) => ({ d: (i * 0.07).toFixed(2) + 's' }));
      o.startRec = () => this.startRec(k);
      o.stopRec = () => this.stopRec(k, f.ex);
      o.write = () => this.setState(s => ({ writeMode: Object.assign({}, s.writeMode, { [k]: true }) }));
      o.onChange = e => this.set(k, e.target.value);
      o.recLabel = hasText ? 'Seguir hablando' : 'Contéstalo hablando';
      o.placeholder = f.ph || 'Escribe acá tu respuesta…';
      if (f.len) {
        const m = this.meter((v || '').trim().length, f.len, this.minLen(f));
        o.hasMeter = true; o.meterW = m.w; o.meterColor = m.c; o.meterLabel = m.l;
      }
      if (f.t === 'o') o.minH = '180px';
      o.hasRemember = !!(f.rem && f.rem.length); o.remember = f.rem || [];
    } else if (f.t === 's') {
      o.isText = true; o.inputType = 'text'; o.inputMode = f.inputMode || 'text';
      o.onChange = e => this.set(k, e.target.value);
    } else if (f.t === 'p') {
      o.isPick = true;
      o.opts = (f.opts || []).map(op => {
        const sel = v === op.v;
        return {
          label: op.label, desc: op.desc || '', sel,
          bd: sel ? '#5B7CF5' : '#E2E5EB', bg: sel ? '#F5F7FF' : '#FFFFFF',
          dot: sel ? '#5B7CF5' : '#D0D5DD', dotBg: sel ? '#5B7CF5' : '#FFFFFF',
          pick: () => this.set(k, op.v)
        };
      });
    } else if (f.t === 'c') {
      const arr = Array.isArray(v) ? v : [];
      o.isChips = true;
      o.opts = (f.opts || []).map(op => {
        const sel = arr.indexOf(op.v) >= 0;
        return {
          label: op.label, sel,
          bd: sel ? '#5B7CF5' : '#E2E5EB', bg: sel ? '#5B7CF5' : '#FFFFFF', fg: sel ? '#FFFFFF' : '#3F4653',
          pick: () => this.toggleMulti(k, op.v, f.max)
        };
      });
    } else if (f.t === 'chk') {
      const arr = Array.isArray(v) ? v : [];
      o.isCheck = true;
      o.items = (f.items || []).map(it => {
        const sel = arr.indexOf(it.v) >= 0;
        return {
          label: it.label, desc: it.desc || '', sel,
          bd: sel ? '#BBF7D0' : '#E2E5EB', bg: sel ? '#ECFDF5' : '#FFFFFF',
          box: sel ? '#22C55E' : '#D0D5DD', boxBg: sel ? '#22C55E' : '#FFFFFF',
          pill: sel ? 'Subido' : 'Pendiente',
          pillBg: sel ? '#DCFCE7' : '#FEFCE8', pillFg: sel ? '#15803D' : '#B45309',
          toggle: () => this.toggleMulti(k, it.v)
        };
      });
    } else if (f.t === 'f') {
      const arr = this.state.files[k] || [];
      o.isFile = true; o.fileCta = f.fileCta; o.fileHint = f.fileHint || '';
      o.multiple = !!f.multiple; o.accept = f.accept || '*';
      o.files = arr.map((x, i) => ({ name: x.name, size: x.size, remove: () => this.rmFile(k, i) }));
      o.hasFiles = arr.length > 0;
      o.onFiles = e => this.addFiles(k, e);
    } else if (f.t === 'bud') {
      o.isBudget = true;
      o.onChange = e => this.set(k, e.target.value.replace(/[^0-9]/g, ''));
      const n = parseInt(v || '0', 10);
      o.daily = n > 0 ? Math.round(n / 30) + ' USD/día' : '';
    } else if (f.t === 'sch') {
      const cur = (v && typeof v === 'object') ? v : {};
      o.isSchedule = true; o.hasAgenda = !!f.agenda; o.conHora = !f.soloDia;
      o.agenda = [
        { n: '1', title: 'Resolvemos tus dudas del onboarding', desc: 'Repasamos juntos lo que completaste aquí. Por eso es fundamental que lo termines antes.', bg: '#EEF2FF', fg: '#4A67D8' },
        { n: '2', title: 'Configuramos tu Meta Business', desc: 'Necesitas acceso a una página de Facebook y a un Instagram. Si no los tienes, tendremos que reagendar.', bg: '#FEFCE8', fg: '#B45309' },
        { n: '3', title: 'Dejamos definidos los próximos pasos', desc: 'Qué hacemos nosotros, qué necesitamos de ti y cuándo sale cada cosa.', bg: '#EEF2FF', fg: '#4A67D8' }
      ];
      o.days = this.days().map(d => {
        const id = d.toISOString().slice(0, 10);
        const sel = cur.day === id;
        return {
          dow: DOW[d.getDay()], num: String(d.getDate()), mon: MON[d.getMonth()],
          bd: sel ? '#5B7CF5' : '#E2E5EB', bg: sel ? '#5B7CF5' : '#FFFFFF', fg: sel ? '#FFFFFF' : '#1A1D26',
          pick: () => this.set(k, { day: id, slot: cur.slot, label: DOW[d.getDay()] + ' ' + d.getDate() + ' de ' + MON[d.getMonth()] })
        };
      });
      o.slots = SLOTS.map(s => {
        const sel = cur.slot === s;
        return {
          label: s,
          bd: sel ? '#5B7CF5' : '#E2E5EB', bg: sel ? '#5B7CF5' : '#FFFFFF', fg: sel ? '#FFFFFF' : '#3F4653',
          pick: () => this.set(k, Object.assign({}, cur, { slot: s }))
        };
      });
      o.picked = f.soloDia ? !!cur.day : !!(cur.day && cur.slot);
      o.pickedLabel = o.picked ? (cur.day === 'externo' ? cur.label : (f.soloDia ? 'Fecha reservada: ' + cur.label : 'Reservado: ' + cur.label + ' a las ' + cur.slot + ' h')) : '';
      o.already = () => this.set(k, { day: 'externo', slot: 'externo', label: 'Ya agendada por otro lado' });
    } else if (f.t === 'sum') {
      o.isSummary = true;
      const list = this.flat();
      o.groups = STEPS.map((st, i) => {
        const s = this.stepStats(i);
        const ok = s.total === 0 || s.done === s.total;
        return {
          name: st.badge + ' · ' + st.title, ok, pending: !ok,
          detail: ok ? 'Completo' : (s.total - s.done) + ' de ' + s.total + ' sin responder',
          bg: ok ? '#ECFDF5' : '#FEFCE8',
          go: () => { const idx = list.findIndex(nd => nd.i === i); this.go(idx < 0 ? 0 : idx); }
        };
      });
    }

    if (f.ex && f.len) {
      o.hasEx = true; o.ex = f.ex;
      o.showEx = !!this.state.openEx[k];
      o.exLabel = this.state.openEx[k] ? 'Ocultar el ejemplo' : 'Ver un ejemplo bien contestado';
      o.exRot = this.state.openEx[k] ? 'rotate(180deg)' : 'rotate(0deg)';
      o.toggleEx = () => this.setState(s => ({ openEx: Object.assign({}, s.openEx, { [k]: !s.openEx[k] }) }));
    }
    return o;
  }

  renderVals() {
    const st = this.state;
    const list = this.flat();
    const node = list[Math.min(st.si, list.length - 1)] || list[0];
    const rs = this.reqStats();
    const pct = rs.total ? Math.round((rs.done / rs.total) * 100) : 0;
    const view = st.view;
    const isQ = view === 'flow' && node.kind === 'q';
    const isCover = view === 'flow' && node.kind === 'cover';

    const libre = this.props.avanceLibre !== false;
    let fields = [], cur = {}, canNext = true, nextLabel = 'Continuar', blockedHint = '', stepCounter = '';

    if (isQ) {
      const step = node.st;
      const total = step.screens.length;
      const solo = step.hist && node.fs.length === 1 && node.sub < total - 1;
      let n = 0;
      const multi = node.fs.filter(f => f.label).length > 1;
      fields = node.fs.map(f => { if (f.label && multi) n++; return this.buildField(f, multi ? n : 0, solo); });
      let qLabel = '';
      if (step.hist) qLabel = node.sub === total - 1 ? 'Autoridad pública · último paso' : 'Pregunta ' + (node.sub + 1) + ' de ' + (total - 1);
      else if (total > 1) qLabel = 'Parte ' + (node.sub + 1) + ' de ' + total;
      const req = node.fs.filter(f => f.req);
      canNext = req.every(f => this.filled(f));
      if (!canNext) {
        const miss = req.find(f => !this.filled(f));
        if (miss && miss.len) {
          const falta = this.minLen(miss) - String(this.val(miss.k) || '').trim().length;
          blockedHint = 'Necesitamos un poco más de detalle: faltan ' + falta + ' caracteres. Contéstalo hablando y lo resuelves en 30 segundos.';
        } else if (miss && (miss.t === 'p' || miss.t === 'c')) {
          blockedHint = 'Elige una opción para seguir. Si no lo sabes, marca la opción de «no lo sé»: nos sirve igual.';
        } else {
          blockedHint = 'Completa lo que falta para seguir. Si no lo sabes con certeza, dinos lo que sepas y lo cerramos en la sesión.';
        }
      }
      const ss = this.stepStats(node.i);
      cur = {
        badge: step.badge, block: BLOCKS[step.b].short,
        eyebrow: solo ? 'Sección 7 · tu historia' : step.eyebrow,
        title: solo ? node.fs[0].label : step.title,
        desc: solo ? (node.fs[0].sub || '') : (step.screens.length > 1 ? step.desc : ''),
        qLabel
      };
      stepCounter = st.wide ? 'Paso ' + (node.i + 1) + ' de ' + STEPS.length + ' · ' + BLOCKS[step.b].name : 'Paso ' + (node.i + 1) + '/' + STEPS.length + ' · ' + BLOCKS[step.b].short;
      nextLabel = node.i === STEPS.length - 1 ? (st.wide ? 'Todo correcto, finalizar' : 'Finalizar') : 'Continuar';
      if (ss.total > 0 && ss.done === ss.total && !canNext) nextLabel = 'Continuar';
    } else if (isCover) {
      const step = node.st;
      let qs = 0, mic = false;
      step.screens.forEach(sc => this.visFields(sc).forEach(f => { if (f.k && f.t !== 'sum') qs++; if (f.len) mic = true; }));
      cur = {
        badge: step.badge, block: BLOCKS[step.b].name, eyebrow: step.eyebrow, title: step.title, desc: step.desc,
        qs: step.hist ? '14 preguntas, una por pantalla' : (qs === 1 ? '1 pregunta' : qs + ' preguntas'),
        min: 'unos ' + Math.max(1, Math.round(qs * 1.4)) + ' min', mic,
        why: WHY[step.badge] || '', icon: ICONS[step.badge] || ICONS['03']
      };
      stepCounter = st.wide ? 'Paso ' + (node.i + 1) + ' de ' + STEPS.length + ' · ' + BLOCKS[step.b].name : 'Paso ' + (node.i + 1) + '/' + STEPS.length + ' · ' + BLOCKS[step.b].short;
      nextLabel = (node.i === 0 || !st.wide) ? 'Empezar' : 'Empezar esta sección';
    }

    const blocksDone = BLOCKS.map((b, bi) => {
      let t = 0, d = 0;
      STEPS.forEach((s, i) => { if (s.b !== bi) return; const x = this.stepStats(i); t += x.total; d += x.done; });
      return t > 0 && d === t;
    });
    const ses = st.answers.sesion, grab = st.answers.grabacion;

    return {
      wide: st.wide, narrow: !st.wide,
      name: this.props.clientName || 'Sergio',
      initials: (this.props.clientName || 'Sergio Cabrera').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase(),
      lockedTabs: [
        { name: 'Guiones', open: blocksDone[1] },
        { name: 'Embudos', open: blocksDone[1] },
        { name: 'Material', open: blocksDone[3] },
        { name: 'Avance del proyecto', open: blocksDone[3] }
      ],
      blockNav: BLOCKS.map((b, bi) => {
        const active = isQ && STEPS[node.i].b === bi;
        let t = 0, d = 0;
        STEPS.forEach((s, i) => { if (s.b !== bi) return; const x = this.stepStats(i); t += x.total; d += x.done; });
        return {
          name: b.short, count: d + '/' + t,
          dot: blocksDone[bi] ? '#22C55E' : (active ? '#5B7CF5' : '#D0D5DD'),
          fg: active ? '#1A1D26' : '#6B7280'
        };
      }),
      isWelcome: view === 'welcome', isHub: view === 'hub', isDone: view === 'done', isQ, isCover,
      showProgress: view !== 'welcome', showFooter: view === 'flow',
      pctLabel: pct + '%', pctW: pct + '%', stepCounter,
      progressHint: rs.done + ' de ' + rs.total + ' respuestas necesarias · se guarda solo',
      saving: st.saving, savedShown: !st.saving,
      saveLabel: st.saving ? 'Guardando…' : 'Guardado',
      vidPlaying: st.vidOn, vidPaused: !st.vidOn,
      vidW: Math.round((st.vid / 90) * 100) + '%',
      vidTrans: st.vidOn ? 'width 1s linear' : 'width .25s ease',
      vidTime: Math.floor(st.vid / 60) + ':' + String(st.vid % 60).padStart(2, '0') + ' / 1:30',
      vidTitle: st.vid >= 90 ? 'Listo. Ahora sí: empecemos.' : (st.vidOn ? 'Qué hacemos con cada respuesta que dejes acá' : 'Míralo antes de empezar · 90 segundos'),
      welcomeChips: ['≈ 45 minutos', 'Se guarda solo', 'Puedes volver cuando quieras'],
      blockList: BLOCKS.map((b, bi) => ({
        n: String(bi + 1),
        name: b.name.replace(/^Bloque \d+ · /, ''),
        meta: STEPS.filter(s => s.b === bi).length + ' pasos'
      })),
      checklist: CHECKLIST,
      startLabel: pct > 0 ? 'Seguir donde quedé' : 'Ver el video y empezar',
      hubLine: pct === 100 ? 'Está todo respondido. Puedes finalizar el onboarding.' : 'Vas ' + pct + '% y todo quedó guardado. Entra al paso que quieras.',
      hubSteps: STEPS.map((s, i) => {
        const x = this.stepStats(i);
        const done = x.total > 0 && x.done === x.total;
        return {
          badge: done ? '✓' : s.badge, title: s.title,
          chipBg: done ? '#ECFDF5' : (x.done > 0 ? '#EEF2FF' : '#F0F2F5'),
          chipFg: done ? '#15803D' : (x.done > 0 ? '#4A67D8' : '#6B7280'),
          status: done ? 'Completo' : (x.done > 0 ? x.done + ' de ' + x.total + ' respondidas' : BLOCKS[s.b].short),
          go: () => { const idx = list.findIndex(nd => nd.i === i && nd.kind === 'q'); this.go(idx < 0 ? 0 : idx); }
        };
      }),
      cur, fields, nextLabel,
      nextDisabled: !canNext && !libre,
      nextBg: canNext ? '#5B7CF5' : (libre ? '#C7CFF0' : '#E8EBF0'),
      nextFg: canNext ? '#FFFFFF' : (libre ? '#FFFFFF' : '#9CA3AF'),
      nextCursor: (canNext || libre) ? 'pointer' : 'not-allowed',
      blockedHint,
      doneChecks: DONE_CHECKS,
      phases: PHASES,
      sessionLine: ses && ses.day && ses.day !== 'externo' ? 'Tu sesión de onboarding: ' + ses.label + ' a las ' + ses.slot + ' h.' : 'Tu sesión de onboarding ya está reservada.',
      recordingLine: grab && grab.day && grab.day !== 'externo' ? 'Tu grabación quedó firme para el ' + grab.label + ' a las ' + grab.slot + ' h. Necesitas una hora y un lugar con buena luz — el resto lo hacemos nosotros.' : 'Tu grabación quedó agendada. Necesitas una hora y un lugar con buena luz — el resto lo hacemos nosotros.',
      start: this.start, next: this.next, back: this.back, goHub: this.goHub, resume: this.resume, goPanel: this.goPanel
    };
  }
}

