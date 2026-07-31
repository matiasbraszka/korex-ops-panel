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

LAS TRES PIEZAS DE UNA IDENTIDAD
No entregás logos sueltos que compiten: entregás UNA marca en tres piezas que conviven. Es el
mismo símbolo y el mismo nombre vistos en los tres formatos que se usan en la práctica.

1. ISOTIPO — el símbolo solo, sin una sola letra. Es la foto de perfil, el favicon, el sello.
   Tiene que funcionar solo, encerrado en un círculo de 24 píxeles.
2. LOGOTIPO — el nombre escrito, con carácter tipográfico. Es la firma, el cierre de video.
   Acá SÍ puede ir un lema de tres conceptos.
3. LOCKUP — el isotipo y la tipografía juntos, en horizontal: símbolo a la izquierda, nombre a la
   derecha. Es el formato más versátil (web, landing, tarjeta, anuncio) y el que más se usa.

LA PIEZA 3 NO SE DIBUJA: el sistema la arma pegando la 1 y la 2, a la misma altura y con el aire
justo. O sea que el lockup va a ser literalmente tu símbolo al lado de tu tipografía. Dos
consecuencias para vos:
 · El símbolo tiene que aguantar las dos escalas: grande y solo, y chico al lado de un nombre.
 · El logotipo tiene que poder convivir con el símbolo a su izquierda. Si el logotipo ya trae un
   adorno a la izquierda del nombre, el lockup queda cargado.

CÓMO PENSÁS LOS LOGOS

El logo tiene que tener CARÁCTER. El error más caro es entregar una inicial pelada dentro de un
círculo: es lo que sale por defecto cuando uno se refugia en "minimalista", y no es una marca, es
un placeholder. Si el concepto se puede describir como "la letra X" y nada más, no sirve.

Que sea limpio no quiere decir que sea pobre. Un monograma con dos letras entrelazadas de verdad,
un contragolpe que forma una segunda figura, una intervención geométrica precisa sobre una letra,
un sello con marco: todo eso es limpio Y tiene carácter.

Mirá el campo "TIPO DE LOGO" de la ficha del nicho: dice qué formato y qué nivel de elaboración
usa esta agencia en la práctica. Respetalo — está sacado del branding real de sus clientes, no de
un manual.

Reglas duras:
- UNA SOLA TINTA. No es una preferencia: de cada logo se derivan después una versión negra y una
  blanca. Un color plano sobre transparencia, sin degradados, sin sombras, y sin blancos pintados
  (el espacio negativo tiene que ser transparencia real). El color final lo aplica el sistema.
- Tiene que leerse a 24 píxeles de alto (foto de perfil) y también en un cartel grande.
- Si te piden DOS sistemas (uno por nombre), que sean familias visuales distintas entre sí. Dentro
  de un mismo sistema, en cambio, las tres piezas son la MISMA marca: no varíes el símbolo.
- Nada de los símbolos que la ficha del nicho marque como prohibidos.

SOBRE EL NOMBRE Y EL LEMA
Cuando la marca es personal y el líder tiene historia propia, el nombre completo escrito funciona
mejor que las iniciales: es lo que hace la agencia en esos casos. El logotipo con el nombre entero,
en tipografía de carácter y con buen interletrado, es una opción de primera — no el premio consuelo
del monograma.

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

/** Rótulos de las tres piezas, para títulos de recurso y para la UI. */
export const PIEZAS: Record<string, { rotulo: string; orden: number }> = {
  isotipo: { rotulo: "Isotipo", orden: 1 },
  logotipo: { rotulo: "Logotipo", orden: 2 },
  lockup: { rotulo: "Isotipo + tipografía", orden: 3 },
};

/**
 * Prompt de imagen de una pieza. Solo aplica al isotipo y al logotipo: el lockup no se le pide al
 * generador, se arma pegando esos dos (ver componerLockup en png.ts).
 */
export function construirPromptImagen(logo: Record<string, unknown>, nombreMarca: string): string {
  const pieza = String(logo?.pieza || "isotipo");
  const forma = String(logo?.prompt_imagen || "").trim();

  if (pieza === "logotipo") {
    const tagline = String(logo?.tagline || "").trim();
    const texto = tagline
      ? ` The image contains exactly two lines of text and nothing else: the name "${nombreMarca}" as the main wordmark, and below it, much smaller and widely letter-spaced, the line "${tagline}". Spell both exactly like that, letter by letter, including every accent and every period. No other words, no trailing punctuation.`
      : ` The only text in the image is exactly: "${nombreMarca}". Spell it exactly like that, letter by letter, including every accent. No tagline, no extra words, no additional letters.`;
    return `Typographic wordmark logo. ${forma} ${SUFFIX_IMAGEN}${texto}`;
  }

  return `${forma} The symbol is centered and fills most of the square canvas. ${SUFFIX_IMAGEN} No text, no letters, no numbers, no words anywhere in the image.`;
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
              enum: ["isotipo", "logotipo", "lockup"],
              description: "isotipo = el símbolo solo, sin letras. logotipo = el nombre escrito, sin símbolo. lockup = el símbolo del isotipo + el nombre, en horizontal.",
            },
            concepto: { type: "string", description: "Qué es esta pieza, en castellano y en una frase concreta. Ej: 'dos hojas lanceoladas que giran sobre un eje común y dejan una gota en el contragolpe'." },
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
              description: "EN INGLÉS, solo la forma. En 'isotipo': describí el símbolo. En 'logotipo': describí el tratamiento tipográfico del nombre (qué familia, qué peso, qué intervención). En 'lockup': dejá una nota corta de cómo ves la relación entre símbolo y nombre; es solo documentación, el sistema arma la pieza pegando las otras dos.",
            },
          },
          required: ["pieza", "concepto", "base", "style_tags", "hex", "paleta_idx", "prompt_imagen"],
        },
      },
      notas: { type: "string", description: "Qué información del cliente te faltó y qué asumiste. No inventes datos." },
    },
    required: ["modo_marca", "modo_marca_motivo", "nombre_marca", "territorio", "paletas", "logos"],
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

  1. isotipo   ┐
  2. logotipo  ├─ sistema A, base="persona" (el nombre del líder)
  3. lockup    ┘  (la arma el sistema, no la generes)
  4. isotipo   ┐
  5. logotipo  ├─ sistema B, base="equipo" (el nombre del equipo)
  6. lockup    ┘

Dentro de cada sistema las tres piezas son LA MISMA marca: mismo símbolo, mismo color, mismas
style_tags. Entre los dos sistemas, en cambio, que sean familias visuales bien distintas.
Y las 3 paletas.`;
  }

  return `${base}

Proponé UN sistema de identidad completo: tres piezas de la misma marca, en este orden exacto:

  1. pieza="isotipo"  → el símbolo solo, sin una letra
  2. pieza="logotipo" → el nombre escrito, sin símbolo (acá puede ir el lema)
  3. pieza="lockup"   → el símbolo de la pieza 1 + el nombre, en horizontal (esta la arma el
                        sistema pegando las dos de arriba: no se genera, no hay que describirla)

Las tres comparten base, hex, paleta_idx y style_tags: es una sola marca vista de tres maneras.
Y las 3 paletas.`;
}
