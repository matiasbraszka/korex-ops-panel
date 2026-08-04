import DOMPurify from 'dompurify';

// Las notas usan el MISMO editor que el DEL (documento tipo Google Docs), así que
// el whitelist acompaña: además de texto formateado (títulos, negrita, listas,
// links) entran tablas, imágenes y divisores.
//
// Sigue prohibido todo lo peligroso: <script>, <style>, <iframe>, atributos on*
// y URLs javascript:. Cualquier otra cosa se descarta.
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'div', 'span', 'font',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'a', 'hr',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'figure', 'figcaption', 'img',
];
// 'style'/'color' habilitan el color de letra y las cajas. DOMPurify sanitiza el
// CSS de style (descarta url()/expression()/javascript: peligrosos) y bloquea
// javascript:/data: peligrosos en src, así que es seguro.
const ALLOWED_ATTR = ['href', 'target', 'rel', 'style', 'color', 'colspan', 'rowspan', 'src', 'alt', 'width'];

// Forzamos target/rel seguros en cualquier <a>.
const enforceLinkSafety = (html) => {
  if (!html) return html;
  return html.replace(/<a\b([^>]*)>/gi, (match, attrs) => {
    const cleaned = attrs
      .replace(/\s*target\s*=\s*("[^"]*"|'[^']*'|\S+)/gi, '')
      .replace(/\s*rel\s*=\s*("[^"]*"|'[^']*'|\S+)/gi, '');
    return `<a${cleaned} target="_blank" rel="noopener noreferrer">`;
  });
};

export function sanitizeNoteHtml(html) {
  if (!html) return '';
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
  return enforceLinkSafety(clean);
}

// Para indexar/buscar y mostrar previews: convierte HTML a texto plano.
export function htmlToPlainText(html) {
  if (!html) return '';
  const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // Reemplazar entidades comunes
  return stripped
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
