// ─────────────────────────────────────────────────────────────────────────────
// Los valores exactos del HTML que entregó Matías. No son una interpretación:
// están copiados del prototipo para que lo que ve el cliente sea idéntico a lo
// que él aprobó.
//
// Sobre el gris más claro (T.faint, #9CA3AF): sobre blanco da 2.5:1, muy por
// debajo del mínimo legible. En el prototipo aparece solo en metadatos —el
// contador de pasos, el tamaño de un archivo, un "opcional"— y ahí está bien,
// porque son adornos que nadie necesita leer. NO usarlo para el texto de una
// pregunta, una ayuda o un ejemplo: para eso está T.soft (#3F4653, 9.7:1).
// ─────────────────────────────────────────────────────────────────────────────

export const T = {
  // Superficies
  bg:        '#F7F8FA',   // el fondo de la página
  card:      '#FFFFFF',
  fill:      '#F0F2F5',   // hover, tracks de barra
  fill2:     '#E8EBF0',
  dark:      '#0D1117',   // portadas de paso, tarjetas informativas, grabador

  // Bordes
  line:      '#E2E5EB',
  lineFuerte:'#D0D5DD',
  lineTrazo: '#C7CDDA',   // el punteado del dropzone

  // Texto
  ink:       '#1A1D26',   // 15.8:1
  soft:      '#3F4653',   //  9.7:1 — el cuerpo
  muted:     '#6B7280',   //  5.3:1 — secundario
  faint:     '#9CA3AF',   //  2.5:1 — SOLO adornos

  // Azules
  azul:      '#5B7CF5',   // el primario de la interfaz
  azulHover: '#4A67D8',
  azulClaro: '#7B9AFF',
  azulMarca: '#4878FF',   // el de la marca, sobre fondo oscuro
  azulTinta: '#4A67D8',   // azul legible sobre blanco
  azulWash:  '#EEF2FF',
  azulWash2: '#F5F7FF',
  azulLinea: '#DDE4FF',
  azulPalido:'#C7CFF0',   // el "Continuar" cuando todavía falta algo

  // Semánticos
  verde:     '#22C55E',
  verdeWash: '#ECFDF5',
  verdeLinea:'#BBF7D0',
  verdeTinta:'#15803D',
  ambar:     '#EAB308',
  ambarWash: '#FEFCE8',
  ambarTinta:'#B45309',
  rojo:      '#EF4444',
};

export const FUENTE = {
  display: "'Montserrat', sans-serif",
  ui: "'Inter', -apple-system, sans-serif",
};

/** Título de display. `size` acepta un clamp() completo. */
export const dsp = (size, peso = 800, ls = '-.03em') => ({
  fontFamily: FUENTE.display,
  fontSize: size,
  fontWeight: peso,
  letterSpacing: ls,
  lineHeight: 1.08,
  margin: 0,
});

/** El micro-título en mayúsculas que separa secciones. */
export const kicker = (color = T.faint, size = 11) => ({
  fontSize: size,
  fontWeight: 700,
  letterSpacing: '.12em',
  textTransform: 'uppercase',
  color,
});

/** El botón primario: píldora azul, mayúsculas, ancho completo. */
export const btn = (activo = true) => ({
  width: '100%',
  height: 52,
  borderRadius: 999,
  border: 'none',
  cursor: 'pointer',
  fontSize: 'clamp(12px,3.2vw,13.5px)',
  fontWeight: 800,
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 9,
  transition: 'background .15s',
  background: activo ? T.azul : T.azulPalido,
  color: '#fff',
});

/** Campos de texto. 16px es el piso: menos dispara el zoom automático de iOS. */
export const input = {
  width: '100%',
  border: `1px solid ${T.lineFuerte}`,
  borderRadius: 14,
  padding: '15px 17px',
  fontSize: 16,
  color: T.ink,
  background: '#fff',
  outline: 'none',
};

export const textarea = {
  ...input,
  borderRadius: 16,
  fontSize: 15,
  lineHeight: 1.6,
  resize: 'vertical',
  display: 'block',
};

export const tarjeta = {
  background: '#fff',
  border: `1px solid ${T.line}`,
  borderRadius: 14,
};
