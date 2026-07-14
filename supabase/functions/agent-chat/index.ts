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
  const maxTokens = Number(mode === "generate" ? (cfg.chat_generate_max_tokens ?? 4096) : (cfg.chat_max_tokens ?? 1800));
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

  // Blueprint maestro de anuncios (método fijo, se cachea con el resto de lo estable).
  let blueprint = "";
  if (subagentKey === "anuncios") {
    const { data: bpRow } = await supabase.from("marketing_ad_library").select("content").eq("id", "mal_blueprint").maybeSingle();
    blueprint = clip(str(bpRow?.content), 16000);
  }

  const stableSystem = [
    general || "# Método Korex — (capa general no configurada)",
    `\n\n===== ESPECIALISTA: ${specialistName} =====\n`,
    specialistInstr || "(sin instrucciones del especialista)",
    blueprint ? `\n\n===== BLUEPRINT MAESTRO DE ANUNCIOS (el método, seguilo) =====\n${blueprint}` : "",
    material ? `\n\n===== MATERIAL DE CAPACITACIÓN (${specialistName}) =====\n${material}` : "",
  ].join("");

  // ── Contexto del cliente / funnel / avatar (volátil → NO se cachea) ──
  const [{ data: client }, { data: strat }, { data: page }] = await Promise.all([
    supabase.from("clients").select("name,niche,company,team_name,service,meta_metrics").eq("id", clientId).maybeSingle(),
    strategyId ? supabase.from("strategies").select("name").eq("id", strategyId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("strategy_pages").select("name,avatars,vsl_script,prod_url,official_domain").eq("id", funnelId).maybeSingle(),
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

  // Ejemplos de anuncios del MISMO nicho (o parecido) — biblioteca Korex (marketing_ad_library).
  // Traemos SOLO los del nicho del cliente (matcheo por niche + niche_tags), nunca las 200 páginas.
  let examplesText = "";
  if (subagentKey === "anuncios") {
    try {
      const nicheStr = norm(str(client?.niche));
      const cTokens = nicheStr.split(" ").filter((w) => w.length > 3);
      const { data: exList } = await supabase.from("marketing_ad_library").select("id,niche,niche_tags,title").eq("part", "example");
      const scored = (Array.isArray(exList) ? exList : []).map((r) => {
        const rowNiche = norm(str(r.niche));
        const hay = norm([str(r.niche), ...(Array.isArray(r.niche_tags) ? r.niche_tags : [])].join(" "));
        let score = 0;
        if (nicheStr && hay.includes(nicheStr)) score += 3;                 // el nicho del cliente aparece en los tags
        if (rowNiche && nicheStr && nicheStr.includes(rowNiche)) score += 3; // el nicho de la fila aparece en el del cliente
        for (const t of cTokens) if (hay.includes(t)) score += 1;           // solape de palabras
        return { id: str(r.id), title: str(r.title) || str(r.niche), score };
      }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 2);
      if (scored.length) {
        const { data: full } = await supabase.from("marketing_ad_library").select("niche,title,content").in("id", scored.map((s) => s.id));
        examplesText = (Array.isArray(full) ? full : []).map((f) => `— ${str(f.title) || str(f.niche)} —\n${clip(str(f.content), 6000)}`).join("\n\n");
      }
    } catch { examplesText = ""; }
  }

  // Gate del pipeline (autoridad server-side).
  let gate: Record<string, unknown> | null = null;
  try {
    const { data: pipe } = await supabase.rpc("cerebro_pipeline_status", { p_client_id: clientId });
    const rows = Array.isArray(pipe) ? (pipe as Record<string, unknown>[]) : [];
    gate = rows.find((r) => str(r.funnel_id) === funnelId && str(r.stage) === "anuncios") || null;
  } catch { gate = null; }
  const gateBlocked = gate ? str(gate.status) === "bloqueado" || gate.can_generate === false : false;
  const gateBlockedHard = gate ? str(gate.status) === "bloqueado" : false;

  const tipo = /producto/i.test(str(strat?.name)) ? "Producto" : (/reclut/i.test(str(strat?.name)) ? "Reclutamiento" : str(strat?.name) || "—");
  const volatileParts = [
    "===== CONTEXTO DE ESTA CONVERSACIÓN (usalo, no lo pidas) =====",
    `Cliente: ${str(client?.name)}${str(client?.company) ? ` · Empresa MLM: ${str(client?.company)}` : ""}${str(client?.niche) ? ` · Nicho: ${str(client?.niche)}` : ""}${str(client?.team_name) ? ` · Equipo: ${str(client?.team_name)}` : ""}`,
    `Estrategia: ${str(strat?.name) || "—"} (tipo: ${tipo})`,
    `Funnel: ${str(page?.name) || "—"}`,
    avatar ? `\n— AVATAR SELECCIONADO —\nNombre: ${str(avatar.name)}\nSegmentación: ${str(avatar.audience) || "—"}\nDescripción (del DEL): ${clip(str(avatar.spec_text), 4000) || "—"}${str(avatar.ad_script) ? `\nCopys de anuncios ya existentes (del DEL, para partir de acá y no repetir): ${clip(str(avatar.ad_script), 4000)}` : ""}` : "\n— AVATAR: (ninguno seleccionado o cargado) —",
    `\n— GUIÓN DEL VSL DEL FUNNEL (el anuncio SALE de acá) —\n${vslScript ? clip(vslScript, 5000) : "(sin guión de VSL cargado)"}`,
    briefText ? `\n— BRIEF / PERSONALIDAD DEL LÍDER —\n${briefText}` : "",
    winners ? `\n— ANUNCIOS GANADORES DE ESTE CLIENTE (piso, no techo: proponé ÁNGULOS NUEVOS) —\n${winners}` : "\n— (Aún no hay anuncios ganadores cargados para este cliente) —",
    examplesText ? `\n— EJEMPLOS DE ANUNCIOS DE NICHO SIMILAR (biblioteca Korex; usalos como referencia de estilo/estructura/ángulos, NO los copies literal) —\n${examplesText}` : "",
    client?.meta_metrics ? `\n— SEÑAL DE MÉTRICAS —\n${clip(JSON.stringify(client.meta_metrics), 600)}` : "",
    gate ? `\n— ESTADO DEL PIPELINE (etapa anuncios) —\nEstado: ${str(gate.status)} · sub-estado: ${str(gate.substate) || "—"} · ${str(gate.detail)}` : "",
    gateBlockedHard
      ? "\n⚠️ GATE BLOQUEADO: este funnel NO tiene el VSL listo. NO escribas anuncios finales. Explicá con claridad que primero hay que tener el VSL (guionado) y el avatar definido, y ofrecé ayudar a avanzar esos prerrequisitos."
      : "",
  ].filter(Boolean).join("\n");

  // ── Modo GENERATE: salida estructurada, gateada por el candado ──
  if (mode === "generate" && gateBlocked) {
    return j({ ok: false, error: "gate_blocked", detail: str(gate?.detail) || "Falta el VSL de este funnel para generar anuncios.", gate }, 200);
  }

  const tool = {
    name: "emit_ad_copy",
    description: "Devuelve una tanda de anuncios de Meta listos para revisar y guardar.",
    input_schema: {
      type: "object",
      properties: {
        ads: {
          type: "array",
          items: {
            type: "object",
            properties: {
              angle: { type: "string", description: "El ángulo / gran idea del anuncio. Uno distinto por anuncio." },
              hook: { type: "string", description: "Gancho: la primera línea que frena el scroll, en la voz del avatar." },
              primary_text: { type: "string", description: "Texto principal (cuerpo) del anuncio de Meta." },
              headline: { type: "string", description: "Titular corto, debajo del creativo." },
              description: { type: "string", description: "Descripción/línea de apoyo (opcional)." },
              creative_note: { type: "string", description: "Nota creativa: formato/visual sugerido y segmentación si aplica." },
            },
            required: ["angle", "hook", "primary_text", "headline"],
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
    system: [
      { type: "text", text: stableSystem, cache_control: { type: "ephemeral" } },
      { type: "text", text: volatileParts },
    ],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (mode === "generate") { reqBody.tools = [tool]; reqBody.tool_choice = { type: "tool", name: "emit_ad_copy" }; }
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
  const inTok = Number(usage.input_tokens || 0) + Number(usage.cache_read_input_tokens || 0) + Number(usage.cache_creation_input_tokens || 0);
  const outTok = Number(usage.output_tokens || 0);
  const cost = Number(((inTok / 1e6) * price.in + (outTok / 1e6) * price.out).toFixed(6));

  let reply = "";
  let adCopy: Record<string, unknown> | null = null;
  try {
    if (mode === "generate") {
      const block = (data.content || []).find((c: Record<string, unknown>) => c.type === "tool_use" && c.name === "emit_ad_copy");
      adCopy = (block?.input as Record<string, unknown>) || null;
    } else {
      reply = (data.content || []).filter((c: Record<string, unknown>) => c.type === "text").map((c: Record<string, unknown>) => str(c.text)).join("\n").trim();
    }
  } catch { /* nada */ }

  await supabase.from("api_usage").insert({
    fn: "agent_chat", model, input_tokens: inTok, output_tokens: outTok, cost_usd: cost,
    client_id: clientId, funnel_id: funnelId, status: "ok",
    meta: { subagent_key: subagentKey, mode, avatar_id: avatarId, turns: messages.length, ads: adCopy ? (Array.isArray(adCopy.ads) ? adCopy.ads.length : 0) : undefined },
  });

  return j({ ok: true, mode, reply, ad_copy: adCopy, gate, cost_usd: cost, tokens: { in: inTok, out: outTok } });
});
