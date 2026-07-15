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
  if (!clientId || !funnelId) return j({ ok: false, error: "missing_params", detail: "Faltan client_id o funnel_id." }, 400);

  // Sanear y recortar el historial (últimos ~12 turnos, roles válidos, contenido acotado).
  const messages: Msg[] = rawMsgs
    .map((m) => ({ role: str(m.role) === "assistant" ? "assistant" : "user", content: clip(str(m.content), 6000) }))
    .filter((m) => m.content)
    .slice(-12);
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
  const prices = (cfg.prices as Record<string, { in: number; out: number }>) || {};
  const price = prices[model] || { in: 3, out: 15 };

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
  };
  const corpus = CORPUS[subagentKey] || null;

  let blueprint = "";
  if (corpus) {
    const { data: bpRow } = await supabase.from("marketing_ad_library").select("content").eq("id", corpus.blueprintId).maybeSingle();
    blueprint = clip(str(bpRow?.content), 24000);  // margen para que la GUARDIA DE COMPLIANCE (al final) nunca se corte
  }

  const stableSystem = [
    general || "# Método Korex — (capa general no configurada)",
    `\n\n===== ESPECIALISTA: ${specialistName} =====\n`,
    specialistInstr || "(sin instrucciones del especialista)",
    blueprint ? `\n\n===== ${corpus!.rotulo} (el método, seguilo) =====\n${blueprint}` : "",
    material ? `\n\n===== MATERIAL DE CAPACITACIÓN (${specialistName}) =====\n${material}` : "",
  ].join("");

  // ── Contexto del cliente / funnel / avatar (volátil → NO se cachea) ──
  const [{ data: client }, { data: strat }, { data: page }] = await Promise.all([
    supabase.from("clients").select("name,niche,company,team_name,service,meta_metrics").eq("id", clientId).maybeSingle(),
    strategyId ? supabase.from("strategies").select("name").eq("id", strategyId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("strategy_pages").select("name,avatars,vsl_script,prod_url,official_domain,pages_copy").eq("id", funnelId).maybeSingle(),
  ]);

  const avatars = Array.isArray(page?.avatars) ? (page!.avatars as Record<string, unknown>[]) : [];
  const avatar = avatars.find((a) => str(a.id) === avatarId) || avatars.find((a) => str(a.name) && avatarId && str(a.name) === avatarId) || avatars[0] || null;
  const vslScript = str(page?.vsl_script);

  // Brief / personalidad del líder (fallback onboarding).
  const { data: briefRows } = await supabase.from("client_brain_docs")
    .select("doc_kind,text,char_count").eq("client_id", clientId).in("doc_kind", ["briefing", "onboarding"]).order("char_count", { ascending: false });
  const briefDoc = (briefRows || []).find((d) => d.doc_kind === "briefing") || (briefRows || []).find((d) => d.doc_kind === "onboarding");
  const briefText = clip(str(briefDoc?.text), 3000);

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
  let retrievalMeta: Record<string, unknown> = {};
  if (corpus) {
    try {
      const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
      const qTokens = norm(lastUser).split(" ").filter((w) => w.length > 3);
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
        return { id: str(r.id), score, tier, title: str(r.title) };
      }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
      let exPick = exScored.slice(0, 3);
      // Fallback: si nada matcheó por keywords, al menos traé ejemplos del mismo nicho.
      if (!exPick.length && nicheStr) {
        exPick = (Array.isArray(exList) ? exList : [])
          .filter((r) => { const rn = norm(str(r.niche)); return rn && (nicheStr.includes(rn) || rn.includes(nicheStr)); })
          .filter((r) => tierOf(r) !== "perdedor")
          .slice(0, 2).map((r) => ({ id: str(r.id), score: 1, tier: tierOf(r), title: str(r.title) }));
      }
      if (exPick.length) {
        const { data: full } = await supabase.from("marketing_ad_library").select("id,niche,title,content,metrics").in("id", exPick.map((s) => s.id));
        const byScore = (a: Record<string, unknown>, b: Record<string, unknown>) =>
          exPick.findIndex((p) => p.id === str(a.id)) - exPick.findIndex((p) => p.id === str(b.id));
        examplesText = (Array.isArray(full) ? full : []).sort(byScore).map((f) => {
          const m = (f.metrics || {}) as Record<string, unknown>;
          const veredicto = str(m.tier) && str(m.tier) !== "sin_datos"
            ? ` · Voomly: ${str(m.tier).toUpperCase()} (retención media ${str(m.p50)}%, llega al final ${str(m.p100)}%, ${str(m.uniq_plays)} plays)`
            : " · sin métricas suficientes";
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
  try {
    const { data: pipe } = await supabase.rpc("cerebro_pipeline_status", { p_client_id: clientId });
    const rows = Array.isArray(pipe) ? (pipe as Record<string, unknown>[]) : [];
    gate = myStage ? (rows.find((r) => str(r.funnel_id) === funnelId && str(r.stage) === myStage) || null) : null;
  } catch { gate = null; }
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
    mode === "generate"
      ? "En `notes`, en UNA línea: con qué titular te alineaste y si la alineación fue directa o indirecta."
      : "",
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

  const tipo = /producto/i.test(str(strat?.name)) ? "Producto" : (/reclut/i.test(str(strat?.name)) ? "Reclutamiento" : str(strat?.name) || "—");
  const volatileParts = [
    "===== CONTEXTO DE ESTA CONVERSACIÓN (usalo, no lo pidas) =====",
    `Cliente: ${str(client?.name)}${str(client?.company) ? ` · Empresa MLM: ${str(client?.company)}` : ""}${str(client?.niche) ? ` · Nicho: ${str(client?.niche)}` : ""}${str(client?.team_name) ? ` · Equipo: ${str(client?.team_name)}` : ""}`,
    `Estrategia: ${str(strat?.name) || "—"} (tipo: ${tipo})`,
    `Funnel: ${str(page?.name) || "—"}`,
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
    blueprintSectionsText ? `\n— SECCIONES DEL BLUEPRINT RELEVANTES A TU PEDIDO (el método Korex en detalle; el resumen ya lo tenés arriba) —\n${blueprintSectionsText}` : "",
    examplesText
      ? (subagentKey === "vsl"
        ? `\n— FICHAS DE VSL DE NICHO/AVATAR CERCANO (biblioteca Korex de 28 casos reales, con su veredicto de retención de Voomly) —\nCada ficha trae avatar, promesa, ángulo, mecanismo, cierre y estructura beat a beat. Clonás la ESTRUCTURA del más cercano, no las palabras. Si una ficha dice PERDEDOR, es lo que NO hay que repetir.\n${examplesText}`
        : `\n— EJEMPLOS DE ANUNCIOS DE NICHO SIMILAR (biblioteca Korex; usalos como referencia de estilo/estructura/ángulos, NO los copies literal) —\n${examplesText}`)
      : "",
    vslGuionText ? `\n— GUIÓN COMPLETO DEL CASO MÁS CERCANO (tu punto de partida: clonás su estructura y su ritmo, con el dolor y las cifras de ESTE avatar; jamás copiás sus frases ni sus números) —\n${vslGuionText}` : "",
    client?.meta_metrics ? `\n— SEÑAL DE MÉTRICAS —\n${clip(JSON.stringify(client.meta_metrics), 600)}` : "",
    gate ? `\n— ESTADO DEL PIPELINE (etapa ${myStage}) —\nEstado: ${str(gate.status)} · sub-estado: ${str(gate.substate) || "—"} · ${str(gate.detail)}` : "",
    gateBlockedHard
      ? (subagentKey === "vsl"
        ? "\n⚠️ GATE BLOQUEADO: este funnel todavía no tiene los avatares del DEL cargados. NO escribas el guión final: sin avatar no hay dolor, y sin dolor no hay VSL. Explicá que primero hay que cargar los avatares, y ofrecé ayudar con eso."
        : "\n⚠️ GATE BLOQUEADO: este funnel NO tiene el VSL listo. NO escribas anuncios finales. Explicá con claridad que primero hay que tener el VSL (guionado) y el avatar definido, y ofrecé ayudar a avanzar esos prerrequisitos.")
      : "",
  ].filter(Boolean).join("\n");

  // ── Modo GENERATE: salida estructurada, gateada por el candado ──
  if (mode === "generate" && gateBlocked) {
    const falta = subagentKey === "vsl"
      ? "Faltan los avatares del DEL en este funnel para escribir el guión."
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

  // ── Llamada a la API (una sola; a lo sumo 1 reintento ante 429/5xx). max_tokens acotado. ──
  const reqBody: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    // Agente interactivo: SIN "pensar interno" (adaptive thinking). En Sonnet 5 el thinking está
    // ON por defecto y se come el presupuesto de max_tokens → respuestas cortadas/vacías. Para copy
    // de anuncios no hace falta; así es rápido, barato y todo el presupuesto va a la respuesta.
    thinking: { type: "disabled" },
    system: [
      { type: "text", text: stableSystem, cache_control: { type: "ephemeral" } },
      { type: "text", text: volatileParts },
    ],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  const tool = subagentKey === "vsl" ? vslTool : adTool;
  if (mode === "generate") { reqBody.tools = [tool]; reqBody.tool_choice = { type: "tool", name: tool.name }; }
  if (!/sonnet-5|opus-4/i.test(model)) reqBody.temperature = mode === "generate" ? 0 : 0.6;

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
    try {
      apiRes = await callApi();
      if (apiRes.ok) break;
      lastErr = "http " + apiRes.status;
      if (apiRes.status !== 429 && apiRes.status < 500) break; // 4xx duro: no reintenta
    } catch (e) { lastErr = String((e as Error)?.message || e); }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1200));
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

  let reply = "";
  let adCopy: Record<string, unknown> | null = null;
  try {
    if (mode === "generate") {
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
