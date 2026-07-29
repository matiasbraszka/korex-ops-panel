// rec-generate — genera con IA el material de una búsqueda: copy base + variaciones
// únicas (anti-duplicado FB) localizadas por país, spec del flyer y preguntas del form.
// Patrón de _shared/anthropic.ts (fetch a Messages API con output_config json_schema).
// verify_jwt=true (lo llama el panel logueado).
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
    copy_base: { type: "string" },
    variants: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { text: { type: "string" }, lang_country: { type: "string" } },
        required: ["text", "lang_country"],
      },
    },
    creative: {
      type: "object", additionalProperties: false,
      properties: {
        headline: { type: "string" },
        subhead: { type: "string" },
        cta: { type: "string" },
        accent: { type: "string" },
      },
      required: ["headline", "subhead", "cta", "accent"],
    },
    form_questions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: ["text", "textarea", "tel", "email", "url", "select"] },
          required: { type: "boolean" },
          options: { type: "array", items: { type: "string" } },
        },
        required: ["id", "label", "type", "required", "options"],
      },
    },
  },
  required: ["copy_base", "variants", "creative", "form_questions"],
};

const SYSTEM = `Sos un reclutador experto que escribe avisos para publicar en GRUPOS DE FACEBOOK y atraer candidatos a un puesto. Tu objetivo es máxima tasa de postulación.

Reglas de los avisos (copy_base y cada variante):
- Español natural, cálido y directo, LOCALIZADO al país (modismos y forma de tratamiento correctos: "vos"/"tú"/"usted" según el país).
- Estructura: gancho breve + qué buscamos (el rol) + qué ofrecemos (remoto, pago, crecimiento) + a quién apunta + llamada a postularse.
- Corto: 5 a 9 líneas. 1-3 emojis bien usados. Sin muros de texto.
- NO inventes links ni sueldos concretos si no te los dieron. Cerrá con una línea de CTA tipo "Postulate acá 👉" (el sistema pega el link real después).
- CRÍTICO anti-spam: cada variante debe ser ESTRUCTURALMENTE distinta (otro gancho, otro orden, otras palabras), no un sinónimo de la anterior. Facebook banea contenido casi idéntico repetido en muchos grupos.

Generá:
- copy_base: 1 aviso base neutro.
- variants: 2 variantes ÚNICAS por cada país indicado (lang_country = nombre del país). Si no hay países, 3 variantes neutras (lang_country="LATAM").
- creative: textos para un flyer cuadrado — headline (3-6 palabras, impactante), subhead (1 línea), cta (2-4 palabras), accent (color HEX que combine con el rubro del rol, ej "#2563eb").
- form_questions: 5 a 8 preguntas útiles para filtrar ese rol específico (portfolio/URL, años de experiencia, herramientas, disponibilidad, expectativa de pago, país/zona horaria, etc). Cada una con id (slug corto), label, type y required. options SOLO para type "select" (si no, array vacío []).`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada en el proyecto");
    const { role_title, countries = [], keywords = [], requirements = "" } = await req.json();
    if (!role_title) throw new Error("falta role_title");

    const user = `ROL: ${role_title}
PAÍSES: ${(countries || []).join(", ") || "(sin especificar)"}
KEYWORDS/GRUPOS OBJETIVO: ${(keywords || []).join(", ") || "(sin especificar)"}
REQUISITOS Y NOTAS: ${requirements || "(sin especificar)"}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
      }),
      signal: AbortSignal.timeout(120000),
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
