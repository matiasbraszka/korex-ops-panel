// _shared/anthropic.ts — cliente mínimo de la Messages API de Claude para los
// análisis de soporte. Se llama por fetch (Deno), igual que Resend/Slack/Evolution.
//
// Usa salida estructurada (output_config.format = json_schema) para parsear sin
// fragilidad, y cachea el bloque de instrucciones estable (cache_control).
// Modelo configurable en soporte_config.analysis_model (default claude-opus-4-8).
//
// deno-lint-ignore-file no-explicit-any

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const DEFAULT_MODEL = "claude-opus-4-8";
const API_URL = "https://api.anthropic.com/v1/messages";

export interface AnalyzeArgs {
  system: string;        // instrucciones estables (se cachean)
  user: string;          // el transcript / contenido variable
  schema: any;           // JSON Schema de la respuesta (objects con additionalProperties:false)
  model?: string;
  maxTokens?: number;
}

// Llama a Claude y devuelve el objeto ya parseado según el schema.
// Lanza si falta la API key, si la API falla o si la respuesta es un rechazo.
export async function analyze<T = any>({ system, user, schema, model, maxTokens }: AnalyzeArgs): Promise<T> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: maxTokens || 8192,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema } },
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`anthropic_${res.status}: ${body.slice(0, 400)}`);
  }

  const data = await res.json();
  if (data.stop_reason === "refusal") throw new Error("anthropic_refusal");
  const text = (data.content || []).find((b: any) => b.type === "text")?.text;
  if (!text) throw new Error("anthropic_sin_texto");
  return JSON.parse(text) as T;
}
