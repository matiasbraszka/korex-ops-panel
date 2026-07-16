---
name: korex-onboarding-filler
description: "Rellena la plantilla oficial de Onboarding de Método Korex combinando tres fuentes — investigación de pre-onboarding (Google), transcripción de la llamada de onboarding, y apuntes del consultor — en un único documento Word (.docx) con todas las preguntas completas. Distingue información CONFIRMADA por el cliente de información NO VERIFICADA (research Google), y coloca esta última en una sección aparte 'A validar con el cliente'. Usa esta skill SIEMPRE que el usuario diga rellenar onboarding, completar plantilla de onboarding, armar el onboarding del cliente, procesar la llamada de onboarding, llenar la ficha de onboarding, consolidar onboarding, o cuando entregue transcripción + apuntes + research de un cliente nuevo con intención de cerrar el onboarding. NO usar para análisis estratégico profundo (para eso existe korex-strategy-analyzer) ni para crear avatares (korex-avatar-builder)."
---

# Korex Onboarding Filler

Consolida pre-onboarding research + transcripción de llamada + apuntes del consultor en la plantilla oficial de Onboarding de Método Korex, entregada como documento Word (.docx).

## Regla crítica: verdad vs. investigación

Esta skill existe porque el consultor Korex no quiere que se inventen datos ni que se mezcle información de Google con lo que dijo el cliente. El principio es simple:

**Solo va al cuerpo principal lo que el cliente confirmó en la llamada o en los apuntes del consultor. Todo lo demás va a "A validar con el cliente".**

### Jerarquía de fuentes (de mayor a menor confianza)

1. **Transcripción de la llamada** → máxima confianza. Lo que el cliente dijo con sus propias palabras. Va directo al campo correspondiente.
2. **Apuntes del consultor** → alta confianza. Es la interpretación curada del consultor sobre lo importante de la llamada. Va directo al campo.
3. **Pre-onboarding research (Google)** → NO va al cuerpo principal a menos que coincida con algo ya dicho por el cliente (en cuyo caso sirve para complementar detalle, no para reemplazar). Si es información nueva no mencionada en la llamada/apuntes → va a la sección **"A validar con el cliente"** al final.

### Qué hacer en cada caso

| Situación | Acción |
|---|---|
| El cliente lo dijo en la llamada | Rellenar el campo citando/parafraseando al cliente |
| Está en los apuntes del consultor | Rellenar el campo |
| Research coincide y aporta detalle ya dicho | Rellenar con lo del cliente, el research solo refuerza |
| Research dice algo que el cliente NO mencionó | NO va al campo. Va a "A validar con el cliente" |
| Research contradice al cliente | Prevalece el cliente. El dato del research se descarta o se menciona en "A validar" con nota |
| Ninguna fuente tiene el dato | Escribir `Sin información` en el campo |

**Nunca inventes.** Si no estás seguro de dónde viene un dato, es señal de que va a "A validar".

## Inputs que recibe la skill

El usuario típicamente entrega 3 bloques:

1. **Pre-onboarding research** — investigación hecha en Google sobre la empresa y el líder antes de la llamada (bio, trayectoria, redes, empresa de MLM a la que pertenece, etc.)
2. **Transcripción de la llamada de onboarding** — texto completo de la llamada grabada
3. **Apuntes del consultor** — notas tomadas durante la llamada, generalmente ya vinculadas a algunas preguntas de la plantilla

Si falta alguno de los tres, preguntar al usuario antes de continuar. Con solo transcripción o solo apuntes se puede trabajar, pero hay que avisar que el output será parcial.

## Plantilla oficial (estructura fija — NO modificar ni agregar secciones)

El documento final debe seguir EXACTAMENTE esta estructura, en este orden, con estas preguntas literales. Cada pregunta se rellena con una respuesta en prosa clara (no bullet points salvo que el contenido lo amerite).

### Llamada Grabada de Onboarding
- (link a la llamada si el usuario lo provee, si no: `Sin información`)

### 1. Sobre tu negocio
- Nombre de tu marca o empresa
- ¿Qué producto o servicio ofreces?
- ¿Cuál es tu propuesta de valor única? (¿Por qué te eligen?)
- ¿Qué problema o necesidad solucionas para tu cliente ideal?
- ¿Cuál es el Avatar que más compra los productos? ¿Y cuál es el que más hace la red?
  - AVATAR QUE COMPRA PRODUCTOS:
  - AVATAR QUE HACE LA RED:
- ¿Qué tipo de personas NO quieres atraer?
- Si tienes un equipo o nombre de equipo, cuenta también cómo surgió el grupo, qué valores tiene, qué valor aporta a los nuevos integrantes.

### 1.1. Experiencias pasadas
- ¿En el pasado hiciste alguna campaña de marketing que te haya dado buenos resultados? Explícanos al detalle cómo la hicieron.
- ¿En el pasado hicieron campañas de marketing que no le dieron resultados? Explícanos por encima qué errores cometieron.

### 1.2. Autorización Heygen
- Estado de la autorización para usar Heygen en generación de anuncios automáticos (Sí / No / Pendiente / Sin información)

### 1.3. Historia de vida
1. ¿A qué te has dedicado antes del negocio que desarrollas hoy? (background, de dónde viene)
2. ¿Hace cuánto iniciaste en el negocio que haces hoy?
3. ¿Por qué motivo empezaste? ¿Qué te gustaría lograr con este negocio?
4. A día de hoy, ¿qué resultados de dinero y materiales has logrado gracias al negocio?
5. ¿Qué resultados no materiales has logrado gracias al negocio?
6. ¿Qué estilo de vida te ha permitido vivir este negocio?
7. ¿Cuántas personas tienes en tu red?
8. Mayoritariamente, ¿qué cualidades tienen esas personas?
9. ¿A qué tipo de persona NO quieres en tu negocio?
10. ¿A quién sí quieres en tu negocio?
11. ¿Cuáles son los puntos diferenciales que crees que tiene esta oportunidad de negocio respecto a otras similares de la competencia?
12. ¿Qué edad tienes?
13. ¿De qué forma o cómo le sueles tú explicar a alguien el negocio que haces? (De forma breve)
14. ¿Hay alguna información adicional que no hayas dado en estas preguntas y quieres que sepamos?

### 2. Autoridad y Marca personal
- ¿Qué puedes ofrecer de valor para las personas que entren a tu red y qué acompañamiento puedes hacerles (según el ticket)?
- ¿Por qué se unieron contigo y no con otra persona?
- ¿Cómo te pueden edificar las personas?
- ¿Qué sistema usarás para acompañar a las personas?

### 3. Oferta y objetivos
- ¿Qué oferta específica vamos a promocionar? (Producto, servicio, precio, condiciones)
- ¿Tienes actualmente algún lead magnet? (ej: regalo, ebook, clase gratuita)
- ¿Cuál es tu objetivo principal con la campaña?
- ¿Cuál es tu presupuesto mensual para publicidad digital? (mínimo recomendado $300)

### 3.1. Testimonios
- Listar los testimonios mencionados (mínimo 3 idealmente), con antes/después lo más detallado posible. Indicar si existe grabación horizontal para landing.

### 4. Audiencia y segmentación
- ¿Tienes bases de datos de emails o teléfonos para crear audiencias?
- ¿Tienes Pixel de Meta o eventos de conversión instalados?

### 5. Canales y producto
- ¿Tienes página web o landing page activa? (Enlace/s)
- ¿Cómo es tu proceso de ventas completo para transformar desconocidos a clientes?
- ¿Qué rango de tickets tiene tus productos o servicios más vendidos? ¿Qué diferencia tiene cada producto?
- ¿Tienes campañas publicitarias activas o historial de campañas anteriores?
- ¿Tienes imágenes, videos o textos listos para anuncios?
- ¿Quién es el encargado de grabar los anuncios?

### 6. Formularios de captación (Meta Instant Forms)
- ¿Qué datos mínimos quieres pedir en el formulario? (default: Nombre, Email, Teléfono)
- 2-3 preguntas de calificación del lead

### 7. Competencia y diferenciadores
- ¿Quiénes son tus principales competidores o referentes de los que se inspiran?
- ¿Qué diferencias o ventajas competitivas quieres destacar frente a ellos?

### 8. Necesitamos del cliente (checklist de entregables)
- Datos del contrato (persona / empresa) — estado
- Datos para factura — estado
- Imágenes del CEO — estado
- Imágenes del equipo corporativo — estado
- Videos corporativos / eventos / escenario — estado
- Material de marketing (imágenes, videos, flyers) — estado
- Testimonios (mínimo 3 en video, resto en texto) — estado
- Presentaciones grabadas (YouTube u otra plataforma) — estado
- PDF de la empresa + plan de compensación — estado
- Competidores / referentes — estado
- Zoom de configuración técnica (facebook/instagram admin) — estado y fecha propuesta

Para cada ítem, marcar: `Entregado` / `Pendiente` / `No mencionado`.

### A validar con el cliente
Sección final con formato de lista. Cada ítem incluye:
- **Tema / campo al que corresponde**
- **Dato encontrado en research**
- **Fuente (ej: LinkedIn del líder, web de la empresa X, etc.)**
- **Por qué va aquí** (ej: "el cliente no lo mencionó en la llamada")

Esta sección es la red de seguridad que le permite al consultor confirmar o descartar info de Google antes de usarla en estrategia, copy o VSL.

## Proceso paso a paso

1. **Pedir los 3 inputs** si el usuario no los adjuntó. Confirmar qué tiene antes de empezar.
2. **Leer la plantilla oficial PDF** si está en `/mnt/user-data/uploads/` (`Onboarding_General.pdf` o similar). Si el usuario subió una versión actualizada de la plantilla, usar esa.
3. **Indexar la transcripción y los apuntes**: identificar qué preguntas ya tienen respuesta directa.
4. **Para cada pregunta de la plantilla**, aplicar la jerarquía de fuentes y rellenar.
5. **Recolectar datos no confirmados** del research en paralelo → ir armando la lista "A validar con el cliente".
6. **Generar el .docx** usando la skill `docx` (`/mnt/skills/public/docx/SKILL.md`). Leer esa skill antes de escribir el archivo para seguir las mejores prácticas de python-docx.
7. **Guardar en `/mnt/user-data/outputs/`** con nombre `Onboarding_<NombreCliente>_<YYYY-MM-DD>.docx`.
8. **Presentar el archivo** con `present_files` y dar un resumen breve de:
   - Cuántas preguntas quedaron rellenas con info confirmada
   - Cuántas quedaron en `Sin información`
   - Cuántos ítems fueron a "A validar con el cliente"

## Formato del documento Word

- **Título**: `Onboarding – <Nombre de la marca/empresa>` en navy (#0B1E3F) o similar a Korex
- **Subtítulo**: fecha de la llamada + nombre del consultor (si se provee)
- **Headings H1** para cada sección numerada (1, 1.1, 1.2, etc.)
- **Pregunta en negrita**, respuesta en párrafo debajo
- **Sección "A validar con el cliente"** al final, con heading H1 destacado y cada ítem como bullet con sub-bullets para fuente y motivo
- Mantener tipografía limpia y legible. No hace falta logo salvo que el usuario lo pida.

## Qué NO hacer

- NO inventar respuestas. Si no hay fuente, `Sin información`.
- NO mezclar research con respuestas del cliente en el mismo párrafo sin dejar claro qué viene de dónde.
- NO agregar secciones que no estén en la plantilla oficial (excepto "A validar con el cliente" que es requerida por el flujo).
- NO reformular preguntas de la plantilla — copiarlas literal.
- NO omitir preguntas. Todas las preguntas de la plantilla deben aparecer en el documento final, incluso las que queden en `Sin información`.
- NO usar información de research sobre datos sensibles (facturación, resultados, cantidad de red) sin confirmación del cliente — esto SIEMPRE va a "A validar".

## Ejemplo mini de manejo de fuentes

**Pregunta**: ¿Cuántas personas tienes en tu red?

- Research Google dice: "El líder X tiene más de 5000 personas en su organización según un post de Instagram de 2023"
- Cliente en llamada dice: "tengo como 3200 activos ahora"
- Apuntes del consultor: "3200 activos, creció mucho último año"

**Respuesta en el campo**: `3200 personas activas actualmente. El consultor anotó que la red creció significativamente durante el último año.`

**En "A validar con el cliente"**: *(no va nada, porque el cliente ya respondió y el dato del research queda descartado — es más viejo y menos confiable que lo que dijo el cliente)*

---

**Pregunta**: ¿A qué te has dedicado antes del negocio que desarrollas hoy?

- Research Google dice: "Ex-jugador profesional de fútbol en club Y entre 2005-2012, luego coach deportivo"
- Cliente en llamada: no se tocó el tema
- Apuntes del consultor: vacío en esta pregunta

**Respuesta en el campo**: `Sin información`

**En "A validar con el cliente"**:
- **Historia de vida — background previo**: Research sugiere ex-jugador profesional de fútbol (club Y, 2005-2012) y posterior coach deportivo. Fuente: LinkedIn del líder. Motivo: no fue mencionado en la llamada ni en los apuntes.
