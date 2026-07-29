// rec-screen — puntúa un postulante contra los requisitos del rol (0-100) y deja
// un resumen de 1-2 líneas. Lo llama el panel (botón "Analizar") por postulación.
// verify_jwt=true.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const MODEL = "claude-opus-4-8";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    flags: { type: "array", items: { type: "string" } },
  },
  required: ["score", "summary", "flags"],
};

const SYSTEM = `Sos un reclutador que hace un primer filtro rápido de postulantes.
Te doy el rol, los requisitos buscados y las respuestas del formulario de un candidato.
Devolvé:
- score: 0-100 qué tan bien encaja con los requisitos (100 = ideal). Sé exigente y realista.
- summary: 1-2 líneas en español explicando el puntaje (fortalezas y red flags concretas).
- flags: lista corta de alertas si las hay (ej "sin portfolio", "no cumple experiencia", "país fuera de rango"); array vacío si no hay.
No inventes datos que el candidato no dio; si falta info clave, bajá el score y marcalo en flags.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada en el proyecto");
    const { role_title, requirements = "", name = "", answers = {} } = await req.json();
    if (!role_title) throw new Error("falta role_title");

    const user = `ROL: ${role_title}
REQUISITOS BUSCADOS: ${requirements || "(no especificados)"}

CANDIDATO: ${name || "(sin nombre)"}
RESPUESTAS DEL FORMULARIO:
${JSON.stringify(answers, null, 2)}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`anthropic_${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    if (data.stop_reason === "refusal") throw new Error("anthropic_refusal");
    const text = (data.content || []).find((b: any) => b.type === "text")?.text;
    if (!text) throw new Error("respuesta vacía");

    return new Response(text, { headers: { ...CORS, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 400, headers: { ...CORS, "content-type": "application/json" },
    });
  }
});
