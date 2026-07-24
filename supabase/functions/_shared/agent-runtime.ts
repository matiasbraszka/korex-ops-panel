// supabase/functions/_shared/agent-runtime.ts
// El runtime compartido de la FÁBRICA DE AGENTES. Acá vive el boilerplate que todo agente
// hereda gratis: auth, topes de gasto, contabilidad de api_usage, saneo del historial,
// la llamada a Anthropic (thinking off, retry acotado), los breakpoints de cache y la
// línea de Fuentes. Todo esto es EXTRACCIÓN POR COPIA de agent-chat/index.ts, que sigue
// self-contained e intacto: los 4 agentes vivos no dependen de este archivo.
//
// Reglas anti-fuga (las mismas de agent-chat, ahora heredables):
//   - Solo usuario logueado del panel O el cron_secret interno. Nada anónimo/público.
//   - UNA sola llamada a la API por invocación (a lo sumo 1 reintento ante 429/5xx). Sin loops.
//   - Tope de gasto DIARIO y MENSUAL: si se superó, NO llama y avisa.
//   - max_tokens acotado + timeout. Cada turno se registra en api_usage.
//
// Un agente nuevo NO usa este archivo directamente: implementa la interfaz AgentModule
// (ver agent-run/index.ts) y el host se ocupa del resto.

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

export function str(v: unknown) { return v === null || v === undefined ? "" : String(v).trim(); }
export function clip(s: string, n: number) { const t = str(s); return t.length > n ? t.slice(0, n) + "\n…[recortado]" : t; }
export function norm(s: string) { return str(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim(); }

export type Msg = { role: string; content: string };

// ── La línea de Fuentes, generalizada ────────────────────────────────────────
// La calcula el CÓDIGO, nunca el modelo: si le pedís al modelo que declare sus fuentes,
// declara las que cree que usó, y justo lo que hay que detectar es cuando NO leyó.
//   ok      → lo leyó entero                        (✓)
//   parcial → material principal leído a medias      (⚠ + detalle)
//   viejo   → el dato existe pero está desactualizado (⚠ + detalle)
//   vacio   → el archivo/tabla está pero sin contenido útil (⚠ + detalle)
//   falta   → no existe. El más importante de todos   (✗ + detalle)
export type Fuente = { rotulo: string; estado: "ok" | "parcial" | "viejo" | "vacio" | "falta"; detalle?: string };

export function lineaFuentes(fuentes: Fuente[]): string {
  if (!fuentes.length) return "";
  const partes = fuentes.map((f) => {
    const d = str(f.detalle);
    if (f.estado === "ok") return `${f.rotulo} ✓${d ? ` ${d}` : ""}`;
    if (f.estado === "falta") return `${f.rotulo} ✗${d ? ` ${d}` : " no hay"}`;
    return `${f.rotulo} ⚠${d ? ` ${d}` : ""}`;
  });
  return `**Fuentes** · ${partes.join(" · ")}\n\n`;
}

// ── Saneo del historial ──────────────────────────────────────────────────────
// Últimos 12 turnos, roles válidos, contenido acotado. Y el fix del chat largo: la API
// exige que el PRIMER mensaje sea del usuario; slice() corta por cantidad, no por rol,
// así que del turno 7 en adelante la ventana arrancaba en una respuesta del agente → 400.
export function sanitizeHistory(rawMsgs: Record<string, unknown>[]): Msg[] {
  const messages: Msg[] = rawMsgs
    .map((m) => ({ role: str(m.role) === "assistant" ? "assistant" : "user", content: clip(str(m.content), 6000) }))
    .filter((m) => m.content)
    .slice(-12);
  while (messages.length && messages[0].role !== "user") messages.shift();
  return messages;
}

// ── Auth: usuario logueado del panel O cron_secret ───────────────────────────
async function authedUser(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !ANON_KEY || token === ANON_KEY) return false;
  try {
    const uc = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data } = await uc.auth.getUser();
    return !!data?.user;
  } catch { return false; }
}

export async function authRequest(supabase: SupabaseClient, req: Request): Promise<boolean> {
  const { data: sp } = await supabase.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const cronSecret = str((sp?.value as Record<string, unknown>)?.cron_secret);
  const gotSecret = req.headers.get("x-cron-secret") || "";
  return (!!cronSecret && gotSecret === cronSecret) || (await authedUser(req));
}

// ── Config: API key + modelo + topes + precio ────────────────────────────────
// El respaldo de precios es POR MODELO y tiene que errar caro: con un default fijo de 3/15,
// un agente movido a Opus registraba un costo 40% más barato del real y los topes —que
// existen para frenar la fuga— dejaban pasar de largo. Manda app_settings.api_config.prices.
const PRECIOS_LISTA: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

export type RuntimeConfig = {
  apiKey: string;
  model: string;
  maxTokens: number;
  dailyCap: number;
  monthlyCap: number;
  price: { in: number; out: number };
};

export async function loadRuntimeConfig(
  supabase: SupabaseClient,
  subagentKey: string,
  mode: string,
  manifest: Record<string, unknown>,
): Promise<RuntimeConfig | { error: Response }> {
  const { data: keyRow } = await supabase.from("secure_config").select("value").eq("key", "anthropic_api_key").maybeSingle();
  const apiKey = str(keyRow?.value);
  if (!apiKey) return { error: j({ ok: false, error: "missing_api_key", detail: "Falta configurar la API key de Anthropic." }, 500) };

  const { data: cfgRow } = await supabase.from("app_settings").select("value").eq("key", "api_config").maybeSingle();
  const cfg = (cfgRow?.value as Record<string, unknown>) ?? {};
  const chatModels = (cfg.chat_models as Record<string, string>) || {};
  const model = str(chatModels[subagentKey]) || str(cfg.chat_model) || "claude-sonnet-5";

  // max_tokens: el manifest del agente puede fijar el suyo; si no, mandan los globales.
  const mt = (manifest.max_tokens as Record<string, unknown>) || {};
  const maxTokens = Number(
    mode === "generate"
      ? (mt.generate ?? cfg.chat_generate_max_tokens ?? 4096)
      : (mt.chat ?? cfg.chat_max_tokens ?? 6000),
  );

  const prices = (cfg.prices as Record<string, { in: number; out: number }>) || {};
  return {
    apiKey, model, maxTokens,
    dailyCap: Number(cfg.daily_cap_usd ?? 5),
    monthlyCap: Number(cfg.monthly_cap_usd ?? 100),
    price: prices[model] || PRECIOS_LISTA[model] || { in: 5, out: 25 },
  };
}

// ── Freno anti-fuga: topes de gasto ──────────────────────────────────────────
// Devuelve una Response de error si hay que frenar; null si se puede seguir.
// Si el CHEQUEO falla, se sigue (el max_tokens acota igual) — mismo criterio que agent-chat.
export async function checkCaps(
  supabase: SupabaseClient,
  p: { fn: string; model: string; clientId: string; funnelId: string; subagentKey: string; mode: string; dailyCap: number; monthlyCap: number },
): Promise<Response | null> {
  try {
    const { data: stats } = await supabase.rpc("api_usage_stats");
    const todayCost = Number((stats as Record<string, Record<string, number>>)?.today?.cost ?? 0);
    const monthCost = Number((stats as Record<string, Record<string, number>>)?.month?.cost ?? 0);
    if (todayCost >= p.dailyCap) {
      await supabase.from("api_usage").insert({ fn: p.fn, model: p.model, status: "blocked", client_id: p.clientId, funnel_id: p.funnelId, error: "tope diario", meta: { subagent_key: p.subagentKey, mode: p.mode, todayCost, dailyCap: p.dailyCap } });
      return j({ ok: false, error: "daily_cap", detail: `Se alcanzó el tope de gasto diario (US$${p.dailyCap}). Se reinicia mañana o subilo en Administración.` }, 429);
    }
    if (monthCost >= p.monthlyCap) {
      await supabase.from("api_usage").insert({ fn: p.fn, model: p.model, status: "blocked", client_id: p.clientId, funnel_id: p.funnelId, error: "tope mensual", meta: { subagent_key: p.subagentKey, mode: p.mode, monthCost, monthlyCap: p.monthlyCap } });
      return j({ ok: false, error: "monthly_cap", detail: `Se alcanzó el tope de gasto mensual (US$${p.monthlyCap}).` }, 429);
    }
  } catch { /* si falla el chequeo, seguimos */ }
  return null;
}

// ── El system con sus breakpoints de cache ───────────────────────────────────
// El cache de la API es un PREFIJO: se corta en el breakpoint y todo lo que va después se
// paga entero en cada mensaje. Dos breakpoints, de más estable a menos:
//   1. el método (estable por agente)  2. el contexto (estable dentro de la conversación)
//   3. lo recuperado por el pedido del turno — sin cachear, cambia siempre.
export function buildSystem(stable: string, estable: string, recuperado: string) {
  return [
    { type: "text", text: stable, cache_control: { type: "ephemeral" } },
    ...(estable ? [{ type: "text", text: estable, cache_control: { type: "ephemeral" } }] : []),
    ...(recuperado ? [{ type: "text", text: recuperado }] : []),
  ];
}

// ── La llamada a la API: una sola, con thinking APAGADO ──────────────────────
// En Sonnet 5 el thinking está ON por defecto y se come el presupuesto de max_tokens →
// respuestas cortadas o vacías. Reintento acotado: 1, respetando retry-after (tope 10s,
// esto es sincrónico y hay alguien esperando en el panel).
export async function callAnthropic(
  apiKey: string,
  reqBody: Record<string, unknown>,
): Promise<{ res: Response | null; lastErr: string }> {
  reqBody.thinking = { type: "disabled" };
  const model = str(reqBody.model);
  // temperature solo para modelos que la aceptan junto al thinking apagado (legacy).
  if (!/sonnet-5|opus-4|fable-5/i.test(model) && reqBody.temperature === undefined) reqBody.temperature = 0.6;

  let res: Response | null = null;
  let lastErr = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
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
      if (res.status !== 429 && res.status < 500) break;
      const ra = Number(res.headers.get("retry-after"));
      if (Number.isFinite(ra) && ra > 0) esperar = Math.min(ra * 1000, 10000);
    } catch (e) { lastErr = String((e as Error)?.message || e); }
    if (attempt < 2) await new Promise((r) => setTimeout(r, esperar));
  }
  return { res, lastErr };
}

// ── Contabilidad de tokens y costo ───────────────────────────────────────────
// Los 3 tipos de token de entrada NO valen lo mismo: leer del cache cuesta 0.1x y
// escribirlo 1.25x. Sumarlos y multiplicar por price.in inflaba el costo y disparaba
// los topes antes de tiempo.
export function computeUsage(data: Record<string, unknown>, price: { in: number; out: number }) {
  const usage = (data?.usage || {}) as Record<string, unknown>;
  const freshTok = Number(usage.input_tokens || 0);
  const cacheReadTok = Number(usage.cache_read_input_tokens || 0);
  const cacheWriteTok = Number(usage.cache_creation_input_tokens || 0);
  const inTok = freshTok + cacheReadTok + cacheWriteTok;
  const outTok = Number(usage.output_tokens || 0);
  const inCost = ((freshTok + cacheReadTok * 0.1 + cacheWriteTok * 1.25) / 1e6) * price.in;
  const cost = Number((inCost + (outTok / 1e6) * price.out).toFixed(6));
  return { inTok, outTok, freshTok, cacheReadTok, cacheWriteTok, cost, stopReason: str(data?.stop_reason) };
}
