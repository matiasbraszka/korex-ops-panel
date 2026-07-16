/**
 * agent-smoke.mjs — prueba en vivo los agentes de marketing contra la edge fn deployada.
 *
 * POR QUE: agent-chat es UNA funcion compartida por los 4 agentes. Despues de cada deploy hay
 * que confirmar que los que ya estaban en produccion siguen respondiendo, no solo que el nuevo
 * anda. Sin esto, un deploy que rompe Anuncios se descubre cuando el equipo lo reporta.
 *
 * El cron_secret se lee de la DB en runtime y NUNCA se imprime ni pasa por la linea de
 * comandos (ahi quedaria en el historial del shell y en los logs).
 *
 * Uso:
 *   node scripts/agent-smoke.mjs                 # los 4 agentes
 *   node scripts/agent-smoke.mjs descubrimiento  # uno solo
 *
 * Requiere en el entorno (o en voomly-export/.env): SUPABASE_URL, SUPABASE_ANON_KEY.
 * Si RLS no deja leer el cron_secret con la anon key (lo esperable), exportar CRON_SECRET.
 *
 * OJO: cada corrida es una llamada real a la API de Anthropic. Gasta y queda en api_usage.
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
const URL_ = env.SUPABASE_URL, ANON = env.SUPABASE_ANON_KEY;
if (!URL_ || !ANON) { console.error("faltan SUPABASE_URL / SUPABASE_ANON_KEY"); process.exit(1); }

const rest = (path) => fetch(`${URL_}/rest/v1/${path}`, {
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
}).then((r) => r.json()).catch(() => null);

async function getCronSecret() {
  if (env.CRON_SECRET) return env.CRON_SECRET;
  const rows = await rest("app_settings?key=eq.soporte_config&select=value");
  const s = Array.isArray(rows) ? rows[0]?.value?.cron_secret : null;
  if (!s) {
    console.error("No pude leer el cron_secret con la anon key (RLS, que es lo correcto).");
    console.error("Exportalo y volve a correr:  CRON_SECRET=<secret> node scripts/agent-smoke.mjs");
    process.exit(1);
  }
  return s;
}

// El contexto NO se puede resolver con la anon key: clients, strategies y strategy_pages estan
// cerradas a anon desde el endurecimiento de RLS (devuelven 401 permission denied, que es lo
// correcto). Asi que los ids se pasan por entorno. No son secretos — son ids internos — pero
// cambian por entorno, asi que no van hardcodeados: se sacan con
//   select id, name from clients where name in ('Fabiana Carrasco','Pablo Valladolid');
async function contexto() {
  const need = ["SMOKE_CLIENT_OK", "SMOKE_CLIENT_VACIO", "SMOKE_STRATEGY", "SMOKE_FUNNEL", "SMOKE_AVATAR"];
  const faltan = need.filter((k) => !env[k]);
  if (faltan.length) {
    console.error(`Faltan ids de contexto: ${faltan.join(", ")}\n`);
    console.error("SMOKE_CLIENT_OK    = un cliente CON research+onboarding+DEL+avatares (post-llamada, todo listo)");
    console.error("SMOKE_CLIENT_VACIO = un cliente SIN nada cargado (pre-llamada) — para probar que no inventa");
    console.error("SMOKE_STRATEGY / SMOKE_FUNNEL / SMOKE_AVATAR = del cliente OK, para los 3 agentes de produccion");
    process.exit(1);
  }
  return {
    fabiana: env.SMOKE_CLIENT_OK, pablo: env.SMOKE_CLIENT_VACIO,
    strategy: env.SMOKE_STRATEGY, funnel: env.SMOKE_FUNNEL, avatar: env.SMOKE_AVATAR,
  };
}

const CASOS = (ctx) => [
  {
    key: "landing", nombre: "Copy de Funnels (EN PRODUCCION)",
    body: { subagent_key: "landing", client_id: ctx.fabiana, strategy_id: ctx.strategy, funnel_id: ctx.funnel, avatar_id: ctx.avatar,
      messages: [{ role: "user", content: "En una sola linea: cual de las 4 paginas del funnel es la mas importante y por que?" }] },
    espero: "que responda como siempre",
  },
  {
    key: "vsl", nombre: "VSL (EN PRODUCCION)",
    body: { subagent_key: "vsl", client_id: ctx.fabiana, strategy_id: ctx.strategy, funnel_id: ctx.funnel, avatar_id: ctx.avatar,
      messages: [{ role: "user", content: "En una sola linea: que es el Hook A?" }] },
    espero: "que responda como siempre",
  },
  {
    key: "anuncios", nombre: "Anuncios (EN PRODUCCION)",
    body: { subagent_key: "anuncios", client_id: ctx.fabiana, strategy_id: ctx.strategy, funnel_id: ctx.funnel, avatar_id: ctx.avatar,
      messages: [{ role: "user", content: "En una sola linea: que es un angulo Korex?" }] },
    espero: "que responda como siempre",
  },
  {
    key: "descubrimiento", nombre: "Descubrimiento · Pablo (pre-llamada, SIN funnel ni avatar)",
    // Sin funnel_id ni avatar_id A PROPOSITO: es la prueba de que trabaja a nivel cliente.
    body: { subagent_key: "descubrimiento", client_id: ctx.pablo,
      messages: [{ role: "user", content: "Hola, en que estamos con este cliente?" }] },
    espero: "que diga pre-llamada y que falta el research — SIN inventarlo",
  },
  {
    key: "descubrimiento", nombre: "Descubrimiento · Pablo pide el research (la trampa)",
    body: { subagent_key: "descubrimiento", client_id: ctx.pablo,
      messages: [{ role: "user", content: "Investiga al lider y su empresa, hace el research completo" }] },
    espero: "que se NIEGUE y diga quien lo aporta — si lo escribe, lo invento",
  },
];

async function main() {
  const soloUno = process.argv[2];
  const secret = await getCronSecret();
  const ctx = await contexto();
  console.log(`contexto: fabiana=${ctx.fabiana ? "ok" : "FALTA"} pablo=${ctx.pablo ? "ok" : "FALTA"} funnel=${ctx.funnel ? "ok" : "FALTA"} avatar=${ctx.avatar ? "ok" : "FALTA"}\n`);

  let malos = 0;
  for (const c of CASOS(ctx).filter((c) => !soloUno || c.key === soloUno)) {
    process.stdout.write(`— ${c.nombre}\n  espero: ${c.espero}\n`);
    const t0 = Date.now();
    const res = await fetch(`${URL_}/functions/v1/agent-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": secret },
      body: JSON.stringify({ mode: "chat", ...c.body }),
    });
    const j = await res.json().catch(() => null);
    const seg = Math.round((Date.now() - t0) / 100) / 10;
    if (!j?.ok) {
      malos++;
      console.log(`  >>> FALLO: ${j?.error || res.status} — ${j?.detail || ""}\n`);
      continue;
    }
    const r = String(j.reply || "").replace(/\s+/g, " ").trim();
    console.log(`  ok · ${seg}s · US$${j.cost_usd} · ${j.tokens?.in} in / ${j.tokens?.out} out`);
    console.log(`  ${r.slice(0, 400)}${r.length > 400 ? "…" : ""}\n`);
  }
  if (malos) { console.log(`${malos} agente(s) fallaron`); process.exit(1); }
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
