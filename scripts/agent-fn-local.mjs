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
 *   2. node scripts/agent-fn-local.mjs               (agent-chat, el default)
 *      node scripts/agent-fn-local.mjs generar-branding   (cualquier otra edge fn)
 *   3. En apps/operations/.env.local:  VITE_AGENT_FN_URL=http://localhost:8000
 *      (generar-branding usa su propia: VITE_BRANDING_FN_URL)
 *   4. npm run dev  (en apps/operations) y probar el agente en /marketing/agentes
 *
 * Para volver a produccion: sacar VITE_AGENT_FN_URL del .env.local y reiniciar el dev server.
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ENV_FILE = join(process.cwd(), "scripts", "agent-fn-local.env");
// Que funcion levantar. Por defecto agent-chat (es para lo que nacio esto), pero cualquier
// edge fn sirve: node scripts/agent-fn-local.mjs generar-branding
const FN_NAME = process.argv[2] || "agent-chat";
const FN = join(process.cwd(), "supabase", "functions", FN_NAME, "index.ts");
const DENO = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "deno.cmd" : "deno");
const PORT = "8000"; // lo fija Deno.serve() dentro de la edge fn

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

const VITE_VAR = FN_NAME === "generar-branding" ? "VITE_BRANDING_FN_URL" : "VITE_AGENT_FN_URL";

console.log(`${FN_NAME} LOCAL`);
console.log(`  runtime : Deno (el mismo de Supabase)`);
console.log(`  DB      : ${env.SUPABASE_URL}  ← la REAL: el corpus, el gate y los clientes son los de verdad`);
console.log(`  escucha : http://localhost:${PORT}`);
console.log(`\n  En apps/operations/.env.local:  ${VITE_VAR}=http://localhost:${PORT}`);
console.log("  Produccion no se toca: sigue corriendo la version deployada.\n");

// --watch: se reinicia sola al guardar el archivo, para iterar el prompt sin frenar nada.
//
// El puerto NO se pasa por flag: `--port` es de `deno serve`, no de `deno run`, y las versiones
// actuales de Deno lo rechazan de plano. Lo fija Deno.serve() dentro de la propia edge fn, que
// sin opciones escucha en 8000 — el mismo default que usa Supabase.
//
// En Windows spawn corre con shell:true, asi que las rutas con espacios (C:\Users\Mati Braska\...)
// hay que comillarlas a mano o el shell las parte al primer espacio y no encuentra el ejecutable.
//
// --node-modules-dir=auto: el repo es un monorepo con node_modules propio, y sin esto Deno
// intenta resolver ahi las dependencias npm de la edge fn (@supabase/realtime-js, upng-js) y
// falla. Con "auto" se las baja y maneja el solo, igual que hace el runtime de Supabase.
const q = (s) => (process.platform === "win32" ? `"${s}"` : s);
const p = spawn(q(DENO), ["run", "--allow-all", "--node-modules-dir=auto", "--watch", q(FN)], { env, stdio: "inherit", shell: process.platform === "win32" });
p.on("exit", (c) => process.exit(c ?? 0));
