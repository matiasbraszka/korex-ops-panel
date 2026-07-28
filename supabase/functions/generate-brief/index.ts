// supabase/functions/generate-brief/index.ts
// GENERA con IA el briefing / personalidad de un cliente a partir de TODA su data:
// onboarding + investigación + DEL (client_brain_docs) + resúmenes de sus llamadas (llamadas).
// Luego lo guarda como Google Doc real (Apps Script write_brief), lo ingiere al cerebro
// (client_brain_docs doc_kind='briefing') y lo FIJA en el casillero de personalidad.
// A PEDIDO (botón del panel). UNA sola llamada a la API. Topes de gasto. Todo en api_usage.
//
// Auth: usuario logueado del panel O el cron_secret interno.

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

async function authedUser(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !ANON_KEY || token === ANON_KEY) return false;
  try {
    const uc = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data } = await uc.auth.getUser();
    return !!data?.user;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const { data: sp } = await supabase.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const cronSecret = str((sp?.value as Record<string, unknown>)?.cron_secret);
  const gotSecret = req.headers.get("x-cron-secret") || "";
  const authed = (cronSecret && gotSecret === cronSecret) || (await authedUser(req));
  if (!authed) return j({ ok: false, error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const clientId = str(body.client_id);
  if (!clientId) return j({ ok: false, error: "missing_client_id" }, 400);

  // Config + secreto de la API.
  const { data: keyRow } = await supabase.from("secure_config").select("value").eq("key", "anthropic_api_key").maybeSingle();
  const apiKey = str(keyRow?.value);
  if (!apiKey) return j({ ok: false, error: "missing_api_key" }, 500);
  const { data: cfgRow } = await supabase.from("app_settings").select("value").eq("key", "api_config").maybeSingle();
  const cfg = (cfgRow?.value as Record<string, unknown>) ?? {};
  const model = str(cfg.brief_model) || str(cfg.avatar_model) || "claude-haiku-4-5-20251001";
  const dailyCap = Number(cfg.daily_cap_usd ?? 5);
  const monthlyCap = Number(cfg.monthly_cap_usd ?? 100);
  const prices = (cfg.prices as Record<string, { in: number; out: number }>) || {};
  const price = prices[model] || { in: 3, out: 15 };

  // Freno anti-fuga: topes de gasto.
  try {
    const { data: stats } = await supabase.rpc("api_usage_stats");
    const todayCost = Number((stats as Record<string, Record<string, number>>)?.today?.cost ?? 0);
    const monthCost = Number((stats as Record<string, Record<string, number>>)?.month?.cost ?? 0);
    if (todayCost >= dailyCap) { await supabase.from("api_usage").insert({ fn: "generate_brief", model, status: "blocked", client_id: clientId, error: "tope diario" }); return j({ ok: false, error: "daily_cap", detail: `Se alcanzó el tope de gasto diario (US$${dailyCap}).` }, 429); }
    if (monthCost >= monthlyCap) { await supabase.from("api_usage").insert({ fn: "generate_brief", model, status: "blocked", client_id: clientId, error: "tope mensual" }); return j({ ok: false, error: "monthly_cap", detail: `Se alcanzó el tope de gasto mensual (US$${monthlyCap}).` }, 429); }
  } catch { /* si falla el chequeo, seguimos (max_tokens acota) */ }

  const { data: client } = await supabase.from("clients").select("id, name, company, niche").eq("id", clientId).maybeSingle();
  if (!client) return j({ ok: false, error: "client_not_found" }, 404);

  // ── Juntar el contexto del cliente (con topes por sección para no reventar el prompt) ──
  const cap = (s: string, n: number) => (s || "").slice(0, n);
  const { data: docs } = await supabase.from("client_brain_docs")
    .select("doc_kind, title, text").eq("client_id", clientId);
  const pick = (kind: string, n: number) => {
    const rows = (docs ?? []).filter((d) => str(d.doc_kind) === kind).sort((a, b) => (str(b.text).length - str(a.text).length));
    return rows.length ? cap(str(rows[0].text), n) : "";
  };
  const onboarding = pick("onboarding", 22000);
  const investigacion = pick("investigacion", 18000);
  const del = pick("del", 22000);

  // Llamadas del cliente: resumen + notas + objeciones/feedback (las más recientes).
  const { data: calls } = await supabase.from("llamadas")
    .select("titulo, fecha, resumen, notas_clave")
    .eq("cliente_id", clientId)
    .order("fecha", { ascending: false }).limit(25);
  const callsText = cap((calls ?? [])
    .map((c) => {
      const t = str(c.titulo); const f = str(c.fecha).slice(0, 10);
      const r = str(c.resumen); const n = str(c.notas_clave);
      const bloque = [r, n].filter(Boolean).join("\n");
      return bloque ? `• ${t}${f ? ` (${f})` : ""}\n${bloque}` : "";
    }).filter(Boolean).join("\n\n"), 24000);

  if (!onboarding && !investigacion && !del && !callsText) {
    return j({ ok: false, error: "no_context", detail: "Este cliente no tiene onboarding, investigación, DEL ni llamadas cargadas todavía. Sincronizá el contexto o cargá una llamada primero." }, 400);
  }

  const prompt = [
    "Sos estratega de marca de Método Korex. Con la data REAL del cliente (onboarding, investigación, DEL y resúmenes de sus llamadas), escribí su BRIEFING DE PERSONALIDAD Y TONO DE MARCA, para que los anuncios / VSL / landings suenen a ÉL.",
    "Escribí en español, claro y accionable. Usá EXACTAMENTE estos bloques (con esos títulos):",
    "1) Quién es — 2 o 3 líneas: nombre, qué hace, su historia/ángulo clave.",
    "2) Personalidad y tono de voz — cómo habla (cercano/formal, tutea o no, energía, humor, ritmo), qué transmite al hablar.",
    "3) Valores y misión — lo que le importa y lo que quiere lograr.",
    "4) A quién le habla — el público que quiere atraer (dolores, deseos, momento vital).",
    "5) Qué SÍ decir — palabras, frases y ganchos que usa o que resuenan con él.",
    "6) Qué EVITAR — temas, tono o palabras que NO van con su marca.",
    "7) Referencias de estilo — si surgen de la data (marcas, referentes, formatos que le gustan).",
    "",
    "Devolvé el resultado con la herramienta guardar_briefing: 'briefing' = todo el texto de arriba; 'estilo_editor' = UNA sola frase autocontenida para el editor de video que combine el TONO (ej: formal, femenino, cercano, enérgico, sobrio) y QUÉ debe transmitir (ej: 'Cercano y motivador, tuteando; el video tiene que transmitir que el cambio es posible y que hay acompañamiento real').",
    "",
    "REGLAS: basate SOLO en la data de abajo, NO inventes. Si un bloque no tiene sustento en la data, ponelo breve o decí 'a definir'.",
    "",
    `CLIENTE: ${str(client.name)}${str(client.company) ? ` · empresa MLM: ${str(client.company)}` : ""}${str(client.niche) ? ` · nicho: ${str(client.niche)}` : ""}`,
    "",
    onboarding ? `===== ONBOARDING =====\n${onboarding}` : "",
    investigacion ? `===== INVESTIGACIÓN =====\n${investigacion}` : "",
    del ? `===== DEL (documento en limpio / estrategia) =====\n${del}` : "",
    callsText ? `===== RESÚMENES DE LLAMADAS =====\n${callsText}` : "",
  ].join("\n");

  // Salida ESTRUCTURADA forzada: garantiza dos campos separados (briefing + estilo_editor) sin
  // depender de que el modelo respete un rótulo dentro del texto (reorganiza libremente el brief).
  const tool = {
    name: "guardar_briefing",
    description: "Guarda el briefing de personalidad del cliente y una frase de estilo para el editor de video.",
    input_schema: {
      type: "object",
      properties: {
        briefing: { type: "string", description: "El briefing completo de personalidad y tono (bloques 1 a 7)." },
        estilo_editor: { type: "string", description: "UNA frase para el editor: tono del video + qué debe transmitir." },
      },
      required: ["briefing", "estilo_editor"],
    },
  };
  async function callApi(): Promise<Response> {
    const reqBody: Record<string, unknown> = {
      model, max_tokens: 3000,
      tools: [tool],
      tool_choice: { type: "tool", name: "guardar_briefing" },
      messages: [{ role: "user", content: prompt }],
    };
    if (!/sonnet-5|opus-4/i.test(model)) reqBody.temperature = 0.4;
    return await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(120000),
    });
  }

  let apiRes: Response | null = null;
  let lastErr = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      apiRes = await callApi();
      if (apiRes.ok) break;
      lastErr = "http " + apiRes.status;
      if (apiRes.status !== 429 && apiRes.status < 500) break;
    } catch (e) { lastErr = String((e as Error)?.message || e); }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1200));
  }
  if (!apiRes || !apiRes.ok) {
    await supabase.from("api_usage").insert({ fn: "generate_brief", model, status: "error", client_id: clientId, error: lastErr });
    return j({ ok: false, error: "api_error", detail: lastErr }, 502);
  }

  const data = await apiRes.json();
  const usage = data?.usage || {};
  const inTok = Number(usage.input_tokens || 0);
  const outTok = Number(usage.output_tokens || 0);
  const cost = Number(((inTok / 1e6) * price.in + (outTok / 1e6) * price.out).toFixed(6));
  // Sacar el bloque tool_use (salida estructurada). Fallback a texto plano si no vino como tool.
  const blocks = (data?.content || []) as Array<Record<string, unknown>>;
  const toolBlock = blocks.find((c) => c.type === "tool_use");
  const toolInput = (toolBlock?.input as Record<string, unknown>) || {};
  let content = str(toolInput.briefing);
  let editorStyle = str(toolInput.estilo_editor).replace(/\s*\n\s*/g, " ").trim().slice(0, 600);
  if (!content) {
    // Fallback: algún modelo devolvió texto en vez de tool.
    content = str(blocks.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim());
  }
  if (!content) {
    await supabase.from("api_usage").insert({ fn: "generate_brief", model, input_tokens: inTok, output_tokens: outTok, cost_usd: cost, status: "error", client_id: clientId, error: "empty_output" });
    return j({ ok: false, error: "empty_output", detail: "La IA no devolvió texto.", cost_usd: cost }, 502);
  }

  // ── Guardar: Google Doc (Apps Script) + registrar nodo + ingerir + fijar en casillero ──
  const { data: vf } = await supabase.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  const vcfg = (vf?.value as Record<string, unknown>) ?? {};
  const appscriptUrl = str(vcfg.appscript_url);
  const appscriptSecret = str(vcfg.appscript_secret);
  const { data: rootNode } = await supabase.from("client_drive_nodes").select("id").eq("client_id", clientId).eq("is_root", true).limit(1).maybeSingle();
  const rootId = str(rootNode?.id);
  const title = `Briefing y Personalidad - ${str(client.name) || "Cliente"}`;
  const { data: prev } = await supabase.from("client_brain_docs").select("node_id").eq("client_id", clientId).eq("doc_kind", "briefing").order("synced_at", { ascending: false }).limit(1).maybeSingle();

  let docId = "", url = "";
  if (appscriptUrl && appscriptSecret) {
    try {
      const r = await fetch(appscriptUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "write_brief", secret: appscriptSecret, docId: str(prev?.node_id) || undefined, content, title, clientFolderId: rootId || undefined }),
        signal: AbortSignal.timeout(60000),
      });
      const as = await r.json();
      if (as?.ok) { docId = str(as.docId); url = str(as.url); }
    } catch { /* si el doc falla, igual guardamos el texto en el cerebro abajo */ }
  }

  // El estilo para el editor ya vino estructurado (estilo_editor). Lo guardamos en el cliente
  // para que el mensaje al editor lo use sin volver a llamar a la IA.
  try { await supabase.from("clients").update({ editor_style: editorStyle || null }).eq("id", clientId); } catch { /* columna opcional */ }

  const nodeId = docId || `brief_${clientId}`; // si no hay Google Doc, usamos un id sintético
  const nowIso = new Date().toISOString();
  if (docId) {
    await supabase.from("client_drive_nodes").upsert({
      id: docId, client_id: clientId, parent_id: rootId || null, name: title,
      node_type: "document", mime_type: "application/vnd.google-apps.document",
      web_url: url || null, depth: 1, is_root: false, strategy_id: null, last_seen_at: nowIso,
    }, { onConflict: "id" });
  }
  await supabase.from("client_brain_docs").delete().eq("client_id", clientId).eq("doc_kind", "briefing");
  await supabase.from("client_brain_docs").insert({
    id: crypto.randomUUID(), client_id: clientId, node_id: nodeId, doc_kind: "briefing",
    title, text: content, char_count: content.length, web_url: url || null, synced_at: nowIso,
  });
  await supabase.from("client_brain_pins").upsert(
    { client_id: clientId, node_id: nodeId, slot: "briefing", label: title },
    { onConflict: "client_id,node_id" },
  );

  await supabase.from("api_usage").insert({
    fn: "generate_brief", model, input_tokens: inTok, output_tokens: outTok, cost_usd: cost,
    client_id: clientId, status: "ok",
    meta: { chars: content.length, doc: !!docId, sources: { onboarding: !!onboarding, investigacion: !!investigacion, del: !!del, calls: (calls ?? []).length } },
  });

  return j({ ok: true, text: content, editor_style: editorStyle || null, doc_id: docId || null, url: url || null, chars: content.length, cost_usd: cost });
});
