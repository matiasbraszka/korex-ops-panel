// supabase/functions/cerebro-generate-avatars/index.ts
// Genera los avatares de UN funnel LEYENDO el DEL con la API de Anthropic (Sonnet/Haiku).
// A PEDIDO (botón del panel), 100% sincrónico. NADA corre en segundo plano.
//
// Reglas anti-fuga (fundamentales):
//   - Solo usuario logueado del panel O el cron_secret interno del equipo. Nada anónimo/público.
//   - UNA sola llamada a la API por invocación (a lo sumo 1 reintento ante 429/5xx). Sin loops.
//   - Tope de gasto DIARIO y MENSUAL (config): si se superó, NO llama y avisa.
//   - max_tokens acotado + timeout. Cada llamada se registra en api_usage (modelo, tokens, costo).
//
// Fidelidad al DEL: la IA solo IDENTIFICA (qué avatares van en ESTE funnel, y con anclas de
// inicio/fin, DÓNDE está el fragmento de cada uno). El TEXTO lo corta el código TAL CUAL (verbatim):
//   - descripción = fragmento EXACTO del avatar dentro de su hoja (no toda la hoja);
//   - anuncios = sección/es "Ads avatar N";
//   - VSL = la sección "VSL Avatar N" que corresponde a ESTE funnel.
//
// Config: secure_config.anthropic_api_key (secreto) + app_settings.api_config (modelo, topes, precios).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
function str(v: unknown) { return v === null || v === undefined ? "" : String(v).trim(); }
function rid() { return "av" + Math.random().toString(36).slice(2, 8); }

// Solo usuarios logueados del panel (no anon, no público).
async function authedUser(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !ANON_KEY || token === ANON_KEY) return false;
  try {
    const uc = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data } = await uc.auth.getUser();
    return !!data?.user;
  } catch { return false; }
}

// ── DEL: partir en pestañas "===== Título =====" (igual que el panel) ──
function parseDelTabs(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (!text) return map;
  const chunks = String(text).split(/=====\s*([^=\n]{1,80}?)\s*=====/);
  for (let i = 1; i < chunks.length; i += 2) {
    const title = (chunks[i] || "").trim();
    const content = (chunks[i + 1] || "").trim();
    if (title) map[title] = (map[title] ? map[title] + "\n\n" : "") + content;
  }
  return map;
}
function norm(s: string) { return (s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim(); }

// Secciones de la LANDING (NO son descripción del avatar ni anuncios): pre-landing, landing,
// formulario, thank you page, testimonios, feedback, VSL. Candado para spec/ads.
const LANDING_RE = /pre\s*-?\s*landing|\blanding\b|formul|thank\s*you|thankyou|p[aá]gina\s+de\s+gracias|testimon|feedback|\bvsl\b/i;
// Para el guión de VSL: bloquea la LANDING de la VSL (landing/página) pero PERMITE "VSL Avatar N".
const VSL_BLOCK = /pre\s*-?\s*landing|\blanding\b|formul|thank\s*you|thankyou|p[aá]gina|testimon|feedback/i;
const SPEC_MISSING = "— No se encontró la descripción de este avatar en el DEL —";

// Encuentra la sección por título (exacto o aproximado) y devuelve su CONTENIDO crudo.
function sectionContent(tabs: Record<string, string>, title: string, blockRe?: RegExp): string {
  const t = str(title);
  if (!t) return "";
  if (blockRe && blockRe.test(t)) return "";
  const keys = Object.keys(tabs);
  const nt = norm(t);
  let k = keys.find((k) => norm(k) === nt);
  if (!k) k = keys.find((k) => norm(k).includes(nt) || nt.includes(norm(k)));
  if (!k) return "";
  if (blockRe && blockRe.test(k)) return "";
  return tabs[k] || "";
}
// Concatena varias secciones (verbatim, con encabezado), con bloqueo opcional.
function pullSections(tabs: Record<string, string>, titles: string[], blockRe?: RegExp): string {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of (titles || [])) {
    const c = sectionContent(tabs, t, blockRe);
    if (c && !seen.has(t)) { seen.add(t); out.push(`— ${str(t)} —\n${c}`); }
  }
  return out.join("\n\n");
}
// Busca un texto TOLERANTE A ESPACIOS (los saltos \r\n\t y espacios múltiples del DEL
// no rompen el match). Devuelve el rango [start,end) en el contenido ORIGINAL, o null.
function findFlexible(content: string, needle: string, from = 0): { s: number; e: number } | null {
  const n = str(needle);
  if (!n) return null;
  const hay = content.slice(from);
  let i = hay.indexOf(n);                              // 1) exacto
  if (i >= 0) return { s: from + i, e: from + i + n.length };
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"); // 2) tolerante a espacios
  try { const m = new RegExp(esc).exec(hay); if (m) return { s: from + m.index, e: from + m.index + m[0].length }; } catch { /* regex inválida */ }
  return null;
}
// Corta el fragmento EXACTO entre dos anclas (start/end) dentro de un contenido. VERBATIM.
function sliceFragment(content: string, start: string, end: string): string {
  if (!content || !str(start)) return "";
  const sm = findFlexible(content, start);
  if (!sm) return "";
  const e = str(end);
  if (e) {
    const em = findFlexible(content, e, sm.e);         // el fin se busca DESPUÉS del inicio → ancla única
    if (em) return content.slice(sm.s, em.e).trim();
  }
  return content.slice(sm.s, sm.s + Math.min(8000, content.length - sm.s)).trim();
}

// Corta los anuncios de UN subavatar por sus marcadores "SUBAVATAR N" (robusto, sin depender
// de la IA). Sub K = desde su marcador (o el inicio, si K=1) hasta el marcador del K+1.
function sliceSubavatarAds(adRaw: string, subNum: number): string {
  if (!adRaw || !subNum) return "";
  const markerPos = (n: number) => { const m = new RegExp("subavatar\\s*" + n, "i").exec(adRaw); return m ? m.index : -1; };
  const start = subNum <= 1 ? 0 : markerPos(subNum);
  if (start < 0) return "";
  const pNext = markerPos(subNum + 1);
  const end = pNext > start ? pNext : adRaw.length;
  return end > start ? adRaw.slice(start, end).trim() : "";
}

// ── Copy de las páginas del funnel (verbatim del DEL) ──────────────────────
// Quién decide qué pestaña es cada página: la IA (ve el índice del DEL con un vistazo del
// contenido de cada una). Acá NO hay regex de "qué es cada página": los DEL están rotulados a
// mano y sin convención — "Pantalla final" es la thank-you, "Antesala" es la pre-landing, y el
// copy de una página puede estar repartido en varias pestañas. Eso se deduce, no se matchea.
//
// El ORDEN sí importa: una misma pestaña no puede ser dos páginas, y el primero la reclama.
// Va prelanding antes que landing porque si la IA marca la misma pestaña para las dos, es
// más probable que sea la pre-landing (la landing casi siempre está rotulada aparte).
const PAGE_RULES: { slug: string }[] = [
  { slug: "prelanding" }, { slug: "landing" }, { slug: "formulario" },
  { slug: "thankyou" }, { slug: "testimonios" },
];
// NO son páginas aunque la IA se confunda. Candado del código, no del prompt:
//   - el GUIÓN de VSL ("VSL Avatar 1", "VSL 1 Jonathan") es el video, no una página;
//   - las hojas de NOTAS INTERNAS del equipo (feedback, encuestas, sugerencias, análisis).
// El feedback NO es parte del recorrido de la persona: es lo que el equipo anota sobre las
// páginas. En los DEL reales esas hojas están llenas de "MODIFICACIONES DE LA PRE-LANDING…",
// así que sin este candado se colarían COMO la pre-landing. Guardar notas creyendo que son
// copy publicado es peor que no tener la página.
const NOT_A_PAGE = /^(?=.*\bvsl\b)(?!.*(landing|p[aá]gina)).*$|feedback|encuesta|sugeren|an[aá]lisis|\bideas?\b|brainstorm|modificacion|\bnotas?\b/i;
const PAGE_CLIP = 8000; // por página, al GUARDAR. Igual que el clip de spec_text.

interface PageCopy { title: string; text: string }

// Una pestaña puede EXISTIR y aun así no tener la página: está en blanco, tiene solo el título
// suelto, o dice "en construcción". Eso NO es copy: la página todavía no está.
// La IA también lo juzga (ve un vistazo de cada pestaña), pero esto es el candado del código:
// no depende de que el modelo se dé cuenta.
const EN_CONSTRUCCION_RE = /en\s+construcc?i[oó]n|pr[oó]ximamente|coming\s+soon|pendiente|\bTBD\b|\bWIP\b|falta\s+(el\s+)?copy|sin\s+(definir|hacer)|a\s+definir|por\s+hacer/i;
const MIN_COPY_CHARS = 25; // menos que esto es un título suelto, no una página

// PLANTILLA SIN RELLENAR. El DEL de un cliente nuevo arranca como molde de Korex, y hasta que
// alguien escribe el copy los RÓTULOS DE CONTENIDO quedan literales:
//   "[LOGO CLIENTE] ¡ATENCION [AVATAR]! TITULAR SUBTITULO FORMULARIO BOTON"
// Eso no es una página: es el molde. Si entra, el agente alinea anuncios contra la palabra
// "TITULAR". Es la misma regla que "en construcción", en otra forma.
//
// OJO — los corchetes NO sirven para detectarla, y probarlo contra los 38 funnels reales lo
// dejó claro: el copy REAL usa corchetes para marcar ELEMENTOS ([VSL], [CARRUSEL DE FOTOS],
// [FECHA LÍMITE], [VIDEO THANK YOU PAGE]) y muchos conservan [LOGO CLIENTE] con el resto ya
// escrito ("[LOGO CLIENTE] ¡ATENCIÓN MUJER NETWORKER! Descubre…"). Una regla por corchetes
// mataba 3 pre-landings buenas. Lo que delata al molde es el rótulo de CONTENIDO sin rellenar:
// TITULAR seguido de SUBTITULO, o el [AVATAR] que nunca se reemplazó por el avatar real.
const PLANTILLA_RE = /\bTITULAR\b[\s\S]{0,90}\bSUBT[IÍ]TULO\b|\[AVATAR\]/;

// PESTAÑA ÍNDICE (puntero). En Docs las pestañas tienen SUBPESTAÑAS y así se organiza el
// material: una pestaña PADRE ("Landing 1 PASOS", "FUNNEL JONATHAN") agrupa los pasos del
// funnel y su cuerpo es solo un cartel — "Mirar las siguientes pestañas." El copy está en las
// HIJAS. El Apps Script APLANA la jerarquía (todas salen como "===== Título =====" al mismo
// nivel), así que el padre llega como una pestaña más, con 35 caracteres de puntero.
// Regla de Mati: si una pestaña dice "mirá la siguiente pestaña", se IGNORA por completo, como
// si no existiera. Sin este candado la IA guardó "Landing 1 PASOS" COMO la landing de Castor:
// el agente leía "Mirar las siguientes pestañas." creyendo que era la página.
// Pide las DOS cosas (verbo apuntador + "pestaña") y que el cuerpo sea CORTO: un copy real que
// mencione "pestaña" de pasada no es un puntero.
const PUNTERO_RE = /^\W*(mir[aá]r?|ver|revis[aá]r?|consult[aá]r?|ir\s+a)\b[\s\S]{0,80}\bpesta[nñ]as?\b/i;
const MAX_PUNTERO_CHARS = 200;

// MOLDE POR RÓTULOS. La otra forma del molde de Korex: en vez de "TITULAR/SUBTITULO" en seco,
// es un cuestionario de rótulos que alguien tiene que completar y NADIE completó:
//   "Título:\n-\nSubtítulo:\n-\nBotón:\nPrimera pregunta y Respuestas:\nTexto:\nBotón:"
//   "Testimonio 1:\nNombre del testimonio:\nLink del testimonio subido a centralize:"
// Un rótulo VACÍO es una línea que es solo "Etiqueta:" (nada después) o solo "-".
//
// Dos señales, las dos MEDIDAS contra las ~150 páginas ya guardadas de los 38 funnels reales:
//   1. contenido real (todo lo que NO es rótulo vacío) < 40 chars → el molde en blanco.
//      Cae ahí el molde de testimonios ("Testimonio 1: / Nombre: / Link:" con 0 chars de
//      contenido, en Belen Griner, cristian steinkeller, Liliana Vega y Fabiana) y el de la
//      thank-you ("Responsable de grabarse: / Indicaciones: / Guion:"). Ninguna página real
//      de la base queda por debajo.
//   2. racha de 10+ rótulos vacíos SEGUIDOS → el formulario-brief de Korex sin rellenar, que
//      aparece IDÉNTICO (689 chars) en Oscar Rubio, Liliana Vega y cristian steinkeller.
//      El 10 sale de medir, no de estimar: el brief da racha 15, y lo más alto que alcanza una
//      página REAL es 6 (los testimonios de Jacquie: el 1 lleno, el 2 y el 3 con los espacios
//      todavía vacíos). El corte va en el medio de ese hueco. NO bajarlo a 5: mata a Jacquie,
//      que tiene un testimonio de verdad.
// Por qué así y no por ratio: los testimonios REALES están llenos de rótulos legítimos
// ("Nombre del testimonio: Mareann Martinez", "Link del testimonio: https://…"), así que un
// ratio de rótulos mataba los de Kate, Alex y Jacquie. Lo que separa el molde del copy no es
// que tenga rótulos: es que los rótulos están VACÍOS.
const ROTULO_VACIO_RE = /^(?:[^:\n]{1,60}:|-)\s*$/;
const MIN_CONTENIDO_REAL = 40;
const MAX_RACHA_ROTULOS = 10;

function moldeSinRellenar(text: string): boolean {
  const lineas = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lineas.length) return true;
  let contenido = 0, racha = 0, maxRacha = 0;
  for (const l of lineas) {
    if (ROTULO_VACIO_RE.test(l)) { racha++; if (racha > maxRacha) maxRacha = racha; }
    else { racha = 0; contenido += l.length; }
  }
  return contenido < MIN_CONTENIDO_REAL || maxRacha >= MAX_RACHA_ROTULOS;
}

function esCopyReal(text: string): boolean {
  const t = str(text);
  if (t.length < MIN_COPY_CHARS) return false;
  // "En construcción" en un texto corto = placeholder. En uno largo puede ser una frase suelta
  // dentro de copy real (ej. "tu negocio en construcción"), así que no lo descartamos.
  if (t.length < 400 && EN_CONSTRUCCION_RE.test(t)) return false;
  if (PLANTILLA_RE.test(t)) return false;
  if (t.length < MAX_PUNTERO_CHARS && PUNTERO_RE.test(t)) return false;
  if (moldeSinRellenar(t)) return false;
  return true;
}

// Índice del DEL para la IA: título + tamaño + un vistazo del contenido de cada pestaña.
// El vistazo es lo que le permite DECIDIR: sin ver adentro, la IA solo tiene nombres de
// pestañas y no puede saber si una está vacía o dice "en construcción".
const PREVIEW_CHARS = 220;
const INDEX_CLIP = 30000;
function delIndex(tabs: Record<string, string>): string {
  const keys = Object.keys(tabs);
  // NUMERADAS y en ORDEN DE DOCUMENTO (el Apps Script recorre las pestañas en profundidad, así
  // que cada PADRE viene inmediatamente seguido de sus hijas). El número es lo único que le deja
  // a la IA reconstruir la jerarquía que el aplanado borró: un DEL puede tener DOS funnels
  // (ej. "FUNNEL JONATHAN" y "FUNNEL OSCAR"), cada uno con su pre-landing, y sin el orden no hay
  // forma de saber cuál pre-landing es de cuál.
  return keys.map((t, i) => {
    const c = (tabs[t] || "").trim();
    const prev = c.slice(0, PREVIEW_CHARS).replace(/\s+/g, " ");
    const puntero = c.length < MAX_PUNTERO_CHARS && PUNTERO_RE.test(c);
    const rotulo = puntero ? " [ÍNDICE: agrupa a las que siguen, NO tiene copy]" : "";
    return `#${i + 1} — ${t} — (${c.length} caracteres)${rotulo}\n${prev || "(PESTAÑA VACÍA)"}${c.length > PREVIEW_CHARS ? "…" : ""}`;
  }).join("\n\n").slice(0, INDEX_CLIP);
}

// Copy de las páginas, VERBATIM del DEL. La IA dice QUÉ pestañas son de cada página (puede ser
// más de una si el copy está repartido); el código valida contra las pestañas REALES, descarta
// las que no tienen copy de verdad y corta tal cual. La IA nunca reescribe el texto.
//
// No se usa sliceFragment: una página es una pestaña ENTERA (a diferencia del avatar, que es un
// fragmento dentro de "Avatares"). No hay anclas que pedir. Igual que vsl_script.
function extractPagesCopy(tabs: Record<string, string>, hinted: Record<string, string[]>): Record<string, PageCopy> {
  const titles = Object.keys(tabs);
  const out: Record<string, PageCopy> = {};
  const claimed = new Set<string>();

  for (const { slug } of PAGE_RULES) {
    const wanted = Array.isArray(hinted[slug]) ? hinted[slug] : [];
    const hits: string[] = [];
    for (const w of wanted) {
      // Igualdad normalizada EXACTA a propósito: el fallback difuso de sectionContent (includes
      // en los dos sentidos) confundiría "Landing" con "Pre-landing". Si la IA inventó un
      // título que no existe, se descarta en vez de traer la pestaña equivocada.
      const k = titles.find((t) => norm(t) === norm(str(w)));
      if (!k || claimed.has(k) || NOT_A_PAGE.test(k)) continue;
      if (!esCopyReal(tabs[k])) continue; // vacía / en construcción → esta página no está
      claimed.add(k);
      hits.push(k);
    }
    if (!hits.length) continue;
    // Si el copy está repartido en varias pestañas, se concatenan con su encabezado para que
    // se entienda de dónde salió cada parte.
    const text = hits.length === 1
      ? str(tabs[hits[0]])
      : hits.map((t) => `— ${t} —\n${str(tabs[t])}`).join("\n\n");
    out[slug] = { title: hits.join(" + "), text: text.slice(0, PAGE_CLIP) };
  }
  return out;
}

// Encuentra el guión de VSL de este funnel dentro del DEL. TODO por código, sin IA: `vslSection`
// (lo que marcó la IA) es opcional — si viene vacío o no resuelve, cae en los fallbacks.
// Por eso el botón "Traer guión del DEL" puede ser gratis de verdad.
// `avatarNames` = los avatares del funnel, para enganchar la pestaña "VSL <persona>".
function resolverVsl(tabs: Record<string, string>, sectionTitles: string[], avatarNames: string[], vslSection: string): string {
  let vslScript = vslSection ? sectionContent(tabs, vslSection, VSL_BLOCK) : "";
  // Si la IA no marcó vsl_section, o marcó una que NO resuelve a contenido (ej. grafía distinta:
  // "Meli" vs la pestaña "Mely"), enganchamos la pestaña 'VSL ...' que lleve el nombre de algún
  // avatar de este funnel (person-named). Nunca la landing.
  if (!vslScript) {
    const vslTabs = sectionTitles.filter((t) => /\bvsl\b/i.test(t) && !/landing|p[aá]gina/i.test(t));
    for (const name of avatarNames) {
      const toks = norm(name).split(" ").filter((w) => w.length > 2);
      const hit = vslTabs.find((t) => { const nt = norm(t); return toks.some((w) => nt.includes(w)); });
      if (hit) { const c = sectionContent(tabs, hit, VSL_BLOCK); if (c) { vslScript = c; break; } }
    }
    // Última red: si el DEL tiene UNA sola pestaña "VSL" genérica (no nombrada por persona) —
    // típico de un funnel de un solo avatar/producto— usala. Si hay varias (Summit: "VSL 1 Jonathan",
    // "VSL 2 Mely"…) NO se aplica: ésas se resuelven por nombre arriba y no queremos mezclar.
    if (!vslScript && vslTabs.length === 1) {
      const c = sectionContent(tabs, vslTabs[0], VSL_BLOCK);
      if (c) vslScript = c;
    }
    // Último recurso: entre VARIAS pestañas 'VSL', quedate con la PRINCIPAL (el guión), descartando
    // notas/sugerencias/cambios/ideas/análisis/retargeting (ej. Piquer: 'Guion VSL' vs 'Sugerencias
    // cambios VSL' → gana 'Guion VSL'). Si tras el filtro queda exactamente una, usala.
    if (!vslScript) {
      const primary = vslTabs.filter((t) => !/sugeren|cambio|nota|idea|an[aá]lisis|retarget|feedback|mejora/i.test(t));
      // Si hay versión vieja + NUEVA (ej. "VSL" y "VSL nuevo"), gana la NUEVA. Si no, y queda una sola, esa.
      const nuevos = primary.filter((t) => /nuev[oa]s?/i.test(t));
      const pick = nuevos.length === 1 ? nuevos[0] : (primary.length === 1 ? primary[0] : null);
      if (pick) { const c = sectionContent(tabs, pick, VSL_BLOCK); if (c) vslScript = c; }
    }
  }
  return vslScript;
}

// Una llamada a la API, con el tool forzado. 1 intento + 1 reintento como MUCHO (solo ante
// 429/5xx) y timeout: los mismos frenos anti-fuga de siempre, ahora compartidos por los dos
// modos (avatares y páginas).
async function pedirIA(apiKey: string, model: string, tool: Record<string, unknown>, prompt: string): Promise<{ ok: boolean; data?: unknown; err: string }> {
  const reqBody: Record<string, unknown> = {
    model, max_tokens: 4096,
    tools: [tool], tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: prompt }],
  };
  // temperature está deprecado en los modelos nuevos (sonnet-5 / opus-4); lo mandamos solo
  // para los que lo aceptan (haiku / sonnet-4). El tool_choice ya fuerza la salida.
  if (!/sonnet-5|opus-4/i.test(model)) reqBody.temperature = 0;
  let err = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(120000),
      });
      if (res.ok) return { ok: true, data: await res.json(), err: "" };
      err = "http " + res.status;
      if (res.status !== 429 && res.status < 500) break; // 4xx duro: no reintenta
    } catch (e) { err = String((e as Error)?.message || e); }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1200));
  }
  return { ok: false, err };
}

interface RawAvatar { name?: string; audience?: string; spec_section?: string; spec_start?: string; spec_end?: string; ad_sections?: string[]; ad_start?: string; ad_end?: string; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Auth: usuario logueado del panel O el cron_secret interno (uso interno / pruebas).
  const { data: sp } = await supabase.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const cronSecret = str((sp?.value as Record<string, unknown>)?.cron_secret);
  const gotSecret = req.headers.get("x-cron-secret") || "";
  const authed = (cronSecret && gotSecret === cronSecret) || (await authedUser(req));
  if (!authed) return j({ ok: false, error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const clientId = str(body.client_id);
  const strategyId = str(body.strategy_id);
  const funnelId = str(body.funnel_id);
  const funnelName = str(body.funnel_name);
  // 'pages' = traer SOLO el copy de las páginas (botón propio). 'replace'/'append' = avatares.
  //
  // Un modo que NO conocemos se rechaza. Antes esto era `=== "replace" ? "replace" : "append"`,
  // así que CUALQUIER modo desconocido caía en "append" y corría la generación de avatares
  // completa: cobraba y tocaba los avatares del cliente sin que nadie lo pidiera. Ya pasó dos
  // veces (mode:'vsl' del botón "Traer guión del DEL", y mode:'pages' contra la versión vieja
  // de esta función). Fallar fuerte es más barato que adivinar.
  const MODOS = ["append", "replace", "pages", "vsl"];
  const mode = str(body.mode) || "append";
  if (!MODOS.includes(mode)) {
    return j({ ok: false, error: "bad_mode", detail: `Modo desconocido: "${mode}". Válidos: ${MODOS.join(", ")}. (Si esperabas otra cosa, la función está desactualizada: hay que deployarla.)` }, 400);
  }
  if (!clientId || !funnelId) return j({ ok: false, error: "missing_params" }, 400);

  // Config + secreto.
  const { data: keyRow } = await supabase.from("secure_config").select("value").eq("key", "anthropic_api_key").maybeSingle();
  const apiKey = str(keyRow?.value);
  // El modo 'vsl' no llama a la API: no necesita la key ni le corresponde el tope de gasto.
  if (!apiKey && mode !== "vsl") return j({ ok: false, error: "missing_api_key" }, 500);
  const { data: cfgRow } = await supabase.from("app_settings").select("value").eq("key", "api_config").maybeSingle();
  const cfg = (cfgRow?.value as Record<string, unknown>) ?? {};
  const model = str(cfg.avatar_model) || "claude-haiku-4-5-20251001";
  const dailyCap = Number(cfg.daily_cap_usd ?? 5);
  const monthlyCap = Number(cfg.monthly_cap_usd ?? 100);
  const prices = (cfg.prices as Record<string, { in: number; out: number }>) || {};
  const price = prices[model] || { in: 3, out: 15 };

  // ── Freno anti-fuga: topes de gasto ── (el modo 'vsl' no gasta: no le aplica)
  if (mode !== "vsl") try {
    const { data: stats } = await supabase.rpc("api_usage_stats");
    const todayCost = Number((stats as Record<string, Record<string, number>>)?.today?.cost ?? 0);
    const monthCost = Number((stats as Record<string, Record<string, number>>)?.month?.cost ?? 0);
    if (todayCost >= dailyCap) {
      await supabase.from("api_usage").insert({ fn: "generate_avatars", model, status: "blocked", client_id: clientId, funnel_id: funnelId, error: "tope diario", meta: { todayCost, dailyCap } });
      return j({ ok: false, error: "daily_cap", detail: `Se alcanzó el tope de gasto diario (US$${dailyCap}). Se reinicia mañana o subilo en Administración.` }, 429);
    }
    if (monthCost >= monthlyCap) {
      await supabase.from("api_usage").insert({ fn: "generate_avatars", model, status: "blocked", client_id: clientId, funnel_id: funnelId, error: "tope mensual", meta: { monthCost, monthlyCap } });
      return j({ ok: false, error: "monthly_cap", detail: `Se alcanzó el tope de gasto mensual (US$${monthlyCap}).` }, 429);
    }
  } catch { /* si falla el chequeo, seguimos (el max_tokens acota igual) */ }

  // DEL de la estrategia. Si hay varios "del" (ej. un falso positivo del detector por nombre,
  // como "Copia de HISTORIA Y LINK DEL VIDEO"), gana el MÁS GRANDE: el DEL real es enorme y el
  // falso positivo suele ser un doc corto. Robusto sin borrar nada.
  let delQ = supabase.from("client_brain_docs").select("text,char_count").eq("client_id", clientId).eq("doc_kind", "del");
  if (strategyId) delQ = delQ.eq("strategy_id", strategyId);
  const { data: delRows } = await delQ.order("char_count", { ascending: false }).limit(1);
  const delText = str((delRows && delRows[0]?.text) || "").slice(0, 200000); // cota de seguridad
  if (!delText) return j({ ok: false, error: "no_del", detail: "No hay DEL sincronizado para esta estrategia. Tocá “Sincronizar contexto” primero." }, 400);

  const tabs = parseDelTabs(delText);
  const sectionTitles = Object.keys(tabs);

  // Avatares actuales (para no duplicar en append).
  // `name` lo usa el prompt de páginas como fallback si no vino funnel_name.
  const { data: pageRow } = await supabase.from("strategy_pages").select("name, avatars, vsl_script, pages_copy").eq("id", funnelId).maybeSingle();
  const currentAvatars = Array.isArray(pageRow?.avatars) ? pageRow!.avatars : [];
  const currentNames = currentAvatars.map((a: Record<string, unknown>) => norm(str(a?.name)));

  // ══ MODO 'vsl': traer SOLO el guión del VSL. Por código, SIN IA → gratis de verdad. ══
  // Es lo que el botón "Traer guión del DEL" siempre prometió. Hasta ahora mentía: mandaba
  // mode:'vsl', el modo no existía, caía en 'append' y corría la generación de avatares entera.
  if (mode === "vsl") {
    const vslScript = resolverVsl(tabs, sectionTitles, currentAvatars.map((a: Record<string, unknown>) => str(a?.name)), "");
    if (!vslScript) {
      return j({ ok: false, error: "no_vsl", detail: "No encontré el guión del VSL en el DEL por código. Si el DEL tiene varias VSL y hay que deducir cuál, usá “Generar avatares del DEL”." }, 404);
    }
    const { error: uErrV } = await supabase.from("strategy_pages")
      .update({ vsl_script: vslScript, updated_at: new Date().toISOString() }).eq("id", funnelId);
    // Se registra igual, con costo 0: así el tablero de gasto muestra que este botón NO cobra.
    await supabase.from("api_usage").insert({
      fn: "generate_vsl", model: null, input_tokens: 0, output_tokens: 0, cost_usd: 0,
      client_id: clientId, funnel_id: funnelId, status: uErrV ? "error" : "ok",
      error: uErrV ? String(uErrV.message) : null,
      meta: { funnel_name: funnelName, chars: vslScript.length, sin_ia: true },
    });
    if (uErrV) return j({ ok: false, error: "write_error", detail: String(uErrV.message) }, 500);
    return j({ ok: true, vsl_set: true, chars: vslScript.length, cost_usd: 0 });
  }

  // ══ MODO 'pages': traer SOLO el copy de las páginas del funnel y salir. ══
  // Pasada dedicada, con su propio prompt y su propia llamada. Es la AUTORIDAD sobre pages_copy:
  // la corrida de avatares no toca esta columna (antes lo hacía de arrastre y le pisaba el
  // resultado bueno a esta, que es la que ve el contenido y sabe decidir).
  if (mode === "pages") {
    const propPagina = (desc: string) => ({
      type: "object",
      description: desc,
      properties: {
        sections: {
          type: "array", items: { type: "string" },
          // El título viaja como TEXTO y el código lo resuelve por igualdad exacta contra las
          // pestañas reales: si la IA lo reescribe, la página se pierde en silencio. Pasó con la
          // pre-landing de un cliente cuya pestaña se llama "Pre-Landing" pero cuyo cuerpo
          // arranca con "Pre landing <Nombre del cliente>": la IA copió la frase del CONTENIDO.
          // OJO al redactar esta ayuda: NO usar nombres de clientes reales como ejemplo — un
          // ejemplo con un nombre real le sesga la respuesta justo al cliente que lo lleva.
          description: "Títulos EXACTOS de las pestañas que tienen el COPY de esta página, copiados LETRA POR LETRA del índice: lo que va entre '#N — ' y ' — (N caracteres)'. NO lo reescribas y NO uses frases sacadas del CONTENIDO de la pestaña: si en el índice el título es 'Pre-Landing' pero adentro se lee 'Pre landing de Fulano', el título sigue siendo 'Pre-Landing'. Un título que no exista TAL CUAL en el índice se descarta y la página se pierde. Puede ser MÁS DE UNA si el copy está repartido. Vacío [] si la página no está en el DEL.",
        },
        motivo: {
          type: "string",
          description: "Solo si sections quedó vacío, por qué: 'no_existe' | 'en_construccion' | 'vacia'. Si hay copy, ''.",
        },
      },
      required: ["sections"],
    });
    const toolPages = {
      name: "emit_pages",
      description: "Marca qué pestañas del DEL tienen el copy de cada página de ESTE funnel.",
      input_schema: {
        type: "object",
        properties: {
          prelanding: propPagina("PRE-LANDING: la página PREVIA a la landing, la primera que ve la persona apenas hace clic en el anuncio. Puede llamarse 'Antesala', 'Puente', 'Advertorial'."),
          landing: propPagina("LANDING de la VSL: la página donde está el VIDEO (ej. 'Landing Page VSL'). Es la PÁGINA, NO el guión del video."),
          formulario: propPagina("FORMULARIO de captación: las preguntas de calificación, los campos, el texto del botón."),
          thankyou: propPagina("THANK YOU PAGE / página de gracias: lo que ve la persona DESPUÉS de registrarse. Puede llamarse 'Pantalla final', 'TYP', 'Página post-registro'."),
          testimonios: propPagina("TESTIMONIOS / casos de éxito / prueba social."),
        },
        required: ["prelanding", "landing", "formulario", "thankyou", "testimonios"],
      },
    };
    const promptPages = [
      `Sos parte del sistema de Korex. Tenés que ubicar, dentro del DEL (el documento maestro de la estrategia), QUÉ PESTAÑAS tienen el copy de cada página del funnel "${funnelName || str(pageRow?.name)}".`,
      "",
      // Las 5 se piden juntas en un solo tool_use, y sin esta línea el modelo a veces contesta
      // UNA y deja las otras cuatro vacías (le pasó al funnel "Padres Familia" de Alex Quintero:
      // devolvió solo la pre-landing). Son independientes: que una no esté no dice nada del resto.
      "Son CINCO páginas y las CINCO se contestan por separado: pre-landing, landing, formulario, thank you page y testimonios. Contestalas TODAS — que una no esté no dice nada de las otras.",
      "",
      "NO reescribas ni resumas nada: solo devolvés TÍTULOS EXACTOS de pestañas. El sistema corta el texto tal cual del DEL.",
      "",
      "CÓMO DECIDIR:",
      "- Mapeá por SIGNIFICADO, no por el nombre literal. Los DEL están rotulados a mano: 'Pantalla final' puede ser la Thank You Page, 'Antesala' puede ser la pre-landing.",
      "- El copy de UNA página puede estar REPARTIDO en varias pestañas (ej. 'Landing parte 1' y 'Landing parte 2', o una pestaña con los titulares y otra con los bullets). En ese caso poné TODAS en sections, en orden de lectura.",
      "- Si hay una versión VIEJA y una NUEVA de la misma página (ej. 'Landing' y 'Landing nueva'), usá SOLO la NUEVA. La nueva es la vigente; la vieja quedó de histórico.",
      "- El GUIÓN de VSL ('VSL Avatar 1', 'VSL 1 Jonathan') NO es una página: es el video. Nunca lo pongas. 'Landing Page VSL' SÍ es la landing (es la página donde está el video).",
      "- Las hojas de NOTAS INTERNAS del equipo ('Feedback', 'Encuesta', 'Sugerencias', 'Modificaciones', 'Notas', 'Análisis') NO son páginas: son lo que el equipo ANOTA sobre las páginas, no lo que la persona ve. OJO: suelen hablar de una página (ej. una hoja 'Feedback' que dice 'MODIFICACIONES DE LA PRE-LANDING…'). Aunque hablen de ella, NO son su copy: no las pongas en ningún campo.",
      "",
      "CÓMO ESTÁ ORGANIZADO EL DEL (subpestañas):",
      "- En el Doc las pestañas tienen SUBPESTAÑAS: una pestaña PADRE agrupa los pasos del funnel ('FUNNEL JONATHAN', 'Landing 1 PASOS') y adentro cuelgan 'Pre-Landing', 'Landing Page VSL', 'Formulario', 'Thank You Page'.",
      "- El índice te llega APLANADO: las subpestañas aparecen al mismo nivel que su padre. Lo que conservás es el ORDEN (#1, #2, #3…): cada padre viene JUSTO ANTES de sus hijas, y sus hijas terminan donde empieza el próximo padre.",
      "- La pestaña PADRE marcada [ÍNDICE] NO tiene copy: su cuerpo solo dice 'Mirar las siguientes pestañas'. IGNORALA POR COMPLETO, como si no existiera. Nunca la pongas en sections: el copy está en las que le siguen.",
      "- POR DEFECTO el DEL trae UN SOLO juego de páginas, y ése es el de tu funnel. Es NORMAL que ninguna pestaña se llame como tu funnel, y es NORMAL que varios funnels del panel COMPARTAN el mismo juego de páginas (mismo producto, distinto avatar). En ese caso USALAS — las cinco. No descartes una página solo porque su pestaña no menciona el nombre de tu funnel.",
      `- EXCEPCIÓN, y solo si de verdad se da: si el DEL trae DOS O MÁS juegos COMPLETOS de páginas, cada uno bajo su propio padre y claramente de personas o productos distintos (ej. un 'FUNNEL JONATHAN' con su 'Pre-Landing' y un 'FUNNEL OSCAR' con su 'Pre-Landing Oscar'), ahí sí quedate con el juego que le corresponde al funnel "${funnelName || str(pageRow?.name)}" y no lo mezcles con el del otro.`,
      "",
      "CUÁNDO UNA PÁGINA NO ESTÁ (importante, no la fuerces):",
      "- Si la pestaña existe pero está VACÍA, tiene solo un título suelto, o dice 'en construcción' / 'pendiente' / 'próximamente', ESO NO ES COPY.",
      "- Tampoco es copy la PLANTILLA SIN RELLENAR: el molde de Korex con los rótulos literales todavía puestos ('¡ATENCION [AVATAR]!', 'TITULAR', 'SUBTITULO', 'BOTON'). Es el esqueleto, nadie escribió el copy todavía. Distinto es el copy REAL que conserva marcas de ELEMENTO ([VSL], [CARRUSEL DE FOTOS], [LOGO CLIENTE]) pero YA tiene el texto escrito alrededor: ése SÍ va.",
      "- Antes de descartarla, FIJATE si el copy real de esa página está en OTRA pestaña con otro nombre.",
      "- Si tampoco está en otra, dejá sections en [] y poné el motivo. Es un resultado válido y esperado: no todos los funnels tienen todas las páginas (la pre-landing muchas veces no existe).",
      // El contrapeso NO es decorativo: sin él, "vacío es mejor que equivocado" se lleva puesto
      // todo. Con la primera versión de la regla de funnels múltiples, 12 de 38 funnels
      // devolvieron CERO páginas teniendo el DEL completo.
      "- NUNCA metas una pestaña que no corresponde solo para no dejar el campo vacío. Vacío es mejor que equivocado. Pero OJO con lo contrario: si la página ESTÁ y tiene copy de verdad, ponela. Dejar vacío lo que el DEL SÍ tiene también es un error.",
      "",
      "En el índice de abajo tenés cada pestaña con su tamaño y las primeras líneas de su contenido. Usá eso para decidir si tiene copy de verdad.",
      "",
      "===== ÍNDICE DEL DEL =====",
      delIndex(tabs),
    ].join("\n");

    const resP = await pedirIA(apiKey, model, toolPages, promptPages);
    if (!resP.ok) {
      await supabase.from("api_usage").insert({ fn: "generate_pages", model, status: "error", client_id: clientId, funnel_id: funnelId, error: resP.err });
      return j({ ok: false, error: "api_error", detail: resP.err }, 502);
    }
    const dataP = resP.data as Record<string, unknown>;
    const usageP = (dataP?.usage || {}) as Record<string, number>;
    const inTokP = Number(usageP.input_tokens || 0);
    const outTokP = Number(usageP.output_tokens || 0);
    const costP = Number(((inTokP / 1e6) * price.in + (outTokP / 1e6) * price.out).toFixed(6));

    const blockP = ((dataP.content || []) as Record<string, unknown>[])
      .find((c) => c.type === "tool_use" && c.name === "emit_pages");
    if (!blockP) {
      // Sin tool_use no sabemos NADA: no pisamos lo que ya había.
      await supabase.from("api_usage").insert({ fn: "generate_pages", model, input_tokens: inTokP, output_tokens: outTokP, cost_usd: costP, client_id: clientId, funnel_id: funnelId, status: "error", error: "sin tool_use" });
      return j({ ok: false, error: "no_tool_use", detail: "La IA no devolvió el resultado esperado. Probá de nuevo.", cost_usd: costP }, 502);
    }
    const inP = (blockP.input || {}) as Record<string, { sections?: string[]; motivo?: string }>;
    const hinted: Record<string, string[]> = {};
    const motivos: Record<string, string> = {};
    for (const { slug } of PAGE_RULES) {
      hinted[slug] = Array.isArray(inP[slug]?.sections) ? inP[slug]!.sections!.map(str).filter(Boolean) : [];
      const m = str(inP[slug]?.motivo);
      if (m) motivos[slug] = m;
    }
    const foundPages = extractPagesCopy(tabs, hinted);

    // Esta pasada es la autoridad: pisa pages_copy entero. Si la IA dice que una página no
    // está, tiene que DESAPARECER — mergear dejaría copy viejo de un DEL que ya cambió.
    // El panel guarda pages_copy_backup antes de llamar, así que "Deshacer" lo cubre.
    const { error: uErrP } = await supabase.from("strategy_pages")
      .update({ pages_copy: foundPages, updated_at: new Date().toISOString() }).eq("id", funnelId);

    await supabase.from("api_usage").insert({
      fn: "generate_pages", model, input_tokens: inTokP, output_tokens: outTokP, cost_usd: costP,
      client_id: clientId, funnel_id: funnelId, status: uErrP ? "error" : "ok",
      error: uErrP ? String(uErrP.message) : null,
      meta: {
        funnel_name: funnelName, encontradas: Object.keys(foundPages),
        // Lo que la IA marcó pero el código descartó (pestaña inexistente, vacía, en
        // construcción, o guión de VSL). Si esto crece, el prompt está fallando.
        descartadas: Object.entries(hinted).filter(([s, v]) => v.length && !foundPages[s]).map(([s]) => s),
        motivos,
      },
    });
    if (uErrP) return j({ ok: false, error: "write_error", detail: String(uErrP.message), cost_usd: costP }, 500);
    return j({ ok: true, pages: foundPages, pages_n: Object.keys(foundPages).length, motivos, cost_usd: costP, tokens: { in: inTokP, out: outTokP } });
  }

  // ── Llamada a la API (una sola; a lo sumo 1 reintento ante 429/5xx). max_tokens acotado. ──
  const tool = {
    name: "emit_avatars",
    description: "Devuelve los avatares de ESTE funnel (con anclas al fragmento exacto) y su VSL.",
    input_schema: {
      type: "object",
      properties: {
        avatars: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Título corto del avatar. Si el avatar corresponde a una PERSONA concreta que graba (líder/networker, ej. Jonathan), usá SU nombre (ej. 'Jonathan — Avatar 1 Padres'). Si el DEL solo lo rotula por número, lo MÁS PARECIDO a como aparece (ej. 'AVATAR 1 - Emprendedores'). No inventar." },
              audience: { type: "string", description: "Segmentación (edad, sexo, ubicación, intereses) de ESTE avatar. Del DEL si está; si no, resumida en 1 línea." },
              spec_section: { type: "string", description: "Título EXACTO de la sección del DEL que contiene la DESCRIPCIÓN (dolores/deseos/miedos/perfil) de ESTE avatar (ej. 'Avatares'). NUNCA la landing. '' si no hay." },
              spec_start: { type: "string", description: "Las primeras ~12 palabras EXACTAS (copiadas del DEL, con tildes/mayúsculas) donde EMPIEZA el fragmento de ESTE avatar/subavatar dentro de esa sección. Incluí algún dato único (ej. 'AVATAR 2' o 'SUBAVATAR 3') para no confundir con otro." },
              spec_end: { type: "string", description: "Las últimas ~12 palabras EXACTAS donde TERMINA el fragmento de ESTE avatar (justo antes de que empiece el del siguiente avatar)." },
              ad_sections: { type: "array", items: { type: "string" }, description: "Títulos EXACTOS de las secciones con los ANUNCIOS de ESTE avatar (ej. 'Ads avatar 1'). Mapear por significado. Si los anuncios están rotulados por PERSONA (ej. 'Anuncios Jonathan'), usá la pestaña con el nombre de la persona de este avatar." },
              ad_start: { type: "string", description: "Si dentro de la sección de anuncios los anuncios están SEPARADOS por subavatar, las primeras ~10 palabras EXACTAS donde arrancan los anuncios de ESTE subavatar (ej. 'TEXTO BASE PARA SUBAVATAR 2'). Vacío si los anuncios son comunes/no distinguidos." },
              ad_end: { type: "string", description: "Las últimas ~10 palabras EXACTAS donde terminan los anuncios de ESTE subavatar (justo antes del siguiente). Vacío si son comunes." },
            },
            required: ["name", "audience", "spec_section", "ad_sections"],
          },
        },
        vsl_section: { type: "string", description: "Título EXACTO de la sección del GUIÓN de VSL (el video) que corresponde a ESTE funnel/avatar. Las pestañas de VSL pueden estar rotuladas por NÚMERO ('VSL Avatar 1') o por PERSONA/número+persona ('VSL 1 Jonathan', 'VSL Jonathan'): si el avatar de este funnel es una persona (ej. Jonathan), elegí la pestaña de VSL que lleva SU nombre. NO la 'Landing Page VSL' ni 'Landing VSL'. '' solo si de verdad no hay VSL para este avatar." },
      },
      required: ["avatars"],
    },
  };
  const prompt = [
    "Sos el extractor de avatares del cerebro de Método Korex. Te paso el DEL (documento maestro) de una estrategia.",
    `Estás generando los avatares SOLO para UN funnel específico, llamado: «${funnelName || "(sin nombre)"}».`,
    "Devolvé ÚNICAMENTE el/los avatar(es) del DEL que corresponden a ESTE funnel (no todos los del DEL).",
    "",
    "CÓMO ASOCIAR un avatar a este funnel:",
    "- El NOMBRE del funnel suele describir a un avatar específico (ej. funnel 'Emprendedores' → el avatar de emprendedores).",
    "- El DEL a veces ROTULA el avatar con su funnel (ej. 'AVATAR 1 … FUNNEL EMPRENDEDORES', 'AVATAR 2 … Networkers'). Respetá esa asociación.",
    "- Si un avatar NO corresponde a este funnel, NO lo incluyas.",
    "",
    "EL AVATAR PUEDE SER UNA PERSONA (muy importante): en muchos DEL el avatar es la PERSONA que graba (el líder/networker). Ahí las pestañas de anuncios y de VSL están rotuladas por NOMBRE de persona ('Anuncios Jonathan', 'VSL 1 Jonathan') en vez de por número. La descripción/segmentación de esa persona suele venir de un perfil demográfico ('Avatar 1', 'Avatar 2') que el propio DEL le asigna en prosa (ej. 'Jonathan es padre de familia → Avatar 1'; 'Samantha y Meli → Avatar 2'). En ese caso: el avatar = la persona; su descripción = el perfil (Avatar N) que le corresponde; sus anuncios/VSL = las pestañas con SU nombre. DOS personas pueden compartir el MISMO perfil (misma spec) y está bien. Tolerá variantes de grafía del nombre (ej. 'Mely' = 'Meli').",
    "",
    "FRAGMENTO EXACTO (clave): la sección de descripción (ej. 'Avatares') suele traer VARIOS avatares uno tras otro. NO devuelvas la hoja entera.",
    "Para cada avatar indicá spec_section + spec_start (primeras ~12 palabras EXACTAS donde arranca SU parte, incluyendo algo único como 'AVATAR 2') + spec_end (últimas ~12 palabras EXACTAS donde termina SU parte, antes del siguiente avatar). El sistema corta ese pedazo TAL CUAL. Copiá las palabras EXACTAS del DEL (con tildes y mayúsculas).",
    "",
    "SUBAVATARES (IMPORTANTE): si el avatar de este funnel tiene SUB-AVATARES o variantes explícitas (ej. 'SUBAVATAR 1 — 35 a 54 años · …', 'SUBAVATAR 2 — …', o variantes por perfil/edad), devolvé UN AVATAR POR CADA SUBAVATAR (no lo colapses en uno solo). Para cada subavatar: name que lo distinga (ej. 'AVATAR 1 · Subavatar 1 — 35-54'); audience = su segmentación específica; spec_start/spec_end = el fragmento ESPECÍFICO de ESE subavatar (desde su encabezado 'SUBAVATAR N …' hasta justo antes del siguiente subavatar).",
    "HOJA DEDICADA vs COMPARTIDA: si la hoja de anuncios es SOLO de una persona/avatar (ej. 'Anuncios Jonathan') y NO tiene subavatares, dejá ad_start y ad_end VACÍOS → se toma la hoja ENTERA con TODOS sus anuncios (suele haber varias versiones, no uno solo). Usá ad_start/ad_end SOLO cuando una MISMA hoja está compartida por varios subavatares.",
    "ANUNCIOS POR SUBAVATAR: la sección de anuncios (ej. 'Ads avatar 1') CASI SIEMPRE separa los anuncios por subavatar, con marcadores en CUALQUIER formato: 'TEXTO BASE SUBAVATAR 1', 'TEXTO BASE PARA SUBAVATAR 2', 'Titulares para SUBAVATAR 3', 'SUBAVATAR N – VERSIÓN X', etc. Para CADA subavatar (INCLUIDO el 1) poné ad_sections con esa hoja Y ad_start/ad_end para cortar SOLO sus anuncios: ad_start = las primeras ~10 palabras EXACTAS donde arrancan los anuncios de ESE subavatar (para el subavatar 1, buscá su primer marcador 'SUBAVATAR 1' o, si sus anuncios empiezan al principio de la hoja, el comienzo de la hoja); ad_end = las ~10 palabras EXACTAS justo ANTES de que empiecen los del SIGUIENTE subavatar (ej. antes de 'Titulares para SUBAVATAR 2' / 'TEXTO BASE PARA SUBAVATAR 2'). NUNCA dejes que el subavatar 1 se lleve toda la hoja. Solo dejá ad_start/ad_end vacíos si de VERDAD no hay marcadores por subavatar.",
    "",
    "VSL: elegí en vsl_section la sección del guión de VSL (el video) que va con el avatar de ESTE funnel. La pestaña puede llamarse por número ('VSL Avatar 1') o por persona/número+persona ('VSL 1 Jonathan', 'VSL Jonathan'): si el avatar de este funnel es una persona, elegí la pestaña de VSL que lleva SU nombre. El guión suele decir al principio a qué avatar apunta. NO uses 'Landing Page VSL' ni 'Landing VSL'. Casi siempre hay VSL para el avatar: no la dejes vacía salvo que realmente no exista.",
    "",
    "VERSIÓN NUEVA vs VIEJA (MUY IMPORTANTE): si el DEL tiene una sección VIEJA y una NUEVA del mismo tipo (ej. 'Anuncios' y 'Nuevos ads'/'Anuncios nuevos'; 'VSL' y 'VSL nuevo'/'Nueva VSL'), usá SIEMPRE la NUEVA — tanto en ad_sections como en vsl_section. La nueva es la vigente; la vieja quedó de histórico.",
    "",
    "REGLAS:",
    "- El título (name) debe ser lo MÁS PARECIDO posible a como aparece en el DEL. No inventes.",
    "- Los anuncios (ad_sections) por SIGNIFICADO (ej. 'Ads avatar 1' es del avatar 1).",
    "- IMPORTANTÍSIMO: las secciones de la LANDING (Pre-landing, Landing, Landing Page VSL, Formulario, Thank You Page, Testimonios, Feedback) NO son la descripción del avatar. NUNCA las uses en spec_section.",
    "- Si NO hay una sección con la descripción (dolores/deseos) de ese avatar, dejá spec_section, spec_start y spec_end vacíos (el sistema pondrá 'no encontrada').",
    "",
    "Secciones disponibles en el DEL (usá estos títulos EXACTOS):",
    sectionTitles.length ? sectionTitles.map((t) => `- ${t}`).join("\n") : "(el DEL no usa marcadores de sección)",
    "",
    mode === "append" && currentNames.length ? `Avatares que YA existen en este funnel (no los repitas): ${currentAvatars.map((a: Record<string, unknown>) => str(a?.name)).join(", ")}` : "",
    "",
    "DEL:",
    delText,
  ].join("\n");

  const resIA = await pedirIA(apiKey, model, tool, prompt);
  if (!resIA.ok) {
    await supabase.from("api_usage").insert({ fn: "generate_avatars", model, status: "error", client_id: clientId, funnel_id: funnelId, error: resIA.err });
    return j({ ok: false, error: "api_error", detail: resIA.err }, 502);
  }

  const data = resIA.data as Record<string, unknown>;
  const usage = data?.usage || {};
  const inTok = Number(usage.input_tokens || 0);
  const outTok = Number(usage.output_tokens || 0);
  const cost = Number(((inTok / 1e6) * price.in + (outTok / 1e6) * price.out).toFixed(6));

  // Sacar el tool_use de la respuesta.
  let raw: RawAvatar[] = [];
  let vslSection = "";
  try {
    const block = (data.content || []).find((c: Record<string, unknown>) => c.type === "tool_use" && c.name === "emit_avatars");
    raw = (block?.input?.avatars as RawAvatar[]) || [];
    vslSection = str((block?.input as Record<string, unknown>)?.vsl_section);
  } catch { raw = []; }

  // ¿Cuántos avatares de ESTE batch usan cada hoja de anuncios? (para saber si es compartida).
  const adTabUse: Record<string, number> = {};
  for (const a of raw) for (const t of (a.ad_sections || [])) { const k = norm(str(t)); adTabUse[k] = (adTabUse[k] || 0) + 1; }

  // Resolver a avatares del panel: descripción = fragmento EXACTO (verbatim); anuncios = secciones.
  const built = raw.map((a) => {
    const secContent = sectionContent(tabs, str(a.spec_section), LANDING_RE); // spec nunca de landing/vsl
    const spec = sliceFragment(secContent, str(a.spec_start), str(a.spec_end));
    // Anuncios: por defecto la hoja ENTERA (todos los anuncios del avatar).
    let ad = pullSections(tabs, a.ad_sections || [], LANDING_RE);
    const adRaw = (a.ad_sections || []).map((t) => sectionContent(tabs, t, LANDING_RE)).filter(Boolean).join("\n\n");
    // Solo cortamos por anclas si la hoja es COMPARTIDA (varios avatares/subavatares la usan) o el
    // avatar es un subavatar. Si la hoja es DEDICADA (ej. "Anuncios Jonathan"), va ENTERA: no se corta.
    const isSub = /subavatar/i.test(str(a.name));
    const shared = (a.ad_sections || []).some((t) => (adTabUse[norm(str(t))] || 0) > 1);
    // 1) Si corresponde cortar y la IA marcó anclas, cortamos por ellas.
    if ((isSub || shared) && str(a.ad_start)) { const cut = sliceFragment(adRaw, str(a.ad_start), str(a.ad_end)); if (cut) ad = cut; }
    // 2) Refuerzo por código: si es un subavatar y 'ad' sigue siendo CASI toda la hoja (la IA no lo
    //    cortó o la marcó mal), cortamos por los marcadores 'SUBAVATAR N'. Robusto, sin depender de la IA.
    const m = /subavatar\s*(\d+)/i.exec(str(a.name));
    if (m && /subavatar/i.test(adRaw) && ad.length > adRaw.length * 0.9) {
      const cut = sliceSubavatarAds(adRaw, parseInt(m[1], 10));
      if (cut && cut.length < ad.length) ad = cut;
    }
    return {
      id: rid(),
      name: str(a.name),
      audience: str(a.audience),
      spec_text: spec || SPEC_MISSING,
      ad_script: ad || "",
      status: "En grabación",
      ad_url: "",
    };
  }).filter((a) => a.name);

  // Recuperación de descripción para funnels de UN SOLO avatar: si quedó sin spec pero el DEL
  // tiene una hoja de perfil ("Avatar"/"Avatares"/"Perfil"/"Buyer persona"), usala ENTERA. Las
  // anclas spec_start/spec_end solo hacen falta cuando VARIOS avatares comparten la misma hoja;
  // con un único avatar, toda la hoja ES su descripción.
  if (built.length === 1 && built[0].spec_text === SPEC_MISSING) {
    let recovered = sectionContent(tabs, str(raw[0]?.spec_section), LANDING_RE);
    if (!recovered) {
      const profTab = sectionTitles.find((t) => /^\s*avatar(es)?\s*$|\bperfil\b|buyer\s*persona/i.test(t) && !LANDING_RE.test(t));
      if (profTab) recovered = sectionContent(tabs, profTab, LANDING_RE);
    }
    if (recovered) built[0].spec_text = recovered.slice(0, 8000);
  }

  // VSL que corresponde a ESTE funnel (verbatim de "VSL Avatar N"/"VSL <persona>", nunca la landing).
  const vslScript = resolverVsl(tabs, sectionTitles, built.map((a) => str(a.name)), vslSection);

  // Merge según modo.
  let finalAvatars;
  if (mode === "replace") {
    finalAvatars = built;
  } else {
    const nuevos = built.filter((a) => !currentNames.includes(norm(a.name)));
    finalAvatars = [...currentAvatars, ...nuevos];
  }

  const patch: Record<string, unknown> = { avatars: finalAvatars, updated_at: new Date().toISOString() };
  if (vslScript) patch.vsl_script = vslScript; // seteamos la VSL del funnel si la encontramos
  const { error: uErr } = await supabase.from("strategy_pages").update(patch).eq("id", funnelId);

  // Registrar el gasto SIEMPRE (aunque la escritura falle, la API ya se usó).
  await supabase.from("api_usage").insert({
    fn: "generate_avatars", model, input_tokens: inTok, output_tokens: outTok, cost_usd: cost,
    client_id: clientId, funnel_id: funnelId, status: uErr ? "error" : "ok",
    error: uErr ? String(uErr.message) : null,
    meta: {
      mode, funnel_name: funnelName, detected: built.length, total: finalAvatars.length,
      vsl: !!vslScript, names: built.map((a) => a.name),
    },
  });
  if (uErr) return j({ ok: false, error: "write_error", detail: String(uErr.message), cost_usd: cost }, 500);

  return j({ ok: true, avatars: finalAvatars, detected: built.length, vsl_set: !!vslScript, mode, cost_usd: cost, tokens: { in: inTok, out: outTok } });
});
