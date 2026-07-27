/**
 * agent-run-smoke.mjs — prueba en vivo un agente de la FÁBRICA (agent-run), contra la fn
 * LOCAL o contra la deployada. Hermano de agent-smoke.mjs, que hace lo mismo con agent-chat.
 *
 * POR QUE: un agente de la fábrica se valida con clientes de COBERTURA OPUESTA, no con uno
 * solo. El caso que más importa no es el cliente rico en datos: es el que NO tiene briefing
 * de WhatsApp ni llamadas, donde hay que confirmar que la cobertura marca ✗ y que el agente
 * NO inventa. Este script corre los dos casos de una y muestra la línea de Fuentes.
 *
 * El service_role y el cron_secret NUNCA pasan por la línea de comandos ni se imprimen: el
 * primero sale de scripts/agent-fn-local.env y el segundo se lee de la DB en runtime.
 *
 * Uso:
 *   node scripts/agent-run-smoke.mjs cuenta                    # contra localhost:8000
 *   node scripts/agent-run-smoke.mjs cuenta --prod             # contra la fn deployada
 *   node scripts/agent-run-smoke.mjs cuenta --cliente "Marta"  # un cliente puntual
 *   node scripts/agent-run-smoke.mjs cuenta --pregunta "..."   # otra pregunta
 *
 * OJO: cada corrida es una llamada real a la API de Anthropic. Gasta y queda en api_usage.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const KEY = args.find((a) => !a.startsWith("--")) || "cuenta";
const PROD = args.includes("--prod");
const SOLO = arg("--cliente");
const PREGUNTA = arg("--pregunta");

const ENV_FILE = join(process.cwd(), "scripts", "agent-fn-local.env");
if (!existsSync(ENV_FILE)) {
  console.error(`Falta ${ENV_FILE}. Copiá scripts/agent-fn-local.env.example y completalo.`);
  process.exit(1);
}
const env = {};
for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
  const s = line.trim();
  if (!s || s.startsWith("#")) continue;
  const i = s.indexOf("=");
  if (i > 0) env[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const URL_ = env.SUPABASE_URL;
const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SRV) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en scripts/agent-fn-local.env.");
  console.error("El service_role sale de Supabase → Project Settings → API → service_role → Reveal.");
  process.exit(1);
}

const FN_URL = PROD ? `${URL_}/functions/v1/agent-run` : "http://localhost:8000";

async function db(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: SRV, Authorization: `Bearer ${SRV}` },
  });
  if (!res.ok) throw new Error(`REST ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

// El cron_secret es la llave de auth de la fn. Se lee acá y se usa solo como header.
const [cfg] = await db("app_settings?key=eq.soporte_config&select=value");
const CRON = cfg?.value?.cron_secret;
if (!CRON) { console.error("No pude leer el cron_secret de app_settings.soporte_config."); process.exit(1); }

// ── A quién le preguntamos: cobertura RICA vs cobertura POBRE ────────────────
// El segundo caso es el que de verdad valida el agente.
let clientes;
if (SOLO) {
  clientes = await db(`clients?name=ilike.*${encodeURIComponent(SOLO)}*&select=id,name&limit=3`);
} else {
  const conBrief = await db("wa_briefings?select=client_id");
  const ids = new Set(conBrief.map((b) => b.client_id));
  const todos = await db("clients?status=eq.active&select=id,name,bottleneck&order=priority.asc&limit=60");
  const rico = todos.find((c) => ids.has(c.id) && c.bottleneck);
  const pobre = todos.find((c) => !ids.has(c.id));
  clientes = [rico, pobre].filter(Boolean);
}
if (!clientes.length) { console.error("No encontré clientes para probar."); process.exit(1); }

const pregunta = PREGUNTA || "Haceme el repaso completo de este cliente: dónde está, qué lo frena y qué haría yo esta semana.";

console.log(`agente: ${KEY}`);
console.log(`fn    : ${FN_URL}${PROD ? "" : "   (¿levantaste `node scripts/agent-fn-local.mjs --fn agent-run`?)"}`);
console.log(`pedido: ${pregunta}\n`);

for (const c of clientes) {
  const cobertura = clientes.length === 2 && c === clientes[1] ? " ← el de cobertura POBRE: acá tiene que decir qué NO sabe" : "";
  console.log(`${"═".repeat(78)}\n${c.name}${cobertura}\n${"═".repeat(78)}`);
  const t0 = Date.now();
  let res, data;
  try {
    res = await fetch(FN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": CRON },
      body: JSON.stringify({
        subagent_key: KEY, client_id: c.id, strategy_id: "", funnel_id: "", avatar_id: "",
        mode: "chat", messages: [{ role: "user", content: pregunta }],
      }),
    });
    data = await res.json();
  } catch (e) {
    console.error(`  NO RESPONDIÓ: ${e.message}\n  (si es local, el server tiene que estar levantado)\n`);
    continue;
  }
  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  if (!data?.ok) { console.error(`  ERROR ${res.status}: ${data?.error} — ${data?.detail || ""}\n`); continue; }
  console.log(data.reply);
  console.log(`\n  ── ${seg}s · US$${data.cost_usd} · in ${data.tokens.in} (cache read ${data.tokens.cache_read} / write ${data.tokens.cache_write}) · out ${data.tokens.out} · stop ${data.stop_reason}\n`);
}
