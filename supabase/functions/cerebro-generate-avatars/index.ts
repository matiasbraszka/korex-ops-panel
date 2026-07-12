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

interface RawAvatar { name?: string; audience?: string; spec_section?: string; spec_start?: string; spec_end?: string; ad_sections?: string[]; }

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
  const mode = str(body.mode) === "replace" ? "replace" : "append";
  if (!clientId || !funnelId) return j({ ok: false, error: "missing_params" }, 400);

  // Config + secreto.
  const { data: keyRow } = await supabase.from("secure_config").select("value").eq("key", "anthropic_api_key").maybeSingle();
  const apiKey = str(keyRow?.value);
  if (!apiKey) return j({ ok: false, error: "missing_api_key" }, 500);
  const { data: cfgRow } = await supabase.from("app_settings").select("value").eq("key", "api_config").maybeSingle();
  const cfg = (cfgRow?.value as Record<string, unknown>) ?? {};
  const model = str(cfg.avatar_model) || "claude-haiku-4-5-20251001";
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
      await supabase.from("api_usage").insert({ fn: "generate_avatars", model, status: "blocked", client_id: clientId, funnel_id: funnelId, error: "tope diario", meta: { todayCost, dailyCap } });
      return j({ ok: false, error: "daily_cap", detail: `Se alcanzó el tope de gasto diario (US$${dailyCap}). Se reinicia mañana o subilo en Administración.` }, 429);
    }
    if (monthCost >= monthlyCap) {
      await supabase.from("api_usage").insert({ fn: "generate_avatars", model, status: "blocked", client_id: clientId, funnel_id: funnelId, error: "tope mensual", meta: { monthCost, monthlyCap } });
      return j({ ok: false, error: "monthly_cap", detail: `Se alcanzó el tope de gasto mensual (US$${monthlyCap}).` }, 429);
    }
  } catch { /* si falla el chequeo, seguimos (el max_tokens acota igual) */ }

  // DEL de la estrategia.
  let delQ = supabase.from("client_brain_docs").select("text").eq("client_id", clientId).eq("doc_kind", "del");
  if (strategyId) delQ = delQ.eq("strategy_id", strategyId);
  const { data: delRows } = await delQ.limit(1);
  const delText = str((delRows && delRows[0]?.text) || "").slice(0, 200000); // cota de seguridad
  if (!delText) return j({ ok: false, error: "no_del", detail: "No hay DEL sincronizado para esta estrategia. Tocá “Sincronizar contexto” primero." }, 400);

  const tabs = parseDelTabs(delText);
  const sectionTitles = Object.keys(tabs);

  // Avatares actuales (para no duplicar en append).
  const { data: pageRow } = await supabase.from("strategy_pages").select("avatars, vsl_script").eq("id", funnelId).maybeSingle();
  const currentAvatars = Array.isArray(pageRow?.avatars) ? pageRow!.avatars : [];
  const currentNames = currentAvatars.map((a: Record<string, unknown>) => norm(str(a?.name)));

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
              name: { type: "string", description: "Título corto del avatar, lo MÁS PARECIDO a como aparece en el DEL (ej. 'AVATAR 1 - Emprendedores'). No inventar." },
              audience: { type: "string", description: "Segmentación (edad, sexo, ubicación, intereses) de ESTE avatar. Del DEL si está; si no, resumida en 1 línea." },
              spec_section: { type: "string", description: "Título EXACTO de la sección del DEL que contiene la DESCRIPCIÓN (dolores/deseos/miedos/perfil) de ESTE avatar (ej. 'Avatares'). NUNCA la landing. '' si no hay." },
              spec_start: { type: "string", description: "Las primeras ~12 palabras EXACTAS (copiadas del DEL, con tildes/mayúsculas) donde EMPIEZA el fragmento de ESTE avatar/subavatar dentro de esa sección. Incluí algún dato único (ej. 'AVATAR 2' o 'SUBAVATAR 3') para no confundir con otro." },
              spec_end: { type: "string", description: "Las últimas ~12 palabras EXACTAS donde TERMINA el fragmento de ESTE avatar (justo antes de que empiece el del siguiente avatar)." },
              ad_sections: { type: "array", items: { type: "string" }, description: "Títulos EXACTOS de las secciones con los ANUNCIOS de ESTE avatar (ej. 'Ads avatar 1'). Mapear por significado." },
            },
            required: ["name", "audience", "spec_section", "ad_sections"],
          },
        },
        vsl_section: { type: "string", description: "Título EXACTO de la sección del GUIÓN de VSL (el video) que corresponde a ESTE funnel/avatar (ej. 'VSL Avatar 1'). El VSL suele decir al principio a qué avatar va. NO la 'Landing Page VSL'. '' si no hay o si es compartida y no se sabe." },
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
    "FRAGMENTO EXACTO (clave): la sección de descripción (ej. 'Avatares') suele traer VARIOS avatares uno tras otro. NO devuelvas la hoja entera.",
    "Para cada avatar indicá spec_section + spec_start (primeras ~12 palabras EXACTAS donde arranca SU parte, incluyendo algo único como 'AVATAR 2') + spec_end (últimas ~12 palabras EXACTAS donde termina SU parte, antes del siguiente avatar). El sistema corta ese pedazo TAL CUAL. Copiá las palabras EXACTAS del DEL (con tildes y mayúsculas).",
    "",
    "SUBAVATARES (IMPORTANTE): si el avatar de este funnel tiene SUB-AVATARES o variantes explícitas (ej. 'SUBAVATAR 1 — 35 a 54 años · …', 'SUBAVATAR 2 — …', o variantes por perfil/edad), devolvé UN AVATAR POR CADA SUBAVATAR (no lo colapses en uno solo). Para cada subavatar: name que lo distinga (ej. 'AVATAR 1 · Subavatar 1 — 35-54'); audience = su segmentación específica; spec_start/spec_end = el fragmento ESPECÍFICO de ESE subavatar (desde su encabezado 'SUBAVATAR N …' hasta justo antes del siguiente subavatar). Los ad_sections y vsl_section suelen ser los mismos del avatar padre.",
    "",
    "VSL: elegí en vsl_section la sección del guión de VSL (el video) que va con el avatar de ESTE funnel (ej. 'VSL Avatar 1'). El guión suele decir al principio a qué avatar apunta. Distintos funnels casi siempre tienen VSL distinta. NO uses la 'Landing Page VSL'.",
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

  async function callApi(): Promise<Response> {
    // temperature está deprecado en los modelos nuevos (sonnet-5 / opus-4); lo mandamos
    // solo para los que lo aceptan (haiku / sonnet-4). El tool_choice ya fuerza la salida.
    const reqBody: Record<string, unknown> = {
      model, max_tokens: 4096,
      tools: [tool], tool_choice: { type: "tool", name: "emit_avatars" },
      messages: [{ role: "user", content: prompt }],
    };
    if (!/sonnet-5|opus-4/i.test(model)) reqBody.temperature = 0;
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
    await supabase.from("api_usage").insert({ fn: "generate_avatars", model, status: "error", client_id: clientId, funnel_id: funnelId, error: lastErr });
    return j({ ok: false, error: "api_error", detail: lastErr }, 502);
  }

  const data = await apiRes.json();
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

  // Resolver a avatares del panel: descripción = fragmento EXACTO (verbatim); anuncios = secciones.
  const built = raw.map((a) => {
    const secContent = sectionContent(tabs, str(a.spec_section), LANDING_RE); // spec nunca de landing/vsl
    const spec = sliceFragment(secContent, str(a.spec_start), str(a.spec_end));
    const ad = pullSections(tabs, a.ad_sections || [], LANDING_RE);
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

  // VSL que corresponde a ESTE funnel (verbatim de "VSL Avatar N", nunca la landing de la VSL).
  const vslScript = vslSection ? sectionContent(tabs, vslSection, VSL_BLOCK) : "";

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
    meta: { mode, funnel_name: funnelName, detected: built.length, total: finalAvatars.length, vsl: !!vslScript, names: built.map((a) => a.name) },
  });
  if (uErr) return j({ ok: false, error: "write_error", detail: String(uErr.message), cost_usd: cost }, 500);

  return j({ ok: true, avatars: finalAvatars, detected: built.length, vsl_set: !!vslScript, mode, cost_usd: cost, tokens: { in: inTok, out: outTok } });
});
