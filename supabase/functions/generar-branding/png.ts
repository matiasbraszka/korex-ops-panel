// supabase/functions/generar-branding/png.ts
//
// Todo lo que toca píxeles. Sin dependencias nativas: upng-js es JS puro (~30 KB) y corre en
// Deno igual que en el edge runtime de Supabase. sharp no sirve acá (binario nativo de Node).
//
// POR QUÉ EXISTE ESTE ARCHIVO: el generador de imágenes no puede darte el MISMO logo en tres
// colores — tres llamadas dan tres logos distintos. Entonces se pide UNA sola imagen (la de
// color, con fondo transparente) y las versiones negro y blanco se derivan acá, por código.
//
// Funciona porque el PNG guarda el alfa SIN premultiplicar: un píxel del borde antialiaseado es
// (r,g,b, a=0.4) donde el alfa es la cobertura geométrica y el rgb es el color. Reemplazar el
// rgb dejando el alfa intacto da exactamente el mismo borde suave, en otro color. Es la
// operación "silueta" de toda la vida.
//
// Efecto lateral útil: si el generador deja un halo claro en los bordes (le pasa cuando compone
// sobre blanco y después extrae el alfa), al sobrescribir el rgb el halo desaparece solo.

import UPNG from "npm:upng-js@2.1.0";

export type Rgba = { w: number; h: number; rgba: Uint8Array };

export function decodePng(bytes: Uint8Array): Rgba {
  const img = UPNG.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
  return { w: img.width, h: img.height, rgba };
}

export function encodePng(rgba: Uint8Array, w: number, h: number): Uint8Array {
  // El 0 final = sin pérdida (RGBA de 8 bits). No cuantiza la paleta.
  return new Uint8Array(UPNG.encode([rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + rgba.byteLength)], w, h, 0));
}

/** Luminancia percibida, 0..1. */
const luma = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/**
 * Mata el polvillo casi invisible (alfa < 8). Sin esto, la versión BLANCA sobre un fondo oscuro
 * muestra una caja gris fantasma alrededor del logo.
 *
 * NO umbraliza el alfa más allá de eso: subir el umbral destruiría el antialiasing y devolvería
 * bordes dentados, que es exactamente lo que estamos tratando de preservar.
 */
export function limpiarAlfa(rgba: Uint8Array): void {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 8) rgba[i] = 0;
}

/**
 * Dos chequeos sobre el logo que vino del generador. No corrigen: informan, para decidir cómo
 * derivar las variantes y para poder avisar en el panel.
 *
 * - mono: ¿es de un solo matiz? Se cuantiza el hue de los píxeles opacos en 16 baldes; si más de
 *   un balde se lleva >10% del total, hay más de un color y aplastarlo a negro puede fundir
 *   detalles que se tocan.
 *
 * - whiteKnockout: ¿hay blanco OPACO en el interior? Es el caso peligroso: el modelo dibuja una
 *   letra con trazos blancos dentro de un círculo de color en vez de recortarla dejando
 *   transparencia. Al pasar a negro, ese blanco se vuelve negro y la letra DESAPARECE — queda un
 *   círculo liso. Se cuentan solo los píxeles claros que no tocan ninguna transparencia (o sea,
 *   interiores): un logo blanco entero no cuenta, porque ahí el blanco es la marca, no un hueco.
 */
export function analizarLogo({ w, h, rgba }: Rgba): { mono: boolean; whiteKnockout: boolean } {
  const baldes = new Array(16).fill(0);
  let opacos = 0, clarosInternos = 0;

  const alfaEn = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : rgba[(y * w + x) * 4 + 3]);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = rgba[i + 3];
      if (a < 128) continue;
      opacos++;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);

      // Hue en 16 baldes. Los grises (saturación baja) van todos al balde 0: si no, el ruido de
      // un logo negro con bordes suaves se repartiría entre todos los baldes y daría mono=false.
      let balde = 0;
      if (max - min > 24) {
        const d = max - min;
        let hue = 0;
        if (max === r) hue = ((g - b) / d + 6) % 6;
        else if (max === g) hue = (b - r) / d + 2;
        else hue = (r - g) / d + 4;
        balde = Math.min(15, Math.floor((hue / 6) * 16));
      }
      baldes[balde]++;

      // Claro y opaco: ¿es interior? (ninguno de los 4 vecinos es transparente)
      if (luma(r, g, b) > 0.9 && a > 240) {
        if (alfaEn(x - 1, y) > 128 && alfaEn(x + 1, y) > 128 && alfaEn(x, y - 1) > 128 && alfaEn(x, y + 1) > 128) {
          clarosInternos++;
        }
      }
    }
  }

  if (!opacos) return { mono: true, whiteKnockout: false };
  const conPeso = baldes.filter((n) => n / opacos > 0.1).length;
  return { mono: conPeso <= 1, whiteKnockout: clarosInternos / opacos > 0.02 };
}

/**
 * Devuelve el logo en un solo color, conservando el alfa (o sea, el antialiasing).
 *
 * Se usa para las TRES versiones, no sólo para negro y blanco: el generador de imágenes elige
 * el color por su cuenta y sale cualquiera (se pidió #2F6B3C y devolvió #385C57), así que la
 * versión "a color" también se pinta acá, con el hex exacto de la paleta. Pintar es determinista;
 * pedirle un color al generador, no.
 *
 * @param rgb  el color de la tinta.
 * @param keepKnockout  si el logo tiene blanco OPACO interior (ver analizarLogo), en vez de
 *   aplastar todo a un tono se reduce a DOS: lo claro toma `rgbClaro`. Así una letra recortada
 *   en blanco sigue leyéndose en la versión negra en vez de desaparecer.
 * @param rgbClaro  el segundo tono para el caso de arriba.
 */
export function recolorear(
  src: Uint8Array,
  rgb: [number, number, number],
  keepKnockout: boolean,
  rgbClaro: [number, number, number] = [255, 255, 255],
): Uint8Array {
  const out = new Uint8Array(src);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const c = keepKnockout && luma(out[i], out[i + 1], out[i + 2]) > 0.9 ? rgbClaro : rgb;
    out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2];
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// El PNG de la paleta
// ─────────────────────────────────────────────────────────────────────────────
//
// Necesita escribir texto (los códigos HEX) y cargar una fuente TTF en una edge function es el
// peor problema del asunto: son cientos de KB, o un fetch en runtime que puede fallar. Como los
// glifos que hacen falta son ~37, la fuente va acá abajo dibujada a mano en 5×7 píxeles.
// Escalada se ve como tipografía de píxel, que en un swatch de color lee como decisión de
// diseño y no como accidente.
//
// Igual, la fuente de verdad del dato NO es esta imagen: los HEX van también en el título del
// recurso y en meta.colors, y clients.brand_colors se escribe SIEMPRE desde meta.colors, nunca
// leyendo el PNG.

const FUENTE: Record<string, string> = {
  A: "01110/10001/10001/11111/10001/10001/10001", B: "11110/10001/10001/11110/10001/10001/11110",
  C: "01110/10001/10000/10000/10000/10001/01110", D: "11110/10001/10001/10001/10001/10001/11110",
  E: "11111/10000/10000/11110/10000/10000/11111", F: "11111/10000/10000/11110/10000/10000/10000",
  G: "01110/10001/10000/10111/10001/10001/01111", H: "10001/10001/10001/11111/10001/10001/10001",
  I: "01110/00100/00100/00100/00100/00100/01110", J: "00111/00010/00010/00010/00010/10010/01100",
  K: "10001/10010/10100/11000/10100/10010/10001", L: "10000/10000/10000/10000/10000/10000/11111",
  M: "10001/11011/10101/10101/10001/10001/10001", N: "10001/11001/10101/10011/10001/10001/10001",
  O: "01110/10001/10001/10001/10001/10001/01110", P: "11110/10001/10001/11110/10000/10000/10000",
  Q: "01110/10001/10001/10001/10101/10010/01101", R: "11110/10001/10001/11110/10100/10010/10001",
  S: "01111/10000/10000/01110/00001/00001/11110", T: "11111/00100/00100/00100/00100/00100/00100",
  U: "10001/10001/10001/10001/10001/10001/01110", V: "10001/10001/10001/10001/10001/01010/00100",
  W: "10001/10001/10001/10101/10101/11011/10001", X: "10001/01010/00100/00100/00100/01010/10001",
  Y: "10001/01010/00100/00100/00100/00100/00100", Z: "11111/00010/00100/00100/01000/10000/11111",
  "0": "01110/10011/10101/10101/11001/10001/01110", "1": "00100/01100/00100/00100/00100/00100/01110",
  "2": "01110/10001/00001/00110/01000/10000/11111", "3": "11111/00010/00100/00010/00001/10001/01110",
  "4": "00010/00110/01010/10010/11111/00010/00010", "5": "11111/10000/11110/00001/00001/10001/01110",
  "6": "00110/01000/10000/11110/10001/10001/01110", "7": "11111/00001/00010/00100/01000/01000/01000",
  "8": "01110/10001/10001/01110/10001/10001/01110", "9": "01110/10001/10001/01111/00001/00010/01100",
  "#": "01010/01010/11111/01010/11111/01010/01010", "+": "00000/00100/00100/11111/00100/00100/00000",
  "-": "00000/00000/00000/11111/00000/00000/00000", ".": "00000/00000/00000/00000/00000/01100/01100",
  " ": "00000/00000/00000/00000/00000/00000/00000",
};

type Lienzo = { w: number; h: number; px: Uint8Array };

const lienzo = (w: number, h: number): Lienzo => ({ w, h, px: new Uint8Array(w * h * 4) });

export function hexARgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rect(L: Lienzo, x0: number, y0: number, w: number, h: number, c: [number, number, number]) {
  for (let y = Math.max(0, y0); y < Math.min(L.h, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(L.w, x0 + w); x++) {
      const i = (y * L.w + x) * 4;
      L.px[i] = c[0]; L.px[i + 1] = c[1]; L.px[i + 2] = c[2]; L.px[i + 3] = 255;
    }
  }
}

/** Texto en la fuente bitmap. Devuelve el ancho usado, para poder encadenar. */
function texto(L: Lienzo, s: string, x0: number, y0: number, escala: number, c: [number, number, number]): number {
  // Sin acentos y en mayúscula: la fuente no tiene minúsculas ni diacríticos.
  const limpio = String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
  let x = x0;
  for (const ch of limpio) {
    const glifo = FUENTE[ch] ?? FUENTE[" "];
    const filas = glifo.split("/");
    for (let fy = 0; fy < filas.length; fy++) {
      for (let fx = 0; fx < filas[fy].length; fx++) {
        if (filas[fy][fx] === "1") rect(L, x + fx * escala, y0 + fy * escala, escala, escala, c);
      }
    }
    x += 6 * escala; // 5 de glifo + 1 de separación
  }
  return x - x0;
}

export type ColorPaleta = { hex: string; rol?: string; nombre?: string };

/**
 * Dibuja el swatch de una paleta: franja con el nombre arriba, y abajo una banda por color con
 * su rol y su HEX escritos encima, en blanco o casi-negro según cuán oscura sea la banda.
 */
export function dibujarPaleta(nombre: string, colores: ColorPaleta[]): Uint8Array {
  const W = 1600, H = 600, CABECERA = 200, PAD = 56;
  const L = lienzo(W, H);

  const lista = (colores || []).filter((c) => /^#?[0-9a-f]{6}$/i.test(String(c?.hex || "")));
  if (!lista.length) { rect(L, 0, 0, W, H, [245, 242, 236]); return encodePng(L.px, W, H); }

  // La cabecera usa el color neutro si hay uno declarado; si no, el más claro de la paleta.
  const neutro = lista.find((c) => String(c.rol || "").toLowerCase() === "neutro") ||
    [...lista].sort((a, b) => {
      const A = hexARgb(a.hex), B = hexARgb(b.hex);
      return luma(B[0], B[1], B[2]) - luma(A[0], A[1], A[2]);
    })[0];
  const fondo = hexARgb(neutro.hex);
  const tintaCabecera: [number, number, number] = luma(...fondo) < 0.55 ? [255, 255, 255] : [26, 29, 38];

  rect(L, 0, 0, W, CABECERA, fondo);
  texto(L, nombre || "Paleta", PAD, 70, 7, tintaCabecera);

  const ancho = Math.floor(W / lista.length);
  for (let i = 0; i < lista.length; i++) {
    const x = i * ancho;
    const w = i === lista.length - 1 ? W - x : ancho; // la última se come el redondeo
    const c = hexARgb(lista[i].hex);
    rect(L, x, CABECERA, w, H - CABECERA, c);
    const tinta: [number, number, number] = luma(...c) < 0.55 ? [255, 255, 255] : [26, 29, 38];
    texto(L, String(lista[i].rol || ""), x + 28, CABECERA + 44, 3, tinta);
    texto(L, String(lista[i].hex).toUpperCase(), x + 28, CABECERA + 96, 5, tinta);
    texto(L, String(lista[i].nombre || ""), x + 28, H - 74, 3, tinta);
  }

  // Separadores. Sin esto, dos zonas del mismo color quedan pegadas y parecen una sola: pasa
  // siempre que el neutro es una de las bandas, porque la cabecera usa justamente ese color.
  // Cada línea se pinta clara u oscura según los dos colores que separa, para que se vea igual
  // en una paleta clara que en una oscura.
  const separador = (a: [number, number, number], b: [number, number, number]): [number, number, number] =>
    (luma(...a) + luma(...b)) / 2 < 0.55 ? [255, 255, 255] : [26, 29, 38];

  rect(L, 0, CABECERA - 3, W, 3, separador(fondo, hexARgb(lista[0].hex)));
  for (let i = 1; i < lista.length; i++) {
    rect(L, i * ancho - 2, CABECERA, 3, H - CABECERA, separador(hexARgb(lista[i - 1].hex), hexARgb(lista[i].hex)));
  }

  return encodePng(L.px, W, H);
}
