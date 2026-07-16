/**
 * descubrimiento-corpus-test.mjs — prueba el ruteo del Agente de Descubrimiento SIN deployar.
 *
 * agent-chat esta en produccion con 3 agentes vivos (anuncios, vsl, landing): deployar para
 * ver si el ruteo acierta es caro y arriesgado. Este script replica la logica de PASOS_DESC
 * (agent-chat/index.ts) y la corre contra el corpus real de la DB via marketing_corpus_meta.
 *
 * Que verifica:
 *   1. Que cada pedido tipico enrute al paso correcto (y que los ambiguos NO adivinen).
 *   2. Que exista mal_desc_skill_<slug> para los 5 slugs (si no, el paso activo entraria sin
 *      metodologia y el agente la inventaria de memoria).
 *   3. Que el gate y el corpus hablen de los mismos 5 pasos.
 *
 * OJO: si tocas PASOS_DESC en agent-chat, tenes que tocarlo aca. Es una copia, no un import:
 * la edge fn corre en Deno y esto en Node. Igual que funnels-corpus-test.mjs con el scorer.
 *
 * Uso:
 *   node scripts/descubrimiento-corpus-test.mjs
 *
 * Requiere en el entorno (o en voomly-export/.env):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, VSL_INGEST_SECRET
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function loadEnv() {
  const env = { ...process.env };
  const candidates = [
    process.env.VOOMLY_ENV,
    join(process.cwd(), "..", "..", "..", "voomly-export", ".env"),
    join(process.cwd(), "voomly-export", ".env"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i <= 0) continue;
      const k = line.slice(0, i).trim();
      if (!/^[A-Z_]+$/.test(k) || env[k]) continue;
      env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
    break;
  }
  return env;
}
const env = loadEnv();
const URL_ = env.SUPABASE_URL, ANON = env.SUPABASE_ANON_KEY, SECRET = env.VSL_INGEST_SECRET;

// --- COPIA EXACTA de agent-chat/index.ts (norm + PASOS_DESC + la eleccion) ---
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();

const PASOS_DESC = [
  { slug: "competencia", re: /(competencia|competidor(es)?|ad library|biblioteca de anuncios|benchmark)/ },
  { slug: "avatar", re: /(avatar builder|hoja de avatar|profundiza\w*|boton(es)? caliente|psicologic\w+|deseos ocultos|miedos ocultos)/ },
  { slug: "estrategia", re: /(estrateg\w+|focalizacion|top de avatares|reclutamiento vs producto|que funnel|cual funnel)/ },
  { slug: "research", re: /(research|investiga\w*|preonboarding|pre-?onboarding|fuentes publicas)/ },
  { slug: "onboarding", re: /(onboarding|ficha del cliente|plantilla|transcripcion|apuntes)/ },
];

// Los 5 slugs validos. En la fn salen del corpus (las fichas); aca se fijan para poder correr
// el ruteo sin base. Si no coinciden, lo canta el bloque 2 del test.
const SLUGS = new Set(["research", "competencia", "onboarding", "estrategia", "avatar"]);

// El comando gana; si no hay, el primer match del array (su orden ES la desambiguacion).
// Un comando que no existe se ignora y se cae al ruteo por prosa.
function rutear(pedido) {
  const cmd = /^\s*\/([a-z_]+)\b[ \t]*/i.exec(String(pedido ?? ""));
  if (cmd && SLUGS.has(cmd[1].toLowerCase())) return cmd[1].toLowerCase();
  const q = norm(pedido);
  return PASOS_DESC.find((p) => p.re.test(q))?.slug || "";
}

// --- Casos. `esperado` "" = a proposito no rutea: manda el gate (elige el 1er pendiente). ---
const CASOS = [
  // Cada paso, como lo pediria el equipo
  ["Investigá al líder y su empresa antes de la llamada", "research"],
  ["Necesito el research previo de Fabiana", "research"],
  ["¿Qué está haciendo la competencia?", "competencia"],
  ["Traeme los ads de los competidores del ad library", "competencia"],
  ["Rellená el onboarding con la transcripción de la llamada", "onboarding"],
  ["Consolidá la plantilla de onboarding", "onboarding"],
  ["Armá el análisis estratégico", "estrategia"],
  ["Definí el top de avatares", "estrategia"],
  ["Necesito la estrategia del cliente", "estrategia"],
  ["Profundizá el avatar", "avatar"],
  ["Hacé la hoja de avatar con el botón caliente", "avatar"],
  ["Dame el análisis psicológico del avatar", "avatar"],

  // Los que se pisan. Cada uno es el motivo de una linea del orden de PASOS_DESC:
  ["Hacé el pre-onboarding research", "research"],                       // "pre-onboarding" ⊃ "onboarding"
  ["Hacé el research de la competencia", "competencia"],                 // nombra los dos pasos
  ["Profundizá el avatar que eligió el análisis estratégico", "avatar"], // por eso avatar > estrategia
  ["Investigá qué ads corre la competencia", "competencia"],             // idem

  // NOMBRAR EL INSUMO NO ES PEDIRLO. Estas tres son la forma mas natural de pedir el paso 4 y
  // las tres nombran los pasos 1 y 3 sin pedirlos. Antes se ruteaban a research —que esta
  // BLOQUEADO— y el agente contestaba "no puedo hacer el research" a alguien que le habia pedido
  // la estrategia. Por eso `estrategia` va antes que `research` y `onboarding`.
  ["En base a la investigación y al onboarding, ¿qué estrategia hacemos?", "estrategia"],
  ["Analizá el onboarding y la investigación y decime la estrategia", "estrategia"],
  ["¿Qué estrategia desarrollamos primero?", "estrategia"],
  ["¿Qué funnel armamos primero para este cliente?", "estrategia"],

  // El precio de lo de arriba, asumido a proposito: si nombras la estrategia, gana la estrategia
  // aunque pidas otra cosa primero. Es mucho menos frecuente que el caso de arriba, y el gate lo
  // amortigua: si el onboarding no esta cargado, estrategia da BLOQUEADO y el agente contesta
  // "falta el onboarding" — que es justo lo que habia que hacer primero.
  ["Hacé el onboarding y después la estrategia", "estrategia"],

  // Sin match: manda el gate. Es el caso NORMAL, no un fallo — el equipo abre el chat sin
  // nombrar ningun paso y el agente contesta con el estado real del cliente.
  ["Hola, ¿en qué estamos con este cliente?", ""],
  ["¿Qué falta?", ""],
  ["Dale, seguí", ""],

  // COMANDOS (el menu del "/"). Acá no se adivina nada: el paso lo eligio la persona.
  ["/estrategia", "estrategia"],
  ["/avatar", "avatar"],
  ["/research", "research"],
  // Con aclaracion propia: el comando manda igual y el texto de atras es el detalle.
  ["/estrategia enfocate en reclutamiento", "estrategia"],
  // El comando GANA sobre la prosa, aunque la prosa diga otra cosa. Es el punto de todo esto.
  ["/estrategia hacé primero el research y el onboarding", "estrategia"],
  ["/onboarding pero mirá también la investigación", "onboarding"],
  // Un comando que no existe se ignora y decide la prosa (no rutea a un paso fantasma).
  ["/loquesea armá el análisis estratégico", "estrategia"],
  ["/xyz", ""],
];

async function rpc(fn, body) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${fn} -> HTTP ${res.status}: ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

async function main() {
  if (!URL_ || !ANON || !SECRET) throw new Error("faltan SUPABASE_URL / SUPABASE_ANON_KEY / VSL_INGEST_SECRET");

  console.log("1) RUTEO DEL PEDIDO -> PASO\n");
  let malos = 0;
  for (const [pedido, esperado] of CASOS) {
    const got = rutear(pedido);
    const ok = got === esperado;
    if (!ok) malos++;
    const muestra = got || "(manda el gate)";
    console.log(`  ${ok ? "ok  " : "MAL "} ${String(muestra).padEnd(22)} ${JSON.stringify(pedido)}`);
    if (!ok) console.log(`       esperaba: ${esperado || "(manda el gate)"}`);
  }
  console.log(`\n  ${CASOS.length - malos}/${CASOS.length} correctos`);

  console.log("\n2) EL CORPUS TIENE LOS 5 PASOS\n");
  // checksums y no meta: meta devuelve (id, part, niche, niche_tags, avatar, title, client_id,
  // metrics) — sin char_count, que es justo lo que hace falta para pesar el prompt.
  const PARTS = ["desc_ficha", "desc_skill", "desc_blueprint"];
  const [checks, meta] = await Promise.all([
    rpc("marketing_corpus_checksums", { p_secret: SECRET, p_parts: PARTS }),
    rpc("marketing_corpus_meta", { p_secret: SECRET, p_parts: PARTS }),
  ]);
  const partOf = new Map((Array.isArray(meta) ? meta : []).map((r) => [r.id, r.part]));
  const rows = (Array.isArray(checks) ? checks : []).map((r) => ({ ...r, part: partOf.get(r.id) }));
  if (!rows.length) throw new Error("el corpus no devolvio filas: ¿se cargo? (descubrimiento-corpus-load.mjs)");
  const slugs = [...new Set(PASOS_DESC.map((p) => p.slug))];
  for (const slug of slugs) {
    const ficha = rows.find((r) => r.id === `mal_desc_ficha_${slug}`);
    const skill = rows.find((r) => r.id === `mal_desc_skill_${slug}`);
    const ok = ficha && skill;
    if (!ok) malos++;
    console.log(`  ${ok ? "ok  " : "MAL "} ${slug.padEnd(13)} ficha ${ficha ? String(ficha.char_count).padStart(5) : "  —  "} · skill ${skill ? String(skill.char_count).padStart(6) : "   —  "} chars`);
  }
  const bp = rows.find((r) => r.id === "mal_desc_blueprint");
  if (!bp) { malos++; console.log("  MAL  falta mal_desc_blueprint (el SOP)"); }
  else console.log(`  ok   SOP           ${String(bp.char_count).padStart(5)} chars (va siempre, cacheado)`);

  console.log("\n3) PESO DEL PROMPT POR PASO (lo que entra cuando ese paso esta activo)\n");
  const fichas = rows.filter((r) => r.part === "desc_ficha").reduce((a, r) => a + r.char_count, 0);
  const base = (bp?.char_count || 0) + fichas;
  for (const slug of slugs) {
    const skill = rows.find((r) => r.id === `mal_desc_skill_${slug}`);
    const tot = base + (skill?.char_count || 0);
    console.log(`  ${slug.padEnd(13)} ${String(tot).padStart(6)} chars  ~${Math.round(tot / 3.8 / 100) / 10}k tokens  (SOP+fichas ${base} + skill ${skill?.char_count || 0})`);
  }
  const todas = rows.filter((r) => r.part === "desc_skill").reduce((a, r) => a + r.char_count, 0);
  console.log(`\n  vs. mandar las 5 siempre: ${(base + todas).toLocaleString()} chars (~${Math.round((base + todas) / 3.8 / 1000)}k tokens)`);

  if (malos) { console.log(`\n${malos} PROBLEMA(S) — no deployar asi`); process.exit(1); }
  console.log("\ntodo ok");
}

main().catch((e) => { console.error("\nERROR:", e.message); process.exit(1); });
