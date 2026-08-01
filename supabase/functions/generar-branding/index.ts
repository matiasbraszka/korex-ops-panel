// supabase/functions/generar-branding/index.ts
//
// "Generar branding": un botón en la carpeta Branding del cliente deja cargados los logos (PNG
// con fondo transparente, en 3 versiones cada uno) y 3 paletas de colores. El equipo borra lo
// que no le gusta y se queda con lo bueno.
//
// TRES ACCIONES, NO UNA. Una corrida completa es Claude (~20 s) + 3 imágenes de 40-90 s cada
// una: entre 3 y 5 minutos. En una sola invocación, cualquier timeout tira todo, incluidos los
// logos que ya habían salido bien. Partida en tres, el frontend orquesta el loop y:
//   - el equipo ve aparecer los logos de a uno,
//   - un fallo en el logo 3 no borra los logos 1 y 2,
//   - el tope de gasto se re-chequea ANTES DE CADA IMAGEN, que es donde está la plata.
//
//   plan     → valida datos, arma contexto, llama a Claude, guarda la corrida.  ~US$0,02
//   render   → con run_id + idx: UNA imagen, deriva las 3 versiones, sube.      ~US$0,04
//   palettes → con run_id: dibuja los 3 PNG de paleta localmente, sube.         US$0
//
// Reintentar es seguro: render y palettes chequean si ese pedazo ya se hizo y no duplican.
//
// Reglas anti-fuga (las mismas de agent-chat): solo usuario logueado del panel o cron_secret;
// una llamada por invocación, sin loops; topes diario y mensual + un tope PROPIO de branding
// para no comerse el presupuesto de los otros agentes; todo se registra en api_usage.
//
// Config: secure_config.anthropic_api_key + secure_config.openai_api_key
//         app_settings.api_config (chat_models.branding, image_prices, topes, prices)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { analizarLogo, componerLockup, decodePng, dibujarPaleta, encodePng, hexARgb, limpiarAlfa, recolorear } from "./png.ts";
import { BRANDING_TOOL, construirPedido, construirPromptImagen, FORMATOS, INSTRUCCIONES_DIRECTOR, PIEZAS } from "./prompts.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const BUCKET = "funnel-recursos";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const clip = (s: string, n: number) => { const t = str(s); return t.length > n ? t.slice(0, n) + "\n…[recortado]" : t; };
const norm = (s: unknown) => str(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();

/** Solo usuarios logueados del panel. Devuelve el email para poder firmar lo que sube. */
async function authedUser(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !ANON_KEY || token === ANON_KEY) return null;
  try {
    const uc = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data } = await uc.auth.getUser();
    return data?.user ? (data.user.email || data.user.id) : null;
  } catch { return null; }
}

// ── Costos ───────────────────────────────────────────────────────────────────
// Igual que en agent-chat, el respaldo hardcodeado ERRA CARO a propósito: sobreestimar solo hace
// que el freno de gasto salte antes, que es el lado seguro para equivocarse.
const PRECIOS_LISTA: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 5, out: 25 },
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};
const IMG_RESPALDO: Record<string, number> = { low: 0.011, medium: 0.042, high: 0.167 };

type Cfg = Record<string, unknown>;

async function cargarCfg(): Promise<Cfg> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "api_config").maybeSingle();
  return (data?.value as Cfg) ?? {};
}

function precioImagen(cfg: Cfg, quality: string): number {
  const tabla = ((cfg.image_prices as Record<string, Record<string, number>>) || {})["gpt-image-1"] || {};
  return Number(tabla[quality] ?? IMG_RESPALDO[quality] ?? IMG_RESPALDO.high);
}

/**
 * Frena si se pasó algún tope. `extra` es lo que está por gastarse en esta llamada: sumarlo antes
 * es lo que evita que la última imagen se pase de largo del tope justo por encima del límite.
 *
 * Además del tope global (que comparten Anuncios, VSL, Funnels y Descubrimiento) hay uno PROPIO
 * de branding: sin él, unas cuantas regeneraciones en calidad alta dejan sin presupuesto a todos
 * los demás agentes del panel.
 */
async function chequearTopes(cfg: Cfg, extra: number): Promise<{ error: string; detail: string } | null> {
  const dailyCap = Number(cfg.daily_cap_usd ?? 10);
  const monthlyCap = Number(cfg.monthly_cap_usd ?? 300);
  const brandingCap = Number(cfg.branding_daily_cap_usd ?? 2);

  try {
    const { data: stats } = await supabase.rpc("api_usage_stats");
    const s = stats as Record<string, Record<string, number>>;
    const hoy = Number(s?.today?.cost ?? 0);
    const mes = Number(s?.month?.cost ?? 0);
    if (hoy + extra >= dailyCap) {
      return { error: "daily_cap", detail: `Se alcanzó el tope de gasto diario del panel (US$${dailyCap}). Se reinicia mañana, o subilo en Administración.` };
    }
    if (mes + extra >= monthlyCap) {
      return { error: "monthly_cap", detail: `Se alcanzó el tope de gasto mensual del panel (US$${monthlyCap}).` };
    }
  } catch { /* si el chequeo global falla, seguimos: el tope propio de abajo igual acota */ }

  // Tope propio: gasto de branding en lo que va del día (UTC).
  try {
    const desde = new Date(); desde.setUTCHours(0, 0, 0, 0);
    const { data: filas } = await supabase.from("api_usage").select("cost_usd")
      .like("fn", "generar_branding%").gte("created_at", desde.toISOString());
    const propio = (filas || []).reduce((a, r) => a + Number(r.cost_usd || 0), 0);
    if (propio + extra >= brandingCap) {
      return { error: "branding_cap", detail: `Se alcanzó el tope diario de generación de branding (US$${brandingCap}). Es un tope propio, para que el branding no se coma el presupuesto de los otros agentes. Se puede subir en Administración.` };
    }
  } catch { /* nada */ }

  return null;
}

// ── Contexto del cliente ─────────────────────────────────────────────────────

const REQUERIDOS = [
  { col: "name", rotulo: "Nombre del cliente" },
  { col: "team_name", rotulo: "Nombre del equipo" },
  { col: "company", rotulo: "Empresa MLM" },
  { col: "niche", rotulo: "Nicho" },
];

/** Elige la ficha de estilo del nicho. Los tags salvan los nichos mal cargados (hay clientes con
 *  niche = el nombre de la empresa). Si no matchea nada, cae a 'general' con firmeza. */
async function elegirFicha(niche: string): Promise<{ id: string; content: string } | null> {
  const { data } = await supabase.from("marketing_ad_library")
    .select("id,niche,niche_tags,content").eq("part", "branding_nicho").eq("status", "approved").order("position");
  const fichas = data || [];
  if (!fichas.length) return null;
  const general = fichas.find((f) => norm(f.niche) === "general") || null;
  const n = norm(niche);
  if (!n) return general;

  const puntuadas = fichas.map((f) => {
    const rowNiche = norm(f.niche);
    const hay = norm([f.niche, ...((f.niche_tags as string[]) || [])].join(" "));
    let s = 0;
    if (rowNiche && rowNiche !== "general" && (n.includes(rowNiche) || rowNiche.includes(n))) s += 5;
    for (const t of n.split(" ").filter((w) => w.length > 3)) if (hay.includes(t)) s += 1;
    return { f, s };
  }).sort((a, b) => b.s - a.s);

  const mejor = puntuadas[0];
  return (mejor && mejor.s > 0 ? mejor.f : general) as { id: string; content: string } | null;
}

/** Lo que sabemos del cliente, en texto, para el director de arte. */
async function armarContexto(cliente: Record<string, unknown>): Promise<string> {
  const clientId = str(cliente.id);
  // Un documento por tipo, el más largo, y nada más. Traer todos salía carísimo: un cliente con
  // material completo tiene ~165.000 caracteres repartidos en varios docs, que viajaban enteros
  // para después recortarlos a 9.000. Ocho segundos de espera tirados en cada corrida.
  const unDoc = (kind: string) =>
    supabase.from("client_brain_docs").select("doc_kind,title,text")
      .eq("client_id", clientId).eq("doc_kind", kind)
      .order("char_count", { ascending: false }).limit(1).maybeSingle();

  const [rBrief, rOnb, rInv, { data: funnels }] = await Promise.all([
    unDoc("briefing"), unDoc("onboarding"), unDoc("investigacion"),
    supabase.from("strategy_pages").select("name,tipo,avatars").eq("client_id", clientId),
  ]);
  const docs = [rBrief.data, rOnb.data, rInv.data].filter(Boolean) as Record<string, unknown>[];

  const partes: string[] = [];
  partes.push(
    `===== FICHA DEL CLIENTE =====\n` +
    `Nombre del líder: ${str(cliente.name)}\n` +
    `Nombre del equipo: ${str(cliente.team_name)}\n` +
    `Empresa MLM: ${str(cliente.company)}\n` +
    `Nicho: ${str(cliente.niche)}\n` +
    (str(cliente.service) ? `Servicio contratado: ${str(cliente.service)}\n` : "") +
    (str(cliente.country) ? `País: ${str(cliente.country)}\n` : ""),
  );

  // Colores que el cliente ya declaró en el onboarding: no se ignoran.
  const bc = cliente.brand_colors as Record<string, unknown> | null;
  if (bc && (bc.raw || (Array.isArray(bc.hex) && bc.hex.length))) {
    partes.push(
      `===== COLORES QUE EL CLIENTE YA DECLARÓ =====\n` +
      `${str(bc.raw)}${Array.isArray(bc.hex) && bc.hex.length ? ` (${(bc.hex as string[]).join(", ")})` : ""}\n` +
      (str(cliente.brand_font) ? `Tipografía declarada: ${str(cliente.brand_font)}\n` : "") +
      `Respetalos, o justificá explícitamente en "notas" por qué te apartás.`,
    );
  }

  // El briefing de personalidad es la fuente más valiosa; el onboarding es el respaldo.
  const briefing = docs.find((d) => d.doc_kind === "briefing");
  const onboarding = docs.find((d) => d.doc_kind === "onboarding");
  const investigacion = docs.find((d) => d.doc_kind === "investigacion");

  if (briefing?.text) partes.push(`===== PERSONALIDAD Y TONO DEL LÍDER (briefing) =====\n${clip(str(briefing.text), 4000)}`);
  if (onboarding?.text) partes.push(`===== ONBOARDING =====\n${clip(str(onboarding.text), briefing?.text ? 2500 : 5000)}`);
  if (investigacion?.text) partes.push(`===== INVESTIGACIÓN =====\n${clip(str(investigacion.text), 2500)}`);

  // A quién le habla la marca. Solo nombre y audiencia: el spec_text completo son 4 KB por avatar
  // y para decidir colores y formas no aporta nada.
  const avatares: string[] = [];
  for (const f of funnels || []) {
    for (const a of (f.avatars as Record<string, unknown>[]) || []) {
      const nom = str(a?.name);
      if (nom) avatares.push(`- ${nom}${str(a?.audience) ? `: ${clip(str(a.audience), 240)}` : ""}`);
    }
  }
  if (avatares.length) partes.push(`===== A QUIÉN LE HABLA (avatares de sus funnels) =====\n${avatares.slice(0, 8).join("\n")}`);

  if (!briefing?.text && !onboarding?.text && !investigacion?.text) {
    partes.push(`===== AVISO =====\nNo hay briefing, onboarding ni investigación cargados para este cliente. Trabajá solo con la ficha y el nicho, y decilo en "notas".`);
  }

  return partes.join("\n\n");
}

/**
 * El bloque de aprendizaje: qué se probó antes y qué sobrevivió.
 *
 * Hacen falta DOS fuentes. funnel_resources dice qué sigue vivo (les gustó), pero cuando el
 * equipo borra un logo la fila desaparece y con ella la señal "esto NO les gustó". Por eso
 * client_branding_runs guarda lo que se INTENTÓ: la diferencia entre los dos conjuntos es el
 * descarte. Sin esto, regenerar propone exactamente lo mismo otra vez.
 */
async function bloqueAprendizaje(clientId: string, modo: string): Promise<string> {
  const [{ data: runs }, { data: vivos }] = await Promise.all([
    supabase.from("client_branding_runs").select("plan").eq("client_id", clientId)
      .order("created_at", { ascending: false }).limit(5),
    supabase.from("funnel_resources").select("meta").eq("client_id", clientId)
      .is("strategy_id", null).eq("bucket_key", "branding").not("meta", "is", null),
  ]);

  const vivosSet = new Set((vivos || []).map((r) => str((r.meta as Record<string, unknown>)?.group_id)).filter(Boolean));
  const conservados: string[] = [], descartados: string[] = [];
  const vistos = new Set<string>();

  for (const run of runs || []) {
    const rendered = ((run.plan as Record<string, unknown>)?.rendered as Record<string, unknown>[]) || [];
    for (const g of rendered) {
      const gid = str(g.group_id);
      if (!gid || vistos.has(gid)) continue;
      vistos.add(gid);
      const linea = g.kind === "palette"
        ? `- PALETA "${str(g.palette_name)}" | ${((g.colors as string[]) || []).join(" ")}`
        : `- LOGO "${str(g.concepto)}" | ${((g.style_tags as string[]) || []).join(", ")} | ${str(g.hex)}`;
      (vivosSet.has(gid) ? conservados : descartados).push(linea);
    }
  }

  if (!conservados.length && !descartados.length) return "";

  const reglas = modo === "otra_direccion"
    ? `1. Ningún concepto nuevo puede repetir el concepto ni la combinación dominante de style_tags
   de un DESCARTADO. Si dos de tus tres tags coinciden con un descartado, no vale: cambialo.
2. IGNORÁ los conservados. El equipo pidió explícitamente otra dirección: cambiá de familia
   visual entera aunque algo haya sobrevivido.
3. PODÉS APARTARTE DE LAS FAMILIAS CROMÁTICAS DE LA FICHA DEL NICHO. Ese catálogo es la
   recomendación por defecto, y ya se probó: si te quedás adentro vas a devolver lo mismo con
   otro nombre. Buscá una familia distinta que igual le sirva a este líder y explicá en "razon"
   por qué funciona. Lo que NO se relaja nunca: los símbolos prohibidos, el registro del nicho
   y la regla de que el logo sea monocromático.
4. Las paletas nuevas tienen que ser distinguibles A SIMPLE VISTA de TODAS las anteriores: otro
   matiz dominante, no la misma paleta con el acento cambiado. Si al describirla te sale un
   nombre parecido a uno anterior, es señal de que no cambiaste lo suficiente.`
    : `1. Ningún concepto nuevo puede repetir el concepto ni la combinación dominante de style_tags
   de un DESCARTADO. Si dos de tus tres tags coinciden con un descartado, no vale: cambialo.
2. Si hay CONSERVADOS: quedate en su familia visual y variá DENTRO de ella (misma familia de
   forma, distinta ejecución). El equipo ya te dijo por dónde va.
3. Pero NO devuelvas un CONSERVADO tal cual. Ya está en la carpeta: repetirlo deja dos copias
   iguales y le hace perder un lugar a una propuesta nueva. Cada paleta y cada logo que
   devuelvas tiene que ser algo que el equipo todavía no vio.
4. Si NO hay ningún conservado: cambiá de familia entera. Lo que venías haciendo no funciona;
   no lo ajustes, cambialo.
5. Las paletas nuevas tienen que ser distinguibles a simple vista de las descartadas (distinto
   matiz dominante, no el mismo azul dos tonos más claro).`;

  return `===== LO QUE YA SE PROBÓ CON ESTE CLIENTE =====

${conservados.length ? `CONSERVADOS (el equipo NO los borró: le gustaron. Es la dirección correcta.)\n${conservados.join("\n")}` : "CONSERVADOS: ninguno. El equipo borró todo lo anterior."}

${descartados.length ? `DESCARTADOS (el equipo los BORRÓ: no le gustaron. NO los repitas.)\n${descartados.join("\n")}` : "DESCARTADOS: ninguno."}

REGLAS DE ESTA REGENERACIÓN (modo: ${modo})
${reglas}`;
}

// ── Llamada a Claude ─────────────────────────────────────────────────────────

async function llamarClaude(apiKey: string, model: string, system: { type: string; text: string; cache_control?: unknown }[], pedido: string) {
  const reqBody: Record<string, unknown> = {
    model,
    max_tokens: 8000,
    // Sin "pensar interno": en Sonnet 5 está ON por defecto y se come el presupuesto de
    // max_tokens, con lo que la salida de la herramienta sale cortada.
    thinking: { type: "disabled" },
    system,
    messages: [{ role: "user", content: pedido }],
    tools: [BRANDING_TOOL],
    tool_choice: { type: "tool", name: BRANDING_TOOL.name },
  };
  // Los modelos nuevos rechazan los parámetros de sampling. OJO: el guard de agent-chat no
  // incluye opus-5 y devuelve 400 si alguien apunta ese modelo; acá sí está contemplado.
  if (!/sonnet-5|opus-5|opus-4|fable-5|mythos/i.test(model)) reqBody.temperature = 0.8;

  let res: Response | null = null;
  let lastErr = "";
  for (let intento = 1; intento <= 2; intento++) { // 1 intento + 1 reintento como MUCHO. Sin loops.
    let esperar = 1200;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(120000),
      });
      if (res.ok) break;
      lastErr = "http " + res.status;
      if (res.status !== 429 && res.status < 500) break; // 4xx duro: no reintenta
      const ra = Number(res.headers.get("retry-after"));
      if (Number.isFinite(ra) && ra > 0) esperar = Math.min(ra * 1000, 10000);
    } catch (e) { lastErr = String((e as Error)?.message || e); }
    if (intento < 2) await new Promise((r) => setTimeout(r, esperar));
  }
  if (!res || !res.ok) {
    let detail = lastErr;
    try { detail = (await res?.text()) || lastErr; } catch { /* nada */ }
    return { ok: false as const, detail: clip(detail, 600) };
  }
  return { ok: true as const, data: await res.json() };
}

// ── Subida ───────────────────────────────────────────────────────────────────

/**
 * Sube un PNG y registra la fila. OJO: funnel_resources.version es NOT NULL con default, así que
 * en scope cliente NO se manda el campo — mandarlo en null rompe el insert.
 */
async function subirPng(
  clientId: string, nombre: string, bytes: Uint8Array, titulo: string, meta: Record<string, unknown>, by: string,
) {
  const path = `cliente/${clientId}/branding/${Date.now()}_${nombre}.png`;
  const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: "image/png", upsert: false });
  if (up.error) throw new Error(`no pude subir ${nombre}: ${up.error.message}`);
  const pub = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { data, error } = await supabase.from("funnel_resources").insert({
    strategy_id: null, client_id: clientId, avatar_id: null,
    bucket_key: "branding", title: titulo,
    provider: "supabase", storage_path: path, public_url: pub,
    mime_type: "image/png", kind: "image", size_bytes: bytes.byteLength,
    created_by: by, meta,
  }).select("id,title,public_url,storage_path,meta").single();
  if (error) throw new Error(`no pude registrar ${nombre}: ${error.message}`);
  return data;
}

/**
 * Saneo del plan que devolvió la IA. No es paranoia: pasó de verdad en la primera prueba.
 *
 * Cuando el modelo se extiende demasiado en un campo de texto, a veces derrama el marcado del
 * tool call DENTRO del string ("...</modo_marca_motivo><parameter name=...>") y los campos que
 * venían después quedan sin valor. Con nombre_marca vacío, un logotipo saldría con la palabra
 * "undefined" impresa — se paga la imagen y se tira.
 *
 * Entonces: se limpia el marcado y se rellena nombre_marca desde la ficha del cliente, que es de
 * donde tenía que salir igual.
 */
function sanearPlan(plan: Record<string, unknown>, cliente: Record<string, unknown>): Record<string, unknown> {
  // Corta en el primer "<" que abra un tag: todo lo que sigue es derrame, no contenido.
  const limpiar = (v: unknown) => str(v).replace(/<\/?[a-z_][^>]*>[\s\S]*$/i, "").trim();

  for (const k of ["modo_marca_motivo", "nombre_marca", "iniciales", "territorio", "tipografia", "notas"]) {
    if (typeof plan[k] === "string") plan[k] = limpiar(plan[k]);
  }
  plan.modo_marca_motivo = clip(str(plan.modo_marca_motivo), 600);

  if (!str(plan.modo_marca)) plan.modo_marca = "persona";
  if (!str(plan.nombre_marca)) {
    plan.nombre_marca = str(plan.modo_marca) === "equipo" ? str(cliente.team_name) : str(cliente.name);
  }
  if (!str(plan.iniciales)) {
    plan.iniciales = str(plan.nombre_marca).split(/\s+/).map((p) => p[0] || "").join("").slice(0, 3).toUpperCase();
  }

  // Un color repetido deja la paleta con 3 colores útiles y dos bandas idénticas en el swatch:
  // se descarta el duplicado en vez de mostrarlo.
  for (const p of (plan.paletas as Record<string, unknown>[]) || []) {
    const vistos = new Set<string>();
    p.colores = ((p.colores as Record<string, unknown>[]) || []).filter((c) => {
      const hex = str(c.hex).toUpperCase();
      if (!/^#[0-9A-F]{6}$/.test(hex) || vistos.has(hex)) return false;
      vistos.add(hex);
      c.hex = hex;
      return true;
    });
  }
  plan.paletas = ((plan.paletas as Record<string, unknown>[]) || []).filter((p) => ((p.colores as unknown[]) || []).length >= 2);

  for (const l of (plan.logos as Record<string, unknown>[]) || []) {
    for (const k of ["concepto", "prompt_imagen", "pieza", "base", "hex", "tagline", "bajada"]) {
      if (typeof l[k] === "string") l[k] = limpiar(l[k]);
    }
  }
  // El lockup no necesita prompt (se arma pegando las otras dos); las demás piezas sin prompt no sirven.
  plan.logos = ((plan.logos as Record<string, unknown>[]) || []).filter((l) => str(l.prompt_imagen) || str(l.pieza) === "lockup");

  return plan;
}

/**
 * Ordena las piezas en sistemas coherentes.
 *
 * El orden no es cosmético: el lockup se construye a PARTIR del isotipo ya renderizado, así que si
 * el modelo devuelve las piezas cambiadas de lugar, el lockup llega antes que su símbolo y la
 * cadena se corta. Y como las tres piezas son la misma marca, el color y la familia se fuerzan
 * desde la primera: que el logotipo salga de otro color que el isotipo no es una variante, es un
 * error que se paga en imágenes.
 */
const ORDEN_PIEZAS = ["logotipo", "isotipo", "lockup"] as const;

function normalizarSistemas(plan: Record<string, unknown>, formato: string, cliente: Record<string, unknown>): Record<string, unknown> {
  // Las iniciales del monograma salen del nombre sobre el que está construido ESE sistema: con dos
  // direcciones, el sistema del equipo lleva las del equipo, no las del líder.
  const inicialesDe = (base: string) => {
    const nombre = base === "equipo" ? str(cliente.team_name) : str(cliente.name);
    return nombre.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 3).toUpperCase();
  };
  const logos = ((plan.logos as Record<string, unknown>[]) || []).slice();

  const nSist = formato === "dos_direcciones" ? 2 : 1;
  const salida: Record<string, unknown>[] = [];

  for (let s = 0; s < nSist; s++) {
    const grupo = logos.slice(s * 3, s * 3 + 3);
    if (!grupo.length) break;
    // Si el modelo rotuló bien las piezas se respeta ese rótulo; si no, manda la posición.
    const porPieza = new Map<string, Record<string, unknown>>();
    for (const l of grupo) {
      const p = str(l.pieza);
      if (ORDEN_PIEZAS.includes(p as typeof ORDEN_PIEZAS[number]) && !porPieza.has(p)) porPieza.set(p, l);
    }
    const sobrantes = grupo.filter((l) => ![...porPieza.values()].includes(l));

    const cabeza = porPieza.get("logotipo") || grupo[0];
    for (const pieza of ORDEN_PIEZAS) {
      const l = porPieza.get(pieza) || sobrantes.shift();
      if (!l) continue;
      l.pieza = pieza;
      l.sist = s + 1;
      // Una marca, un color, una familia. El lockup además nunca lleva lema (el generador escribe
      // mal las frases largas) y el isotipo nunca lleva texto de ningún tipo.
      l.hex = str(cabeza.hex) || str(l.hex);
      l.paleta_idx = Number(cabeza.paleta_idx) || Number(l.paleta_idx) || 1;
      l.base = str(cabeza.base) || str(l.base) || "persona";
      l.style_tags = (cabeza.style_tags as string[]) || (l.style_tags as string[]) || [];
      l.iniciales = inicialesDe(str(l.base));
      l.iniciales = inicialesDe(str(l.base));
      if (pieza !== "logotipo") l.tagline = "";
      if (pieza !== "lockup") l.bajada = "";
      salida.push(l);
    }
  }

  plan.logos = salida;
  return plan;
}

/**
 * ¿Dos paletas son la misma para el ojo?
 *
 * Comparar los hex tal cual no alcanza: al pedirle "otra dirección" devolvió las mismas tres
 * paletas con un color de acento cambiado y el mismo nombre. Formalmente distintas, en pantalla
 * idénticas — y encima ocupando el lugar de una propuesta nueva.
 *
 * Pero comparar los CUATRO colores tampoco sirve, y esto costó una prueba fallida: el neutro
 * claro (crema) y el oscuro (carbón) son casi los mismos en toda paleta del mismo nicho, así que
 * inflaban la coincidencia y daban por repetidas paletas obviamente distintas — una terracota y
 * una grafito+turquesa contaban 3 de 4 "cerca" sólo por los neutros.
 *
 * Lo que define el carácter de una paleta es el PRINCIPAL y el SECUNDARIO. Si esos dos están
 * cerca, es la misma paleta por más que cambie el acento. Umbral 60 sobre un máximo de 441:
 * tolera el mismo color un poco más claro, no un matiz distinto.
 */
function caracterDePaleta(colors: string[], roles: Record<string, string> | null): string[] {
  const p = str(roles?.principal), s = str(roles?.secundario);
  // Sin roles se cae al orden del contrato: principal, secundario, acento, neutro.
  return [p || colors[0] || "", s || colors[1] || ""].filter(Boolean);
}

function paletasParecidas(a: string[], b: string[]): boolean {
  if (a.length < 2 || b.length < 2) return false;
  const [a0, a1] = a.map(hexARgb), [b0, b1] = b.map(hexARgb);
  const d = (x: number[], y: number[]) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  // El emparejamiento tiene que ser UNO A UNO. Si sólo se pide "que cada color tenga alguno
  // cerca", los dos colores de una paleta pueden mapear al MISMO color de la otra y da falso
  // positivo: pasó con grafito+turquesa contra azul+cobre, donde el grafito y el turquesa caían
  // los dos cerca del azul y se descartó una paleta que era claramente distinta.
  return (d(a0, b0) < 60 && d(a1, b1) < 60) || (d(a0, b1) < 60 && d(a1, b0) < 60);
}

/** Agrega lo renderizado al plan de la corrida, para poder comparar en la próxima regeneración. */
async function anotarRendered(runId: string, entrada: Record<string, unknown>) {
  const { data: run } = await supabase.from("client_branding_runs").select("plan").eq("id", runId).maybeSingle();
  const plan = (run?.plan as Record<string, unknown>) || {};
  const rendered = (plan.rendered as unknown[]) || [];
  rendered.push(entrada);
  await supabase.from("client_branding_runs")
    .update({ plan: { ...plan, rendered }, updated_at: new Date().toISOString() }).eq("id", runId);
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const { data: sp } = await supabase.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const cronSecret = str((sp?.value as Record<string, unknown>)?.cron_secret);
  const gotSecret = req.headers.get("x-cron-secret") || "";
  const porSecret = !!cronSecret && gotSecret === cronSecret;
  const email = porSecret ? null : await authedUser(req);
  if (!porSecret && !email) return j({ ok: false, error: "unauthorized" }, 401);
  const by = email || "cron:branding";

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vacío */ }

  const action = str(body.action) || "plan";
  const clientId = str(body.client_id);
  if (!clientId) return j({ ok: false, error: "missing_params", detail: "Falta client_id." }, 400);

  const cfg = await cargarCfg();

  try {
    if (action === "selftest") return await accionSelftest(body);
    if (action === "plan") return await accionPlan(body, clientId, cfg, by);
    if (action === "render") return await accionRender(body, clientId, cfg, by);
    if (action === "palettes") return await accionPalettes(body, clientId, by);
    return j({ ok: false, error: "bad_action", detail: `Acción desconocida: ${action}` }, 400);
  } catch (e) {
    const detail = String((e as Error)?.message || e);
    await supabase.from("api_usage").insert({
      fn: "generar_branding", status: "error", client_id: clientId, error: clip(detail, 500), meta: { action },
    }).then(() => {}, () => {});
    return j({ ok: false, error: "server_error", detail: clip(detail, 400) }, 500);
  }
});

// ── Acción: plan ─────────────────────────────────────────────────────────────

async function accionPlan(body: Record<string, unknown>, clientId: string, cfg: Cfg, by: string) {
  const modo = ["nuevo", "variar", "otra_direccion"].includes(str(body.modo)) ? str(body.modo) : "nuevo";
  const formato = FORMATOS[str(body.formato)] ? str(body.formato) : "sistema";
  const nPiezas = FORMATOS[formato].piezas;
  const nImagenes = FORMATOS[formato].imagenes;
  const quality = ["low", "medium", "high"].includes(str(body.quality)) ? str(body.quality) : "medium";
  const modoForzado = ["persona", "equipo"].includes(str(body.modo_marca_forzado)) ? str(body.modo_marca_forzado) : "";

  // Todo lo que no depende de nada más, junto. Contra esta base cada consulta cuesta varios
  // segundos (medido: entre 3 y 11 cada una), así que encadenarlas sumaba ~30 segundos de espera
  // antes siquiera de empezar a pensar el branding.
  const [{ data: cliente }, { data: keyRow }, freno] = await Promise.all([
    supabase.from("clients")
      .select("id,name,team_name,company,niche,service,country,brand_colors,brand_font").eq("id", clientId).maybeSingle(),
    supabase.from("secure_config").select("value").eq("key", "anthropic_api_key").maybeSingle(),
    chequearTopes(cfg, 0.03),
  ]);
  if (!cliente) return j({ ok: false, error: "cliente_inexistente", detail: "No encontré ese cliente." }, 404);

  // Validación dura. Sin estos cuatro datos el branding sale genérico, así que se frena acá y se
  // le pide al equipo que complete la tarjeta.
  const faltan = REQUERIDOS.filter((r) => !str(cliente[r.col as keyof typeof cliente]));
  if (faltan.length) {
    return j({
      ok: false, error: "datos_incompletos",
      faltan: faltan.map((f) => f.rotulo),
      campos: faltan.map((f) => f.col),
      detail: `Para generar el branding falta completar en la tarjeta del cliente: ${faltan.map((f) => f.rotulo).join(", ")}.`,
    });
  }

  const apiKey = str(keyRow?.value);
  if (!apiKey) return j({ ok: false, error: "missing_api_key", detail: "Falta configurar la API key de Anthropic." }, 500);

  const model = str((cfg.chat_models as Record<string, string>)?.branding) || str(cfg.chat_model) || "claude-sonnet-5";
  const price = ((cfg.prices as Record<string, { in: number; out: number }>) || {})[model] || PRECIOS_LISTA[model] || { in: 5, out: 25 };

  if (freno) {
    await supabase.from("api_usage").insert({ fn: "generar_branding", model, status: "blocked", client_id: clientId, error: freno.error, meta: { action: "plan" } });
    return j({ ok: false, ...freno }, 429);
  }

  const ficha = await elegirFicha(str(cliente.niche));
  const [contexto, aprendizaje] = await Promise.all([
    armarContexto(cliente as Record<string, unknown>),
    modo === "nuevo" ? Promise.resolve("") : bloqueAprendizaje(clientId, modo),
  ]);

  // Dos breakpoints de cache, de más estable a menos (el cache es un prefijo: lo que se mueve va
  // al final o invalida todo lo de arriba). El método y la ficha del nicho son estables por
  // nicho; el contexto del cliente es estable entre corridas del mismo cliente.
  const stableSystem = INSTRUCCIONES_DIRECTOR + (ficha ? `\n\n===== FICHA DE ESTILO DEL NICHO =====\n${ficha.content}` : "");
  const system = [
    { type: "text", text: stableSystem, cache_control: { type: "ephemeral" } },
    { type: "text", text: contexto, cache_control: { type: "ephemeral" } },
    ...(aprendizaje ? [{ type: "text", text: aprendizaje }] : []),
  ];

  const r = await llamarClaude(apiKey, model, system, construirPedido(formato, modoForzado));
  if (!r.ok) {
    await supabase.from("api_usage").insert({ fn: "generar_branding", model, status: "error", client_id: clientId, error: clip(r.detail, 500), meta: { action: "plan", modo } });
    return j({ ok: false, error: "api_error", detail: clip(r.detail, 400) }, 502);
  }

  const usage = r.data?.usage || {};
  const fresh = Number(usage.input_tokens || 0);
  const cacheRead = Number(usage.cache_read_input_tokens || 0);
  const cacheWrite = Number(usage.cache_creation_input_tokens || 0);
  const outTok = Number(usage.output_tokens || 0);
  // Los 3 tipos de token de entrada no valen lo mismo: leer del cache cuesta 0,1x y escribirlo 1,25x.
  const inCost = ((fresh + cacheRead * 0.1 + cacheWrite * 1.25) / 1e6) * price.in;
  const cost = Number((inCost + (outTok / 1e6) * price.out).toFixed(6));

  const bloque = (r.data?.content || []).find((c: Record<string, unknown>) => c.type === "tool_use");
  let plan = (bloque?.input as Record<string, unknown>) || null;
  if (!plan || !Array.isArray(plan.logos) || !Array.isArray(plan.paletas)) {
    await supabase.from("api_usage").insert({ fn: "generar_branding", model, status: "error", client_id: clientId, cost_usd: cost, error: "salida sin plan", meta: { action: "plan", stop: str(r.data?.stop_reason) } });
    return j({ ok: false, error: "plan_vacio", detail: "La IA no devolvió un plan utilizable. Probá de nuevo." });
  }

  plan = sanearPlan(plan, cliente as Record<string, unknown>);
  // Recorte defensivo: el modelo a veces devuelve de más.
  plan.logos = (plan.logos as unknown[]).slice(0, nPiezas);
  plan.paletas = (plan.paletas as unknown[]).slice(0, 3);
  plan = normalizarSistemas(plan, formato, cliente as Record<string, unknown>);
  plan.formato = formato;
  if (!(plan.logos as unknown[]).length || !(plan.paletas as unknown[]).length) {
    await supabase.from("api_usage").insert({ fn: "generar_branding", model, status: "error", client_id: clientId, cost_usd: cost, error: "plan incompleto tras sanear", meta: { action: "plan" } });
    return j({ ok: false, error: "plan_vacio", detail: "La IA devolvió un plan incompleto. Probá de nuevo." });
  }

  const { data: run, error } = await supabase.from("client_branding_runs").insert({
    client_id: clientId, modo, n_logos: (plan.logos as unknown[]).length, quality,
    modo_marca: str(plan.modo_marca), nombre_marca: str(plan.nombre_marca),
    plan: { ...plan, rendered: [] }, style_ref: ficha?.id || null,
    status: "planned", cost_usd: cost, created_by: by,
  }).select("id").single();
  if (error) return j({ ok: false, error: "no_guarde_run", detail: error.message }, 500);

  await supabase.from("api_usage").insert({
    fn: "generar_branding", model, input_tokens: fresh + cacheRead + cacheWrite, output_tokens: outTok,
    cost_usd: cost, client_id: clientId, status: "ok",
    meta: { action: "plan", run_id: run.id, modo, formato, n_logos: (plan.logos as unknown[]).length, quality, modo_marca: str(plan.modo_marca), style_ref: ficha?.id, cache_read_tokens: cacheRead, cache_write_tokens: cacheWrite, fresh_tokens: fresh },
  });

  return j({ ok: true, run_id: run.id, plan, cost_usd: cost, formato, n_imagenes: nImagenes, n_logos: (plan.logos as unknown[]).length });
}

// ── Acción: selftest (temporal, diagnóstico) ─────────────────────────────────
// Corre el mismo trabajo de píxeles que render, sobre un PNG que ya está en Storage, sin llamar al
// generador y sin subir nada. Sirve para ver dónde revienta el límite de recursos del edge runtime
// sin pagar una imagen por intento.

async function accionSelftest(body: Record<string, unknown>) {
  const path = str(body.path);
  const hasta = Number(body.hasta) || 99;   // para bisecar: corta después de N pasos
  const pasos: Record<string, unknown>[] = [];
  const marca = (nombre: string, t0: number) => {
    const m = (Deno as unknown as { memoryUsage?: () => { rss: number; heapUsed: number } }).memoryUsage?.();
    pasos.push({
      paso: nombre,
      ms: Math.round(performance.now() - t0),
      rss_mb: m ? Math.round(m.rss / 1048576) : null,
      heap_mb: m ? Math.round(m.heapUsed / 1048576) : null,
    });
  };

  let t = performance.now();
  const dl = await supabase.storage.from(BUCKET).download(path);
  if (!dl.data) return j({ ok: false, error: "no_baje", detail: dl.error?.message });
  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  marca(`descarga (${Math.round(bytes.byteLength / 1024)} KB)`, t);
  if (pasos.length >= hasta) return j({ ok: true, corte: "descarga", pasos });

  t = performance.now();
  const img = decodePng(bytes);
  limpiarAlfa(img.rgba);
  marca(`decode ${img.w}x${img.h}`, t);
  if (pasos.length >= hasta) return j({ ok: true, corte: "decode", pasos });

  t = performance.now();
  const an = analizarLogo(img);
  marca("analizarLogo", t);
  if (pasos.length >= hasta) return j({ ok: true, corte: "analizar", pasos });

  const pesos: number[] = [];
  for (const [nombre, tinta] of [["color", [11, 21, 48]], ["negro", [0, 0, 0]], ["blanco", [255, 255, 255]]] as [string, number[]][]) {
    t = performance.now();
    const buf = await encodePng(recolorear(img.rgba, tinta as [number, number, number], an.whiteKnockout), img.w, img.h);
    pesos.push(Math.round(buf.byteLength / 1024));
    marca(`recolor+encode ${nombre}`, t);
    if (pasos.length >= hasta) return j({ ok: true, corte: nombre, kb: pesos, pasos });
  }

  return j({ ok: true, mono: an.mono, white_knockout: an.whiteKnockout, kb: pesos, pasos });
}

// ── Acción: render (una imagen) ──────────────────────────────────────────────

async function accionRender(body: Record<string, unknown>, clientId: string, cfg: Cfg, by: string) {
  const runId = str(body.run_id);
  const idx = Math.max(1, Number(body.idx) || 1);
  if (!runId) return j({ ok: false, error: "missing_params", detail: "Falta run_id." }, 400);

  const { data: run } = await supabase.from("client_branding_runs").select("*").eq("id", runId).maybeSingle();
  if (!run || run.client_id !== clientId) return j({ ok: false, error: "run_inexistente", detail: "No encontré esa corrida." }, 404);

  const plan = (run.plan as Record<string, unknown>) || {};
  const logo = ((plan.logos as Record<string, unknown>[]) || [])[idx - 1];
  if (!logo) return j({ ok: false, error: "sin_logo", detail: `La corrida no tiene un logo ${idx}.` }, 400);

  // Idempotencia: si ese logo ya se renderizó, no se vuelve a pagar la imagen.
  const yaHecho = ((plan.rendered as Record<string, unknown>[]) || []).find((g) => g.kind === "logo" && Number(g.idx) === idx);
  if (yaHecho) return j({ ok: true, run_id: runId, idx, ya_estaba: true, cost_usd: 0, resources: [] });

  const quality = str(run.quality) || "medium";
  const pieza = str(logo.pieza) || "isotipo";
  const nombreMarca = str(run.nombre_marca);
  const rendered = (plan.rendered as Record<string, unknown>[]) || [];
  const sist = Number(logo.sist) || 1;

  // El lockup no se pide: se arma pegando el isotipo y el logotipo de su mismo sistema, que ya
  // están generados. No cuesta nada y sale exacto — ver componerLockup en png.ts.
  if (pieza === "lockup") {
    return await ensamblarLockup({ runId, idx, clientId, run, plan, logo, rendered, sist, quality, by });
  }

  const precio = precioImagen(cfg, quality);

  const freno = await chequearTopes(cfg, precio);
  if (freno) {
    await supabase.from("api_usage").insert({ fn: "generar_branding_img", model: "gpt-image-1", status: "blocked", client_id: clientId, error: freno.error, meta: { action: "render", run_id: runId, idx } });
    return j({ ok: false, ...freno }, 429);
  }

  const { data: keyRow } = await supabase.from("secure_config").select("value").eq("key", "openai_api_key").maybeSingle();
  const openaiKey = str(keyRow?.value);
  if (!openaiKey) {
    return j({ ok: false, error: "missing_openai_key", detail: "Falta cargar la API key de OpenAI (secure_config.openai_api_key). Sin eso no se pueden generar los logos." });
  }

  const prompt = construirPromptImagen(logo, nombreMarca, str(plan.tipografia));
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", quality, background: "transparent", output_format: "png", n: 1 }),
      signal: AbortSignal.timeout(180000),
    });
  } catch (e) {
    const detail = String((e as Error)?.message || e);
    await supabase.from("api_usage").insert({ fn: "generar_branding_img", model: "gpt-image-1", status: "error", client_id: clientId, error: clip(detail, 500), meta: { action: "render", run_id: runId, idx } });
    return j({ ok: false, error: "image_error", detail: `No pude generar la imagen: ${clip(detail, 300)}` });
  }

  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    let error = "image_error";
    let detail = `El generador de imágenes devolvió un error (${res.status}).`;
    if (res.status === 403 && /verif/i.test(texto)) {
      error = "openai_org_unverified";
      detail = "La organización de OpenAI todavía no está verificada, y gpt-image-1 la exige. Hay que hacer la verificación de identidad en el panel de OpenAI (Settings → Organization → General).";
    } else if (res.status === 400 && /moderation|safety|policy/i.test(texto)) {
      error = "image_rechazada";
      detail = "El generador rechazó el pedido por sus filtros de contenido. Probá regenerar: el concepto siguiente suele pasar.";
    } else if (res.status === 401) {
      error = "openai_key_invalida";
      detail = "La API key de OpenAI no es válida o no tiene permiso para gpt-image-1.";
    } else {
      detail += ` ${clip(texto, 250)}`;
    }
    await supabase.from("api_usage").insert({ fn: "generar_branding_img", model: "gpt-image-1", status: "error", client_id: clientId, error: clip(`${res.status} ${texto}`, 500), meta: { action: "render", run_id: runId, idx } });
    return j({ ok: false, error, detail });
  }

  const data = await res.json();
  const b64 = str(data?.data?.[0]?.b64_json);
  if (!b64) return j({ ok: false, error: "image_error", detail: "El generador no devolvió ninguna imagen." });

  const bin = atob(b64);
  const original = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) original[i] = bin.charCodeAt(i);

  const img = decodePng(original);
  limpiarAlfa(img.rgba);
  const { mono, whiteKnockout } = analizarLogo(img);

  const recursos = await publicarPieza({ img, mono, whiteKnockout, runId, idx, clientId, run, logo, pieza, sist, quality, nombreMarca, by });

  await supabase.from("client_branding_runs")
    .update({ status: "rendering", cost_usd: Number(run.cost_usd || 0) + precio, updated_at: new Date().toISOString() })
    .eq("id", runId);

  await supabase.from("api_usage").insert({
    fn: "generar_branding_img", model: "gpt-image-1", input_tokens: 0, output_tokens: 0,
    cost_usd: precio, client_id: clientId, status: "ok",
    meta: { action: "render", run_id: runId, idx, pieza, quality, size: "1024x1024", mono, white_knockout: whiteKnockout },
  });

  return j({ ok: true, run_id: runId, idx, pieza, mono, white_knockout: whiteKnockout, cost_usd: precio, resources: recursos });
}

/**
 * Sube las tres versiones de una pieza (color, negro, blanco) y la anota en la corrida.
 * Es el tramo común entre las piezas que vienen del generador y el lockup, que se arma acá.
 */
async function publicarPieza(a: {
  img: { w: number; h: number; rgba: Uint8Array }; mono: boolean; whiteKnockout: boolean;
  runId: string; idx: number; clientId: string; run: Record<string, unknown>;
  logo: Record<string, unknown>; pieza: string; sist: number; quality: string; nombreMarca: string; by: string;
}) {
  const { img, mono, whiteKnockout, logo, pieza } = a;
  const groupId = "lg_" + crypto.randomUUID().slice(0, 8);
  const metaBase = {
    gen: "branding", run_id: a.runId, kind: "logo", group_id: groupId, idx: a.idx,
    pieza, sist: a.sist, ensamblado: pieza === "lockup",
    concepto: str(logo.concepto), base: str(logo.base),
    style_tags: (logo.style_tags as string[]) || [], hex: str(logo.hex), paleta_idx: Number(logo.paleta_idx) || 1,
    nombre_marca: a.nombreMarca, modo_marca: str(a.run.modo_marca),
    image_model: pieza === "lockup" ? "ensamblado" : "gpt-image-1", quality: a.quality, mono, white_knockout: whiteKnockout,
  };

  const rotuloBase = str(logo.base) === "equipo" ? "equipo" : "marca personal";
  const rotuloPieza = PIEZAS[pieza]?.rotulo || pieza;
  // Las TRES versiones se pintan acá, incluida la de color: el generador elige el color por su
  // cuenta y no respeta el de la paleta (se pidió #2F6B3C y devolvió #385C57). Pintarlo garantiza
  // que el logo salga en el color exacto que la paleta declara, y que las tres versiones sean
  // literalmente la misma forma.
  const tinta = hexARgb(str(logo.hex)) as [number, number, number];
  const versiones: { key: string; bytes: Uint8Array }[] = [
    { key: "color", bytes: await encodePng(recolorear(img.rgba, tinta, whiteKnockout), img.w, img.h) },
    { key: "negro", bytes: await encodePng(recolorear(img.rgba, [0, 0, 0], whiteKnockout), img.w, img.h) },
    { key: "blanco", bytes: await encodePng(recolorear(img.rgba, [255, 255, 255], whiteKnockout, [0, 0, 0]), img.w, img.h) },
  ];

  const recursos = [];
  for (let i = 0; i < versiones.length; i++) {
    const v = versiones[i];
    recursos.push(await subirPng(
      a.clientId, `logo${a.idx}_${pieza}_${v.key}`, v.bytes,
      // El "1/2/3" mantiene el trío ordenado color→negro→blanco con el sort alfabético que ya usa
      // la carpeta; sin él quedaría blanco, color, negro.
      `${a.idx}. ${rotuloPieza} · ${rotuloBase} · ${i + 1} ${v.key}`,
      { ...metaBase, variant: v.key },
      a.by,
    ));
  }

  await anotarRendered(a.runId, {
    group_id: groupId, kind: "logo", idx: a.idx, pieza, sist: a.sist, concepto: str(logo.concepto),
    style_tags: (logo.style_tags as string[]) || [], hex: str(logo.hex), base: str(logo.base),
    white_knockout: whiteKnockout,
    // Con esto el lockup encuentra las piezas de su sistema para ensamblarlas.
    ref_path: str(recursos[1]?.storage_path),
  });
  return recursos;
}

/**
 * El lockup: isotipo + logotipo, pegados. Cero llamadas a la API, cero espera, y el símbolo y la
 * tipografía son exactamente los de las otras dos piezas — que es lo que un lockup tiene que ser.
 */
async function ensamblarLockup(a: {
  runId: string; idx: number; clientId: string; run: Record<string, unknown>; plan: Record<string, unknown>;
  logo: Record<string, unknown>; rendered: Record<string, unknown>[]; sist: number; quality: string; by: string;
}) {
  const buscar = (p: string) => a.rendered.find((g) => g.kind === "logo" && g.pieza === p && (Number(g.sist) || 1) === a.sist);
  const iso = buscar("isotipo"), texto = buscar("logotipo");
  if (!iso || !texto) {
    return j({
      ok: false, error: "faltan_piezas",
      detail: "El lockup se arma juntando el isotipo y el logotipo, y todavía falta generar alguno de los dos. Generá primero las piezas 1 y 2.",
    }, 400);
  }

  // Se usan las versiones NEGRAS: es la silueta limpia, y el color se aplica igual al publicar.
  const bajar = async (path: string) => {
    const dl = await supabase.storage.from(BUCKET).download(path);
    if (!dl.data) throw new Error(`no pude bajar ${path}: ${dl.error?.message}`);
    return decodePng(new Uint8Array(await dl.data.arrayBuffer()));
  };
  const isoImg = await bajar(str(iso.ref_path));
  const textoImg = await bajar(str(texto.ref_path));

  const img = componerLockup(isoImg, textoImg);
  if (!img) return j({ ok: false, error: "lockup_vacio", detail: "Una de las dos piezas salió vacía y no pude armar el lockup." });
  limpiarAlfa(img.rgba);

  // El knockout no se recalcula: la imagen ya viene aplanada a negro, así que el detector no lo
  // vería. Se hereda de las piezas de origen, que es donde se midió sobre el original.
  const whiteKnockout = !!iso.white_knockout || !!texto.white_knockout;

  const recursos = await publicarPieza({
    img, mono: true, whiteKnockout, runId: a.runId, idx: a.idx, clientId: a.clientId, run: a.run,
    logo: a.logo, pieza: "lockup", sist: a.sist, quality: a.quality,
    nombreMarca: str(a.run.nombre_marca), by: a.by,
  });

  await supabase.from("client_branding_runs")
    .update({ status: "rendering", updated_at: new Date().toISOString() }).eq("id", a.runId);

  return j({ ok: true, run_id: a.runId, idx: a.idx, pieza: "lockup", ensamblado: true, mono: true, cost_usd: 0, resources: recursos });
}

// ── Acción: palettes ─────────────────────────────────────────────────────────

async function accionPalettes(body: Record<string, unknown>, clientId: string, by: string) {
  const runId = str(body.run_id);
  if (!runId) return j({ ok: false, error: "missing_params", detail: "Falta run_id." }, 400);

  const { data: run } = await supabase.from("client_branding_runs").select("*").eq("id", runId).maybeSingle();
  if (!run || run.client_id !== clientId) return j({ ok: false, error: "run_inexistente", detail: "No encontré esa corrida." }, 404);

  const plan = (run.plan as Record<string, unknown>) || {};
  const paletas = (plan.paletas as Record<string, unknown>[]) || [];
  if (!paletas.length) return j({ ok: false, error: "sin_paletas", detail: "La corrida no tiene paletas." }, 400);

  if (((plan.rendered as Record<string, unknown>[]) || []).some((g) => g.kind === "palette")) {
    return j({ ok: true, run_id: runId, ya_estaba: true, cost_usd: 0, resources: [] });
  }

  // Al regenerar, la IA tiende a devolver de nuevo la paleta que el equipo CONSERVÓ (y hace bien:
  // es la señal de que le gustó). Pero volver a subirla deja dos filas idénticas en la carpeta.
  // Se le pide que no lo haga en el prompt, y además se chequea acá: el prompt convence, esto
  // garantiza.
  const { data: vivas } = await supabase.from("funnel_resources").select("meta")
    .eq("client_id", clientId).is("strategy_id", null).eq("bucket_key", "branding")
    .eq("meta->>kind", "palette");
  const yaEnLaCarpeta = (vivas || []).map((r) => {
    const m = (r.meta as Record<string, unknown>) || {};
    const colors = ((m.colors as string[]) || []).map((h) => str(h).toUpperCase());
    return caracterDePaleta(colors, (m.roles as Record<string, string>) || null);
  }).filter((c) => c.length >= 2);

  const recursos = [];
  let repetidas = 0;
  for (let i = 0; i < paletas.length; i++) {
    const p = paletas[i];
    const colores = ((p.colores as Record<string, unknown>[]) || []).map((c) => ({
      hex: str(c.hex).toUpperCase(), rol: str(c.rol), nombre: str(c.nombre),
    })).filter((c) => /^#[0-9A-F]{6}$/.test(c.hex));
    if (!colores.length) continue;
    const hexes = colores.map((c) => c.hex);
    const roles = Object.fromEntries(colores.map((c) => [c.rol || "otro", c.hex]));
    // Contra lo que ya está en la carpeta Y contra lo que se acaba de subir en esta misma
    // corrida: si no, dos de las tres paletas nuevas pueden ser casi la misma entre sí.
    const caracter = caracterDePaleta(hexes, roles);
    if (yaEnLaCarpeta.some((v) => paletasParecidas(caracter, v))) { repetidas++; continue; }
    yaEnLaCarpeta.push(caracter);

    const groupId = "pl_" + crypto.randomUUID().slice(0, 8);
    const bytes = await dibujarPaleta(str(p.nombre), colores);

    recursos.push(await subirPng(
      clientId, `paleta${i + 1}`, bytes,
      // Los HEX van en el título a propósito: es lo que se puede copiar sin abrir la imagen, y el
      // respaldo si el PNG no se ve bien en algún lado.
      `Paleta ${i + 1} · ${str(p.nombre)} · ${hexes.join(" ")}`,
      {
        gen: "branding", run_id: runId, kind: "palette", group_id: groupId, idx: i + 1,
        palette_name: str(p.nombre), razon: str(p.razon), colors: hexes, roles,
      },
      by,
    ));

    await anotarRendered(runId, { group_id: groupId, kind: "palette", idx: i + 1, palette_name: str(p.nombre), colors: hexes });
  }

  await supabase.from("client_branding_runs")
    .update({ status: "done", updated_at: new Date().toISOString() }).eq("id", runId);

  return j({ ok: true, run_id: runId, cost_usd: 0, resources: recursos, repetidas });
}
