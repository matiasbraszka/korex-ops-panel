/**
 * branding-corpus-analizar.mjs — MIRA el branding real de los clientes y destila, por nicho,
 * qué estilo usa Korex de verdad.
 *
 * POR QUE EXISTE: las fichas de estilo por nicho las escribí yo a mano, con criterio de diseño
 * genérico. Contra el material real no coinciden: la ficha dice "evitar el dorado" y resulta que
 * el dorado sobre negro es la firma de la casa. Con fichas equivocadas, el botón "Generar
 * branding" produce logos correctos en abstracto y ajenos al estándar de Korex.
 *
 * Los títulos de los archivos no sirven para clasificar ("Copia de Recurso 100", "ChatGPT Image
 * 29 jul"), así que la única forma es MIRARLOS: se mandan a Claude con visión.
 *
 * Dos pasadas:
 *   1. Por cliente: clasifica cada imagen (hoja de identidad / logo del líder / logo de la
 *      empresa MLM / otra cosa) y extrae el estilo de las que sirven.
 *   2. Por nicho: junta los análisis y escribe la ficha, que se guarda en marketing_ad_library
 *      (part='branding_nicho') — la misma que ya lee la edge function.
 *
 * Se corre a mano, cuando haya material nuevo. No es un cron.
 *
 * Uso:
 *   node scripts/branding-corpus-analizar.mjs            # analiza y muestra, NO escribe
 *   node scripts/branding-corpus-analizar.mjs --guardar  # además reescribe las fichas
 *   node scripts/branding-corpus-analizar.mjs --cache    # reusa el analisis ya hecho (no re-mira)
 *
 * Necesita scripts/agent-fn-local.env (el mismo del runner local).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ENV_FILE = join(process.cwd(), "scripts", "agent-fn-local.env");
const CACHE = join(process.cwd(), "scripts", ".branding-corpus-cache.json");
const GUARDAR = process.argv.includes("--guardar");
const USAR_CACHE = process.argv.includes("--cache");

// Cuántas imágenes mirar por cliente. Con más de esto se paga de más sin aprender nada nuevo:
// un cliente sube 27 archivos pero suelen ser variaciones del mismo logo.
const POR_CLIENTE = 6;
const MODELO = "claude-sonnet-5";

if (!existsSync(ENV_FILE)) { console.error(`Falta ${ENV_FILE}`); process.exit(1); }
const env = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const SB = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

const rest = async (q) => {
  const r = await fetch(`${SB}/rest/v1/${q}`, { headers: H });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
};

const anthropicKey = (await rest("secure_config?select=value&key=eq.anthropic_api_key"))[0]?.value;
if (!anthropicKey) { console.error("Falta anthropic_api_key en secure_config"); process.exit(1); }

async function claude(system, content, tool) {
  for (let intento = 1; intento <= 3; intento++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELO, max_tokens: 4000, thinking: { type: "disabled" },
        system, messages: [{ role: "user", content }],
        tools: [tool], tool_choice: { type: "tool", name: tool.name },
      }),
      signal: AbortSignal.timeout(180000),
    });
    if (r.ok) {
      const d = await r.json();
      return d.content?.find((c) => c.type === "tool_use")?.input || null;
    }
    const txt = await r.text();
    if (r.status !== 429 && r.status < 500) throw new Error(`${r.status} ${txt.slice(0, 300)}`);
    await new Promise((res) => setTimeout(res, 3000 * intento));
  }
  throw new Error("la API no respondió tras 3 intentos");
}

// ── Pasada 1: mirar las imágenes de cada cliente ─────────────────────────────

const TOOL_CLIENTE = {
  name: "emit_analisis_cliente",
  description: "Clasifica las imágenes de branding de un cliente y describe el estilo de las que son identidad del líder.",
  input_schema: {
    type: "object",
    properties: {
      piezas: {
        type: "array",
        description: "Una entrada por imagen recibida, en el mismo orden.",
        items: {
          type: "object",
          properties: {
            tipo: {
              type: "string",
              enum: ["hoja_identidad", "logo_lider", "logo_empresa_mlm", "captura", "otro"],
              description: "hoja_identidad = lámina con paleta+tipografía+estilo. logo_lider = el logo de la marca personal o del equipo. logo_empresa_mlm = el logo de la empresa a la que representa (NO es su marca). captura = screenshot. otro = cualquier otra cosa.",
            },
            descripcion: { type: "string", description: "Qué se ve, en una frase." },
          },
          required: ["tipo", "descripcion"],
        },
      },
      util: { type: "boolean", description: "true si al menos una imagen es hoja_identidad o logo_lider." },
      estilo: {
        type: "object",
        description: "Solo si util=true: el estilo de la identidad de ESTE líder.",
        properties: {
          colores: { type: "array", items: { type: "string" }, description: "HEX de los colores dominantes que ves, en mayúsculas." },
          familia_cromatica: { type: "string", description: "Cómo describirías la paleta en pocas palabras. Ej: 'oro sobre negro'." },
          tipo_logo: { type: "string", enum: ["monograma", "logotipo", "isotipo", "imagotipo"], description: "logotipo = el nombre escrito. monograma = iniciales. isotipo = símbolo solo. imagotipo = símbolo + nombre." },
          lleva_nombre_completo: { type: "boolean", description: "¿El logo muestra el nombre completo del líder, o solo iniciales/símbolo?" },
          lleva_tagline: { type: "boolean", description: "¿Hay una bajada o lema debajo del nombre?" },
          tagline: { type: "string", description: "El texto del lema si lo hay." },
          acabado: { type: "string", enum: ["plano", "degradado", "metalico", "mixto"], description: "¿El color es plano o tiene degradado/efecto metálico?" },
          tipografia: { type: "string", description: "Qué tipografía o qué clase de tipografía se ve." },
          adjetivos: { type: "array", items: { type: "string" }, description: "2 a 4 adjetivos que describan el registro. Ej: premium, elegante, tecnológico." },
          nivel_elaboracion: { type: "string", enum: ["muy_simple", "simple", "elaborado", "muy_elaborado"], description: "Cuánto detalle tiene: muy_simple = una letra pelada; elaborado = monograma con marco, ornamento o composición." },
          observacion: { type: "string", description: "Lo que más define visualmente a esta marca, en una frase." },
        },
      },
    },
    required: ["piezas", "util"],
  },
};

const SYSTEM_CLIENTE = `Sos un director de arte analizando el branding REAL de clientes de una agencia de
marketing para líderes de network marketing.

Te paso las imágenes que hay en la carpeta "Branding" de un cliente. Están sin ordenar y mezcladas:
puede haber láminas de identidad visual, el logo del líder, el logo de la EMPRESA MLM a la que
representa (que NO es su marca personal), capturas de pantalla y archivos sueltos.

Clasificá cada una y, si hay identidad propia del líder, describí su estilo con precisión y sin
adornos. Lo que importa es qué hace ESTA agencia en la práctica, no qué sería correcto en abstracto.
No inventes: si una imagen no se entiende, ponela como "otro".`;

async function analizarCliente(cliente, imgs) {
  const content = [];
  for (const im of imgs) {
    const res = await fetch(im.public_url);
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4_500_000) continue; // el límite de la API es 5 MB por imagen
    content.push({
      type: "image",
      source: { type: "base64", media_type: im.mime_type === "image/jpeg" ? "image/jpeg" : "image/png", data: buf.toString("base64") },
    });
  }
  if (!content.length) return null;
  content.push({
    type: "text",
    text: `Cliente: ${cliente.name}\nNicho: ${cliente.niche || "(sin cargar)"}\nEmpresa MLM: ${cliente.company || "(sin cargar)"}\n\nSon ${content.length} imágenes de su carpeta Branding, en orden.`,
  });
  return await claude(SYSTEM_CLIENTE, content, TOOL_CLIENTE);
}

// ── Pasada 2: destilar la ficha de cada nicho ────────────────────────────────

const TOOL_FICHA = {
  name: "emit_ficha_nicho",
  description: "Escribe la ficha de estilo de un nicho a partir del branding real observado.",
  input_schema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "La ficha completa en texto plano, lista para inyectar en un prompt. Máximo 1400 caracteres. Estructura obligatoria, con estos títulos exactos:\nNICHO: <nombre>\nREGISTRO: <qué transmite>\nFAMILIAS CROMÁTICAS QUE FUNCIONAN: <con HEX concretos, sacados de lo observado>\nEVITAR: <lo que no aparece o desentona>\nTIPO DE LOGO: <qué formato usa la casa y con qué nivel de elaboración>\nACABADO: <plano / degradado / metálico>\nSÍMBOLOS PROHIBIDOS: <clichés del rubro>\nTIPOGRAFÍA: <la que se observa>",
      },
      resumen: { type: "string", description: "Una frase para el reporte: qué se aprendió de este nicho." },
      basado_en: { type: "number", description: "Cuántos clientes con material real sustentan esta ficha." },
    },
    required: ["content", "resumen", "basado_en"],
  },
};

const SYSTEM_FICHA = `Escribís la ficha de estilo de un nicho para un generador de branding.

La ficha se le pasa VERBATIM a la IA que después diseña logos y paletas, así que tiene que ser
concreta y accionable: HEX reales, formatos reales, nada de generalidades.

Basate SOLO en el branding real observado que te paso. Si el material muestra que la casa usa algo
que un manual de diseño desaconsejaría (por ejemplo dorado sobre negro), la ficha tiene que decir
que se USA: el objetivo es replicar el estándar de esta agencia, no corregirlo.

Si el material de este nicho es poco o poco concluyente, decilo en la ficha con honestidad en vez
de inventar reglas.`;

// ── Correr ───────────────────────────────────────────────────────────────────

let analisis;
if (USAR_CACHE && existsSync(CACHE)) {
  analisis = JSON.parse(readFileSync(CACHE, "utf8"));
  console.log(`Reusando el análisis de ${analisis.length} clientes (${CACHE})\n`);
} else {
  console.log("Buscando material de branding real…");
  // Dos consultas y se juntan acá: funnel_resources es una tabla vieja y no tiene clave foránea
  // declarada contra clients, así que PostgREST no sabe hacer el join.
  const [filas, clientes] = await Promise.all([
    rest("funnel_resources?select=title,public_url,mime_type,client_id" +
      "&bucket_key=eq.branding&strategy_id=is.null&meta=is.null&kind=eq.image" +
      "&mime_type=in.(image/png,image/jpeg)&order=created_at.desc&limit=400"),
    rest("clients?select=id,name,niche,company"),
  ]);
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const porCliente = new Map();
  for (const f of filas) {
    const cliente = porId.get(f.client_id);
    if (!cliente) continue;
    if (!porCliente.has(f.client_id)) porCliente.set(f.client_id, { cliente, imgs: [] });
    const e = porCliente.get(f.client_id);
    if (e.imgs.length < POR_CLIENTE) e.imgs.push(f);
  }
  console.log(`${filas.length} imágenes en ${porCliente.size} clientes. Miro hasta ${POR_CLIENTE} por cliente.\n`);

  analisis = [];
  for (const [id, { cliente, imgs }] of porCliente) {
    process.stdout.write(`  ${cliente.name.padEnd(24)} ${String(imgs.length).padStart(2)} img … `);
    // Si el lote falla, se reintenta con menos imágenes. Algunas piezas son enormes (láminas de
    // identidad de varios MB) y el request entero se cae por una sola: mandando de a pocas, el
    // cliente igual se analiza en vez de perderse del corpus.
    let r = null, err = null;
    for (const n of [imgs.length, 3, 1]) {
      if (n > imgs.length) continue;
      try { r = await analizarCliente(cliente, imgs.slice(0, n)); if (r) break; }
      catch (e) { err = e; }
    }
    if (!r) { console.log(`ERROR: ${String(err?.message || "sin imágenes legibles").slice(0, 140)}`); continue; }
    analisis.push({ client_id: id, cliente, ...r });
    const e = r.estilo;
    console.log(r.util ? `${e?.tipo_logo || "?"} · ${e?.familia_cromatica || "?"} · ${e?.nivel_elaboracion || "?"}` : "nada útil");
  }
  writeFileSync(CACHE, JSON.stringify(analisis, null, 2));
  console.log(`\nAnálisis guardado en ${CACHE}\n`);
}

// Agrupar por nicho. Los que no tienen nicho cargado van a 'general'.
const utiles = analisis.filter((a) => a.util && a.estilo);
console.log(`${utiles.length} de ${analisis.length} clientes tienen identidad propia observable.\n`);

const norm = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const ALIAS = { crypto: "inversiones", bitradex: "inversiones", zinzino: "bienestar", nutrivida: "nutricion", "network marketing": "general", "seguros de vida": "seguros", nutricion: "nutricion", "": "general" };
const porNicho = new Map();
for (const a of utiles) {
  const n = norm(a.cliente.niche);
  const nicho = ALIAS[n] || n || "general";
  if (!porNicho.has(nicho)) porNicho.set(nicho, []);
  porNicho.get(nicho).push(a);
}

// Todo junto también alimenta 'general': es el estándar transversal de la casa.
if (utiles.length) porNicho.set("general", utiles);

console.log("Destilando fichas por nicho…\n");
const fichas = [];
for (const [nicho, lista] of porNicho) {
  const material = lista.map((a) => {
    const e = a.estilo;
    return `- ${a.cliente.name} (${a.cliente.company || "?"}): ${e.tipo_logo}, ${e.familia_cromatica}, colores ${(e.colores || []).join(" ")}, acabado ${e.acabado}, ${e.lleva_nombre_completo ? "CON nombre completo" : "sin nombre completo"}${e.lleva_tagline ? `, tagline "${e.tagline}"` : ""}, tipografía ${e.tipografia}, elaboración ${e.nivel_elaboracion}, adjetivos: ${(e.adjetivos || []).join("/")}. ${e.observacion}`;
  }).join("\n");

  process.stdout.write(`  ${nicho.padEnd(14)} (${lista.length} clientes) … `);
  try {
    const r = await claude(SYSTEM_FICHA, [{ type: "text", text: `NICHO: ${nicho}\n\nBRANDING REAL OBSERVADO:\n${material}` }], TOOL_FICHA);
    if (r?.content) { fichas.push({ nicho, ...r }); console.log(r.resumen.slice(0, 90)); }
    else console.log("sin ficha");
  } catch (err) { console.log(`ERROR: ${String(err.message).slice(0, 80)}`); }
}

console.log("\n" + "=".repeat(78));
for (const f of fichas) {
  console.log(`\n### ${f.nicho.toUpperCase()}  (basado en ${f.basado_en} clientes)\n`);
  console.log(f.content);
}
console.log("\n" + "=".repeat(78));

if (!GUARDAR) {
  console.log("\nEsto fue una PRUEBA: no se escribió nada.");
  console.log("Para reescribir las fichas:  node scripts/branding-corpus-analizar.mjs --cache --guardar\n");
  process.exit(0);
}

// Guardar. Se conservan las fichas escritas a mano de los nichos sin material observado.
console.log("\nGuardando fichas…");
for (const f of fichas) {
  const id = `bn_${f.nicho.replace(/[^a-z0-9]/g, "_")}`;
  const body = {
    id, part: "branding_nicho", niche: f.nicho, title: `Branding — ${f.nicho} (del material real)`,
    content: f.content, char_count: f.content.length, status: "approved",
  };
  const r = await fetch(`${SB}/rest/v1/marketing_ad_library?on_conflict=id`, {
    method: "POST",
    headers: { ...H, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body),
  });
  console.log(`  ${r.ok ? "ok " : "FALLO "} ${id}${r.ok ? "" : " · " + (await r.text()).slice(0, 120)}`);
}
console.log("\nListo. Las fichas nuevas ya las usa el botón Generar branding.\n");
