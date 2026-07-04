// Parser del _chat.txt exportado por WhatsApp (formato "con archivos multimedia").
//
// Idea clave: WhatsApp ya deja el chat en orden cronológico y referencia cada
// adjunto por su nombre exacto, incrustado en la línea del mensaje, p. ej.:
//   ‎[13/10/25, 6:24:05 p. m.] Brand: ‎<adjunto: 00000028-AUDIO-2025-10-13-...opus>
// Así que NO hay que reordenar: solo detectar cada marcador y reemplazarlo por
// la transcripción del audio/video en su lugar.
//
// Módulo puro (sin React ni APIs del navegador) para poder testearlo con Node.

// Caracteres de formato invisibles que WhatsApp mete al inicio de línea y antes
// de los adjuntos (LTR/RTL marks). Los limpiamos para poder matchear/mostrar.
const INVISIBLES = /[‎‏‪-‮⁦-⁩]/g;
export const stripInvisibles = (s) => (s || '').replace(INVISIBLES, '');

// Una línea es "inicio de mensaje" si (tras las marcas invisibles) arranca con
// [fecha, hora] Remitente:  — la fecha/hora quedan capturadas dentro de [...],
// y el remitente es todo hasta el primer ": " (colon + espacio o fin).
// Ej válidos: "[13/10/25, 6:24:05 p. m.] Matias Braszka: hola"
//             "[22/12/25, 10:03:55 a. m.] Grupo Korex : ‎Creaste el grupo"
const MSG_START = /^\[([^\]]+)\]\s+(.*?):\s?(.*)$/s;

// Detecta el marcador de adjunto con archivo:  <adjunto: NOMBRE>  /  <attached: NOMBRE>
// (WhatsApp usa "adjunto" en español y "attached" en inglés).
const ATTACH_RE = /<(?:adjunto|attached):\s*([^>]+?)>/i;

// Detecta media OMITIDA (export sin ese archivo): "audio omitido", "imagen omitida",
// "video omitido", "sticker omitido", "‎<Multimedia omitido>", etc. Solo si el
// mensaje NO trae nombre de archivo.
const OMITTED_RE = /\b(audio|imagen|video|v[íi]deo|sticker|gif|documento|multimedia|foto)\s+omitid[oa]s?\b/i;

// Clasifica un adjunto por su nombre. Los tokens -AUDIO- / -PHOTO- / -VIDEO- que
// pone WhatsApp son en inglés en cualquier idioma; caemos a la extensión si no.
const AUDIO_EXT = ['opus', 'ogg', 'mp3', 'm4a', 'aac', 'wav', 'amr', 'oga'];
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'];
const VIDEO_EXT = ['mp4', '3gp', 'mov', 'mkv', 'avi', 'webm'];

export function kindOfFile(filename) {
  const name = (filename || '').toUpperCase();
  if (name.includes('-AUDIO-') || name.includes('-PTT-')) return 'audio';
  if (name.includes('-PHOTO-') || name.includes('-IMAGE-')) return 'image';
  if (name.includes('-VIDEO-') || name.includes('-GIF-')) return 'video';
  const ext = (filename || '').split('.').pop().toLowerCase();
  if (AUDIO_EXT.includes(ext)) return 'audio';
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (VIDEO_EXT.includes(ext)) return 'video';
  return 'document';
}

// Clasifica media omitida (sin archivo) por la palabra usada.
function omittedKind(body) {
  const m = body.match(OMITTED_RE);
  if (!m) return null;
  const w = m[1].toLowerCase();
  if (w === 'audio') return 'audio';
  if (w === 'imagen' || w === 'foto') return 'image';
  if (w === 'video' || w === 'vídeo' || w === 'video') return 'video';
  if (w === 'sticker' || w === 'gif') return 'image';
  return 'other';
}

/**
 * Parsea el texto completo de un _chat.txt.
 * @returns {{ messages: Array, mediaFiles: Array<{filename:string, kind:string}> }}
 *   messages: [{ ts, sender, body, attachment:{filename,kind}|null, omitted:kind|null }]
 *   mediaFiles: adjuntos con archivo (audio/video/image/document), únicos, en orden.
 */
export function parseChat(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const messages = [];
  let cur = null;

  const flush = () => { if (cur) messages.push(finalizeMessage(cur)); cur = null; };

  for (const rawLine of lines) {
    const line = stripInvisibles(rawLine);
    const m = line.match(MSG_START);
    if (m) {
      flush();
      cur = { ts: m[1].trim(), sender: m[2].trim(), body: m[3] };
    } else if (cur) {
      // Línea de continuación del mensaje anterior (mensajes multilínea).
      cur.body += '\n' + line;
    }
    // Si no hay mensaje abierto y la línea no matchea, se ignora (cabeceras raras).
  }
  flush();

  const mediaFiles = [];
  const seen = new Set();
  for (const msg of messages) {
    if (msg.attachment && !seen.has(msg.attachment.filename)) {
      seen.add(msg.attachment.filename);
      mediaFiles.push({ ...msg.attachment });
    }
  }
  return { messages, mediaFiles };
}

function finalizeMessage(cur) {
  const body = cur.body;
  const att = body.match(ATTACH_RE);
  let attachment = null;
  let omitted = null;
  if (att) {
    const filename = att[1].trim();
    attachment = { filename, kind: kindOfFile(filename) };
  } else {
    omitted = omittedKind(body);
  }
  return { ts: cur.ts, sender: cur.sender, body, attachment, omitted };
}

// ── Ensamblado del texto final ────────────────────────────────────────────────

const ICON = { audio: '🎤', video: '🎬', image: '📷', document: '📎' };

// Cómo renderizar cada tipo de media en el texto final.
function renderAttachment(att, transcripts) {
  const { filename, kind } = att;
  if (kind === 'image') return `${ICON.image} [Imagen]`;
  if (kind === 'document') return `${ICON.document} [Documento: ${filename}]`;

  // audio / video → buscar transcripción
  const t = transcripts?.[filename];
  if (kind === 'audio') {
    if (!t) return `${ICON.audio} [Audio no disponible]`;
    if (t.error) return `${ICON.audio} [Audio — no se pudo transcribir: ${t.error}]`;
    const text = (t.text || '').trim();
    return text ? `${ICON.audio} [Audio] ${text}` : `${ICON.audio} [Audio sin voz]`;
  }
  // video
  if (!t) return `${ICON.video} [Video no transcrito]`;
  if (t.error) return `${ICON.video} [Video — no se pudo transcribir: ${t.error}]`;
  const vtext = (t.text || '').trim();
  return vtext ? `${ICON.video} [Video] ${vtext}` : `${ICON.video} [Video sin audio hablado]`;
}

function renderOmitted(kind) {
  if (kind === 'audio') return `${ICON.audio} [Audio no incluido en la exportación]`;
  if (kind === 'image') return `${ICON.image} [Imagen no incluida en la exportación]`;
  if (kind === 'video') return `${ICON.video} [Video no incluido en la exportación]`;
  return '[Multimedia no incluido en la exportación]';
}

/**
 * Reconstruye el chat como texto plano, reemplazando cada adjunto por su
 * transcripción (o marcador) en su lugar cronológico exacto.
 * @param {Array} messages  salida de parseChat().messages
 * @param {Object} transcripts  mapa { filename: { text } | { error } }
 * @returns {string}
 */
export function assembleTranscript(messages, transcripts = {}) {
  const out = [];
  for (const msg of messages) {
    let renderedBody;
    if (msg.attachment) {
      const rep = renderAttachment(msg.attachment, transcripts);
      // Reemplaza el marcador in-situ (respeta texto que venga en la misma línea).
      renderedBody = stripInvisibles(msg.body).replace(ATTACH_RE, rep).trim();
    } else if (msg.omitted) {
      renderedBody = renderOmitted(msg.omitted);
    } else {
      renderedBody = stripInvisibles(msg.body).trim();
    }
    out.push(`[${msg.ts}] ${msg.sender}: ${renderedBody}`);
  }
  return out.join('\n');
}

// Conteo rápido por tipo (para la UI: "27 audios, 6 videos, 19 fotos…").
export function countMedia(messages) {
  const c = { audio: 0, video: 0, image: 0, document: 0, omitted: 0 };
  for (const m of messages) {
    if (m.attachment) c[m.attachment.kind] = (c[m.attachment.kind] || 0) + 1;
    else if (m.omitted) c.omitted += 1;
  }
  return c;
}
