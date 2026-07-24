// supabase/functions/agent-run/index.ts
// El HOST genérico de la fábrica de agentes. Función NUEVA y separada de agent-chat:
// deployarla no toca a los 4 agentes vivos (nadie la invoca hasta que el frontend rutee
// un agente acá vía marketing_subagents.config.runtime = "agent-run").
//
// Qué hace el host y qué hace el módulo:
//   HOST   → auth, manifest, topes de gasto, capa de capacitación (general + especialista
//            + material del Cerebro), formato, cache, llamada a la API, línea de Fuentes,
//            api_usage. Igual para todos los agentes.
//   MÓDULO → SOLO su contexto: qué datos carga y cómo los presenta (agents/<key>.ts).
//
// Agente nuevo = 1 fila en marketing_subagents + 1 módulo + capacitación en el panel.
// El paso a paso completo: PLAYBOOK-AGENTES.md en la raíz del repo.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  SUPABASE_URL, SERVICE_KEY, cors, j, str, clip,
  sanitizeHistory, authRequest, loadRuntimeConfig, checkCaps,
  buildSystem, callAnthropic, computeUsage, lineaFuentes,
} from "../_shared/agent-runtime.ts";
import type { AgentModule } from "./agents/types.ts";
import analista from "./agents/analista.ts";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// El registro de módulos. Un agente nuevo se agrega ACÁ (una línea) y nada más del host cambia.
const MODULES: Record<string, AgentModule> = {
  analista,
};

const FN = "agent_run";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!(await authRequest(supabase, req))) return j({ ok: false, error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const subagentKey = str(body.subagent_key);
  const clientId = str(body.client_id);
  const strategyId = str(body.strategy_id);
  const funnelId = str(body.funnel_id);
  const avatarId = str(body.avatar_id);
  const mode = str(body.mode) === "generate" ? "generate" : "chat";
  const rawMsgs = Array.isArray(body.messages) ? (body.messages as Record<string, unknown>[]) : [];

  const mod = MODULES[subagentKey];
  if (!mod) return j({ ok: false, error: "unknown_agent", detail: `Este host no tiene el agente "${subagentKey}".` }, 400);

  // La fila del agente + la capa general. El manifest (config) viene de acá.
  const { data: saRows } = await supabase.from("marketing_subagents")
    .select("key,name,instructions,config").in("key", ["general", subagentKey]);
  const general = str((saRows || []).find((r) => r.key === "general")?.instructions);
  const specialist = (saRows || []).find((r) => r.key === subagentKey);
  if (!specialist) return j({ ok: false, error: "unknown_agent", detail: `No existe "${subagentKey}" en marketing_subagents (¿se aplicó la migración?).` }, 400);
  const manifest = (specialist.config as Record<string, unknown>) || {};
  // El manifest tiene que apuntar ACÁ. Si no, alguien está invocando por el host equivocado
  // (o el agente sigue siendo legacy de agent-chat) y responder igual escondería el error.
  if (str(manifest.runtime) !== "agent-run") {
    return j({ ok: false, error: "wrong_runtime", detail: `El agente "${subagentKey}" no está configurado para agent-run (config.runtime).` }, 400);
  }
  const specialistName = str(specialist?.name) || subagentKey;
  const specialistInstr = str(specialist?.instructions);

  // Nivel de contexto: "funnel" exige funnel; "cliente" corre antes de que exista uno.
  const nivel = str(manifest.nivel) || mod.nivel;
  if (!clientId || (nivel === "funnel" && !funnelId)) {
    return j({ ok: false, error: "missing_params", detail: "Faltan client_id o funnel_id." }, 400);
  }

  const messages = sanitizeHistory(rawMsgs);
  if (!messages.length) return j({ ok: false, error: "no_messages", detail: "No hay mensaje para responder." }, 400);

  // Config (modelo, max_tokens, topes, precio) — el modelo por agente sigue viviendo en
  // app_settings.api_config.chat_models[key], igual que los agentes legacy.
  const rc = await loadRuntimeConfig(supabase, subagentKey, mode, manifest);
  if ("error" in rc) return rc.error;

  const capped = await checkCaps(supabase, {
    fn: FN, model: rc.model, clientId, funnelId, subagentKey, mode,
    dailyCap: rc.dailyCap, monthlyCap: rc.monthlyCap,
  });
  if (capped) return capped;

  // ── Capa de capacitación (estable → se cachea) ──
  // Idéntica a agent-chat: general (ADN Korex) + especialista + material del Cerebro.
  const { data: matRows } = await supabase.from("marketing_training_material")
    .select("kind,title,content,url").eq("scope", subagentKey).order("position", { ascending: true }).limit(10);
  const material = (matRows || []).map((m) => {
    const head = `[${str(m.kind) || "material"}] ${str(m.title) || ""}`.trim();
    const bodyTxt = str(m.content) ? clip(str(m.content), 2500) : (str(m.url) ? `Link: ${str(m.url)}` : "");
    return bodyTxt ? `${head}\n${bodyTxt}` : head;
  }).filter(Boolean).join("\n\n");

  // El formato es contrato con el frontend (AgentMarkdown.jsx pinta markdown), no criterio
  // de marketing: por eso vive en el módulo (código) y no en las instrucciones editables.
  const formatoBlock = [
    "\n\n===== CÓMO SE VE TU RESPUESTA (formato) =====",
    "El panel renderiza markdown de verdad: lo que escribas se muestra con estilo. Escribí para que se lea de un vistazo, no como un muro de texto.",
    "",
    "Reglas para todos:",
    "- `##` para cada bloque grande y `###` para subtítulos. `#` solo si necesitás un título único arriba de todo.",
    "- `**negrita**` para lo que el ojo tiene que encontrar primero. Nunca subrayes con guiones ni uses MAYÚSCULAS para destacar.",
    "- Listas con `-` para enumerar; listas `1.` cuando el orden importa (se numeran con un badge).",
    "- Tablas markdown cuando compares 2+ opciones. Son mucho más legibles que un párrafo.",
    "- `> cita` para palabras textuales (del avatar, de un lead, de un guión).",
    "- `---` para separar bloques cuando la respuesta es larga.",
    "- Nada de HTML: solo markdown. Y nada de emojis decorativos: como mucho uno funcional.",
    "- Si la respuesta es corta (una pregunta puntual), contestá en prosa directa. El formato es para estructurar, no para inflar.",
    "",
    `Propio de ${specialistName}:`,
    mod.formato || "- Estructurá con `##` por tema y `**negrita**` en lo importante.",
  ].join("\n");

  const stableSystem = [
    general || "# Método Korex — (capa general no configurada)",
    `\n\n===== ESPECIALISTA: ${specialistName} =====\n`,
    specialistInstr || "(sin instrucciones del especialista)",
    material ? `\n\n===== MATERIAL DE CAPACITACIÓN (${specialistName}) =====\n${material}` : "",
    formatoBlock,
  ].join("");

  // ── El contexto del agente: lo arma su módulo ──
  const ctx = await mod.buildContext({ supabase, clientId, strategyId, funnelId, avatarId, mode, messages, manifest });

  // ── Llamada a la API (una sola; el runtime pone thinking off y el retry acotado) ──
  const reqBody: Record<string, unknown> = {
    model: rc.model,
    max_tokens: rc.maxTokens,
    system: buildSystem(stableSystem, ctx.estable, ctx.recuperado),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  // La herramienta va SOLO en modo generate: dejarla visible al chatear hace que el modelo
  // difiera el contenido a una tool que no puede llamar y corte el turno vacío (lección
  // aprendida en agent-chat). La correctitud manda sobre el cache.
  if (mod.tool && mode === "generate") {
    reqBody.tools = [mod.tool];
    reqBody.tool_choice = { type: "tool", name: mod.tool.name };
    reqBody.temperature = 0;
  }

  const { res: apiRes, lastErr } = await callAnthropic(rc.apiKey, reqBody);
  if (!apiRes || !apiRes.ok) {
    let detail = lastErr;
    try { detail = (await apiRes?.text()) || lastErr; } catch { /* nada */ }
    await supabase.from("api_usage").insert({ fn: FN, model: rc.model, status: "error", client_id: clientId, funnel_id: funnelId, error: clip(detail, 500), meta: { subagent_key: subagentKey, mode } });
    return j({ ok: false, error: "api_error", detail: clip(detail, 400) }, 502);
  }

  const data = await apiRes.json();
  const u = computeUsage(data, rc.price);

  let reply = "";
  let emitted: Record<string, unknown> | null = null;
  try {
    if (mode === "generate" && mod.tool) {
      const block = (data.content || []).find((c: Record<string, unknown>) => c.type === "tool_use" && c.name === mod.tool!.name);
      emitted = (block?.input as Record<string, unknown>) || null;
    } else {
      reply = (data.content || []).filter((c: Record<string, unknown>) => c.type === "text").map((c: Record<string, unknown>) => str(c.text)).join("\n").trim();
    }
  } catch { /* nada */ }

  // Red de seguridad: si quedó vacío por tope de tokens, avisamos claro en vez de "(sin respuesta)".
  if (!reply && !emitted && u.stopReason === "max_tokens") {
    reply = "(La respuesta se cortó por el límite de longitud. Pedímelo en partes o más corto, o suban el tope de respuesta en Administración.)";
  }

  // Las fuentes van también cuando la respuesta se cortó: ahí es cuando más importa saber
  // sobre qué estaba trabajando.
  const fuentesLine = lineaFuentes(ctx.fuentes);
  if (reply && fuentesLine) reply = fuentesLine + reply;

  await supabase.from("api_usage").insert({
    fn: FN, model: rc.model, input_tokens: u.inTok, output_tokens: u.outTok, cost_usd: u.cost,
    client_id: clientId, funnel_id: funnelId, status: "ok",
    meta: {
      subagent_key: subagentKey, mode, avatar_id: avatarId, turns: messages.length, stop: u.stopReason,
      retrieval: ctx.meta && Object.keys(ctx.meta).length ? ctx.meta : undefined,
      cache_read_tokens: u.cacheReadTok, cache_write_tokens: u.cacheWriteTok, fresh_tokens: u.freshTok,
    },
  });

  // Misma forma de respuesta que agent-chat, para que AgentChat.jsx funcione sin cambios
  // cuando el ruteo por config.runtime se cablee (go-live).
  return j({
    ok: true, mode, reply, gate: null, cost_usd: u.cost,
    ad_copy: emitted, vsl_script: null,
    tokens: { in: u.inTok, out: u.outTok, cache_read: u.cacheReadTok, cache_write: u.cacheWriteTok },
    stop_reason: u.stopReason,
  });
});
