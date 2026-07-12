// supabase/functions/cerebro-generate-avatars/index.ts
// Genera los avatares de un funnel LEYENDO el DEL con la API de Anthropic (Sonnet/Haiku).
// A PEDIDO (botón del panel), 100% sincrónico. NADA corre en segundo plano.
//
// Reglas anti-fuga (fundamentales):
//   - Solo usuario logueado del panel O el cron_secret interno del equipo. Nada anónimo/público.
//   - UNA sola llamada a la API por invocación (a lo sumo 1 reintento ante 429/5xx). Sin loops.
//   - Tope de gasto DIARIO y MENSUAL (config): si se superó, NO llama y avisa.
//   - max_tokens acotado + timeout. Cada llamada se registra en api_usage (modelo, tokens, costo).
//
// Fidelidad al DEL: la IA solo IDENTIFICA los avatares y señala QUÉ sección del DEL tiene
// la descripción / los anuncios de cada uno. El TEXTO lo copia el código TAL CUAL (verbatim).
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

// Secciones de la LANDING (NO son la descripción del avatar): pre-landing, landing,
// formulario, thank you page, testimonios, feedback, VSL. Candado: nunca se copian a
// la descripción del avatar aunque la IA las señale por error.
const LANDING_RE = /pre\s*-?\s*landing|\blanding\b|formul|thank\s*you|thankyou|p[aá]gina\s+de\s+gracias|testimon|feedback|\bvsl\b/i;
const SPEC_MISSING = "— No se encontró la descripción de este avatar en el DEL —";

// Copia VERBATIM el contenido de las secciones pedidas (match exacto o aproximado por
// título). Si se pasa blockRe, ignora las secciones que matcheen (ej. las de la landing).
function pullSections(tabs: Record<string, string>, titles: string[], blockRe?: RegExp): string {
  const keys = Object.keys(tabs);
  const out: { k: string; c: string }[] = [];
  for (const t of (titles || [])) {
    if (blockRe && blockRe.test(t)) continue;             // el título pedido es de la landing → fuera
    const nt = norm(t);
    if (!nt) continue;
    let k = keys.find((k) => norm(k) === nt);
    if (!k) k = keys.find((k) => norm(k).includes(nt) || nt.includes(norm(k)));
    if (k && blockRe && blockRe.test(k)) continue;         // la sección matcheada es de la landing → fuera
    if (k && !out.some((o) => o.k === k)) out.push({ k, c: tabs[k] });
  }
  return out.map((o) => `— ${o.k} —\n${o.c}`).join("\n\n");
}

interface RawAvatar { name?: string; audience?: string; spec_sections?: string[]; ad_sections?: string[]; spec_text_inline?: string; ad_text_inline?: string; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Auth: usuario logueado del panel O el cron_secret interno (uso interno / pruebas).
  // Ninguna de las dos deja que "algo" corra solo: siempre hay un llamado explícito.
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
  const { data: pageRow } = await supabase.from("strategy_pages").select("avatars").eq("id", funnelId).maybeSingle();
  const currentAvatars = Array.isArray(pageRow?.avatars) ? pageRow!.avatars : [];
  const currentNames = currentAvatars.map((a: Record<string, unknown>) => norm(str(a?.name)));

  // ── Llamada a la API (una sola; a lo sumo 1 reintento ante 429/5xx). max_tokens acotado. ──
  const tool = {
    name: "emit_avatars",
    description: "Devuelve los avatares detectados en el DEL.",
    input_schema: {
      type: "object",
      properties: {
        avatars: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Título corto del avatar, lo MÁS PARECIDO a como aparece en el DEL (ej. 'AVATAR 1 - Mujeres', 'Financiero'). No inventar." },
              audience: { type: "string", description: "Segmentación (edad, sexo, ubicación, intereses). Del DEL si está; si no, resumida en 1 línea." },
              spec_sections: { type: "array", items: { type: "string" }, description: "Títulos EXACTOS de secciones del DEL con la DESCRIPCIÓN de este avatar. Vacío si no hay." },
              ad_sections: { type: "array", items: { type: "string" }, description: "Títulos EXACTOS de secciones del DEL con los ANUNCIOS/COPYS de este avatar. Mapear por significado." },
              spec_text_inline: { type: "string", description: "Solo si la descripción NO está bajo una sección =====: texto TAL CUAL. Si usaste spec_sections, dejá ''." },
              ad_text_inline: { type: "string", description: "Solo si los anuncios NO están bajo una sección: texto TAL CUAL. Si usaste ad_sections, dejá ''." },
            },
            required: ["name", "audience", "spec_sections", "ad_sections"],
          },
        },
      },
      required: ["avatars"],
    },
  };
  const prompt = [
    "Sos el extractor de avatares del cerebro de Método Korex. Te paso el DEL (documento maestro) de una estrategia.",
    "Identificá los AVATARES (perfiles de público) y devolvelos con la tool emit_avatars.",
    "",
    "REGLAS:",
    "- El título (name) debe ser lo MÁS PARECIDO posible a como aparece en el DEL (ej. 'AVATAR 1 - Mujeres'). No inventes.",
    "- Para la descripción y los anuncios NO reescribas: indicá los TÍTULOS de las secciones del DEL que los contienen (spec_sections / ad_sections). El sistema copiará ese texto TAL CUAL.",
    "- Mapeá los anuncios por SIGNIFICADO (ej. 'ANUNCIOS MUJERES' es del avatar Mujeres; 'anuncios avatar 2' es del avatar 2).",
    "- IMPORTANTÍSIMO: las secciones de la LANDING (Pre-landing, Landing, LANDING VSL, Formulario, Thank You Page, Testimonios, Feedback, VSL) NO son la descripción del avatar. NUNCA las pongas en spec_sections.",
    "- La DESCRIPCIÓN del avatar (spec_sections) es la sección que describe sus DOLORES, DESEOS y perfil (ej. 'AVATAR', 'plan de segmentación', 'Avatar 1 - …'). Si NO existe una sección así para ese avatar, dejá spec_sections vacío Y spec_text_inline vacío (el sistema pondrá 'no encontrada').",
    "- Solo si los ANUNCIOS no están bajo una sección '===== Título =====', usá ad_text_inline con el texto EXACTO.",
    "",
    "Secciones disponibles en el DEL (usá estos títulos EXACTOS):",
    sectionTitles.length ? sectionTitles.map((t) => `- ${t}`).join("\n") : "(el DEL no usa marcadores de sección; usá los campos _inline)",
    "",
    mode === "append" && currentNames.length ? `Avatares que YA existen (no los repitas): ${currentAvatars.map((a: Record<string, unknown>) => str(a?.name)).join(", ")}` : "",
    "",
    "DEL:",
    delText,
  ].join("\n");

  async function callApi(): Promise<Response> {
    return await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model, max_tokens: 4096, temperature: 0,
        tools: [tool], tool_choice: { type: "tool", name: "emit_avatars" },
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(90000),
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
  try {
    const block = (data.content || []).find((c: Record<string, unknown>) => c.type === "tool_use" && c.name === "emit_avatars");
    raw = (block?.input?.avatars as RawAvatar[]) || [];
  } catch { raw = []; }

  // Resolver a avatares del panel, copiando el texto VERBATIM del DEL.
  const built = raw.map((a) => {
    // Descripción: nunca de la landing (candado LANDING_RE). Si no hay, texto de "no encontrada".
    const specFromSections = pullSections(tabs, a.spec_sections || [], LANDING_RE);
    const adFromSections = pullSections(tabs, a.ad_sections || [], LANDING_RE);
    return {
      id: rid(),
      name: str(a.name),
      audience: str(a.audience),
      spec_text: specFromSections || str(a.spec_text_inline) || SPEC_MISSING,
      ad_script: adFromSections || str(a.ad_text_inline) || "",
      status: "En grabación",
      ad_url: "",
    };
  }).filter((a) => a.name);

  // Merge según modo.
  let finalAvatars;
  if (mode === "replace") {
    finalAvatars = built;
  } else {
    const nuevos = built.filter((a) => !currentNames.includes(norm(a.name)));
    finalAvatars = [...currentAvatars, ...nuevos];
  }

  const { error: uErr } = await supabase.from("strategy_pages")
    .update({ avatars: finalAvatars, updated_at: new Date().toISOString() }).eq("id", funnelId);

  // Registrar el gasto SIEMPRE (aunque la escritura falle, la API ya se usó).
  await supabase.from("api_usage").insert({
    fn: "generate_avatars", model, input_tokens: inTok, output_tokens: outTok, cost_usd: cost,
    client_id: clientId, funnel_id: funnelId, status: uErr ? "error" : "ok",
    error: uErr ? String(uErr.message) : null,
    meta: { mode, detected: built.length, total: finalAvatars.length, names: built.map((a) => a.name) },
  });
  if (uErr) return j({ ok: false, error: "write_error", detail: String(uErr.message), cost_usd: cost }, 500);

  return j({ ok: true, avatars: finalAvatars, detected: built.length, mode, cost_usd: cost, tokens: { in: inTok, out: outTok } });
});
