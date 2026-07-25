// ─────────────────────────────────────────────────────────────────────────────
// Tokens propios del onboarding: MÁS CONTRASTE y LETRA MÁS GRANDE que el resto
// del portal.
//
// El portal se usa en ratos cortos; el onboarding son ~40-60 minutos seguidos de
// leer y escribir, muchas veces desde el celular, muchas veces con más de 60
// años, muchas veces al sol. Los grises del design system no alcanzan para eso:
//
//   --mk-text3 (#9CA3AF) sobre blanco →  2.5:1   ← ni siquiera pasa AA
//   --mk-text2 (#6B7280) sobre blanco →  4.8:1   ← pasa raspando
//   --mk-blue-ops (#5B7CF5) con texto blanco → 3.7:1  ← el botón principal FALLA
//
// Acá el piso es 6:1 para cualquier texto, y el gris más claro que existe es
// TO.meta. TO.faint es SOLO para adornos (separadores, iconos decorativos):
// nunca para algo que haya que leer.
//
// Todos los valores están medidos sobre blanco (#FFF) y sobre el fondo de app
// (#F7F8FA), que es donde vive el 100% del texto del onboarding.
// ─────────────────────────────────────────────────────────────────────────────

export const TO = {
  // ── Texto ──────────────────────────────────────────────────────────────────
  ink: '#0B0F17',        // 19.4:1 — títulos
  body: '#252B36',       // 14.2:1 — cuerpo, respuestas, opciones
  meta: '#525A6B',       // 6.8:1  — secundario. EL MÁS CLARO PERMITIDO PARA LEER
  faint: '#9CA3AF',      //         — solo adornos, nunca texto

  // ── Acentos con contraste suficiente para texto ────────────────────────────
  blue: '#1D4ED8',       // 6.6:1  — links y micro-títulos azules
  blueBtn: 'var(--mk-blue-dark)', // #4A67D8 → 5.0:1 con texto blanco
  amber: '#8A4B08',      // 6.4:1  — "te falta", avisos
  greenInk: '#0F6B37',   // 6.1:1  — "listo"
  redInk: '#B02020',     // 6.2:1  — errores

  // ── Superficies y líneas (más marcadas que las del portal) ─────────────────
  bg: 'var(--mk-bg-panel)',
  card: '#FFFFFF',
  line: '#D3D8E0',       // borde visible de verdad (el del portal es #E2E5EB)
  lineStrong: '#B4BCC9', // inputs y controles: el cliente tiene que ver dónde escribir
  fill: '#EDF0F4',       // relleno de barras vacías
  blueWash: '#EEF3FF',
  blueLine: '#C7D6FA',
  greenWash: '#E9F9EF',
  amberWash: '#FEF4E6',
  redWash: '#FDECEC',
};

// ── Escala tipográfica ───────────────────────────────────────────────────────
// Pensada para el celular primero. Nada por debajo de 15px es texto que el
// cliente tenga que leer para responder; 16px es además el piso obligatorio en
// cualquier campo, porque por debajo iOS hace zoom solo al enfocar.
export const F = {
  h1: 31,      // título de tramo / bienvenida
  h2: 26,      // título de celebración
  q: 23,       // enunciado de pregunta
  qChica: 18,  // enunciado cuando hay varias preguntas en la pantalla
  body: 17.5,  // cuerpo principal
  sub: 16.5,   // subtítulos y ayudas
  input: 17,   // lo que el cliente escribe
  meta: 15,    // semáforo, contadores, pies
  micro: 13.5, // etiquetas en mayúsculas
};

/** Título display del onboarding (Montserrat 800, tinta máxima). */
export const dsp = (size = F.h1, ls = '-0.03em') => ({
  fontFamily: "'Montserrat', sans-serif", fontSize: size, fontWeight: 800,
  letterSpacing: ls, color: TO.ink, lineHeight: 1.14,
});

/** Etiqueta en mayúsculas. 12px es el piso: por debajo el tracking la vuelve ilegible. */
export const label = (color = TO.meta) => ({
  fontSize: 12, fontWeight: 800, letterSpacing: '0.1em',
  textTransform: 'uppercase', color,
});

/**
 * Botón principal. Cambia dos cosas respecto del bigBtn del portal:
 *   · el azul es --mk-blue-dark, no --mk-blue-ops (3.7:1 con blanco no pasa AA)
 *   · el texto va a 13.5px, no 12px
 */
export const btn = (bg = TO.blueBtn, h = 54) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  width: '100%', border: 'none', borderRadius: 999, background: bg, color: '#fff',
  fontSize: 13.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase',
  height: h, padding: '0 18px', cursor: 'pointer',
});

/** Botón secundario de texto (Continuar más tarde, Igual quiero seguir…). */
export const btnTexto = {
  display: 'block', width: '100%', marginTop: 14, background: 'none', border: 'none',
  padding: '12px 0', cursor: 'pointer', fontSize: 16, fontWeight: 600, color: TO.meta,
  textDecoration: 'underline', textUnderlineOffset: 4,
};

/** Pastilla de estado con contraste de texto real. */
export const chip = (bg, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 800,
  letterSpacing: '0.06em', textTransform: 'uppercase', padding: '7px 12px', borderRadius: 999,
  background: bg, color, whiteSpace: 'nowrap', flex: 'none',
});

/** Tarjeta blanca del onboarding: borde visible además de la sombra. */
export const card = {
  background: TO.card, borderRadius: 20,
  border: `1px solid ${TO.line}`, boxShadow: 'var(--shadow-sm)',
};
