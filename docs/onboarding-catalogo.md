# Onboarding del cliente — catálogo completo

Todo lo que ve y responde el cliente, exactamente como está hoy en producción.
Generado desde la base el **26 de julio de 2026**.

## Cómo usar este documento

Cada pregunta tiene una **clave** (`qkey`) entre backticks. Esa clave es la
identidad de la pregunta en la base y no cambia nunca — si querés reescribir una
pregunta, indicá su clave y cambiá el texto; si querés eliminarla o agregar una
nueva, decilo con palabras.

Lo que se puede editar sin tocar código: **título, subtítulo, ayuda, ejemplo,
opciones, "acordate de contar", largo pedido, minutos y la promesa del tramo**.
Lo que necesita migración: la clave, el tipo, el peso, las condiciones de
visibilidad y a qué columna escribe.

**Los ejemplos son la vara.** El cliente no calibra cuánto escribir contra un
número de caracteres: calibra contra el ejemplo que ve. Si el ejemplo es corto,
la respuesta va a ser corta. Los de este documento los escribí yo sobre un caso
inventado (una enfermera con un negocio de nutrición); reemplazarlos por casos
reales tuyos es probablemente la mejora más rentable de todo el onboarding.

---

## Resumen

| # | Tramo | Preguntas | Obligatorias | Minutos | Se puede pausar |
|---|---|---|---|---|---|
| 0 | Agendá tu sesión | — | — | 2 | — |
| 1 | Confirmá tus datos | 4 | 4 | 4 | No |
| 2 | Tu negocio y tu oferta | 19 | 17 | 29 | Sí |
| 3 | Tu historia | 9 | 8 | 21 | Sí |
| 4 | Tu gente | 7 | 7 | 15 | Sí |
| 5 | Últimos detalles | 18 | 14 | 18 | Sí |
| 6 | Tu material | 9 | 3 | 11 | No |
| | **Total** | **66** | **53** | **100** | |

**Los 100 minutos son el problema abierto.** Los dos tramos inflados son
*Tu negocio* (29 min, 17 obligatorias) y *Últimos detalles* (18 min, 14
obligatorias). Mi recomendación sigue siendo podar Cierre a la mitad: casi todo
lo que hay ahí se resuelve mejor en la reunión que ahora se agenda de entrada.

**Antes de la primera pregunta** el cliente ve un checklist de lo que va a
necesitar, para que lo junte mientras responde (el material se sube al final):

- Los casos de 3 personas a las que les fue bien con vos
- Tu logo, en la mejor calidad que tengas
- Los colores de tu marca
- 5 fotos tuyas con buena luz, donde se te vea bien
- *Opcional:* fotos de tu día a día

---

# Tramo 0 · Agendá tu sesión

> **Subtítulo:** Primero lo primero: reservá el día en que nos vemos.
> **Al terminar:** Listo. Ya tenés tu lugar reservado.
> **2 minutos** · sin preguntas · usa el sistema de agenda de Soporte

No tiene preguntas: el cliente elige día y hora de una grilla con la
disponibilidad real del equipo. Antes de elegir lee qué se hace en la reunión:

1. **Resolvemos tus dudas del onboarding** — Repasamos juntos lo que completaste
   acá. Por eso es fundamental que lo termines antes de la reunión.
2. **⚠ Configuramos tu Meta Business** — Necesitás tener acceso a una página de
   Facebook y a un Instagram. Si no los tenés, vamos a tener que reagendar.
3. **Dejamos definidos los próximos pasos** — Qué hacemos nosotros, qué
   necesitamos de vos y cuándo sale cada cosa.

Si el calendario no responde o todavía no hay horarios cargados, el cliente
puede seguir igual con "Ya la agendé por otro lado" y queda una tarea para el
equipo.

---

# Tramo 1 · Confirmá tus datos

> **Subtítulo:** Esto ya lo tenemos. Mirá que esté bien y, si algo cambió, corregilo.
> **Al terminar:** Perfecto. Con esto ya sabemos a quién le estamos hablando.
> **4 minutos** · 4 preguntas · 4 obligatorias

### 1. ¿Está todo bien?

| | |
|---|---|
| **Clave** | `datos_confirmar` |
| **Tipo** | confirmar (tarjeta editable) |
| **Obligatoria** | Sí |
| **Minutos** | 1 |
| **Sección del documento** | 1. Sobre tu negocio |

**Subtítulo:** Estos datos nos los pasaste cuando arrancamos. Si alguno cambió, tocá "Corregir".

**Ayuda:** Los usamos para tu contrato y tus facturas.

Muestra nombre, empresa, email, teléfono, país y datos del contrato, todo
precargado desde `crear-venta`. Cada fila tiene un botón **Corregir**.
Empresa, email, teléfono y país se aplican solos al cliente; nombre y datos del
contrato generan una tarea para el equipo (el nombre es la llave con la que la
plataforma reconoce al cliente y cambiarlo solo lo dejaría afuera de su portal).

### 2. ¿Qué edad tenés?

| | |
|---|---|
| **Clave** | `datos_edad` · número · obligatoria · 1 min |
| **Agrupada** | `datos_rapidos` — las tres van en una sola pantalla |
| **Sección del documento** | 1.3 Historia de vida / 12 |

### 3. ¿Hace cuánto arrancaste en este negocio?

| | |
|---|---|
| **Clave** | `datos_anos_negocio` · número · obligatoria · 1 min |
| **Agrupada** | `datos_rapidos` |
| **Sección del documento** | 1.3 Historia de vida / 2 |

**Subtítulo:** En años. Si es menos de uno, poné 1.

### 4. ¿Cuántas personas hay hoy en tu red?

| | |
|---|---|
| **Clave** | `datos_red_tamano` · número · obligatoria · 1 min |
| **Agrupada** | `datos_rapidos` |
| **Sección del documento** | 1.3 Historia de vida / 7 |

**Subtítulo:** Un número aproximado alcanza.

---

# Tramo 2 · Tu negocio y tu oferta

> **Subtítulo:** Qué vendés, a qué precio y por qué te eligen.
> **Al terminar:** Ya sabemos qué vamos a promocionar y cómo.
> **29 minutos** · 19 preguntas · 17 obligatorias · se puede pausar
> **Desbloquea** la pestaña Embudos

> ⚠️ **Este es el tramo más pesado del onboarding.** 29 minutos y 17 preguntas
> obligatorias, seis de ellas largas. Es el primer candidato a podar.

### 1. ¿Qué querés que pase cuando alguien vea tu anuncio?

| | |
|---|---|
| **Clave** | `motor` |
| **Tipo** | opciones |
| **Obligatoria** | Sí · peso 2 · 1 min |
| **Escribe en** | `strategy_pages.tipo` |
| **Sección del documento** | 1. Sobre tu negocio |

**Subtítulo:** Elegí una. Según lo que elijas, te hacemos unas preguntas u otras.

**Ayuda:** Si elegís "las dos", te vamos a pedir que nos digas cuál es la más importante — porque el anuncio tiene que tener un solo mensaje principal.

**Opciones:**
- **Que compre mi producto** — Vender productos a clientes
- **Que se sume a mi equipo** — Reclutar socios para el negocio
- **Las dos cosas** — Producto y oportunidad

> Esta pregunta es la bifurcación de todo el tramo: decide si se muestran las
> preguntas de producto, las de oportunidad, o las dos.

### 2. ¿Cuál es la más importante de las dos?

| | |
|---|---|
| **Clave** | `motor_primario` · opciones · obligatoria · 1 min |
| **Solo si** | `motor` = "ambas" |
| **Sección del documento** | 1. Sobre tu negocio |

**Subtítulo:** La que elijas es la que va a llevar el peso del anuncio.

**Opciones:** Vender el producto · Sumar gente al equipo

### 3. ¿Qué producto querés promocionar?

| | |
|---|---|
| **Clave** | `producto_que_es` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 2 · 2 min |
| **Largo pedido** | 600 caracteres (~43 segundos hablando) |
| **Solo si** | `motor` = producto u "ambas" |
| **Sección del documento** | 3. Oferta y objetivos |

**Subtítulo:** Qué es, para qué sirve y qué le pasa a la persona después de usarlo.

**Ejemplo que ve el cliente:**

> Es un pack de nutrición celular de 30 días: un batido de proteína vegetal para el desayuno, un té termogénico y un aloe para el sistema digestivo. Está pensado para mujeres de 35 a 55 que se sienten hinchadas, sin energía y que ya probaron dietas que no les funcionaron. En 30 días la mayoría baja entre 3 y 6 kilos, pero lo que más nos dicen es que duermen mejor y que dejaron de tener el bajón de las 4 de la tarde. No es una dieta: no tenés que dejar de comer lo que te gusta, reemplazás una comida y listo.

### 4. ¿Qué problema le resolvés a tu cliente?

| | |
|---|---|
| **Clave** | `problema_que_resuelves` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 3 · 2 min |
| **Largo pedido** | 700 caracteres (~50 segundos hablando) |
| **Sección del documento** | 1. Sobre tu negocio |

**Subtítulo:** Qué le está pasando hoy, antes de conocerte.

**Ayuda:** Escribilo como lo diría esa persona, no como lo dirías vos.

**Acordate de contar:** qué le pasa hoy · qué ya probó · qué siente

**Ejemplo que ve el cliente:**

> La mayoría llega diciendo lo mismo: "me miro al espejo y no me reconozco". Son mujeres que subieron 10 o 15 kilos después de los embarazos o de la menopausia, que están todo el día cansadas, que se levantan ya sin energía. Probaron de todo: la dieta de la nutricionista que abandonaron a la semana, el gimnasio al que fueron un mes, las pastillas que compraron por Instagram. Cada intento fallido les dejó la sensación de que el problema son ellas, que no tienen fuerza de voluntad. Y hay algo que casi ninguna dice en voz alta: dejaron de ir a eventos, de sacarse fotos, de tener intimidad con su pareja. El problema no es el peso, es que se están perdiendo la vida.

### 5. ¿Qué le vamos a ofrecer exactamente?

| | |
|---|---|
| **Clave** | `oferta_especifica` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 2 · 2 min |
| **Largo pedido** | 600 caracteres (~43 segundos hablando) |
| **Sección del documento** | 3. Oferta y objetivos |

**Subtítulo:** Producto o paquete, precio, qué incluye y en qué condiciones.

**Ejemplo que ve el cliente:**

> El pack de inicio de 30 días a 89 dólares con envío gratis a todo el país. Incluye los tres productos, un plan de comidas en PDF que armé yo, y el acceso a mi grupo de WhatsApp de seguimiento donde estoy todos los días. La primera compra tiene 15% de descuento si se suscriben a la recompra mensual, que pueden cancelar cuando quieran sin permanencia. Si compran dos packs (para ellas y una amiga), el segundo sale a 75.

### 6. ¿Cuánto cuestan tus productos?

| | |
|---|---|
| **Clave** | `tickets` · money · obligatoria · 1 min |
| **Agrupada** | `precios` |
| **Sección del documento** | 5. Canales y producto |

**Subtítulo:** El de entrada, el paquete para arrancar el negocio, y el más caro.

**Ejemplo:** Entrada 89 USD · Paquete de negocio 350 USD · El más alto 1.200 USD

### 7. ¿Hay garantía?

| | |
|---|---|
| **Clave** | `garantia` · corta · obligatoria · 1 min |
| **Agrupada** | `precios` |
| **Sección del documento** | 3. Oferta y objetivos |

**Subtítulo:** Cuánto tiempo y en qué condiciones. Si no hay, escribí "no hay".

**Ejemplo:** 30 días de devolución. Si no está conforme, devuelve los envases aunque estén vacíos y se le reintegra el 100%.

### 8. ¿Por qué alguien elegiría esta oportunidad y no otra?

| | |
|---|---|
| **Clave** | `oportunidad_diferencial` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 3 · 2 min |
| **Largo pedido** | 800 caracteres (~57 segundos hablando) |
| **Solo si** | `motor` = oportunidad u "ambas" |
| **Sección del documento** | 3. Oferta y objetivos |

**Subtítulo:** Qué tiene tu empresa y tu modelo que las demás no tienen.

**Ejemplo que ve el cliente:**

> La empresa tiene 31 años y opera en 94 países, no es una startup que puede desaparecer. El plan de compensación paga desde la primera venta, no tenés que llegar a un rango para cobrar: eso hace que la gente vea plata en su primera semana y no abandone. No hay obligación de compra mensual mínima, que es lo que hunde a la gente en otras compañías. Los productos se venden solos porque son de consumo diario y la recompra es del 68%, o sea que armás un ingreso que se repite sin salir a buscar clientes nuevos todos los meses. Y algo que valoro mucho: la empresa tiene certificación de calidad propia y estudios clínicos publicados, así que no tengo que vender humo.

### 9. ¿Qué acompañamiento le das a quien entra a tu equipo?

| | |
|---|---|
| **Clave** | `acompanamiento_y_sistema` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 2 · 2 min |
| **Largo pedido** | 600 caracteres (~43 segundos hablando) |
| **Solo si** | `motor` = oportunidad u "ambas" |
| **Sección del documento** | 2. Autoridad y Marca personal |

**Subtítulo:** Qué recibe concretamente y con qué sistema lo seguís.

**Ejemplo que ve el cliente:**

> Los primeros 90 días tiene una madrina asignada que le responde por WhatsApp todos los días. La primera semana hacemos una videollamada de una hora donde armamos juntas su lista de contactos y su primer mensaje. Le doy mi manual de 40 páginas con los guiones. Todos los martes a las 20h hay capacitación en vivo por Zoom, y quedan grabadas en un Drive al que tiene acceso. Sus primeras cinco ventas las hacemos juntas: se conecta conmigo y yo la acompaño en la llamada. Después pasa al grupo general, donde seguimos midiendo con una planilla semanal quién hizo cuántos contactos.

### 10. ¿Cómo es tu proceso de venta hoy, de principio a fin?

| | |
|---|---|
| **Clave** | `proceso_de_ventas` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 2 · 2 min |
| **Largo pedido** | 700 caracteres (~50 segundos hablando) |
| **Sección del documento** | 5. Canales y producto |

**Subtítulo:** Desde que alguien te escribe hasta que compra.

**Ejemplo que ve el cliente:**

> Me escriben por Instagram o por WhatsApp, casi siempre preguntando el precio. Yo no doy precio de entrada: les hago tres preguntas para entender qué les pasa (hace cuánto que están así, qué probaron, cuánto quieren bajar). Si veo que califica, le mando un audio de dos minutos contándole mi caso y le propongo una videollamada de 20 minutos. En la llamada le muestro el plan, le cuento testimonios parecidos al suyo y ahí sí le paso el precio. Cierro alrededor del 40% de las llamadas. A las que no cierran las paso a una lista y les mando contenido una vez por semana; varias compran dos o tres meses después.

### 11. Contanos 3 casos de personas a las que les fue bien

| | |
|---|---|
| **Clave** | `testimonios_relato` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 3 · 3 min |
| **Largo pedido** | 900 caracteres (~64 segundos hablando) |
| **En el checklist inicial** | Los casos de 3 personas a las que les fue bien con vos |
| **Sección del documento** | 3.1 Testimonios |

**Subtítulo:** Nombre, cómo estaba antes, qué logró y en cuánto tiempo.

**Ayuda:** No necesitás tener los videos ahora. Contanos los casos y después te ayudamos a grabarlos.

**Acordate de contar:** nombre y edad · cómo estaba antes · qué logró y en cuánto

**Ejemplo que ve el cliente:**

> Marcela, 48 años, de Rosario. Llegó pesando 89 kilos, con presión alta y tomando medicación. En 5 meses bajó 17 kilos y el médico le sacó una de las pastillas. Hoy es clienta y además me compra para revender.
>
> Vanina, 34, dos hijos chicos. No le importaba tanto el peso, estaba con agotamiento y caída de pelo post parto. A los dos meses me mandó un audio llorando porque se pudo poner el vestido de su casamiento. Bajó 8 kilos.
>
> Fernando, 52, el único hombre del grupo. Camionero, comía en la ruta, tenía prediabetes. Bajó 22 kilos en 8 meses y el último análisis le dio valores normales. Es el que más testimonios me genera porque nadie le cree que es el mismo de la foto.

### 12. ¿Para cuándo podés tener 3 testimonios grabados en video?

| | |
|---|---|
| **Clave** | `testimonios_fecha` · fecha · obligatoria · 1 min |
| **Sección del documento** | 3.1 Testimonios |

**Subtítulo:** Horizontal, con buena luz. Con el celular alcanza. Elegí una fecha realista.

**Ayuda:** Esto no te frena el onboarding, pero sí frena tu página: sin testimonios la landing convierte bastante menos.

### 13. ¿Qué te dicen los que NO compran o NO se suman?

| | |
|---|---|
| **Clave** | `objeciones_para_no_entrar` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 3 · 2 min |
| **Largo pedido** | 700 caracteres (~50 segundos hablando) |
| **Sección del documento** | 7. Competencia y diferenciadores |

**Subtítulo:** Las 3 a 5 excusas que más escuchás.

**Ayuda:** Cada objeción que nos cuentes la respondemos dentro de tu video. Si no nos las decís, la gente se queda con la duda y no compra.

**Ejemplo que ve el cliente:**

> "Lo tengo que hablar con mi marido" es la número uno, y en realidad significa que no está convencida ella.
>
> "No tengo tiempo", que me lo dicen las que están más desesperadas justamente por falta de tiempo.
>
> "Yo no sirvo para vender" — esta es la más fuerte en la parte de negocio, tienen miedo al ridículo delante de sus conocidos.
>
> "¿Esto no es una pirámide?" — casi nadie lo dice así de frontal, lo insinúan.
>
> "Ya probé de todo y nada me funcionó", que es más miedo a fracasar de nuevo que una objeción de precio.

### 14. ¿A quiénes seguís o considerás tu competencia?

| | |
|---|---|
| **Clave** | `competencia_referentes` · corta · obligatoria · 1 min |
| **Agrupada** | `competencia` |
| **Sección del documento** | 7. Competencia y diferenciadores |

**Subtítulo:** Nombres, cuentas de Instagram o links. Uno por línea.

**Ejemplo:** @lauranutricion (misma empresa, España) · @vidaplenamlm · Gabriela Ruiz de la competencia directa

### 15. ¿Qué querés destacar frente a ellos?

| | |
|---|---|
| **Clave** | `competencia_diferencia` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 2 · 1 min |
| **Largo pedido** | 400 caracteres (~29 segundos hablando) |
| **Sección del documento** | 7. Competencia y diferenciadores |

**Ejemplo que ve el cliente:**

> Ellos venden el "bajá 10 kilos en 10 días" y viven de la foto del antes y después. Yo quiero que se note que acá no hay milagro: hay un método de 30 días, un acompañamiento real y resultados que se sostienen. Y quiero destacar que yo soy enfermera, tengo formación en salud, no soy alguien que se puso a vender batidos de un día para el otro.

### 16. ¿Hay algo que NO podemos decir?

| | |
|---|---|
| **Clave** | `tono_y_claims` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 2 · 2 min |
| **Largo pedido** | 400 caracteres (~29 segundos hablando) |
| **Sección del documento** | 7. Competencia y diferenciadores |

**Subtítulo:** Palabras prohibidas por tu empresa, promesas que no se pueden hacer, o cosas que no van con vos.

**Ayuda:** Toda empresa de este rubro tiene reglas. Si no las sabés con certeza, escribí lo que sí sepas y lo revisamos en la reunión.

**Ejemplo que ve el cliente:**

> La empresa prohíbe decir "cura", "trata", "adelgaza" y mencionar cualquier enfermedad. No se pueden mostrar cifras de ingresos propias sin el descargo legal. No se puede usar el logo de la empresa en anuncios pagos. Y algo mío: no quiero anuncios con mujeres en bikini ni fotos que hagan sentir mal a nadie por su cuerpo. Tampoco quiero que se prometa "libertad financiera en 6 meses", me parece una falta de respeto.

### 17. ¿Qué pensás que va a convencer más a tu público?

| | |
|---|---|
| **Clave** | `punto_dif` · chips múltiples · obligatoria · 1 min |
| **Escribe en** | `strategy_pages.punto_dif` |
| **Sección del documento** | 1. Sobre tu negocio |

**Subtítulo:** Elegí las que creas más fuertes en tu caso.

**Opciones:** Mi historia personal · Los casos de otros · Mi trayectoria y mis logros · Lo bueno que es el producto

### 18. ¿Alguna campaña de publicidad que te haya funcionado?

| | |
|---|---|
| **Clave** | `campana_que_funciono` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | **No** · 1 min · 400 caracteres |
| **Agrupada** | `campanas` |
| **Sección del documento** | 1.1 Experiencias pasadas |

**Subtítulo:** Si nunca hiciste, escribí "nunca hice".

**Ejemplo:** Hice un sorteo en Instagram en 2023 que me trajo 300 seguidores y 12 ventas. El anuncio era un video mío hablando a cámara contando mi caso, sin producción, grabado con el celular en la cocina. Gasté 80 dólares en 10 días.

### 19. ¿Y alguna que no te funcionó?

| | |
|---|---|
| **Clave** | `campana_que_fallo` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | **No** · 1 min · 300 caracteres |
| **Agrupada** | `campanas` |
| **Sección del documento** | 1.1 Experiencias pasadas |

**Ejemplo:** Puse 200 dólares en anuncios con una foto del producto y el precio. Cero ventas. Después entendí que a nadie le importa el producto, les importa lo que les pasa a ellas.

---

# Tramo 3 · Tu historia

> **Subtítulo:** Esta es la parte más importante. Contala hablando.
> **Al terminar:** Con esto ya podemos escribir tu video de ventas.
> **21 minutos** · 9 preguntas · 8 obligatorias · se puede pausar

> Este tramo alimenta directamente el VSL y el Avatar Espejo. Las respuestas se
> guardan **literales**, sin corregir: el analizador de estrategia necesita citas
> textuales del cliente y "prolijear" destruye exactamente ese activo.

### 1. ¿A qué te dedicabas antes de esto?

| | |
|---|---|
| **Clave** | `historia_antes_del_negocio` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 3 · 3 min |
| **Largo pedido** | 900 caracteres (~64 segundos hablando) |
| **Sección del documento** | 1.3 Historia de vida / 1 |

**Subtítulo:** Contanos de dónde venís: tu trabajo, tus estudios, cómo era tu vida antes.

**Ayuda:** Esto es lo que hace que la gente se vea reflejada en vos. Cuanto más parecido a tu público sea tu "antes", mejor funciona.

**Acordate de contar:** a qué te dedicabas · cuántas horas trabajabas · qué te dolía de esa vida

**Ejemplo que ve el cliente:**

> Trabajé 14 años como enfermera en un hospital público. Turnos de 12 horas, guardias los fines de semana, y aun así no me alcanzaba para pagar el alquiler y la escuela de mis dos hijos. Me levantaba a las 5 de la mañana y volvía cuando ya estaban dormidos. Llegué a tener tres trabajos: el hospital, cuidados a domicilio los sábados y vendía ropa por catálogo. Estaba agotada todo el tiempo y sentía que por más que trabajara, nunca iba a salir de ahí. Lo que más me dolía no era el dinero, era perderme la infancia de mis hijos.

### 2. ¿Por qué empezaste este negocio?

| | |
|---|---|
| **Clave** | `historia_por_que_empece` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 3 · 3 min |
| **Largo pedido** | **1.200 caracteres** (~86 segundos hablando) |
| **Sección del documento** | 1.3 Historia de vida / 3 |

**Subtítulo:** Contanos qué estaba pasando en tu vida cuando decidiste meterte.

**Ayuda:** No hace falta que suene bonito. Contalo como se lo contarías a un amigo. Esta respuesta es la que abre tu video de ventas.

**Acordate de contar:** qué pasó exactamente · cómo te sentías · qué te decidió

**Ejemplo que ve el cliente:**

> Fue en marzo de 2019. Mi hijo menor tuvo un problema de salud y necesitaba un tratamiento que no cubría la obra social. Costaba lo que yo ganaba en cuatro meses. Tuve que pedirle plata prestada a mi hermana y todavía me acuerdo de la vergüenza que sentí. Esa noche entendí que el problema no era que trabajara poco, era que estaba cambiando tiempo por dinero y el tiempo se me estaba acabando. Una compañera del hospital me venía hablando del negocio hacía meses y yo la evitaba, pensaba que era una estafa. La llamé al día siguiente. Empecé sin creerla del todo, con miedo a que se rieran de mí, pero con la certeza de que no podía seguir como estaba.

### 3. ¿Qué cambió en tu vida desde que empezaste?

| | |
|---|---|
| **Clave** | `historia_que_cambio` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 3 · 3 min |
| **Largo pedido** | **1.200 caracteres** (~86 segundos hablando) |
| **Sección del documento** | 1.3 Historia de vida / 4-6 |

**Subtítulo:** Lo que ganaste en dinero y en cosas, pero sobre todo lo que ganaste que no se compra.

**Ayuda:** Contá las tres cosas: qué lograste en plata, qué lograste que no es plata, y cómo es tu día hoy comparado con antes.

**Acordate de contar:** cuánto facturás hoy · qué cosas conseguiste · cómo es tu día ahora

**Ejemplo que ve el cliente:**

> En plata: hoy facturo entre 6.000 y 8.000 dólares por mes, tengo mi casa propia desde hace dos años y cambié el auto. Pero lo que de verdad cambió es otra cosa. Dejé el hospital en enero de 2021 y ese día lloré en el estacionamiento. Hoy llevo a mis hijos al colegio todas las mañanas y los busco. El año pasado nos fuimos los tres a Cancún, el primer viaje de mi vida en avión, y pagué todo sin pedirle plata a nadie. Mi hija me dijo "mamá, ahora estás siempre" y esa frase vale más que cualquier cifra. También cambió algo adentro mío: dejé de pedir permiso. Antes tenía que rogar por un franco para un acto escolar; hoy decido yo.

> Esta pregunta fusiona tres del documento original (resultados materiales, no
> materiales y estilo de vida). Separadas, se responden tres veces corto.

### 4. ¿Qué querés lograr de acá en adelante?

| | |
|---|---|
| **Clave** | `historia_que_quiero_lograr` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 2 · 2 min |
| **Largo pedido** | 500 caracteres (~36 segundos hablando) |
| **Sección del documento** | 1.3 Historia de vida / 3 |

**Subtítulo:** Tu próximo objetivo con este negocio.

**Ejemplo que ve el cliente:**

> Quiero llegar a 15.000 dólares mensuales en los próximos 18 meses y armar un equipo de 50 personas que facturen de verdad, no que estén anotadas y nada más. Y quiero comprarle la casa a mi mamá, que alquila desde que enviudó.

### 5. ¿Cómo le explicás tu negocio a alguien que no lo conoce?

| | |
|---|---|
| **Clave** | `historia_como_lo_explicas` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 2 · 2 min |
| **Largo pedido** | 600 caracteres (~43 segundos hablando) |
| **Sección del documento** | 1.3 Historia de vida / 13 |

**Subtítulo:** Como se lo dirías a un vecino en el ascensor, en un minuto.

**Ayuda:** Esto se convierte casi textual en uno de tus anuncios. Decilo con tus palabras, sin tecnicismos.

**Ejemplo que ve el cliente:**

> Le digo: ayudo a personas que están cansadas de cambiar horas por plata a armar un ingreso desde el celular, sin dejar lo que hacen hoy. Trabajo con una empresa de nutrición que tiene 30 años en el mercado, y lo que hago es enseñarle a la gente a vender esos productos y a formar su propio equipo. No es magia ni es rápido: al principio le dedicás una hora por día y en seis meses, si le ponés, ya tenés un ingreso que se nota. Yo empecé igual, trabajando de enfermera.

### 6. Si alguien de tu equipo te presenta ante un invitado, ¿qué debería decir de vos?

| | |
|---|---|
| **Clave** | `edificacion` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 2 · 2 min |
| **Largo pedido** | 500 caracteres (~36 segundos hablando) |
| **Sección del documento** | 2. Autoridad y Marca personal |

**Subtítulo:** Tus logros, tu recorrido, por qué te tienen que escuchar.

**Ayuda:** Esto lo usamos en la introducción de tu video. No te achiques: acá corresponde contar lo que lograste.

**Ejemplo que ve el cliente:**

> Que llevo 6 años en el negocio, que soy diamante desde 2023 y que armé un equipo de más de 400 personas en cuatro países. Que fui enfermera y que dejé el hospital gracias a esto, porque eso es lo que más le llega a la gente. Que doy capacitación todos los martes hace tres años sin faltar uno solo, y que estuve en el escenario del evento anual de la empresa en Miami el año pasado.

> "Edificación" es jerga que muchos no manejan: por eso la pregunta la evita y
> describe la situación.

### 7. Si alguien está eligiendo entre vos y otra persona del mismo negocio, ¿por qué se queda con vos?

| | |
|---|---|
| **Clave** | `diferencial_por_que_vos` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 3 · 3 min |
| **Largo pedido** | 900 caracteres (~64 segundos hablando) |
| **Sección del documento** | 2. Autoridad y Marca personal |

**Subtítulo:** Qué hacés vos que los demás no hacen.

**Ayuda:** Esta es la pregunta que más nos sirve de todo el onboarding. Pensá en lo que te dicen las personas que ya están en tu equipo.

**Acordate de contar:** qué hacés que otros no · qué te dicen los de tu equipo · qué armaste vos mismo

**Ejemplo que ve el cliente:**

> Porque yo no desaparezco después de que firman. La mayoría te suma y te deja sola con un PDF. Yo tengo un grupo de WhatsApp donde respondo todos los días, hago una llamada grupal los martes a las 20h desde hace tres años, y a cada persona nueva la acompaño en sus primeras cinco ventas: me conecto con ella y hacemos la venta juntas. También armé un manual propio de 40 páginas con los guiones que a mí me funcionaron, que no es material de la empresa, es mío. Y algo que me dicen mucho: que soy honesta con los números. No prometo que se van a hacer millonarias en tres meses, les digo exactamente cuánto tardé yo y cuánto trabajé.

> Reemplaza a "propuesta de valor única", que salía corporativa y vacía.

### 8. ¿Tu equipo tiene nombre?

| | |
|---|---|
| **Clave** | `equipo_nombre` · corta · **no obligatoria** · 1 min |
| **Agrupada** | `equipo` |
| **Escribe en** | `clients.team_name` |
| **Sección del documento** | 1. Sobre tu negocio |

**Subtítulo:** Si no tiene, dejalo vacío.

**Ejemplo:** Equipo Libertad

### 9. ¿Cómo se armó tu equipo y qué lo hace distinto?

| | |
|---|---|
| **Clave** | `equipo_como_surgio` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 2 · 2 min |
| **Largo pedido** | 800 caracteres (~57 segundos hablando) |
| **Sección del documento** | 1. Sobre tu negocio |

**Subtítulo:** Cómo empezó, qué valores tiene, qué se lleva alguien que entra.

**Acordate de contar:** cómo empezó · qué valores tienen · qué se lleva el que entra

**Ejemplo que ve el cliente:**

> Arrancó en 2020 con tres amigas del hospital a las que les conté lo que estaba haciendo. Hoy somos 400 y pico en Argentina, Chile, México y España. Lo que nos define es que nadie se queda solo: tenemos un sistema de madrinas donde cada persona nueva tiene una asignada durante sus primeros 90 días. Somos muy de celebrar lo chico, la primera venta se festeja igual que un ascenso de rango. Y hay una regla que no se negocia: no se vende con mentiras ni se promete lo que no se puede cumplir. Eché a dos personas por eso. Quien entra se lleva formación real, un grupo que responde, y la tranquilidad de que si se cae, hay alguien que lo levanta.

---

# Tramo 4 · Tu gente

> **Subtítulo:** A quién queremos que le llegue tu anuncio.
> **Al terminar:** Con esto armamos la segmentación de tus anuncios.
> **15 minutos** · 7 preguntas · 7 obligatorias · se puede pausar

> **Nunca se usa la palabra "avatar"** en este tramo. El cliente no sabe qué es
> y responde una abstracción genérica. Se pregunta por personas concretas.

### 1. Pensá en las últimas 3 personas que se sumaron o te compraron

| | |
|---|---|
| **Clave** | `avatar_ultimas_3_personas` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 3 · **4 min** |
| **Largo pedido** | **1.300 caracteres** (~93 segundos hablando) — la más larga del onboarding |
| **Sección del documento** | 1. Sobre tu negocio |

**Subtítulo:** Contanos quiénes eran y qué les estaba pasando en ese momento.

**Ayuda:** Esta es la respuesta más valiosa del onboarding. No pienses en "mi público objetivo": pensá en tres personas de carne y hueso y contá sus casos.

**Acordate de contar:** quién era · qué le estaba pasando · qué la decidió

**Ejemplo que ve el cliente:**

> La primera fue Carolina, 41 años, docente de primaria en Mar del Plata, casada, dos hijos adolescentes. Me escribió a las 11 de la noche un domingo. Estaba desbordada: doble turno en la escuela, la casa, y sentía que se le estaba yendo la vida. Lo que la decidió no fue bajar de peso, fue verme a mí que había dejado el hospital.
>
> El segundo fue Damián, 37, tenía un local de repuestos que le iba mal después de la pandemia. Buscaba un ingreso extra y le daba vergüenza que sus amigos se enteraran. Tardó tres semanas en decidirse y me preguntó cuatro veces si era una pirámide.
>
> La tercera, Silvina, 55, se acababa de jubilar y estaba deprimida porque sentía que ya no servía para nada. Ella no vino por la plata, vino porque quería pertenecer a algo. Es la que más vende hoy.

> Memoria episódica en vez de abstracción: mejora la calidad de la respuesta
> además de la claridad de la pregunta. De acá salen los botones calientes del
> avatar.

### 2. ¿Qué frases te dicen textualmente?

| | |
|---|---|
| **Clave** | `avatar_frases_que_dicen` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 3 · 3 min |
| **Largo pedido** | 900 caracteres (~64 segundos hablando) |
| **Sección del documento** | 1. Sobre tu negocio |

**Subtítulo:** Las que más se repiten cuando te escriben o cuando hablás con ellos.

**Ayuda:** Copiá sus palabras exactas, no las resumas. Esas frases van a aparecer literal en tus anuncios y es lo que hace que la gente sienta "esto habla de mí".

**Ejemplo que ve el cliente:**

> "No me reconozco cuando me miro al espejo."
> "Estoy cansada de estar cansada."
> "Ya probé de todo y siempre vuelvo al mismo lugar."
> "No tengo tiempo ni para mí."
> "Necesito algo que pueda hacer desde casa, con los chicos."
> "¿Y esto realmente funciona o es como todo?"
> "Me da vergüenza que mis amigas se enteren."
> "Quiero dejar de depender de mi sueldo."
> "Trabajo todo el día y no me alcanza."

### 3. ¿Qué es lo que más busca tu gente?

| | |
|---|---|
| **Clave** | `avatar_botones` · chips múltiples · obligatoria · 1 min |
| **Sección del documento** | 1. Sobre tu negocio |

**Subtítulo:** Elegí las 3 más fuertes.

**Opciones:** Tener más tiempo · Un ingreso extra · Libertad financiera · Viajar · Crecer como persona · Asegurar su jubilación · Ayudar a otros

### 4. ¿Qué tienen en común las personas que mejor te funcionan?

| | |
|---|---|
| **Clave** | `red_cualidades` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 2 · 2 min |
| **Largo pedido** | 500 caracteres (~36 segundos hablando) |
| **Sección del documento** | 1.3 Historia de vida / 8 |

**Subtítulo:** No lo que buscás en teoría: lo que ves en los que realmente rinden.

**Ejemplo que ve el cliente:**

> Las que mejor funcionan son las que ya venían vendiendo algo, aunque sea ropa por catálogo o tortas por encargo: no les da vergüenza ofrecer. Casi todas tienen entre 35 y 50 y algo que las aprieta, una deuda, un hijo que empieza la facultad, algo concreto. Y son las que preguntan mucho al principio, las que te llenan de mensajes. Las que dicen "sí, dale, mándame todo" y no preguntan nada, no arrancan nunca.

### 5. ¿A quién SÍ querés que le llegue tu anuncio?

| | |
|---|---|
| **Clave** | `avatar_si_quiero` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 2 · 2 min |
| **Largo pedido** | 600 caracteres (~43 segundos hablando) |
| **Sección del documento** | 1.3 Historia de vida / 10 |

**Subtítulo:** Describí a la persona ideal.

**Ejemplo que ve el cliente:**

> Mujeres de 35 a 55, mamás, que trabajan en relación de dependencia o que tienen un emprendimiento chico. Que estén en Argentina, Chile o Uruguay. Que hayan intentado bajar de peso antes y no lo hayan logrado. Que sean activas en redes, que comenten cosas, no las que solo miran. Y sobre todo: gente que quiera resolver algo, no gente que quiera quejarse.

### 6. ¿A quién NO querés que le llegue?

| | |
|---|---|
| **Clave** | `avatar_no_quiero` |
| **Tipo** | abierta · con micrófono |
| **Obligatoria** | Sí · peso 2 · 2 min |
| **Largo pedido** | 600 caracteres (~43 segundos hablando) |
| **Sección del documento** | 1.3 Historia de vida / 9 |

**Subtítulo:** El tipo de persona que preferís evitar.

**Ayuda:** Esto lo usamos para excluir gente de tus anuncios y que no gastes plata en quien no te sirve.

**Ejemplo que ve el cliente:**

> No quiero gente que busca hacerse rica sin trabajar, los que preguntan "¿cuánto gano sin hacer nada?". Tampoco los que ya están en otra compañía y quieren cambiar cada seis meses, esos rompen el equipo. No quiero menores de 25 en general, porque no tienen la disciplina ni la red de contactos. Y no quiero a los que vienen a discutir si esto es una estafa: no me interesa convencer a nadie.

### 7. ¿En qué países o zonas querés vender?

| | |
|---|---|
| **Clave** | `avatar_zona` · corta · obligatoria · 1 min |
| **Agrupada** | `segmentacion` |
| **Sección del documento** | 4. Audiencia y segmentación |

**Ejemplo:** Argentina (sobre todo Buenos Aires y Rosario), Chile y Uruguay

---

# Tramo 5 · Últimos detalles

> **Subtítulo:** Links, presupuesto y fecha de grabación. Es rápido.
> **Al terminar:** Listo. Ya tenemos todo lo que teníamos que preguntarte.
> **18 minutos** · 18 preguntas · 14 obligatorias · se puede pausar

> ⚠️ **El subtítulo dice "es rápido" y son 18 minutos.** Segundo candidato a
> podar: casi todo lo de acá se resuelve mejor en la sesión de onboarding.

### 1. ¿Tenés página web?

`web_estado` · opciones · obligatoria · agrupada `web` · *5. Canales y producto*

**Opciones:** Sí, y te paso el link · Tengo pero no sé entrar · No tengo

> Las tres opciones existen porque muchos no tienen web y lo viven como un
> fracaso. Si elige "no tengo", la respuesta es "Perfecto, te armamos una".

### 2. Pasanos el link

`web_url` · url · **no obligatoria** · agrupada `web` · solo si `web_estado` = sí

**Ejemplo:** https://minegocio.com

### 3. ¿Qué dirección web querés para tu página?

`dominio_deseado` · corta · obligatoria · agrupada `dominio` · escribe en `strategy_pages.official_domain`

**Subtítulo:** Sin www ni https. Por ejemplo: mariagonzalez.com

**Ejemplo:** mariagonzaleznutricion.com

### 4. Dos alternativas por si esa no está disponible

`dominio_alt` · corta · **no obligatoria** · agrupada `dominio`

**Ejemplo:** mariagonzalez.net · nutricionconmaria.com

### 5. Link de tu página de Facebook

`facebook_url` · url · obligatoria · agrupada `redes` · *4. Audiencia y segmentación*

**Subtítulo:** La página del negocio, no tu perfil personal.

**Ejemplo:** https://facebook.com/mariagonzaleznutricion

### 6. Link de tu Instagram

`instagram_url` · url · obligatoria · agrupada `redes`

**Ejemplo:** https://instagram.com/mariagonzalez.nutri

### 7. ¿A qué WhatsApp querés que te lleguen los interesados?

`whatsapp_leads` · teléfono · obligatoria · agrupada `whatsapp` · escribe en `strategy_pages.whatsapp_leads`

**Subtítulo:** Con código de país.

**Ejemplo:** +54 9 341 555 1234

### 8. ¿Quién contesta ese WhatsApp?

`whatsapp_quien_atiende` · corta · obligatoria · agrupada `whatsapp`

**Subtítulo:** Tu nombre, o el de la persona que se encargue.

**Ejemplo:** Yo misma, de 9 a 21h

### 9. ¿Cuánto podés invertir por mes en publicidad?

`presupuesto_ads` · opciones · obligatoria · escribe en `clients.ads_budget_monthly` · *3. Oferta y objetivos*

**Subtítulo:** Es lo que se le paga a Meta, aparte de nuestro servicio.

**Ayuda:** No hay respuesta incorrecta. Si todavía no lo definiste, decilo y lo vemos juntos en la reunión.

**Opciones:** Entre 300 y 500 USD · Entre 500 y 1.000 USD · Entre 1.000 y 3.000 USD · Más de 3.000 USD · Todavía no lo definí

> Sin "mínimo recomendado" en rojo: el cliente se pone a la defensiva.

### 10. ¿Tenés el Pixel de Meta instalado?

`tiene_pixel` · opciones · obligatoria · agrupada `tecnico`

**Subtítulo:** Si no sabés qué es, poné "no sé" — lo resolvemos en la reunión.

**Opciones:** Sí · No · No sé qué es

### 11. ¿Tenés listas de emails o teléfonos de clientes?

`tiene_bbdd` · opciones · obligatoria · agrupada `tecnico`

**Subtítulo:** Sirven para buscar gente parecida a los que ya te compraron.

**Opciones:** Sí · No

### 12. ¿Tenés algo gratis para regalar?

`lead_magnet` · corta · **no obligatoria** · agrupada `tecnico` · *3. Oferta y objetivos*

**Subtítulo:** Un ebook, una clase, una guía. Si no tenés, lo armamos nosotros.

**Ejemplo:** Una guía en PDF de 7 días de desayunos saludables

### 13. ¿Qué te gustaría saber de alguien antes de hablarle?

`calificacion_preguntas` · corta · obligatoria · *6. Formularios de captación*

**Subtítulo:** Dos o tres preguntas que te ayuden a saber si vale la pena la llamada.

**Ayuda:** Las ponemos en el formulario que completan antes de contactarte.

**Ejemplo:** ¿Hace cuánto que estás intentando bajar de peso? · ¿Cuánto podrías invertir por mes en tu salud? · ¿Con qué disponibilidad contás para las videollamadas?

### 14. ¿Tu empresa tiene que aprobar la publicidad antes de publicarla?

`compliance` · chips múltiples · obligatoria · *7. Competencia y diferenciadores*

**Subtítulo:** Marcá lo que corresponda.

**Opciones:**
- Sí, revisan todo antes
- Solo si uso su logo o su nombre
- Hay frases prohibidas
- No, puedo publicar libre
- **No sé, mi empresa no me dijo nada**

> La última opción es deliberada y visible: muchos no conocen las reglas de su
> propia empresa, y ese "no sé" es información útil para nosotros.

### 15. ¿Con quién hay que hablar para esas aprobaciones?

`compliance_contacto` · corta · **no obligatoria** · solo si marcó alguna opción de aprobación

**Subtítulo:** Nombre y contacto, si lo tenés.

**Ejemplo:** Departamento de Marketing — legal@empresa.com, tardan unos 5 días

### 16. ¿Quién va a grabar los videos?

`quien_graba` · opciones · obligatoria · agrupada `grabacion`

**Opciones:** Yo · Alguien de mi equipo · Quiero que lo haga la IA

### 17. ¿Nos autorizás a crear un clon de tu imagen con IA?

`heygen` · opciones · obligatoria · agrupada `grabacion` · *1.2 Autorización Heygen*

**Subtítulo:** Grabás una vez y después podemos generar variantes de tus anuncios sin que grabes de nuevo. Si después no te gusta, lo apagamos.

**Opciones:** Sí, adelante · No, prefiero grabar yo · Lo decido después

> Acá falta el video de 40 segundos con un ejemplo real, que debería ir **antes**
> del sí/no. Sin eso, la reacción típica es "¿van a poner mi cara en un robot?".

### 18. ¿Qué día podés grabar tus videos?

`fecha_grabacion` · fecha · obligatoria · agrupada `grabacion`

**Subtítulo:** Reservá una fecha firme. Necesitás una hora y un lugar con buena luz.

---

# Tramo 6 · Tu material

> **Subtítulo:** Lo último: subinos los archivos que te pedimos al principio.
> **Al terminar:** Terminaste. Ahora empezamos nosotros.
> **11 minutos** · 9 preguntas · 3 obligatorias
> **Desbloquea** la pestaña Material

> Va último, como en el documento original ("8. Necesitamos del cliente"). Lo que
> evita que el cliente llegue acá sin nada es el checklist de la bienvenida.
> **El logo y las 5 fotos bloquean el 100%**: sin eso no se puede cerrar el
> onboarding. Los testimonios y el acceso a Meta no bloquean.

### 1. Tu logo 🔒 bloqueante

`material_logo` · subida · **obligatoria** · 1 archivo · bucket `branding`

**Subtítulo:** En la mejor calidad que tengas. Si tenés el archivo original (.ai, .svg o PNG con fondo transparente), mejor.

**Ayuda:** Con esto todo lo que publiquemos sale con tu identidad.

### 2. ¿Cuáles son los colores de tu marca?

`material_colores` · color · **obligatoria** · agrupada `marca` · escribe en `clients.brand_colors`

**Subtítulo:** Si sabés los códigos exactos, pegalos. Si no, describilos: "azul oscuro y dorado".

**Ejemplo:** Azul marino (#0B1E3F) y dorado (#C9A227). Fondo siempre blanco.

### 3. ¿Usás alguna tipografía en particular?

`material_tipografia` · corta · **no obligatoria** · agrupada `marca` · escribe en `clients.brand_font`

**Subtítulo:** Si no tenés, dejalo vacío y elegimos nosotros.

**Ejemplo:** Montserrat para títulos, Open Sans para el texto.

### 4. 5 fotos tuyas 🔒 bloqueante

`material_fotos_autoridad` · subida · **obligatoria** · 5 archivos · bucket `autoridad`

**Subtítulo:** Que se te vea bien la cara. Con fotos del celular alcanza — no hace falta sesión de fotos.

**Ayuda:** Las usamos en la portada de tus videos y en tu página.

### 5. Fotos de tu vida

`material_estilo_vida` · subida · **no obligatoria** · bucket `estilo_vida`

**Subtítulo:** Viajes, familia, eventos, premios. Lo que muestre cómo vivís hoy.

**Ayuda:** Son las que más conectan en los anuncios.

### 6. Material de tu empresa

`material_empresa` · subida · **no obligatoria** · bucket `empresa`

**Subtítulo:** PDF de la empresa, plan de compensación, catálogo, fotos de eventos corporativos.

### 7. ¿Tenés presentaciones grabadas?

`material_presentaciones` · corta · **no obligatoria**

**Subtítulo:** Links de YouTube, Vimeo o donde estén. Una por línea.

**Ejemplo:** https://youtube.com/watch?v=... — presentación del plan, 45 min

### 8. ¿Hay alguien de tu equipo que nos pueda ayudar con esto?

`delegado_nombre` · corta · **no obligatoria** · agrupada `delegado`

**Subtítulo:** Opcional. Alguien que nos pase material o responda dudas cuando vos no puedas.

**Ejemplo:** María José, mi asistente

### 9. Su WhatsApp

`delegado_whatsapp` · teléfono · **no obligatoria** · solo si completó el nombre

**Ejemplo:** +54 9 341 555 9876

---

# Notas para optimizar

## Vocabulario prohibido en todo el onboarding

embudo · avatar · lead magnet · pixel (salvo la pregunta técnica) · compliance ·
CTA · funnel · awareness · nurturing.

## Dónde se pierde tiempo

| Tramo | Declarado antes | Real | Diferencia |
|---|---|---|---|
| Tu negocio | 9 min | **29 min** | +20 |
| Últimos detalles | 4 min | **18 min** | +14 |
| Tu gente | 7 min | 15 min | +8 |
| Tu historia | 14 min | 21 min | +7 |

Los minutos que ve el cliente ahora son los reales (la suma de sus preguntas),
no un número puesto a ojo. Por eso la bienvenida dice ~100 minutos.

## Las 12 preguntas largas, por valor

Ordenadas por lo que aportan a lo que producimos después:

| Clave | Largo | Alimenta |
|---|---|---|
| `avatar_ultimas_3_personas` | 1.300 | Los botones calientes del avatar |
| `historia_por_que_empece` | 1.200 | El gancho del VSL · citas literales |
| `historia_que_cambio` | 1.200 | La prueba de transformación del VSL |
| `historia_antes_del_negocio` | 900 | El Avatar Espejo |
| `avatar_frases_que_dicen` | 900 | Copy directo de anuncios |
| `testimonios_relato` | 900 | Prueba social del VSL y la landing |
| `diferencial_por_que_vos` | 900 | El bloque que más citas exige |
| `equipo_como_surgio` | 800 | Bloque equipo |
| `oportunidad_diferencial` | 800 | Valores diferenciales del modelo |
| `objeciones_para_no_entrar` | 700 | Manejo de objeciones del VSL |
| `problema_que_resuelves` | 700 | Problemas externos del avatar |
| `proceso_de_ventas` | 700 | Diseño del embudo |

Total pedido: ~18.000 caracteres. Holgado contra el presupuesto de 340.000 del
chat de agentes.

## Lo que falta cargar

1. **Ejemplos reales.** Los de este documento son inventados. Reemplazarlos por
   respuestas reales de clientes que contestaron bien es la mejora más rentable:
   el ejemplo es la vara contra la que el cliente calibra cuánto escribir.
2. **Los videos de 30-60 segundos por tramo.** Son 6, más 2 de apoyo: dónde
   copiar el link de Facebook, y el ejemplo de HeyGen (este último debería ir
   antes de la pregunta 17 de Últimos detalles).
3. **Quiénes atienden la sesión de onboarding**, para que el calendario ofrezca
   horarios.
