// Estándar de la casa por nicho: paleta base + formato de logo.
//
// Lo decidió Matías (infográfico "Estilos de logo y paletas de color", 2026-07-31) y manda por
// encima de lo que haya observado el analizador de corpus: son las paletas con las que se quiere
// estandarizar. Se ANEXA a la ficha de cada nicho, no la reemplaza — el corpus sigue aportando
// el registro, los símbolos prohibidos y el nivel de elaboración.
//
//   node scripts/branding-estandar-nichos.mjs           (muestra qué haría)
//   node scripts/branding-estandar-nichos.mjs --guardar
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync("scripts/agent-fn-local.env", "utf8")
    .split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" };
const GUARDAR = process.argv.includes("--guardar");

// Las 5 paletas del infográfico, con los HEX exactos y los roles asignados al contrato de 5 colores
// que ya usa el generador (principal, secundario, acento, neutro_claro, neutro_oscuro).
const ESTANDARES = {
  salud: {
    enfoque: "isotipo orgánico + tipografía limpia",
    porque: "transmite confianza y calma, asocia con bienestar, y refuerza profesionalismo sin caer en lo clínico",
    colores: [
      ["#2ECC71", "principal", "verde vital"],
      ["#27AE60", "secundario", "verde profundo"],
      ["#3498DB", "acento", "azul claro confianza"],
      ["#A3E4D7", "neutro_claro", "menta pálido"],
      ["#2C3E50", "neutro_oscuro", "azul pizarra"],
    ],
  },
  viajes: {
    enfoque: "símbolo dinámico + tipografía cercana",
    porque: "genera deseo de explorar, asocia libertad y aventura, y atrae la atención rápido",
    colores: [
      ["#3498DB", "principal", "azul cielo"],
      ["#2980B9", "secundario", "azul mar"],
      ["#F39C12", "acento", "ámbar sol"],
      ["#85C1E9", "neutro_claro", "celeste bruma"],
      ["#2C3E50", "neutro_oscuro", "azul pizarra"],
    ],
  },
  inversiones: {
    enfoque: "isotipo sólido + tipografía sobria",
    porque: "transmite seguridad y estabilidad, asocia crecimiento y resultados, y genera autoridad",
    colores: [
      ["#1E3A8A", "principal", "azul institucional"],
      ["#64748B", "secundario", "gris acero"],
      ["#10B981", "acento", "verde crecimiento"],
      ["#CBD5E1", "neutro_claro", "gris niebla"],
      ["#0F172A", "neutro_oscuro", "negro azulado"],
    ],
  },
  crypto: {
    enfoque: "isotipo tecnológico + tipografía moderna",
    porque: "comunica innovación y estructura digital, y destaca en audiencias modernas y globales",
    colores: [
      ["#00C3FF", "principal", "cian eléctrico"],
      ["#0077B6", "secundario", "azul profundo"],
      ["#90E0EF", "acento", "celeste hielo"],
      ["#E2EBF0", "neutro_claro", "gris digital"],
      ["#0D1117", "neutro_oscuro", "negro terminal"],
    ],
  },
  belleza: {
    enfoque: "isotipo delicado + tipografía elegante",
    porque: "conecta emocionalmente, asocia cuidado y sofisticación, y genera aspiración",
    colores: [
      ["#EC4899", "principal", "rosa intenso"],
      ["#F06292", "secundario", "rosa suave"],
      ["#F8BBD0", "acento", "rosa pálido"],
      ["#FCE4EC", "neutro_claro", "rosa nube"],
      ["#6D4C41", "neutro_oscuro", "marrón cacao"],
    ],
  },
};

// Qué estándar le toca a cada ficha. Varios nichos comparten familia a propósito: bienestar y
// nutrición son la misma conversación que salud, y finanzas y seguros la misma que inversiones.
const ASIGNACION = {
  bn_salud: "salud",
  bn_bienestar: "salud",
  bn_nutricion: "salud",
  bn_viajes: "viajes",
  bn_inversiones: "inversiones",
  bn_finanzas: "inversiones",
  bn_seguros: "inversiones",
  bn_belleza: "belleza",
  bn_crypto: "crypto",
};

const MARCA = "ESTÁNDAR DE LA CASA";

function bloque(nombre) {
  const e = ESTANDARES[nombre];
  const filas = e.colores.map(([hex, rol, nom]) => `  - ${rol.padEnd(14)} ${hex}  (${nom})`).join("\n");
  return `${MARCA} (decidido por Matías — manda sobre cualquier otra referencia de color)

PALETA BASE del nicho "${nombre}". La paleta 1 de toda propuesta SALE DE ACÁ: usá estos cinco HEX
tal cual, o desviate como mucho un tono si el líder tiene un motivo real (colores que ya usa, la
empresa MLM, su piel/su rubro). Si te desviás, decilo en "razon".
${filas}

Las paletas 2 y 3 son alternativas libres, pensadas para ESTE líder, y tienen que ser claramente
distintas entre sí y de la base.

FORMATO: ${e.enfoque}. Funciona porque ${e.porque}.`;
}

// El formato isotipo + tipografía es la conclusión del infográfico y aplica a todos los nichos,
// incluso a los que no tienen paleta base asignada.
const BLOQUE_GENERAL = `${MARCA} (decidido por Matías)

FORMATO: el par isotipo + tipografía es el formato más versátil para convertir — se recuerda de un
vistazo, se adapta a móvil, web, redes y anuncios, y equilibra personalidad con claridad. Por eso
toda identidad se entrega en tres piezas: el símbolo solo, el nombre solo, y los dos juntos.

Este nicho no tiene paleta base fijada: proponé las tres paletas con el criterio del corpus.`;

const res = await fetch(`${env.SUPABASE_URL}/rest/v1/marketing_ad_library?part=eq.branding_nicho&select=*&order=position`, { headers: H });
const fichas = await res.json();
const porId = Object.fromEntries(fichas.map((f) => [f.id, f]));

// Crypto no existía: hasta ahora caía en "inversiones", que le pone azul institucional y verde de
// banco cuando el rubro pide cian y negro terminal. Se separa, y se le sacan las etiquetas a
// inversiones para que el buscador de nicho no dude entre las dos.
const nuevas = [];
if (!porId.bn_crypto) {
  const inv = porId.bn_inversiones;
  nuevas.push({
    id: "bn_crypto", part: "branding_nicho", niche: "crypto",
    niche_tags: ["crypto", "cripto", "blockchain", "bitcoin", "web3", "exchange", "token", "defi", "bitradex", "aitech"],
    status: inv?.status ?? "active",
    position: (Math.max(...fichas.map((f) => Number(f.position) || 0)) || 0) + 1,
    content: `NICHO: crypto

REGISTRO: técnico, contemporáneo, global. Confianza por precisión, no por calidez. Es la
conversación de inversiones pero con audiencia más joven y más digital.

TIPO DE LOGO: isotipo geométrico construido (hexágono, nodo, circuito abstracto, letra encapsulada)
acompañado de tipografía sans moderna. Trazo firme, ángulos exactos, nada manuscrito.

ACABADO: plano. Nada de metalizados, nada de brillos "moneda de oro".

SÍMBOLOS PROHIBIDOS: la B de Bitcoin, monedas, lingotes, gráficos de velas, toros y osos, cohetes,
lunas. Son los clichés del rubro y le restan seriedad al líder.

TIPOGRAFÍA: sans geométrica o técnica, mayúsculas, buen interletrado.

NOTA: ficha nueva, sin corpus propio todavía. La paleta base la fijó Matías.`,
  });
}

const cambios = [];
for (const f of [...fichas, ...nuevas]) {
  const asignado = ASIGNACION[f.id];
  const nuevo = asignado ? bloque(asignado) : BLOQUE_GENERAL;
  // Idempotente: si ya se corrió antes, se reemplaza el bloque viejo en vez de acumularlos.
  const limpio = f.content.split(`\n\n${MARCA}`)[0].trimEnd();
  const content = `${limpio}\n\n${nuevo}`;
  // Todos los objetos del upsert tienen que traer exactamente las mismas claves (PGRST102).
  if (content !== f.content) {
    cambios.push({ id: f.id, part: f.part, niche: f.niche, niche_tags: f.niche_tags, status: f.status, position: f.position, content });
  }
}

console.log(`Fichas: ${fichas.length} existentes + ${nuevas.length} nuevas. A escribir: ${cambios.length}`);
for (const c of cambios) console.log(`  ${c.id.padEnd(16)} ${ASIGNACION[c.id] ? `estándar "${ASIGNACION[c.id]}"` : "solo formato"}`);

if (!GUARDAR) { console.log("\n(seco — agregá --guardar para escribir)"); process.exit(0); }

const up = await fetch(`${env.SUPABASE_URL}/rest/v1/marketing_ad_library?on_conflict=id`, {
  method: "POST", headers: { ...H, prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify(cambios),
});
if (!up.ok) { console.error("ERROR", up.status, await up.text()); process.exit(1); }

// Crypto se lleva sus etiquetas: si quedan también en inversiones, el buscador reparte el puntaje.
if (nuevas.length) {
  const inv = porId.bn_inversiones;
  const tags = (inv?.niche_tags || []).filter((t) => !/crypto|cripto|blockchain|bitradex|aitech|exchange/i.test(t));
  const r2 = await fetch(`${env.SUPABASE_URL}/rest/v1/marketing_ad_library?id=eq.bn_inversiones`, {
    method: "PATCH", headers: { ...H, prefer: "return=minimal" }, body: JSON.stringify({ niche_tags: tags }),
  });
  console.log(`bn_inversiones etiquetas → ${JSON.stringify(tags)} ${r2.ok ? "ok" : "ERROR " + await r2.text()}`);
}
console.log("Guardado.");
