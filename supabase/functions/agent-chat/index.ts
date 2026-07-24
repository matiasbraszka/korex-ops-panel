// supabase/functions/agent-chat/index.ts
// Chat con un mini-agente especializado del cerebro de Korex (empezamos por "anuncios").
// A PEDIDO (el equipo escribe en el panel), 100% sincrónico. NADA corre en segundo plano.
//
// Reglas anti-fuga (idénticas a cerebro-generate-avatars):
//   - Solo usuario logueado del panel O el cron_secret interno. Nada anónimo/público.
//   - UNA sola llamada a la API por invocación (a lo sumo 1 reintento ante 429/5xx). Sin loops.
//   - Tope de gasto DIARIO y MENSUAL (config): si se superó, NO llama y avisa.
//   - max_tokens acotado + timeout. Cada turno se registra en api_usage.
//
// El agente compone su system prompt en RUNTIME = capa General (ADN Korex) + instrucciones del
// especialista + material de capacitación + el CONTEXTO del cliente/funnel/avatar elegido
// (brief, avatar, guión del VSL, anuncios ganadores, métricas) + el estado del GATE del pipeline.
//
// Candado duro (regla Korex): los anuncios se construyen a partir del VSL. Si la etapa "anuncios"
// está BLOQUEADA (sin VSL), NO se genera copy final (server-side, no solo en la UI).
//
// Config: secure_config.anthropic_api_key + app_settings.api_config (chat_model, topes, precios).

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
function clip(s: string, n: number) { const t = str(s); return t.length > n ? t.slice(0, n) + "\n…[recortado]" : t; }
function norm(s: string) { return str(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim(); }

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

type Msg = { role: string; content: string };

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
  const subagentKey = str(body.subagent_key) || "anuncios";
  const clientId = str(body.client_id);
  const strategyId = str(body.strategy_id);
  const funnelId = str(body.funnel_id);
  const avatarId = str(body.avatar_id);
  const mode = str(body.mode) === "generate" ? "generate" : "chat";
  const rawMsgs = Array.isArray(body.messages) ? (body.messages as Record<string, unknown>[]) : [];
  // Descubrimiento trabaja a nivel CLIENTE: corre ANTES de que existan estrategias, funnels y
  // avatares — el avatar es su SALIDA (paso 5), no su entrada. Exigirle un funnel seria pedirle
  // el resultado del paso 5 para poder hacer el paso 1. El resto de los agentes no cambia.
  const nivelCliente = subagentKey === "descubrimiento";
  if (!clientId || (!funnelId && !nivelCliente)) {
    return j({ ok: false, error: "missing_params", detail: "Faltan client_id o funnel_id." }, 400);
  }

  // Sanear y recortar el historial (últimos ~12 turnos, roles válidos, contenido acotado).
  const messages: Msg[] = rawMsgs
    .map((m) => ({ role: str(m.role) === "assistant" ? "assistant" : "user", content: clip(str(m.content), 6000) }))
    .filter((m) => m.content)
    .slice(-12);
  // La API exige que el PRIMER mensaje del array sea del usuario. slice() corta por CANTIDAD, no
  // por rol: un chat que alterna user/assistant manda un número impar de mensajes (2k-1 en el
  // turno k), así que del turno 7 en adelante la ventana arranca siempre en una respuesta del
  // agente → 400 → el chat moría justo cuando se ponía larga. Determinista, no intermitente.
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length) return j({ ok: false, error: "no_messages", detail: "No hay mensaje para responder." }, 400);

  // Config + secreto.
  const { data: keyRow } = await supabase.from("secure_config").select("value").eq("key", "anthropic_api_key").maybeSingle();
  const apiKey = str(keyRow?.value);
  if (!apiKey) return j({ ok: false, error: "missing_api_key", detail: "Falta configurar la API key de Anthropic." }, 500);
  const { data: cfgRow } = await supabase.from("app_settings").select("value").eq("key", "api_config").maybeSingle();
  const cfg = (cfgRow?.value as Record<string, unknown>) ?? {};
  // Modelo POR agente (app_settings.api_config.chat_models[subagent]) con fallback al global.
  const chatModels = (cfg.chat_models as Record<string, string>) || {};
  const model = str(chatModels[subagentKey]) || str(cfg.chat_model) || "claude-sonnet-5";
  const maxTokens = Number(mode === "generate" ? (cfg.chat_generate_max_tokens ?? 4096) : (cfg.chat_max_tokens ?? 6000));
  const dailyCap = Number(cfg.daily_cap_usd ?? 5);
  const monthlyCap = Number(cfg.monthly_cap_usd ?? 100);
  // Precio por millón de tokens. Manda app_settings.api_config.prices; esto es el respaldo.
  //
  // El respaldo es por MODELO y no un número suelto por un motivo concreto: `chat_models[agente]`
  // se puede cambiar desde la base (no tiene UI todavía), y con un default fijo de 3/15 un agente
  // movido a Opus registraba un costo 40% MÁS BARATO del real — o sea que los topes, que existen
  // justamente para frenar la fuga, dejaban pasar de largo. El respaldo tiene que errar caro.
  //
  // Son precios de lista. Sonnet 5 está en promo de introducción (US$2/US$10) hasta el 31-08-2026:
  // no se hardcodea porque vence sola y quedaría subestimando; si querés el número exacto, va en
  // api_config.prices. Sobreestimar solo hace que el freno salte un poco antes, que es el lado
  // seguro para equivocarse.
  const PRECIOS_LISTA: Record<string, { in: number; out: number }> = {
    "claude-opus-4-8": { in: 5, out: 25 },
    "claude-sonnet-5": { in: 3, out: 15 },
    "claude-haiku-4-5-20251001": { in: 1, out: 5 },
    "claude-haiku-4-5": { in: 1, out: 5 },
  };
  const prices = (cfg.prices as Record<string, { in: number; out: number }>) || {};
  const price = prices[model] || PRECIOS_LISTA[model] || { in: 5, out: 25 };

  // ── Freno anti-fuga: topes de gasto ──
  try {
    const { data: stats } = await supabase.rpc("api_usage_stats");
    const todayCost = Number((stats as Record<string, Record<string, number>>)?.today?.cost ?? 0);
    const monthCost = Number((stats as Record<string, Record<string, number>>)?.month?.cost ?? 0);
    if (todayCost >= dailyCap) {
      await supabase.from("api_usage").insert({ fn: "agent_chat", model, status: "blocked", client_id: clientId, funnel_id: funnelId, error: "tope diario", meta: { subagent_key: subagentKey, mode, todayCost, dailyCap } });
      return j({ ok: false, error: "daily_cap", detail: `Se alcanzó el tope de gasto diario (US$${dailyCap}). Se reinicia mañana o subilo en Administración.` }, 429);
    }
    if (monthCost >= monthlyCap) {
      await supabase.from("api_usage").insert({ fn: "agent_chat", model, status: "blocked", client_id: clientId, funnel_id: funnelId, error: "tope mensual", meta: { subagent_key: subagentKey, mode, monthCost, monthlyCap } });
      return j({ ok: false, error: "monthly_cap", detail: `Se alcanzó el tope de gasto mensual (US$${monthlyCap}).` }, 429);
    }
  } catch { /* si falla el chequeo, seguimos (el max_tokens acota igual) */ }

  // ── Capa de capacitación (estable → se cachea) ──
  const { data: saRows } = await supabase.from("marketing_subagents").select("key,name,instructions").in("key", ["general", subagentKey]);
  const general = str((saRows || []).find((r) => r.key === "general")?.instructions);
  const specialist = (saRows || []).find((r) => r.key === subagentKey);
  const specialistName = str(specialist?.name) || subagentKey;
  const specialistInstr = str(specialist?.instructions);

  const { data: matRows } = await supabase.from("marketing_training_material")
    .select("kind,title,content,url").eq("scope", subagentKey).order("position", { ascending: true }).limit(10);
  const material = (matRows || []).map((m) => {
    const head = `[${str(m.kind) || "material"}] ${str(m.title) || ""}`.trim();
    const bodyTxt = str(m.content) ? clip(str(m.content), 2500) : (str(m.url) ? `Link: ${str(m.url)}` : "");
    return bodyTxt ? `${head}\n${bodyTxt}` : head;
  }).filter(Boolean).join("\n\n");

  // Blueprint maestro (método fijo, se cachea con el resto de lo estable).
  // Cada agente tiene su corpus dentro de marketing_ad_library, distinguido por `part`.
  const CORPUS: Record<string, { blueprintId: string; rotulo: string; section: string; example: string }> = {
    anuncios: { blueprintId: "mal_blueprint", rotulo: "BLUEPRINT MAESTRO DE ANUNCIOS", section: "blueprint_section", example: "example" },
    vsl: { blueprintId: "mal_vsl_blueprint", rotulo: "BLUEPRINT MAESTRO DE VSL (v4.0)", section: "vsl_section", example: "vsl_ficha" },
    landing: { blueprintId: "mal_cf_blueprint", rotulo: "BLUEPRINT MAESTRO DE FUNNELS (SOP + errores comunes)", section: "cf_section", example: "cf_ficha" },
    // Descubrimiento tiene su propio retrieval (más abajo) y NO usa el scorer genérico: elige
    // QUÉ SKILL entra, no qué párrafos. Por eso `section`/`example` quedan vacíos — si
    // apuntaran a desc_skill, el scorer traería los 3 SKILL.md más parecidos (~100 KB).
    descubrimiento: { blueprintId: "mal_desc_blueprint", rotulo: "SOP DEL DESCUBRIMIENTO KOREX", section: "", example: "" },
  };
  const corpus = CORPUS[subagentKey] || null;

  let blueprint = "";
  if (corpus) {
    const { data: bpRow } = await supabase.from("marketing_ad_library").select("content").eq("id", corpus.blueprintId).maybeSingle();
    blueprint = clip(str(bpRow?.content), 24000);  // margen para que la GUARDIA DE COMPLIANCE (al final) nunca se corte
  }

  // ── Formato de la respuesta ──
  // El panel renderiza markdown (AgentMarkdown.jsx): encabezados, listas, tablas, citas y
  // las etiquetas de oficio como chips de color. Va acá y no en las instrucciones editables
  // porque es contrato con el frontend, no criterio de marketing: si cambia el render,
  // cambia esto, no el texto que edita el equipo.
  const FORMATO_POR_AGENTE: Record<string, string> = {
    anuncios: [
      "- Un `## Ángulo N · <nombre del ángulo>` por cada ángulo. Es el separador principal: sin esto los ángulos se mezclan.",
      "- Dentro de cada ángulo, usá estas etiquetas al principio de renglón (se pintan solas):",
      "  `Titular:` · `Hook 1:` `Hook 2:` … (uno por renglón, numerados) · `Texto base:` · `Descripción:` · `Nota creativa:`",
      "- El `Texto base` va después de los hooks: se muestra destacado, es el cuerpo del anuncio.",
    ].join("\n"),
    vsl: [
      "- Una sección del guión = un `## N) NOMBRE DE LA SECCIÓN` (ej: `## 1) HOOK`, `## 4) DOLOR + EMPATÍA`). El panel las numera y las separa solas.",
      "- El texto para grabar va como párrafo corriente debajo de su sección, tal cual se dice en cámara.",
      "- Para el menú de hooks usá `Hook 1:` … `Hook 5:`, uno por renglón, y aclarando la fórmula entre corchetes al principio (ej: `Hook 1: [A] En los próximos 6 minutos…`).",
      "- Las acotaciones de dirección (formato, plano, demo) van en *cursiva* o como cita `>`, para que no se confundan con el texto hablado.",
      "- `Caso base:`, `Promesa:`, `Ángulo:`, `Mecanismo:`, `Cierre:` y `Notas:` también se pintan como etiqueta.",
    ].join("\n"),
    // El copy de una landing no se entiende sin su forma: qué va arriba de qué, qué va al
    // lado de la foto, qué va centrado. Por eso la salida es la MAQUETA con el copy adentro,
    // y la maqueta se dibuja con TABLAS: una banda = una tabla, y las columnas de la tabla
    // son las columnas de la página. Es el mismo formato de los WIREFRAMES del blueprint:
    // se copian esas tablas y se les cambia el contenido. El chat de este agente va ancho.
    landing: [
      "- Una página del funnel = un `## N) NOMBRE DE LA PÁGINA` (`## 1) PRE-LANDING`, `## 2) LANDING VSL`, `## 3) FORMULARIO`, `## 4) THANK YOU PAGE`). Siempre en el orden en que la persona las recorre.",
      "- Dentro de cada página, el copy va SIEMPRE maquetado con TABLAS, igual que los wireframes que tenés arriba. UNA BANDA = UNA TABLA. Una banda es una franja horizontal de la página; van de arriba hacia abajo, en el orden en que se scrollea.",
      "- Banda de 2 columnas (el patrón copy + foto) — el encabezado nombra la banda y las columnas SON las de la página:",
      "  `| BANDA 2 · HERO — Izquierda | Derecha |`",
      "  `| --- | --- |`",
      "  `| ¡ATENCIÓN NETWORKER!<br># Existe una vida que hoy no imaginás posible<br>## Sin dejar de ser la profesional que sos<br>[FORMULARIO: Nombre · WhatsApp]<br>[BOTÓN CTA: ...] | [FOTO DEL MENTOR — profesional] |`",
      "- Banda de 1 columna — tabla de una sola columna, y la alineación va en el encabezado:",
      "  `| BANDA 3 · QUÉ VAS A DESCUBRIR — 1 columna · centrado |`",
      "  `| --- |`",
      "  `| # ¿Qué vas a descubrir en este vídeo?<br>✅ Beneficio 1<br>✅ Beneficio 2<br>[BOTÓN CTA: ...] |`",
      "- JERARQUÍA DE TAMAÑO adentro de la celda — es lo que hace que se lea de un vistazo qué es cada cosa, y se marca así (van dentro de la celda, separados por `<br>`):",
      "  · el TITULAR de la banda con `# ` al principio → se ve grande (como un H1).",
      "  · el SUBTÍTULO / bajada con `## ` → mediano (H2).",
      "  · una etiqueta de sección corta con `### ` → chica en mayúsculas.",
      "  · el resto (cuerpo, bullets ✅/❌) va sin marcador → texto normal, más chico.",
      "  Cada banda tiene UN titular con `# `; no marques diez líneas como titular o se pierde la jerarquía.",
      "- `<br>` es la ÚNICA etiqueta HTML permitida, y solo para separar renglones DENTRO de una celda: una fila de tabla es una sola línea, así que sin `<br>` no hay maqueta posible. Nada de `<div>`, `<table>` ni estilos.",
      "- Adentro de cada celda va el copy REAL, renglón por renglón y en el orden exacto en que se lee en pantalla.",
      "- Los elementos que no son texto van entre corchetes y en la celda EXACTA donde caen: `[VSL]`, `[LOGO CLIENTE]`, `[CARRUSEL DE FOTOS]`, `[FOTO DEL MENTOR — profesional]`, `[FORMULARIO: Nombre · WhatsApp]`, `[BOTÓN CTA: ...]`.",
      "- Los bullets de dolor/deseo van con ❌ y ✅, separados con `<br>` dentro de su celda.",
      "- La pre-landing y la landing VSL tienen su wireframe: seguilo tabla por tabla. El formulario y la thank you page no tienen maqueta cargada — armá sus bandas a partir de su blueprint (pantallas y orden), con el mismo formato de tablas, y aclarás en las notas que esa estructura la dedujiste del blueprint.",
      "- Lo que falta del cliente va marcado `[FALTA: ...]` bien visible. No lo inventes.",
      "- Si auditás en vez de escribir, usá una tabla con `Qué está mal | Por qué | Cómo queda`, y citá con `>` el copy actual que estás señalando. Si lo que falla es la ESTRUCTURA (un elemento fuera de lugar, una banda que no está, algo centrado que va al costado de la foto), decilo con el nombre de la banda.",
    ].join("\n"),
    // El formato de CADA paso lo manda su metodología (cada skill trae su estructura de salida
    // obligatoria). Acá va solo lo que es común a los 5 y lo que el panel necesita para pintar.
    descubrimiento: [
      "- **Arrancá siempre con una línea de estado**, antes de cualquier otra cosa: en qué momento está el cliente (pre/post-llamada) y qué paso estás por hacer. Ej: `> Post-llamada · Paso 4 (análisis estratégico) · listo para hacerse`. El equipo abre el chat sin saber en qué punto está.",
      "- Si el paso que te piden tiene su metodología cargada acá abajo, **la estructura de salida la manda ella**, no este bloque: seguí sus secciones y sus títulos tal cual.",
      "- Si el paso está BLOQUEADO: no lo produzcas. Respondé corto — qué falta, quién lo aporta, y qué paso se puede hacer en su lugar. Sin relleno ni un adelanto 'provisional'.",
      "- `CONFIRMADO:` y `NO VERIFICADO:` al principio de renglón se pintan como etiqueta. Usalas cada vez que un dato venga de research público y no de la boca del cliente.",
      "- Para el resumen de descubrimiento del final usá una tabla `Paso | Estado | Qué falta`.",
    ].join("\n"),
  };

  const formatoBlock = [
    "\n\n===== CÓMO SE VE TU RESPUESTA (formato) =====",
    "El panel renderiza markdown de verdad: lo que escribas se muestra con estilo. Escribí para que se lea de un vistazo, no como un muro de texto.",
    "",
    "Reglas para todos:",
    "- `##` para cada bloque grande y `###` para subtítulos. `#` solo si necesitás un título único arriba de todo.",
    "- `**negrita**` para lo que el ojo tiene que encontrar primero. Nunca subrayes con guiones ni uses MAYÚSCULAS para destacar.",
    "- Listas con `-` para enumerar; listas `1.` cuando el orden importa (se numeran con un badge).",
    "- Tablas markdown cuando compares 2+ opciones (ángulos, variantes, antes/después). Son mucho más legibles que un párrafo.",
    "- `> cita` para las palabras textuales del avatar, del DEL o de un guión de referencia.",
    "- `---` para separar bloques cuando la respuesta es larga.",
    "- Nada de HTML: solo markdown (si el bloque de abajo habilita alguna etiqueta puntual, esa es la única excepción). Y nada de emojis decorativos: como mucho uno funcional.",
    "- Si la respuesta es corta (una pregunta puntual), contestá en prosa directa. El formato es para estructurar, no para inflar.",
    "",
    `Propio de ${specialistName}:`,
    FORMATO_POR_AGENTE[subagentKey] || "- Estructurá con `##` por tema y `**negrita**` en lo importante.",
    // La aclaración del modo generate NO va acá: esto es la capa estable, la que se cachea.
    // Meter algo que depende del `mode` hacía que el bloque cacheado fuera distinto al chatear
    // y al generar, y cada vuelta entre los dos re-escribía ~14k tokens a precio de escritura.
    // Vive en el contexto recuperado (abajo), del lado que no se cachea.
  ].filter(Boolean).join("\n");

  const stableSystem = [
    general || "# Método Korex — (capa general no configurada)",
    `\n\n===== ESPECIALISTA: ${specialistName} =====\n`,
    specialistInstr || "(sin instrucciones del especialista)",
    blueprint ? `\n\n===== ${corpus!.rotulo} (el método, seguilo) =====\n${blueprint}` : "",
    material ? `\n\n===== MATERIAL DE CAPACITACIÓN (${specialistName}) =====\n${material}` : "",
    formatoBlock,
  ].join("");

  // ── Contexto del cliente / funnel / avatar (volátil → NO se cachea) ──
  const [{ data: client }, { data: strat }, { data: page }] = await Promise.all([
    supabase.from("clients").select("name,niche,company,team_name,service,meta_metrics").eq("id", clientId).maybeSingle(),
    strategyId ? supabase.from("strategies").select("name").eq("id", strategyId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("strategy_pages").select("name,tipo,avatars,vsl_script,prod_url,official_domain,pages_copy").eq("id", funnelId).maybeSingle(),
  ]);

  const avatars = Array.isArray(page?.avatars) ? (page!.avatars as Record<string, unknown>[]) : [];
  const avatar = avatars.find((a) => str(a.id) === avatarId) || avatars.find((a) => str(a.name) && avatarId && str(a.name) === avatarId) || avatars[0] || null;
  const vslScript = str(page?.vsl_script);

  // Brief / personalidad del líder (fallback onboarding).
  const { data: briefRows } = await supabase.from("client_brain_docs")
    .select("doc_kind,text,char_count").eq("client_id", clientId).in("doc_kind", ["briefing", "onboarding"]).order("char_count", { ascending: false });
  const briefDoc = (briefRows || []).find((d) => d.doc_kind === "briefing") || (briefRows || []).find((d) => d.doc_kind === "onboarding");
  const briefText = clip(str(briefDoc?.text), 3000);

  // ── Qué paso del descubrimiento están pidiendo ──
  // Se resuelve ACÁ, antes de cargar los documentos, porque de esto depende cuánto se le da de
  // cada uno (ver CLIPS_POR_PASO). Es solo la heurística de ruteo: mira el mensaje y nada más.
  // Lo que sale del corpus y del gate —las fichas, quién ejecuta cada paso, si está bloqueado—
  // se resuelve más abajo, cuando ya hay con qué.
  //
  // EL PRIMER MATCH GANA: los pedidos reales nombran varios pasos a la vez, así que contar
  // matches solo produce empates. El orden de este array ES la desambiguación.
  //
  // El orden NO es por especificidad: es por QUÉ TAN FUERTE es la palabra como señal de pedido.
  // La distinción que importa es entre nombrar un paso porque lo pedís y nombrarlo porque es el
  // INSUMO de lo que pedís:
  //
  //   · Señales fuertes — solo aparecen cuando pedís ESE paso: "avatar builder", "hoja de
  //     avatar", "estrategia", "competencia". Nadie dice "estrategia" de pasada.
  //   · Señales débiles — aparecen igual de seguido como insumo: "investigación", "onboarding".
  //     "En base a la investigación y al onboarding, ¿qué estrategia hacemos?" es el pedido más
  //     natural del paso 4 y nombra los pasos 1 y 3 sin pedirlos.
  //
  // Por eso `estrategia` va ANTES que `research` y `onboarding`, aunque sea la última del
  // pipeline: sin eso, el pedido más común del paso 4 se rutea a research —que está bloqueado— y
  // el agente contesta "no puedo hacer el research" a alguien que le pidió la estrategia.
  //
  // Los dos choques que quedan y hay que respetar:
  //   · `avatar` va antes que `estrategia`: "profundizá el avatar que eligió el análisis
  //     estratégico" es un pedido del paso 5 que nombra el 4.
  //   · `research` va antes que `onboarding` porque "pre-onboarding" contiene "onboarding".
  //     Mismo choque que pre-landing/landing en el agente de funnels.
  //
  // Al revés casi no pasa (pedir un insumo nombrando la estrategia), y cuando pasa el gate lo
  // arregla solo: "hacé el research para la estrategia" rutea a estrategia, que sin research
  // está BLOQUEADA, y el agente contesta "falta el research" — que es la respuesta correcta.
  // El ruteo es una heurística; la autoridad es el estado real del cliente.
  let pasoActivo = "";
  // Si el pedido vino por comando (`/estrategia ...`, elegido del menú del chat), NO se adivina
  // nada: el paso lo eligió la persona. La heurística de abajo es el fallback para cuando
  // escriben en prosa, que es la mitad de las veces.
  let comandoPaso = "";
  if (subagentKey === "descubrimiento") {
    const PASOS_DESC: Array<{ slug: string; re: RegExp }> = [
      { slug: "competencia", re: /(competencia|competidor(es)?|ad library|biblioteca de anuncios|benchmark)/ },
      { slug: "avatar", re: /(avatar builder|hoja de avatar|profundiza\w*|boton(es)? caliente|psicologic\w+|deseos ocultos|miedos ocultos)/ },
      { slug: "estrategia", re: /(estrateg\w+|focalizacion|top de avatares|reclutamiento vs producto|que funnel|cual funnel)/ },
      { slug: "research", re: /(research|investiga\w*|preonboarding|pre-?onboarding|fuentes publicas)/ },
      { slug: "onboarding", re: /(onboarding|ficha del cliente|plantilla|transcripcion|apuntes)/ },
    ];
    // El comando se valida contra estos mismos slugs y no contra el corpus, aunque el menú salga
    // del corpus: tiene que resolverse ACÁ, antes de clipar los documentos, y un `/loquesea` no
    // puede dejar al paso 4 leyendo los recortes del menú. Un comando invalido se ignora y decide
    // la prosa, como si no lo hubieran escrito.
    const comandoDe = (txt: string) => {
      const pedido = /^\s*\/([a-z_]+)\b[ \t]*/i.exec(txt)?.[1].toLowerCase() || "";
      return pedido && PASOS_DESC.some((p) => p.slug === pedido) ? pedido : "";
    };
    const primero = str(messages.find((m) => m.role === "user")?.content || "");
    const ultimo = str([...messages].reverse().find((m) => m.role === "user")?.content || "");

    // Solo el comando del ÚLTIMO mensaje cuenta como `comandoPaso`: es el que se traduce a su
    // pedido canónico antes de mandarlo al modelo (ver más abajo).
    comandoPaso = comandoDe(ultimo);

    // ── El paso lo fija el PRIMER mensaje del chat, no el último ──
    // Antes se re-decidía en cada turno mirando solo el último mensaje, y eso cambiaba el
    // material a mitad de conversación: pedías /estrategia (entra el onboarding y el research
    // enteros) y en el turno 2 decías "profundizá el avatar 2" —que es una aclaración, no un
    // pedido nuevo— y el agente pasaba al paso 5: cargaba el DEL, soltaba el research y se
    // quedaba con el historial de una conversación cuyo material ya no tenía delante. Desde
    // afuera se ve como que se olvida o se contradice.
    //
    // Un `/comando` explícito SÍ lo cambia: eso lo elegiste vos del menú, es intencional. La
    // prosa suelta ya no. Efecto secundario y buscado: dentro de un paso el contexto no cambia,
    // así que el cache de los documentos (abajo) aguanta toda la conversación.
    pasoActivo = comandoPaso
      || comandoDe(primero)
      || PASOS_DESC.find((p) => p.re.test(norm(primero)))?.slug
      || "";
  }

  // ── Documentos del cliente (solo descubrimiento) ──
  // Son los INPUTS de las skills: el research alimenta la estrategia, la estrategia el avatar.
  // Los otros agentes no los necesitan (trabajan con el DEL ya destilado en avatares y guión).
  //
  // Van clipados y no enteros porque son enormes de verdad (promedios reales: onboarding 52 KB,
  // DEL 57 KB, investigación 26 KB) y hay clientes de 224 KB. Los tres enteros en cada turno son
  // ~35k tokens sin cachear.
  //
  // Pero el clip fijo tenía un problema peor que el costo: con el onboarding cortado en 16 KB de
  // 52 KB, el paso 4 leía EL PRIMER TERCIO de la llamada y le pedíamos citas literales de todo.
  // Las citas que no estaban las sacaba de donde podía. Un DEL cortado en 8 KB de 57 KB dejaba al
  // avatar builder trabajando sobre el 14% de su único input.
  //
  // La solución no es subir todo (dispara el costo por turno en los 5 pasos por igual), sino dar
  // el documento ENTERO al paso que de verdad lo usa y recortar los demás a contexto. Es el mismo
  // criterio de búsqueda inteligente del resto de la fn: traer lo que aplica, no todo.
  //
  //   paso 3 (onboarding)  -> el onboarding es lo que consolida: entero.
  //   paso 4 (estrategia)  -> decide con el onboarding y arma munición con el research: los dos
  //                           enteros. El DEL casi no hace falta (lo está produciendo él).
  //   paso 5 (avatar)      -> el DEL es su único input: entero. El resto, contexto.
  //   sin paso / menú      -> nadie está produciendo nada: alcanza con saber qué hay.
  //
  // Los topes de acá son de caracteres. ~4 chars = 1 token, así que el peor caso (paso 4) son
  // ~37k tokens de documentos. Entra cómodo en Sonnet y el agente ve cuánto se recortó: avisa si
  // le falta en vez de adivinar.
  // `usa` no cambia lo que se manda: cambia cómo se REPORTA. Un doc "contexto" recortado no es
  // una advertencia —es la decisión de arriba— y marcarlo con ⚠ sería una alarma falsa. Las
  // alarmas falsas enseñan a ignorar la línea de fuentes, que es justo lo que no queremos.
  type Material = { tope: number; usa: "principal" | "contexto" };
  // Los topes de "principal" están puestos ARRIBA del documento más grande que existe hoy, a
  // propósito: el material que un paso necesita entra ENTERO, siempre, para todos los clientes.
  // Dejan de ser un recorte de rutina y pasan a ser una red contra un documento patológico (que
  // alguien suba un PDF de 2 MB al Drive), que es para lo único que sirve un tope.
  //
  // OJO: el tope es el presupuesto del TIPO, no de un documento — entran todos los de ese tipo y
  // se descuenta hasta agotarlo. Por eso 340.000 y no 224.596: Jose Luis Rodriguez tiene DOS
  // onboardings que suman 334.792.
  //
  // Se puede pagar, y ese es todo el argumento. Medido sobre los 36 clientes reales: mandar todo
  // sin recortar son ~90.000 tokens de documentos en el PEOR caso ≈ US$0,31 la corrida. El
  // promedio real de hoy es US$0,133, y el peor caso son 3 clientes de 36.
  const MATERIAL_POR_PASO: Record<string, Record<string, Material>> = {
    onboarding: {
      onboarding: { tope: 340000, usa: "principal" },   // TODOS los suyos: el mayor suma 334.792
      investigacion: { tope: 14000, usa: "contexto" },
      del: { tope: 3000, usa: "contexto" },
    },
    estrategia: {
      onboarding: { tope: 340000, usa: "principal" },   // decide con esto (todas sus llamadas)
      investigacion: { tope: 90000, usa: "principal" }, // arma la munición con esto (mayor: 84.337)
      del: { tope: 3000, usa: "contexto" },             // lo está produciendo él
    },
    // ── El paso 5 NO corre sobre el DEL: corre sobre la voz del cliente ──
    // Antes el DEL era su "principal" con 140.000 y el onboarding quedaba en 24.000 de contexto.
    // Estaba al revés, y lo dice la propia skill cuando explica cómo se saca el botón caliente:
    //   1. En el onboarding: ¿qué mencionó más el cliente sobre su público?
    //   2. En la historia del líder: ¿qué transformación vivió?
    //   3. En el perfil del avatar del Strategy Analyzer: ¿cuál es su dolor principal?
    // Dos de las tres salen de acá; del DEL sale UNA cosa, y no es material: es CUÁL avatar, que
    // te lo dice la persona. Con el reparto viejo, un onboarding real de 41.665 (Liliana Vega) se
    // recortaba al 58% —justo su fuente principal de psicología— para reservarle 140.000 a un DEL
    // que muchas veces es la plantilla vacía.
    avatar: {
      onboarding: { tope: 340000, usa: "principal" },   // la voz del cliente, entera: de acá sale todo
      investigacion: { tope: 90000, usa: "principal" }, // la historia del líder (señal 2 del botón caliente)
      del: { tope: 140000, usa: "contexto" },           // si está lleno dice qué avatar ganó; si es plantilla NO entra (ver abajo)
    },
  };
  // Sin paso activo nadie produce nada: alcanza con saber qué hay.
  const MATERIAL_MENU: Record<string, Material> = {
    onboarding: { tope: 8000, usa: "contexto" },
    investigacion: { tope: 6000, usa: "contexto" },
    del: { tope: 6000, usa: "contexto" },
  };
  const materialDe = (kind: string): Material =>
    (MATERIAL_POR_PASO[pasoActivo] || MATERIAL_MENU)[kind] || { tope: 6000, usa: "contexto" };
  const DOCS_DESC: Record<string, { label: string }> = {
    investigacion: { label: "RESEARCH DEL LÍDER Y LA EMPRESA (paso 1 · fuentes públicas ⇒ NO VERIFICADO)" },
    onboarding: { label: "ONBOARDING (la voz del cliente ⇒ CONFIRMADO; de acá salen las citas literales)" },
    del: { label: "DEL / ANÁLISIS ESTRATÉGICO (paso 4, ya hecho)" },
  };
  // El piso que separa la plantilla del análisis. El DEL se crea desde una plantilla cuando
  // arranca el funnel y se llena después: las plantillas rondan los 2.500-7.600 caracteres y un
  // DEL de verdad arranca en 30.000. Es el MISMO número que usa descubrimiento_status(), y tiene
  // que seguir siéndolo: si acá dijera otra cosa, el estado y el material se contradirían.
  const DEL_MINIMO = 15000;
  let docsDescText = "";
  // Qué material se cargó de verdad. Se junta ACÁ, en el único lugar que lo sabe, para poder
  // ponerlo arriba de la respuesta. NO se lo pedimos al modelo: si le pedís que declare sus
  // fuentes, declara las que cree que usó, y justo lo que hay que detectar es cuando NO leyó.
  const fuentes: Array<{ kind: string; chars: number; leidos: number; usa: string; titulo: string }> = [];
  // ── El FOCO del cliente: reclutamiento o producto ──
  // Cambia qué hay que investigar y en qué se profundiza en toda la fase, no solo en un paso.
  // Va a nivel CLIENTE (no de funnel), porque acá todavía puede no haber funnel elegido.
  //
  // El caso que importa: los clientes en pre-llamada —justo los que necesitan el research—
  // TODAVÍA NO TIENEN NADA CREADO. Ahí el foco no existe en ningún lado y el agente
  // tiene que preguntarlo, no suponerlo: investigar para reclutamiento cuando el cliente
  // viene por producto es research tirado.
  //
  // Manda `strategy_pages.tipo` (el campo). El nombre de la carpeta de Drive quedó SOLO como
  // fallback para los funnels a los que nadie les puso el tipo todavía: era una regex sobre el
  // nombre de una carpeta, y se equivocaba (los funnels "Producto…" de Jose Luis Rivas cuelgan
  // de una carpeta llamada "Reclutamiento").
  let focoDesc = "";
  let estrategiasDesc: string[] = [];
  if (subagentKey === "descubrimiento") {
    const [{ data: funnels }, { data: estrats }] = await Promise.all([
      supabase.from("strategy_pages").select("name,tipo").eq("client_id", clientId),
      supabase.from("strategies").select("name").eq("client_id", clientId),
    ]);
    const tipos = (Array.isArray(funnels) ? funnels : []).map((p) => str(p.tipo)).filter(Boolean);
    const nombresCarpeta = (Array.isArray(estrats) ? estrats : []).map((e) => str(e.name)).filter(Boolean);
    // Lo que se le muestra al agente: los funnels con su tipo (o las carpetas, si no hay funnels).
    estrategiasDesc = (Array.isArray(funnels) ? funnels : []).length
      ? (funnels as Record<string, unknown>[]).map((p) => `${str(p.name)}${str(p.tipo) ? ` (${str(p.tipo)})` : " (sin tipo)"}`)
      : nombresCarpeta;

    const hayReclut = tipos.includes("reclutamiento") || (!tipos.length && nombresCarpeta.some((n) => /reclut/i.test(n)));
    const hayProd = tipos.includes("producto") || (!tipos.length && nombresCarpeta.some((n) => /producto/i.test(n)));
    focoDesc = !estrategiasDesc.length ? "sin_estrategia"
      : (hayReclut && hayProd) ? "mixto"
        : hayReclut ? "reclutamiento"
          : hayProd ? "producto"
            : "sin_tipo";

    // ── ENTRAN TODOS LOS DOCUMENTOS DE CADA TIPO, NO "EL MÁS GRANDE" ──
    // Antes se tomaba uno solo por doc_kind: el más largo. Los clientes reales tienen 2 a 4
    // documentos de onboarding, y no son copias — son cosas distintas:
    //
    //   Alex Reynoso (2)     la transcripción cruda (61.589) + la ficha ya rellenada (8.160)
    //   Jose Luis Rivas (4)  transcripción + ficha de RECLUTAMIENTO, y transcripción + ficha de
    //                        PRODUCTO. Quedarse con una sola es decidir el motor por accidente.
    //   Fabiana Carrasco (4) tres llamadas de personas distintas (Fabiana, Richie, Kathyuska).
    //                        "El más grande" es la de KATHYUSKA: leíamos a otra persona.
    //
    // Con el tope por tipo arriba del documento más grande que existe, ya no hace falta elegir:
    // entran todos y se gasta presupuesto hasta agotarlo. El orden (más grande primero) importa
    // solo cuando no entran todos: que el troncal entre antes que un anexo.
    const { data: docs } = await supabase.from("client_brain_docs")
      .select("doc_kind,title,text,char_count").eq("client_id", clientId)
      .in("doc_kind", Object.keys(DOCS_DESC)).order("char_count", { ascending: false });

    const restante: Record<string, number> = {};
    const bloques: string[] = [];
    for (const d of (Array.isArray(docs) ? docs : [])) {
      const kind = str(d.doc_kind);
      const full = str(d.text);
      if (!full || !DOCS_DESC[kind]) continue;
      const { tope, usa } = materialDe(kind);
      if (restante[kind] === undefined) restante[kind] = tope;

      // El DEL plantilla NO se manda. Son placeholders: el agente los leería como si fueran el
      // análisis y copiaría los campos vacíos. Esto es lo que antes se lograba bloqueando el paso
      // entero; ahora el paso corre (la psicología está en el onboarding) y lo único que se saca
      // es el documento que no dice nada. Se registra igual en `fuentes` para que la línea de
      // arriba lo diga: "hay un archivo pero está vacío" no es lo mismo que "no hay archivo".
      if (kind === "del" && full.length < DEL_MINIMO) {
        fuentes.push({ kind, chars: full.length, leidos: 0, usa, titulo: str(d.title) });
        continue;
      }

      // Sin presupuesto no se manda medio documento: se registra que quedó afuera. Un documento
      // cortado al azar es peor que uno ausente — el ausente al menos se declara.
      if (restante[kind] <= 0) {
        fuentes.push({ kind, chars: full.length, leidos: 0, usa, titulo: str(d.title) });
        continue;
      }
      const txt = clip(full, restante[kind]);
      const leidos = Math.min(full.length, restante[kind]);
      const nota = full.length > restante[kind]
        ? ` · RECORTADO: LEÉS LOS PRIMEROS ${leidos.toLocaleString()} DE ${full.length.toLocaleString()} CARACTERES. Si necesitás algo que puede estar en la parte que no ves, decilo en vez de suponerlo.`
        : ` · COMPLETO (${full.length.toLocaleString()} caracteres)`;
      // El TÍTULO va al prompt: antes se consultaba y se tiraba, y el agente no sabía qué estaba
      // leyendo. Sin él no puede decir "esto lo dijo en la llamada del 28-04" ni darse cuenta de
      // que una llamada es de otra persona del equipo. Es lo que separa una cita con procedencia
      // de una cita suelta.
      bloques.push(`\n— ${DOCS_DESC[kind].label}\n  DOCUMENTO: "${str(d.title) || "(sin título)"}"${nota} —\n${txt}`);
      fuentes.push({ kind, chars: full.length, leidos, usa, titulo: str(d.title) });
      restante[kind] -= leidos;
    }
    docsDescText = bloques.join("\n");
  }

  // Anuncios ganadores del cliente (piso creativo, no techo).
  const { data: winRows } = await supabase.from("meta_ad_insights")
    .select("ad_name,campaign_name,spend,cpl,ctr,hook_rate,hold_rate,transcript,score")
    .eq("client_id", clientId).eq("is_winner", true).order("score", { ascending: false }).limit(3);
  const winners = (winRows || []).map((w, i) => {
    const t = w.transcript ? clip(typeof w.transcript === "string" ? w.transcript : JSON.stringify(w.transcript), 1200) : "";
    return `Ganador ${i + 1}: ${str(w.ad_name) || "(sin nombre)"} — CPL ${str(w.cpl)} · hook ${str(w.hook_rate)} · hold ${str(w.hold_rate)} · CTR ${str(w.ctr)}${t ? `\nTranscript: ${t}` : ""}`;
  }).join("\n\n");

  // ── RETRIEVAL INTELIGENTE (biblioteca Korex, marketing_ad_library) ──
  // En vez de mandar las 200 páginas de ejemplos ni las 50 del blueprint, buscamos SOLO lo relevante
  // a este cliente/nicho/avatar y a lo que el usuario está pidiendo ahora. El resumen del método
  // (mal_blueprint) ya va siempre en la capa estable; acá traemos las secciones/ejemplos que aplican.
  let examplesText = "";
  let blueprintSectionsText = "";
  let vslGuionText = "";
  let funnelPagesText = "";
  let faseCF = "";
  let retrievalMeta: Record<string, unknown> = {};

  // ── DESCUBRIMIENTO: el retrieval elige QUÉ SKILL, no qué párrafos ──
  // Las 5 skills son metodologías prescriptivas ("ESTRUCTURA DEL DOCUMENTO (OBLIGATORIA)"):
  // trocearlas y mandar el top-3 de secciones no da "la parte relevante", da una metodología
  // rota. Por eso el scorer genérico de abajo NO corre para esta key y la elección se hace un
  // nivel más arriba: se elige el PASO, y su skill entra completa.
  //
  // Dos capas:
  //   1. Las 5 fichas, siempre (~4 KB). Son el menú: con esto solo, el agente ya puede decir
  //      "el que corresponde es el paso 4" sin tener cargado el paso 4.
  //   2. La skill del paso activo, completa (2 KB a 13 KB según cuál).
  let fichasText = "";
  let skillActivaText = "";
  // slug -> "chat" | "fuera": si el paso se produce en este chat o no. Sale del corpus
  // (metrics.ejecuta de cada ficha), no hardcodeado acá: cuando research y competencia se
  // construyan como jobs, cambia el corpus y esto sigue igual.
  let ejecutaPorPaso: Record<string, string> = {};
  // slug -> la instrucción canónica de ese paso (metrics.pedido). Es lo que se manda en lugar
  // del comando cuando el pedido vino por `/slug`.
  let pedidoPorPaso: Record<string, string> = {};
  // Si las fichas no cargaron, NO sabemos qué pasos se hacen acá y cuáles no. Ese "no sabemos"
  // tiene que bloquear, no habilitar: ver el candado más abajo.
  let fichasOk = false;
  if (subagentKey === "descubrimiento") {
    try {
      const { data: fichas } = await supabase.from("marketing_ad_library")
        .select("content,metrics").eq("part", "desc_ficha").eq("status", "approved").order("position");
      fichasText = (Array.isArray(fichas) ? fichas : []).map((f) => str(f.content)).filter(Boolean).join("\n\n---\n\n");
      for (const f of (Array.isArray(fichas) ? fichas : [])) {
        const m = (f.metrics || {}) as Record<string, unknown>;
        if (!str(m.slug)) continue;
        ejecutaPorPaso[str(m.slug)] = str(m.ejecuta) || "chat";
        if (str(m.pedido)) pedidoPorPaso[str(m.slug)] = str(m.pedido);
      }

      // Se mide contra lo que quedó cargado, no contra "no explotó": supabase-js NO lanza
      // excepción cuando la consulta falla —devuelve el error como valor y `data` en null—,
      // así que el catch de abajo casi nunca corre. Un 500 de la base dejaba el mapa vacío y
      // el `try` terminando bien: ahí es donde el candado se abría solo.
      fichasOk = Object.keys(ejecutaPorPaso).length > 0;
      retrievalMeta = {
        pedido: pasoActivo || "sin_match", foco: focoDesc, estrategias: estrategiasDesc,
        // Para el tablero: saber cuántos pedidos llegan por comando y cuántos en prosa dice si
        // el menú del "/" sirve o si el ruteo por texto sigue cargando todo el peso.
        via: comandoPaso ? "comando" : pasoActivo ? "prosa" : "gate",
      };
    } catch { fichasText = ""; pasoActivo = ""; ejecutaPorPaso = {}; pedidoPorPaso = {}; fichasOk = false; }
  }

  if (corpus && subagentKey !== "descubrimiento") {
    try {
      const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
      const qTokens = norm(lastUser).split(" ").filter((w) => w.length > 3);

      // FUNNELS: ¿está pidiendo UNA página o el funnel entero? Cambia qué se recupera:
      // una página suelta se audita mejor viendo ESA página en varios funnels comparables;
      // el funnel completo se escribe clonando el recorrido entero de UN caso cercano.
      // "pre-landing" contiene "landing", así que el orden de este array importa.
      const FASES_CF: Array<{ fase: string; label: string; re: RegExp }> = [
        { fase: "prelanding", label: "PRE-LANDING", re: /(pre-?landing|antesala)/ },
        { fase: "thankyou", label: "THANK YOU PAGE", re: /(thank ?you|pagina de gracias|typ\b)/ },
        { fase: "formulario", label: "FORMULARIO", re: /(formulario|quiz|cuestionario|preguntas de calificacion)/ },
        { fase: "landing", label: "LANDING VSL", re: /(landing vsl|landing del vsl|pagina del video|\blanding\b)/ },
      ];
      if (subagentKey === "landing") {
        // Cada fase que matchea se BORRA del texto antes de probar la siguiente: si no,
        // "pre-landing" dispara además "landing" (el guión cuenta como borde de palabra) y
        // dos falsos hits se leerían como "pidió el funnel entero".
        let q = norm(lastUser);
        const hits: string[] = [];
        for (const f of FASES_CF) {
          if (!f.re.test(q)) continue;
          hits.push(f.fase);
          q = q.replace(new RegExp(f.re.source, "g"), " ");
        }
        // Una sola fase nombrada = pedido puntual. Ninguna o varias = el funnel entero.
        if (hits.length === 1) faseCF = hits[0];
        retrievalMeta = { ...retrievalMeta, fase: faseCF || "funnel_completo" };
      }
      const nicheStr = norm(str(client?.niche));
      const nicheTokens = nicheStr.split(" ").filter((w) => w.length > 3);
      const avatarName = norm(str(avatar?.name));
      const hayOf = (r: Record<string, unknown>) =>
        norm([str(r.niche), str(r.title), ...(Array.isArray(r.niche_tags) ? (r.niche_tags as string[]) : [])].join(" "));
      const tierOf = (r: Record<string, unknown>) =>
        str((r.metrics as Record<string, unknown> | null)?.tier);

      // 1) EJEMPLOS: por nicho (fuerte) + avatar + palabras del pedido. Top 3.
      // En VSL cada fila es la FICHA del caso (no el guión entero): el guión completo se
      // trae aparte y solo el del mejor caso, que es lo que manda el blueprint
      // ("buscá el caso más cercano → clonás su estructura").
      const { data: exList } = await supabase.from("marketing_ad_library")
        .select("id,niche,niche_tags,title,avatar,client_id,metrics").eq("part", corpus.example).eq("status", "approved");
      const exScored = (Array.isArray(exList) ? exList : []).map((r) => {
        const rowNiche = norm(str(r.niche));
        const hay = hayOf(r);
        let score = 0;
        if (nicheStr && rowNiche && (nicheStr.includes(rowNiche) || rowNiche.includes(nicheStr))) score += 5;
        for (const t of nicheTokens) if (hay.includes(t)) score += 1;
        const av = norm(str(r.avatar));
        if (avatarName && av && (avatarName.includes(av) || av.includes(avatarName))) score += 3;
        for (const t of qTokens) if (hay.includes(t)) score += 1;
        // Jerarquía por métricas de Voomly: se clona lo que retuvo, no lo que fracasó.
        const tier = tierOf(r);
        if (tier === "ganador") score += 2;
        if (tier === "perdedor") score -= 3;
        if (str(r.client_id) && str(r.client_id) === clientId) score += 1;  // el propio líder primero
        // Funnels: no hay retención ni CPL comparables, lo único que se sabe es si llegó a
        // publicarse. Señal débil a propósito: publicado no prueba que haya funcionado.
        const m = (r.metrics || {}) as Record<string, unknown>;
        if (m.publicado === true) score += 1;
        // Si se pidió UNA página, un funnel que no la tiene escrita no sirve de ejemplo.
        const tienePagina = !faseCF || (Array.isArray(m.paginas) && (m.paginas as string[]).includes(faseCF));
        return { id: str(r.id), score, tier, title: str(r.title), tienePagina };
      }).filter((x) => x.score > 0 && x.tienePagina).sort((a, b) => b.score - a.score);
      let exPick = exScored.slice(0, 3);
      // Fallback: si nada matcheó por keywords, al menos traé ejemplos del mismo nicho.
      if (!exPick.length && nicheStr) {
        exPick = (Array.isArray(exList) ? exList : [])
          .filter((r) => { const rn = norm(str(r.niche)); return rn && (nicheStr.includes(rn) || rn.includes(nicheStr)); })
          .filter((r) => tierOf(r) !== "perdedor")
          .filter((r) => {
            const ps = (r.metrics as Record<string, unknown> | null)?.paginas;
            return !faseCF || (Array.isArray(ps) && (ps as string[]).includes(faseCF));
          })
          .slice(0, 2).map((r) => ({ id: str(r.id), score: 1, tier: tierOf(r), title: str(r.title), tienePagina: true }));
      }
      if (exPick.length) {
        const { data: full } = await supabase.from("marketing_ad_library").select("id,niche,title,content,metrics").in("id", exPick.map((s) => s.id));
        const byScore = (a: Record<string, unknown>, b: Record<string, unknown>) =>
          exPick.findIndex((p) => p.id === str(a.id)) - exPick.findIndex((p) => p.id === str(b.id));
        examplesText = (Array.isArray(full) ? full : []).sort(byScore).map((f) => {
          const m = (f.metrics || {}) as Record<string, unknown>;
          // Los funnels no tienen Voomly ni nada equivalente: lo único cierto es si se publicó.
          // Se dice así de crudo a propósito, para que el agente no lo lea como un veredicto.
          const veredicto = subagentKey === "landing"
            ? (m.publicado === true ? " · publicado" : " · nunca se publicó")
            : (str(m.tier) && str(m.tier) !== "sin_datos"
              ? ` · Voomly: ${str(m.tier).toUpperCase()} (retención media ${str(m.p50)}%, llega al final ${str(m.p100)}%, ${str(m.uniq_plays)} plays)`
              : " · sin métricas suficientes");
          return `— ${str(f.title) || str(f.niche)}${veredicto} —\n${clip(str(f.content), 4500)}`;
        }).join("\n\n");
        retrievalMeta = { ...retrievalMeta, examples: exPick.map((p) => `${p.id}[${p.tier || "?"}]`) };

        // 2) VSL: el guión completo SOLO del mejor caso (los guiones pesan ~10 KB cada uno;
        //    mandar los 3 costaría ~13k tokens por turno sin cachear).
        if (subagentKey === "vsl") {
          const mejor = exPick[0].id.replace("mal_vsl_ficha_", "");
          const { data: g } = await supabase.from("marketing_ad_library")
            .select("title,content").eq("part", "vsl_guion").like("id", `mal_vsl_guion_${mejor}%`).order("id", { ascending: true });
          vslGuionText = (Array.isArray(g) ? g : []).map((x) => `— ${str(x.title)} —\n${clip(str(x.content), 26000)}`).join("\n\n");
          retrievalMeta = { ...retrievalMeta, guion_base: mejor };
        }

        // 2-bis) FUNNELS: el copy real de las páginas. Qué se trae depende de lo que se pidió:
        //   una página suelta → ESA página en los 3 funnels cercanos (para comparar y auditar)
        //   el funnel entero  → las 4 páginas del caso más cercano (para clonar el recorrido)
        if (subagentKey === "landing") {
          const idDe = (p: { id: string }) => p.id.replace("mal_cf_ficha_", "");
          const q = supabase.from("marketing_ad_library").select("id,title,content,metrics").eq("part", "cf_pagina");
          const { data: pgs } = faseCF
            ? await q.in("id", exPick.map((p) => `mal_cf_pag_${idDe(p)}__${faseCF}`))
            : await q.like("id", `mal_cf_pag_${idDe(exPick[0])}__%`);
          const rows = Array.isArray(pgs) ? pgs : [];
          // Orden: por ranking si son varios funnels; por recorrido si es un funnel entero.
          // Nunca alfabético por id, que daría formulario → landing → prelanding → thankyou.
          const ordenFase = ["prelanding", "landing", "formulario", "thankyou"];
          rows.sort((a, b) => {
            const fa = (x: Record<string, unknown>) => str((x.metrics as Record<string, unknown>)?.fase);
            if (faseCF) return exPick.findIndex((p) => str(a.id).includes(idDe(p))) - exPick.findIndex((p) => str(b.id).includes(idDe(p)));
            return ordenFase.indexOf(fa(a)) - ordenFase.indexOf(fa(b));
          });
          funnelPagesText = rows.map((x) => `— ${str(x.title)} —\n${clip(str(x.content), 6000)}`).join("\n\n");
          retrievalMeta = { ...retrievalMeta, paginas: rows.map((x) => str(x.id)), funnel_base: faseCF ? null : idDe(exPick[0]) };
        }
      }

      // 3) SECCIONES DEL BLUEPRINT relevantes a lo que pide el usuario (top 3).
      const { data: bpList } = await supabase.from("marketing_ad_library")
        .select("id,niche,niche_tags,title").eq("part", corpus.section).eq("status", "approved");
      const bpScored = (Array.isArray(bpList) ? bpList : []).map((r) => {
        const hay = hayOf(r);
        let score = 0;
        for (const t of qTokens) if (hay.includes(t)) score += 2;
        for (const t of nicheTokens) if (hay.includes(t)) score += 1;
        return { id: str(r.id), score };
      }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
      if (bpScored.length) {
        const { data: full } = await supabase.from("marketing_ad_library").select("title,content").in("id", bpScored.map((s) => s.id));
        blueprintSectionsText = (Array.isArray(full) ? full : []).map((f) => `— ${str(f.title)} —\n${clip(str(f.content), 3500)}`).join("\n\n");
        retrievalMeta = { ...retrievalMeta, sections: bpScored.map((s) => s.id) };
      }
    } catch { examplesText = ""; blueprintSectionsText = ""; vslGuionText = ""; }
  }

  // Gate del pipeline (autoridad server-side). Cada agente mira SU etapa: si no, el de VSL
  // hereda el gate de anuncios y se niega a escribir el guión hasta que el guión exista.
  const STAGE_BY_AGENT: Record<string, string> = { anuncios: "anuncios", vsl: "vsl", landing: "landing" };
  const myStage = STAGE_BY_AGENT[subagentKey] || "";
  let gate: Record<string, unknown> | null = null;
  let descRows: Record<string, unknown>[] = [];
  let momento = "";
  if (subagentKey === "descubrimiento") {
    // Otro gate y otro nivel: descubrimiento_status() es a nivel CLIENTE y va aguas arriba
    // de cerebro_pipeline_status() — termina donde ese empieza (el paso 4 produce el DEL, el
    // paso 5 los avatares). Ver migrations/descubrimiento_gate_v1.sql.
    try {
      const { data: pipe } = await supabase.rpc("descubrimiento_status", { p_client_id: clientId });
      descRows = Array.isArray(pipe) ? (pipe as Record<string, unknown>[]) : [];
      momento = str(descRows[0]?.momento);
      // El pedido no nombró un paso (o nombró dos): manda el gate, no el modelo. El paso es
      // el primero que se puede hacer. Si no hay ninguno pendiente, queda vacío y el agente
      // responde con el estado en vez de producir.
      if (!pasoActivo) pasoActivo = str(descRows.find((r) => str(r.status) === "pendiente")?.stage);
      gate = descRows.find((r) => str(r.stage) === pasoActivo) || null;

      // La metodología del paso activo, completa. Se carga solo si el paso se puede producir
      // ACÁ. Dos motivos para no cargarla, y los dos importan:
      //
      //   · bloqueado  → le falta un prerrequisito. Que no la tenga es lo que evita que lo
      //                  escriba igual "con lo que hay".
      //   · ejecuta="fuera" (research, competencia) → la metodología pide buscar en Google o
      //                  leer el Ad Library, y este chat no tiene ninguna de las dos. Darle
      //                  23 KB de "hacé 15-20 búsquedas" a alguien sin buscador no lo ayuda:
      //                  lo empuja a inventar los datos del líder. Y un research inventado
      //                  envenena la estrategia y el avatar que salen después.
      //
      // En los dos casos el agente igual sabe qué es ese paso (la ficha va siempre) y puede
      // decir qué falta y quién lo aporta, que es su trabajo real.
      //
      // La condición es "el corpus dijo que SÍ se hace acá", no "no dijo que se haga afuera".
      // La diferencia importa: antes esto era `!== "fuera"`, y si la query de las fichas fallaba
      // el mapa quedaba vacío → `undefined !== "fuera"` → true → cargaba la metodología igual.
      // O sea: el candado que existe para que no se invente el research fallaba ABIERTO justo
      // cuando algo ya había salido mal. Un slug con typo en el corpus tenía el mismo efecto.
      const sePuedeAca = ejecutaPorPaso[pasoActivo] === "chat";
      if (pasoActivo && str(gate?.status) !== "bloqueado" && sePuedeAca) {
        const { data: sk } = await supabase.from("marketing_ad_library")
          .select("content").eq("id", `mal_desc_skill_${pasoActivo}`).maybeSingle();
        skillActivaText = clip(str(sk?.content), 52000);  // la más pesada (avatar) son ~49 KB
      }
      retrievalMeta = {
        ...retrievalMeta, paso: pasoActivo || "ninguno", momento,
        ejecuta: ejecutaPorPaso[pasoActivo] || "?", skill_chars: skillActivaText.length,
      };
    } catch { gate = null; skillActivaText = ""; }
  } else {
    try {
      const { data: pipe } = await supabase.rpc("cerebro_pipeline_status", { p_client_id: clientId });
      const rows = Array.isArray(pipe) ? (pipe as Record<string, unknown>[]) : [];
      gate = myStage ? (rows.find((r) => str(r.funnel_id) === funnelId && str(r.stage) === myStage) || null) : null;
    } catch { gate = null; }
  }
  // Bloquea SOLO si la etapa está bloqueada de verdad (le faltan los prerrequisitos).
  // Antes esto miraba también `can_generate === false`, pero can_generate = (not done and
  // prereq_ok): con la etapa ya 'listo' devolvía gate_blocked diciendo que faltaba el
  // insumo — lo contrario de la verdad. En VSL era peor: la etapa se marca 'listo' apenas
  // hay vsl_url, o sea que no se podría reescribir el guión de ningún funnel ya grabado.
  const gateBlocked = gate ? str(gate.status) === "bloqueado" : false;
  const gateBlockedHard = gateBlocked;

  // ── Copy de las páginas del funnel (verbatim del DEL) ──
  // La pre-landing es a dónde LLEGA la gente después del clic: el contexto de alineación más
  // importante para el anuncio. El resto son apoyo. Los clips son ASIMÉTRICOS a propósito:
  // paga presupuesto lo que mueve la aguja del anuncio, no lo que no (la thank-you casi nunca).
  // Solo el RECORRIDO de la persona: el feedback del equipo no entra (no es una página).
  const pagesCopy = (page?.pages_copy && typeof page.pages_copy === "object" && !Array.isArray(page.pages_copy))
    ? page.pages_copy as Record<string, Record<string, unknown>> : {};
  //                 clave          rótulo            clip   ¿rotular el titular?
  const PAGINAS: Array<[string, string, number, boolean]> = [
    ["prelanding", "PRE-LANDING", 2500, true],
    ["landing", "Landing (VSL)", 1200, true],
    ["formulario", "Formulario", 600, false],
    ["thankyou", "Thank You Page", 400, false],
    ["testimonios", "Testimonios", 800, false],
  ];
  // El DEL no trae el titular aparte, pero en una pre-landing o una landing la primera línea
  // ES el titular. Solo se rotula en esas dos: en el formulario la primera línea es la primera
  // pregunta y en la thank-you es el texto entero — llamarlas "TITULAR" sería mentirle al agente.
  const titularDe = (t: string) => clip(str(t).split(/\r?\n/).map(str).find(Boolean) || "", 200);
  const seccionesPag = PAGINAS.map(([key, rotulo, tope, rotularTit]) => {
    const txt = str(pagesCopy[key]?.text as string);
    if (!txt) return "";
    const tit = rotularTit ? titularDe(txt) : "";
    return `— ${rotulo} —${tit ? `\nTITULAR: ${tit}` : ""}\n${clip(txt, tope)}`;
  }).filter(Boolean);
  const hayPrelanding = !!str(pagesCopy.prelanding?.text as string);

  // El encuadre habla de hooks → es específico de anuncios. El DATO va para todos: sale de la
  // misma query que ya corre, y landing/formularios/auditor son consumidores más naturales aún.
  const guiaPaginas = subagentKey !== "anuncios" ? [] : [
    hayPrelanding
      ? "La PRE-LANDING es la más importante: es la primera pantalla que ve la persona apenas hace clic en el anuncio. Su TITULAR es lo central: el anuncio y ese titular tienen que sentirse la MISMA conversación."
      : "Este funnel no tiene pre-landing: del anuncio se cae directo a la landing. Es normal, no todos la tienen — no la pidas ni la inventes; alineá con la landing.",
    "Alineá como te sirva mejor: DIRECTA (el anuncio hace eco del titular, mismas palabras) o INDIRECTA (mismo ángulo y misma promesa, otras palabras). Las dos son válidas; elegí según el ángulo. Cuanto más alineado, mejor.",
    "Alinear NO es clonar: los 5 hooks siguen siendo 5 aperturas DISTINTAS entre sí. Como mucho UNO puede hacer eco literal del titular; si todos lo repiten rompiste el abanico y perdiste el test.",
    "Las demás páginas son apoyo: te dicen qué se le promete y qué se le pide a la persona más adelante. No prometas en el anuncio algo que estas páginas no sostienen.",
    // Lo que dependía del `mode` se movió al contexto recuperado: este bloque se cachea y no
    // puede cambiar entre chatear y generar (ver el corte del cache más abajo).
  ].filter(Boolean);

  // Sin páginas no va NADA: el preámbulo es lo que crea la expectativa, y sin datos solo
  // lograría que el agente reclame un dato que no existe.
  const pagesBlock = !seccionesPag.length ? "" : [
    subagentKey === "anuncios"
      ? "\n— PÁGINAS DEL FUNNEL (a dónde LLEGA la gente después del clic; alineá el anuncio con esto) —"
      : "\n— PÁGINAS DEL FUNNEL (copy verbatim del DEL: es lo que está publicado hoy) —",
    ...guiaPaginas,
    ...seccionesPag,
  ].join("\n");

  // El tipo del funnel. Ahora es un CAMPO (strategy_pages.tipo), no una adivinanza sobre el
  // nombre de la carpeta de Drive. Importa: los funnels "Producto sin pre-landing" y
  // "Producto V2" de Jose Luis Rivas cuelgan de una carpeta llamada "Reclutamiento", asi que
  // la regex le decia RECLUTAMIENTO al agente y le hacia escribir el anuncio equivocado.
  // El fallback a la regex se queda para los funnels a los que todavia nadie les puso el tipo.
  const TIPO_LBL: Record<string, string> = { reclutamiento: "Reclutamiento", producto: "Producto" };
  const tipo = TIPO_LBL[str(page?.tipo)]
    || (/producto/i.test(str(strat?.name)) ? "Producto" : (/reclut/i.test(str(strat?.name)) ? "Reclutamiento" : "—"));

  // El contexto de descubrimiento es OTRO: nivel cliente, no funnel. Casi todo el bloque de
  // abajo (avatar, guión del VSL, páginas, ganadores) no existe todavía en esta fase — meterlo
  // vacío sería enseñarle al agente que el cliente "no tiene" cosas que aún no le tocan tener.
  // El foco manda sobre QUÉ se investiga y en qué se profundiza. Va arriba de todo, antes
  // incluso del estado: si esto está mal, todo el descubrimiento apunta al lado equivocado.
  const FOCO_TXT: Record<string, string> = {
    reclutamiento: "RECLUTAMIENTO. Lo que se vende es la OPORTUNIDAD, y lo que la sostiene es el líder: su autoridad, su historia, su credibilidad, sus resultados y su equipo. Ahí es donde tenés que profundizar en todos los pasos.",
    producto: "PRODUCTO. Lo que se vende es el PRODUCTO, así que el centro son los productos GANADORES de la empresa: cuáles funcionan, qué resultados dan, qué los diferencia y qué evidencia hay. El líder igual importa (es quien lo vende y da la cara), pero es soporte del producto, no el eje.",
    mixto: "MIXTO: este cliente tiene estrategias de Reclutamiento Y de Producto. NO las mezcles en un mismo entregable — el método Korex las segmenta siempre. Preguntá para cuál de las dos es lo que te están pidiendo antes de producir.",
    sin_tipo: "NO ESTÁ DEFINIDO: el cliente tiene funnels, pero ninguno tiene el tipo cargado (Reclutamiento o Producto). Preguntá cuál es el foco antes de producir.",
    sin_estrategia: "TODAVÍA NO EXISTE: este cliente no tiene ningún funnel creado, así que el foco no está definido en ningún lado. PREGUNTALO antes de producir o de coordinar el research — investigar la autoridad del líder cuando el cliente viene por producto es research tirado a la basura, y al revés igual. No lo supongas por el nicho ni por la empresa.",
  };

  const volatileDesc = [
    "===== CONTEXTO DE ESTA CONVERSACIÓN (usalo, no lo pidas) =====",
    `Cliente: ${str(client?.name)}${str(client?.company) ? ` · Empresa MLM: ${str(client?.company)}` : ""}${str(client?.niche) ? ` · Nicho: ${str(client?.niche)}` : ""}${str(client?.team_name) ? ` · Equipo: ${str(client?.team_name)}` : ""}`,
    `\n— FOCO DEL CLIENTE —\n${FOCO_TXT[focoDesc] || FOCO_TXT.sin_tipo}`,

    // El estado va COMPLETO (los 5 pasos), no solo el activo: el agente tiene que poder decir
    // "estás acá, lo que sigue es esto" aunque le hayan preguntado por otro paso.
    descRows.length
      ? `\n— ESTADO DEL DESCUBRIMIENTO · MOMENTO: ${momento.toUpperCase()} —\nCalculado contra los documentos reales del cliente. Es la autoridad: no lo discutas ni lo deduzcas del chat.\n${descRows.map((r) => `${str(r.ord)}. ${str(r.stage_label)} → ${str(r.status).toUpperCase()} — ${str(r.detail)}`).join("\n")}`
      : "\n— ESTADO DEL DESCUBRIMIENTO: (no se pudo calcular; decilo y no inventes en qué paso está) —",

    fichasText ? `\n===== LOS 5 PASOS DEL DESCUBRIMIENTO (fichas) =====\nEsto es el MENÚ: para qué sirve cada paso y qué necesita. La metodología completa te llega solo para el paso activo.\n\n${fichasText}` : "",

    docsDescText || "\n— DOCUMENTOS DEL CLIENTE: no hay ninguno cargado. El equipo todavía no sincronizó el Doc de Drive de este cliente. Decilo; no supongas qué dicen. —",

    // La metodología del paso activo. Es lo único que cambia según lo que pidan.
    skillActivaText
      ? `\n===== METODOLOGÍA DEL PASO ACTIVO: ${pasoActivo.toUpperCase()} =====\nEs el estándar Korex para este paso. Seguila al pie de la letra: su estructura de salida, sus reglas y su formato mandan sobre cualquier instrucción general de formato.\n\n${skillActivaText}`
      // Sin fichas no sabemos qué paso se hace acá ni cuál se trae de afuera, así que no se
      // carga ninguna metodología (ver el candado arriba). Decirlo tal cual: llamarlo
      // "bloqueado" sería mentir sobre qué falta y mandaría a buscar un prerrequisito que
      // capaz ya está.
      : (!fichasOk
        ? `\n===== NO SE PUDO LEER EL MÉTODO DEL DESCUBRIMIENTO =====\nNo es que falte un insumo del cliente: falló la lectura del corpus y no tenés la metodología de ningún paso. NO produzcas ningún entregable de memoria. Decí que hubo un problema técnico leyendo el método, que hay que avisarle a soporte, y limitate a lo que puedas responder con el estado y los documentos que sí tenés.`
      : (pasoActivo && ejecutaPorPaso[pasoActivo] === "fuera"
        // El caso más delicado: el paso se puede hacer, pero NO acá. Si además está sin hacer,
        // el agente es el que tiene que reclamarlo — no producirlo.
        ? `\n===== PASO ${pasoActivo.toUpperCase()}: NO SE HACE DESDE ESTE CHAT =====\nNo recibís su metodología a propósito: necesita herramientas que no tenés (buscar en la web / leer el Ad Library de Meta).\n\nNO lo produzcas ni lo aproximes. No sabés quién es este líder ni qué anuncios corre su competencia: cualquier cosa que escribas sobre eso la estarías inventando, y de ahí salen después la estrategia y el avatar.\n\nLo que SÍ tenés que hacer: decir que ese paso falta, quién lo aporta (lo trae una persona y entra por el Doc de Drive del cliente), y ofrecer avanzar con lo que sí se puede hacer ahora.`
        : (pasoActivo
          ? `\n===== PASO ${pasoActivo.toUpperCase()}: BLOQUEADO =====\nNo recibís su metodología a propósito, porque este paso NO se puede hacer todavía. No la reconstruyas de memoria ni entregues un adelanto "provisional". Decí qué falta (está en el estado de arriba), quién lo aporta, y qué paso sí se puede hacer ahora.`
          : `\n===== NO HAY UN PASO ACTIVO =====\nEl pedido no dejó claro qué paso querés (o nombró varios, o ya está todo hecho). NO adivines y NO mezcles dos pasos. Decí en qué momento está el cliente, qué paso corresponde según el estado de arriba, y pedí que te lo confirmen.`))),

    client?.meta_metrics ? `\n— SEÑAL DE MÉTRICAS —\n${clip(JSON.stringify(client.meta_metrics), 600)}` : "",
  ].filter(Boolean).join("\n");

  // ── QUÉ SE CACHEA Y QUÉ NO ──
  // El cache de la API es un PREFIJO: se corta en el breakpoint y TODO lo que va después se paga
  // entero, a precio de tokens frescos, en cada mensaje. Se permiten hasta 4 breakpoints por
  // pedido; usábamos 1 (el del método, arriba). Todo el contexto del cliente caía del lado caro.
  //
  // El costo de eso no era teórico: en Descubrimiento los documentos son hasta 433.000 caracteres
  // (~108k tokens) y NO cambian entre turnos de la misma conversación — están del lado volátil
  // porque cambian por CLIENTE, no porque cambien por MENSAJE. Se re-mandaban enteros cada vez:
  // ~US$0,30 por turno, ~US$2 una conversación de 6 turnos, contra un tope diario de US$5 que es
  // global para todo el panel. Dos conversaciones y se bloqueaba Anuncios, VSL y Funnels para
  // todo el equipo. Con el breakpoint, del 2º turno en adelante eso se lee a 0,1x en vez de 1x.
  //
  // El corte va por ESTABILIDAD dentro de una conversación, no por tema:
  //   · descubrimiento → TODO su contexto es estable (mismo cliente, mismo paso: el paso ahora lo
  //     fija el primer mensaje). Entra entero al cache, sin reordenar nada.
  //   · el resto → su retrieval (ejemplos, secciones, guión base) se scorea contra el ÚLTIMO
  //     mensaje: cambia turno a turno y NO se puede cachear. Por eso va partido en dos.
  const contextoEstable = subagentKey === "descubrimiento" ? volatileDesc : [
    "===== CONTEXTO DE ESTA CONVERSACIÓN (usalo, no lo pidas) =====",
    `Cliente: ${str(client?.name)}${str(client?.company) ? ` · Empresa MLM: ${str(client?.company)}` : ""}${str(client?.niche) ? ` · Nicho: ${str(client?.niche)}` : ""}${str(client?.team_name) ? ` · Equipo: ${str(client?.team_name)}` : ""}`,
    // El FUNNEL es la unidad: el tipo es suyo, no de la carpeta que lo contiene.
    `Funnel: ${str(page?.name) || "—"} (tipo: ${tipo})`,
    avatar ? `\n— AVATAR SELECCIONADO —\nNombre: ${str(avatar.name)}\nSegmentación: ${str(avatar.audience) || "—"}\nDescripción (del DEL): ${clip(str(avatar.spec_text), 4000) || "—"}${str(avatar.ad_script) ? `\nCopys de anuncios ya existentes (del DEL, para partir de acá y no repetir): ${clip(str(avatar.ad_script), 4000)}` : ""}` : "\n— AVATAR: (ninguno seleccionado o cargado) —",
    subagentKey === "vsl"
      ? `\n— GUIÓN VSL QUE YA TIENE EL FUNNEL (del DEL; es lo que hay hoy) —\n${vslScript ? clip(vslScript, 6000) : "(sin guión de VSL cargado: se escribe desde cero)"}`
      : `\n— GUIÓN DEL VSL DEL FUNNEL (el anuncio SALE de acá) —\n${vslScript ? clip(vslScript, 5000) : "(sin guión de VSL cargado)"}`,
    pagesBlock, // a dónde LLEGA: va pegado al VSL para que se lea como un solo recorrido
    briefText ? `\n— BRIEF / PERSONALIDAD DEL LÍDER —\n${briefText}` : "",
    // Los anuncios ganadores son insumo del agente de anuncios. Para VSL, el ganador
    // relevante es el VSL que retuvo (Voomly), que ya viaja etiquetado en los ejemplos.
    subagentKey === "anuncios"
      ? (winners ? `\n— ANUNCIOS GANADORES DE ESTE CLIENTE (piso, no techo: proponé ÁNGULOS NUEVOS) —\n${winners}` : "\n— (Aún no hay anuncios ganadores cargados para este cliente) —")
      : "",
    // El estado del pipeline y las métricas son del cliente/funnel: estables. Van ACÁ y no al
    // final —donde estaban— para que el corte del cache caiga entre lo estable y lo recuperado.
    // Es lo único que se reordenó, y no rompe ninguna referencia: nada dice "más abajo".
    client?.meta_metrics ? `\n— SEÑAL DE MÉTRICAS —\n${clip(JSON.stringify(client.meta_metrics), 600)}` : "",
    gate ? `\n— ESTADO DEL PIPELINE (etapa ${myStage}) —\nEstado: ${str(gate.status)} · sub-estado: ${str(gate.substate) || "—"} · ${str(gate.detail)}` : "",
    gateBlockedHard
      ? (subagentKey === "vsl"
        ? "\n⚠️ GATE BLOQUEADO: este funnel todavía no tiene los avatares del DEL cargados. NO escribas el guión final: sin avatar no hay dolor, y sin dolor no hay VSL. Explicá que primero hay que cargar los avatares, y ofrecé ayudar con eso."
        : subagentKey === "landing"
          ? "\n⚠️ GATE BLOQUEADO: este funnel todavía no tiene el guión del VSL. NO escribas el copy final del funnel: cada página se alinea con lo que promete el VSL, así que sin VSL estarías inventando una promesa. Explicá que primero hay que guionar el VSL, y ofrecé ayudar con lo que sí se puede avanzar (definir el objetivo del funnel, el punto diferencial)."
          : "\n⚠️ GATE BLOQUEADO: este funnel NO tiene el VSL listo. NO escribas anuncios finales. Explicá con claridad que primero hay que tener el VSL (guionado) y el avatar definido, y ofrecé ayudar a avanzar esos prerrequisitos.")
      : "",
  ].filter(Boolean).join("\n");

  // Lo que cambia en cada mensaje: el retrieval se scorea contra el último pedido. Descubrimiento
  // no tiene nada acá (elige QUÉ SKILL entra, no qué párrafos, y eso ya lo fijó el primer mensaje).
  const contextoRecuperado = subagentKey === "descubrimiento" ? "" : [
    blueprintSectionsText ? `\n— SECCIONES DEL BLUEPRINT RELEVANTES A TU PEDIDO (el método Korex en detalle; el resumen ya lo tenés arriba) —\n${blueprintSectionsText}` : "",
    examplesText
      ? (subagentKey === "vsl"
        ? `\n— FICHAS DE VSL DE NICHO/AVATAR CERCANO (biblioteca Korex de 28 casos reales, con su veredicto de retención de Voomly) —\nCada ficha trae avatar, promesa, ángulo, mecanismo, cierre y estructura beat a beat. Clonás la ESTRUCTURA del más cercano, no las palabras. Si una ficha dice PERDEDOR, es lo que NO hay que repetir.\n${examplesText}`
        : subagentKey === "landing"
          ? `\n— FICHAS DE FUNNELS DE NICHO/AVATAR CERCANO (biblioteca Korex: 31 funnels reales de 20 clientes) —\nCada ficha trae avatar, nicho, estrategia y el arranque de sus 4 páginas. Son REFERENCIA, no el estándar: el estándar es el blueprint. "Publicado" solo quiere decir que salió a la calle, NO que haya funcionado: de estos funnels no hay métricas de conversión. No los presentes como casos de éxito.\n${examplesText}`
          : `\n— EJEMPLOS DE ANUNCIOS DE NICHO SIMILAR (biblioteca Korex; usalos como referencia de estilo/estructura/ángulos, NO los copies literal) —\n${examplesText}`)
      : "",
    vslGuionText ? `\n— GUIÓN COMPLETO DEL CASO MÁS CERCANO (tu punto de partida: clonás su estructura y su ritmo, con el dolor y las cifras de ESTE avatar; jamás copiás sus frases ni sus números) —\n${vslGuionText}` : "",
    // Los ejemplos son el copy del DEL: texto corrido, SIN maqueta. Hay que decirlo, o el
    // agente imita esa falta de estructura y devuelve una lista de frases. La maqueta sale
    // de los wireframes del blueprint; de acá sale el tono y el contenido.
    funnelPagesText
      ? (faseCF
        ? `\n— LA MISMA PÁGINA EN FUNNELS CERCANOS (copy real, tal cual se publicó; para comparar contra lo que estás auditando) —\nMirá qué resuelven estas y qué le falta a la del cliente. Incluyen sus marcas de elemento ([VSL], [CARRUSEL]) y sus erratas: no las copies literal.\nOJO: vienen en texto corrido, sin maqueta — así están en el DEL. Eso NO es cómo se entrega: la estructura en bandas la ponés vos siguiendo el wireframe.\n${funnelPagesText}`
        : `\n— EL FUNNEL COMPLETO DEL CASO MÁS CERCANO (tu punto de partida: clonás el RECORRIDO y la estructura, con el dolor y las cifras de ESTE avatar; jamás sus frases ni sus números) —\nOJO: viene en texto corrido, sin maqueta — así está en el DEL. De acá sacás el tono y el contenido; la estructura en bandas sale del WIREFRAME de tu blueprint.\n${funnelPagesText}`)
      : "",
    // Lo propio del modo generate va acá, del lado NO cacheado. Si viviera arriba, alternar entre
    // chatear y apretar "Generar" cambiaría el bloque estable y tiraría su cache en cada vuelta.
    // Las mismas condiciones que tenía adentro de `guiaPaginas`: solo anuncios, y solo si hay
    // páginas cargadas (sin páginas no hay titular con el cual alinearse).
    mode === "generate" && subagentKey === "anuncios" && seccionesPag.length
      ? "\nEn `notes`, en UNA línea: con qué titular te alineaste y si la alineación fue directa o indirecta."
      : "",
    mode === "generate"
      ? "\n(En este pedido devolvés la salida con la herramienta, no en markdown: el panel la arma en tarjetas.)"
      : "",
  ].filter(Boolean).join("\n");

  // ── Modo GENERATE: salida estructurada, gateada por el candado ──
  if (mode === "generate" && gateBlocked) {
    const falta = subagentKey === "vsl"
      ? "Faltan los avatares del DEL en este funnel para escribir el guión."
      : subagentKey === "landing"
        ? "Falta el guión del VSL de este funnel para escribir el copy de las páginas."
        : subagentKey === "descubrimiento"
          // No debería llegar acá (este agente no tiene tool, así que el panel nunca pide
          // generate), pero el fallback de abajo hablaría de un VSL y un funnel que en esta
          // fase no existen: mentiría sobre qué falta.
          ? `El paso "${pasoActivo || "pedido"}" está bloqueado: le falta un prerrequisito.`
          : "Falta el VSL de este funnel para generar anuncios.";
    return j({ ok: false, error: "gate_blocked", detail: str(gate?.detail) || falta, gate }, 200);
  }

  // Una herramienta por agente: la salida de VSL es un guión de 10 secciones, no anuncios.
  const vslTool = {
    name: "emit_vsl_script",
    description: "Devuelve un guión de VSL Korex completo, con el menú de hooks y las 10 secciones del esqueleto base (o la anatomía de Producto si el nicho es Producto suelto).",
    input_schema: {
      type: "object",
      properties: {
        hooks: {
          type: "array",
          description: "Mínimo 5 hooks DISTINTOS entre sí. El primero es SIEMPRE el Hook A ('En los próximos [X] te voy a [verbo]…'), que es obligatorio en todo VSL Korex.",
          items: {
            type: "object",
            properties: {
              formula: { type: "string", description: "Qué fórmula es: A (obligatoria), B felicitación+filtro, C cifra, D si-entonces, E plano-dolor, F retrospectiva, G pregunta detonante, o un hook de nicho (Producto)." },
              texto: { type: "string", description: "El hook, listo para grabar (30-50 palabras)." },
            },
            required: ["formula", "texto"],
          },
        },
        secciones: {
          type: "array",
          description: "El guión en orden. Por defecto las 10 del esqueleto base (Hook, Identificación, Descalificación, Dolor+empatía, Autoridad+historia, Vehículo, Prueba social, Visualización, Camino A vs B, CTA). Si el nicho es Producto suelto, usá su anatomía propia (9 secciones, síntoma vs causa + reversión de riesgo). Cada sección abre abrazando a la anterior: se tiene que leer como UN guión, no como piezas cosidas.",
          items: {
            type: "object",
            properties: {
              n: { type: "number", description: "Número de orden." },
              nombre: { type: "string", description: "Nombre de la sección." },
              texto: { type: "string", description: "El texto para grabar, palabra por palabra, con la frase-puente al inicio." },
            },
            required: ["n", "nombre", "texto"],
          },
        },
        caso_base: { type: "string", description: "Qué caso de la biblioteca clonaste como estructura (ej: 'VSL 25 · Sergio Cánovas · networker estancada') y por qué es el más cercano." },
        duracion_estimada: { type: "string", description: "Duración estimada (ej: '6 min'). Default 6 min; si es más largo, justificá con 2+ criterios de la Parte 8." },
        palabras: { type: "number", description: "Total aproximado de palabras del guión." },
        notas: { type: "string", description: "Qué datos faltan del cliente (cifras, casos de éxito, nombre de la comunidad) y qué se dejó marcado para completar. No inventes cifras ni testimonios." },
      },
      required: ["hooks", "secciones"],
    },
  };

  const adTool = {
    name: "emit_ad_copy",
    description: "Devuelve una tanda de anuncios de Meta agrupados POR ÁNGULO (formato Korex: por ángulo, 1 texto base + varios hooks alineados).",
    input_schema: {
      type: "object",
      properties: {
        ads: {
          type: "array",
          description: "Un grupo por ÁNGULO. Cada grupo = el texto base + su abanico de hooks.",
          items: {
            type: "object",
            properties: {
              angle: { type: "string", description: "El ángulo / gran idea. Uno distinto por grupo." },
              primary_text: { type: "string", description: "El TEXTO BASE (cuerpo) del anuncio de Meta para este ángulo." },
              hooks: { type: "array", items: { type: "string" }, description: "5 ganchos (hooks) distintos, TODOS alineados al MISMO texto base e INTERCAMBIABLES: cualquiera debe encajar como primera línea del texto base sin romper la promesa/oferta." },
              headline: { type: "string", description: "Titular corto, debajo del creativo." },
              description: { type: "string", description: "Descripción/línea de apoyo (opcional)." },
              creative_note: { type: "string", description: "Nota creativa: formato/visual sugerido y segmentación si aplica." },
            },
            required: ["angle", "primary_text", "hooks"],
          },
        },
        notes: { type: "string", description: "Razonamiento breve / sugerencia de testeo (opcional)." },
      },
      required: ["ads"],
    },
  };

  // ── El comando `/slug` se traduce a su pedido antes de que lo vea el modelo ──
  // El modelo no tiene por qué entender nuestra sintaxis: `/estrategia` se convierte en la
  // instrucción canónica de ese paso, que vive en el corpus (metrics.pedido). Si además
  // escribieron algo, va abajo — es la aclaración de la persona y manda sobre el pedido genérico.
  const msgsApi = messages.map((m) => ({ role: m.role, content: m.content }));
  if (comandoPaso && pedidoPorPaso[comandoPaso]) {
    for (let i = msgsApi.length - 1; i >= 0; i--) {
      if (msgsApi[i].role !== "user") continue;
      const resto = str(msgsApi[i].content).replace(/^\s*\/[a-z_]+\b[ \t]*/i, "").trim();
      msgsApi[i].content = pedidoPorPaso[comandoPaso] + (resto ? `\n\n${resto}` : "");
      break;
    }
  }

  // ── Llamada a la API (una sola; a lo sumo 1 reintento ante 429/5xx). max_tokens acotado. ──
  const reqBody: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    // Agente interactivo: SIN "pensar interno" (adaptive thinking). En Sonnet 5 el thinking está
    // ON por defecto y se come el presupuesto de max_tokens → respuestas cortadas/vacías. Para copy
    // de anuncios no hace falta; así es rápido, barato y todo el presupuesto va a la respuesta.
    thinking: { type: "disabled" },
    // Dos breakpoints, ordenados de más estable a menos (el cache es un prefijo: lo que se mueve
    // tiene que ir al final o invalida todo lo de arriba):
    //   1. el método — estable por agente.
    //   2. el contexto del cliente — estable dentro de la conversación. Es el que paga: en
    //      Descubrimiento son hasta ~108k tokens que antes se re-mandaban en cada mensaje.
    //   3. lo recuperado por el pedido de este turno — sin cachear, cambia siempre.
    // Se permiten hasta 4; usamos 2.
    system: [
      { type: "text", text: stableSystem, cache_control: { type: "ephemeral" } },
      { type: "text", text: contextoEstable, cache_control: { type: "ephemeral" } },
      ...(contextoRecuperado ? [{ type: "text", text: contextoRecuperado }] : []),
    ],
    messages: msgsApi,
  };
  // Un agente sin herramienta responde en markdown y el panel lo pinta (AgentMarkdown).
  // El de funnels es así a propósito: no guarda en el DEL, se copia del chat.
  const TOOL_BY_AGENT: Record<string, typeof adTool | typeof vslTool> = { anuncios: adTool, vsl: vslTool };
  const tool = TOOL_BY_AGENT[subagentKey] || null;
  // La herramienta va SOLO en modo generate. Suena tentador dejarla siempre presente (con
  // `tool_choice:"none"` al chatear) para no invalidar el cache —`tools` se renderiza antes que
  // `system`, así que agregarla o sacarla rompe el prefijo cacheado—, y así estaba. Pero rompía
  // la función: al chatear, el modelo VE que existe `emit_ad_copy`, escribe un preámbulo
  // ("Voy a crear 4 ángulos…") y DIFIERE el contenido real a la herramienta… que `tool_choice:
  // "none"` le prohíbe llamar. Resultado: corta el turno con la respuesta vacía. En generate,
  // que fuerza la herramienta, nunca pasó. La correctitud manda sobre el cache: al chatear no hay
  // herramienta, así que el agente escribe la respuesta como markdown (que es lo que el panel
  // pinta). Lo único que se paga es un miss de cache al alternar chat↔generate — despreciable al
  // lado de un chat que no respondía.
  if (tool && mode === "generate") {
    reqBody.tools = [tool];
    reqBody.tool_choice = { type: "tool", name: tool.name };
  }
  if (!/sonnet-5|opus-4|fable-5/i.test(model)) reqBody.temperature = mode === "generate" ? 0 : 0.6;

  async function callApi(): Promise<Response> {
    return await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(120000),
    });
  }

  let apiRes: Response | null = null;
  let lastErr = "";
  for (let attempt = 1; attempt <= 2; attempt++) { // 1 intento + 1 reintento como MUCHO. Sin loops.
    let esperar = 1200;
    try {
      apiRes = await callApi();
      if (apiRes.ok) break;
      lastErr = "http " + apiRes.status;
      if (apiRes.status !== 429 && apiRes.status < 500) break; // 4xx duro: no reintenta
      // En un 429 la API dice en `retry-after` cuántos segundos hay que esperar. Reintentar antes
      // es garantizar el segundo 429: se quema el único reintento que tenemos y el equipo ve el
      // error igual. Se acota a 10s porque esto es sincrónico — hay alguien esperando en el panel.
      const ra = Number(apiRes.headers.get("retry-after"));
      if (Number.isFinite(ra) && ra > 0) esperar = Math.min(ra * 1000, 10000);
    } catch (e) { lastErr = String((e as Error)?.message || e); }
    if (attempt < 2) await new Promise((r) => setTimeout(r, esperar));
  }
  if (!apiRes || !apiRes.ok) {
    let detail = lastErr;
    try { detail = (await apiRes?.text()) || lastErr; } catch { /* nada */ }
    await supabase.from("api_usage").insert({ fn: "agent_chat", model, status: "error", client_id: clientId, funnel_id: funnelId, error: clip(detail, 500), meta: { subagent_key: subagentKey, mode } });
    return j({ ok: false, error: "api_error", detail: clip(detail, 400) }, 502);
  }

  const data = await apiRes.json();
  const usage = data?.usage || {};
  // Los 3 tipos de token de entrada NO valen lo mismo: leer del cache cuesta 0.1x del precio de
  // entrada y escribirlo 1.25x (TTL 5 min, el default de ephemeral; con ttl:"1h" sería 2x).
  // Sumarlos y multiplicarlos por price.in inflaba el costo y disparaba los topes antes de tiempo.
  const freshTok = Number(usage.input_tokens || 0);
  const cacheReadTok = Number(usage.cache_read_input_tokens || 0);
  const cacheWriteTok = Number(usage.cache_creation_input_tokens || 0);
  const inTok = freshTok + cacheReadTok + cacheWriteTok;
  const outTok = Number(usage.output_tokens || 0);
  const inCost = ((freshTok + cacheReadTok * 0.1 + cacheWriteTok * 1.25) / 1e6) * price.in;
  const cost = Number((inCost + (outTok / 1e6) * price.out).toFixed(6));
  const stopReason = str(data?.stop_reason);

  // ── La línea de fuentes: qué material se leyó de verdad para esta respuesta ──
  // Va arriba de todo y la calcula la fn, no el modelo. El objetivo es que de un vistazo se sepa
  // si la respuesta está analizando el material o hablando de memoria — que es la falla que más
  // caro sale acá, porque un análisis inventado se ve igual de prolijo que uno real.
  //
  // Se marca solo lo que cambia si confiás o no en lo que sigue:
  //   ✓             lo leyó entero
  //   ⚠ X de Y      es material PRINCIPAL de este paso y solo leyó una parte. Lo que no vio, no
  //                 lo sabe: acá es donde la respuesta puede estar hablando de lo que no leyó.
  //   ⚠ plantilla   el archivo está pero sin llenar (el caso del DEL, mismo umbral que el gate)
  //   ✗ no hay      no existe. El más importante de todos.
  //   (contexto)    no es material de este paso. Recortarlo es la decisión de arriba, no una
  //                 falla — por eso no lleva ⚠.
  //
  // Va dentro del texto de la respuesta —y no como dato aparte para que lo pinte el panel— a
  // propósito: el equipo copia el brief a mano al Doc del cliente, y así la procedencia viaja
  // pegada al contenido en vez de perderse en el camino.
  const ROTULO_FUENTE: Record<string, string> = {
    onboarding: "Onboarding", investigacion: "Investigación", del: "DEL",
  };
  let lineaFuentes = "";
  if (subagentKey === "descubrimiento") {
    const n = (x: number) => x.toLocaleString("es-AR");
    const partes = Object.keys(ROTULO_FUENTE).map((kind) => {
      const rot = ROTULO_FUENTE[kind];
      const fs = fuentes.filter((x) => x.kind === kind);
      if (!fs.length) return `${rot} ✗ no hay`;
      // Los clientes tienen 2 a 4 documentos por tipo. Decir "✓" sin decir cuántos ocultaría
      // justo lo que importa: si entraron las dos llamadas o una sola.
      const cuantos = fs.length > 1 ? ` ×${fs.length}` : "";
      const chars = fs.reduce((a, f) => a + f.chars, 0);
      const leidos = fs.reduce((a, f) => a + f.leidos, 0);
      // El DEL plantilla: mismo umbral que el gate. Decir "entero" de un archivo de 2.511
      // caracteres con placeholders sería técnicamente cierto y completamente inútil.
      if (kind === "del" && chars < DEL_MINIMO) return `${rot} ⚠ plantilla sin llenar (${n(chars)})`;
      if (fs[0].usa === "contexto") return `${rot}${cuantos} (contexto)`;
      if (leidos < chars) return `${rot}${cuantos} ⚠ ${n(leidos)} de ${n(chars)}`;
      return `${rot}${cuantos} ✓`;
    });
    lineaFuentes = `**Fuentes** · ${partes.join(" · ")}\n\n`;
  }

  let reply = "";
  let adCopy: Record<string, unknown> | null = null;
  try {
    // Sin herramienta no hay salida estructurada que leer: aunque pidan "generate", lo que
    // vuelve es texto. Es el caso del agente de funnels.
    if (mode === "generate" && tool) {
      const block = (data.content || []).find((c: Record<string, unknown>) => c.type === "tool_use" && c.name === tool.name);
      adCopy = (block?.input as Record<string, unknown>) || null;
    } else {
      reply = (data.content || []).filter((c: Record<string, unknown>) => c.type === "text").map((c: Record<string, unknown>) => str(c.text)).join("\n").trim();
    }
  } catch { /* nada */ }

  // Red de seguridad: si quedó vacío por tope de tokens, avisamos claro en vez de "(sin respuesta)".
  if (!reply && !adCopy && stopReason === "max_tokens") {
    reply = "(La respuesta se cortó por el límite de longitud. Pedímelo en partes o más corto, o suban el tope de respuesta en Administración.)";
  }

  // Las fuentes van también cuando la respuesta se cortó o vino vacía: ahí es cuando más importa
  // saber sobre qué estaba trabajando.
  if (reply && lineaFuentes) reply = lineaFuentes + reply;

  await supabase.from("api_usage").insert({
    fn: "agent_chat", model, input_tokens: inTok, output_tokens: outTok, cost_usd: cost,
    client_id: clientId, funnel_id: funnelId, status: "ok",
    meta: {
      subagent_key: subagentKey, mode, avatar_id: avatarId, turns: messages.length, stop: stopReason,
      ads: adCopy ? (Array.isArray(adCopy.ads) ? adCopy.ads.length : 0) : undefined,
      secciones: adCopy && Array.isArray(adCopy.secciones) ? adCopy.secciones.length : undefined,
      // Qué recuperó la búsqueda (ids de fichas con su tier + secciones + guión base). Es la
      // única forma de verificar que trajo el nicho correcto sin adivinar leyendo la respuesta.
      retrieval: Object.keys(retrievalMeta).length ? retrievalMeta : undefined,
      // Huella del copy de páginas (NO el copy: meta es jsonb y no es un log de texto). Sirve
      // para verificar que el bloque llegó de verdad, sin adivinar mirando la respuesta.
      pages: seccionesPag.length
        ? {
          has: PAGINAS.filter(([k]) => str(pagesCopy[k]?.text as string)).map(([k]) => k),
          titular_len: titularDe(str(pagesCopy.prelanding?.text as string)).length,
          chars: seccionesPag.join("").length,
        }
        : undefined,
      // Sirve para decidir el TTL del cache: si cache_read viene casi siempre en 0 y cache_write
      // no, el cache vence entre click y click y estamos pagando el recargo de escritura al pedo.
      cache_read_tokens: cacheReadTok, cache_write_tokens: cacheWriteTok, fresh_tokens: freshTok,
    },
  });

  // ad_copy se mantiene por compatibilidad con el frontend de anuncios; el de VSL lee vsl_script.
  return j({
    ok: true, mode, reply, gate, cost_usd: cost,
    ad_copy: subagentKey === "vsl" ? null : adCopy,
    vsl_script: subagentKey === "vsl" ? adCopy : null,
    tokens: { in: inTok, out: outTok, cache_read: cacheReadTok, cache_write: cacheWriteTok }, stop_reason: stopReason,
  });
});
