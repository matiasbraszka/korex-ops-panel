/**
 * descubrimiento-corpus-load.mjs — carga el corpus del Agente de Descubrimiento.
 *
 * Clon de funnels-corpus-load.mjs: mismo RPC (marketing_corpus_ingest), mismo secret, misma
 * verificacion MD5 fila por fila. Con ON CONFLICT DO UPDATE una corrupcion silenciosa
 * pisaria datos buenos, asi que el checksum no es opcional.
 *
 * A diferencia de VSL y funnels, aca NO hay parser: las 5 skills ya son markdown limpio
 * (corpus-src/korex_discovery_skills/<skill>/SKILL.md). Se cargan VERBATIM.
 *
 * Tres clases de fila:
 *   desc_blueprint (1)  el SOP: la cadena de 5 pasos y la regla de oro. Capa estable (cacheada).
 *   desc_ficha     (5)  una por skill: que hace, cuando, prerrequisito, output. Van SIEMPRE las 5:
 *                       son el menu con el que el orquestador decide.
 *   desc_skill     (5)  el SKILL.md completo, verbatim. Entra SOLO el del paso activo.
 *
 * Por que la skill entera y no troceada: son metodologias prescriptivas ("ESTRUCTURA DEL
 * DOCUMENTO (OBLIGATORIA)"). Mandar 3 secciones sueltas elegidas por el scorer las rompe.
 * Se elige a nivel skill, no a nivel parrafo — de ahi que no exista un `desc_section`.
 *
 * Uso:
 *   node scripts/descubrimiento-corpus-load.mjs [--dry-run]
 *
 * Requiere en el entorno (o en voomly-export/.env):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, VSL_INGEST_SECRET
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const SRC = join(process.cwd(), "corpus-src", "korex_discovery_skills");
const SOP = join(process.cwd(), "corpus-src", "descubrimiento-sop.md");
// Donde viven las versiones adaptadas al chat: corpus-src/skill-<slug>-chat.md. Si existe una
// para un paso, se carga ESA en vez del SKILL.md original (ver el bucle de mas abajo).
const CHAT_SRC = join(process.cwd(), "corpus-src");
const adaptadas = [];

const PARTS = ["desc_blueprint", "desc_ficha", "desc_skill"];

// Las 5 skills, en el orden de la cadena. `slug` es la clave de todo: el id de la fila
// (mal_desc_skill_<slug>), el paso del gate (descubrimiento_status.stage) y el ruteo de
// agent-chat (PASOS_DESC) usan el MISMO slug. Si cambia aca, cambia en los tres lados.
//
// `tags` son las palabras con las que el equipo pide ese paso: es lo unico que mira el
// scorer (hayOf() de agent-chat solo lee niche, title y niche_tags — nunca el content).
// `ejecuta` es la pieza mas importante de esta tabla y la que evita el peor error posible.
//
//   "chat"  -> el agente PRODUCE el paso. Sus inputs ya estan en la base (client_brain_docs).
//   "fuera" -> el agente NO puede producirlo: la metodologia necesita herramientas que el chat
//              no tiene (buscar en Google, pegarle al Ad Library). Solo lo coordina.
//
// Sin esta distincion, el agente recibe la metodologia de research — que le dice "hace 15-20
// busquedas en Google" — sin tener buscador, y el resultado esperable es que invente los datos
// del lider. Es exactamente lo que el doc del agente prohibe: "Si una skill no esta disponible,
// NO la simules: avisa que falta". Cuando research y competencia se construyan (fases 2 y 3,
// como jobs a-pedido), estos dos pasan a "chat" o a "job" y se recarga el corpus.
const SKILLS = [
  {
    slug: "research",
    menu: "Investigar al lider y su empresa",
    pedido: "Hace el research del lider y su empresa con fuentes publicas.",
    dir: "korex-preonboarding-research",
    name: "Research del lider y su empresa",
    ord: 1,
    momento: "pre-llamada",
    ejecuta: "fuera",
    comoSeHace: "TODAVIA NO SE PUEDE HACER DESDE ESTE CHAT: la metodologia se apoya en 15-20 busquedas web y el chat no tiene buscador. Hoy lo hace una persona (o Claude Code con la skill). Vos NO lo produzcas ni lo aproximes de memoria: si falta, decilo y decí quién lo aporta.",
    cuando: "Antes de la llamada de onboarding, apenas entra un cliente nuevo.",
    prereq: "Ninguno para arrancar, PERO hace falta saber el FOCO (reclutamiento o producto) antes de investigar: cambia qué se busca. Si no está definido, preguntalo — es la primera pregunta de la fase.",
    output: "2 documentos: uno del lider, uno de la empresa. Cada dato con fuente y nivel de confianza. SE ADAPTA AL FOCO: si es reclutamiento, el peso va en la AUTORIDAD del líder (historia, logros, rangos, equipo, credibilidad); si es producto, en los PRODUCTOS GANADORES de la empresa (cuáles funcionan, qué resultados dan, qué evidencia hay, qué los diferencia) — con el líder como soporte, no como eje.",
    tags: ["research", "investigacion", "investigar", "preonboarding", "pre-onboarding", "lider",
      "empresa", "mlm", "fuentes", "publico", "google", "antes de la llamada", "previo"],
  },
  {
    slug: "competencia",
    menu: "Que anuncios corre la competencia",
    pedido: "Analiza los ads de la competencia del Ad Library.",
    dir: "competitive-ads-extractor",
    name: "Research de la competencia (ad library)",
    ord: 2,
    momento: "pre-llamada",
    ejecuta: "fuera",
    comoSeHace: "TODAVIA NO SE PUEDE HACER DESDE ESTE CHAT: la metodologia necesita leer el Ad Library de Meta y el chat no tiene ese acceso. Vos NO inventes que anuncios corre la competencia — no los estas viendo. Si falta, decilo.",
    cuando: "En paralelo al research del lider. NO depende de el.",
    prereq: "Ninguno. Corre en paralelo al paso 1.",
    output: "Analisis de los ads de competidores: que mensajes, dolores y creatividades les estan funcionando.",
    tags: ["competencia", "competidor", "competidores", "ad library", "biblioteca de anuncios",
      "anuncios de la competencia", "que hace la competencia", "benchmark", "mercado"],
  },
  {
    slug: "onboarding",
    menu: "Armar la ficha con la voz del cliente",
    pedido: "Consolida el onboarding separando lo CONFIRMADO por el cliente de lo que hay que validar.",
    dir: "korex-onboarding-filler",
    name: "Consolidacion del onboarding",
    ord: 3,
    momento: "post-llamada",
    ejecuta: "chat",
    comoSeHace: "Lo producís vos, acá, siguiendo la metodología. Sus fuentes (la transcripción y los apuntes) llegan en el contexto.",
    cuando: "Despues de la llamada de onboarding. Bisagra: omitir si el onboarding ya entro por otro flujo.",
    prereq: "Que exista la llamada de onboarding (transcripcion + apuntes del consultor).",
    output: "La ficha oficial de onboarding completa, separando lo CONFIRMADO por el cliente de lo NO VERIFICADO.",
    tags: ["onboarding", "ficha", "plantilla", "rellenar", "completar", "consolidar",
      "transcripcion", "llamada", "apuntes", "consultor"],
  },
  {
    slug: "estrategia",
    menu: "Que estrategia y que avatares van primero",
    pedido: "Hace el analisis estrategico: que estrategia desarrollamos primero y en que pais; quien da la cara y que historia tiene; a que avatares apuntamos con ella, cual es el boton caliente de cada uno y cual es el avatar espejo; y las virtudes del modelo, del equipo y de quien da la cara. Con scores y evidencia.",
    dir: "korex-strategy-analyzer",
    name: "Analisis estrategico",
    ord: 4,
    momento: "post-llamada",
    ejecuta: "chat",
    comoSeHace: "Lo producís vos, acá, siguiendo la metodología. Sus fuentes (research + onboarding) llegan en el contexto.",
    cuando: "Con research y onboarding cerrados. ES LA BISAGRA: sin esto no hay avatar.",
    prereq: "Research (paso 1) + onboarding (paso 3).",
    // OJO: esto ya NO es el DEL de 10 paginas. La version del chat produce un brief de decision
    // de 1.200-1.800 palabras (ver corpus-src/skill-estrategia-chat.md). El documento largo se
    // sigue haciendo en Claude Code con la skill original cuando hace falta.
    output: "BRIEF de decision (3.000-4.000 palabras, no un documento): que estrategia y en que pais; QUIEN DA LA CARA y su historia (va ANTES de los avatares porque los decide) con su frase comercial cerrada; lo que el cliente NO quiere (sus innegociables); 3-5 avatares del motor elegido con la rubrica Korex (activos 30 + rentabilidad 25 + resonancia con la historia 25 + Meta 10 + lead 10) + BONUS ESPEJO (+10), uno marcado ★ PRIORITARIO (subtotal >=70), cada uno con su boton caliente, pais, filtros y riesgo; y las virtudes en 3 bloques (modelo/producto + equipo/comunidad + quien da la cara) marcadas en DOS ejes: CONFIRMADO/A VALIDAR/NO VERIFICADO y DEFENDIBLE/NO DEFENDIBLE. JERARQUIA: los datos observables > el espejo > lo que el cliente prefiere.",
    tags: ["estrategia", "estrategico", "strategy", "analisis", "analizar", "focalizacion",
      "foco", "producto", "reclutamiento", "valores", "top de avatares", "avatares", "consolidar"],
  },
  {
    slug: "avatar",
    menu: "Hoja psicologica del avatar elegido",
    pedido: "Profundiza el avatar prioritario en su hoja psicologica completa, con el boton caliente.",
    dir: "korex-avatar-builder",
    name: "Avatar builder",
    ord: 5,
    momento: "post-llamada",
    ejecuta: "chat",
    comoSeHace: "Lo producís vos, acá, siguiendo la metodología. Su fuente (el DEL / análisis estratégico) llega en el contexto.",
    cuando: "Solo con el analisis estrategico hecho y el avatar ya ELEGIDO por el.",
    prereq: "Analisis estrategico (paso 4). Nunca correr el avatar sin la estrategia hecha.",
    output: "Hoja psicologica del avatar: boton caliente + problemas externos/internos/filosoficos + deseos y miedos ocultos.",
    tags: ["avatar", "avatar builder", "profundizar", "hoja de avatar", "boton caliente",
      "botones calientes", "psicologico", "psicologia", "dolores", "deseos", "miedos"],
  },
];

// --- config: entorno o .env de voomly-export (donde ya viven estas claves) ---
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
const URL_ = env.SUPABASE_URL;
const KEY = env.SUPABASE_ANON_KEY;
const SECRET = env.VSL_INGEST_SECRET;

const md5 = (s) => createHash("md5").update(s, "utf8").digest("hex");

// El frontmatter YAML de la skill trae `name` y `description` (el trigger que escribio el
// equipo). La description entra en la ficha: es la mejor descripcion de cuando usar la skill.
function frontmatter(txt) {
  const m = txt.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return {};
  const out = {};
  // Solo se necesitan name y description; description puede ser multilinea (">" o comillas).
  const name = m[1].match(/^name:\s*(.+)$/m);
  if (name) out.name = name[1].trim();
  const desc = m[1].match(/^description:\s*([\s\S]*?)(?=\n[a-z_]+:|$)/m);
  if (desc) {
    out.description = desc[1]
      .replace(/^[>|]-?\s*/, "")
      .split("\n").map((l) => l.trim()).filter(Boolean).join(" ")
      .replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

function buildRows() {
  const rows = [];

  // 1) El SOP. Va SIEMPRE en la capa estable del prompt (se cachea): es el metodo, no cambia
  //    segun el pedido. Vive versionado en corpus-src/descubrimiento-sop.md.
  if (!existsSync(SOP)) throw new Error(`falta el SOP: ${SOP}`);
  const sop = readFileSync(SOP, "utf8").trim();
  rows.push({
    id: "mal_desc_blueprint", part: "desc_blueprint", niche: null,
    niche_tags: ["descubrimiento", "cadena", "pasos", "prerrequisitos", "gate", "orquestador"],
    avatar: null,
    title: "SOP DEL DESCUBRIMIENTO KOREX — la cadena y sus dependencias",
    content: sop, char_count: sop.length,
    position: 0, client_id: null, metrics: null, status: "approved",
  });

  // 2) Fichas y skills. niche/avatar quedan en null a proposito: que skill corresponde NO
  //    depende del nicho ni del avatar del cliente, depende del paso del pipeline. Si les
  //    pusiera el nicho, el scorer sumaria +5 a las 5 por igual y no discriminaria nada.
  for (const s of SKILLS) {
    const path = join(SRC, s.dir, "SKILL.md");
    if (!existsSync(path)) throw new Error(`falta la skill: ${path}`);
    const original = readFileSync(path, "utf8").trim();
    const fm = frontmatter(original);
    if (!fm.name) throw new Error(`${s.dir}: SKILL.md sin frontmatter name`);

    // Version adaptada al chat, si la hay (corpus-src/skill-<slug>-chat.md).
    //
    // El SKILL.md original esta pensado para Claude Code: produce un entregable largo (el
    // strategy-analyzer son ~10 paginas). En el chat del panel eso no entra —la respuesta se
    // corta en 6.000 tokens— y ademas no es lo que sirve: los agentes de Korex (anuncios, VSL)
    // van al grano del resultado y no se enrollan. La version -chat.md dice QUE producir en
    // este contexto; la original queda intacta para cuando se necesite el documento completo.
    //
    // La ficha (el menu del orquestador) sigue saliendo del frontmatter del ORIGINAL a
    // proposito: describe el paso, que no cambia — lo que cambia es el formato de salida.
    const chatPath = join(CHAT_SRC, `skill-${s.slug}-chat.md`);
    const esAdaptada = existsSync(chatPath);
    const skill = esAdaptada ? readFileSync(chatPath, "utf8").trim() : original;
    if (esAdaptada) adaptadas.push(s.slug);

    const ficha = [
      `# PASO ${s.ord} — ${s.name}`,
      ``,
      `**Skill:** \`${fm.name}\``,
      `**Momento del ciclo:** ${s.momento}`,
      `**Cuando corresponde:** ${s.cuando}`,
      `**Prerrequisito:** ${s.prereq}`,
      `**Output:** ${s.output}`,
      // Va con ⚠️ y en mayúsculas para los "fuera": es la línea que evita que el agente
      // intente producir un paso para el que no tiene herramientas, e invente.
      `**${s.ejecuta === "fuera" ? "⚠️ QUIÉN LO HACE" : "Quién lo hace"}:** ${s.comoSeHace}`,
      ``,
      `**Alcance declarado por la skill:**`,
      fm.description || "(sin description en el frontmatter)",
    ].join("\n");

    const base = {
      niche: null, avatar: null, client_id: null, status: "approved", position: s.ord,
      metrics: { slug: s.slug, skill: fm.name, ord: s.ord, momento: s.momento, prereq: s.prereq, ejecuta: s.ejecuta,
        // Lo que consume el menu del "/" del chat y el ruteo por comando de agent-chat.
        // Vive en el corpus y no en el frontend: agregar un paso al corpus lo hace
        // aparecer en el menu sin tocar codigo ni deployar.
        name: s.name, menu: s.menu, pedido: s.pedido },
    };
    rows.push({
      ...base,
      id: `mal_desc_ficha_${s.slug}`, part: "desc_ficha",
      // el slug va primero en los tags: agent-chat filtra por ahi cuando ya sabe el paso
      niche_tags: [...new Set([s.slug, ...s.tags])],
      title: `FICHA PASO ${s.ord} — ${s.name}`,
      content: ficha, char_count: ficha.length,
    });
    rows.push({
      ...base,
      id: `mal_desc_skill_${s.slug}`, part: "desc_skill",
      niche_tags: [...new Set([s.slug, ...s.tags])],
      title: `METODOLOGIA — ${fm.name}${esAdaptada ? " (adaptada al chat)" : ""}`,
      content: skill, char_count: skill.length,
    });
  }
  return rows;
}

async function rpc(fn, body) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${fn} -> HTTP ${res.status}: ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

async function main() {
  const rows = buildRows();
  const by = (p) => rows.filter((r) => r.part === p).length;
  console.log(`filas: ${rows.length}  (blueprint ${by("desc_blueprint")} · fichas ${by("desc_ficha")} · skills ${by("desc_skill")})`);
  console.log(`chars: ${rows.reduce((a, r) => a + r.content.length, 0).toLocaleString()}`);
  console.log("\npeso de cada skill (lo que se inyecta cuando ese paso esta activo):");
  for (const r of rows.filter((r) => r.part === "desc_skill")) {
    console.log(`  ${String(r.metrics.slug).padEnd(12)} ${String(r.char_count).padStart(6)} chars  (~${Math.round(r.char_count / 3.8 / 100) / 10}k tokens)`);
  }

  if (DRY) return console.log("\n--dry-run: no se escribio nada");
  if (!URL_ || !KEY || !SECRET) throw new Error("faltan SUPABASE_URL / SUPABASE_ANON_KEY / VSL_INGEST_SECRET");

  let total = 0;
  for (let i = 0; i < rows.length; i += 5) {
    const lote = rows.slice(i, i + 5);
    total += await rpc("marketing_corpus_ingest", { p_secret: SECRET, p_rows: lote });
    process.stdout.write(`\r  cargadas ${total}/${rows.length}`);
  }
  console.log("");

  // Verificacion: MD5 de lo que quedo en la DB vs lo local. Via RPC y no con un select
  // directo, porque con la anon key RLS devuelve [] y HTTP 200: "no cargo nada" y "cargo
  // todo" se verian identicos.
  const checks = await rpc("marketing_corpus_checksums", { p_secret: SECRET, p_parts: PARTS });
  if (!Array.isArray(checks) || checks.length === 0) {
    console.log("\n! la verificacion no devolvio filas; revisar a mano antes de dar por bueno el corpus");
    process.exit(1);
  }
  const remoto = new Map(checks.map((r) => [r.id, r]));
  let ok = 0;
  const malas = [];
  for (const r of rows) {
    const d = remoto.get(r.id);
    if (!d) { malas.push(`${r.id}: FALTA en la DB`); continue; }
    if (d.md5 !== md5(r.content)) malas.push(`${r.id}: MD5 distinto (local ${r.content.length} vs db ${d.char_count} chars)`);
    else ok++;
  }
  const sobran = checks.filter((d) => !rows.some((r) => r.id === d.id));
  if (sobran.length) malas.push(`sobran ${sobran.length} filas en la DB que no estan en el corpus local: ${sobran.map((s) => s.id).join(", ")}`);
  console.log(`\nverificacion MD5: ${ok}/${rows.length} identicas`);
  if (malas.length) {
    console.log("DIFERENCIAS:");
    malas.forEach((m) => console.log("  " + m));
    process.exit(1);
  }
  console.log("corpus cargado y verificado byte a byte");
}

main().catch((e) => { console.error("\nERROR:", e.message); process.exit(1); });
