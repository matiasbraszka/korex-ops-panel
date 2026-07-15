/**
 * Replica EXACTA del scorer de agent-chat contra la DB real, para verificar que la
 * búsqueda trae el nicho/avatar correcto antes de deployar nada.
 * Usa el RPC de checksums? No: necesita los metadatos, así que va por un RPC de lectura.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const env = { ...process.env };
for (const line of readFileSync(join(process.cwd(), "..", "..", "..", "voomly-export", ".env"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i <= 0) continue;
  const k = line.slice(0, i).trim();
  if (!/^[A-Z_]+$/.test(k) || env[k]) continue;
  env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const str = (v) => (v === null || v === undefined ? "" : String(v));

async function rpc(fn, body) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
  return res.json();
}

// Mismo scoring que la edge function (líneas del retrieval).
function score(rows, { pedido, niche, avatarName, clientId }) {
  const qTokens = norm(pedido).split(" ").filter((w) => w.length > 3);
  const nicheStr = norm(niche);
  const nicheTokens = nicheStr.split(" ").filter((w) => w.length > 3);
  const av = norm(avatarName);
  const hayOf = (r) => norm([str(r.niche), str(r.title), ...(Array.isArray(r.niche_tags) ? r.niche_tags : [])].join(" "));
  return rows.map((r) => {
    const rowNiche = norm(str(r.niche));
    const hay = hayOf(r);
    let s = 0;
    if (nicheStr && rowNiche && (nicheStr.includes(rowNiche) || rowNiche.includes(nicheStr))) s += 5;
    for (const t of nicheTokens) if (hay.includes(t)) s += 1;
    const ra = norm(str(r.avatar));
    if (av && ra && (av.includes(ra) || ra.includes(av))) s += 3;
    for (const t of qTokens) if (hay.includes(t)) s += 1;
    const tier = r.metrics?.tier;
    if (tier === "ganador") s += 2;
    if (tier === "perdedor") s -= 3;
    if (r.client_id && r.client_id === clientId) s += 1;
    return { id: r.id, title: r.title, tier, score: s };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
}

const CASOS = [
  { nombre: "Networker quemada · Bienestar", niche: "Bienestar", avatarName: "Networker estancada sin duplicación", pedido: "Escribí el guión de VSL para una networker quemada que ya probó otra empresa y no duplica" },
  { nombre: "Cripto · inversor escaldado", niche: "Finanzas y cripto", avatarName: "Inversor que perdió con otro proyecto", pedido: "Necesito un VSL para inversores en cripto que ya perdieron plata, con disclaimer" },
  { nombre: "Viajes · familia", niche: "Viajes", avatarName: "Familia que quiere viajar junta", pedido: "Guión de VSL para familias que quieren viajar, club de membresía" },
  { nombre: "Producto suelto", niche: "Salud — producto", avatarName: "Emprendedor con falta de foco", pedido: "VSL de producto para vender un parche, con garantía" },
];

const cs = await rpc("marketing_corpus_meta", { p_secret: env.VSL_INGEST_SECRET, p_parts: ["vsl_ficha", "vsl_section"] });
const fichas = cs.filter((r) => r.part === "vsl_ficha");
const secciones = cs.filter((r) => r.part === "vsl_section");
console.log(`corpus: ${fichas.length} fichas · ${secciones.length} secciones\n`);

for (const c of CASOS) {
  console.log(`### ${c.nombre}`);
  const top = score(fichas, c).slice(0, 3);
  for (const t of top) console.log(`   ficha  ${String(t.score).padStart(3)}  [${t.tier || "?"}]  ${t.title.slice(6, 62)}`);
  const secTop = score(secciones, { ...c, avatarName: "" }).slice(0, 3);
  for (const s of secTop) console.log(`   secc   ${String(s.score).padStart(3)}       ${s.title.slice(0, 62)}`);
  console.log("");
}
