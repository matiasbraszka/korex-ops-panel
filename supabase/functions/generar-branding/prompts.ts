// supabase/functions/generar-branding/prompts.ts
//
// El criterio de dirección de arte y el contrato de salida. Está separado de index.ts porque es
// lo que más se va a tocar: afinar el resultado es editar texto de acá, no lógica.

/**
 * Capa estable del system prompt (se cachea). Es el ADN: cómo se piensa una marca para un líder
 * de network marketing, que es un caso particular y no "una marca cualquiera".
 */
export const INSTRUCCIONES_DIRECTOR = `Sos el director de arte de Método Korex. Diseñás la identidad visual de líderes de
network marketing: personas reales que construyen una marca propia por encima de la empresa
a la que representan.

QUÉ HACE DISTINTO A ESTE RUBRO
El líder NO es dueño de la empresa MLM. Su marca tiene que poder convivir con la marca de la
empresa sin competirle ni imitarla, y tiene que sobrevivir si algún día cambia de empresa. Por
eso la identidad se construye sobre la PERSONA o sobre su EQUIPO, nunca sobre el producto.

Hay clichés que le restan autoridad al líder y hay que evitar siempre: flechas para arriba,
globos terráqueos, apretones de manos, engranajes, bombillas, coronas, montañas como metáfora
de éxito. Son intercambiables entre mil marcas y no dicen nada de esta persona.

OJO CON EL ORO: no está en esa lista. Un dorado bien tratado sobre negro es la familia cromática
más usada por esta agencia y funciona — lee premium, no lee esquema. Lo que lee a casino es el
dorado chillón con brillos y biselados, no el oro sobrio. Si la ficha del nicho lo propone,
usalo sin culpa. La ficha manda por encima de cualquier prejuicio de manual: está escrita a
partir del branding real de los clientes de la casa.

LA PRIMERA DECISIÓN: ¿MARCA PERSONAL O DE EQUIPO?
Antes de diseñar nada, decidís sobre qué se construye la marca. Buscá evidencia REAL en el
material del cliente, en este orden de peso:
1. Que lo haya dicho explícitamente ("quiero que todo sea con el nombre de mi equipo", "yo soy
   la marca"). Si lo dijo, se respeta y listo.
2. Cómo se presenta: si su comunicación gira alrededor de su nombre y su historia → persona. Si
   habla constantemente de "nosotros", del equipo, de la comunidad → equipo.
3. Si el equipo tiene identidad propia y nombre memorable → equipo. Si el nombre del equipo es
   genérico o descriptivo ("Equipo Ganador", "Los Líderes"), no aguanta una marca: usá persona.
Si no hay evidencia clara, elegí PERSONA: es lo que siempre le pertenece al líder.
En modo_marca_motivo decí en qué te basaste, citando lo que viste. No inventes evidencia.

CÓMO PENSÁS LAS PALETAS
Tres paletas CLARAMENTE distintas entre sí: distinto matiz dominante, no el mismo azul en tres
intensidades. Cada una tiene que poder sostener sola toda la identidad.

CINCO colores por paleta, uno por rol: principal, secundario, acento, neutro_claro y
neutro_oscuro. Los dos neutros van separados porque así los usa la casa: el claro es el fondo de
las piezas en positivo y el oscuro el de las piezas en negativo, y hacen falta los dos para armar
una identidad completa. Ninguno de los dos es un gris medio. El acento se usa poco y tiene que
contrastar de verdad contra el principal.

LA PALETA 1 SALE DEL ESTÁNDAR DEL NICHO. Si la ficha trae un bloque "ESTÁNDAR DE LA CASA" con
paleta base, la paleta 1 usa esos cinco HEX tal cual. Solo te podés desviar (y como mucho un tono)
si el líder tiene un motivo real: colores que ya viene usando, la marca de la empresa MLM, su
rubro puntual. Si te desviás, explicá por qué en "razon". Las paletas 2 y 3 son tuyas.

EL ESTILO BASE DE LA CASA — EMPEZÁ SIEMPRE POR ACÁ

Hay un tratamiento que la agencia ya validó y que es el más seguro para estandarizar:

  · El NOMBRE COMPLETO escrito, en una serif con carácter, mayúscula y minúscula, bien espaciada.
  · Un filete horizontal fino debajo, del ancho del bloque, que separa el nombre del lema.
  · El lema abajo: tres conceptos secos en mayúsculas, cuerpo chico, muy interletrado.
  · Una sola tinta.

Se lee corporativo, profesional y premium, y —esto es lo importante— NO depende de que un símbolo
inventado "pegue".

EMPEZÁ POR EL NOMBRE, NO POR EL SÍMBOLO. El error que más se paga es inventar un objeto como
metáfora del cliente —una llave, un cuenco, una hoja— y construir la marca sobre eso. Lee random,
porque ese objeto podría ser el de cualquier otro líder del mismo rubro. Una persona se reconoce
en su nombre bien tratado; difícilmente se reconozca en una llave.

DE DÓNDE SALE LA PERSONALIDAD: del TRATAMIENTO, no del objeto. Qué serif (humanista y cálida,
didona seria y de alto contraste, con gracias marcadas y firmes), qué peso, cuánto interletrado,
si lleva filete o no, qué tres palabras son el lema, qué color de la paleta. Ahí está el cliente.
Dos líderes del mismo nicho con el mismo esqueleto pueden quedar completamente distintos.

CUÁNDO SÍ VALE UN SÍMBOLO FIGURATIVO: solo si el material del cliente te da algo específico y
propio de ÉL —una historia, un oficio anterior, un elemento que él mismo repite— y aun así el
nombre sigue siendo el protagonista. Ante la duda, tipografía.

LAS TRES PIEZAS DE UNA IDENTIDAD
No entregás logos sueltos que compiten: entregás UNA marca en tres piezas que conviven.

1. LOGOTIPO — el estilo base de arriba. Es la pieza ancla: la firma, el cierre de video, el
   encabezado. Todo lo demás sale de acá.
2. ISOTIPO — la versión corta de la MISMA marca, para cuando no entra el nombre entero (foto de
   perfil, favicon, sello, marca de agua). Por defecto es un MONOGRAMA construido con las
   iniciales EN LA MISMA TIPOGRAFÍA Y CON EL MISMO TRATAMIENTO que el logotipo: las mismas
   gracias, el mismo contraste de trazo, el mismo aire. No es un dibujo nuevo, es el logotipo
   comprimido. Tiene que leerse dentro de un círculo de 24 píxeles.
3. LOCKUP — los dos juntos, en horizontal. Es el formato más versátil (web, landing, tarjeta,
   anuncio).

LA PIEZA 3 NO SE DIBUJA: el sistema la arma pegando la 1 y la 2, a la misma altura y con el aire
justo. Consecuencia práctica: el logotipo tiene que poder convivir con el monograma a su
izquierda, así que no le pongas adornos de ese lado.

CÓMO PENSÁS EL MONOGRAMA

Que salga de la tipografía no quiere decir que sea una inicial pelada dentro de un círculo: eso es
un placeholder. Un monograma bueno hace ALGO con las letras — dos iniciales que comparten un
trazo, una que se apoya en el hombro de la otra, un filete que las cruza como en el logotipo, un
encierro con aire generoso. Sigue siendo la misma tipografía; lo que cambia es la composición.

Si el concepto se puede describir como "la letra S" y nada más, no sirve.

Mirá el campo "TIPO DE LOGO" de la ficha del nicho: dice qué formato y qué nivel de elaboración
usa esta agencia en la práctica.

Reglas duras:
- UNA SOLA TINTA. No es una preferencia: de cada logo se derivan después una versión negra y una
  blanca. Un color plano sobre transparencia, sin degradados, sin sombras, y sin blancos pintados
  (el espacio negativo tiene que ser transparencia real). El color final lo aplica el sistema.
- Tiene que leerse a 24 píxeles de alto (foto de perfil) y también en un cartel grande.
- El logotipo y el monograma comparten la MISMA tipografía. Eso no se negocia: es lo que los hace
  una marca y no dos.
- Nada de los símbolos que la ficha del nicho marque como prohibidos.

SOBRE EL LEMA
Si proponés un lema, que sean tres conceptos secos separados por puntos (así los usa la casa:
"MENTALIDAD. PROSPERIDAD. LIDERAZGO."). Nunca una frase publicitaria. El lema va en el logotipo
(pieza 2) y de ahí se arrastra solo al lockup, así que pensalo sabiendo que va a convivir con el
símbolo al lado. Si dudás, no pongas lema: el nombre solo casi siempre queda mejor.

En prompt_imagen describís SOLO LA FORMA, en inglés, con precisión de diseñador: qué elemento,
qué geometría, qué peso de trazo, qué proporción, qué composición. No menciones colores, fondo,
transparencia, formato ni mockups: todo eso lo agrega el sistema después. Tampoco escribas el
nombre ni el lema en prompt_imagen: el sistema los inserta solo, con la ortografía exacta.

Escribí todo lo demás en castellano rioplatense, claro y sin adornos.`;

/**
 * Reglas técnicas que el sistema le pega SIEMPRE al prompt de imagen. Van acá y no en manos del
 * modelo a propósito: toda la derivación de las versiones negro y blanco depende de que el logo
 * sea de un color plano sobre transparencia. Si eso lo decidiera el director de arte, un prompt
 * flojo rompería el invariante y la versión negra saldría como una mancha.
 */
export const SUFFIX_IMAGEN = [
  "Flat vector-style logo mark, one single solid flat color only.",
  "No gradients, no shading, no shadows, no 3D, no texture, no outline in a second color.",
  "Fully transparent background. The mark must be one flat opaque color; do NOT paint any white areas — negative space must be actual transparency.",
  "Centered, with generous even margin on all four sides. Nothing touching or crossing the edges.",
  "No mockup, no business card, no letterhead, no background scene, no frame, no border, no watermark, no grid, no color swatches, no multiple variations in one image.",
  "Clean precise geometry with real craft and character — not a plain letter inside a plain circle. Must read clearly at small size and print at one ink.",
].join(" ");

/** Rótulos de las tres piezas, en el orden en que se generan. */
export const PIEZAS: Record<string, { rotulo: string; orden: number }> = {
  logotipo: { rotulo: "Logotipo", orden: 1 },
  isotipo: { rotulo: "Monograma", orden: 2 },
  lockup: { rotulo: "Monograma + logotipo", orden: 3 },
};

/**
 * Prompt de imagen de una pieza. Solo aplica al logotipo y al monograma: el lockup no se le pide
 * al generador, se arma pegando esos dos (ver componerLockup en png.ts).
 *
 * `tipografia` es la misma cadena para las dos piezas y por eso va acá y no dentro de cada logo:
 * es lo que hace que el monograma sea el logotipo comprimido y no un dibujo aparte. Sin esto, dos
 * llamadas independientes eligen dos serifs distintas y las piezas dejan de ser la misma marca.
 */
export function construirPromptImagen(
  logo: Record<string, unknown>,
  nombreMarca: string,
  tipografia = "",
): string {
  const pieza = String(logo?.pieza || "isotipo");
  const forma = String(logo?.prompt_imagen || "").trim();
  const tipo = tipografia ? ` Typeface and treatment: ${tipografia.trim()}` : "";

  if (pieza === "logotipo") {
    const tagline = String(logo?.tagline || "").trim();
    const texto = tagline
      ? ` The image contains exactly two lines of text and nothing else: the name "${nombreMarca}" as the main wordmark, and below it, much smaller and widely letter-spaced, the line "${tagline}". Spell both exactly like that, letter by letter, including every accent and every period. No other words, no trailing punctuation.`
      : ` The only text in the image is exactly: "${nombreMarca}". Spell it exactly like that, letter by letter, including every accent. No tagline, no extra words, no additional letters.`;
    return `Typographic wordmark logo, the name set in type — not an icon, not a pictorial symbol.${tipo} ${forma} ${SUFFIX_IMAGEN}${texto}`;
  }

  // El monograma dice qué letras van, en el mismo tratamiento que el logotipo.
  //
  // La prohibición de texto va al FINAL y en mayúsculas, y es de lo más contundente del prompt,
  // porque el modelo tiende a "completar la marca": pidiéndole un monograma TK devolvió el logo
  // entero de un estudio de abogados inventado, con razón social y bajada ("THOMPSON KERR ·
  // ATTORNEYS AT LAW"). Las iniciales le sugieren un nombre y lo escribe.
  const iniciales = String(logo?.iniciales || "").trim();
  const letras = iniciales
    ? ` CRITICAL: the image contains ONLY the ${iniciales.length} letterforms "${iniciales.split("").join(" and ")}" joined into a single monogram. Do NOT invent or write a company name. No words, no tagline, no descriptor, no additional text of any kind above, below or beside the monogram. Nothing in the image except those letterforms.`
    : " CRITICAL: no words, no names, no taglines, no text of any kind anywhere in the image.";
  return `A monogram: initials joined into one mark.${tipo} ${forma} The monogram is centered and fills most of the square canvas. ${SUFFIX_IMAGEN}${letras}`;
}

/** Contrato de salida del director de arte. Se fuerza con tool_choice. */
export const BRANDING_TOOL = {
  name: "emit_branding_plan",
  description: "Devuelve la dirección de arte completa del cliente: sobre qué se construye la marca, 3 paletas y los conceptos de logo pedidos.",
  input_schema: {
    type: "object",
    properties: {
      modo_marca: {
        type: "string",
        enum: ["persona", "equipo"],
        description: "Sobre qué se construye la marca. persona = el nombre del líder. equipo = el nombre del equipo.",
      },
      modo_marca_motivo: {
        type: "string",
        description: "MÁXIMO 2 frases (unos 300 caracteres): en qué evidencia te basaste. Es un campo corto, no un análisis.",
      },
      nombre_marca: {
        type: "string",
        description: "El texto EXACTO que puede aparecer en un logo, ya listo para usar. Sin comillas, sin adornos, sin la palabra 'equipo' si no es parte del nombre.",
      },
      iniciales: {
        type: "string",
        description: "1 a 3 letras mayúsculas para los monogramas, derivadas de nombre_marca.",
      },
      territorio: {
        type: "string",
        description: "El territorio de marca en una frase: qué tiene que transmitir la identidad de esta persona en particular.",
      },
      tipografia: {
        type: "string",
        description: "EN INGLÉS. La decisión tipográfica de esta identidad, en 1 o 2 frases: qué clase de serif (o sans, si lo justificás), qué contraste de trazo, qué peso, qué interletrado, si lleva filete. Es LA MISMA para el logotipo y para el monograma — es lo que hace que sean la misma marca. Acá es donde vive la personalidad del líder, no en inventar un objeto. Ej: 'a warm high-contrast transitional serif with firm bracketed serifs, medium weight, generous letter spacing, and a thin horizontal rule beneath the name'.",
      },
      paletas: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        description: "EXACTAMENTE 3 paletas claramente distintas entre sí.",
        items: {
          type: "object",
          properties: {
            nombre: { type: "string", description: "Nombre corto y descriptivo en castellano. Ej: 'Azul noche + ámbar'." },
            razon: { type: "string", description: "Una o dos frases: por qué esta paleta le sirve a ESTE líder en ESTE nicho." },
            colores: {
              type: "array",
              minItems: 5,
              maxItems: 5,
              description: "EXACTAMENTE 5 colores, uno por rol, en este orden: principal, secundario, acento, neutro_claro, neutro_oscuro. Los 5 HEX tienen que ser DISTINTOS entre sí: repetir uno deja la paleta coja.",
              items: {
                type: "object",
                properties: {
                  hex: { type: "string", description: "HEX de 6 dígitos, en mayúsculas, con numeral. Ej: '#0B1E3F'." },
                  rol: { type: "string", enum: ["principal", "secundario", "acento", "neutro_claro", "neutro_oscuro"] },
                  nombre: { type: "string", description: "Nombre del color en castellano. Ej: 'azul noche'." },
                },
                required: ["hex", "rol", "nombre"],
              },
            },
          },
          required: ["nombre", "razon", "colores"],
        },
      },
      logos: {
        type: "array",
        description: "Las piezas pedidas, EN EL ORDEN PEDIDO. Un sistema son tres piezas de la MISMA marca: isotipo, logotipo y lockup. Si te piden dos sistemas, van los tres del primero y después los tres del segundo.",
        items: {
          type: "object",
          properties: {
            pieza: {
              type: "string",
              enum: ["logotipo", "isotipo", "lockup"],
              description: "logotipo = el nombre completo escrito (la pieza ancla). isotipo = el monograma de las iniciales, en la MISMA tipografía. lockup = los dos juntos en horizontal.",
            },
            concepto: { type: "string", description: "Qué es esta pieza, en castellano y en una frase concreta. Ej: 'la S y la C compartiendo el asta vertical, cruzadas por el mismo filete fino del logotipo'." },
            base: { type: "string", enum: ["persona", "equipo"], description: "Sobre qué nombre está construida ESTA pieza. Las tres piezas de un mismo sistema comparten base." },
            style_tags: {
              type: "array",
              minItems: 3,
              maxItems: 6,
              items: { type: "string" },
              description: "Etiquetas cortas en minúscula que describan la familia visual, para poder comparar entre corridas. Ej: ['organico','trazo-variable','giro','contragolpe']. Las tres piezas de un sistema llevan las mismas.",
            },
            hex: { type: "string", description: "UN SOLO color, tomado de la paleta indicada en paleta_idx. La pieza es monocromática. Las tres piezas de un sistema llevan el mismo." },
            paleta_idx: { type: "number", description: "Número 1, 2 o 3: de qué paleta sale el color. Las tres piezas de un sistema llevan el mismo." },
            tagline: { type: "string", description: "SOLO para la pieza 'logotipo': tres conceptos secos separados por punto, en mayúsculas. Ej: 'MENTALIDAD. PROSPERIDAD. LIDERAZGO.'. Vacío en las otras piezas." },
            
            prompt_imagen: {
              type: "string",
              description: "EN INGLÉS, solo la composición — la tipografía ya va aparte en el campo 'tipografia', no la repitas. En 'logotipo': cómo se arma el bloque (el nombre en una o dos líneas, el filete, la posición del lema, el interletrado, alguna intervención sobre una letra). En 'isotipo': cómo se componen las dos iniciales entre sí (qué comparten, cómo se cruzan, si van encerradas). En 'lockup': una nota corta, es solo documentación — el sistema arma la pieza pegando las otras dos.",
            },
          },
          required: ["pieza", "concepto", "base", "style_tags", "hex", "paleta_idx", "prompt_imagen"],
        },
      },
      notas: { type: "string", description: "Qué información del cliente te faltó y qué asumiste. No inventes datos." },
    },
    required: ["modo_marca", "modo_marca_motivo", "nombre_marca", "territorio", "tipografia", "paletas", "logos"],
  },
} as const;

/**
 * Los formatos de corrida. `piezas` es cuántas se entregan; `imagenes` es cuántas se PAGAN — el
 * lockup de cada sistema se arma pegando las otras dos, así que sale gratis y al instante.
 */
export const FORMATOS: Record<string, { piezas: number; imagenes: number; rotulo: string }> = {
  sistema: { piezas: 3, imagenes: 2, rotulo: "Identidad completa (3 piezas)" },
  dos_direcciones: { piezas: 6, imagenes: 4, rotulo: "Las dos direcciones (2 identidades)" },
};

/**
 * El pedido del turno. Define qué piezas se piden y en qué orden — el orden importa de verdad,
 * porque el lockup se arma con las dos piezas que se generaron antes.
 */
export function construirPedido(formato: string, modoForzado: string): string {
  const base = modoForzado
    ? `El equipo ya decidió que la marca va por ${modoForzado === "equipo" ? "el NOMBRE DEL EQUIPO" : "la MARCA PERSONAL del líder"}. Usá ese modo_marca y no lo discutas.`
    : `Decidí vos si la marca va por marca personal o por nombre de equipo, según la evidencia.`;

  if (formato === "dos_direcciones") {
    return `${base}

No está claro sobre qué nombre quiere construir, así que proponé DOS SISTEMAS COMPLETOS para que el
equipo elija borrando, seis piezas en este orden exacto:

  1. logotipo  ┐
  2. isotipo   ├─ sistema A, base="persona" (el nombre del líder)
  3. lockup    ┘  (la arma el sistema, no la generes)
  4. logotipo  ┐
  5. isotipo   ├─ sistema B, base="equipo" (el nombre del equipo)
  6. lockup    ┘  (la arma el sistema, no la generes)

Dentro de cada sistema las tres piezas son LA MISMA marca: mismo color, mismas style_tags. La
tipografía, ojo, es UNA SOLA para toda la corrida (campo "tipografia"), así que si mostrás dos
direcciones, que se diferencien por el nombre y la composición, no por la familia tipográfica.
Y las 3 paletas.`;
  }

  return `${base}

Proponé UN sistema de identidad completo: tres piezas de la misma marca, en este orden exacto:

  1. pieza="logotipo" → el nombre completo escrito, en el estilo base de la casa (con su lema si
                        corresponde). Es la pieza ancla.
  2. pieza="isotipo"  → el monograma de las iniciales, en LA MISMA tipografía y con el mismo
                        tratamiento. No es un dibujo nuevo: es el logotipo comprimido.
  3. pieza="lockup"   → los dos juntos, en horizontal (esta la arma el sistema pegando las de
                        arriba: no se genera, no hay que describirla)

Las tres comparten base, hex, paleta_idx y style_tags: es una sola marca vista de tres maneras.
Y las 3 paletas.`;
}
