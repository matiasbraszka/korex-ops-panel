/**
 * funnels-corpus-parse.mjs — arma el corpus del agente de Copy de Funnels desde los .docx.
 *
 * El parser equivalente del agente de VSL nunca se versiono y se perdio: los JSON estaban,
 * pero no habia con que rehacerlos. Este si va al repo.
 *
 * Produce dos JSON que consume funnels-corpus-load.mjs:
 *   funnels_corpus.json           — 31 funnels: ficha + una entrada por pagina escrita
 *   funnels_blueprint_chunks.json — el SOP + errores comunes (blueprint) y cada fase (secciones)
 *
 * Uso:
 *   node scripts/funnels-corpus-parse.mjs --docs <carpeta-blueprints> --ejemplos <Copy funnels Korex.docx> --out <carpeta>
 *
 * Los .docx se leen sin dependencias: un docx es un zip y las entradas van con deflate crudo,
 * asi que alcanza con el central directory + zlib.inflateRawSync.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { join, basename } from "node:path";

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const DOCS = arg("--docs");
const EJEMPLOS = arg("--ejemplos");
const OUT = arg("--out", ".");
if (!DOCS || !EJEMPLOS) {
  console.error("uso: node scripts/funnels-corpus-parse.mjs --docs <carpeta> --ejemplos <docx> --out <carpeta>");
  process.exit(1);
}

// ---------- docx -> texto ----------

/** Saca word/document.xml del docx leyendo el central directory del zip. */
function docxXml(path) {
  const buf = readFileSync(path);
  // End of Central Directory: firma 0x06054b50, se busca desde el final (puede haber comentario)
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error(`${basename(path)}: no parece un zip (sin EOCD)`);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`${basename(path)}: central directory corrupto`);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    if (name === "word/document.xml") {
      // el local header repite los largos y puede diferir del central: hay que leerlo de ahi
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + compSize);
      return method === 0 ? raw.toString("utf8") : inflateRawSync(raw).toString("utf8");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${basename(path)}: sin word/document.xml`);
}

const ENTIDADES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

/** XML de Word -> lineas de texto, una por parrafo. */
function xmlLineas(xml) {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, " ")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTIDADES[m])
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .split("\n")
    .map((l) => l.replace(/\u00a0/g, " ").trimEnd());
}

const docxLineas = (p) => xmlLineas(docxXml(p));

// ---------- utilidades ----------

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

const STOP = new Set(("de la el los las un una unos unas y o que en con por para sin sobre entre su sus del al lo se es son " +
  "como mas muy pero si no ya hay ha han este esta estos estas ese esa aquel cual quien donde cuando anos ano " +
  "personas gente quieren buscan tienen hacer tener mientras desde hasta cada todo toda todos todas").split(" "));

/** tokens utiles de un texto, para niche_tags */
function tags(...partes) {
  const out = [];
  for (const t of norm(partes.filter(Boolean).join(" ")).split(/[^a-z0-9]+/)) {
    if (t.length > 3 && !STOP.has(t) && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 14);
}

const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 46);

// ---------- ejemplos: 31 funnels ----------

const FASES = [
  { re: /^1\.\s*PRE-LANDING\b/, fase: "prelanding", label: "PRE-LANDING" },
  { re: /^2\.\s*LANDING VSL\b/, fase: "landing", label: "LANDING VSL" },
  { re: /^3\.\s*FORMULARIO\b/, fase: "formulario", label: "FORMULARIO" },
  { re: /^4\.\s*THANK YOU PAGE\b/, fase: "thankyou", label: "THANK YOU PAGE" },
];
const AUSENTE = /no esta en el DEL de este funnel/i;

function parseEjemplos(path) {
  const L = docxLineas(path);
  // cada funnel arranca en una linea "Avatar" sola; las 2 lineas no vacias previas son
  // cliente y nombre del funnel. El indice del inicio no tiene "Avatar" solo, se descarta solo.
  const anclas = [];
  for (let i = 0; i < L.length; i++) if (L[i].trim() === "Avatar") anclas.push(i);
  if (!anclas.length) throw new Error("no se encontro ninguna ancla 'Avatar'");

  const noVacias = (desde, cuantas) => {
    const out = [];
    for (let i = desde; i >= 0 && out.length < cuantas; i--) if (L[i].trim()) out.unshift(L[i].trim());
    return out;
  };

  const funnels = [];
  anclas.forEach((a, idx) => {
    const fin = idx + 1 < anclas.length ? anclas[idx + 1] - 2 : L.length; // -2: cliente+funnel del siguiente
    const [cliente, funnel] = noVacias(a - 1, 2);
    const cuerpo = L.slice(a, fin);

    // campos: "Etiqueta" en una linea, valor en la siguiente no vacia
    const campo = (etiqueta) => {
      const i = cuerpo.findIndex((l) => l.trim() === etiqueta);
      if (i < 0) return "";
      for (let j = i + 1; j < cuerpo.length; j++) if (cuerpo[j].trim()) return cuerpo[j].trim();
      return "";
    };
    const avatar = campo("Avatar");
    const nicho = campo("Nicho / segmentación");
    const estrategia = campo("Estrategia");
    const estado = campo("Estado");
    const url = campo("URL");

    // cortes de las 4 fases dentro del cuerpo
    const cortes = [];
    for (let i = 0; i < cuerpo.length; i++) {
      const f = FASES.find((x) => x.re.test(cuerpo[i].trim()));
      if (f) cortes.push({ i, ...f });
    }

    const paginas = [];
    cortes.forEach((c, k) => {
      const hasta = k + 1 < cortes.length ? cortes[k + 1].i : cuerpo.length;
      const bloque = cuerpo.slice(c.i + 1, hasta);
      if (bloque.some((l) => AUSENTE.test(norm(l)))) return; // la pagina no existe: no se inventa

      // saltear la bajada descriptiva y quedarse desde "Pestaña del DEL: «...»"
      const p = bloque.findIndex((l) => /^Pestaña del DEL:/.test(l.trim()));
      const tituloDel = p >= 0 ? (bloque[p].match(/«(.+?)»/)?.[1] || "") : "";
      const text = bloque.slice(p >= 0 ? p + 1 : 0).join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (text) paginas.push({ fase: c.fase, label: c.label, titulo_del: tituloDel, text });
    });

    funnels.push({
      funnel_id: `${slug(cliente)}__${slug(funnel)}`,
      cliente, funnel, avatar, nicho, estrategia, estado, url,
      publicado: !/^no\b/i.test(norm(estado)),
      niche_tags: tags(nicho, funnel, avatar),
      paginas,
    });
  });
  return funnels;
}

/** Ficha: lo que el scorer lee para elegir el caso mas cercano. Chica a proposito. */
function fichaText(f) {
  const muestra = (fase, n) => {
    const p = f.paginas.find((x) => x.fase === fase);
    if (!p) return "(no está en el DEL)";
    return p.text.split("\n").filter((l) => l.trim()).slice(0, n).join(" / ").slice(0, 240);
  };
  return [
    `FUNNEL — ${f.cliente} · ${f.funnel}`,
    `Avatar: ${f.avatar}`,
    `Nicho: ${f.nicho}`,
    `Estrategia: ${f.estrategia} · Estado: ${f.estado}`,
    `Páginas escritas: ${f.paginas.map((p) => p.label).join(", ") || "ninguna"}`,
    "",
    `Arranque de la pre-landing: ${muestra("prelanding", 3)}`,
    `Arranque de la landing VSL: ${muestra("landing", 3)}`,
    `Formulario: ${muestra("formulario", 4)}`,
    `Thank you page: ${muestra("thankyou", 3)}`,
  ].join("\n");
}

// ---------- blueprints ----------

// Un archivo por pieza. El (5) queda afuera a proposito: es un subconjunto del (4) y si entra,
// el agente puede tomar ese esqueleto flaco como el estandar.
const BLUEPRINT = [
  { file: "Flujos de Landings (6).docx", part: "cf_blueprint", title: "SOP — El proceso paso a paso", tags: ["sop", "proceso", "funnel"] },
  { file: "Flujos de Landings (3).docx", part: "cf_blueprint", title: "Errores comunes y cómo evitarlos", tags: ["errores", "auditoria", "checklist"] },
  { file: "Flujos de Landings (4).docx", part: "cf_section", title: "PRE-LANDING — Blueprint completo", tags: ["prelanding", "pre", "landing", "titular", "hero", "formulario"] },
  { file: "Flujos de Landings.docx", part: "cf_section", title: "LANDING VSL — Blueprint completo", tags: ["landing", "vsl", "video", "titular", "testimonios", "faq"] },
  { file: "Flujos de Landings (1).docx", part: "cf_section", title: "FORMULARIO — Blueprint completo", tags: ["formulario", "quiz", "preguntas", "calificacion", "filtro"] },
  { file: "Flujos de Landings (2).docx", part: "cf_section", title: "THANK YOU PAGE — Blueprint completo", tags: ["thankyou", "thank", "gracias", "whatsapp", "cierre"] },
];

// "Secciones Graficas" solo existe en el consolidado suelto; se recorta de ahi.
const GRAFICAS = { file: "New folder/Flujos de Landings (2).docx", desde: /^3️⃣\s*Secciones Graficas/, title: "Secciones Gráficas", tags: ["graficas", "diseno", "visual", "secciones", "modulos"] };

function limpiar(lineas) {
  return lineas.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function parseBlueprints(dir) {
  const chunks = [];
  for (const b of BLUEPRINT) {
    const p = join(dir, b.file);
    if (!existsSync(p)) throw new Error(`falta el blueprint: ${b.file}`);
    const content = limpiar(docxLineas(p));
    if (!content) throw new Error(`${b.file}: quedo vacio tras el parseo`);
    chunks.push({ part: b.part, title: b.title, niche_tags: b.tags, content, source: b.file });
  }

  const gp = join(dir, GRAFICAS.file);
  if (!existsSync(gp)) throw new Error(`falta el consolidado con Secciones Gráficas: ${GRAFICAS.file}`);
  const L = docxLineas(gp);
  const i = L.findIndex((l) => GRAFICAS.desde.test(l.trim()));
  if (i < 0) throw new Error(`${GRAFICAS.file}: no se encontro el corte de Secciones Graficas`);
  const content = limpiar(L.slice(i + 1));
  if (!content) throw new Error("Secciones Gráficas: quedo vacio");
  chunks.push({ part: "cf_section", title: GRAFICAS.title, niche_tags: GRAFICAS.tags, content, source: GRAFICAS.file });

  return chunks;
}

// ---------- main ----------

const funnels = parseEjemplos(EJEMPLOS);
const chunks = parseBlueprints(DOCS);

for (const f of funnels) f.ficha_text = fichaText(f);

const paginas = funnels.reduce((a, f) => a + f.paginas.length, 0);
const ausentes = funnels.length * 4 - paginas;
const chars = funnels.reduce((a, f) => a + f.ficha_text.length + f.paginas.reduce((b, p) => b + p.text.length, 0), 0)
  + chunks.reduce((a, c) => a + c.content.length, 0);

console.log(`funnels: ${funnels.length}  ·  clientes: ${new Set(funnels.map((f) => f.cliente)).size}`);
console.log(`paginas: ${paginas} escritas · ${ausentes} ausentes (de ${funnels.length * 4})`);
console.log(`blueprint: ${chunks.filter((c) => c.part === "cf_blueprint").length} · secciones: ${chunks.filter((c) => c.part === "cf_section").length}`);
console.log(`chars: ${chars.toLocaleString()}`);

const flacas = funnels.filter((f) => !f.nicho || !f.avatar || !f.paginas.length);
if (flacas.length) {
  console.log("\n! funnels sin nicho/avatar/paginas — revisar antes de cargar:");
  flacas.forEach((f) => console.log(`  ${f.funnel_id}  nicho:${!!f.nicho} avatar:${!!f.avatar} pags:${f.paginas.length}`));
}
const dup = funnels.map((f) => f.funnel_id).filter((id, i, a) => a.indexOf(id) !== i);
if (dup.length) { console.error("\nERROR: funnel_id duplicados:", [...new Set(dup)].join(", ")); process.exit(1); }

writeFileSync(join(OUT, "funnels_corpus.json"), JSON.stringify(funnels, null, 2));
writeFileSync(join(OUT, "funnels_blueprint_chunks.json"), JSON.stringify(chunks, null, 2));
console.log(`\nescritos en ${OUT}: funnels_corpus.json · funnels_blueprint_chunks.json`);
