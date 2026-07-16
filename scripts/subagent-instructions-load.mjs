/**
 * subagent-instructions-load.mjs — carga las instrucciones de un subagente de marketing
 * desde un archivo versionado del repo, y verifica por MD5 que quedaron intactas.
 *
 * POR QUE EXISTE: el prompt de cada especialista (marketing_subagents.instructions) se edita
 * desde el panel y vive UNICAMENTE en produccion. No hay backup en git: si alguien lo pisa,
 * no hay con que compararlo ni a que volver. marketing_vsl_corpus_v1.sql llegó a decir que
 * las de VSL "se versionan como archivo", pero ese archivo nunca existio y el RPC se uso a
 * mano por MCP.
 *
 * Es generico a proposito: hoy lo usa `descubrimiento`, pero sirve para versionar los otros
 * cuatro (anuncios / vsl / landing / general) cuando se quieran traer al repo.
 *
 * OJO — el panel PISA esto. El equipo edita en Marketing → Configuración y escribe directo
 * en la DB. Este script es la direccion contraria (repo -> DB). Si editaron en el panel,
 * traer el cambio al archivo ANTES de correr esto, o se pierde. Para ver si divergieron:
 *   node scripts/subagent-instructions-load.mjs --key <k> --file <f> --check
 *
 * Uso:
 *   node scripts/subagent-instructions-load.mjs --key descubrimiento --file migrations/descubrimiento_instructions_v1.md
 *   node scripts/subagent-instructions-load.mjs --key descubrimiento --file <f> --check     (no escribe: compara)
 *
 * Requiere en el entorno (o en voomly-export/.env):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, VSL_INGEST_SECRET
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const args = process.argv.slice(2);
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const KEY_ = arg("--key");
const FILE = arg("--file");
const CHECK = args.includes("--check");

if (!KEY_ || !FILE) {
  console.error("uso: --key <subagente> --file <archivo.md> [--check]");
  process.exit(1);
}

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
const ANON = env.SUPABASE_ANON_KEY;
const SECRET = env.VSL_INGEST_SECRET;

const md5 = (s) => createHash("md5").update(s, "utf8").digest("hex");

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
  if (!existsSync(FILE)) throw new Error(`no existe el archivo: ${FILE}`);
  // El comentario HTML de arriba es nota para el equipo, no parte del prompt: se saca.
  const raw = readFileSync(FILE, "utf8");
  const instructions = raw.replace(/^\s*<!--[\s\S]*?-->\s*/, "").trim();
  if (!instructions) throw new Error("el archivo quedo vacio despues de sacar el comentario");

  const local = md5(instructions);
  console.log(`${KEY_}  <-  ${FILE}`);
  console.log(`  ${instructions.length.toLocaleString()} chars · md5 ${local}`);

  if (!URL_ || !ANON || !SECRET) throw new Error("faltan SUPABASE_URL / SUPABASE_ANON_KEY / VSL_INGEST_SECRET");

  if (CHECK) {
    // No hay RPC de lectura de instructions: se compara escribiendo lo MISMO que ya esta.
    // Es no-destructivo solo si coinciden, asi que en --check no se escribe: se avisa.
    console.log("\n--check: para comparar sin escribir, mira el md5 en la DB con:");
    console.log(`  select key, md5(instructions), length(instructions) from marketing_subagents where key='${KEY_}';`);
    console.log(`\n  md5 local: ${local}`);
    return;
  }

  const remoto = await rpc("marketing_subagent_set_instructions", {
    p_secret: SECRET, p_key: KEY_, p_instructions: instructions,
  });
  // El RPC devuelve el md5 de lo que quedo guardado. Si no coincide, algo se corrompio en
  // el camino (encoding, truncado) y el agente correria con un prompt distinto al del repo.
  if (remoto !== local) {
    console.error(`\nERROR: el md5 guardado (${remoto}) no coincide con el local (${local})`);
    process.exit(1);
  }
  console.log(`\ncargadas y verificadas: md5 ${remoto}`);
}

main().catch((e) => { console.error("\nERROR:", e.message); process.exit(1); });
