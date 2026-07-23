// supabase/functions/detectar-avatar/index.ts
// Dado el guion transcripto de un anuncio/VSL y la lista de avatares de un funnel,
// Claude Haiku decide a QUÉ avatar apunta el guion. Se usa para ordenar el material de
// video migrado del Drive (que casi nunca tiene el avatar en el nombre de la carpeta).
//
// Entrada (POST JSON): { transcript, avatars: [{id, name, description?}] }
// Salida: { ok, avatar_id, confidence (0-1), razon }
// Auth: Authorization: Bearer <DETECT_TOKEN | service_role>  (solo llamadas internas).
// La API key de Anthropic se lee de secure_config.anthropic_api_key (igual que agent-chat).

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
    const authed = (DETECT_TOKEN && auth === DETECT_TOKEN) || (SERVICE_ROLE && auth === SERVICE_ROLE);
    if (!authed) return json({ ok: false, error: "no autorizado" }, 401);

    const { transcript, avatars } = await req.json();
    if (!transcript || !Array.isArray(avatars) || avatars.length === 0)
      return json({ ok: false, error: "faltan transcript o avatars" }, 400);

    // API key de Anthropic desde secure_config
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: keyRow } = await supabase.from("secure_config").select("value").eq("key", "anthropic_api_key").maybeSingle();
    const apiKey = typeof keyRow?.value === "string" ? keyRow.value : (keyRow?.value?.key || keyRow?.value?.value || "");
    if (!apiKey) return json({ ok: false, error: "falta anthropic_api_key en secure_config" }, 500);

    const lista = avatars
      .map((a: { id: string; name: string; description?: string }, i: number) =>
        `${i + 1}. [id: ${a.id}] ${a.name}${a.description ? ` — ${String(a.description).slice(0, 400)}` : ""}`)
      .join("\n");

    const system =
      "Sos un estratega de marketing. Te doy el GUION transcripto de un anuncio (o VSL) y una lista de AVATARES " +
      "(públicos objetivo) de un funnel. Decidí a cuál de esos avatares le habla el guion, por su dolor, deseo, " +
      "edad y lenguaje. Elegí SOLO uno de los ids de la lista. Si el guion es genérico o no alcanza para decidir, " +
      "devolvé avatar_id vacío y confidence baja. Nunca inventes un id que no esté en la lista.";

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        avatar_id: { type: "string", description: "el id del avatar elegido, o '' si no se puede decidir" },
        confidence: { type: "number", description: "0 a 1" },
        razon: { type: "string", description: "una frase corta del porqué" },
      },
      required: ["avatar_id", "confidence", "razon"],
    };
    const user = `AVATARES:\n${lista}\n\nGUION:\n"""${String(transcript).slice(0, 6000)}"""`;

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: [{ type: "text", text: system }],
        messages: [{ role: "user", content: user }],
        output_config: { format: { type: "json_schema", schema } },
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return json({ ok: false, error: `anthropic_${res.status}: ${(await res.text()).slice(0, 200)}` }, 500);
    const data = await res.json();
    const text = (data.content || []).find((b: { type: string }) => b.type === "text")?.text;
    const out = text ? JSON.parse(text) : {};

    const valido = avatars.some((a: { id: string }) => a.id === out.avatar_id);
    return json({ ok: true, avatar_id: valido ? out.avatar_id : "", confidence: out.confidence ?? 0, razon: out.razon || "" });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
