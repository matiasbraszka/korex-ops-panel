import DOMPurify from 'dompurify';

// Whitelist intencionalmente estrecho. No permitimos <script>, <style>, <iframe>,
// <img>, on* handlers, ni javascript: URLs. Las notas son texto formateado
// (titulos, negrita, subrayado, listas, links). Cualquier otra cosa se descarta.
const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'div'];
const ALLOWED_ATTR = ['href', 'target', 'rel'];

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
