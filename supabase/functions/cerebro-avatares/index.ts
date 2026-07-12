// supabase/functions/cerebro-avatares/index.ts
// Acción del cerebro: lee el DEL (documento en limpio) de una estrategia y COMPLETA
// los avatares de cada funnel — título, segmentación (edad/sexo/profesión) y el
// fragmento del DEL que describe a ese avatar. Deja todo editable en el panel.
//
// El DEL suele tener TODOS los avatares juntos; acá el cerebro lo reparte por funnel
// (usando los nombres de los funnels + lo que aclare el DEL). No inventa datos.
//
// Lo invoca el botón "Completar avatares con IA" del panel (Anthropic, salida estructurada).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Cliente mínimo de la Messages API de Claude (salida estructurada por json_schema),
// mismo patrón que _shared/anthropic.ts (inline para simplificar el deploy).
// deno-lint-ignore no-explicit-any
async function analyze<T = any>({ system, user, schema, maxTokens }: { system: string; user: string; schema: unknown; maxTokens?: number }): Promise<T> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: maxTokens || 8192,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema } },
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) { const body = await res.text().catch(() => ""); throw new Error(`anthropic_${res.status}: ${body.slice(0, 400)}`); }
  const data = await res.json();
  if (data.stop_reason === "refusal") throw new Error("anthropic_refusal");
  // deno-lint-ignore no-explicit-any
  const text = (data.content || []).find((b: any) => b.type === "text")?.text;
  if (!text) throw new Error("anthropic_sin_texto");
  return JSON.parse(text) as T;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const rid = () => "av" + Math.random().toString(36).slice(2, 8);
const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();

const SYSTEM = `Sos un analista de marketing de Método Korex (nicho multinivel/MLM en su mayoría).
Te doy el DEL (documento en limpio) de UNA estrategia de un cliente y la lista de sus FUNNELS.
El DEL suele describir VARIOS avatares/públicos objetivo, todos juntos.

Tu tarea: repartir esos avatares entre los funnels y, por cada avatar, devolver:
- name: un título claro y corto del avatar (ej. "Padres emprendedores", "Networkers frustrados").
- segmentacion: edad, sexo, profesión y datos demográficos/psicográficos concretos.
- descripcion: el FRAGMENTO del DEL que habla de ese avatar, lo más completo posible (copiado/parafraseado del DEL, sin inventar).

Reglas:
- Asigná cada avatar al funnel que le corresponde según lo que aclare el DEL; si el DEL no lo aclara, usá el nombre del funnel para decidir el mejor encaje.
- NO inventes datos que no estén en el DEL. Si falta info, dejá el campo breve o vacío.
- Devolvé TODOS los funnels que te paso, aunque a alguno no le encuentres avatar (lista vacía).`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    funnels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          funnel_id: { type: "string" },
          avatars: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string" },
                segmentacion: { type: "string" },
                descripcion: { type: "string" },
              },
              required: ["name", "segmentacion", "descripcion"],
            },
          },
        },
        required: ["funnel_id", "avatars"],
      },
    },
  },
  required: ["funnels"],
};

async function authorize(req: Request, cronSecret: string): Promise<boolean> {
  const got = req.headers.get("x-cron-secret") || "";
  if (cronSecret && got === cronSecret) return true;
  const authz = req.headers.get("Authorization") || "";
  const token = authz.replace(/^Bearer\s+/i, "").trim();
  if (token && ANON_KEY && token !== ANON_KEY) {
    try {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data } = await userClient.auth.getUser();
      if (data?.user) return true;
    } catch { /* ignore */ }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { data: sp } = await supabase.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const cronSecret = String(((sp?.value as Record<string, unknown>) ?? {}).cron_secret || "");
  if (!(await authorize(req, cronSecret))) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  let strategyId = "";
  try { const b = await req.json(); strategyId = String((b as Record<string, unknown>)?.strategy_id || "").trim(); } catch { /* noop */ }
  if (!strategyId) return new Response(JSON.stringify({ ok: false, error: "missing_strategy_id" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

  // DEL de la estrategia (el texto ingerido).
  const { data: delDocs } = await supabase
    .from("client_brain_docs").select("text, title").eq("strategy_id", strategyId).eq("doc_kind", "del").limit(1);
  const del = delDocs?.[0];
  if (!del || !String(del.text || "").trim()) {
    return new Response(JSON.stringify({ ok: false, error: "no_del", message: "Esta estrategia no tiene un DEL sincronizado. Marcá el DEL y tocá Sincronizar contexto." }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // Funnels de la estrategia (con sus avatares actuales).
  const { data: pages } = await supabase
    .from("strategy_pages").select("id, name, avatars").eq("strategy_id", strategyId).order("position", { ascending: true });
  if (!pages || !pages.length) {
    return new Response(JSON.stringify({ ok: false, error: "no_funnels", message: "Esta estrategia no tiene funnels todavía." }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const funnelsForPrompt = pages.map((p) => ({
    funnel_id: p.id,
    funnel_name: p.name || "",
    avatares_actuales: (Array.isArray(p.avatars) ? p.avatars : []).map((a) => a?.name).filter(Boolean),
  }));

  const user = `DEL de la estrategia:\n"""\n${String(del.text).slice(0, 40000)}\n"""\n\nFUNNELS (devolvé cada funnel_id):\n${JSON.stringify(funnelsForPrompt, null, 2)}`;

  let result: { funnels: { funnel_id: string; avatars: { name: string; segmentacion: string; descripcion: string }[] }[] };
  try {
    result = await analyze({ system: SYSTEM, user, schema: SCHEMA, maxTokens: 12000 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "ia_error", message: String(e) }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // Merge: por funnel, actualizar/crear avatares por nombre; conservar los que la IA no tocó
  // (y sus urls/estado si el nombre coincide).
  let updated = 0, avatarsCount = 0;
  for (const rf of (result.funnels || [])) {
    const page = pages.find((p) => p.id === rf.funnel_id);
    if (!page) continue;
    const existing = Array.isArray(page.avatars) ? page.avatars : [];
    const aiNames = new Set((rf.avatars || []).map((a) => norm(a.name)));
    const merged = (rf.avatars || []).map((a) => {
      const match = existing.find((e) => norm(e?.name) === norm(a.name));
      return match
        ? { ...match, audience: a.segmentacion || match.audience || "", spec_text: a.descripcion || match.spec_text || "" }
        : { id: rid(), name: a.name, audience: a.segmentacion || "", spec_text: a.descripcion || "", status: "En grabación", ad_url: "", vsl_url: "" };
    });
    const kept = existing.filter((e) => !aiNames.has(norm(e?.name)));
    const nextAvatars = [...merged, ...kept];
    const { error } = await supabase.from("strategy_pages").update({ avatars: nextAvatars }).eq("id", page.id);
    if (!error) { updated++; avatarsCount += merged.length; }
  }

  return new Response(JSON.stringify({ ok: true, funnels: updated, avatars: avatarsCount }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
