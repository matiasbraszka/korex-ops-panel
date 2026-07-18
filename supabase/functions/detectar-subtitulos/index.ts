// supabase/functions/detectar-subtitulos/index.ts
// Dado un video ya subido a Bunny, decide si tiene SUBTÍTULOS QUEMADOS (texto de caption
// encima de la imagen). Con eso el organizador sabe si es una EDICIÓN (pieza terminada,
// subtitulada) o una GRABACIÓN en crudo — y la manda a la carpeta correcta.
//
// Truco barato y sin tocar la API sensible de Bunny: Bunny genera solo una grilla de
// previsualización (la del "seek" de la barra), que es UNA imagen con hasta 36 fotogramas
// repartidos en el video. Bajamos esa grilla del CDN (no de la API) y se la mostramos a
// Claude Haiku (visión), que decide si hay subtítulos en varios cuadros.
//
// Entrada (POST JSON): { bunny_id }   (el guid del video en Bunny)
// Salida: { ok, subtitulado (bool), confidence (0-1), razon }
// Auth: Authorization: Bearer <DETECT_TOKEN | service_role>  (solo llamadas internas).
// La API key de Anthropic se lee de secure_config.anthropic_api_key (igual que detectar-avatar).
// Secret usado: BUNNY_HOSTNAME (el host del pull zone, p.ej. vz-xxxx.b-cdn.net).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DETECT_TOKEN = Deno.env.get("DETECT_TOKEN") ?? "";
const BUNNY_HOST = Deno.env.get("BUNNY_HOSTNAME") ?? "";
const API_URL = "https://api.anthropic.com/v1/messages";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

// Baja la grilla de previsualización del CDN de Bunny y la devuelve en base64.
// Bunny arma /{guid}/seek/_0.jpg (grilla 6x6, hasta 36 cuadros a lo largo del video).
// _0 cubre los primeros ~72s: si hay subtítulos, casi siempre ya se ven ahí.
async function bajarGrilla(guid: string): Promise<string | null> {
  const url = `https://${BUNNY_HOST}/${guid}/seek/_0.jpg`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (!buf.length) return null;
  // base64 sin newlines (lo que pide la API de Anthropic).
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
    const authed = (DETECT_TOKEN && auth === DETECT_TOKEN) || (SERVICE_ROLE && auth === SERVICE_ROLE);
    if (!authed) return json({ ok: false, error: "no autorizado" }, 401);
    if (!BUNNY_HOST) return json({ ok: false, error: "falta BUNNY_HOSTNAME" }, 500);

    const { bunny_id } = await req.json();
    if (!bunny_id) return json({ ok: false, error: "falta bunny_id" }, 400);

    // 1) grilla de fotogramas del CDN de Bunny
    const b64 = await bajarGrilla(String(bunny_id));
    if (!b64) return json({ ok: false, error: "sin_grilla" }); // aún procesando / sin seek — reintentar luego

    // 2) API key de Anthropic desde secure_config (mismo patrón que detectar-avatar)
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: keyRow } = await supabase.from("secure_config").select("value").eq("key", "anthropic_api_key").maybeSingle();
    const apiKey = typeof keyRow?.value === "string" ? keyRow.value : (keyRow?.value?.key || keyRow?.value?.value || "");
    if (!apiKey) return json({ ok: false, error: "falta anthropic_api_key en secure_config" }, 500);

    const system =
      "Sos un revisor de video. Te doy UNA imagen que es una grilla de fotogramas tomados a lo largo de un " +
      "video (una miniatura por celda). Decidí si el video tiene SUBTÍTULOS QUEMADOS: texto de caption " +
      "sobreimpreso en la imagen (típicamente grande, centrado o en el tercio inferior, palabra por palabra " +
      "o frases cortas, estilo de anuncio editado). NO cuentan como subtítulo: logos, marcas de agua, texto " +
      "que forma parte de la escena filmada (carteles, etiquetas de producto), ni interfaces. Respondé " +
      "subtitulado=true SOLO si varias celdas muestran ese texto tipo caption. Si dudás, subtitulado=false.";

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        subtitulado: { type: "boolean", description: "true si el video tiene subtítulos quemados" },
        confidence: { type: "number", description: "0 a 1" },
        razon: { type: "string", description: "una frase corta del porqué" },
      },
      required: ["subtitulado", "confidence", "razon"],
    };

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: [{ type: "text", text: system }],
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
            { type: "text", text: "¿Este video tiene subtítulos quemados? Mirá varias celdas antes de decidir." },
          ],
        }],
        output_config: { format: { type: "json_schema", schema } },
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return json({ ok: false, error: `anthropic_${res.status}: ${(await res.text()).slice(0, 200)}` }, 500);
    const data = await res.json();
    const text = (data.content || []).find((b: { type: string }) => b.type === "text")?.text;
    const out = text ? JSON.parse(text) : {};

    return json({
      ok: true,
      subtitulado: !!out.subtitulado,
      confidence: out.confidence ?? 0,
      razon: out.razon || "",
    });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
