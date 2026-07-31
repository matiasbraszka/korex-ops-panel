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

Además, el 90% de las marcas de este rubro se parecen entre sí: dorado, degradados, flechas
para arriba, globos terráqueos, apretones de manos. Todo eso lee como "esquema" y le resta
autoridad al líder. Tu trabajo es que su marca parezca la de un profesional serio.

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
intensidades. Cada una tiene que poder sostener sola toda la identidad. Cuatro colores por
paleta, uno por rol: principal, secundario, acento, neutro. El neutro es un fondo (claro o muy
oscuro), no un gris medio. El acento se usa poco y tiene que contrastar de verdad contra el
principal. Respetá la ficha del nicho: está para eso.

CÓMO PENSÁS LOS LOGOS
Profesional y minimalista, siempre. El logo tiene que:
- Funcionar A UNA SOLA TINTA. Es un requisito duro, no una preferencia: de cada logo se derivan
  después una versión negra y una blanca. Un color plano sobre transparencia. Nada de degradados,
  nada de sombras, nada de blancos pintados (el espacio negativo es transparencia real).
- Leerse a 24 píxeles de alto (foto de perfil) y en un cartel grande.
- No parecerse a los otros conceptos que propongas. Si te piden tres, que sean tres FAMILIAS
  distintas, no el mismo símbolo rotado.
- Evitar los clichés del rubro y los que la ficha del nicho marque como prohibidos.

En prompt_imagen describís SOLO LA FORMA, en inglés, con precisión de diseñador: qué elemento,
qué geometría, qué peso de trazo, qué proporción, qué composición. No menciones colores, fondo,
transparencia, formato ni mockups: todo eso lo agrega el sistema después. No pidas texto salvo
que el tipo de logo lo lleve.

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
  "Clean precise geometry. Professional and minimal. Must read clearly at small size and print at one ink.",
].join(" ");

export function construirPromptImagen(logo: Record<string, unknown>, nombreMarca: string): string {
  const tipo = String(logo?.tipo || "");
  const llevaTexto = tipo === "logotipo" || tipo === "imagotipo";
  const clausulaTexto = llevaTexto
    ? ` The only text in the image is exactly: "${nombreMarca}". Spell it exactly like that, letter by letter. No tagline, no extra words, no additional letters.`
    : " No text, no letters, no numbers, no words anywhere in the image.";
  return `${String(logo?.prompt_imagen || "").trim()} ${SUFFIX_IMAGEN}${clausulaTexto}`;
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
              minItems: 4,
              maxItems: 4,
              description: "EXACTAMENTE 4 colores, uno por rol, en este orden: principal, secundario, acento, neutro. Los 4 HEX tienen que ser DISTINTOS entre sí: repetir uno deja la paleta con tres colores útiles.",
              items: {
                type: "object",
                properties: {
                  hex: { type: "string", description: "HEX de 6 dígitos, en mayúsculas, con numeral. Ej: '#0B1E3F'." },
                  rol: { type: "string", enum: ["principal", "secundario", "acento", "neutro"] },
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
        description: "Un concepto por cada logo pedido, en el orden en que se pidieron. Cada uno de una familia visual distinta.",
        items: {
          type: "object",
          properties: {
            concepto: { type: "string", description: "Qué es el logo, en castellano y en una frase concreta. Ej: 'monograma MK donde la K se forma con el contragolpe de la M, trazo continuo de peso uniforme'." },
            base: { type: "string", enum: ["persona", "equipo"], description: "Sobre qué nombre está construido ESTE logo." },
            tipo: { type: "string", enum: ["monograma", "logotipo", "isotipo", "imagotipo"], description: "monograma = iniciales. logotipo = el nombre escrito. isotipo = símbolo sin texto. imagotipo = símbolo + nombre." },
            style_tags: {
              type: "array",
              minItems: 3,
              maxItems: 6,
              items: { type: "string" },
              description: "Etiquetas cortas en minúscula que describan la familia visual, para poder comparar entre corridas. Ej: ['monograma','geometrico','trazo-fino','angulo-recto'].",
            },
            hex: { type: "string", description: "UN SOLO color, tomado de la paleta indicada en paleta_idx. El logo es monocromático." },
            paleta_idx: { type: "number", description: "Número 1, 2 o 3: de qué paleta sale el color." },
            prompt_imagen: { type: "string", description: "El prompt para el generador de imagen, EN INGLÉS, describiendo solo la forma del logo." },
          },
          required: ["concepto", "base", "tipo", "style_tags", "hex", "paleta_idx", "prompt_imagen"],
        },
      },
      notas: { type: "string", description: "Qué información del cliente te faltó y qué asumiste. No inventes datos." },
    },
    required: ["modo_marca", "modo_marca_motivo", "nombre_marca", "territorio", "paletas", "logos"],
  },
} as const;

/**
 * El pedido del turno. Define cuántos logos y, sobre todo, CÓMO se reparten cuando no está claro
 * si el cliente quiere marca personal o de equipo: en ese caso el equipo de Korex quiere ver las
 * dos opciones sobre la mesa para poder elegir borrando.
 */
export function construirPedido(nLogos: number, modoForzado: string): string {
  const base = modoForzado
    ? `El equipo ya decidió que la marca va por ${modoForzado === "equipo" ? "el NOMBRE DEL EQUIPO" : "la MARCA PERSONAL del líder"}. Usá ese modo_marca y no lo discutas.`
    : `Decidí vos si la marca va por marca personal o por nombre de equipo, según la evidencia.`;

  if (nLogos <= 1) {
    return `${base}

Proponé UN solo concepto de logo: el que veas más sólido para este cliente. Y las 3 paletas.`;
  }

  return `${base}

Proponé ${nLogos} conceptos de logo, repartidos así:

- Si tenés CLARO sobre qué quiere construir la marca (porque lo dijo o porque la evidencia es
  contundente), los ${nLogos} conceptos van todos en esa dirección, explorando familias visuales
  distintas entre sí.

- Si NO está claro, mostrale las dos opciones al equipo para que elija:
  · logo 1 → construido sobre la MARCA PERSONAL (el nombre del líder)
  · logo 2 → construido sobre el NOMBRE DEL EQUIPO
  · logo ${nLogos > 2 ? "3" : "3"} → una segunda versión, en otra familia visual, del que vos veas más sólido de los dos.
  ${nLogos > 3 ? `· los conceptos restantes → seguí alternando, priorizando el más sólido.` : ""}

Marcá en el campo "base" de cada logo sobre qué nombre está construido. Y las 3 paletas.`;
}
