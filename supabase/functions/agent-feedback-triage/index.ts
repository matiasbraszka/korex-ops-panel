// supabase/functions/agent-feedback-triage/index.ts
// TRIAGE DIARIO del feedback del equipo (cron). Junta el feedback nuevo, lo razona EN LOTE con UNA sola
// llamada a Claude, y deja PROPUESTAS de mejora (agent_improvements, status='proposed') para que Matías apruebe.
// Filosofía anti-bloat (clave): prioriza aprender por EJEMPLO (barato, contextual) por sobre agregar REGLAS
// (caras, permanentes). Solo propone una regla para fallas repetidas y generales; consolida, no apila.
// Al final barre las propuestas ya APROBADAS y las aplica (llamando a apply-improvement).
// Anti-fuga: 1 sola llamada por corrida, tope de tokens, registro en api_usage. Auth: cron-secret o usuario.
// Self-contained (deploy por MCP).

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
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const clip = (s: string, n: number) => { const t = str(s); return t.length > n ? t.slice(0, n) + "…" : t; };
const rid = () => `imp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

async function authedUser(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !ANON_KEY || token === ANON_KEY) return false;
  try {
    const uc = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data } = await uc.auth.getUser();
    return !!data?.user;
  } catch { return false; }
}

const SYSTEM = `Sos el TRIAGE de mejora de un agente de anuncios de Meta (Korex). Te llega un LOTE de feedback del equipo sobre respuestas del agente. Tu trabajo: convertirlo en unas POCAS propuestas de mejora de altísimo valor, filtrando el ruido.

PRINCIPIO RECTOR (obligatorio): el agente aprende de DOS formas y NO son iguales:
- Por EJEMPLO (biblioteca): se trae solo cuando es relevante → costo cero permanente, no lo marea. PREFERÍ SIEMPRE esta vía.
- Por REGLA (instrucciones): pesa en CADA respuesta para siempre → cara y arriesgada. Solo proponé una regla para una falla REPETIDA y GENERAL que un ejemplo no pueda arreglar. Consolidá/edita una regla existente, NO apiles una nueva. Toda regla debe justificar por qué un ejemplo no alcanza + su costo en tokens.

CÓMO DECIDIR:
- 👍 a una respuesta buena → proponé un EJEMPLO (kind='example'): extraé el mejor anuncio/hook de esa respuesta como ejemplo para la biblioteca, con niche/avatar/niche_tags. Así el agente aprende el estándar del equipo.
- 👎 con un patrón claro y repetido → si un ejemplo lo puede enseñar, kind='example' (mostrando la versión correcta); si es una regla general innegociable, kind='rule' (con find/replace EXACTO sobre las instrucciones que te paso).
- Feedback puntual, contradictorio, subjetivo o de un solo caso → kind='note' (se registra, NO cambia nada).
- NUNCA más de 5 propuestas por corrida. Menos y mejores.

Para kind='rule': payload.find TIENE que ser un fragmento EXACTO y textual de las instrucciones actuales que te paso (para poder reemplazarlo), y payload.replace el texto nuevo. Mantené el estilo. No dupliques reglas que ya existen.
Para kind='example': payload = {niche, avatar, title, content, niche_tags}. content = el copy del ejemplo (verbatim de la respuesta), title corto, niche en minúscula.
Devolvé SIEMPRE via la tool emit_proposals.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const { data: sp } = await supabase.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const cronSecret = str((sp?.value as Record<string, unknown>)?.cron_secret);
  const gotSecret = req.headers.get("x-cron-secret") || "";
  const authed = (cronSecret && gotSecret === cronSecret) || (await authedUser(req));
  if (!authed) return j({ ok: false, error: "unauthorized" }, 401);

  const subagentKey = "anuncios";

  // 1) Feedback nuevo
  const { data: fbRows } = await supabase.from("agent_feedback")
    .select("*").eq("status", "new").eq("subagent_key", subagentKey).order("created_at", { ascending: true }).limit(60);
  const feedback = Array.isArray(fbRows) ? fbRows : [];

  let proposalsInserted = 0;
  if (feedback.length) {
    // Nicho por cliente (para taggear ejemplos de 👍)
    const clientIds = [...new Set(feedback.map((f) => str(f.client_id)).filter(Boolean))];
    const nicheByClient = new Map<string, string>();
    if (clientIds.length) {
      const { data: cl } = await supabase.from("clients").select("id,niche").in("id", clientIds);
      for (const c of (cl || [])) nicheByClient.set(str(c.id), str(c.niche));
    }

    const fbText = feedback.map((f, i) => {
      const niche = nicheByClient.get(str(f.client_id)) || "";
      return `#${i + 1} [${str(f.rating) === "up" ? "👍 BUENA" : "👎 MEJORAR"}]${niche ? ` nicho:${niche}` : ""}${(f.tags || []).length ? ` tags:${(f.tags as string[]).join(",")}` : ""}\n  Pedido: ${clip(str(f.user_prompt), 400)}\n  Comentario del equipo: ${clip(str(f.comment), 500) || "(sin comentario)"}\n  Respuesta valorada: ${clip(str(f.response_text), 1400)}`;
    }).join("\n\n");

    // Instrucciones actuales (para que pueda proponer find/replace exactos)
    const { data: saRow } = await supabase.from("marketing_subagents").select("instructions").eq("key", subagentKey).maybeSingle();
    const instr = clip(str(saRow?.instructions), 16000);

    // Config API
    const { data: keyRow } = await supabase.from("secure_config").select("value").eq("key", "anthropic_api_key").maybeSingle();
    const apiKey = str(keyRow?.value);
    const { data: cfgRow } = await supabase.from("app_settings").select("value").eq("key", "api_config").maybeSingle();
    const cfg = (cfgRow?.value as Record<string, unknown>) ?? {};
    const model = str(cfg.triage_model) || "claude-sonnet-5";
    const prices = (cfg.prices as Record<string, { in: number; out: number }>) || {};
    const price = prices[model] || { in: 3, out: 15 };
    if (!apiKey) return j({ ok: false, error: "missing_api_key" }, 500);

    const tool = {
      name: "emit_proposals",
      description: "Propuestas de mejora derivadas del feedback (pocas y de alto valor; ejemplos > reglas).",
      input_schema: {
        type: "object",
        properties: {
          proposals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["example", "rule", "note"] },
                title: { type: "string" },
                rationale: { type: "string", description: "Por qué, y por qué esta vía (ejemplo vs regla)." },
                cost_note: { type: "string", description: "Impacto de costo/bloat. Para reglas, cuántos caracteres suma y por qué un ejemplo no alcanza." },
                payload: {
                  type: "object",
                  properties: {
                    niche: { type: "string" }, avatar: { type: "string" }, title: { type: "string" },
                    content: { type: "string" }, niche_tags: { type: "array", items: { type: "string" } },
                    find: { type: "string" }, replace: { type: "string" },
                  },
                },
              },
              required: ["kind", "title", "rationale"],
            },
          },
        },
        required: ["proposals"],
      },
    };

    const reqBody = {
      model, max_tokens: 4000, thinking: { type: "disabled" },
      system: [{ type: "text", text: SYSTEM }],
      tools: [tool], tool_choice: { type: "tool", name: "emit_proposals" },
      messages: [{ role: "user", content: `INSTRUCCIONES ACTUALES DEL AGENTE (para find/replace exactos si hiciera falta una regla):\n\n${instr}\n\n=====\n\nLOTE DE FEEDBACK (${feedback.length} ítems):\n\n${fbText}` }],
    };

    let apiRes: Response | null = null; let lastErr = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        apiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify(reqBody), signal: AbortSignal.timeout(120000),
        });
        if (apiRes.ok) break;
        lastErr = "http " + apiRes.status;
        if (apiRes.status !== 429 && apiRes.status < 500) break;
      } catch (e) { lastErr = String((e as Error)?.message || e); }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1200));
    }
    if (!apiRes || !apiRes.ok) {
      await supabase.from("api_usage").insert({ fn: "agent_feedback_triage", model, status: "error", error: clip(lastErr, 400) });
      return j({ ok: false, error: "api_error", detail: lastErr }, 502);
    }
    const data = await apiRes.json();
    const usage = data?.usage || {};
    const inTok = Number(usage.input_tokens || 0) + Number(usage.cache_read_input_tokens || 0) + Number(usage.cache_creation_input_tokens || 0);
    const outTok = Number(usage.output_tokens || 0);
    const cost = Number(((inTok / 1e6) * price.in + (outTok / 1e6) * price.out).toFixed(6));

    const block = (data.content || []).find((c: Record<string, unknown>) => c.type === "tool_use" && c.name === "emit_proposals");
    const proposals = Array.isArray((block?.input as Record<string, unknown>)?.proposals) ? (block!.input as Record<string, unknown>).proposals as Record<string, unknown>[] : [];
    const fbIds = feedback.map((f) => str(f.id));

    for (const p of proposals.slice(0, 5)) {
      await supabase.from("agent_improvements").insert({
        id: rid(), subagent_key: subagentKey, kind: str(p.kind) || "note",
        title: clip(str(p.title), 200) || "(sin título)", rationale: clip(str(p.rationale), 2000),
        cost_note: clip(str(p.cost_note), 800), payload: p.payload || {}, source_feedback_ids: fbIds, status: "proposed",
      });
      proposalsInserted++;
    }

    // Marcar el feedback como procesado
    await supabase.from("agent_feedback").update({ status: "triaged" }).in("id", fbIds);
    await supabase.from("api_usage").insert({ fn: "agent_feedback_triage", model, input_tokens: inTok, output_tokens: outTok, cost_usd: cost, status: "ok", meta: { feedback: feedback.length, proposals: proposalsInserted } });
  }

  // 2) Barrido: aplicar propuestas ya APROBADAS por Matías (respaldo del "aprobar → aplicar").
  let sweptApplied = 0;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/apply-improvement`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret, "Authorization": `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ sweep: true }),
    });
    const jb = await res.json().catch(() => ({}));
    sweptApplied = Number(jb?.applied || 0);
  } catch { /* si falla el barrido, no rompe el triage */ }

  return j({ ok: true, feedback_procesado: feedback.length, propuestas_creadas: proposalsInserted, aprobadas_aplicadas: sweptApplied });
});
