// Render de las respuestas de los agentes. El chat las mostraba con whitespace-pre-wrap,
// o sea que un "## Ángulo 1" o un "**hook**" se veían con los asteriscos crudos.
//
// Dos capas:
//   1. Markdown base (H1-H3, listas, tablas, citas, código, separadores) — igual para todos.
//   2. Realce semántico por agente: las etiquetas propias del oficio (Hook, Texto base,
//      Ángulo…) y las secciones del VSL se pintan solas, sin que el agente tenga que
//      saber de HTML.
//
// El texto viene de un LLM, así que SIEMPRE pasa por DOMPurify antes de inyectarse.
import { useMemo } from 'react';
import DOMPurify from 'dompurify';

// Acento por agente: le da identidad visual a cada uno sin cambiar el layout.
export const AGENT_ACCENT = {
  anuncios: { c: '#5B7CF6', bg: '#EEF2FF', bg2: '#F5F7FF' },
  vsl: { c: '#8B5CF6', bg: '#F5F3FF', bg2: '#FAF9FF' },
  landing: { c: '#06B6D4', bg: '#ECFEFF', bg2: '#F5FDFF' },
  formularios: { c: '#F97316', bg: '#FFF7ED', bg2: '#FFFBF5' },
  auditor: { c: '#22C55E', bg: '#ECFDF5', bg2: '#F4FEF9' },
};
export const accentOf = (k) => AGENT_ACCENT[k] || AGENT_ACCENT.anuncios;

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Las 10 secciones del esqueleto Korex + las de la anatomía de Producto. Si el agente
// titula una sección con uno de estos nombres, se numera y se destaca sola.
const SECCIONES_VSL = [
  'hook', 'identificacion', 'identificación', 'descalificacion', 'descalificación',
  'dolor', 'empatia', 'empatía', 'autoridad', 'historia', 'vehiculo', 'vehículo',
  'prueba social', 'visualizacion', 'visualización', 'camino', 'cta', 'mecanismo',
  'oferta', 'demo', 'garantia', 'garantía',
];

// Etiquetas de oficio que valen como chip al principio de una línea.
const ETIQUETAS = [
  'hook', 'hooks', 'gancho', 'texto base', 'titular', 'headline', 'descripcion', 'descripción',
  'angulo', 'ángulo', 'cta', 'nota creativa', 'creative', 'promesa', 'mecanismo', 'cierre',
  'objecion', 'objeción', 'duracion', 'duración', 'caso base', 'notas', 'avatar', 'dolor', 'deseo',
];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

function formatInline(t, a) {
  let s = esc(t);
  // Única excepción al "nada de HTML": <br>. Una fila de tabla markdown es UNA línea, así que
  // sin esto no hay forma de maquetar una celda con varios renglones — y el agente de funnels
  // entrega la landing como tabla (una banda = una tabla, las celdas son sus columnas).
  // Se re-permite después de escapar y sin atributos; DOMPurify igual pasa al final.
  s = s.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  s = s.replace(/`([^`]+)`/g, `<code style="background:${a.bg};color:${a.c};padding:1px 5px;border-radius:5px;font-size:11.5px;font-family:ui-monospace,monospace">$1</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:700;color:#1A1D26">$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em style="color:#4B5563">$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<s style="color:#9CA3AF">$1</s>');
  // links: solo http(s), y se abren afuera
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    `<a href="$2" target="_blank" rel="noopener noreferrer" style="color:${a.c};text-decoration:underline">$1</a>`);
  return s;
}

// "Hook: texto" / "Texto base: ..." → chip + texto. Es lo que hace que un anuncio se lea
// de un vistazo sin que el modelo tenga que emitir HTML.
function chipLine(line, a) {
  const m = line.match(/^\s*\*{0,2}([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9 ]{1,18}?)\s*(\d{0,2})\s*\*{0,2}\s*:\s*(.+)$/);
  if (!m) return null;
  const etiqueta = norm(m[1]);
  if (!ETIQUETAS.includes(etiqueta)) return null;
  const num = m[2] ? ` ${m[2]}` : '';
  return `<div style="display:flex;gap:8px;align-items:baseline;margin:5px 0">
    <span style="flex:none;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${a.c};background:${a.bg};padding:2px 7px;border-radius:6px">${esc(m[1].trim())}${num}</span>
    <span style="flex:1;min-width:0">${formatInline(m[3], a)}</span>
  </div>`;
}

function headingVsl(txt, a, agentKey) {
  if (agentKey !== 'vsl') return null;
  const n = norm(txt);
  // "1) HOOK", "2. Identificación", "§3 Descalificación"…
  const m = n.match(/^[§#]?\s*(\d{1,2})[).·\-\s]+(.+)$/);
  const cuerpo = m ? m[2] : n;
  if (!SECCIONES_VSL.some((s) => cuerpo.startsWith(s))) return null;
  const num = m ? m[1] : '';
  return `<div style="display:flex;align-items:center;gap:9px;margin:18px 0 8px">
    ${num ? `<span style="flex:none;width:22px;height:22px;border-radius:7px;background:${a.c};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${num}</span>` : ''}
    <span style="font-size:13px;font-weight:700;color:#1A1D26;text-transform:uppercase;letter-spacing:.04em">${formatInline(m ? txt.replace(/^[§#]?\s*\d{1,2}[).·\-\s]+/, '') : txt, a)}</span>
    <span style="flex:1;height:1px;background:${a.bg}"></span>
  </div>`;
}

export function mdToHtml(text, agentKey = 'anuncios') {
  const a = accentOf(agentKey);
  const lines = String(text || '').split('\n');
  let html = '';
  let list = null;        // 'ul' | 'ol' | null
  let inTable = false;
  let headDone = false;
  let inCode = false;

  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  const closeTable = () => { if (inTable) { html += '</tbody></table></div>'; inTable = false; headDone = false; } };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    // bloque de código
    if (/^```/.test(line.trim())) {
      closeList(); closeTable();
      html += inCode ? '</pre>' : `<pre style="background:#F7F8FA;border:1px solid #E2E5EB;border-radius:10px;padding:10px 12px;overflow-x:auto;font-size:12px;font-family:ui-monospace,monospace;margin:8px 0">`;
      inCode = !inCode;
      continue;
    }
    if (inCode) { html += esc(raw) + '\n'; continue; }

    // tablas
    const isRow = /^\|(.+)\|$/.test(line.trim());
    const isSep = /^\|[\s\-:|]+\|$/.test(line.trim());
    if (isRow && !isSep) {
      closeList();
      if (!inTable) {
        html += `<div style="overflow-x:auto;margin:10px 0"><table style="width:100%;border-collapse:collapse;font-size:12.5px;border:1px solid #E2E5EB;border-radius:10px;overflow:hidden"><thead>`;
        inTable = true; headDone = false;
      }
      const cells = line.split('|').slice(1, -1);
      const tag = headDone ? 'td' : 'th';
      if (headDone && !html.includes('<tbody>')) html += '<tbody>';
      // vertical-align arriba: una celda con varios renglones (una banda de la landing) se
      // centraba vertical y las columnas quedaban desfasadas entre sí.
      html += '<tr>' + cells.map((c) => `<${tag} style="padding:7px 10px;border-bottom:1px solid #EEF0F4;text-align:left;vertical-align:top;line-height:1.55;${headDone ? 'color:#374151' : `background:${a.bg2};font-weight:700;color:#1A1D26;font-size:11px;text-transform:uppercase;letter-spacing:.04em`}">${formatInline(c.trim(), a)}</${tag}>`).join('') + '</tr>';
      continue;
    }
    if (isSep && inTable) { headDone = true; html += '</thead>'; continue; }
    if (inTable) closeTable();

    // separador
    if (/^(---+|\*\*\*+|___+)$/.test(line.trim())) {
      closeList();
      html += '<hr style="margin:14px 0;border:none;border-top:1px solid #E8EBF0">';
      continue;
    }

    // encabezados
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      closeList();
      const txt = h[2];
      const vsl = headingVsl(txt, a, agentKey);
      if (vsl) { html += vsl; continue; }
      const lvl = h[1].length;
      if (lvl === 1) {
        html += `<h1 style="font-size:16.5px;font-weight:800;color:#1A1D26;margin:16px 0 8px;padding-bottom:6px;border-bottom:2px solid ${a.bg}">${formatInline(txt, a)}</h1>`;
      } else if (lvl === 2) {
        html += `<h2 style="font-size:14.5px;font-weight:700;color:#1A1D26;margin:16px 0 7px;padding-left:9px;border-left:3px solid ${a.c}">${formatInline(txt, a)}</h2>`;
      } else {
        html += `<h3 style="font-size:11.5px;font-weight:700;color:${a.c};margin:12px 0 5px;text-transform:uppercase;letter-spacing:.06em">${formatInline(txt, a)}</h3>`;
      }
      continue;
    }

    // cita
    const q = line.match(/^>\s?(.*)$/);
    if (q) {
      closeList();
      html += `<div style="border-left:3px solid ${a.c};background:${a.bg2};padding:8px 12px;margin:8px 0;border-radius:0 8px 8px 0;color:#374151;font-style:italic">${formatInline(q[1], a)}</div>`;
      continue;
    }

    // listas
    const ul = line.match(/^\s*[-*•]\s+(.+)$/);
    if (ul) {
      closeTable();
      if (list !== 'ul') { closeList(); html += `<ul style="margin:6px 0;padding-left:18px;list-style:none">`; list = 'ul'; }
      html += `<li style="position:relative;margin:3px 0;line-height:1.6;color:#3F4653"><span style="position:absolute;left:-13px;top:8px;width:5px;height:5px;border-radius:50%;background:${a.c};display:block"></span>${formatInline(ul[1], a)}</li>`;
      continue;
    }
    const ol = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (ol) {
      closeTable();
      if (list !== 'ol') { closeList(); html += `<ol style="margin:6px 0;padding-left:6px;list-style:none">`; list = 'ol'; }
      html += `<li style="display:flex;gap:8px;margin:4px 0;line-height:1.6;color:#3F4653"><span style="flex:none;min-width:19px;height:19px;border-radius:6px;background:${a.bg};color:${a.c};font-size:10.5px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px">${ol[1]}</span><span style="flex:1;min-width:0">${formatInline(ol[2], a)}</span></li>`;
      continue;
    }

    // vacía
    if (!line.trim()) { closeList(); continue; }

    // etiqueta de oficio ("Hook 1: ...", "Texto base: ...")
    closeList();
    const chip = chipLine(line, a);
    if (chip) { html += chip; continue; }

    html += `<p style="margin:6px 0;line-height:1.62;color:#3F4653">${formatInline(line, a)}</p>`;
  }
  closeList(); closeTable();
  if (inCode) html += '</pre>';

  return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] });
}

export default function AgentMarkdown({ text, agentKey = 'anuncios', className = '' }) {
  const html = useMemo(() => mdToHtml(text, agentKey), [text, agentKey]);
  return <div className={`text-[13.5px] ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
