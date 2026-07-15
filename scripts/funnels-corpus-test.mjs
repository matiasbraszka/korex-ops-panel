/**
 * Replica EXACTA del retrieval del agente de Copy de Funnels (agent-chat) contra la DB real,
 * para verificar que la busqueda trae el nicho/avatar/pagina correctos antes de deployar nada.
 *
 * Verifica las dos mitades:
 *   - la deteccion de fase (¿pide una pagina suelta o el funnel entero?)
 *   - el scoring de las fichas, con el filtro de "este funnel tiene esa pagina escrita"
 *
 * Uso:  node scripts/funnels-corpus-test.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const env = { ...process.env };
for (const line of readFileSync(join(process.cwd(), "..", "..", "..", "voomly-export", ".env"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i <= 0) continue;
  const k = line.slice(0, i).trim();
  if (!/^[A-Z_]+$/.test(k) || env[k]) continue;
  env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const str = (v) => (v === null || v === undefined ? "" : String(v));

async function rpc(fn, body) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
  return res.json();
}

// --- mismo orden y mismas regex que agent-chat: "pre-landing" contiene "landing" ---
const FASES_CF = [
  { fase: "prelanding", re: /(pre-?landing|antesala)/ },
  { fase: "thankyou", re: /(thank ?you|pagina de gracias|typ\b)/ },
  { fase: "formulario", re: /(formulario|quiz|cuestionario|preguntas de calificacion)/ },
  { fase: "landing", re: /(landing vsl|landing del vsl|pagina del video|\blanding\b)/ },
];
function detectarFase(pedido) {
  // cada match se borra del texto antes de probar el siguiente: si no, "pre-landing"
  // dispara tambien "landing" y dos falsos hits se leerian como "pidio el funnel entero"
  let q = norm(pedido);
  const hits = [];
  for (const f of FASES_CF) {
    if (!f.re.test(q)) continue;
    hits.push(f.fase);
    q = q.replace(new RegExp(f.re.source, "g"), " ");
  }
  return hits.length === 1 ? hits[0] : "";
}

// --- mismo scoring que la edge function ---
function score(rows, { pedido, niche, avatarName, clientId, faseCF = "" }) {
  const qTokens = norm(pedido).split(" ").filter((w) => w.length > 3);
  const nicheStr = norm(niche);
  const nicheTokens = nicheStr.split(" ").filter((w) => w.length > 3);
  const av = norm(avatarName);
  const hayOf = (r) => norm([str(r.niche), str(r.title), ...(Array.isArray(r.niche_tags) ? r.niche_tags : [])].join(" "));
  return rows.map((r) => {
    const rowNiche = norm(str(r.niche));
    const hay = hayOf(r);
    let s = 0;
    if (nicheStr && rowNiche && (nicheStr.includes(rowNiche) || rowNiche.includes(nicheStr))) s += 5;
    for (const t of nicheTokens) if (hay.includes(t)) s += 1;
    const ra = norm(str(r.avatar));
    if (av && ra && (av.includes(ra) || ra.includes(av))) s += 3;
    for (const t of qTokens) if (hay.includes(t)) s += 1;
    const m = r.metrics || {};
    if (m.tier === "ganador") s += 2;
    if (m.tier === "perdedor") s -= 3;
    if (r.client_id && r.client_id === clientId) s += 1;
    if (m.publicado === true) s += 1;
    const tienePagina = !faseCF || (Array.isArray(m.paginas) && m.paginas.includes(faseCF));
    return { id: r.id, title: r.title, publicado: !!m.publicado, paginas: m.paginas || [], score: s, tienePagina };
  }).filter((x) => x.score > 0 && x.tienePagina).sort((a, b) => b.score - a.score);
}

const CASOS = [
  { nombre: "Funnel completo · networker", niche: "Bienestar", avatarName: "Networker sin duplicación",
    pedido: "Escribí el funnel completo para esta networker que no logra duplicar su equipo" },
  { nombre: "Auditar la pre-landing · padres", niche: "Desarrollo personal", avatarName: "Padres de familia",
    pedido: "Auditá la pre-landing de este funnel, siento que el titular no engancha" },
  { nombre: "Thank you page · viajes", niche: "Viajes", avatarName: "Viajeros con propósito",
    pedido: "Reescribí la thank you page para que quede clarísimo que tienen que mandar el WhatsApp" },
  { nombre: "Formulario · inversores", niche: "Finanzas y cripto", avatarName: "Inversor tradicional",
    pedido: "Necesito las preguntas del formulario de calificación para inversores" },
  { nombre: "Nicho inexistente (probando el fallback)", niche: "Veterinaria equina", avatarName: "Criador de caballos",
    pedido: "Hacé el funnel para criadores de caballos de salto" },
];

// La deteccion de fase se rompe sola: "pre-landing" contiene "landing", "landing vsl" contiene
// "landing". Estos casos fijan el borde para que no vuelva a pasar.
const FASE_ESPERADA = [
  ["Auditá la pre-landing, el titular no engancha", "prelanding"],
  ["Reescribí la landing vsl", "landing"],
  ["Mejorá la thank you page", "thankyou"],
  ["Armá el formulario de calificación", "formulario"],
  ["Escribí el funnel completo", ""],
  ["Revisá la pre-landing y la landing vsl", ""],   // dos fases = el funnel entero
  ["Hacé la antesala para este avatar", "prelanding"],
];
let malas = 0;
for (const [pedido, esperada] of FASE_ESPERADA) {
  const got = detectarFase(pedido);
  if (got !== esperada) { console.log(`FASE MAL: "${pedido}" -> "${got}" (esperada "${esperada}")`); malas++; }
}
console.log(`deteccion de fase: ${FASE_ESPERADA.length - malas}/${FASE_ESPERADA.length} ok\n`);
if (malas) process.exit(1);

const cs = await rpc("marketing_corpus_meta", { p_secret: env.VSL_INGEST_SECRET, p_parts: ["cf_ficha", "cf_section", "cf_pagina"] });
const fichas = cs.filter((r) => r.part === "cf_ficha");
const secciones = cs.filter((r) => r.part === "cf_section");
const paginas = cs.filter((r) => r.part === "cf_pagina");
console.log(`corpus: ${fichas.length} fichas · ${secciones.length} secciones · ${paginas.length} paginas`);
console.log(`publicados: ${fichas.filter((f) => f.metrics?.publicado).length}/${fichas.length}\n`);

let fallos = 0;
for (const c of CASOS) {
  const fase = detectarFase(c.pedido);
  console.log(`### ${c.nombre}`);
  console.log(`   fase detectada: ${fase || "(funnel completo)"}`);
  const top = score(fichas, { ...c, faseCF: fase }).slice(0, 3);
  if (!top.length) { console.log("   -> sin resultados (caeria al fallback por nicho)"); }
  for (const t of top) {
    console.log(`   ficha  ${String(t.score).padStart(3)}  ${t.publicado ? "[pub]" : "[   ]"}  ${t.title.replace("FICHA — ", "").slice(0, 58)}`);
  }
  // lo que realmente viajaria al prompt
  if (top.length) {
    const ids = fase
      ? top.map((t) => `mal_cf_pag_${t.id.replace("mal_cf_ficha_", "")}__${fase}`)
      : paginas.filter((p) => p.id.startsWith(`mal_cf_pag_${top[0].id.replace("mal_cf_ficha_", "")}__`)).map((p) => p.id);
    const hay = ids.filter((id) => paginas.some((p) => p.id === id));
    console.log(`   -> ${hay.length}/${ids.length} paginas al prompt: ${hay.map((i) => i.split("__").pop()).join(", ")}`);
    if (hay.length !== ids.length) { console.log("   !! se pidieron paginas que no existen en la DB"); fallos++; }
  }
  const secTop = score(secciones, { ...c, avatarName: "", faseCF: "" }).slice(0, 3);
  for (const s of secTop) console.log(`   secc   ${String(s.score).padStart(3)}       ${s.title.slice(0, 58)}`);
  console.log("");
}

if (fallos) { console.log(`${fallos} caso(s) con paginas inexistentes`); process.exit(1); }
console.log("ok: todas las paginas que el retrieval pediria existen en la DB");
