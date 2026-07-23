import DOMPurify from 'dompurify';

// Sanitizador del DEL. Es el de las notas (components/notas/sanitize.js) PERO mas
// ancho: el DEL trae tablas, titulos h4-h6 y las marcas de imagen que las notas no
// necesitan. Se mantiene aparte para no aflojar la whitelist de las notas.
//
// Sigue prohibiendo lo peligroso: script, style, iframe, on*, javascript:. El html
// del DEL ya viene limpio de read_doc_rich; esto es la barrera del lado del panel,
// para el html que se pega o se escribe en el editor.
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'font',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'a',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'figure', 'figcaption', 'img',
];
// img/src permite pegar imágenes por link (y, desde la galería de Recursos).
// DOMPurify ya bloquea javascript: y data: peligrosos en src.
const ALLOWED_ATTR = ['href', 'target', 'rel', 'style', 'color', 'colspan', 'rowspan', 'src', 'alt', 'width'];

// El Apps Script (read_doc_rich) reemplaza cada imagen inline del Doc por un
// placeholder <figure data-drive-image="1">[imagen del documento]</figure>: la
// imagen real nunca se importa. En el panel/compartir eso se ve como un recuadro
// roto. Lo sacamos acá (una sola vez, en todas las vistas del DEL) y así sobrevive
// a los re-syncs. Las <figure> con imagen real (galería de Recursos) no llevan
// data-drive-image, así que no se tocan.
const stripDriveImagePlaceholders = (html) =>
  html.replace(/<figure\b[^>]*\bdata-drive-image\b[^>]*>[\s\S]*?<\/figure>/gi, '');

const enforceLinkSafety = (html) => {
  if (!html) return html;
  return html.replace(/<a\b([^>]*)>/gi, (match, attrs) => {
    const cleaned = attrs
      .replace(/\s*target\s*=\s*("[^"]*"|'[^']*'|\S+)/gi, '')
      .replace(/\s*rel\s*=\s*("[^"]*"|'[^']*'|\S+)/gi, '');
    return `<a${cleaned} target="_blank" rel="noopener noreferrer">`;
  });
};

export function sanitizeDelHtml(html) {
  if (!html) return '';
  const noPlaceholders = stripDriveImagePlaceholders(html);
  const clean = DOMPurify.sanitize(noPlaceholders, { ALLOWED_TAGS, ALLOWED_ATTR });
  return enforceLinkSafety(clean);
}
