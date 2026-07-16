/**
 * adlibrary-probe.mjs — ¿la Ad Library API nos da el TEXTO de los anuncios, o solo el título?
 *
 * POR QUE: la skill `competitive-ads-extractor` analiza el COPY de los competidores (qué
 * dolor tocan, qué promesa hacen, qué gancho usan). Si la API solo devuelve el título del
 * link y no el cuerpo del anuncio, ese análisis no se puede hacer por API y hay que decidir
 * otra cosa. Esta prueba responde eso ANTES de construir la fase de competencia.
 *
 * Lo que ya sabemos (probado): la API oficial existe, funciona sin Playwright y devuelve
 * anuncios comerciales de MLM en español sin necesidad de la UE. Falta saber si trae el body.
 *
 * Uso:
 *   META_ADS_TOKEN=<token> node scripts/adlibrary-probe.mjs
 *   META_ADS_TOKEN=<token> node scripts/adlibrary-probe.mjs --page-id 930773856780497
 *
 * El token es el mismo que usa meta-ads-sync (secret META_ADS_TOKEN en Supabase). No lo
 * pegues en el repo ni en un chat: pasalo por variable de entorno, como acá.
 */
const TOKEN = process.env.META_ADS_TOKEN;
const args = process.argv.slice(2);
const PAGE_ID = args.includes("--page-id") ? args[args.indexOf("--page-id") + 1] : null;

if (!TOKEN) {
  console.error("Falta META_ADS_TOKEN.\n\n  META_ADS_TOKEN=<token> node scripts/adlibrary-probe.mjs\n");
  console.error("Sale del dashboard de Supabase: Edge Functions -> Secrets -> META_ADS_TOKEN");
  process.exit(1);
}

// El campo que decide todo es ad_creative_bodies. Los demás van para ver qué más llega.
const FIELDS = [
  "id", "page_id", "page_name",
  "ad_creative_bodies",          // ← EL QUE IMPORTA: el texto del anuncio
  "ad_creative_link_titles",
  "ad_creative_link_descriptions",
  "ad_creative_link_captions",
  "ad_snapshot_url",
  "ad_delivery_start_time",
  "publisher_platforms",
  "languages",
].join(",");

const params = new URLSearchParams({
  access_token: TOKEN,
  ad_type: "ALL",
  ad_reached_countries: JSON.stringify(["MX", "CO", "ES", "US"]),
  ad_active_status: "ACTIVE",
  fields: FIELDS,
  limit: "10",
});
if (PAGE_ID) params.set("search_page_ids", JSON.stringify([PAGE_ID]));
else params.set("search_terms", "libertad financiera network marketing");

const url = `https://graph.facebook.com/v21.0/ads_archive?${params}`;

const res = await fetch(url);
const json = await res.json().catch(() => null);

if (!res.ok || json?.error) {
  console.error(`\nHTTP ${res.status}`);
  console.error(JSON.stringify(json?.error || json, null, 2));
  console.error("\nSi dice que el token no tiene permisos: la Ad Library API pide una app de Meta");
  console.error("con acceso concedido y, para ads_archive, a veces verificacion de identidad.");
  process.exit(1);
}

const ads = Array.isArray(json?.data) ? json.data : [];
console.log(`\n${ads.length} anuncios · busqueda: ${PAGE_ID ? `page_id ${PAGE_ID}` : '"libertad financiera network marketing"'}\n`);

let conBody = 0;
for (const a of ads) {
  const body = a.ad_creative_bodies?.[0] || "";
  if (body) conBody++;
  console.log(`— ${a.page_name || "(sin pagina)"} · ${String(a.ad_delivery_start_time || "").slice(0, 10)}`);
  console.log(`  titulo : ${a.ad_creative_link_titles?.[0] || "(vacio)"}`);
  console.log(`  BODY   : ${body ? `${body.slice(0, 220).replace(/\n/g, " ")}${body.length > 220 ? "…" : ""}` : ">>> VACIO <<<"}`);
  console.log(`  desc   : ${a.ad_creative_link_descriptions?.[0] || "(vacio)"}`);
  console.log("");
}

console.log("=".repeat(70));
console.log(`VEREDICTO: ${conBody}/${ads.length} anuncios traen ad_creative_bodies (el texto real)`);
if (conBody === 0) {
  console.log("\n  La API NO da el texto para ads comerciales. La skill de competencia no puede");
  console.log("  analizar copy por API: quedarian titulos + el link al snapshot de cada anuncio.");
} else if (conBody < ads.length) {
  console.log(`\n  Lo da a veces (${Math.round(conBody / ads.length * 100)}%). Sirve, pero el analisis va a ser parcial:`);
  console.log("  hay que decirlo en el prompt para que el agente no saque conclusiones de una muestra sesgada.");
} else {
  console.log("\n  La API da el texto. La fase de competencia es viable tal como la pide la skill.");
}
console.log("=".repeat(70));
