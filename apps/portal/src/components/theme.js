// Tokens y mini-componentes del diseño nuevo del portal (prototipo "Portal Korex"):
// fondo gris claro, tarjetas blancas redondeadas, índigo primario, pills en
// mayúsculas y botones grandes. Español neutro SIEMPRE (regla de Matías).
export const T = {
  bg: '#F4F5F9',
  card: '#FFFFFF',
  border: '#E8EAF0',
  ink: '#171B26',
  text: '#4B5563',
  text2: '#6B7280',
  text3: '#9AA1AE',
  primary: '#5B67F2',
  primarySoft: '#EEF0FE',
  green: '#16A34A',
  greenSoft: '#E8F9EF',
  red: '#DC2626',
  redSoft: '#FDEDED',
  orange: '#EA7317',
  amberSoft: '#FEF6E7',
};

export const cardStyle = {
  background: T.card, border: `1px solid ${T.border}`, borderRadius: 18,
  boxShadow: '0 1px 2px rgba(16,24,40,.04), 0 6px 18px rgba(16,24,40,.04)',
};

// Etiqueta chiquita en mayúsculas (los micro-títulos del prototipo).
export const microLabel = (color = T.text3) => ({
  fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color,
});

// Botón grande primario (los CTA "ABRIR MIS GUIONES", "SUBIR MATERIAL"...).
export const bigBtn = (bg = T.primary) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  width: '100%', border: 'none', borderRadius: 999, background: bg, color: '#fff',
  fontSize: 12.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
  padding: '14px 18px', cursor: 'pointer',
});

// Pill de estado (TE TOCA A TI · AL AIRE · FALTA · SUBIDO · NUEVO).
export const pill = (bg, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800,
  letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999,
  background: bg, color, whiteSpace: 'nowrap',
});
