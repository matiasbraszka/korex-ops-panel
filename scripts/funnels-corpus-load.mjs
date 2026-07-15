/**
 * funnels-corpus-load.mjs — carga el corpus de entrenamiento del agente de Copy de Funnels.
 *
 * Clon de vsl-corpus-load.mjs: mismo RPC (marketing_corpus_ingest), mismo secret, misma
 * verificacion MD5 fila por fila. Con ON CONFLICT DO UPDATE una corrupcion silenciosa
 * pisaria datos buenos, asi que el checksum no es opcional.
 *
 * Lee lo que produce funnels-corpus-parse.mjs y arma cuatro clases de fila:
 *   cf_blueprint — SOP + errores comunes (capa estable del prompt, siempre presente)
 *   cf_section   — cada fase del blueprint + Secciones Graficas (las recupera el scorer)
 *   cf_ficha     — 31: resumen de cada funnel, es lo que el scorer puntua
 *   cf_pagina    — 119: el copy real, una fila POR PAGINA
 *
 * Una fila por pagina y no por funnel: un funnel entero pesa ~8 KB y los top-3 no entrarian
 * comodos, pero sobre todo asi se puede auditar una pagina suelta trayendo esa misma pagina
 * de varios funnels comparables.
 *
 * Uso:
 *   node scripts/funnels-corpus-load.mjs --dir <carpeta-con-los-json> [--dry-run]
 *
 * Requiere en el entorno (o en voomly-export/.env):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, VSL_INGEST_SECRET
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { CLIENTES } from "./korex-clientes.mjs";

const args = process.argv.slice(2);
const DIR = args[args.indexOf("--dir") + 1] || ".";
const DRY = args.includes("--dry-run");

const PARTS = ["cf_blueprint", "cf_section", "cf_ficha", "cf_pagina"];

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

function buildRows() {
  const funnels = JSON.parse(readFileSync(join(DIR, "funnels_corpus.json"), "utf8"));
  const chunks = JSON.parse(readFileSync(join(DIR, "funnels_blueprint_chunks.json"), "utf8"));
  const rows = [];

  // El blueprint son 2 docs (SOP + errores) y en el prompt va uno solo: se concatenan en
  // mal_cf_blueprint. Las secciones quedan sueltas para que el scorer traiga la fase pedida.
  const bp = chunks.filter((c) => c.part === "cf_blueprint");
  if (!bp.length) throw new Error("no hay chunks cf_blueprint");
  const bpText = bp.map((c) => `===== ${c.title} =====\n${c.content}`).join("\n\n");
  rows.push({
    id: "mal_cf_blueprint", part: "cf_blueprint", niche: null,
    niche_tags: [...new Set(bp.flatMap((c) => c.niche_tags))], avatar: null,
    title: "BLUEPRINT MAESTRO DE FUNNELS — SOP + errores comunes",
    content: bpText, char_count: bpText.length,
    position: 0, client_id: null, metrics: null, status: "approved",
  });

  chunks.filter((c) => c.part === "cf_section").forEach((c, i) => {
    rows.push({
      id: `mal_cf_sec_${String(i).padStart(2, "0")}`, part: "cf_section", niche: null,
      niche_tags: c.niche_tags, avatar: null, title: c.title,
      content: c.content, char_count: c.content.length,
      position: i, client_id: null, metrics: null, status: "approved",
    });
  });

  funnels.forEach((f, i) => {
    const client_id = CLIENTES[f.cliente] || null;
    if (!client_id) throw new Error(`cliente sin client_id en korex-clientes.mjs: "${f.cliente}"`);
    // Sin metricas de performance: estos funnels no tienen retencion ni CPL comparables.
    // Solo se sabe si esta publicado. No se mapea publicado -> "ganador": seria inventar
    // evidencia que no existe (el scorer de agent-chat da +2 a los ganadores).
    const metrics = {
      funnel_id: f.funnel_id, cliente: f.cliente, funnel: f.funnel,
      estrategia: f.estrategia, estado: f.estado, publicado: f.publicado,
      paginas: f.paginas.map((p) => p.fase),
      ...(f.url ? { url: f.url } : {}),
    };
    const tit = `${f.cliente} · ${f.funnel}${f.publicado ? " · [publicado]" : ""}`;
    const base = {
      niche: f.nicho, niche_tags: f.niche_tags, avatar: f.avatar, client_id, metrics,
      position: i, status: "approved",
    };
    rows.push({
      ...base, id: `mal_cf_ficha_${f.funnel_id}`, part: "cf_ficha",
      title: `FICHA — ${tit}`, content: f.ficha_text, char_count: f.ficha_text.length,
    });
    for (const p of f.paginas) {
      rows.push({
        ...base,
        id: `mal_cf_pag_${f.funnel_id}__${p.fase}`,
        part: "cf_pagina",
        // la fase entra en los tags: el retrieval filtra por ahi cuando se pide una pagina suelta
        niche_tags: [...new Set([p.fase, ...f.niche_tags])],
        metrics: { ...metrics, fase: p.fase, titulo_del: p.titulo_del },
        title: `${p.label} — ${tit}`,
        content: p.text, char_count: p.text.length,
      });
    }
  });
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
  console.log(`filas: ${rows.length}  (blueprint ${by("cf_blueprint")} · secciones ${by("cf_section")} · fichas ${by("cf_ficha")} · paginas ${by("cf_pagina")})`);
  console.log(`chars: ${rows.reduce((a, r) => a + r.content.length, 0).toLocaleString()}`);

  const fases = {};
  for (const r of rows.filter((r) => r.part === "cf_pagina")) fases[r.metrics.fase] = (fases[r.metrics.fase] || 0) + 1;
  console.log("paginas por fase:", fases);
  console.log(`publicados: ${rows.filter((r) => r.part === "cf_ficha" && r.metrics.publicado).length}/${by("cf_ficha")}`);

  if (DRY) return console.log("\n--dry-run: no se escribio nada");
  if (!URL_ || !KEY || !SECRET) throw new Error("faltan SUPABASE_URL / SUPABASE_ANON_KEY / VSL_INGEST_SECRET");

  let total = 0;
  for (let i = 0; i < rows.length; i += 10) {
    const lote = rows.slice(i, i + 10);
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
