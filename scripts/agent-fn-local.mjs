/**
 * agent-fn-local.mjs — levanta la edge fn agent-chat EN TU MAQUINA, contra la DB real.
 *
 * POR QUE EXISTE: agent-chat es una sola funcion compartida por los 4 agentes. Deployarla
 * para probar un agente nuevo pone en riesgo a los otros tres, que estan en produccion. Con
 * esto se prueba el agente entero (chat real, corpus real, gate real) sin deployar nada:
 * produccion sigue corriendo la version vieja hasta que el agente este validado.
 *
 * Corre con Deno (el mismo runtime que usa Supabase), asi que lo que probas es lo que se va
 * a deployar. NO necesita Docker.
 *
 * Uso:
 *   1. Copiar scripts/agent-fn-local.env.example a scripts/agent-fn-local.env y completarlo
 *      (el SERVICE_ROLE_KEY sale del dashboard: Project Settings -> API -> service_role).
 *   2. node scripts/agent-fn-local.mjs
 *   3. En apps/operations/.env.local:  VITE_AGENT_FN_URL=http://localhost:8000
 *   4. npm run dev  (en apps/operations) y probar el agente en /marketing/agentes
 *
 * Para volver a produccion: sacar VITE_AGENT_FN_URL del .env.local y reiniciar el dev server.
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ENV_FILE = join(process.cwd(), "scripts", "agent-fn-local.env");
const FN = join(process.cwd(), "supabase", "functions", "agent-chat", "index.ts");
const DENO = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "deno.cmd" : "deno");
const PORT = process.env.PORT || "8000";

// Las 3 que Supabase le inyecta a toda edge fn. Sin la service_role, la funcion no puede
// leer las tablas (RLS) y todo responde vacio, que es peor que fallar: parece que anda.
const NECESARIAS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"];

if (!existsSync(FN)) { console.error(`No encuentro la edge fn: ${FN}\n(corre esto desde la raiz del repo)`); process.exit(1); }
if (!existsSync(DENO)) { console.error(`Falta Deno. Instalalo con:  npm i -D deno`); process.exit(1); }

const env = { ...process.env };
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const i = s.indexOf("=");
    if (i <= 0) continue;
    env[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}

const faltan = NECESARIAS.filter((k) => !env[k]);
if (faltan.length) {
  console.error(`Faltan variables: ${faltan.join(", ")}`);
  console.error(`\nPonelas en ${ENV_FILE} (mira scripts/agent-fn-local.env.example).`);
  console.error("El service_role_key sale del dashboard de Supabase: Project Settings -> API -> service_role.");
  console.error("OJO: esa clave saltea RLS. Nunca la commitees ni la pongas en un VITE_*.");
  process.exit(1);
}

console.log("agent-chat LOCAL");
console.log(`  runtime : Deno (el mismo de Supabase)`);
console.log(`  DB      : ${env.SUPABASE_URL}  ← la REAL: el corpus, el gate y los clientes son los de verdad`);
console.log(`  escucha : http://localhost:${PORT}`);
console.log(`\n  En apps/operations/.env.local:  VITE_AGENT_FN_URL=http://localhost:${PORT}`);
console.log("  Produccion no se toca: sigue corriendo la version deployada.\n");

// --watch: se reinicia sola al guardar el archivo, para iterar el prompt sin frenar nada.
const p = spawn(DENO, ["run", "--allow-all", "--watch", `--port=${PORT}`, FN], { env, stdio: "inherit", shell: process.platform === "win32" });
p.on("exit", (c) => process.exit(c ?? 0));
