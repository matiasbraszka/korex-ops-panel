/**
 * vsl-corpus-load.mjs — carga el corpus de entrenamiento del agente de VSL.
 *
 * Lee los JSON que produce el parser (vsl_corpus.json + blueprint_chunks.json) y los
 * sube a marketing_ad_library via el RPC marketing_corpus_ingest (SECURITY DEFINER +
 * secret, mismo patron que vsl_voomly_ingest: desde el endurecimiento de RLS del 17/06
 * anon no escribe directo).
 *
 * El contenido va del archivo al RPC sin pasar por ningun intermediario que lo re-escriba,
 * y al final se verifica con MD5 fila por fila contra lo que quedo en la DB. Con
 * ON CONFLICT DO UPDATE una corrupcion silenciosa pisaria datos buenos, asi que el
 * checksum no es opcional.
 *
 * Uso:
 *   node scripts/vsl-corpus-load.mjs --dir <carpeta-con-los-json> [--dry-run]
 *
 * Requiere en el entorno (o en voomly-export/.env):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, VSL_INGEST_SECRET
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const args = process.argv.slice(2);
const DIR = args[args.indexOf("--dir") + 1] || ".";
const DRY = args.includes("--dry-run");

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
    // partir en el PRIMER '=' en vez de regexear la linea entera: el valor puede
    // contener cualquier cosa (=, comillas, simbolos) y no debe condicionar el match
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

const CLIENTES = {
  "Alex Quintero": "c_1775304975528_zdaci5", "Antonio De la Cruz": "c_1777477572874_hdkcr7",
  "Belen Griner": "c_1776436674635_goq5cn", Castor: "c_1781537622066_9et1pr",
  "Corina Grosu": "c_1775304975528_ql5c26", "Daniela Mermeria": "c_1775304975528_fpi5bq",
  "Fabiana Carrasco": "c_1781546055319_vuvnw2", "Gabi Espino": "c_1775304975528_1gst8e",
  "Jacquie Marquez": "c_1775304975528_ci40ns", Janeyling: "c_1775304975528_c8vt0z",
  "Jose Luis Rodriguez": "c_1775304975528_n5jun4", "Jose Piquer": "c_1777295204760_okc43e",
  "Kate Baltodano": "c_1775304975528_8f1wt0", "Marta Torrico": "c_1775304975528_pe11ka",
  "Melany Mille": "c_1775304975528_01fr6y", "Monica Vozmediano": "c_1775304975528_vljqub",
  "Oscar Palayo": "c_1775304975528_zja4si", "Oscar Rubio": "c_1777146957573_wjlx3y",
  Priscila: "c_1775304975528_i7wpl7", "Sergio Aldazabal": "c_1780874493120_19fbxk",
  "Sergio Canovas": "c_1775304975528_pzu8sk", "Summit Network": "c_1775304975528_z5uiq7",
};

const md5 = (s) => createHash("md5").update(s, "utf8").digest("hex");

function buildRows() {
  const recs = JSON.parse(readFileSync(join(DIR, "vsl_corpus.json"), "utf8"));
  const chunks = JSON.parse(readFileSync(join(DIR, "blueprint_chunks.json"), "utf8"));
  const rows = [];

  chunks.forEach((c, i) => {
    rows.push({
      id: c.part === "vsl_blueprint" ? "mal_vsl_blueprint" : `mal_vsl_sec_${String(i).padStart(2, "0")}`,
      part: c.part, niche: null, niche_tags: c.niche_tags, avatar: null,
      title: c.title, content: c.content, char_count: c.content.length,
      position: i, client_id: null, metrics: null, status: "approved",
    });
  });

  for (const r of recs) {
    const client_id = CLIENTES[r.cliente] || null;
    const avatar = r.avatares.map((a) => a.nombre).join(" | ");
    const metrics = {
      ...r.metrics,
      vsl_id: r.vsl_id, cliente: r.cliente, tipo: r.tipo,
      duracion_min: r.duracion_min, palabras: r.palabras, completo: r.completo,
      ...(r.flags ? { flags: r.flags } : {}),
    };
    const tit = `VSL ${r.vsl_id} · ${r.cliente} · ${r.nicho} · ${r.tipo} · ${r.duracion_min} min · [${metrics.tier}]`;
    const base = {
      niche: r.nicho, niche_tags: r.niche_tags, avatar, client_id, metrics,
      position: Number(r.vsl_id), status: "approved",
    };
    rows.push({ ...base, id: `mal_vsl_ficha_${r.vsl_id}`, part: "vsl_ficha", title: `FICHA — ${tit}`, content: r.ficha_text, char_count: r.ficha_text.length });
    for (const g of r.guiones) {
      const solo = r.guiones.length === 1;
      rows.push({
        ...base,
        id: `mal_vsl_guion_${r.vsl_id}${solo ? "" : `_${g.n}`}`,
        part: "vsl_guion",
        title: `GUIÓN — ${tit}${solo ? "" : ` · guion ${g.n}`}`,
        content: g.text, char_count: g.text.length,
      });
    }
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
  console.log(`filas: ${rows.length}  (blueprint ${by("vsl_blueprint")} · secciones ${by("vsl_section")} · fichas ${by("vsl_ficha")} · guiones ${by("vsl_guion")})`);
  console.log(`chars: ${rows.reduce((a, r) => a + r.content.length, 0).toLocaleString()}`);

  const tiers = {};
  for (const r of rows.filter((r) => r.part === "vsl_ficha")) tiers[r.metrics.tier] = (tiers[r.metrics.tier] || 0) + 1;
  console.log("tiers:", tiers);

  if (DRY) return console.log("\n--dry-run: no se escribio nada");
  if (!URL_ || !KEY || !SECRET) throw new Error("faltan SUPABASE_URL / SUPABASE_ANON_KEY / VSL_INGEST_SECRET");

  // lotes chicos: el RPC recibe el jsonb entero en memoria
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
  const checks = await rpc("marketing_corpus_checksums", {
    p_secret: SECRET,
    p_parts: ["vsl_blueprint", "vsl_section", "vsl_ficha", "vsl_guion"],
  });
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
