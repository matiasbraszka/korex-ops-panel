// Tokens del design system Korex (los --mk-* de index.css), expuestos a JS.
// Son EXACTOS al prototipo "Portal Korex": si el prototipo dice
// var(--mk-blue-ops), acá es T.primary. Español neutro SIEMPRE (regla de Matías).
export const T = {
  bg: 'var(--mk-bg-panel)',            // fondo de app (#F7F8FA)
  card: '#FFFFFF',
  border: 'var(--mk-border)',
  borderSoft: '#EEF0F4',               // hairline interna de tarjetas (prototipo)
  ink: 'var(--mk-ink)',
  text: 'var(--mk-text)',
  textSoft: 'var(--mk-text-soft)',
  text2: 'var(--mk-text2)',
  text3: 'var(--mk-text3)',
  primary: 'var(--mk-blue-ops)',
  primaryInk: 'var(--mk-blue-ink)',
  primaryDark: 'var(--mk-blue-dark)',
  primarySoft: 'var(--mk-blue-bg)',
  primaryWash: 'var(--mk-blue-bg2)',
  green: 'var(--mk-green)',
  greenSoft: 'var(--mk-green-bg)',
  yellow: 'var(--mk-yellow)',
  red: 'var(--mk-red)',
  redSoft: 'var(--mk-red-bg)',
  orange: 'var(--mk-orange)',
  amberSoft: 'var(--mk-orange-bg)',
  purple: 'var(--mk-purple)',
  purpleSoft: 'var(--mk-purple-bg)',
  surface2: 'var(--mk-surface2)',
  surface3: 'var(--mk-surface3)',
  shadowSm: 'var(--shadow-sm)',
  shadowMd: 'var(--shadow-md)',
  shadowLg: 'var(--shadow-lg)',
};

// Títulos display (Montserrat 800 con tracking negativo, como el prototipo).
export const display = (size, ls = '-0.03em') => ({
  fontFamily: "'Montserrat', sans-serif", fontSize: size, fontWeight: 800,
  letterSpacing: ls, color: T.ink, lineHeight: 1.1,
});

// Tarjeta blanca del prototipo (radius 20-22, shadow-md).
export const cardStyle = {
  background: '#fff', borderRadius: 20, boxShadow: 'var(--shadow-md)',
};

// Etiqueta chiquita en mayúsculas (micro-títulos).
export const microLabel = (color = T.text3) => ({
  fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color,
});

// Botón grande primario (pill uppercase de los CTA).
export const bigBtn = (bg = T.primary, h = 48) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  width: '100%', border: 'none', borderRadius: 999, background: bg, color: '#fff',
  fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
  height: h, padding: '0 18px', cursor: 'pointer',
});

// Pill de estado (TE TOCA A TI · AL AIRE · FALTA · SUBIDO · NUEVO).
export const pill = (bg, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700,
  letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 11px', borderRadius: 999,
  background: bg, color, whiteSpace: 'nowrap', flex: 'none',
});
