// Paleta de colores para notas. Tonos pasteles para que el contenido siga
// siendo legible. Cada color tiene un fondo claro + un border match.

export const NOTE_COLORS = {
  white:    { label: 'Blanco',   bg: '#FFFFFF', border: '#E5E7EB', dot: '#E5E7EB' },
  yellow:   { label: 'Amarillo', bg: '#FEF9C3', border: '#FDE68A', dot: '#EAB308' },
  amber:    { label: 'Naranja',  bg: '#FED7AA', border: '#FDBA74', dot: '#F97316' },
  rose:     { label: 'Rosa',     bg: '#FECDD3', border: '#FDA4AF', dot: '#F43F5E' },
  pink:     { label: 'Fucsia',   bg: '#FBCFE8', border: '#F9A8D4', dot: '#EC4899' },
  purple:   { label: 'Violeta',  bg: '#DDD6FE', border: '#C4B5FD', dot: '#8B5CF6' },
  blue:     { label: 'Azul',     bg: '#BFDBFE', border: '#93C5FD', dot: '#3B82F6' },
  cyan:     { label: 'Cian',     bg: '#A5F3FC', border: '#67E8F9', dot: '#06B6D4' },
  green:    { label: 'Verde',    bg: '#BBF7D0', border: '#86EFAC', dot: '#22C55E' },
  gray:     { label: 'Gris',     bg: '#E5E7EB', border: '#D1D5DB', dot: '#6B7280' },
};

export const NOTE_COLOR_KEYS = Object.keys(NOTE_COLORS);

export function getNoteColor(key) {
  return NOTE_COLORS[key] || NOTE_COLORS.white;
}
