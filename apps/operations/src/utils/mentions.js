// Utilidades de @menciones para comentarios e informes.
// Sintaxis: @nombre o @nombre.apellido (sin espacios). Se hace match contra
// team_members.name normalizado a slug; si hay ambiguedad nos quedamos con
// el primer match (suficiente para el tamaño de equipo Korex).

const NORMALIZE_RE = /[^a-z0-9]/g;

export function slugifyName(name = '') {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(NORMALIZE_RE, '');
}

// Devuelve mapa { slug -> member } para resolver menciones rapido.
// Incluye el nombre completo, el primer nombre y "nombre.apellido" para que
// "@maria" matchee tanto "Maria Jesus del Rey" como "Maria".
export function buildMentionIndex(teamMembers = []) {
  const idx = {};
  (teamMembers || []).forEach((m) => {
    if (!m || !m.id || !m.name) return;
    const parts = m.name.trim().split(/\s+/);
    const first = slugifyName(parts[0] || '');
    const full = slugifyName(m.name);
    const firstLast = parts.length >= 2 ? slugifyName(parts[0] + parts[parts.length - 1]) : null;
    // No pisar matches previos: prioridad al primero registrado.
    if (first && !idx[first]) idx[first] = m;
    if (full && !idx[full]) idx[full] = m;
    if (firstLast && !idx[firstLast]) idx[firstLast] = m;
  });
  return idx;
}

// Extrae mentions de un texto plano. Retorna array de IDs unicos (sin actor).
// Acepta @palabra donde palabra puede tener letras/numeros/punto.
// Termina al primer caracter que no sea letra/numero/punto (espacio, signo, etc).
export function extractMentions(text, teamMembers = [], { excludeId = null } = {}) {
  if (!text) return [];
  const idx = buildMentionIndex(teamMembers);
  const found = new Set();
  const re = /@([a-zA-Z0-9._\-À-ſ]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const slug = slugifyName(m[1]);
    const member = idx[slug];
    if (member && member.id !== excludeId) {
      found.add(member.id);
    }
  }
  return Array.from(found);
}

// Sugerencias para autocomplete. query es el texto despues del "@" (puede ser vacio).
// Devuelve top 6 miembros cuyo nombre/slug arranca con el query, o todos si query="".
export function suggestMentions(query, teamMembers = [], { excludeId = null, limit = 6 } = {}) {
  const q = slugifyName(query || '');
  const list = (teamMembers || []).filter((m) => m && m.id && m.name && m.id !== excludeId);
  if (!q) return list.slice(0, limit);
  const startsWith = [];
  const contains = [];
  list.forEach((m) => {
    const full = slugifyName(m.name);
    const first = slugifyName(m.name.split(/\s+/)[0] || '');
    if (full.startsWith(q) || first.startsWith(q)) startsWith.push(m);
    else if (full.includes(q)) contains.push(m);
  });
  return [...startsWith, ...contains].slice(0, limit);
}

// Para renderizar: parte el texto en tokens [{type:'text',value} | {type:'mention',member,raw}]
// asi React puede mapear y darle estilo al chip sin usar dangerouslySetInnerHTML.
export function tokenizeWithMentions(text, teamMembers = []) {
  if (!text) return [];
  const idx = buildMentionIndex(teamMembers);
  const tokens = [];
  const re = /@([a-zA-Z0-9._\-À-ſ]+)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ type: 'text', value: text.slice(last, m.index) });
    const slug = slugifyName(m[1]);
    const member = idx[slug];
    if (member) {
      tokens.push({ type: 'mention', member, raw: m[0] });
    } else {
      tokens.push({ type: 'text', value: m[0] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) });
  return tokens;
}
