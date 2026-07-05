// supabase/functions/transcribir-audio/index.ts
// Transcribe UN archivo de audio/video (recibido en base64) usando una API de
// speech-to-text compatible con OpenAI (Groq Whisper por defecto, o OpenAI).
//
// Diseño deliberadamente stateless y de superficie mínima: no toca la base, no
// usa Storage, no depende de cron. El navegador (herramienta "Auditoría de
// audios" en Soporte › Recursos) parsea el _chat.txt, llama a esta función una
// vez por audio (con concurrencia limitada) y arma el texto final. Cada
// invocación transcribe un audio corto → nunca se acerca al timeout de 150s.
//
// Auth: verify_jwt=true + permiso soporte:read (mismo patrón que whatsapp-media),
// para que no sea un endpoint de pago abierto.
//
// Secrets (setear al menos uno):
//   GROQ_API_KEY    → usa https://api.groq.com  (barato y rápido; default)
//   OPENAI_API_KEY  → usa https://api.openai.com (fallback si no hay Groq)
//   TRANSCRIBE_MODEL (opcional) → override del modelo.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const MODEL_OVERRIDE = Deno.env.get("TRANSCRIBE_MODEL") || "";

// 25MB: límite de las APIs de Whisper (Groq/OpenAI) y tope defensivo.
const MAX_BYTES = 25 * 1024 * 1024;

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const OPENAI_URL = "https://api.openai.com/v1/audio/transcriptions";

// Arma el proveedor a partir de una key. Detecta OpenAI vs Groq por el hint
// explícito o por el prefijo de la key (sk-… = OpenAI, gsk_… = Groq).
function providerFor(key: string, hint: string, model: string) {
  const isOpenAI = hint === "openai" || (hint !== "groq" && key.startsWith("sk-"));
  return isOpenAI
    ? { url: OPENAI_URL, key, model: model || "whisper-1" }
    : { url: GROQ_URL, key, model: model || "whisper-large-v3" };
}

// Resuelve el proveedor según el secret de entorno seteado. La key vive como
// secret de la Edge Function (GROQ_API_KEY / OPENAI_API_KEY), no en la base.
function resolveProvider(): { url: string; key: string; model: string } | null {
  if (GROQ_API_KEY) return providerFor(GROQ_API_KEY, "groq", MODEL_OVERRIDE);
  if (OPENAI_API_KEY) return providerFor(OPENAI_API_KEY, "openai", MODEL_OVERRIDE);
  return null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function authorizeSoporteRead(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return false;
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const roleNames = (roles || []).map((r: { role: string }) => r.role);
  if (roleNames.includes("admin")) return true;
  if (roleNames.length === 0) return false;
  const { data: perms } = await admin
    .from("role_permissions").select("role")
    .in("role", roleNames).eq("module", "soporte").eq("can_read", true).limit(1);
  return (perms || []).length > 0;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ── Alerta a Slack cuando la API de transcripción se queda SIN SALDO ──
// Reusa el bot token de venta_form_config y el canal de alertas (configurable en
// soporte_config.alertas_channel, fallback #alertas-general). Con throttle de 30
// min vía app_settings.transcribe_alert_state para no spamear si fallan muchos
// audios seguidos (el navegador dispara una llamada por audio).
async function sendSlackAlert(text: string): Promise<void> {
  try {
    const { data: v } = await admin.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
    const token = String((v?.value as Record<string, unknown> | null)?.slack_bot_token || "");
    if (!token) return;
    const { data: s } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
    const channel = String((s?.value as Record<string, unknown> | null)?.alertas_channel || "#alertas-general");
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, text, unfurl_links: false }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    console.error("transcribir-audio: slack alert fallo", e);
  }
}

async function maybeAlertQuota(detail: string): Promise<void> {
  try {
    const { data } = await admin.from("app_settings").select("value").eq("key", "transcribe_alert_state").maybeSingle();
    const last = (data?.value as Record<string, string> | null)?.last_quota_alert;
    if (last && Date.now() - new Date(last).getTime() < 30 * 60 * 1000) return; // throttle 30 min
    await admin.from("app_settings").upsert(
      { key: "transcribe_alert_state", value: { last_quota_alert: new Date().toISOString() } },
      { onConflict: "key" },
    );
    await sendSlackAlert(
      "🔴 *Transcripcion de audios sin saldo*\n" +
        "La API de transcripcion (OpenAI) se quedo sin credito: no se pueden transcribir audios en el panel " +
        "(Soporte › Auditoria de audios y el boton de la bandeja).\n" +
        "➡️ Carga saldo en OpenAI (o configura una key de Groq) para reactivarlo.\n" +
        "_Detalle: " + detail.slice(0, 180) + "_",
    );
  } catch (e) {
    console.error("transcribir-audio: maybeAlertQuota fallo", e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  if (!(await authorizeSoporteRead(req))) return jsonResp(403, { error: "forbidden" });

  const provider = resolveProvider();
  if (!provider) {
    // Falta configurar la key: error "esperado", 200 con ok:false para que la UI
    // lo muestre limpio sin romper el flujo.
    return jsonResp(200, { ok: false, error: "no_transcription_key" });
  }

  let body: { base64?: string; mimetype?: string; filename?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResp(400, { error: "bad_json" });
  }

  const b64 = String(body.base64 || "");
  let mimetype = String(body.mimetype || "application/octet-stream").split(";")[0];
  let filename = String(body.filename || "audio.opus");
  if (!b64) return jsonResp(400, { error: "missing_base64" });

  // Los audios de WhatsApp son .opus (contenedor Ogg/Opus). OpenAI Whisper NO
  // acepta la extensión .opus (sí .ogg/.oga), y Groq acepta ambas → normalizamos
  // opus→ogg para que funcione con cualquier proveedor. El contenido no cambia.
  if (/\.opus$/i.test(filename)) {
    filename = filename.replace(/\.opus$/i, ".ogg");
    mimetype = "audio/ogg";
  }

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(b64);
  } catch {
    return jsonResp(400, { error: "bad_base64" });
  }
  if (bytes.length === 0) return jsonResp(200, { ok: false, error: "empty_file" });
  if (bytes.length > MAX_BYTES) return jsonResp(200, { ok: false, error: "file_too_big" });

  // Arma el multipart. NO seteamos Content-Type: fetch pone el boundary.
  const fd = new FormData();
  fd.append("file", new Blob([bytes], { type: mimetype }), filename);
  fd.append("model", provider.model);
  fd.append("language", "es");
  fd.append("response_format", "text"); // devuelve el texto plano directamente
  fd.append("temperature", "0");

  try {
    const res = await fetch(provider.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.key}` },
      body: fd,
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error("transcribir-audio: provider error", res.status, detail);
      // Sin saldo/credito (OpenAI devuelve 429 con "insufficient_quota"): avisar a Slack.
      if (/insufficient_quota|exceeded your current quota|billing/i.test(detail)) {
        await maybeAlertQuota(detail);
        return jsonResp(200, { ok: false, error: "quota_exhausted", detail });
      }
      // 429 = rate limit transitorio: la UI puede reintentar ese audio más tarde.
      const code = res.status === 429 ? "rate_limited" : `provider_${res.status}`;
      return jsonResp(200, { ok: false, error: code, detail });
    }

    // response_format=text → el body ES la transcripción (texto plano).
    const text = (await res.text()).trim();
    return jsonResp(200, { ok: true, text });
  } catch (e) {
    console.error("transcribir-audio: fetch falló", e);
    const msg = e instanceof Error && e.name === "TimeoutError" ? "timeout" : "provider_unreachable";
    return jsonResp(200, { ok: false, error: msg });
  }
});
