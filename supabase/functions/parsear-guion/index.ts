// supabase/functions/parsear-guion/index.ts
// Normaliza el guion de anuncios de un avatar (ad_script) a una estructura ESTÁNDAR,
// sin importar el formato de entrada. Cada cliente escribe distinto: uno numera hooks y
// ángulos, otro no tiene ángulos, otro pega el anuncio entero de una. Claude lo lee y
// devuelve una lista ordenada de SEGMENTOS (hooks y textos base), numerados por ángulo.
//
// Con esa estructura, organizar-videos compara la transcripción de cada video contra cada
// segmento (GRATIS) para saber QUÉ dice y armar el título — "Ángulo 1 · Hook 3", etc.
// Se corre una sola vez por avatar (no por video), así el costo es mínimo.
//
// Entrada (POST JSON): { ad_script }
// Salida: { ok, segmentos: [ { angulo, tipo:'hook'|'texto_base', numero, texto } ] }
// Auth: Authorization: Bearer <DETECT_TOKEN | service_role>.
// API key de Anthropic desde secure_config.anthropic_api_key (igual que detectar-avatar).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DETECT_TOKEN = Deno.env.get("DETECT_TOKEN") ?? "";
const API_URL = "https://api.anthropic.com/v1/messages";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
    if (!((DETECT_TOKEN && auth === DETECT_TOKEN) || (SERVICE_ROLE && auth === SERVICE_ROLE))) return json({ ok: false, error: "no autorizado" }, 401);

    const { ad_script } = await req.json();
    if (!ad_script || String(ad_script).trim().length < 20) return json({ ok: false, error: "ad_script vacío o muy corto" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: keyRow } = await supabase.from("secure_config").select("value").eq("key", "anthropic_api_key").maybeSingle();
    const apiKey = typeof keyRow?.value === "string" ? keyRow.value : (keyRow?.value?.key || keyRow?.value?.value || "");
    if (!apiKey) return json({ ok: false, error: "falta anthropic_api_key en secure_config" }, 500);

    const system =
      "Sos un estratega de marketing. Te doy el GUION DE ANUNCIOS de un avatar. Puede venir en " +
      "CUALQUIER formato: con ángulos numerados o sin ángulos, con hooks numerados o solo separados " +
      "por saltos de línea, o el anuncio entero de corrido. Tu tarea es DEVOLVER una lista ordenada y " +
      "numerada de SEGMENTOS, para poder después identificar qué parte del guion dice cada video.\n" +
      "Reglas:\n" +
      "- Un HOOK es un gancho de apertura (una o dos frases que abren un anuncio). Cada hook distinto es un segmento.\n" +
      "- Un TEXTO BASE es el cuerpo/desarrollo del anuncio (más largo que un hook).\n" +
      "- Si el guion divide por ÁNGULOS (o subavatares), usá ese nombre en 'angulo'. Si NO hay ángulos, poné 'General'.\n" +
      "- Numerá los hooks 1,2,3… y los textos base 1,2,3… dentro de cada ángulo (empezando de 1 en cada ángulo).\n" +
      "- En 'texto' poné el texto real del segmento (sirve para matchear la transcripción). No lo resumas ni lo inventes.\n" +
      "- Extraé SOLO lo que está en el guion. Si algo no es ni hook ni texto base (indicaciones de grabación, títulos), omitilo.";

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        segmentos: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              angulo: { type: "string", description: "nombre del ángulo/subavatar, o 'General'" },
              tipo: { type: "string", enum: ["hook", "texto_base"] },
              numero: { type: "integer", description: "número secuencial dentro del ángulo+tipo, desde 1" },
              texto: { type: "string", description: "el texto real del segmento" },
            },
            required: ["angulo", "tipo", "numero", "texto"],
          },
        },
      },
      required: ["segmentos"],
    };

    const user = `GUION:\n"""${String(ad_script).slice(0, 16000)}"""`;

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8000,
        system: [{ type: "text", text: system }],
        messages: [{ role: "user", content: user }],
        output_config: { format: { type: "json_schema", schema } },
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) return json({ ok: false, error: `anthropic_${res.status}: ${(await res.text()).slice(0, 200)}` }, 500);
    const data = await res.json();
    const text = (data.content || []).find((b: { type: string }) => b.type === "text")?.text;
    const out = text ? JSON.parse(text) : {};
    const segs = Array.isArray(out.segmentos) ? out.segmentos : [];

    return json({ ok: true, segmentos: segs });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
